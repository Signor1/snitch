import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import type { ContractTransactionReceipt, ContractTransactionResponse } from "ethers";
import type { Snitch } from "../../types";

const GAS = 16_000_000;
const HCU_LIMIT = 20_000_000;
const DEPTH_LIMIT = 5_000_000;
const ZERO = ethers.ZeroHash;

enum Stage {
  None,
  Playing,
  Ended,
  Settled,
}

// expected chapter tables
type JobSpec = { team: number; take: number; hot: boolean; dark: boolean; need: number; ban: number };
const mask = (ids: number[]) => ids.reduce((m, i) => m | (1 << i), 0);
const J = (
  team: number,
  take: number,
  o: { hot?: boolean; dark?: boolean; need?: number[]; ban?: number[] } = {},
): JobSpec => ({
  team,
  take,
  hot: !!o.hot,
  dark: !!o.dark,
  need: mask(o.need ?? []),
  ban: mask(o.ban ?? []),
});
const CHAPTERS = [
  {
    name: "The Corner",
    crew: 5,
    skimmer: false,
    wiretap: false,
    jobs: [
      J(2, 1_000),
      J(2, 2_500, { need: [0] }),
      J(3, 4_500, { need: [1] }),
      J(3, 6_000),
      J(3, 9_000, { ban: [2] }),
      J(4, 15_000, { need: [1] }),
    ],
  },
  {
    name: "Uptown",
    crew: 6,
    skimmer: false,
    wiretap: true,
    jobs: [
      J(2, 2_000, { ban: [2] }),
      J(3, 5_000, { dark: true }),
      J(3, 7_000),
      J(3, 12_000, { hot: true }),
      J(3, 9_000, { need: [5] }),
      J(4, 15_000),
      J(4, 30_000, { need: [1] }),
    ],
  },
  {
    name: "The Docks",
    crew: 6,
    skimmer: true,
    wiretap: true,
    jobs: [
      J(2, 4_000),
      J(3, 10_000, { ban: [4] }),
      J(3, 14_000),
      J(4, 25_000, { dark: true }),
      J(3, 9_000, { hot: true }),
      J(4, 20_000),
      J(4, 60_000, { hot: true }),
    ],
  },
];
const DIFFS = [
  { favors: 3, tailWrong: 8, baseRung: 1, mult: 1 },
  { favors: 2, tailWrong: 4, baseRung: 1, mult: 2 },
  { favors: 1, tailWrong: 4, baseRung: 2, mult: 3 },
];
const baseOf = (j: { take: number; hot: boolean }) => j.take * (j.hot ? 2 : 1);
const total = (ch: number) => CHAPTERS[ch - 1].jobs.reduce((a, j) => a + baseOf(j), 0);
const starsFor = (bag: number, tot: number) => (bag === 0 ? 0 : bag >= tot ? 3 : bag * 5 >= tot * 2 ? 2 : 1);

type Plan = { rung: number; bps: number };
const PLAN: Plan = { rung: 1, bps: 10_000 };
const maxBps = (rung: number) => Math.min(25_000, 15_000 + 5_000 * rung);
const randomPlan = (): Plan => {
  const rung = Math.floor(Math.random() * 4);
  const steps = (maxBps(rung) - 2_000) / 100;
  return { rung, bps: 2_000 + 100 * Math.floor(Math.random() * (steps + 1)) };
};
const gainOf = (base: number, bps: number) => Math.floor((base * bps) / 10_000);

const range = (from: number, n: number) => [...Array(n)].map((_, i) => from + i);
const shuffled = (ids: number[]) => {
  const a = [...ids];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const has = (m: number, i: number) => (m & (1 << i)) !== 0;

function pickTeam(j: JobSpec, crew: number, out = 0, avoid: number[] = []) {
  const present = range(0, crew).filter((m) => !has(out, m));
  const need = present.filter((m) => has(j.need, m));
  const pool = shuffled(present.filter((m) => !need.includes(m) && !has(j.ban, m)));
  const ordered = [...pool.filter((m) => !avoid.includes(m)), ...pool.filter((m) => avoid.includes(m))];
  return [...need, ...ordered].slice(0, j.team);
}

// op -> worst case seen over the whole suite
const table = new Map<string, { hcu: number; depth: number; gas: number; n: number }>();

describe("Snitch", function () {
  this.timeout(3_600_000);
  let k: Snitch;
  let addr: string;
  let me: HardhatEthersSigner;
  let other: HardhatEthersSigner;

  before(async function () {
    if (!fhevm.isMock) this.skip();
    [me, other] = await ethers.getSigners();
  });
  beforeEach(async () => {
    k = (await (await ethers.getContractFactory("Snitch")).deploy()) as unknown as Snitch;
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
      "\n  HCU / gas per action (worst case over the suite; limits 20M total, 5M depth)\n" + lines.join("\n"),
    );
  });

  /** Labelled txs are checked against the HCU limits. */
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

  const dBool = (h: string, who = me) => fhevm.userDecryptEbool(h, addr, who);
  const dU32 = async (h: string, who = me) => Number(await fhevm.userDecryptEuint(FhevmType.euint32, h, addr, who));
  const dU8 = async (h: string, who = me) => Number(await fhevm.userDecryptEuint(FhevmType.euint8, h, addr, who));

  const chapterOfRun = async (who: HardhatEthersSigner) => k.chapterOf((await k.runOf(who.address)).chapter);
  const toSpec = (j: Snitch.JobStructOutput): JobSpec => ({
    team: Number(j.team),
    take: Number(j.take),
    hot: j.hot,
    dark: j.dark,
    need: Number(j.need),
    ban: Number(j.ban),
  });
  async function nextJob(who = me) {
    const run = await k.runOf(who.address);
    const c = await k.chapterOf(run.chapter);
    return { j: toSpec(c.jobs[Number(run.job)]), crew: Number(c.crew), out: Number(run.out), index: Number(run.job) };
  }
  async function team(who = me, avoid: number[] = []) {
    const { j, crew, out } = await nextJob(who);
    return pickTeam(j, crew, out, avoid);
  }

  async function start(chapter: number, difficulty: number, who = me) {
    const skimmer = (await k.chapterOf(chapter)).hasSkimmer;
    await send(
      k.connect(who).start(chapter, difficulty, { gasLimit: GAS }),
      skimmer ? "start (snitch + skimmer)" : "start (snitch)",
    );
  }
  async function totals(who = me) {
    const h = await k.handlesOf(who.address);
    return { bag: await dU32(h.bag, who), heat: await dU8(h.heat, who) };
  }
  async function job(members: number[], who = me, plan: Plan = PLAN) {
    const c = await chapterOfRun(who);
    const { j } = await nextJob(who);
    const label = `runJob${c.hasSkimmer ? " (skimmer chapter" + (j.hot ? ", hot)" : ")") : j.hot ? " (hot)" : ""}`;
    await send(k.connect(who).runJob(mask(members), plan.rung, plan.bps, { gasLimit: GAS }), label);
    return dBool((await k.handlesOf(who.address)).tipped, who);
  }
  async function tail(member: number, who = me) {
    await send(k.connect(who).tail(member, { gasLimit: GAS }), "tail");
    return dBool((await k.handlesOf(who.address)).seen, who);
  }
  async function rumour(member: number, who = me) {
    await send(k.connect(who).rumour(member, { gasLimit: GAS }), "rumour");
    return dBool((await k.handlesOf(who.address)).heard, who);
  }
  async function wiretap(pair: number[], who = me) {
    await send(k.connect(who).wiretap(mask(pair), { gasLimit: GAS }), "wiretap");
    return dBool((await k.handlesOf(who.address)).tapped, who);
  }
  async function accuse(member: number, who = me) {
    await send(k.connect(who).accuse(member, { gasLimit: GAS }), "accuse");
    return dBool((await k.handlesOf(who.address)).right, who);
  }
  async function walk(who = me) {
    const street = (await k.runOf(who.address)).difficulty === 0n;
    await send(k.connect(who).walkAway({ gasLimit: GAS }), street ? "walkAway (x1)" : "walkAway (x2 / x3)");
  }
  /** payout, snitch, heat, skimmer, second (255 = none) */
  function decodeClears(clears: string) {
    const v = ethers.AbiCoder.defaultAbiCoder().decode(["uint32", "uint8", "uint8", "uint8", "uint8"], clears);
    return { payout: Number(v[0]), snitch: Number(v[1]), heat: Number(v[2]), skimmer: Number(v[3]), second: Number(v[4]) };
  }
  async function settle(who = me) {
    const run = await k.runOf(who.address);
    const c = await chapterOfRun(who);
    const hs = [...(await k.revealHandles(who.address))];
    expect(hs.length).to.eq(5);
    const dec = await fhevm.publicDecrypt(hs);
    const r = await send(
      k.connect(other).settle(who.address, dec.abiEncodedClearValues, dec.decryptionProof, { gasLimit: GAS }),
      "settle (5 handles)",
    );
    const clear = decodeClears(dec.abiEncodedClearValues);
    const ev = eventArgs(r, "Settled");
    const bag = clear.payout / DIFFS[Number(run.difficulty)].mult;
    expect(ev.player).to.eq(who.address);
    expect(ev.run).to.eq(run.run);
    expect(Number(ev.payout)).to.eq(clear.payout);
    expect(Number(ev.bag)).to.eq(bag);
    expect(Number(ev.snitch)).to.eq(clear.snitch);
    expect(Number(ev.heat)).to.eq(clear.heat);
    expect(Number(ev.skimmer)).to.eq(clear.skimmer);
    expect(Number(ev.second)).to.eq(clear.second);
    if (!c.hasSkimmer) expect(clear.skimmer).to.eq(255);
    const rules = Number(c.rules);
    if ((rules & 3) === 0) expect(clear.second).to.eq(255);
    expect(Number(ev.stars)).to.eq(starsFor(bag, Number(c.total)));
    if ((Number(c.rules) & 4) === 0) expect(clear.snitch).to.be.lt(Number(c.crew));
    else expect(clear.snitch === 255 || clear.snitch < Number(c.crew)).to.eq(true);
    expect((await k.runOf(who.address)).stage).to.eq(Stage.Settled);
    return { ...clear, bag, stars: Number(ev.stars) };
  }
  const finish = async (who = me) => {
    await walk(who);
    return settle(who);
  };
  async function earnStar(chapter: number, who = me) {
    for (let i = 0; i < 60 && (await k.bestStars(who.address, chapter)) === 0n; i++) {
      await start(chapter, 0, who);
      await job([0, 1], who);
      await finish(who);
    }
    expect(await k.bestStars(who.address, chapter)).to.be.gte(1n);
  }
  async function unlock(chapter: number, who = me) {
    for (let c = 1; c < chapter; c++) await earnStar(c, who);
  }
  async function playNext(who = me, plan: Plan = PLAN, avoid: number[] = []) {
    const before = await totals(who);
    const members = await team(who, avoid);
    const tipped = await job(members, who, plan);
    const now = await totals(who);
    return { team: members, tipped, gain: now.bag - before.bag, heatUp: now.heat - before.heat };
  }
  it("ships the three v2 chapters (hot, dark, need, ban) and the difficulty table of the spec", async () => {
    expect(await k.chapterCount()).to.eq(3n);
    expect([38_000, 92_000, 211_000]).to.deep.eq([1, 2, 3].map(total));
    for (let id = 1; id <= 3; id++) {
      const c = await k.chapterOf(id);
      const s = CHAPTERS[id - 1];
      expect(c.name).to.eq(s.name);
      expect(c.crew).to.eq(s.crew);
      expect(c.hasSkimmer).to.eq(s.skimmer);
      expect(c.hasWiretap).to.eq(s.wiretap);
      expect(c.total).to.eq(total(id));
      expect(c.jobs.map(toSpec)).to.deep.eq(s.jobs);
    }
    for (let d = 0; d < 3; d++) {
      const x = await k.difficultyOf(d);
      expect([x.favors, x.tailWrongBound, x.baseRung, x.multiplier].map(Number)).to.deep.eq([
        DIFFS[d].favors,
        DIFFS[d].tailWrong,
        DIFFS[d].baseRung,
        DIFFS[d].mult,
      ]);
    }
    expect(await k.MAX_TOTAL()).to.eq(250_000_000n);
  });
  for (const [chapter, difficulty] of [
    [1, 0],
    [1, 2],
    [2, 1],
    [3, 0],
    [3, 2],
  ] as const) {
    it(`chapter ${chapter}, difficulty ${difficulty}: full run with random plans, bag and heat follow the hidden results, payout settles`, async () => {
      const s = CHAPTERS[chapter - 1];
      await unlock(chapter);
      await start(chapter, difficulty);
      let run = await k.runOf(me.address);
      expect(run.stage).to.eq(Stage.Playing);
      expect(run.favors).to.eq(DIFFS[difficulty].favors);
      expect(run.rumourReady).to.eq(false);
      expect(await totals()).to.deep.eq({ bag: 0, heat: 0 });

      const log: { team: number[]; tipped: boolean; gain: number; full: number }[] = [];
      for (let j = 0; j < s.jobs.length; j++) {
        const plan = randomPlan();
        const x = await playNext(me, plan);
        const full = gainOf(baseOf(s.jobs[j]), plan.bps);
        if (x.tipped) {
          expect(x.gain).to.eq(0);
          expect(x.heatUp).to.eq(s.jobs[j].hot ? 2 : 1);
        } else {
          expect(s.skimmer ? [full, Math.floor(full / 2)] : [full]).to.include(x.gain);
          expect(x.heatUp).to.eq(0);
        }
        log.push({ team: x.team, tipped: x.tipped, gain: x.gain, full });
        run = await k.runOf(me.address);
        expect(run.job).to.eq(j + 1);
        expect(run.rumourReady).to.eq(true);
        const present = range(0, s.crew).filter((m) => !has(Number(run.out), m));
        await rumour(present[Math.floor(Math.random() * present.length)]);
        expect((await k.runOf(me.address)).rumourReady).to.eq(false);
      }
      await expect(k.runJob(mask([0, 1]), 1, 10_000)).to.be.revertedWithCustomError(k, "NoJobsLeft");
      const { bag, heat } = await totals();

      const r = await finish();
      expect(r.heat).to.eq(heat);
      expect(r.payout).to.eq(heat >= 3 ? 0 : bag * DIFFS[difficulty].mult);
      if (s.skimmer) {
        expect(r.skimmer).to.be.lt(s.crew);
        expect(r.skimmer).to.not.eq(r.snitch);
        for (const x of log)
          if (!x.tipped) expect(x.gain).to.eq(x.team.includes(r.skimmer) ? Math.floor(x.full / 2) : x.full);
      }
      run = await k.runOf(me.address);
      expect(run.stage).to.eq(Stage.Settled);
      expect(await k.bestPayout(me.address, chapter)).to.be.gte(BigInt(r.payout));
      await expect(k.runJob(mask([0, 1]), 1, 10_000)).to.be.revertedWithCustomError(k, "WrongStage");
    });
  }
  it("catches the snitch with the wiretap and accusations: the bag doubles exactly once", async () => {
    await unlock(2);
    // tap now (job 2 is dark), then bank with a team outside the suspects
    let bag = 0;
    let hit = false;
    for (let i = 0; i < 60 && bag === 0; i++) {
      await start(2, 1);
      hit = await wiretap([0, 1]);
      await job(hit ? [3, 4] : [0, 1]);
      bag = (await totals()).bag;
    }
    expect(bag).to.eq(2_000);
    expect((await k.runOf(me.address)).wiretapUsed).to.eq(true);
    let heat = 0;

    let found = -1;
    for (const m of hit ? [0, 1] : [2, 3, 4, 5]) {
      const right = await accuse(m);
      const now = await totals();
      expect(now.bag).to.eq(right ? bag * 2 : bag);
      expect(now.heat).to.eq(right ? heat : heat + 1);
      expect(Number((await k.runOf(me.address)).out) & (1 << m)).to.not.eq(0);
      ({ bag, heat } = now);
      if (right) {
        found = m;
        break;
      }
    }
    expect(found, "the wiretap answer is exact").to.be.gte(0);
    expect(bag).to.eq(4_000);

    // the snitch is gone: accusing anyone else is wrong and never doubles again
    const outNow = Number((await k.runOf(me.address)).out);
    const innocent = range(0, 6).find((m) => (outNow & (1 << m)) === 0)!;
    expect(await accuse(innocent)).to.eq(false);
    expect((await totals()).bag).to.eq(4_000);
    heat += 1;

    const r = await finish();
    expect(r.snitch).to.eq(found);
    expect(r.heat).to.eq(heat);
    expect(r.payout).to.eq(heat >= 3 ? 0 : 4_000 * 2);
  });

  it("a caught snitch never tips again; tails and the wiretap match the revealed snitch", async () => {
    await unlock(2);
    let tipsAfter = 0;
    let jobsAfter = 0;
    for (let i = 0; i < 12; i++) {
      await start(2, 0);
      const pair = shuffled(range(0, 6)).slice(0, 2);
      const hit = await wiretap(pair);
      // accuse inside the tapped set until right
      let found = -1;
      for (const m of hit ? pair : range(0, 6).filter((x) => !pair.includes(x))) {
        if (await accuse(m)) {
          found = m;
          break;
        }
      }
      expect(found).to.be.gte(0);
      const { j, crew, out } = await nextJob();
      const present = range(0, crew).filter((m) => !has(out, m) && !has(j.ban, m));
      if (present.length >= j.team) {
        jobsAfter++;
        if (await job(pickTeam(j, crew, out))) tipsAfter++;
      }
      const r = await finish();
      expect(r.snitch).to.eq(found);
      expect(pair.includes(r.snitch)).to.eq(hit);
    }
    // only bad luck (1/8) is left: far below the 3/4 of a live snitch
    expect(jobsAfter).to.be.gte(6);
    expect(tipsAfter / jobsAfter).to.be.lte(0.6);
  });
  it("a wrong accusation adds heat, removes the member and leaves the bag alone", async () => {
    await start(1, 0);
    const tipped = await job([3, 4]);
    let { bag, heat } = await totals();
    expect(bag).to.eq(tipped ? 0 : 1_000);
    let wrongs = 0;
    for (const m of [0, 1]) {
      const right = await accuse(m);
      const now = await totals();
      if (!right) {
        wrongs++;
        expect(now.heat).to.eq(heat + 1);
        expect(now.bag).to.eq(bag);
      } else {
        expect(now.heat).to.eq(heat);
        expect(now.bag).to.eq(bag * 2);
      }
      ({ bag, heat } = now);
    }
    expect(wrongs).to.be.gte(1);
    const run = await k.runOf(me.address);
    expect(run.out).to.eq(0b11);
    // members who left cannot be used again
    await expect(k.accuse(0)).to.be.revertedWithCustomError(k, "BadMember");
    await expect(k.tail(1)).to.be.revertedWithCustomError(k, "BadMember");
    await expect(k.rumour(1)).to.be.revertedWithCustomError(k, "BadMember");
    await expect(k.runJob(mask([0, 2]), 1, 10_000)).to.be.revertedWithCustomError(k, "BadTeam");
    // job 2 needs member 0, who is out: the requirement lapses
    await job([2, 3]);
  });

  it("a raid (heat >= 3) pays nothing and earns no star", async () => {
    await start(1, 2);
    await job([0, 1]);
    for (const m of [0, 1, 2, 3]) await accuse(m); // at least three of them are innocent
    const { heat } = await totals();
    expect(heat).to.be.gte(3);
    const r = await finish();
    expect(r.heat).to.eq(heat);
    expect(r.payout).to.eq(0);
    expect(r.stars).to.eq(0);
    expect(await k.bestStars(me.address, 1)).to.eq(0n);
    expect(await k.totalScore(me.address)).to.eq(0n);
    expect(await k.runsSettled(me.address)).to.eq(1n);
  });
  it("chapter 3: the skimmer halves the take when on the team, and is never the snitch", async () => {
    await unlock(3);
    const s = CHAPTERS[2];
    let halves = 0;
    let fulls = 0;
    const skimmers = new Set<number>();
    for (let i = 0; i < 60 && (i < 8 || !halves || !fulls || skimmers.size < 2); i++) {
      await start(3, 0);
      const seen: { team: number[]; gain: number; tipped: boolean; take: number }[] = [];
      for (let j = 0; j < 2; j++) {
        const x = await playNext();
        seen.push({ team: x.team, gain: x.gain, tipped: x.tipped, take: s.jobs[j].take });
      }
      const r = await finish();
      expect(r.skimmer).to.be.lt(6);
      expect(r.skimmer).to.not.eq(r.snitch);
      skimmers.add(r.skimmer);
      for (const x of seen) {
        if (x.tipped) {
          expect(x.gain).to.eq(0);
        } else if (x.team.includes(r.skimmer)) {
          expect(x.gain).to.eq(x.take / 2);
          halves++;
        } else {
          expect(x.gain).to.eq(x.take);
          fulls++;
        }
      }
    }
    expect(halves).to.be.gte(1);
    expect(fulls).to.be.gte(1);
    expect(skimmers.size).to.be.gte(2);
  });
  it("need and ban: required members must go unless out, banned members never go", async () => {
    await start(1, 0);
    await job([0, 1]);
    // job 2 needs member 0
    await expect(k.runJob(mask([1, 2]), 1, 10_000)).to.be.revertedWithCustomError(k, "BadTeam");
    await job([0, 2]);
    // job 3 needs member 1; once member 1 is out the requirement lapses
    await expect(k.runJob(mask([0, 2, 3]), 1, 10_000)).to.be.revertedWithCustomError(k, "BadTeam");
    await accuse(1);
    await job([0, 2, 3]);
    await job([0, 3, 4]);
    // job 5 bans member 2
    await expect(k.runJob(mask([2, 3, 4]), 1, 10_000)).to.be.revertedWithCustomError(k, "BadTeam");
    await expect(k.runJob(mask([0, 2, 3]), 1, 10_000)).to.be.revertedWithCustomError(k, "BadTeam");
    await job([0, 3, 4]);
    // job 6 needs member 1 (out): the four who are left go
    await job([0, 2, 3, 4]);
    expect((await k.runOf(me.address)).job).to.eq(6);

    // Uptown: job 1 bans member 2, job 5 needs member 5
    await unlock(2);
    await start(2, 0);
    await expect(k.runJob(mask([2, 3]), 1, 10_000)).to.be.revertedWithCustomError(k, "BadTeam");
    await expect(k.runJob(mask([0, 2]), 1, 10_000)).to.be.revertedWithCustomError(k, "BadTeam");
    for (let j = 0; j < 4; j++) await playNext();
    await expect(k.runJob(mask([0, 1, 2]), 1, 10_000)).to.be.revertedWithCustomError(k, "BadTeam");
    await job([0, 1, 5]);
  });

  it("hot: the base take doubles and a tipped hot job adds two heat", async () => {
    await unlock(2);
    let clean = 0;
    let tipped = 0;
    for (let i = 0; i < 30 && (!clean || !tipped); i++) {
      await start(2, 0);
      for (let j = 0; j < 3; j++) {
        const x = await playNext(me, { rung: 0, bps: 10_000 });
        expect(x.heatUp).to.eq(x.tipped ? 1 : 0); // not hot
      }
      expect((await nextJob()).j.hot).to.eq(true);
      const x = await playNext(me, { rung: 3, bps: 10_000 }); // bad luck 1/2
      if (x.tipped) {
        tipped++;
        expect(x.gain).to.eq(0);
        expect(x.heatUp).to.eq(2);
      } else {
        clean++;
        expect(x.gain).to.eq(24_000);
        expect(x.heatUp).to.eq(0);
      }
    }
    expect(clean).to.be.gte(1);
    expect(tipped).to.be.gte(1);
  });

  it("dark: no tail or wiretap while the next job is dark, rumours still allowed, lights back on after", async () => {
    await unlock(2);
    await start(2, 0);
    await tail(0); // job 1 is not dark
    await job([0, 1]);
    expect((await nextJob()).j.dark).to.eq(true);
    await expect(k.tail(3)).to.be.revertedWithCustomError(k, "Blackout");
    await expect(k.wiretap(mask([3, 4]))).to.be.revertedWithCustomError(k, "Blackout");
    await rumour(3);
    await accuse(5); // accusing is fine in the dark
    await job([0, 1, 2]);
    await tail(3);
    await wiretap([3, 4]);

    // The Docks: job 4 is dark
    await unlock(3);
    await start(3, 0);
    for (let j = 0; j < 3; j++) await playNext();
    await expect(k.tail(0)).to.be.revertedWithCustomError(k, "Blackout");
    await expect(k.wiretap(mask([0, 1]))).to.be.revertedWithCustomError(k, "Blackout");
    await playNext();
    await tail(0);
    await wiretap([0, 1]);
  });

  it("plan bounds: rung 0..3, takeBps 2000..25000 and the greed rule", async () => {
    await start(1, 0);
    const t = mask([0, 1]);
    for (const [rung, bps] of [
      [4, 10_000],
      [255, 10_000],
      [1, 1_999],
      [1, 0],
      [1, 25_001],
      [2, 25_001],
      [3, 25_001],
      [0, 15_001],
      [1, 20_001],
      [3, 65_535],
    ])
      await expect(k.runJob(t, rung, bps), `rung ${rung} bps ${bps}`).to.be.revertedWithCustomError(k, "BadPlan");
    // a bad plan never moves the run
    expect((await k.runOf(me.address)).job).to.eq(0);
    const r = await send(k.runJob(t, 0, 15_000, { gasLimit: GAS }), "runJob");
    const ev = eventArgs(r, "JobRun");
    expect([ev.rung, ev.takeBps]).to.deep.eq([0n, 15_000n]);
    await job([0, 2], me, { rung: 1, bps: 20_000 });
    await job([0, 1, 2], me, { rung: 2, bps: 25_000 });
    await job([0, 1, 2], me, { rung: 3, bps: 25_000 });
    await job([0, 1, 3], me, { rung: 0, bps: 2_000 });
    expect((await k.runOf(me.address)).job).to.eq(5);
  });

  it("takeBps scales the bag exactly", async () => {
    for (const plan of [
      { rung: 0, bps: 5_000 },
      { rung: 0, bps: 15_000 },
      { rung: 0, bps: 2_000 },
      { rung: 1, bps: 12_345 },
      { rung: 2, bps: 25_000 },
    ]) {
      let done = false;
      for (let i = 0; i < 30 && !done; i++) {
        await start(1, 0);
        const tipped = await job([0, 1], me, plan);
        if (!tipped) {
          expect((await totals()).bag, `bps ${plan.bps}`).to.eq(gainOf(1_000, plan.bps));
          done = true;
        }
      }
      expect(done).to.eq(true);
    }
  });
  it("rumour: free, once after each job, members still in only", async () => {
    await expect(k.rumour(0)).to.be.revertedWithCustomError(k, "WrongStage");
    await start(1, 0);
    await expect(k.rumour(0)).to.be.revertedWithCustomError(k, "NoRumour"); // before any job
    await job([0, 1]);
    expect((await k.runOf(me.address)).rumourReady).to.eq(true);
    await expect(k.rumour(5)).to.be.revertedWithCustomError(k, "BadMember");
    const favors = (await k.runOf(me.address)).favors;
    const r = await send(k.rumour(2, { gasLimit: GAS }), "rumour");
    const ev = eventArgs(r, "Rumoured");
    const h = await k.handlesOf(me.address);
    expect([ev.player, ev.run, ev.member, ev.heard]).to.deep.eq([me.address, 1n, 2n, h.heard]);
    expect(h.heard).to.not.eq(ZERO);
    const run = await k.runOf(me.address);
    expect(run.favors).to.eq(favors); // free
    expect(run.rumourReady).to.eq(false);
    await expect(k.rumour(3)).to.be.revertedWithCustomError(k, "NoRumour"); // once per job
    await tail(3); // tails do not refill it
    await expect(k.rumour(3)).to.be.revertedWithCustomError(k, "NoRumour");
    await accuse(4);
    await expect(k.rumour(3)).to.be.revertedWithCustomError(k, "NoRumour");
    await job([0, 2]);
    await expect(k.rumour(4)).to.be.revertedWithCustomError(k, "BadMember"); // out
    await rumour(3);
    await expect(k.rumour(0)).to.be.revertedWithCustomError(k, "NoRumour");
    // an unused rumour does not carry over to a new run
    await job([0, 1, 2]);
    await start(1, 0);
    expect((await k.runOf(me.address)).rumourReady).to.eq(false);
    expect((await k.handlesOf(me.address)).heard).to.eq(ZERO);
    await expect(k.rumour(0)).to.be.revertedWithCustomError(k, "NoRumour");
    await walk();
    await expect(k.rumour(0)).to.be.revertedWithCustomError(k, "WrongStage");
  });
  it("statistics: the snitch tips most jobs it is on, clean teams rarely fail, tails and rumours are mostly right, the snitch is spread", async () => {
    const RUNS = 50;
    const withS = { n: 0, tipped: 0 };
    const without = { n: 0, tipped: 0 };
    const tails = { n: 0, right: 0 };
    const rumours = { n: 0, right: 0 };
    const snitches = new Map<number, number>();
    for (let i = 0; i < RUNS; i++) {
      await start(1, 0);
      const tailed: [number, boolean][] = [];
      for (const m of shuffled(range(0, 5)).slice(0, 3)) tailed.push([m, await tail(m)]);
      const heard: [number, boolean][] = [];
      const jobs: [number[], boolean][] = [];
      for (let j = 0; j < CHAPTERS[0].jobs.length; j++) {
        const x = await playNext();
        jobs.push([x.team, x.tipped]);
        const m = Math.floor(Math.random() * 5);
        heard.push([m, await rumour(m)]);
      }
      const r = await finish();
      snitches.set(r.snitch, (snitches.get(r.snitch) ?? 0) + 1);
      for (const [m, seen] of tailed) {
        tails.n++;
        if (seen === (m === r.snitch)) tails.right++;
      }
      for (const [m, seen] of heard) {
        rumours.n++;
        if (seen === (m === r.snitch)) rumours.right++;
      }
      for (const [members, tipped] of jobs) {
        const b = members.includes(r.snitch) ? withS : without;
        b.n++;
        if (tipped) b.tipped++;
      }
    }
    const pWith = withS.tipped / withS.n;
    const pWithout = without.tipped / without.n;
    console.log(
      `    tipped with snitch ${withS.tipped}/${withS.n} (${pWith.toFixed(2)}, expected 0.78) · without ${without.tipped}/${without.n} (${pWithout.toFixed(2)}, expected 0.13) · tails right ${tails.right}/${tails.n} (expected 0.88) · rumours right ${rumours.right}/${rumours.n} (expected 0.88) · snitch spread ${JSON.stringify([...snitches.entries()].sort())}`,
    );
    expect(withS.n).to.be.gte(40);
    expect(without.n).to.be.gte(40);
    expect(pWith).to.be.gte(0.55);
    expect(pWithout).to.be.lte(0.35);
    expect(pWith - pWithout).to.be.gte(0.3);
    expect(tails.right / tails.n).to.be.gte(0.7);
    expect(rumours.right / rumours.n).to.be.gte(0.7);
    expect(Math.abs(rumours.right / rumours.n - tails.right / tails.n)).to.be.lte(0.15);
    expect(snitches.size).to.be.gte(4);
    expect(Math.max(...snitches.values())).to.be.lte(RUNS / 2);
  });

  it("statistics: the rung sets the bad-luck rate (1/16 at rung 0, 1/2 at rung 3)", async () => {
    const RUNS = 30;
    const low = { n: 0, tipped: 0 };
    const high = { n: 0, tipped: 0 };
    for (let i = 0; i < RUNS; i++) {
      await start(1, 0);
      const jobs: [number[], boolean, number][] = [];
      for (let j = 0; j < CHAPTERS[0].jobs.length; j++) {
        const rung = (i + j) % 2 === 0 ? 0 : 3;
        const x = await playNext(me, { rung, bps: 10_000 });
        jobs.push([x.team, x.tipped, rung]);
      }
      const r = await finish();
      // only jobs without the snitch: their tips are pure bad luck
      for (const [members, tipped, rung] of jobs) {
        if (members.includes(r.snitch)) continue;
        const b = rung === 0 ? low : high;
        b.n++;
        if (tipped) b.tipped++;
      }
    }
    const pLow = low.tipped / low.n;
    const pHigh = high.tipped / high.n;
    console.log(
      `    bad luck rung 0 ${low.tipped}/${low.n} (${pLow.toFixed(2)}, expected 0.06) · rung 3 ${high.tipped}/${high.n} (${pHigh.toFixed(2)}, expected 0.50)`,
    );
    expect(low.n).to.be.gte(20);
    expect(high.n).to.be.gte(20);
    expect(pLow).to.be.lte(0.25);
    expect(pHigh).to.be.gte(0.25);
    expect(pHigh - pLow).to.be.gte(0.2);
  });
  it("keeps the run private: only the player reads results, nothing is public before walkAway", async () => {
    await unlock(2);
    await start(2, 0);
    await tail(2);
    await wiretap([2, 3]); // before job 1: job 2 is dark
    await job([0, 1]);
    await rumour(3);
    await accuse(4);
    const h = await k.handlesOf(me.address);
    for (const x of [h.tipped, h.seen, h.tapped, h.right, h.heard]) {
      expect(x).to.not.eq(ZERO);
      await dBool(x, me);
      await expect(fhevm.userDecryptEbool(x, addr, other)).to.be.rejected;
      await expect(fhevm.publicDecrypt([x])).to.be.rejected;
    }
    await expect(fhevm.userDecryptEuint(FhevmType.euint32, h.bag, addr, other)).to.be.rejected;
    await expect(fhevm.userDecryptEuint(FhevmType.euint8, h.heat, addr, other)).to.be.rejected;
    await expect(fhevm.publicDecrypt([h.bag])).to.be.rejected;
    await expect(fhevm.publicDecrypt([h.heat])).to.be.rejected;
    await expect(k.revealHandles(me.address)).to.be.revertedWithCustomError(k, "WrongStage");

    await walk();
    const hs = [...(await k.revealHandles(me.address))];
    expect(hs.length).to.eq(5);
    await fhevm.publicDecrypt(hs); // now public
    // the bag itself and the per-action results stay private after the run
    await expect(fhevm.publicDecrypt([h.tipped])).to.be.rejected;
    await expect(fhevm.publicDecrypt([h.heard])).to.be.rejected;
    await expect(fhevm.userDecryptEbool(h.right, addr, other)).to.be.rejected;
    await expect(fhevm.userDecryptEbool(h.heard, addr, other)).to.be.rejected;
  });

  it("handlesOf starts with fresh totals and empty results; events carry the same handles", async () => {
    await start(1, 0);
    let h = await k.handlesOf(me.address);
    expect([h.tipped, h.seen, h.tapped, h.right, h.heard]).to.deep.eq([ZERO, ZERO, ZERO, ZERO, ZERO]);
    expect(h.bag).to.not.eq(ZERO);
    expect(h.heat).to.not.eq(ZERO);
    const r = await send(k.runJob(mask([0, 1]), 2, 12_500, { gasLimit: GAS }), "runJob");
    h = await k.handlesOf(me.address);
    const ev = eventArgs(r, "JobRun");
    expect([ev.job, ev.team, ev.rung, ev.takeBps]).to.deep.eq([0n, 3n, 2n, 12_500n]);
    expect([ev.tipped, ev.bag, ev.heat]).to.deep.eq([h.tipped, h.bag, h.heat]);
    await expect(k.tail(2)).to.emit(k, "Tailed");
    await expect(k.rumour(2)).to.emit(k, "Rumoured");
    await expect(k.accuse(2)).to.emit(k, "Accused");
    await expect(k.walkAway()).to.emit(k, "WalkedAway");
  });
  it("rejects bad plaintext input on every action", async () => {
    await expect(k.runJob(3, 1, 10_000)).to.be.revertedWithCustomError(k, "WrongStage");
    await expect(k.tail(0)).to.be.revertedWithCustomError(k, "WrongStage");
    await expect(k.rumour(0)).to.be.revertedWithCustomError(k, "WrongStage");
    await expect(k.wiretap(3)).to.be.revertedWithCustomError(k, "WrongStage");
    await expect(k.accuse(0)).to.be.revertedWithCustomError(k, "WrongStage");
    await expect(k.walkAway()).to.be.revertedWithCustomError(k, "WrongStage");
    await expect(k.settle(me.address, "0x", "0x")).to.be.revertedWithCustomError(k, "WrongStage");
    await expect(k.start(0, 0)).to.be.revertedWithCustomError(k, "BadChapter");
    await expect(k.start(4, 0)).to.be.revertedWithCustomError(k, "BadChapter");
    await expect(k.start(1, 3)).to.be.revertedWithCustomError(k, "BadDifficulty");
    await expect(k.chapterOf(0)).to.be.revertedWithCustomError(k, "BadChapter");
    await expect(k.chapterOf(4)).to.be.revertedWithCustomError(k, "BadChapter");
    await expect(k.difficultyOf(3)).to.be.revertedWithCustomError(k, "BadDifficulty");
    await expect(k.start(2, 0)).to.be.revertedWithCustomError(k, "ChapterLocked");
    await expect(k.start(3, 0)).to.be.revertedWithCustomError(k, "ChapterLocked");

    // chapter 1, Kingpin: one favor, no wiretap, first job takes two of five
    await start(1, 2);
    await expect(k.runJob(mask([0]), 1, 10_000)).to.be.revertedWithCustomError(k, "BadTeam"); // too few
    await expect(k.runJob(mask([0, 1, 2]), 1, 10_000)).to.be.revertedWithCustomError(k, "BadTeam"); // too many
    await expect(k.runJob(0, 1, 10_000)).to.be.revertedWithCustomError(k, "BadTeam"); // empty
    await expect(k.runJob(mask([0, 5]), 1, 10_000)).to.be.revertedWithCustomError(k, "BadTeam"); // no member 5
    await expect(k.runJob(mask([4, 15]), 1, 10_000)).to.be.revertedWithCustomError(k, "BadTeam");
    await expect(k.tail(5)).to.be.revertedWithCustomError(k, "BadMember");
    await expect(k.accuse(5)).to.be.revertedWithCustomError(k, "BadMember");
    await expect(k.wiretap(mask([0, 1]))).to.be.revertedWithCustomError(k, "NoWiretap");
    await tail(0);
    expect((await k.runOf(me.address)).favors).to.eq(0);
    await expect(k.tail(1)).to.be.revertedWithCustomError(k, "NoFavorsLeft");
    await accuse(4);
    await expect(k.runJob(mask([3, 4]), 1, 10_000)).to.be.revertedWithCustomError(k, "BadTeam"); // member out
    await expect(k.tail(4)).to.be.revertedWithCustomError(k, "BadMember");
    await expect(k.accuse(4)).to.be.revertedWithCustomError(k, "BadMember");
    await walk();
    const actions = [
      () => k.runJob(3, 1, 10_000),
      () => k.tail(0),
      () => k.rumour(0),
      () => k.wiretap(3),
      () => k.accuse(0),
      () => k.walkAway(),
    ];
    for (const f of actions) await expect(f()).to.be.revertedWithCustomError(k, "WrongStage");
    await settle();
    for (const f of actions) await expect(f()).to.be.revertedWithCustomError(k, "WrongStage");
  });

  it("wiretap: exactly two present members, once per run, only where available", async () => {
    await unlock(2);
    await start(2, 0);
    await accuse(5);
    await expect(k.wiretap(mask([0]))).to.be.revertedWithCustomError(k, "BadPair");
    await expect(k.wiretap(mask([0, 1, 2]))).to.be.revertedWithCustomError(k, "BadPair");
    await expect(k.wiretap(0)).to.be.revertedWithCustomError(k, "BadPair");
    await expect(k.wiretap(mask([0, 6]))).to.be.revertedWithCustomError(k, "BadPair"); // no member 6
    await expect(k.wiretap(mask([0, 5]))).to.be.revertedWithCustomError(k, "BadPair"); // member out
    const favors = (await k.runOf(me.address)).favors;
    await wiretap([0, 1]);
    expect((await k.runOf(me.address)).favors).to.eq(favors); // free of favors
    await expect(k.wiretap(mask([2, 3]))).to.be.revertedWithCustomError(k, "WiretapUsed");
    // a new run gets a new wiretap; chapter 1 has none
    await start(2, 0);
    await wiretap([2, 3]);
    await start(1, 0);
    await expect(k.wiretap(mask([0, 1]))).to.be.revertedWithCustomError(k, "NoWiretap");
  });

  it("favors per difficulty: 3 / 2 / 1 tails", async () => {
    for (let d = 0; d < 3; d++) {
      await start(1, d);
      for (let i = 0; i < DIFFS[d].favors; i++) await tail(i);
      await expect(k.tail(4)).to.be.revertedWithCustomError(k, "NoFavorsLeft");
    }
  });
  it("settles once, only with the matching proof in the stored order", async () => {
    await start(1, 1, other);
    await job([0, 1], other);
    await walk(other);
    const theirs = await fhevm.publicDecrypt([...(await k.revealHandles(other.address))]);

    await start(1, 1);
    await job([0, 1]);
    await job([0, 2]);
    await expect(
      k.settle(me.address, theirs.abiEncodedClearValues, theirs.decryptionProof),
    ).to.be.revertedWithCustomError(k, "WrongStage"); // still playing
    await walk();
    const hs = [...(await k.revealHandles(me.address))];
    // someone else's proof does not settle my run
    await expect(k.settle(me.address, theirs.abiEncodedClearValues, theirs.decryptionProof)).to.be.reverted;
    // wrong order is rejected
    for (const order of [
      [1, 0, 2, 3, 4],
      [0, 2, 1, 3, 4],
      [2, 1, 0, 3, 4],
    ]) {
      const swapped = await fhevm.publicDecrypt(order.map((i) => hs[i]));
      await expect(k.settle(me.address, swapped.abiEncodedClearValues, swapped.decryptionProof)).to.be.reverted;
    }
    // a subset is rejected
    const partial = await fhevm.publicDecrypt(hs.slice(0, 2));
    await expect(k.settle(me.address, partial.abiEncodedClearValues, partial.decryptionProof)).to.be.reverted;
    // forged clear values with the genuine proof are rejected
    const good = await fhevm.publicDecrypt(hs);
    const real = decodeClears(good.abiEncodedClearValues);
    const forged = ethers.AbiCoder.defaultAbiCoder().encode(["uint32", "uint8", "uint8", "uint8", "uint8"], [999_999, real.snitch, 0, real.skimmer, real.second]);
    await expect(k.settle(me.address, forged, good.decryptionProof)).to.be.reverted;
    await expect(k.settle(me.address, good.abiEncodedClearValues, "0x")).to.be.reverted;
    expect((await k.runOf(me.address)).stage).to.eq(Stage.Ended);
    expect(await k.runsSettled(me.address)).to.eq(0n);

    const r = await settle();
    expect(r.payout).to.eq(real.payout);
    expect(await k.runsSettled(me.address)).to.eq(1n);
    const score = await k.totalScore(me.address);
    await expect(k.settle(me.address, good.abiEncodedClearValues, good.decryptionProof)).to.be.revertedWithCustomError(
      k,
      "WrongStage",
    );
    expect(await k.totalScore(me.address)).to.eq(score);
    expect(await k.runsSettled(me.address)).to.eq(1n);
    // the other run is untouched and still settles with its own proof
    expect((await k.runOf(other.address)).stage).to.eq(Stage.Ended);
    await settle(other);
  });

  it("chapter 3 settles against all five handles (skimmer, then second)", async () => {
    await unlock(3);
    await start(3, 1);
    await job([0, 1]);
    await walk();
    const hs = [...(await k.revealHandles(me.address))];
    expect(hs.length).to.eq(5);
    const four = await fhevm.publicDecrypt(hs.slice(0, 4));
    await expect(k.settle(me.address, four.abiEncodedClearValues, four.decryptionProof)).to.be.reverted;
    const swapped = await fhevm.publicDecrypt([hs[0], hs[3], hs[2], hs[1], hs[4]]);
    await expect(k.settle(me.address, swapped.abiEncodedClearValues, swapped.decryptionProof)).to.be.reverted;
    const r = await settle();
    expect(r.skimmer).to.not.eq(r.snitch);
    expect(r.second).to.eq(255);
  });
  it("stars: 0 for nothing, 1 for any cash, 2 from 40% of the chapter total, 3 from the full total; bests are kept", async () => {
    const tot = total(1); // 38,000: two stars from 15,200
    expect(starsFor(15_199, tot)).to.eq(1);
    expect(starsFor(15_200, tot)).to.eq(2);
    expect(starsFor(37_999, tot)).to.eq(2);
    expect(starsFor(38_000, tot)).to.eq(3);

    // walking away at once: nothing
    await start(1, 0);
    expect((await finish()).stars).to.eq(0);
    expect(await k.totalStars(me.address)).to.eq(0n);

    // first job only: $1,000 -> one star
    let r = { stars: 0, bag: 0, payout: 0, heat: 0 };
    for (let i = 0; i < 60 && r.stars === 0; i++) {
      await start(1, 0);
      await job([0, 1]);
      r = await finish();
    }
    expect(r).to.include({ stars: 1, bag: 1_000 });
    expect(await k.bestStars(me.address, 1)).to.eq(1n);
    expect(await k.totalStars(me.address)).to.eq(1n);

    // bench the suspect, run safe greedy plans, accuse at the end for three stars
    const seenStars = new Set<number>();
    let bestBag = 1_000;
    let bestPayout = 1_000;
    let bestStars = 1;
    for (let i = 0; i < 150 && !(seenStars.has(2) && seenStars.has(3)); i++) {
      const difficulty = seenStars.has(2) ? 0 : i % 2; // also exercise the x2 multiplier
      await start(1, difficulty);
      let suspect = 3;
      for (let m = DIFFS[difficulty].favors - 1; m >= 0; m--) if (await tail(m)) suspect = m;
      for (let j = 0; j < CHAPTERS[0].jobs.length; j++) await playNext(me, { rung: 0, bps: 15_000 }, [suspect]);
      if (seenStars.has(2)) await accuse(suspect);
      r = await finish();
      seenStars.add(r.stars);
      expect(r.payout).to.eq(r.heat >= 3 ? 0 : r.bag * DIFFS[difficulty].mult);
      bestBag = Math.max(bestBag, r.bag);
      bestPayout = Math.max(bestPayout, r.payout);
      bestStars = Math.max(bestStars, r.stars);
      expect(await k.bestStars(me.address, 1)).to.eq(BigInt(bestStars));
      expect(await k.bestBag(me.address, 1)).to.eq(BigInt(bestBag));
      expect(await k.bestPayout(me.address, 1)).to.eq(BigInt(bestPayout));
    }
    expect(seenStars.has(2), "a two-star run").to.eq(true);
    expect(seenStars.has(3), "a three-star run").to.eq(true);
    expect(bestBag).to.be.gte(tot);

    // a worse run afterwards changes nothing
    await start(1, 0);
    expect((await finish()).stars).to.eq(0);
    const best = await k.bestOf(me.address);
    expect(best.stars.map(Number)).to.deep.eq([3, 0, 0]);
    expect(best.bags.map(Number)).to.deep.eq([bestBag, 0, 0]);
    expect(best.payouts.map(Number)).to.deep.eq([bestPayout, 0, 0]);
    expect(await k.totalStars(me.address)).to.eq(3n);
    expect(await k.totalScore(me.address)).to.eq(BigInt(bestPayout));
  });
  it("a chapter unlocks with one star on the previous one; totals add up across chapters", async () => {
    await expect(k.start(2, 0)).to.be.revertedWithCustomError(k, "ChapterLocked");
    await earnStar(1);
    await expect(k.start(3, 0)).to.be.revertedWithCustomError(k, "ChapterLocked");
    await earnStar(2);
    await start(3, 0);
    // stars are per player
    await expect(k.connect(other).start(2, 0)).to.be.revertedWithCustomError(k, "ChapterLocked");
    const best = await k.bestOf(me.address);
    expect(best.stars.map(Number)).to.deep.eq([1, 1, 0]);
    expect(best.payouts.map(Number)).to.deep.eq([1_000, 2_000, 0]);
    expect(await k.totalStars(me.address)).to.eq(2n);
    expect(await k.totalScore(me.address)).to.eq(3_000n);
  });

  it("a new start replaces the run in progress", async () => {
    await start(1, 0);
    await job([0, 1]);
    await rumour(2);
    await tail(0);
    await accuse(4);
    await job([0, 2]);
    const before = await k.handlesOf(me.address);
    await start(1, 2);
    const run = await k.runOf(me.address);
    expect([run.run, run.chapter, run.difficulty, run.job, run.favors, run.out].map(Number)).to.deep.eq([
      2, 1, 2, 0, 1, 0,
    ]);
    expect(run.wiretapUsed).to.eq(false);
    expect(run.rumourReady).to.eq(false);
    expect(run.stage).to.eq(Stage.Playing);
    const h = await k.handlesOf(me.address);
    expect([h.tipped, h.seen, h.tapped, h.right, h.heard]).to.deep.eq([ZERO, ZERO, ZERO, ZERO, ZERO]);
    expect(h.bag).to.not.eq(before.bag);
    expect(await totals()).to.deep.eq({ bag: 0, heat: 0 });
    // an ended, unsettled run can also be replaced, and its old proof no longer settles
    await walk();
    const old = await fhevm.publicDecrypt([...(await k.revealHandles(me.address))]);
    await start(1, 0);
    await walk();
    await expect(k.settle(me.address, old.abiEncodedClearValues, old.decryptionProof)).to.be.reverted;
    await settle();
  });

  it("only the owner adds chapters, within bounds; a new chapter is playable at the euint32 limit", async () => {
    type Row = [number, number, number, number[], number[]]; // team, take, flags, need, ban
    const add = (name: string, crew: number, rows: Row[], skimmer = false, wiretap = false, who = me, rules = 0, recruitAt = 0) =>
      k.connect(who).addChapter(
        name,
        crew,
        rows.map((r) => r[0]),
        rows.map((r) => r[1]),
        rows.map((r) => r[2]),
        rows.map((r) => mask(r[3])),
        rows.map((r) => mask(r[4])),
        skimmer,
        wiretap,
        rules,
        recruitAt,
      );
    const bad = (p: Promise<unknown>) => expect(p).to.be.revertedWithCustomError(k, "BadChapter");
    await expect(add("X", 7, [[2, 100, 0, [], []]], false, false, other)).to.be.revertedWithCustomError(k, "NotOwner");
    await bad(add("X", 2, [[1, 100, 0, [], []]])); // crew too small
    await bad(add("X", 17, [[2, 100, 0, [], []]])); // crew too big
    await bad(add("X", 7, [])); // no jobs
    for (const lens of [
      [2, 1, 1, 1, 1],
      [1, 2, 1, 1, 1],
      [1, 1, 2, 1, 1],
      [1, 1, 1, 2, 1],
      [1, 1, 1, 1, 2],
    ])
      await bad(
        k.addChapter(
          "X",
          7,
          Array(lens[0]).fill(2),
          Array(lens[1]).fill(100),
          Array(lens[2]).fill(0),
          Array(lens[3]).fill(0),
          Array(lens[4]).fill(0),
          false,
          false,
          0,
          0,
        ),
      ); // length mismatch
    await bad(add("X", 7, [[7, 100, 0, [], []]])); // whole crew
    const two: Row[] = [
      [2, 100, 0, [], []],
      [2, 100, 0, [], []],
    ];
    await bad(add("X", 7, two, false, false, me, 16)); // unknown rule
    await bad(add("X", 7, two, true, false, me, 1)); // two snitches and a skimmer
    await bad(add("X", 7, two, true, false, me, 2, 1)); // a recruit and a skimmer
    await bad(add("X", 7, two, false, false, me, 3, 1)); // two snitches and a recruit
    await bad(add("X", 7, two, false, false, me, 2, 0)); // recruit at the first job
    await bad(add("X", 7, two, false, false, me, 2, 2)); // recruit after the last job
    await bad(add("X", 7, two, false, false, me, 0, 1)); // recruitAt without the rule
    await bad(add("X", 7, [[0, 100, 0, [], []]])); // empty team
    await bad(add("X", 7, [[2, 0, 0, [], []]])); // no take
    await bad(add("X", 7, [[2, 100, 4, [], []]])); // unknown flag
    await bad(add("X", 7, [[2, 100, 0, [7], []]])); // need outside the crew
    await bad(add("X", 7, [[2, 100, 0, [], [7]]])); // ban outside the crew
    await bad(add("X", 7, [[2, 100, 0, [1], [1]]])); // need and ban overlap
    await bad(add("X", 7, [[2, 100, 0, [0, 1, 2], []]])); // more required members than seats
    await bad(add("X", 7, [[3, 100, 0, [], [0, 1, 2, 3, 4]]])); // not enough members left
    await bad(
      add("X", 7, [
        [2, 150_000_000, 0, [], []],
        [2, 100_000_001, 0, [], []],
      ]),
    ); // could overflow euint32
    await bad(add("X", 7, [[2, 125_000_001, 1, [], []]])); // a hot take counts twice
    await bad(
      add(
        "X",
        7,
        range(0, 9).map(() => [2, 5, 0, [], []] as Row),
      ),
    ); // too many jobs
    expect(await k.chapterCount()).to.eq(3n);

    // the largest allowed economy on the widest crew: the top plan, doubling and x3 still fit euint32
    await expect(
      add(
        "The Vault",
        16,
        [
          [2, 100_000_000, 0, [], [15]],
          [2, 75_000_000, 1, [0], []],
        ],
        true,
        true,
      ),
    ).to.emit(k, "ChapterAdded");
    expect(await k.chapterCount()).to.eq(4n);
    const v = await k.chapterOf(4);
    expect(v.total).to.eq(250_000_000n);
    expect(v.jobs.map(toSpec)).to.deep.eq([
      { team: 2, take: 100_000_000, hot: false, dark: false, need: 0, ban: 1 << 15 },
      { team: 2, take: 75_000_000, hot: true, dark: false, need: 1, ban: 0 },
    ]);
    await unlock(4);
    const top = { rung: 2, bps: 25_000 };
    let done = false;
    for (let i = 0; i < 60 && !done; i++) {
      await start(4, 2);
      const a = await job([0, 1], me, top);
      const b = await job([0, 2], me, top);
      const { bag } = await totals();
      // find the snitch by accusing: up to two wrong guesses keep the heat below a raid
      let caught = false;
      let wrong = 0;
      for (let m = 15; m >= 3 && !caught && wrong < 2 && !a && !b; m--) {
        caught = await accuse(m);
        if (!caught) wrong++;
      }
      const r = await finish();
      expect(r.skimmer).to.be.lt(16);
      expect(r.skimmer).to.not.eq(r.snitch);
      expect(r.payout).to.eq(r.heat >= 3 ? 0 : (caught ? bag * 2 : bag) * 3);
      if (!a && !b && ![0, 1, 2].includes(r.skimmer)) {
        expect(bag).to.eq(625_000_000);
        expect(r.payout).to.eq((caught ? 1_250_000_000 : 625_000_000) * 3);
        done = true;
      }
    }
    expect(done).to.eq(true);
  });
});
