// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, ebool, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// solhint-disable gas-struct-packing

/// @title Snitch Boss Pass
/// @notice Soulbound season pass (ERC-721) paid in a confidential dollar (ERC-7984).
///         `buy` pays, then `claim` mints against a KMS proof.
///         This project is not audited, endorsed or operated by Zama. Use at your own risk.
contract SnitchPass is ERC721, ZamaEthereumConfig, ReentrancyGuard {
    struct Order {
        address buyer;
        uint16 season;
        bool done;
        ebool ok; // paid in full
    }

    IERC7984 public immutable token;
    address public owner;
    /// @notice In token base units (6 decimals: 4_990_000 = $4.99).
    uint64 public price;
    uint16 public season = 1;

    uint256 public orderCount;
    uint256 public passCount;
    mapping(uint256 id => Order order) internal _orders;
    mapping(address player => uint256 orderId) public pendingOf;
    mapping(address player => mapping(uint16 season => uint256 passId)) public passOf;
    mapping(uint256 passId => uint16 season) public seasonOfPass;

    event Ordered(uint256 indexed id, address indexed buyer, uint16 season, bytes32 ok);
    event Claimed(uint256 indexed id, address indexed buyer, uint16 season, bool ok, uint256 passId);
    event PriceSet(uint64 price);
    event SeasonStarted(uint16 season);

    error NotOwner();
    error HasPass();
    error OrderPending();
    error BadOrder();
    error Soulbound();

    constructor(IERC7984 token_, uint64 price_) ERC721("Snitch Boss Pass", "BOSS") {
        token = token_;
        owner = msg.sender;
        price = price_;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @notice The caller must first make this contract an operator on `token`.
    function buy() external nonReentrant returns (uint256 id) {
        if (passOf[msg.sender][season] != 0) revert HasPass();
        if (pendingOf[msg.sender] != 0) revert OrderPending();
        euint64 want = FHE.asEuint64(price);
        // the token needs access to `want` for this call
        FHE.allowTransient(want, address(token));
        // ERC-7984 moves an encrypted zero instead of reverting when short, so compare what moved
        euint64 paid = token.confidentialTransferFrom(msg.sender, address(this), want);
        ebool ok = FHE.eq(paid, want);
        FHE.allowThis(ok);
        FHE.makePubliclyDecryptable(ok);
        id = ++orderCount;
        _orders[id] = Order({buyer: msg.sender, season: season, done: false, ok: ok});
        pendingOf[msg.sender] = id;
        emit Ordered(id, msg.sender, season, FHE.toBytes32(ok));
    }

    /// @notice Anyone may relay. Mints the pass if the order was paid in full.
    /// @param clears abi.encode(bool ok)
    function claim(uint256 id, bytes calldata clears, bytes calldata proof) external returns (uint256 passId) {
        Order storage o = _orders[id];
        if (o.buyer == address(0) || o.done) revert BadOrder();
        bytes32[] memory hs = new bytes32[](1);
        hs[0] = FHE.toBytes32(o.ok);
        FHE.checkSignatures(hs, clears, proof);
        bool ok = abi.decode(clears, (bool));
        o.done = true;
        delete pendingOf[o.buyer];
        if (ok) {
            passId = ++passCount;
            passOf[o.buyer][o.season] = passId;
            seasonOfPass[passId] = o.season;
            _mint(o.buyer, passId);
        }
        emit Claimed(id, o.buyer, o.season, ok, passId);
    }

    function orderOf(uint256 id) external view returns (address buyer, uint16 orderSeason, bool done, bytes32 ok) {
        Order storage o = _orders[id];
        return (o.buyer, o.season, o.done, FHE.toBytes32(o.ok));
    }

    function hasPass(address player) external view returns (bool) {
        return passOf[player][season] != 0;
    }

    function setPrice(uint64 price_) external onlyOwner {
        price = price_;
        emit PriceSet(price_);
    }

    function nextSeason() external onlyOwner {
        season += 1;
        emit SeasonStarted(season);
    }

    function withdraw(address to) external onlyOwner nonReentrant {
        euint64 all = token.confidentialBalanceOf(address(this));
        FHE.allowTransient(all, address(token));
        token.confidentialTransfer(to, all);
    }

    function transferOwnership(address to) external onlyOwner {
        owner = to;
    }

    /// @dev Soulbound: mint only.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address from) {
        from = super._update(to, tokenId, auth);
        if (from != address(0)) revert Soulbound();
    }
}
