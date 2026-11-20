// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, ebool, euint8, euint16, euint32} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

// solhint-disable gas-increment-by-one, gas-strict-inequalities, gas-indexed-events, gas-struct-packing

/// @title Snitch
/// @notice Solo heist game. The snitch (and the skimmer) are drawn with FHE randomness and stay encrypted.
///         This project is not audited, endorsed or operated by Zama. Use at your own risk.
/// @dev No require/revert/event may depend on an encrypted value. Roles are one-hot encrypted bitmasks.
contract Snitch is ZamaEthereumConfig {
    enum Stage {
        None,
        Playing,
        Ended,
        Settled
    }

    struct Job {
        uint8 team; // exact team size
        uint32 take; // before hot and takeBps
        bool hot; // double take; a tip adds 2 heat
        bool dark; // no tail or wiretap while this is next
        uint16 need; // must go unless out
        uint16 ban; // may not go
    }

    struct Chapter {
        string name;
        uint8 crew;
        bool hasSkimmer;
        bool hasWiretap;
        uint32 total; // sum of take x (hot ? 2 : 1)
        uint8 rules; // RULE_* flags
        uint8 recruitAt;
        Job[] jobs; // last one is the boss job
    }

    struct Run {
        uint32 run; // bumped on every start
        uint8 chapter;
        uint8 difficulty;
        uint8 job; // next job index
        uint8 favors;
        uint16 out; // members who left
        bool wiretapUsed;
        bool rumourReady;
        Stage stage;
        euint16 snitchMask; // members still talking; a caught snitch's bit is cleared
        euint16 skimmerMask;
        euint8 snitch; // NO_SNITCH when the tips come from outside
        euint8 skimmer; // NO_SNITCH when the chapter has none
        euint8 second; // RULE_TWO or RULE_RECRUIT snitch, else NO_SNITCH
        euint32 bag;
        euint8 heat; // >= RAID_HEAT means raided
        ebool caught;
        euint32 payout;
        ebool tipped; // last job
        ebool seen; // last tail
        ebool tapped;
        ebool right; // last accusation
        ebool heard; // last rumour
    }

    uint8 public constant MAX_CREW = 16;
    uint8 public constant MAX_JOBS = 8;
    uint8 public constant RAID_HEAT = 3;
    /// @dev total x 2.5 (takeBps) x 2 (caught) x 3 (multiplier) must fit euint32.
    uint32 public constant MAX_TOTAL = 250_000_000;
    /// @dev Bad luck has probability 1 / (16 >> rung).
    uint8 public constant MAX_RUNG = 3;
    uint16 public constant BPS = 10_000;
    uint16 public constant MIN_TAKE_BPS = 2_000;
    uint16 public constant MAX_TAKE_BPS = 25_000;
    uint16 public constant GREED_BASE_BPS = 15_000;
    uint16 public constant GREED_STEP_BPS = 5_000;
    uint8 public constant FLAG_HOT = 1;
    uint8 public constant FLAG_DARK = 2;
    uint8 public constant NO_SKIMMER = type(uint8).max;
    uint8 public constant NO_SNITCH = type(uint8).max;
    uint8 public constant RULE_TWO = 1;
    uint8 public constant RULE_RECRUIT = 2;
    uint8 public constant RULE_OUTSIDE = 4;
    uint8 public constant RULE_ALLIN = 8;

    address public immutable owner;
    Chapter[] internal _chapters; // id = index + 1

    mapping(address player => Run) internal _runs;
    mapping(address player => mapping(uint8 chapter => uint8 stars)) public bestStars;
    mapping(address player => mapping(uint8 chapter => uint32 bag)) public bestBag;
    mapping(address player => mapping(uint8 chapter => uint32 payout)) public bestPayout;
    mapping(address player => uint32 stars) public totalStars;
    mapping(address player => uint64 score) public totalScore;
    mapping(address player => uint32 runs) public runsSettled;

    event ChapterAdded(
        uint8 indexed chapter,
        string name,
        uint8 crew,
        uint8 jobs,
        bool hasSkimmer,
        bool hasWiretap,
        uint8 rules,
        uint8 recruitAt
    );
    event Started(
        address indexed player,
        uint32 run,
        uint8 chapter,
        uint8 difficulty,
        uint8 favors,
        bytes32 bag,
        bytes32 heat
    );
    event JobRun(
        address indexed player,
        uint32 run,
        uint8 job,
        uint16 team,
        uint8 rung,
        uint16 takeBps,
        bytes32 tipped,
        bytes32 bag,
        bytes32 heat
    );
    event Tailed(address indexed player, uint32 run, uint8 member, uint8 favorsLeft, bytes32 seen);
    event Rumoured(address indexed player, uint32 run, uint8 member, bytes32 heard);
    event Wiretapped(address indexed player, uint32 run, uint16 pair, bytes32 tapped);
    event Accused(address indexed player, uint32 run, uint8 member, bytes32 right, bytes32 bag, bytes32 heat);
    event WalkedAway(
        address indexed player,
        uint32 run,
        uint8 jobsDone,
        bytes32 payout,
        bytes32 snitch,
        bytes32 heat,
        bytes32 skimmer,
        bytes32 second
    );
    event Settled(
        address indexed player,
        uint32 run,
        uint8 chapter,
        uint8 difficulty,
        uint32 payout,
        uint32 bag,
        uint8 snitch,
        uint8 heat,
        uint8 skimmer,
        uint8 second,
        uint8 stars
    );

    error NotOwner();
    error BadChapter();
    error BadDifficulty();
    error ChapterLocked();
    error WrongStage();
    error NoJobsLeft();
    error BadTeam();
    error BadMember();
    error NoFavorsLeft();
    error NoWiretap();
    error WiretapUsed();
    error BadPair();
    error BadPlan();
    error Blackout();
    error NoRumour();

    constructor() {
        owner = msg.sender;
        // (team, take, flags, need, ban)
        uint256[] memory js = new uint256[](6);
        js[0] = _job(2, 1_000, 0, 0, 0);
        js[1] = _job(2, 2_500, 0, 1 << 0, 0);
        js[2] = _job(3, 4_500, 0, 1 << 1, 0);
        js[3] = _job(3, 6_000, 0, 0, 0);
        js[4] = _job(3, 9_000, 0, 0, 1 << 2);
        js[5] = _job(4, 15_000, 0, 1 << 1, 0);
        _add("The Corner", 5, js, false, false, 0, 0);

        js = new uint256[](7);
        js[0] = _job(2, 2_000, 0, 0, 1 << 2);
        js[1] = _job(3, 5_000, FLAG_DARK, 0, 0);
        js[2] = _job(3, 7_000, 0, 0, 0);
        js[3] = _job(3, 12_000, FLAG_HOT, 0, 0);
        js[4] = _job(3, 9_000, 0, 1 << 5, 0);
        js[5] = _job(4, 15_000, 0, 0, 0);
        js[6] = _job(4, 30_000, 0, 1 << 1, 0);
        _add("Uptown", 6, js, false, true, 0, 0);

        js = new uint256[](7);
        js[0] = _job(2, 4_000, 0, 0, 0);
        js[1] = _job(3, 10_000, 0, 0, 1 << 4);
        js[2] = _job(3, 14_000, 0, 0, 0);
        js[3] = _job(4, 25_000, FLAG_DARK, 0, 0);
        js[4] = _job(3, 9_000, FLAG_HOT, 0, 0);
        js[5] = _job(4, 20_000, 0, 0, 0);
        js[6] = _job(4, 60_000, FLAG_HOT, 0, 0);
        _add("The Docks", 6, js, true, true, 0, 0);
    }

    /// @notice Owner only. `flags[i]`: bit 0 hot, bit 1 dark. `needs`/`bans` are disjoint seat bitmasks.
    function addChapter(
        string memory name,
        uint8 crew,
        uint8[] memory teams,
        uint32[] memory takes,
        uint8[] memory flags,
        uint16[] memory needs,
        uint16[] memory bans,
        bool hasSkimmer,
        bool hasWiretap,
        uint8 rules,
        uint8 recruitAt
    ) external {
        if (msg.sender != owner) revert NotOwner();
        uint256 n = teams.length;
        if (n != takes.length || n != flags.length || n != needs.length || n != bans.length) revert BadChapter();
        uint256[] memory js = new uint256[](n);
        for (uint256 i = 0; i < n; i++) js[i] = _job(teams[i], takes[i], flags[i], needs[i], bans[i]);
        _add(name, crew, js, hasSkimmer, hasWiretap, rules, recruitAt);
    }

    function _add(
        string memory name,
        uint8 crew,
        uint256[] memory js,
        bool hasSkimmer,
        bool hasWiretap,
        uint8 rules,
        uint8 recruitAt
    ) internal {
        uint256 n = js.length;
        if (crew < 3 || crew > MAX_CREW || n == 0 || n > MAX_JOBS) revert BadChapter();
        if (_chapters.length == type(uint8).max) revert BadChapter();
        if (rules > (RULE_TWO | RULE_RECRUIT | RULE_OUTSIDE | RULE_ALLIN)) revert BadChapter();
        // a second snitch could land on the skimmer's seat
        if (hasSkimmer && rules & (RULE_TWO | RULE_RECRUIT) != 0) revert BadChapter();
        if (rules & RULE_TWO != 0 && rules & RULE_RECRUIT != 0) revert BadChapter();
        if (rules & RULE_RECRUIT != 0 ? recruitAt == 0 || recruitAt >= n : recruitAt != 0) revert BadChapter();
        Chapter storage c = _chapters.push();
        c.name = name;
        c.crew = crew;
        c.hasSkimmer = hasSkimmer;
        c.hasWiretap = hasWiretap;
        c.rules = rules;
        c.recruitAt = recruitAt;
        uint256 total;
        for (uint256 i = 0; i < n; i++) total += _pushJob(c.jobs, crew, js[i]);
        if (total > MAX_TOTAL) revert BadChapter();
        c.total = uint32(total);
        emit ChapterAdded(uint8(_chapters.length), name, crew, uint8(n), hasSkimmer, hasWiretap, rules, recruitAt);
    }

    function _pushJob(Job[] storage jobs, uint8 crew, uint256 p) internal returns (uint256 base) {
        uint8 flags = uint8(p >> 40);
        Job memory j = Job({
            team: uint8(p),
            take: uint32(p >> 8),
            hot: flags & FLAG_HOT != 0,
            dark: flags & FLAG_DARK != 0,
            need: uint16(p >> 48),
            ban: uint16(p >> 64)
        });
        if (j.team == 0 || j.team >= crew || j.take == 0 || flags > (FLAG_HOT | FLAG_DARK)) revert BadChapter();
        if ((j.need | j.ban) >> crew != 0 || j.need & j.ban != 0) revert BadChapter();
        // the job must stay staffable
        if (_popcount(j.need) > j.team || crew - _popcount(j.ban) < j.team) revert BadChapter();
        jobs.push(j);
        base = j.hot ? uint256(j.take) * 2 : j.take;
    }

    function _job(uint8 team, uint32 take, uint8 flags, uint16 need, uint16 ban) private pure returns (uint256) {
        return
            uint256(team) |
            (uint256(take) << 8) |
            (uint256(flags) << 40) |
            (uint256(need) << 48) |
            (uint256(ban) << 64);
    }

    function chapterCount() external view returns (uint256) {
        return _chapters.length;
    }

    function chapterOf(uint8 id) public view returns (Chapter memory) {
        if (id == 0 || id > _chapters.length) revert BadChapter();
        return _chapters[id - 1];
    }

    /// @dev A tail or rumour lies with probability 1 / tailWrongBound. baseRung is a client hint only.
    function difficultyOf(
        uint8 difficulty
    ) public pure returns (uint8 favors, uint8 tailWrongBound, uint8 baseRung, uint8 multiplier) {
        if (difficulty == 0) return (3, 8, 1, 1); // Street
        if (difficulty == 1) return (2, 4, 1, 2); // Made
        if (difficulty == 2) return (1, 4, 2, 3); // Kingpin
        revert BadDifficulty();
    }

    /// @notice Starts a run, replacing any run in progress. Needs a star on the previous chapter.
    function start(uint8 chapter, uint8 difficulty) external {
        if (chapter == 0 || chapter > _chapters.length) revert BadChapter();
        (uint8 favors, , , ) = difficultyOf(difficulty);
        if (chapter > 1 && bestStars[msg.sender][chapter - 1] == 0) revert ChapterLocked();
        Chapter storage c = _chapters[chapter - 1];
        Run storage r = _runs[msg.sender];

        // 16-bit randomness keeps the modulo bias below 0.05%
        euint8 snitch = FHE.asEuint8(FHE.rem(FHE.randEuint16(), uint16(c.crew)));
        euint16 mask = FHE.shl(FHE.asEuint16(1), snitch);
        // "nobody" (255) as x OR 255: a plain FHE constant can't be publicly decrypted with a proof
        euint8 second = FHE.or(snitch, NO_SNITCH);
        if (c.rules & RULE_TWO != 0) {
            // uniform over the others: draw in [0, crew - 1) and step past the first
            euint8 pick = FHE.asEuint8(FHE.rem(FHE.randEuint16(), uint16(c.crew - 1)));
            second = FHE.select(FHE.ge(pick, snitch), FHE.add(pick, 1), pick);
            mask = FHE.or(mask, FHE.shl(FHE.asEuint16(1), second));
        }
        if (c.rules & RULE_OUTSIDE != 0) {
            ebool nobody = FHE.randEbool();
            mask = FHE.select(nobody, FHE.asEuint16(0), mask);
            r.snitch = FHE.select(nobody, FHE.asEuint8(NO_SNITCH), snitch);
        } else {
            r.snitch = snitch;
        }
        r.snitchMask = mask;
        r.second = second;
        FHE.allowThis(r.snitch);
        FHE.allowThis(r.snitchMask);
        FHE.allowThis(r.second);

        if (c.hasSkimmer) {
            // same trick: never the snitch's seat
            euint8 pick = FHE.asEuint8(FHE.rem(FHE.randEuint16(), uint16(c.crew - 1)));
            euint8 skimmer = FHE.select(FHE.ge(pick, snitch), FHE.add(pick, 1), pick);
            r.skimmer = skimmer;
            r.skimmerMask = FHE.shl(FHE.asEuint16(1), skimmer);
            FHE.allowThis(r.skimmerMask);
        } else {
            r.skimmer = FHE.or(FHE.asEuint8(r.snitchMask), NO_SNITCH);
            r.skimmerMask = euint16.wrap(0);
        }
        FHE.allowThis(r.skimmer);

        r.bag = FHE.asEuint32(0);
        r.heat = FHE.asEuint8(0);
        r.caught = FHE.asEbool(false);
        FHE.allowThis(r.caught);
        _shareTotals(r);

        r.run += 1;
        r.chapter = chapter;
        r.difficulty = difficulty;
        r.job = 0;
        r.favors = favors;
        r.out = 0;
        r.wiretapUsed = false;
        r.rumourReady = false;
        r.stage = Stage.Playing;
        r.payout = euint32.wrap(0);
        r.tipped = ebool.wrap(0);
        r.seen = ebool.wrap(0);
        r.tapped = ebool.wrap(0);
        r.right = ebool.wrap(0);
        r.heard = ebool.wrap(0);

        emit Started(msg.sender, r.run, chapter, difficulty, favors, FHE.toBytes32(r.bag), FHE.toBytes32(r.heat));
    }

    /// @param team Seat bitmask.
    /// @param rung Bad luck 0..3 (1/16, 1/8, 1/4, 1/2).
    /// @param takeBps 2000..25000 and at most 15000 + 5000 * rung.
    function runJob(uint16 team, uint8 rung, uint16 takeBps) external returns (ebool tipped) {
        Run storage r = _runs[msg.sender];
        if (r.stage != Stage.Playing) revert WrongStage();
        Chapter storage c = _chapters[r.chapter - 1];
        if (r.job >= c.jobs.length) revert NoJobsLeft();
        Job memory j = c.jobs[r.job];
        if (team & r.out != 0 || team >> c.crew != 0 || _popcount(team) != j.team) revert BadTeam();
        if (team & j.ban != 0 || (j.need & ~r.out) & ~team != 0) revert BadTeam();
        if (
            rung > MAX_RUNG ||
            takeBps < MIN_TAKE_BPS ||
            takeBps > MAX_TAKE_BPS ||
            uint256(takeBps) > uint256(GREED_BASE_BPS) + uint256(GREED_STEP_BPS) * rung
        ) revert BadPlan();

        if (c.rules & RULE_RECRUIT != 0 && r.job == c.recruitAt) _recruit(r, c.crew);

        uint256 base = j.hot ? uint256(j.take) * 2 : j.take;
        uint32 gain = uint32((base * takeBps) / BPS);
        bool raid = c.rules & RULE_ALLIN != 0 && r.job + 1 == c.jobs.length;
        tipped = _resolve(r, team, gain, uint8(16 >> rung), j.hot, c.hasSkimmer, raid);
        r.rumourReady = true;

        uint8 job = r.job;
        r.job = job + 1;
        _emitJobRun(r, job, team, rung, takeBps, tipped);
    }

    function _emitJobRun(Run storage r, uint8 job, uint16 team, uint8 rung, uint16 takeBps, ebool tipped) private {
        emit JobRun(
            msg.sender,
            r.run,
            job,
            team,
            rung,
            takeBps,
            FHE.toBytes32(tipped),
            FHE.toBytes32(r.bag),
            FHE.toBytes32(r.heat)
        );
    }

    /// @dev tipped = (snitch on team AND tips) OR bad luck
    function _resolve(
        Run storage r,
        uint16 team,
        uint32 gain,
        uint8 badLuckBound,
        bool hot,
        bool hasSkimmer,
        bool raid
    ) internal returns (ebool tipped) {
        ebool snitchOn = FHE.ne(FHE.and(r.snitchMask, team), 0);
        ebool tips = FHE.ne(FHE.randEuint8(4), 0); // 3/4
        ebool badLuck = FHE.eq(FHE.randEuint8(badLuckBound), 0);
        tipped = FHE.or(FHE.and(snitchOn, tips), badLuck);

        euint32 cash = FHE.asEuint32(gain);
        if (hasSkimmer) {
            ebool skimmed = FHE.ne(FHE.and(r.skimmerMask, team), 0);
            cash = FHE.select(skimmed, FHE.asEuint32(gain / 2), cash);
        }
        r.bag = FHE.add(r.bag, FHE.select(tipped, FHE.asEuint32(0), cash));
        euint8 heatUp = FHE.asEuint8(tipped);
        if (hot) heatUp = FHE.shl(heatUp, uint8(1));
        r.heat = FHE.add(r.heat, heatUp);
        // RULE_ALLIN: police on the last job is a raid
        if (raid) r.heat = FHE.select(tipped, FHE.max(r.heat, RAID_HEAT), r.heat);
        r.tipped = tipped;
        FHE.allowThis(tipped);
        FHE.allow(tipped, msg.sender);
        _shareTotals(r);
    }

    /// @notice Costs a favor. The answer lies 1 / tailWrongBound of the time.
    function tail(uint8 member) external returns (ebool seen) {
        Run storage r = _runs[msg.sender];
        if (r.stage != Stage.Playing) revert WrongStage();
        _lightsOn(r);
        uint16 bit = _memberBit(r, member);
        if (r.favors == 0) revert NoFavorsLeft();

        seen = _whisper(r, bit);
        r.seen = seen;
        r.favors -= 1;
        emit Tailed(msg.sender, r.run, member, r.favors, FHE.toBytes32(seen));
    }

    /// @notice Once per run. True if a snitch is in `pair` (two seats).
    function wiretap(uint16 pair) external returns (ebool tapped) {
        Run storage r = _runs[msg.sender];
        if (r.stage != Stage.Playing) revert WrongStage();
        Chapter storage c = _chapters[r.chapter - 1];
        if (!c.hasWiretap) revert NoWiretap();
        _lightsOn(r);
        if (r.wiretapUsed) revert WiretapUsed();
        if (pair & r.out != 0 || pair >> c.crew != 0 || _popcount(pair) != 2) revert BadPair();

        tapped = FHE.ne(FHE.and(r.snitchMask, pair), 0);
        FHE.allowThis(tapped);
        FHE.allow(tapped, msg.sender);

        r.tapped = tapped;
        r.wiretapUsed = true;
        emit Wiretapped(msg.sender, r.run, pair, FHE.toBytes32(tapped));
    }

    /// @notice Free tail, once after each job. Allowed before a dark job.
    function rumour(uint8 member) external returns (ebool heard) {
        Run storage r = _runs[msg.sender];
        if (r.stage != Stage.Playing) revert WrongStage();
        if (!r.rumourReady) revert NoRumour();
        uint16 bit = _memberBit(r, member);

        heard = _whisper(r, bit);
        r.heard = heard;
        r.rumourReady = false;
        emit Rumoured(msg.sender, r.run, member, FHE.toBytes32(heard));
    }

    /// @notice `member` leaves the crew. Right: bag doubles (first catch only). Wrong: heat + 1.
    function accuse(uint8 member) external returns (ebool right) {
        Run storage r = _runs[msg.sender];
        if (r.stage != Stage.Playing) revert WrongStage();
        uint16 bit = _memberBit(r, member);

        right = FHE.ne(FHE.and(r.snitchMask, bit), 0);
        // doubles once at most, so it stays within MAX_TOTAL
        r.bag = FHE.select(FHE.and(right, FHE.not(r.caught)), FHE.shl(r.bag, 1), r.bag);
        r.heat = FHE.add(r.heat, FHE.asEuint8(FHE.not(right)));
        r.caught = FHE.or(r.caught, right);
        r.snitchMask = FHE.and(r.snitchMask, ~bit);
        r.right = right;
        FHE.allowThis(right);
        FHE.allow(right, msg.sender);
        FHE.allowThis(r.caught);
        FHE.allowThis(r.snitchMask);
        _shareTotals(r);

        r.out |= bit;
        emit Accused(msg.sender, r.run, member, FHE.toBytes32(right), FHE.toBytes32(r.bag), FHE.toBytes32(r.heat));
    }

    /// @notice Ends the run and makes the payout and roles publicly decryptable.
    function walkAway() external {
        Run storage r = _runs[msg.sender];
        if (r.stage != Stage.Playing) revert WrongStage();
        (, , , uint8 multiplier) = difficultyOf(r.difficulty);

        euint32 payout = FHE.select(
            FHE.ge(r.heat, RAID_HEAT),
            FHE.asEuint32(0),
            multiplier == 1 ? r.bag : FHE.mul(r.bag, uint32(multiplier))
        );
        FHE.allowThis(payout);
        FHE.makePubliclyDecryptable(payout);
        FHE.makePubliclyDecryptable(r.snitch);
        FHE.makePubliclyDecryptable(r.heat);
        FHE.makePubliclyDecryptable(r.skimmer);
        FHE.makePubliclyDecryptable(r.second);

        r.payout = payout;
        r.stage = Stage.Ended;
        emit WalkedAway(
            msg.sender,
            r.run,
            r.job,
            FHE.toBytes32(payout),
            FHE.toBytes32(r.snitch),
            FHE.toBytes32(r.heat),
            FHE.toBytes32(r.skimmer),
            FHE.toBytes32(r.second)
        );
    }

    /// @notice Anyone may relay.
    /// @param clears abi.encode(uint32 payout, uint8 snitch, uint8 heat, uint8 skimmer, uint8 second)
    function settle(address player, bytes calldata clears, bytes calldata proof) external {
        Run storage r = _runs[player];
        if (r.stage != Stage.Ended) revert WrongStage();
        // checked against the stored handles, in revealHandles order
        FHE.checkSignatures(_revealHandles(r), clears, proof);
        Reveal memory v;
        (v.payout, v.snitch, v.heat, v.skimmer, v.second) = abi.decode(clears, (uint32, uint8, uint8, uint8, uint8));

        r.stage = Stage.Settled;
        (uint32 bag, uint8 stars) = _record(player, r.chapter, r.difficulty, v.payout, _chapters[r.chapter - 1].total);
        emit Settled(player, r.run, r.chapter, r.difficulty, v.payout, bag, v.snitch, v.heat, v.skimmer, v.second, stars);
    }

    /// @dev Struct keeps `settle` under the stack limit.
    struct Reveal {
        uint32 payout;
        uint8 snitch;
        uint8 heat;
        uint8 skimmer;
        uint8 second;
    }

    /// @dev RULE_RECRUIT: an active snitch turns a random present member other than itself.
    function _recruit(Run storage r, uint8 crew) internal {
        uint16 present = ~r.out & uint16((uint256(1) << crew) - 1);
        uint8 m = _popcount(present);
        if (m < 2) return;
        // rank of the first snitch among the present seats
        euint8 rank = FHE.asEuint8(0);
        for (uint8 i = 0; i < crew; i++) {
            if (present & (uint16(1) << i) == 0) continue;
            rank = FHE.add(rank, FHE.asEuint8(FHE.gt(r.snitch, i)));
        }
        euint8 k = FHE.asEuint8(FHE.rem(FHE.randEuint16(), uint16(m - 1)));
        k = FHE.select(FHE.ge(k, rank), FHE.add(k, 1), k);
        // the k-th present seat
        euint8 pick = FHE.asEuint8(NO_SNITCH);
        uint8 seen = 0;
        for (uint8 i = 0; i < crew; i++) {
            if (present & (uint16(1) << i) == 0) continue;
            pick = FHE.select(FHE.eq(k, seen), FHE.asEuint8(i), pick);
            seen++;
        }
        ebool active = FHE.ne(r.snitchMask, 0);
        r.second = FHE.select(active, pick, r.second);
        r.snitchMask = FHE.or(r.snitchMask, FHE.select(active, FHE.shl(FHE.asEuint16(1), pick), FHE.asEuint16(0)));
        FHE.allowThis(r.second);
        FHE.allowThis(r.snitchMask);
    }

    function _record(
        address player,
        uint8 chapter,
        uint8 difficulty,
        uint32 payout,
        uint32 total
    ) internal returns (uint32 bag, uint8 stars) {
        (, , , uint8 multiplier) = difficultyOf(difficulty);
        bag = payout / multiplier;
        stars = _stars(bag, total);

        runsSettled[player] += 1;
        uint8 prevStars = bestStars[player][chapter];
        if (stars > prevStars) {
            bestStars[player][chapter] = stars;
            totalStars[player] += stars - prevStars;
        }
        if (bag > bestBag[player][chapter]) bestBag[player][chapter] = bag;
        uint32 prevPayout = bestPayout[player][chapter];
        if (payout > prevPayout) {
            bestPayout[player][chapter] = payout;
            totalScore[player] += payout - prevPayout;
        }
    }

    function runOf(
        address player
    )
        external
        view
        returns (
            uint32 run,
            uint8 chapter,
            uint8 difficulty,
            uint8 job,
            uint8 favors,
            uint16 out,
            bool wiretapUsed,
            Stage stage,
            bool rumourReady
        )
    {
        Run storage r = _runs[player];
        return (r.run, r.chapter, r.difficulty, r.job, r.favors, r.out, r.wiretapUsed, r.stage, r.rumourReady);
    }

    /// @notice Zero handle for an action not taken yet this run.
    function handlesOf(
        address player
    )
        external
        view
        returns (bytes32 bag, bytes32 heat, bytes32 tipped, bytes32 seen, bytes32 tapped, bytes32 right, bytes32 heard)
    {
        Run storage r = _runs[player];
        return (
            FHE.toBytes32(r.bag),
            FHE.toBytes32(r.heat),
            FHE.toBytes32(r.tipped),
            FHE.toBytes32(r.seen),
            FHE.toBytes32(r.tapped),
            FHE.toBytes32(r.right),
            FHE.toBytes32(r.heard)
        );
    }

    /// @notice In settle order: payout, snitch, heat, skimmer, second.
    function revealHandles(address player) external view returns (bytes32[] memory) {
        Run storage r = _runs[player];
        if (r.stage < Stage.Ended) revert WrongStage();
        return _revealHandles(r);
    }

    /// @notice Index = chapter id - 1.
    function bestOf(
        address player
    ) external view returns (uint8[] memory stars, uint32[] memory bags, uint32[] memory payouts) {
        uint256 n = _chapters.length;
        stars = new uint8[](n);
        bags = new uint32[](n);
        payouts = new uint32[](n);
        for (uint256 i = 0; i < n; i++) {
            uint8 id = uint8(i + 1);
            stars[i] = bestStars[player][id];
            bags[i] = bestBag[player][id];
            payouts[i] = bestPayout[player][id];
        }
    }

    function _revealHandles(Run storage r) internal view returns (bytes32[] memory hs) {
        hs = new bytes32[](5);
        hs[0] = FHE.toBytes32(r.payout);
        hs[1] = FHE.toBytes32(r.snitch);
        hs[2] = FHE.toBytes32(r.heat);
        hs[3] = FHE.toBytes32(r.skimmer);
        hs[4] = FHE.toBytes32(r.second);
    }

    /// @dev Every FHE op makes a new handle, so re-grant after each update.
    function _shareTotals(Run storage r) internal {
        FHE.allowThis(r.bag);
        FHE.allow(r.bag, msg.sender);
        FHE.allowThis(r.heat);
        FHE.allow(r.heat, msg.sender);
    }

    function _whisper(Run storage r, uint16 bit) internal returns (ebool answer) {
        (, uint8 tailWrongBound, , ) = difficultyOf(r.difficulty);
        ebool isSnitch = FHE.ne(FHE.and(r.snitchMask, bit), 0);
        ebool wrong = FHE.eq(FHE.randEuint8(tailWrongBound), 0);
        answer = FHE.xor(isSnitch, wrong);
        FHE.allowThis(answer);
        FHE.allow(answer, msg.sender);
    }

    function _lightsOn(Run storage r) internal view {
        Job[] storage jobs = _chapters[r.chapter - 1].jobs;
        if (r.job < jobs.length && jobs[r.job].dark) revert Blackout();
    }

    function _memberBit(Run storage r, uint8 member) internal view returns (uint16 bit) {
        if (member >= _chapters[r.chapter - 1].crew) revert BadMember();
        bit = uint16(1) << member;
        if (r.out & bit != 0) revert BadMember();
    }

    /// @dev 1 star: bag > 0. 2: bag >= 40% of total. 3: bag >= total.
    function _stars(uint32 bag, uint32 total) internal pure returns (uint8) {
        if (bag == 0) return 0;
        if (bag >= total) return 3;
        if (uint64(bag) * 5 >= uint64(total) * 2) return 2;
        return 1;
    }

    function _popcount(uint16 x) internal pure returns (uint8 c) {
        while (x != 0) {
            x &= x - 1;
            c++;
        }
    }
}
