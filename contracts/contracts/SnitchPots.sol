// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, ebool, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SnitchRooms} from "./SnitchRooms.sol";

// solhint-disable gas-struct-packing

/// @title Snitch Pots
/// @notice Room buy-ins in a confidential dollar (ERC-7984). Paying winners split the pot minus a 5% rake.
///         This project is not audited, endorsed or operated by Zama. Use at your own risk.
contract SnitchPots is ZamaEthereumConfig, ReentrancyGuard {
    struct Pot {
        uint64 buyIn;
        uint16 paidMask; // bit 15 is the host
        uint16 pendingMask; // paid, waiting for `confirm`
        uint16 claimedMask;
        bool raked;
    }

    uint8 public constant HOST = 15; // host's bit in the masks; seats 15+ can't pay
    uint16 public constant RAKE_BPS = 500;

    SnitchRooms public immutable rooms;
    IERC7984 public immutable token;
    address public treasury;

    mapping(uint256 room => Pot pot) public pots;
    mapping(uint256 room => mapping(uint8 slot => ebool ok)) internal _paid;

    event PotOpened(uint256 indexed room, uint64 buyIn);
    event Paid(uint256 indexed room, uint8 slot, address indexed payer, bytes32 ok);
    event Confirmed(uint256 indexed room, uint8 slot, bool ok);
    event Claimed(uint256 indexed room, uint8 slot, address indexed to, uint64 amount);
    event Raked(uint256 indexed room, uint64 amount);

    error NotHost();
    error NoPot();
    error PotExists();
    error WrongStage();
    error NotAtTable();
    error AlreadyPaid();
    error NoPayment();
    error NothingToClaim();
    error BadBuyIn();
    error PaymentsPending();

    constructor(SnitchRooms rooms_, IERC7984 token_, address treasury_) {
        rooms = rooms_;
        token = token_;
        treasury = treasury_;
    }

    /// @notice Host only, before the room starts. `buyIn` in token base units.
    function open(uint256 id, uint64 buyIn) external {
        SnitchRooms.RoomView memory r = rooms.roomOf(id);
        if (msg.sender != r.host) revert NotHost();
        if (r.stage != SnitchRooms.Stage.Open) revert WrongStage();
        if (pots[id].buyIn != 0) revert PotExists();
        if (buyIn == 0) revert BadBuyIn();
        pots[id].buyIn = buyIn;
        emit PotOpened(id, buyIn);
    }

    /// @notice Host or a seated player, before the room starts. Needs this contract as operator.
    function pay(uint256 id) external nonReentrant {
        Pot storage p = pots[id];
        if (p.buyIn == 0) revert NoPot();
        SnitchRooms.RoomView memory r = rooms.roomOf(id);
        if (r.stage != SnitchRooms.Stage.Open) revert WrongStage();
        uint8 slot = _slot(id, r, msg.sender);
        uint16 bit = uint16(1) << slot;
        if ((p.paidMask | p.pendingMask) & bit != 0) revert AlreadyPaid();

        euint64 want = FHE.asEuint64(p.buyIn);
        FHE.allowTransient(want, address(token));
        // a short payer moves an encrypted zero instead of reverting
        euint64 moved = token.confidentialTransferFrom(msg.sender, address(this), want);
        ebool ok = FHE.eq(moved, want);
        FHE.allowThis(ok);
        FHE.makePubliclyDecryptable(ok);
        _paid[id][slot] = ok;
        p.pendingMask |= bit;
        emit Paid(id, slot, msg.sender, FHE.toBytes32(ok));
    }

    /// @notice Anyone may relay.
    /// @param clears abi.encode(bool ok)
    function confirm(uint256 id, uint8 slot, bytes calldata clears, bytes calldata proof) external {
        Pot storage p = pots[id];
        uint16 bit = uint16(1) << slot;
        if (slot > HOST || p.pendingMask & bit == 0) revert NoPayment();
        bytes32[] memory hs = new bytes32[](1);
        hs[0] = FHE.toBytes32(_paid[id][slot]);
        FHE.checkSignatures(hs, clears, proof);
        bool ok = abi.decode(clears, (bool));
        p.pendingMask &= ~bit;
        if (ok) p.paidMask |= bit;
        emit Confirmed(id, slot, ok);
    }

    /// @notice If no winner paid, every payer gets their buy-in back minus the rake.
    function claim(uint256 id) external nonReentrant {
        Pot storage p = pots[id];
        if (p.buyIn == 0) revert NoPot();
        SnitchRooms.RoomView memory r = rooms.roomOf(id);
        if (r.stage != SnitchRooms.Stage.Settled) revert WrongStage();
        // all payments confirmed first, so shares can't change after a claim
        if (p.pendingMask != 0) revert PaymentsPending();
        uint8 slot = _slot(id, r, msg.sender);
        uint16 bit = uint16(1) << slot;
        (uint64 share, uint16 takers) = _share(id, r, p);
        if (takers & bit == 0 || p.claimedMask & bit != 0 || share == 0) revert NothingToClaim();
        p.claimedMask |= bit;
        if (!p.raked) {
            p.raked = true;
            uint64 rake = _rake(p);
            if (rake != 0) _send(treasury, rake);
            emit Raked(id, rake);
        }
        _send(msg.sender, share);
        emit Claimed(id, slot, msg.sender, share);
    }

    /// @notice `takers` is a slot mask. Zeros until settled.
    function shareOf(uint256 id) external view returns (uint64 share, uint16 takers) {
        SnitchRooms.RoomView memory r = rooms.roomOf(id);
        if (r.stage != SnitchRooms.Stage.Settled) return (0, 0);
        return _share(id, r, pots[id]);
    }

    function paidOk(uint256 id, uint8 slot) external view returns (bytes32) {
        return FHE.toBytes32(_paid[id][slot]);
    }

    function _slot(uint256 id, SnitchRooms.RoomView memory r, address who) internal view returns (uint8) {
        if (who == r.host) return HOST;
        (bool seated, uint8 seat) = rooms.seatOf(id, who);
        if (!seated || seat >= HOST) revert NotAtTable();
        return seat;
    }

    function _pool(Pot storage p) internal view returns (uint256) {
        return uint256(p.buyIn) * _popcount(p.paidMask);
    }

    function _rake(Pot storage p) internal view returns (uint64) {
        return uint64((_pool(p) * RAKE_BPS) / 10_000);
    }

    function _share(uint256 id, SnitchRooms.RoomView memory r, Pot storage p) internal view returns (uint64, uint16) {
        SnitchRooms.Result memory res = rooms.resultOf(id);
        uint16 winners;
        if (res.snitchWon) {
            if (res.snitch < r.crew && r.seats[res.snitch] != address(0)) winners = uint16(1) << res.snitch;
        } else {
            winners = uint16(1) << HOST;
            for (uint8 i = 0; i < r.crew && i < HOST; i++)
                if (r.seats[i] != address(0) && i != res.snitch) winners |= uint16(1) << i;
        }
        uint16 takers = winners & p.paidMask;
        if (takers == 0) takers = p.paidMask; // refund
        uint8 n = _popcount(takers);
        if (n == 0) return (0, 0);
        return (uint64((_pool(p) - _rake(p)) / n), takers);
    }

    function _send(address to, uint64 amount) internal {
        euint64 a = FHE.asEuint64(amount);
        FHE.allowTransient(a, address(token));
        token.confidentialTransfer(to, a);
    }

    function _popcount(uint16 x) internal pure returns (uint8 c) {
        while (x != 0) {
            x &= x - 1;
            c++;
        }
    }
}
