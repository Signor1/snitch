import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import type { ContractTransactionReceipt, ContractTransactionResponse } from "ethers";
import type { Snitch, SnitchRooms } from "../../types";

const GAS = 16_000_000;
const HCU_LIMIT = 20_000_000;
const DEPTH_LIMIT = 5_000_000;
const ZERO = ethers.ZeroHash;
const NOBODY = ethers.ZeroAddress;
const SEAL_TIMEOUT = 600;

enum Stage {
  None,
  Open,
  Playing,
  Ended,
  Settled,
}

type JobSpec = { team: number; take: number; hot: boolean; dark: boolean; need: number; ban: number };
type Plan = { rung: number; bps: number };
const PLAN: Plan = { rung: 0, bps: 10_000 };
const MULT = [1, 2, 3];
const mask = (ids: number[]) => ids.reduce((m, i) => m | (1 << i), 0);
const has = (m: number, i: number) => (m & (1 << i)) !== 0;
const range = (from: number, n: number) => [...Array(n)].map((_, i) => from + i);
const shuffled = (ids: number[]) => {
  const a = [...ids];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
/** Required seats first, then `prefer`, then the rest, `avoid` last. */
function pickTeam(j: JobSpec, crew: number, out = 0, avoid: number[] = [], prefer: number[] = []) {
  const present = range(0, crew).filter((m) => !has(out, m));
  const need = present.filter((m) => has(j.need, m));
  const pool = shuffled(present.filter((m) => !need.includes(m) && !has(j.ban, m)));
  const ordered = [
    ...pool.filter((m) => prefer.includes(m)),
    ...pool.filter((m) => !prefer.includes(m) && !avoid.includes(m)),
    ...pool.filter((m) => avoid.includes(m) && !prefer.includes(m)),
  ];
  return [...need, ...ordered].slice(0, j.team);
}

const table = new Map<string, { hcu: number; depth: number; gas: number; n: number }>();

describe("SnitchRooms", function () {
  this.timeout(3_600_000);
  let game: Snitch;
  let k: SnitchRooms;
  let addr: string;
  let signers: HardhatEthersSigner[];
  let host: HardhatEthersSigner;
  let friends: HardhatEthersSigner[]; // up to 6 players
  let outsider: HardhatEthersSigner;
  let host2: HardhatEthersSigner;

  before(async function () {
    if (!fhevm.isMock) this.skip();
    signers = await ethers.getSigners();
    host = signers[0];
    friends = signers.slice(1, 7);
    host2 = signers[8];
    outsider = signers[9];
  });
  beforeEach(async () => {
    game = (await (await ethers.getContractFactory("Snitch")).deploy()) as unknown as Snitch;
    k = (await (
      await ethers.getContractFactory("SnitchRooms")
    ).deploy(await game.getAddress())) as unknown as SnitchRooms;
    addr = await k.getAddress();
  });
  after(() => {
    if (!table.size) return;
    const lines = [
      `  ${"action".padEnd(30)} ${"HCU".padStart(8)} ${"depth".padStart(8)} ${"gas".padStart(8)} ${"txs".padStart(5)}`,
    ];
    for (const [op, v] of table)
      lines.push(
        `  ${op.padEnd(30)} ${(v.hcu / 1e6).toFixed(3).padStart(7)}M ${(v.depth / 1e6).toFixed(3).padStart(7)}M ${(v.gas / 1e6).toFixed(3).padStart(7)}M ${String(v.n).padStart(5)}`,
      );
    console.log(
      "\n  Rooms: HCU / gas per action (worst case over the suite; limits 20M total, 5M depth)\n" + lines.join("\n"),
    );
  });

  async function send(p: Promise<ContractTransactionResponse>, op?: string) {
    const r = (await (await p).wait())!;
    if (op) {
      const info = fhevm.computeTransactionHCU(r);
      expect(info.globalHCU, `${op} HCU`).to.be.lte(HCU_LIMIT);
      expect(info.maxHCUDepth, `${op} depth`).to.be.lte(DEPTH_LIMIT);
      const v = table.get(op) ?? { hcu: 0, depth: 0, gas: 0, n: 0 };
      table.set(op, {
        hcu: Math.max(v.hcu, info.globalHCU),
        depth: Math.max(v.depth, info.maxHCUDepth),
        gas: Math.max(v.gas, Number(r.gasUsed)),
        n: v.n + 1,
      });
    }
    return r;
  }
  function eventArgs(r: ContractTransactionReceipt, name: string) {
    for (const l of r.logs) {
      const p = k.interface.parseLog(l);
      if (p?.name === name) return p.args;
    }
    throw new Error(`no ${name} event`);
  }
  const dBool = (h: string, who: HardhatEthersSigner) => fhevm.userDecryptEbool(h, addr, who);
  const dU32 = async (h: string, who: HardhatEthersSigner) =>
    Number(await fhevm.userDecryptEuint(FhevmType.euint32, h, addr, who));
  const dU8 = async (h: string, who: HardhatEthersSigner) =>
    Number(await fhevm.userDecryptEuint(FhevmType.euint8, h, addr, who));
  /** `seats[i]` null = computer seat. */
  async function room(
    chapter: number,
    difficulty: number,
    seats: (HardhatEthersSigner | null)[],
    o: { start?: boolean; boss?: HardhatEthersSigner } = {},
  ) {
    const boss = o.boss ?? host;
    const r = await send(k.connect(boss).createRoom(chapter, difficulty, { gasLimit: GAS }), "createRoom");
    const id = eventArgs(r, "RoomCreated").id as bigint;
    for (let i = 0; i < seats.length; i++) if (seats[i]) await k.connect(seats[i]!).join(id, i);
    if (o.start !== false) await send(k.connect(boss).startRoom(id, { gasLimit: GAS }), "startRoom");
    return id;
  }
  const view = (id: bigint) => k.roomOf(id);
  async function nextJob(id: bigint) {
    const v = await view(id);
    const c = await game.chapterOf(v.chapter);
    const j = c.jobs[Number(v.job)];
    return {
      j: {
        team: Number(j.team),
        take: Number(j.take),
        hot: j.hot,
        dark: j.dark,
        need: Number(j.need),
        ban: Number(j.ban),
      } as JobSpec,
      crew: Number(v.crew),
      out: Number(v.out),
      index: Number(v.job),
      jobs: c.jobs.length,
    };
  }
  /** Returns the snitch seat, or -1 when a computer seat is the snitch. */
  async function snitchSeat(id: bigint) {
    const v = await view(id);
    let found = -1;
    let ones = 0;
    for (let i = 0; i < v.seats.length; i++) {
      if (v.seats[i] === NOBODY) continue;
      const who = signers.find((s) => s.address === v.seats[i])!;
      const h = await k.connect(who).myRole(id);
      expect(h).to.not.eq(ZERO);
      if (await dBool(h, who)) {
        found = i;
        ones++;
      }
    }
    expect(ones).to.be.lte(1);
    return found;
  }
  const signerAt = async (id: bigint, seat: number) => {
    const a = (await view(id)).seats[seat];
    return a === NOBODY ? null : signers.find((s) => s.address === a)!;
  };
  async function sealWord(id: bigint, who: HardhatEthersSigner, word: boolean) {
    const enc = await fhevm.createEncryptedInput(addr, who.address).addBool(word).encrypt();
    return send(k.connect(who).seal(id, enc.handles[0], enc.inputProof, { gasLimit: GAS }), "seal");
  }
  async function propose(id: bigint, team: number[], plan: Plan = PLAN, boss = host) {
    return send(k.connect(boss).propose(id, mask(team), plan.rung, plan.bps, { gasLimit: GAS }), "propose");
  }
  async function resolve(id: bigint, boss = host) {
    const v = await view(id);
    const c = await game.chapterOf(v.chapter);
    const hot = c.jobs[Number(v.job)].hot;
    return send(k.connect(boss).resolve(id, { gasLimit: GAS }), hot ? "resolve (hot)" : "resolve");
  }
  async function totals(id: bigint, who = host) {
    const h = await k.handlesOf(id);
    return { bag: await dU32(h.bag, who), heat: await dU8(h.heat, who) };
  }
  /** Proposes `team`, every human on it seals `words[seat]` (default false), then resolves. */
  async function play(id: bigint, team: number[], words: Record<number, boolean> = {}, plan = PLAN, boss = host) {
    await propose(id, team, plan, boss);
    for (const s of team) {
      const who = await signerAt(id, s);
      if (who) await sealWord(id, who, words[s] ?? false);
    }
    await resolve(id, boss);
    const h = await k.handlesOf(id);
    return { tipped: await dBool(h.tipped, boss), ...(await totals(id, boss)) };
  }
  async function walk(id: bigint, boss = host) {
    await send(k.connect(boss).walkAway(id, { gasLimit: GAS }), "walkAway");
  }
  const decode = (clears: string) => {
    const v = ethers.AbiCoder.defaultAbiCoder().decode(["uint32", "uint8", "uint8"], clears);
    return { payout: Number(v[0]), snitch: Number(v[1]), heat: Number(v[2]) };
  };
  async function settle(id: bigint) {
    const v = await view(id);
    const total = Number((await game.chapterOf(v.chapter)).total);
    const hs = [...(await k.revealHandles(id))];
    expect(hs.length).to.eq(3);
    const dec = await fhevm.publicDecrypt(hs);
    const r = await send(k.connect(outsider).settle(id, dec.abiEncodedClearValues, dec.decryptionProof));
    const clear = decode(dec.abiEncodedClearValues);
    const bag = clear.payout / MULT[Number(v.difficulty)];
    const snitchWon = clear.heat >= 3 || bag * 5 < total * 2;
    const ev = eventArgs(r, "RoomSettled");
    expect([Number(ev.payout), Number(ev.snitch), Number(ev.heat), ev.snitchWon]).to.deep.eq([
      clear.payout,
      clear.snitch,
      clear.heat,
      snitchWon,
    ]);
    const res = await k.resultOf(id);
    expect([Number(res.payout), Number(res.snitch), Number(res.heat), res.snitchWon]).to.deep.eq([
      clear.payout,
      clear.snitch,
      clear.heat,
      snitchWon,
    ]);
    expect(clear.snitch).to.be.lt(Number(v.crew));
    expect((await view(id)).stage).to.eq(Stage.Settled);
    return { ...clear, bag, snitchWon };
  }
  const tallies = async (who: HardhatEthersSigner) => ({
    crew: Number(await k.crewWins(who.address)),
    snitch: Number(await k.snitchWins(who.address)),
  });
  it("lobby: create, join, leave and start rules", async () => {
    expect(await k.roomCount()).to.eq(0n);
    expect(await k.snitchGame()).to.eq(await game.getAddress());
    await expect(k.createRoom(0, 0)).to.be.revertedWithCustomError(game, "BadChapter");
    await expect(k.createRoom(4, 0)).to.be.revertedWithCustomError(game, "BadChapter");
    await expect(k.createRoom(1, 3)).to.be.revertedWithCustomError(game, "BadDifficulty");

    await expect(k.createRoom(2, 1)).to.emit(k, "RoomCreated").withArgs(1n, host.address, 2, 1);
    await expect(k.connect(host2).createRoom(1, 0)).to.emit(k, "RoomCreated").withArgs(2n, host2.address, 1, 0);
    expect(await k.roomCount()).to.eq(2n);
    let v = await view(1n);
    expect([v.host, Number(v.chapter), Number(v.difficulty), Number(v.stage), Number(v.crew)]).to.deep.eq([
      host.address,
      2,
      1,
      Stage.Open,
      6,
    ]);
    expect(v.seats).to.deep.eq(Array(6).fill(NOBODY));
    expect(Number(v.favors)).to.eq(2);

    const [a, b, c] = friends;
    await expect(k.connect(a).join(3n, 0)).to.be.revertedWithCustomError(k, "BadRoom");
    await expect(k.connect(host).join(1n, 0)).to.be.revertedWithCustomError(k, "HostCannotSit");
    await expect(k.connect(a).join(1n, 6)).to.be.revertedWithCustomError(k, "BadSeat");
    await expect(k.connect(a).join(1n, 2)).to.emit(k, "Joined").withArgs(1n, a.address, 2);
    await expect(k.connect(a).join(1n, 3)).to.be.revertedWithCustomError(k, "AlreadySeated");
    await expect(k.connect(b).join(1n, 2)).to.be.revertedWithCustomError(k, "SeatTaken");
    await k.connect(b).join(1n, 4);
    await k.connect(a).join(2n, 0); // one seat per room, many rooms are fine
    expect(await k.seatOf(1n, a.address)).to.deep.eq([true, 2n]);
    expect(await k.seatOf(1n, c.address)).to.deep.eq([false, 0n]);
    await expect(k.connect(c).leave(1n)).to.be.revertedWithCustomError(k, "NotSeated");
    await expect(k.connect(a).leave(1n)).to.emit(k, "Left").withArgs(1n, a.address, 2);
    await k.connect(a).join(1n, 5);
    await k.connect(c).join(1n, 2);
    v = await view(1n);
    expect(v.seats).to.deep.eq([NOBODY, NOBODY, c.address, NOBODY, b.address, a.address]);
    expect(await k.connect(a).myRole(1n)).to.eq(ZERO); // not started

    // only the host starts, once; actions need the right stage
    await expect(k.connect(a).startRoom(1n)).to.be.revertedWithCustomError(k, "NotHost");
    await expect(k.propose(1n, 3, 0, 10_000)).to.be.revertedWithCustomError(k, "WrongStage");
    await expect(k.walkAway(1n)).to.be.revertedWithCustomError(k, "WrongStage");
    await expect(k.revealHandles(1n)).to.be.revertedWithCustomError(k, "WrongStage");
    const r = await send(k.startRoom(1n, { gasLimit: GAS }), "startRoom");
    const ev = eventArgs(r, "RoomStarted");
    expect([ev.id, Number(ev.humans), Number(ev.favors)]).to.deep.eq([1n, mask([2, 4, 5]), 2]);
    v = await view(1n);
    expect(v.stage).to.eq(Stage.Playing);
    expect(Number(v.humans)).to.eq(mask([2, 4, 5]));
    await expect(k.startRoom(1n)).to.be.revertedWithCustomError(k, "WrongStage");
    // seats are locked
    await expect(k.connect(outsider).join(1n, 0)).to.be.revertedWithCustomError(k, "WrongStage");
    await expect(k.connect(a).leave(1n)).to.be.revertedWithCustomError(k, "WrongStage");
    // totals start at zero for host and players
    for (const who of [host, a, b, c]) expect(await totals(1n, who)).to.deep.eq({ bag: 0, heat: 0 });
    // room 2 is untouched
    expect((await view(2n)).stage).to.eq(Stage.Open);
  });
  it("roles: each human reads only their own role, exactly one seat is the snitch, spread over seats", async () => {
    const ROOMS = 20;
    const spread = new Map<number, number>();
    for (let n = 0; n < ROOMS; n++) {
      const id = await room(1, 0, friends.slice(0, 5));
      let ones = 0;
      let seat = -1;
      for (let i = 0; i < 5; i++) {
        const who = friends[i];
        const h = await k.connect(who).myRole(id);
        expect(h).to.not.eq(ZERO);
        if (await dBool(h, who)) {
          ones++;
          seat = i;
        }
        // nobody else reads it: not the host, not another player, not an outsider, not the public
        const peer = friends[(i + 1) % 5];
        await expect(fhevm.userDecryptEbool(h, addr, peer)).to.be.rejected;
        if (n < 3) {
          await expect(fhevm.userDecryptEbool(h, addr, host)).to.be.rejected;
          await expect(fhevm.userDecryptEbool(h, addr, outsider)).to.be.rejected;
          await expect(fhevm.publicDecrypt([h])).to.be.rejected;
        }
      }
      expect(ones, "all five seats are human: exactly one is the snitch").to.eq(1);
      expect(await k.connect(outsider).myRole(id)).to.eq(ZERO);
      expect(await k.connect(host).myRole(id)).to.eq(ZERO);
      spread.set(seat, (spread.get(seat) ?? 0) + 1);
      if (n < 4) {
        await walk(id);
        expect((await settle(id)).snitch).to.eq(seat);
      }
    }
    console.log(`    snitch seat spread ${JSON.stringify([...spread.entries()].sort())}`);
    expect(spread.size).to.be.gte(4);
    expect(Math.max(...spread.values())).to.be.lte(ROOMS / 2);

    // with computer seats: at most one human is the snitch, and the reveal matches
    for (let n = 0; n < 4; n++) {
      const id = await room(2, 0, [friends[0], null, friends[1], null, null, null]);
      const seat = await snitchSeat(id);
      await walk(id);
      const r = await settle(id);
      if (seat >= 0) expect(r.snitch).to.eq(seat);
      else expect([1, 3, 4, 5]).to.include(r.snitch);
    }
  });
  /** A chapter-1 room with five human seats whose snitch seat the test knows. */
  async function knownRoom(difficulty = 0) {
    const id = await room(1, difficulty, friends.slice(0, 5));
    const s = await snitchSeat(id);
    expect(s).to.be.gte(0);
    return { id, s };
  }

  it("a human snitch who seals true gets every job tipped; sealing false leaves only bad luck", async () => {
    let tippedTrue = 0;
    let jobsTrue = 0;
    const clean = { n: 0, tipped: 0 };
    for (let n = 0; n < 4; n++) {
      const { id, s } = await knownRoom();
      let heat = 0;
      let bag = 0;
      for (let j = 0; j < 6; j++) {
        const { j: job, crew, out } = await nextJob(id);
        const team = pickTeam(job, crew, out, [], [s]); // the snitch goes unless banned
        if (!team.includes(s)) {
          ({ heat, bag } = await play(id, team));
          continue;
        }
        const talk = j % 2 === 0;
        const x = await play(id, team, { [s]: talk });
        if (talk) {
          jobsTrue++;
          if (x.tipped) tippedTrue++;
        } else {
          clean.n++;
          if (x.tipped) clean.tipped++;
        }
        // the totals follow the result
        if (x.tipped) {
          expect(x.heat).to.eq(heat + 1);
          expect(x.bag).to.eq(bag);
        } else {
          expect(x.heat).to.eq(heat);
          expect(x.bag).to.eq(bag + job.take);
        }
        ({ heat, bag } = x);
      }
      await expect(k.propose(id, 3, 0, 10_000)).to.be.revertedWithCustomError(k, "NoJobsLeft");
    }
    console.log(`    snitch sealed true: ${tippedTrue}/${jobsTrue} tipped · sealed false: ${clean.tipped}/${clean.n}`);
    expect(tippedTrue).to.eq(jobsTrue);
    expect(clean.tipped / clean.n).to.be.lte(0.35);
  });

  it("a loyal player's true word is ignored", async () => {
    const res = { n: 0, tipped: 0 };
    for (let n = 0; n < 3; n++) {
      const { id, s } = await knownRoom();
      for (let j = 0; j < 6; j++) {
        const { j: job, crew, out } = await nextJob(id);
        const team = pickTeam(job, crew, out, [s]);
        if (team.includes(s)) {
          // a required seat: the snitch goes but stays quiet
          await play(id, team, Object.fromEntries(team.map((m) => [m, m !== s])));
          continue;
        }
        const x = await play(id, team, Object.fromEntries(team.map((m) => [m, true])));
        res.n++;
        if (x.tipped) res.tipped++;
      }
    }
    console.log(`    loyal players all sealed true: ${res.tipped}/${res.n} tipped (bad luck only, expected 0.06)`);
    expect(res.n).to.be.gte(10);
    expect(res.tipped / res.n).to.be.lte(0.35);
  });

  it("every human on the team must seal before resolve, unless the seal timeout passed", async () => {
    const [a, b, c] = friends;
    const id = await room(1, 0, [a, b, null, c, null]); // humans on 0, 1, 3
    await expect(k.resolve(id)).to.be.revertedWithCustomError(k, "NoPending");
    let enc = await fhevm.createEncryptedInput(addr, a.address).addBool(false).encrypt();
    await expect(k.connect(a).seal(id, enc.handles[0], enc.inputProof)).to.be.revertedWithCustomError(k, "NoPending");
    await expect(k.connect(a).propose(id, mask([0, 1]), 0, 10_000)).to.be.revertedWithCustomError(k, "NotHost");
    const pr = await propose(id, [0, 1]);
    expect([...eventArgs(pr, "Proposed")].map(String)).to.deep.eq(["1", "0", "3", "0", "10000"]);
    await expect(k.propose(id, mask([0, 1]), 0, 10_000)).to.be.revertedWithCustomError(k, "Pending");
    await expect(k.resolve(id)).to.be.revertedWithCustomError(k, "NotReady");
    // not on the team / not seated / host
    for (const who of [c, outsider, host]) {
      enc = await fhevm.createEncryptedInput(addr, who.address).addBool(true).encrypt();
      await expect(k.connect(who).seal(id, enc.handles[0], enc.inputProof)).to.be.revertedWithCustomError(
        k,
        "NotOnTeam",
      );
    }
    // a word encrypted for someone else does not import
    enc = await fhevm.createEncryptedInput(addr, b.address).addBool(true).encrypt();
    await expect(k.connect(a).seal(id, enc.handles[0], enc.inputProof)).to.be.reverted;
    const sr = await sealWord(id, a, false);
    expect([...eventArgs(sr, "Sealed")].map(String)).to.deep.eq(["1", "0", "0"]);
    enc = await fhevm.createEncryptedInput(addr, a.address).addBool(true).encrypt();
    await expect(k.connect(a).seal(id, enc.handles[0], enc.inputProof)).to.be.revertedWithCustomError(
      k,
      "AlreadySealed",
    );
    expect(Number((await view(id)).sealedMask)).to.eq(1);
    await expect(k.resolve(id)).to.be.revertedWithCustomError(k, "NotReady");
    await sealWord(id, b, false);
    await expect(k.connect(a).resolve(id)).to.be.revertedWithCustomError(k, "NotHost");
    const rr = await resolve(id);
    const ev = eventArgs(rr, "Resolved");
    const h = await k.handlesOf(id);
    expect([ev.id, ev.job, ev.tipped, ev.bag, ev.heat]).to.deep.eq([1n, 0n, h.tipped, h.bag, h.heat]);
    let v = await view(id);
    expect([Number(v.job), v.pending]).to.deep.eq([1, false]);

    // timeout: c (seat 3) never seals; the host waits SEAL_TIMEOUT, then resolves without the word
    await propose(id, [0, 3]); // job 2 needs seat 0
    await sealWord(id, a, false);
    await time.increase(SEAL_TIMEOUT - 30);
    await expect(k.resolve(id)).to.be.revertedWithCustomError(k, "NotReady");
    await time.increase(60);
    await resolve(id);
    // a computer-only team resolves at once
    v = await view(id);
    expect(Number(v.job)).to.eq(2);
    await propose(id, [1, 2, 4]); // job 3 needs seat 1
    await sealWord(id, b, false);
    await resolve(id);
    await propose(id, [0, 2, 4]); // seats 0 human, 2 and 4 computers
    await expect(k.resolve(id)).to.be.revertedWithCustomError(k, "NotReady");
    await sealWord(id, a, true);
    await resolve(id);
    expect(Number((await view(id)).job)).to.eq(4);
  });

  it("a computer snitch tips about 3 jobs in 4; jobs without it rarely fail", async () => {
    const withS = { n: 0, tipped: 0 };
    const without = { n: 0, tipped: 0 };
    for (let n = 0; n < 24; n++) {
      // one human (seat 0) and four computers; keep rooms where the snitch is a computer
      const id = await room(1, 0, [friends[0], null, null, null, null]);
      const log: [number[], boolean][] = [];
      for (let j = 0; j < 6; j++) {
        const { j: job, crew, out } = await nextJob(id);
        const team = pickTeam(job, crew, out);
        log.push([team, (await play(id, team)).tipped]);
      }
      await walk(id);
      const r = await settle(id);
      if (r.snitch === 0) continue; // the human was the snitch and stayed quiet
      for (const [team, tipped] of log) {
        const b = team.includes(r.snitch) ? withS : without;
        b.n++;
        if (tipped) b.tipped++;
      }
    }
    const pWith = withS.tipped / withS.n;
    const pWithout = without.tipped / without.n;
    console.log(
      `    computer snitch on team: ${withS.tipped}/${withS.n} (${pWith.toFixed(2)}, expected 0.77) · not on team ${without.tipped}/${without.n} (${pWithout.toFixed(2)}, expected 0.06)`,
    );
    expect(withS.n).to.be.gte(25);
    expect(without.n).to.be.gte(15);
    expect(pWith).to.be.gte(0.55);
    expect(pWithout).to.be.lte(0.3);
  });

  it("hot jobs: the base take doubles and a tipped hot job adds two heat", async () => {
    let clean = 0;
    let tipped = 0;
    for (let i = 0; i < 30 && (!clean || !tipped); i++) {
      const id = await room(2, 0, [friends[0]]);
      for (let j = 0; j < 3; j++) {
        const { j: job, crew, out } = await nextJob(id);
        await play(id, pickTeam(job, crew, out));
      }
      const { j: job, crew, out } = await nextJob(id);
      expect(job.hot).to.eq(true);
      const before = await totals(id);
      const x = await play(id, pickTeam(job, crew, out), {}, { rung: 3, bps: 10_000 });
      if (x.tipped) {
        tipped++;
        expect([x.bag, x.heat]).to.deep.eq([before.bag, before.heat + 2]);
      } else {
        clean++;
        expect([x.bag, x.heat]).to.deep.eq([before.bag + 24_000, before.heat]);
      }
    }
    expect(clean).to.be.gte(1);
    expect(tipped).to.be.gte(1);
  });

  it("plan bounds and team rules match Snitch.runJob", async () => {
    const id = await room(1, 0, []);
    for (const [rung, bps] of [
      [4, 10_000],
      [1, 1_999],
      [1, 25_001],
      [0, 15_001],
      [1, 20_001],
    ])
      await expect(k.propose(id, mask([0, 1]), rung, bps)).to.be.revertedWithCustomError(k, "BadPlan");
    for (const t of [[0], [0, 1, 2], [], [0, 5], [4, 15]])
      await expect(k.propose(id, mask(t), 0, 10_000)).to.be.revertedWithCustomError(k, "BadTeam");
    await play(id, [0, 1], {}, { rung: 2, bps: 25_000 });
    await expect(k.propose(id, mask([1, 2]), 0, 10_000)).to.be.revertedWithCustomError(k, "BadTeam"); // needs 0
    await play(id, [0, 2], {}, { rung: 0, bps: 15_000 });
    await expect(k.accuse(id, 5)).to.be.revertedWithCustomError(k, "BadSeat");
    await send(k.accuse(id, 1, { gasLimit: GAS }), "accuse");
    await play(id, [0, 2, 3]); // job 3 needs seat 1, who is out: the requirement lapses
    await play(id, [0, 3, 4]);
    await expect(k.propose(id, mask([2, 3, 4]), 0, 10_000)).to.be.revertedWithCustomError(k, "BadTeam"); // bans 2
    await expect(k.propose(id, mask([0, 1, 3]), 0, 10_000)).to.be.revertedWithCustomError(k, "BadTeam"); // 1 out
  });
  it("job results, bag, heat and accusations are readable by the host and players, not outsiders; tails and taps by the host only", async () => {
    const [a, b] = friends;
    const id = await room(2, 0, [a, b, null, null, null, null]);
    await send(k.tail(id, 3, { gasLimit: GAS }), "tail");
    await send(k.wiretap(id, mask([2, 3]), { gasLimit: GAS }), "wiretap");
    await play(id, [0, 1]);
    await send(k.accuse(id, 5, { gasLimit: GAS }), "accuse");
    const h = await k.handlesOf(id);
    for (const x of [h.tipped, h.bag, h.heat, h.seen, h.tapped, h.right]) expect(x).to.not.eq(ZERO);
    for (const who of [host, a, b]) {
      await dBool(h.tipped, who);
      await dBool(h.right, who);
      await dU32(h.bag, who);
      await dU8(h.heat, who);
    }
    await dBool(h.seen, host);
    await dBool(h.tapped, host);
    for (const who of [a, b, outsider]) {
      await expect(fhevm.userDecryptEbool(h.seen, addr, who)).to.be.rejected;
      await expect(fhevm.userDecryptEbool(h.tapped, addr, who)).to.be.rejected;
    }
    await expect(fhevm.userDecryptEbool(h.tipped, addr, outsider)).to.be.rejected;
    await expect(fhevm.userDecryptEbool(h.right, addr, outsider)).to.be.rejected;
    await expect(fhevm.userDecryptEuint(FhevmType.euint32, h.bag, addr, outsider)).to.be.rejected;
    await expect(fhevm.userDecryptEuint(FhevmType.euint8, h.heat, addr, outsider)).to.be.rejected;
    for (const x of [h.tipped, h.bag, h.heat, h.seen, h.tapped, h.right])
      await expect(fhevm.publicDecrypt([x])).to.be.rejected;
    // host and players agree on what happened
    expect(await dBool(h.tipped, a)).to.eq(await dBool(h.tipped, host));
    expect(await totals(id, b)).to.deep.eq(await totals(id, host));

    await walk(id);
    await fhevm.publicDecrypt([...(await k.revealHandles(id))]);
    // results stay private after the reveal
    await expect(fhevm.publicDecrypt([h.tipped])).to.be.rejected;
    await expect(fhevm.publicDecrypt([h.right])).to.be.rejected;
  });
  it("tail and wiretap: host only, favors, once, exact pairs, blackout before dark jobs", async () => {
    const [a] = friends;
    const id = await room(2, 2, [a, null, null, null, null, null]); // Kingpin: one favor
    await expect(k.connect(a).tail(id, 1)).to.be.revertedWithCustomError(k, "NotHost");
    await expect(k.connect(a).wiretap(id, mask([1, 2]))).to.be.revertedWithCustomError(k, "NotHost");
    await expect(k.tail(id, 6)).to.be.revertedWithCustomError(k, "BadSeat");
    const tr = await send(k.tail(id, 1, { gasLimit: GAS }), "tail");
    const tev = eventArgs(tr, "Tailed");
    expect([tev.id, Number(tev.seat), Number(tev.favorsLeft), tev.seen]).to.deep.eq([
      id,
      1,
      0,
      (await k.handlesOf(id)).seen,
    ]);
    await expect(k.tail(id, 2)).to.be.revertedWithCustomError(k, "NoFavorsLeft");
    for (const p of [[0], [0, 1, 2], [], [0, 6]])
      await expect(k.wiretap(id, mask(p))).to.be.revertedWithCustomError(k, "BadPair");
    await play(id, [0, 1]); // next job (job 2) is dark
    await expect(k.tail(id, 2)).to.be.revertedWithCustomError(k, "Blackout");
    await expect(k.wiretap(id, mask([2, 3]))).to.be.revertedWithCustomError(k, "Blackout");
    await play(id, [0, 1, 3]);
    const tapped = await send(k.wiretap(id, mask([2, 3]), { gasLimit: GAS }), "wiretap");
    expect(eventArgs(tapped, "Wiretapped").tapped).to.eq((await k.handlesOf(id)).tapped);
    await expect(k.wiretap(id, mask([4, 5]))).to.be.revertedWithCustomError(k, "WiretapUsed");
    const hit = await dBool((await k.handlesOf(id)).tapped, host);
    await walk(id);
    const r = await settle(id);
    expect([2, 3].includes(r.snitch)).to.eq(hit); // the wiretap is exact

    // chapter 1 has no wiretap
    const id2 = await room(1, 0, []);
    await expect(k.wiretap(id2, mask([0, 1]))).to.be.revertedWithCustomError(k, "NoWiretap");
    // tails are mostly right (Street: wrong 1/8)
    let right = 0;
    let n = 0;
    for (let i = 0; i < 6; i++) {
      const rid = await room(1, 0, []);
      const seats = shuffled(range(0, 5)).slice(0, 3);
      const seen: boolean[] = [];
      for (const s of seats) {
        await send(k.tail(rid, s, { gasLimit: GAS }), "tail");
        seen.push(await dBool((await k.handlesOf(rid)).seen, host));
      }
      await walk(rid);
      const res = await settle(rid);
      seats.forEach((s, x) => {
        n++;
        if (seen[x] === (s === res.snitch)) right++;
      });
    }
    expect(right / n).to.be.gte(0.6);
  });

  it("accuse: host only, seat leaves; right doubles the bag once and silences the snitch; wrong adds heat", async () => {
    let done = false;
    for (let attempt = 0; attempt < 20 && !done; attempt++) {
      const { id, s } = await knownRoom();
      const [a] = friends;
      await expect(k.connect(a).accuse(id, 0)).to.be.revertedWithCustomError(k, "NotHost");
      // bank job 1 without the snitch
      const first = await nextJob(id);
      const t1 = pickTeam(first.j, first.crew, 0, [s]);
      await propose(id, t1);
      await expect(k.accuse(id, 0)).to.be.revertedWithCustomError(k, "Pending");
      for (const m of t1) await sealWord(id, friends[m], false);
      await resolve(id);
      const before = await totals(id);
      if (before.bag === 0) continue; // bad luck, try again

      // wrong accusation first
      const innocent = range(0, 5).find((m) => m !== s && !t1.includes(m)) ?? range(0, 5).find((m) => m !== s)!;
      const w = await send(k.accuse(id, innocent, { gasLimit: GAS }), "accuse");
      expect(eventArgs(w, "Accused").right).to.eq((await k.handlesOf(id)).right);
      for (const who of [host, ...friends.slice(0, 5)])
        expect(await dBool((await k.handlesOf(id)).right, who)).to.eq(false);
      expect(await totals(id)).to.deep.eq({ bag: before.bag, heat: 1 });
      await expect(k.accuse(id, innocent)).to.be.revertedWithCustomError(k, "BadSeat");

      // right: the bag doubles
      await send(k.accuse(id, s, { gasLimit: GAS }), "accuse");
      for (const who of [host, ...friends.slice(0, 5)])
        expect(await dBool((await k.handlesOf(id)).right, who)).to.eq(true);
      expect(await totals(id)).to.deep.eq({ bag: before.bag * 2, heat: 1 });
      expect(Number((await view(id)).out)).to.eq(mask([innocent, s]));
      // the snitch is out: it can no longer go on a job or seal
      const nj = await nextJob(id);
      const withSnitch = pickTeam({ ...nj.j, need: 0 }, nj.crew, 0, [], [s]);
      await expect(k.propose(id, mask(withSnitch), 0, 10_000)).to.be.revertedWithCustomError(k, "BadTeam");

      // a later accusation is never right again and never doubles
      const another = range(0, 5).find((m) => m !== s && m !== innocent)!;
      await send(k.accuse(id, another, { gasLimit: GAS }), "accuse");
      expect(await dBool((await k.handlesOf(id)).right, host)).to.eq(false);
      expect(await totals(id)).to.deep.eq({ bag: before.bag * 2, heat: 2 });

      // the rest of the jobs: everyone left seals true, only bad luck can tip now
      let tips = 0;
      let jobs = 0;
      for (;;) {
        const { j, crew, out, index, jobs: total } = await nextJob(id);
        if (index >= total) break;
        const present = range(0, crew).filter((m) => !has(out, m) && !has(j.ban, m));
        if (present.length < j.team) break;
        const team = pickTeam(j, crew, out);
        const x = await play(id, team, Object.fromEntries(team.map((m) => [m, true])));
        jobs++;
        if (x.tipped) tips++;
      }
      expect(tips).to.be.lte(Math.max(1, Math.floor(jobs / 2)));
      await walk(id);
      const r = await settle(id);
      expect(r.snitch).to.eq(s);
      done = true;
    }
    expect(done).to.eq(true);
  });
  it("walkAway + settle: a raid is a snitch win, a full bag is a crew win; tallies per address", async () => {
    // three wrong accusations: heat 3, payout 0, snitch side wins
    {
      const { id, s } = await knownRoom(1);
      const before = await Promise.all([host, ...friends.slice(0, 5)].map(tallies));
      const loyal = range(0, 5).filter((m) => m !== s);
      for (const m of loyal.slice(0, 3)) await send(k.accuse(id, m, { gasLimit: GAS }), "accuse");
      expect((await totals(id)).heat).to.eq(3);
      await expect(k.connect(friends[0]).walkAway(id)).to.be.revertedWithCustomError(k, "NotHost");
      const wr = await send(k.walkAway(id, { gasLimit: GAS }), "walkAway");
      const ev = eventArgs(wr, "WalkedAway");
      expect([...(await k.revealHandles(id))]).to.deep.eq([ev.payout, ev.snitch, ev.heat]);
      await expect(k.propose(id, 3, 0, 10_000)).to.be.revertedWithCustomError(k, "WrongStage");
      await expect(k.tail(id, 0)).to.be.revertedWithCustomError(k, "WrongStage");
      const r = await settle(id);
      expect([r.payout, r.snitch, r.heat, r.snitchWon]).to.deep.eq([0, s, 3, true]);
      const after = await Promise.all([host, ...friends.slice(0, 5)].map(tallies));
      expect(after[0]).to.deep.eq(before[0]); // host: no crew win
      for (let i = 0; i < 5; i++)
        expect(after[i + 1]).to.deep.eq({
          crew: before[i + 1].crew,
          snitch: before[i + 1].snitch + (i === s ? 1 : 0),
        });
    }
    // crew win: honest words, safe greedy plan, catch the snitch: bag well above 40%
    let crewWon = false;
    for (let attempt = 0; attempt < 10 && !crewWon; attempt++) {
      const { id, s } = await knownRoom(0);
      const before = await Promise.all([host, ...friends.slice(0, 5)].map(tallies));
      for (let j = 0; j < 6; j++) {
        const { j: job, crew, out } = await nextJob(id);
        await play(id, pickTeam(job, crew, out, [s]), {}, { rung: 0, bps: 15_000 });
      }
      await send(k.accuse(id, s, { gasLimit: GAS }), "accuse");
      const { bag, heat } = await totals(id);
      await walk(id);
      const r = await settle(id);
      expect(r.payout).to.eq(heat >= 3 ? 0 : bag);
      const after = await Promise.all([host, ...friends.slice(0, 5)].map(tallies));
      if (!r.snitchWon) {
        crewWon = true;
        expect(after[0]).to.deep.eq({ crew: before[0].crew + 1, snitch: before[0].snitch });
        for (let i = 0; i < 5; i++)
          expect(after[i + 1]).to.deep.eq({
            crew: before[i + 1].crew + (i === s ? 0 : 1),
            snitch: before[i + 1].snitch,
          });
      }
    }
    expect(crewWon).to.eq(true);
  });

  it("the win rule: 40% of the chapter total (before the multiplier) decides; a computer snitch's win credits nobody", async () => {
    // Made (x2), computer seats, one job: bag <= 1,500 of 38,000, so the snitch side wins
    const id = await room(1, 1, []);
    await play(id, [0, 1]);
    await walk(id);
    const before = await tallies(host);
    const r = await settle(id);
    expect(r.snitchWon).to.eq(true);
    expect(await tallies(host)).to.deep.eq(before);
  });

  it("settles once, only with the matching proof for the stored handles in order", async () => {
    const a = await room(1, 1, [friends[0]]);
    const b = await room(1, 1, [friends[1]]);
    await play(a, [0, 1]);
    await play(b, [0, 1]);
    await expect(k.settle(a, "0x", "0x")).to.be.revertedWithCustomError(k, "WrongStage");
    await walk(a);
    await walk(b);
    const ha = [...(await k.revealHandles(a))];
    const hb = [...(await k.revealHandles(b))];
    const theirs = await fhevm.publicDecrypt(hb);
    await expect(k.settle(a, theirs.abiEncodedClearValues, theirs.decryptionProof)).to.be.reverted;
    for (const order of [
      [1, 0, 2],
      [0, 2, 1],
      [2, 1, 0],
    ]) {
      const sw = await fhevm.publicDecrypt(order.map((i) => ha[i]));
      await expect(k.settle(a, sw.abiEncodedClearValues, sw.decryptionProof)).to.be.reverted;
    }
    const partial = await fhevm.publicDecrypt(ha.slice(0, 2));
    await expect(k.settle(a, partial.abiEncodedClearValues, partial.decryptionProof)).to.be.reverted;
    const good = await fhevm.publicDecrypt(ha);
    const real = decode(good.abiEncodedClearValues);
    const forged = ethers.AbiCoder.defaultAbiCoder().encode(["uint32", "uint8", "uint8"], [999_999, real.snitch, 0]);
    await expect(k.settle(a, forged, good.decryptionProof)).to.be.reverted;
    expect((await view(a)).stage).to.eq(Stage.Ended);
    await settle(a);
    await expect(k.settle(a, good.abiEncodedClearValues, good.decryptionProof)).to.be.revertedWithCustomError(
      k,
      "WrongStage",
    );
    await settle(b);
  });
  it("two rooms at once stay independent", async () => {
    const [a, b, c, d] = friends;
    // the same player sits in both rooms, on different seats
    const r1 = await room(1, 0, [a, b, null, null, null]);
    const r2 = await room(2, 0, [null, null, c, a, d, null], { boss: host2 });
    expect([Number((await view(r1)).crew), Number((await view(r2)).crew)]).to.deep.eq([5, 6]);
    // a's roles are per room and only valid in their own room
    const role1 = await k.connect(a).myRole(r1);
    const role2 = await k.connect(a).myRole(r2);
    expect(role1).to.not.eq(role2);
    await dBool(role1, a);
    await dBool(role2, a);
    // each host acts only in its room
    await expect(k.connect(host2).propose(r1, mask([0, 1]), 0, 10_000)).to.be.revertedWithCustomError(k, "NotHost");
    await expect(k.propose(r2, mask([0, 1]), 0, 10_000)).to.be.revertedWithCustomError(k, "NotHost");
    // interleaved pending jobs
    await propose(r1, [0, 1]);
    await propose(r2, [3, 4], PLAN, host2); // Uptown job 1 bans seat 2
    await sealWord(r1, a, false);
    await expect(k.connect(b).seal(r2, ethers.ZeroHash, "0x")).to.be.revertedWithCustomError(k, "NotOnTeam");
    await expect(k.connect(c).seal(r2, ethers.ZeroHash, "0x")).to.be.revertedWithCustomError(k, "NotOnTeam");
    await sealWord(r2, a, true);
    expect(Number((await view(r1)).sealedMask)).to.eq(mask([0]));
    expect(Number((await view(r2)).sealedMask)).to.eq(mask([3]));
    await expect(k.resolve(r1)).to.be.revertedWithCustomError(k, "NotReady");
    await sealWord(r1, b, false);
    await sealWord(r2, d, false);
    await resolve(r1);
    await resolve(r2, host2);
    // results are shared inside a room only
    const h1 = await k.handlesOf(r1);
    const h2 = await k.handlesOf(r2);
    await dBool(h1.tipped, b);
    await dBool(h2.tipped, d);
    await expect(fhevm.userDecryptEbool(h1.tipped, addr, d)).to.be.rejected;
    await expect(fhevm.userDecryptEbool(h2.tipped, addr, b)).to.be.rejected;
    await expect(fhevm.userDecryptEbool(h2.tipped, addr, host)).to.be.rejected;
    // ending one room leaves the other running
    await send(k.accuse(r1, 4, { gasLimit: GAS }), "accuse");
    await walk(r1);
    expect((await view(r2)).stage).to.eq(Stage.Playing);
    expect(Number((await view(r2)).out)).to.eq(0);
    expect(Number((await view(r2)).job)).to.eq(1);
    await settle(r1);
    await walk(r2, host2);
    await settle(r2);
    expect(await k.roomCount()).to.eq(2n);
  });
});
