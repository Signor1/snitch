// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, ebool, euint8, euint16, euint32, externalEbool} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Snitch} from "./Snitch.sol";

// solhint-disable gas-increment-by-one, gas-strict-inequalities, gas-indexed-events, gas-struct-packing

/// @title Snitch Rooms
/// @notice Multiplayer rooms for Snitch. Empty seats are played by the computer.
///         This project is not audited, endorsed or operated by Zama. Use at your own risk.
/// @dev No require/revert/event may depend on an encrypted value. Every human on the team must seal,
///      so the sealed set says nothing about roles. Chapter tables are cached from `Snitch` (append-only).
contract SnitchRooms is ZamaEthereumConfig {
    enum Stage {
        None,
        Open,
        Playing,
        Ended,
        Settled
    }

    struct Job {
        uint8 team;
        uint32 take;
        bool hot;
        bool dark;
        uint16 need;
        uint16 ban;
    }

    struct Table {
        bool loaded;
        uint8 crew;
        bool hasWiretap;
        uint32 total;
        Job[] jobs;
    }

    struct Room {
        address host;
        uint8 chapter;
        uint8 difficulty;
        uint8 crew;
        uint8 job; // next job index
        uint8 favors;
        uint8 tailWrongBound;
        uint8 multiplier;
        Stage stage;
        bool wiretapUsed;
        bool pending; // a proposed job waits for words
        uint8 rung;
        uint16 takeBps;
        uint16 team;
        uint16 sealedMask;
        uint16 humans; // seats held by players, fixed at start
        uint16 out;
        uint64 proposedAt;
        address[16] seats;
        ebool[16] mine; // "I am the snitch", per human seat
        euint8 snitch;
        euint16 snitchMask; // cleared once caught
        ebool caught;
        ebool humanTip; // OR of sealed words; loyal words count as false
        euint32 bag;
        euint8 heat;
        euint32 payout;
        ebool tipped;
        ebool seen; // host only
        ebool tapped; // host only
        ebool right;
    }

    struct Result {
        uint32 payout;
        uint8 snitch;
        uint8 heat;
        bool snitchWon;
    }

    struct RoomView {
        address host;
        uint8 chapter;
        uint8 difficulty;
        Stage stage;
        uint8 crew;
        uint8 job;
        address[] seats; // zero address = computer
        uint16 humans;
        uint16 out;
        uint8 favors;
        bool wiretapUsed;
        bool pending;
        uint16 team;
        uint8 rung;
        uint16 takeBps;
        uint16 sealedMask;
        uint64 proposedAt;
    }

    uint8 public constant MAX_CREW = 16;
    uint8 public constant RAID_HEAT = 3;
    uint8 public constant MAX_RUNG = 3;
    uint16 public constant BPS = 10_000;
    uint16 public constant MIN_TAKE_BPS = 2_000;
    uint16 public constant MAX_TAKE_BPS = 25_000;
    uint16 public constant GREED_BASE_BPS = 15_000;
    uint16 public constant GREED_STEP_BPS = 5_000;
    /// @notice After this the host may resolve without missing words (they count as no tip).
    uint256 public constant SEAL_TIMEOUT = 10 minutes;

    Snitch public immutable snitchGame;

    uint256 internal _count;
    mapping(uint256 id => Room room) internal _rooms;
    mapping(uint256 id => mapping(address player => uint8 seatPlusOne)) internal _seatOf;
    mapping(uint256 id => Result result) internal _results;
    mapping(uint8 chapter => Table table) internal _tables;

    mapping(address player => uint32 wins) public crewWins;
    mapping(address player => uint32 wins) public snitchWins;

    event RoomCreated(uint256 indexed id, address indexed host, uint8 chapter, uint8 difficulty);
    event Joined(uint256 indexed id, address indexed player, uint8 seat);
    event Left(uint256 indexed id, address indexed player, uint8 seat);
    event RoomStarted(uint256 indexed id, uint16 humans, uint8 favors, bytes32 bag, bytes32 heat);
    event Proposed(uint256 indexed id, uint8 job, uint16 team, uint8 rung, uint16 takeBps);
    event Sealed(uint256 indexed id, uint8 job, uint8 seat);
    event Resolved(uint256 indexed id, uint8 job, bytes32 tipped, bytes32 bag, bytes32 heat);
    event Tailed(uint256 indexed id, uint8 seat, uint8 favorsLeft, bytes32 seen);
    event Wiretapped(uint256 indexed id, uint16 pair, bytes32 tapped);
    event Accused(uint256 indexed id, uint8 seat, bytes32 right, bytes32 bag, bytes32 heat);
    event WalkedAway(uint256 indexed id, uint8 jobsDone, bytes32 payout, bytes32 snitch, bytes32 heat);
    event RoomSettled(uint256 indexed id, uint32 payout, uint8 snitch, uint8 heat, bool snitchWon);

    error NotHost();
    error BadRoom();
    error BadSeat();
    error SeatTaken();
    error AlreadySeated();
    error NotSeated();
    error HostCannotSit();
    error WrongStage();
    error NoPending();
    error Pending();
    error NotOnTeam();
    error AlreadySealed();
    error NotReady();
    error NoJobsLeft();
    error BadTeam();
    error BadPlan();
    error Blackout();
    error NoFavorsLeft();
    error NoWiretap();
    error WiretapUsed();
    error BadPair();

    constructor(address snitch) {
        snitchGame = Snitch(snitch);
    }

    /// @notice Any chapter, no unlock needed. The caller hosts and never takes a seat.
    function createRoom(uint8 chapter, uint8 difficulty) external returns (uint256 id) {
        Table storage t = _table(chapter);
        (uint8 favors, uint8 tailWrongBound, , uint8 multiplier) = snitchGame.difficultyOf(difficulty);
        id = ++_count;
        Room storage r = _rooms[id];
        r.host = msg.sender;
        r.chapter = chapter;
        r.difficulty = difficulty;
        r.crew = t.crew;
        r.favors = favors;
        r.tailWrongBound = tailWrongBound;
        r.multiplier = multiplier;
        r.stage = Stage.Open;
        emit RoomCreated(id, msg.sender, chapter, difficulty);
    }

    function join(uint256 id, uint8 seat) external {
        Room storage r = _open(id);
        if (msg.sender == r.host) revert HostCannotSit();
        if (seat >= r.crew) revert BadSeat();
        if (_seatOf[id][msg.sender] != 0) revert AlreadySeated();
        if (r.seats[seat] != address(0)) revert SeatTaken();
        r.seats[seat] = msg.sender;
        _seatOf[id][msg.sender] = seat + 1;
        emit Joined(id, msg.sender, seat);
    }

    function leave(uint256 id) external {
        Room storage r = _open(id);
        uint8 s1 = _seatOf[id][msg.sender];
        if (s1 == 0) revert NotSeated();
        uint8 seat = s1 - 1;
        r.seats[seat] = address(0);
        delete _seatOf[id][msg.sender];
        emit Left(id, msg.sender, seat);
    }

    /// @notice Host only. Locks the seats and draws the snitch.
    function startRoom(uint256 id) external {
        Room storage r = _open(id);
        if (msg.sender != r.host) revert NotHost();

        // 16-bit randomness keeps the modulo bias below 0.05%
        euint8 snitch = FHE.asEuint8(FHE.rem(FHE.randEuint16(), uint16(r.crew)));
        r.snitch = snitch;
        r.snitchMask = FHE.shl(FHE.asEuint16(1), snitch);
        FHE.allowThis(snitch);
        FHE.allowThis(r.snitchMask);

        uint16 humans;
        for (uint8 i = 0; i < r.crew; i++) {
            address p = r.seats[i];
            if (p == address(0)) continue;
            humans |= uint16(1) << i;
            ebool mine = FHE.eq(snitch, i);
            FHE.allowThis(mine);
            FHE.allow(mine, p);
            r.mine[i] = mine;
        }
        r.humans = humans;

        r.caught = FHE.asEbool(false);
        FHE.allowThis(r.caught);
        r.bag = FHE.asEuint32(0);
        r.heat = FHE.asEuint8(0);
        _shareTotals(r);
        r.stage = Stage.Playing;
        emit RoomStarted(id, humans, r.favors, FHE.toBytes32(r.bag), FHE.toBytes32(r.heat));
    }

    /// @notice Same team and plan rules as `Snitch.runJob`.
    function propose(uint256 id, uint16 team, uint8 rung, uint16 takeBps) external {
        Room storage r = _playing(id);
        if (msg.sender != r.host) revert NotHost();
        if (r.pending) revert Pending();
        Table storage t = _tables[r.chapter];
        if (r.job >= t.jobs.length) revert NoJobsLeft();
        Job storage j = t.jobs[r.job];
        if (team & r.out != 0 || team >> r.crew != 0 || _popcount(team) != j.team) revert BadTeam();
        if (team & j.ban != 0 || (j.need & ~r.out) & ~team != 0) revert BadTeam();
        if (
            rung > MAX_RUNG ||
            takeBps < MIN_TAKE_BPS ||
            takeBps > MAX_TAKE_BPS ||
            uint256(takeBps) > uint256(GREED_BASE_BPS) + uint256(GREED_STEP_BPS) * rung
        ) revert BadPlan();

        r.pending = true;
        r.team = team;
        r.rung = rung;
        r.takeBps = takeBps;
        r.sealedMask = 0;
        r.proposedAt = uint64(block.timestamp);
        r.humanTip = FHE.asEbool(false);
        FHE.allowThis(r.humanTip);
        emit Proposed(id, r.job, team, rung, takeBps);
    }

    /// @notice Every human on the team seals a word (true = tip). Only the snitch's word counts.
    function seal(uint256 id, externalEbool word, bytes calldata proof) external {
        Room storage r = _playing(id);
        if (!r.pending) revert NoPending();
        uint8 s1 = _seatOf[id][msg.sender];
        if (s1 == 0) revert NotOnTeam();
        uint8 seat = s1 - 1;
        uint16 bit = uint16(1) << seat;
        if (r.team & bit == 0) revert NotOnTeam();
        if (r.sealedMask & bit != 0) revert AlreadySealed();

        ebool w = FHE.fromExternal(word, proof);
        r.humanTip = FHE.or(r.humanTip, FHE.and(r.mine[seat], w));
        FHE.allowThis(r.humanTip);
        r.sealedMask |= bit;
        emit Sealed(id, r.job, seat);
    }

    /// @notice Host only, once all team humans sealed or after SEAL_TIMEOUT.
    function resolve(uint256 id) external {
        Room storage r = _playing(id);
        if (msg.sender != r.host) revert NotHost();
        if (!r.pending) revert NoPending();
        uint16 teamHumans = r.team & r.humans;
        if (r.sealedMask != teamHumans && block.timestamp < uint256(r.proposedAt) + SEAL_TIMEOUT) revert NotReady();

        Job storage j = _tables[r.chapter].jobs[r.job];
        uint256 base = j.hot ? uint256(j.take) * 2 : j.take;
        uint32 gain = uint32((base * r.takeBps) / BPS);
        ebool tipped = _tipped(r, teamHumans);

        r.bag = FHE.add(r.bag, FHE.select(tipped, FHE.asEuint32(0), FHE.asEuint32(gain)));
        euint8 heatUp = FHE.asEuint8(tipped);
        if (j.hot) heatUp = FHE.shl(heatUp, uint8(1));
        r.heat = FHE.add(r.heat, heatUp);
        r.tipped = tipped;
        _shareAll(r, tipped);
        _shareTotals(r);

        uint8 job = r.job;
        r.job = job + 1;
        r.pending = false;
        emit Resolved(id, job, FHE.toBytes32(tipped), FHE.toBytes32(r.bag), FHE.toBytes32(r.heat));
    }

    /// @dev tipped = ((humanTip OR computer snitch tips) AND not caught) OR bad luck
    function _tipped(Room storage r, uint16 teamHumans) internal returns (ebool tipped) {
        ebool talk;
        bool any;
        if (teamHumans != 0) {
            talk = r.humanTip;
            any = true;
        }
        uint16 comps = r.team & ~r.humans;
        if (comps != 0) {
            ebool compOn = FHE.ne(FHE.and(r.snitchMask, comps), 0);
            ebool tips = FHE.ne(FHE.randEuint8(4), 0); // 3/4
            ebool compTip = FHE.and(compOn, tips);
            talk = any ? FHE.or(talk, compTip) : compTip;
            any = true;
        }
        ebool badLuck = FHE.eq(FHE.randEuint8(uint8(16 >> r.rung)), 0);
        tipped = any ? FHE.or(FHE.and(talk, FHE.not(r.caught)), badLuck) : badLuck;
    }

    /// @notice Host only, costs a favor. Lies 1 / tailWrongBound of the time.
    function tail(uint256 id, uint8 seat) external returns (ebool seen) {
        Room storage r = _playing(id);
        if (msg.sender != r.host) revert NotHost();
        _lightsOn(r);
        uint16 bit = _seatBit(r, seat);
        if (r.favors == 0) revert NoFavorsLeft();

        ebool isSnitch = FHE.ne(FHE.and(r.snitchMask, bit), 0);
        ebool wrong = FHE.eq(FHE.randEuint8(r.tailWrongBound), 0);
        seen = FHE.xor(isSnitch, wrong);
        FHE.allowThis(seen);
        FHE.allow(seen, r.host);
        r.seen = seen;
        r.favors -= 1;
        emit Tailed(id, seat, r.favors, FHE.toBytes32(seen));
    }

    /// @notice Host only, once per room. True if the snitch is in `pair` (two seats).
    function wiretap(uint256 id, uint16 pair) external returns (ebool tapped) {
        Room storage r = _playing(id);
        if (msg.sender != r.host) revert NotHost();
        if (!_tables[r.chapter].hasWiretap) revert NoWiretap();
        _lightsOn(r);
        if (r.wiretapUsed) revert WiretapUsed();
        if (pair & r.out != 0 || pair >> r.crew != 0 || _popcount(pair) != 2) revert BadPair();

        tapped = FHE.ne(FHE.and(r.snitchMask, pair), 0);
        FHE.allowThis(tapped);
        FHE.allow(tapped, r.host);
        r.tapped = tapped;
        r.wiretapUsed = true;
        emit Wiretapped(id, pair, FHE.toBytes32(tapped));
    }

    /// @notice Host only. `seat` leaves the crew. Right: bag doubles. Wrong: heat + 1.
    function accuse(uint256 id, uint8 seat) external returns (ebool right) {
        Room storage r = _playing(id);
        if (msg.sender != r.host) revert NotHost();
        if (r.pending) revert Pending();
        uint16 bit = _seatBit(r, seat);

        right = FHE.ne(FHE.and(r.snitchMask, bit), 0);
        r.bag = FHE.select(right, FHE.shl(r.bag, 1), r.bag);
        r.heat = FHE.add(r.heat, FHE.asEuint8(FHE.not(right)));
        r.caught = FHE.or(r.caught, right);
        r.snitchMask = FHE.and(r.snitchMask, ~bit);
        FHE.allowThis(r.caught);
        FHE.allowThis(r.snitchMask);
        r.right = right;
        _shareAll(r, right);
        _shareTotals(r);
        r.out |= bit;
        emit Accused(id, seat, FHE.toBytes32(right), FHE.toBytes32(r.bag), FHE.toBytes32(r.heat));
    }

    /// @notice Host only. Drops a pending job and makes payout, snitch and heat publicly decryptable.
    function walkAway(uint256 id) external {
        Room storage r = _playing(id);
        if (msg.sender != r.host) revert NotHost();
        euint32 payout = FHE.select(
            FHE.ge(r.heat, RAID_HEAT),
            FHE.asEuint32(0),
            r.multiplier == 1 ? r.bag : FHE.mul(r.bag, uint32(r.multiplier))
        );
        FHE.allowThis(payout);
        FHE.makePubliclyDecryptable(payout);
        FHE.makePubliclyDecryptable(r.snitch);
        FHE.makePubliclyDecryptable(r.heat);
        r.payout = payout;
        r.pending = false;
        r.stage = Stage.Ended;
        emit WalkedAway(id, r.job, FHE.toBytes32(payout), FHE.toBytes32(r.snitch), FHE.toBytes32(r.heat));
    }

    /// @notice Anyone may relay. The snitch wins on a raid or a bag under 40% of the chapter total.
    /// @param clears abi.encode(uint32 payout, uint8 snitch, uint8 heat)
    function settle(uint256 id, bytes calldata clears, bytes calldata proof) external {
        Room storage r = _rooms[id];
        if (r.stage != Stage.Ended) revert WrongStage();
        // checked against the stored handles, in revealHandles order
        FHE.checkSignatures(_revealHandles(r), clears, proof);
        (uint32 payout, uint8 snitch, uint8 heat) = abi.decode(clears, (uint32, uint8, uint8));
        r.stage = Stage.Settled;

        uint32 bag = payout / r.multiplier;
        bool snitchWon = heat >= RAID_HEAT || uint64(bag) * 5 < uint64(_tables[r.chapter].total) * 2;
        _results[id] = Result({payout: payout, snitch: snitch, heat: heat, snitchWon: snitchWon});

        if (snitchWon) {
            address s = snitch < MAX_CREW ? r.seats[snitch] : address(0);
            if (s != address(0)) snitchWins[s] += 1;
        } else {
            crewWins[r.host] += 1;
            for (uint8 i = 0; i < r.crew; i++) {
                address p = r.seats[i];
                if (p != address(0) && i != snitch) crewWins[p] += 1;
            }
        }
        emit RoomSettled(id, payout, snitch, heat, snitchWon);
    }

    function roomCount() external view returns (uint256) {
        return _count;
    }

    function roomOf(uint256 id) external view returns (RoomView memory v) {
        Room storage r = _room(id);
        v.host = r.host;
        v.chapter = r.chapter;
        v.difficulty = r.difficulty;
        v.stage = r.stage;
        v.crew = r.crew;
        v.job = r.job;
        v.seats = new address[](r.crew);
        for (uint8 i = 0; i < r.crew; i++) v.seats[i] = r.seats[i];
        v.humans = r.humans;
        v.out = r.out;
        v.favors = r.favors;
        v.wiretapUsed = r.wiretapUsed;
        v.pending = r.pending;
        v.team = r.team;
        v.rung = r.rung;
        v.takeBps = r.takeBps;
        v.sealedMask = r.sealedMask;
        v.proposedAt = r.proposedAt;
    }

    function seatOf(uint256 id, address player) external view returns (bool seated, uint8 seat) {
        uint8 s1 = _seatOf[id][player];
        return s1 == 0 ? (false, 0) : (true, s1 - 1);
    }

    /// @notice Encrypted "I am the snitch" for the caller; zero if not seated or not started.
    function myRole(uint256 id) external view returns (bytes32) {
        uint8 s1 = _seatOf[id][msg.sender];
        if (s1 == 0) return bytes32(0);
        return FHE.toBytes32(_rooms[id].mine[s1 - 1]);
    }

    /// @notice seen and tapped are for the host only. Zero handle for an action not taken yet.
    function handlesOf(
        uint256 id
    ) external view returns (bytes32 bag, bytes32 heat, bytes32 tipped, bytes32 seen, bytes32 tapped, bytes32 right) {
        Room storage r = _room(id);
        return (
            FHE.toBytes32(r.bag),
            FHE.toBytes32(r.heat),
            FHE.toBytes32(r.tipped),
            FHE.toBytes32(r.seen),
            FHE.toBytes32(r.tapped),
            FHE.toBytes32(r.right)
        );
    }

    /// @notice In settle order: payout, snitch, heat.
    function revealHandles(uint256 id) external view returns (bytes32[] memory) {
        Room storage r = _room(id);
        if (r.stage < Stage.Ended) revert WrongStage();
        return _revealHandles(r);
    }

    /// @notice Zeros until settled.
    function resultOf(uint256 id) external view returns (Result memory) {
        return _results[id];
    }

    function _table(uint8 chapter) internal returns (Table storage t) {
        t = _tables[chapter];
        if (t.loaded) return t;
        Snitch.Chapter memory c = snitchGame.chapterOf(chapter);
        t.loaded = true;
        t.crew = c.crew;
        t.hasWiretap = c.hasWiretap;
        t.total = c.total;
        for (uint256 i = 0; i < c.jobs.length; i++) {
            Snitch.Job memory sj = c.jobs[i];
            t.jobs.push(Job({team: sj.team, take: sj.take, hot: sj.hot, dark: sj.dark, need: sj.need, ban: sj.ban}));
        }
    }

    function _room(uint256 id) internal view returns (Room storage r) {
        r = _rooms[id];
        if (r.stage == Stage.None) revert BadRoom();
    }

    function _open(uint256 id) internal view returns (Room storage r) {
        r = _room(id);
        if (r.stage != Stage.Open) revert WrongStage();
    }

    function _playing(uint256 id) internal view returns (Room storage r) {
        r = _room(id);
        if (r.stage != Stage.Playing) revert WrongStage();
    }

    function _revealHandles(Room storage r) internal view returns (bytes32[] memory hs) {
        hs = new bytes32[](3);
        hs[0] = FHE.toBytes32(r.payout);
        hs[1] = FHE.toBytes32(r.snitch);
        hs[2] = FHE.toBytes32(r.heat);
    }

    function _shareAll(Room storage r, ebool v) internal {
        FHE.allowThis(v);
        FHE.allow(v, r.host);
        uint16 h = r.humans;
        for (uint8 i = 0; h != 0; i++) {
            if (h & 1 != 0) FHE.allow(v, r.seats[i]);
            h >>= 1;
        }
    }

    /// @dev Every FHE op makes a new handle, so re-grant after each update.
    function _shareTotals(Room storage r) internal {
        FHE.allowThis(r.bag);
        FHE.allowThis(r.heat);
        FHE.allow(r.bag, r.host);
        FHE.allow(r.heat, r.host);
        uint16 h = r.humans;
        for (uint8 i = 0; h != 0; i++) {
            if (h & 1 != 0) {
                FHE.allow(r.bag, r.seats[i]);
                FHE.allow(r.heat, r.seats[i]);
            }
            h >>= 1;
        }
    }

    function _lightsOn(Room storage r) internal view {
        Job[] storage jobs = _tables[r.chapter].jobs;
        if (r.job < jobs.length && jobs[r.job].dark) revert Blackout();
    }

    function _seatBit(Room storage r, uint8 seat) internal view returns (uint16 bit) {
        if (seat >= r.crew) revert BadSeat();
        bit = uint16(1) << seat;
        if (r.out & bit != 0) revert BadSeat();
    }

    function _popcount(uint16 x) internal pure returns (uint8 c) {
        while (x != 0) {
            x &= x - 1;
            c++;
        }
    }
}
