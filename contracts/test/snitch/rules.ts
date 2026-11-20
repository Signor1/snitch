import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import type { ContractTransactionResponse } from "ethers";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Snitch } from "../../types";

/** Chapter rules (chapters 4-8, loaded from chapters.json). */
const GAS = 16_000_000;
const HCU_LIMIT = 20_000_000;
const DEPTH_LIMIT = 5_000_000;
const NO = 255;
const RULE = { two: 1, recruit: 2, outside: 4, allIn: 8 };

type Ch = {
  id: number;
  name: string;
  crew: number;
  teams: number[];
  takes: number[];
  flags: number[];
  needs: number[];
  bans: number[];
  hasSkimmer: boolean;
  hasWiretap: boolean;
  rules: number;
  recruitAt: number;
};
const CHAPTERS: Ch[] = JSON.parse(readFileSync(join(__dirname, "../../chapters.json"), "utf8"));
const has = (m: number, i: number) => (m & (1 << i)) !== 0;
const mask = (ids: number[]) => ids.reduce((m, i) => m | (1 << i), 0);
const range = (n: number) => [...Array(n).keys()];

describe("Snitch v3 rules", function () {
  this.timeout(3_600_000);
  let k: Snitch;
  let addr: string;
  let me: HardhatEthersSigner;

  before(async function () {
    if (!fhevm.isMock) this.skip();
    [me] = await ethers.getSigners();
    k = (await (await ethers.getContractFactory("Snitch")).deploy()) as unknown as Snitch;
    addr = await k.getAddress();
    for (const c of CHAPTERS.filter((c) => c.id > 3))
      await (await k.addChapter(c.name, c.crew, c.teams, c.takes, c.flags, c.needs, c.bans, c.hasSkimmer, c.hasWiretap, c.rules, c.recruitAt)).wait();
  });

  const worst = new Map<string, { hcu: number; depth: number; gas: number }>();
  after(() => {
    const rows = [...worst].map(([op, v]) => `  ${op.padEnd(18)} ${(v.hcu / 1e6).toFixed(3)}M HCU  ${(v.depth / 1e6).toFixed(3)}M depth  ${(v.gas / 1e6).toFixed(3)}M gas`);
    if (rows.length) console.log("\n  v3 rules, worst case per action\n" + rows.join("\n"));
  });
  async function send(p: Promise<ContractTransactionResponse>, op: string) {
    const r = (await (await p).wait())!;
    const info = fhevm.computeTransactionHCU(r);
    expect(info.globalHCU, `${op} HCU`).to.be.lte(HCU_LIMIT);
    expect(info.maxHCUDepth, `${op} depth`).to.be.lte(DEPTH_LIMIT);
    const v = worst.get(op) ?? { hcu: 0, depth: 0, gas: 0 };
    worst.set(op, { hcu: Math.max(v.hcu, info.globalHCU), depth: Math.max(v.depth, info.maxHCUDepth), gas: Math.max(v.gas, Number(r.gasUsed)) });
    return r;
  }
  const dBool = (h: string) => fhevm.userDecryptEbool(h, addr, me);
  const dU32 = async (h: string) => Number(await fhevm.userDecryptEuint(FhevmType.euint32, h, addr, me));
  const dU8 = async (h: string) => Number(await fhevm.userDecryptEuint(FhevmType.euint8, h, addr, me));

  const ch = (id: number) => CHAPTERS.find((c) => c.id === id)!;
  async function teamFor(id: number, avoid: number[] = []) {
    const run = await k.runOf(me.address);
    const c = ch(id);
    const j = Number(run.job);
    const out = Number(run.out);
    const present = range(c.crew).filter((m) => !has(out, m));
    const need = present.filter((m) => has(c.needs[j], m));
    const pool = present.filter((m) => !need.includes(m) && !has(c.bans[j], m));
    const ordered = [...pool.filter((m) => !avoid.includes(m)), ...pool.filter((m) => avoid.includes(m))];
    return [...need, ...ordered].slice(0, c.teams[j]);
  }
  const start = (id: number) => send(k.start(id, 0, { gasLimit: GAS }), `start ch${id}`);
  async function job(id: number, team?: number[], rung = 0) {
    const t = team ?? (await teamFor(id));
    await send(k.runJob(mask(t), rung, 10_000, { gasLimit: GAS }), `runJob ch${id}`);
    const h = await k.handlesOf(me.address);
    return { team: t, tipped: await dBool(h.tipped), bag: await dU32(h.bag), heat: await dU8(h.heat) };
  }
  async function accuse(m: number) {
    await send(k.accuse(m, { gasLimit: GAS }), "accuse");
    const h = await k.handlesOf(me.address);
    return { right: await dBool(h.right), bag: await dU32(h.bag), heat: await dU8(h.heat) };
  }
  async function finish() {
    await send(k.walkAway({ gasLimit: GAS }), "walkAway");
    const hs = [...(await k.revealHandles(me.address))];
    expect(hs.length).to.eq(5);
    const dec = await fhevm.publicDecrypt(hs);
    await send(k.settle(me.address, dec.abiEncodedClearValues, dec.decryptionProof, { gasLimit: GAS }), "settle");
    const v = ethers.AbiCoder.defaultAbiCoder().decode(["uint32", "uint8", "uint8", "uint8", "uint8"], dec.abiEncodedClearValues);
    return { payout: Number(v[0]), snitch: Number(v[1]), heat: Number(v[2]), skimmer: Number(v[3]), second: Number(v[4]) };
  }
  async function unlockTo(id: number) {
    for (let c = 1; c < id; c++)
      for (let i = 0; i < 40 && (await k.bestStars(me.address, c)) === 0n; i++) {
        await start(c);
        await job(c);
        await finish();
      }
  }

  it("loads chapters 4-8 exactly as the app plays them", async () => {
    expect(await k.chapterCount()).to.eq(8n);
    for (const c of CHAPTERS) {
      const on = await k.chapterOf(c.id);
      expect(on.name).to.eq(c.name);
      expect(Number(on.crew)).to.eq(c.crew);
      expect(on.hasSkimmer).to.eq(c.hasSkimmer);
      expect(on.hasWiretap).to.eq(c.hasWiretap);
      expect(Number(on.rules)).to.eq(c.rules);
      expect(Number(on.recruitAt)).to.eq(c.recruitAt);
      expect(on.jobs.length).to.eq(c.teams.length);
      on.jobs.forEach((j, i) => {
        expect(Number(j.team)).to.eq(c.teams[i]);
        expect(Number(j.take)).to.eq(c.takes[i]);
        expect(j.hot).to.eq((c.flags[i] & 1) !== 0);
        expect(j.dark).to.eq((c.flags[i] & 2) !== 0);
        expect(Number(j.need)).to.eq(c.needs[i]);
        expect(Number(j.ban)).to.eq(c.bans[i]);
      });
      expect(Number(on.total)).to.eq(c.takes.reduce((a, t, i) => a + t * (c.flags[i] & 1 ? 2 : 1), 0));
    }
  });

  it("two snitches: exactly two accusations are right, the bag doubles only once, the reveal names both", async () => {
    await unlockTo(4);
    const c = ch(4);
    expect(c.rules & RULE.two).to.eq(RULE.two);
    for (let n = 0; n < 2; n++) {
      await start(4);
      let bag = 0;
      for (let i = 0; i < 6 && bag === 0; i++) bag = (await job(4)).bag;
      expect(bag).to.be.gt(0);
      const right: number[] = [];
      let now = bag;
      for (const m of range(c.crew)) {
        const a = await accuse(m);
        if (a.right) {
          right.push(m);
          expect(a.bag).to.eq(right.length === 1 ? now * 2 : now); // first catch only
        } else expect(a.bag).to.eq(now);
        now = a.bag;
      }
      expect(right.length).to.eq(2);
      const r = await finish();
      expect(r.snitch).to.not.eq(r.second);
      expect(right).to.have.members([r.snitch, r.second]);
      expect(r.skimmer).to.eq(NO);
    }
  });

  it("the recruit: a snitch still at large turns someone still in the crew at job recruitAt; caught first, nobody turns", async () => {
    await unlockTo(5);
    const c = ch(5);
    expect(c.recruitAt).to.be.gt(0);
    // 1) Nobody accused: at recruitAt a second member turns.
    for (let n = 0; n < 2; n++) {
      await start(5);
      for (let j = 0; j <= c.recruitAt; j++) await job(5);
      const right: number[] = [];
      for (const m of range(c.crew)) if ((await accuse(m)).right) right.push(m);
      expect(right.length).to.eq(2);
      const r = await finish();
      expect(r.second).to.not.eq(NO);
      expect(right).to.have.members([r.snitch, r.second]);
    }
    // 2) Wrong accusations first: the recruit is never out. 3) Snitch caught first: no recruit.
    let sawNoRecruit = false;
    for (let n = 0; n < 6 && !sawNoRecruit; n++) {
      await start(5);
      const out: number[] = [];
      let caught = false;
      // accuse up to two members before the first job
      for (const m of [0, 1]) {
        const a = await accuse(m);
        out.push(m);
        if (a.right) caught = true;
      }
      for (let j = 0; j <= c.recruitAt; j++) await job(5);
      const r = await finish();
      if (caught) {
        expect(r.second).to.eq(NO);
        sawNoRecruit = true;
      } else {
        expect(r.second).to.not.eq(NO);
        expect(out).to.not.include(r.second);
        expect(r.second).to.not.eq(r.snitch);
      }
    }
  });

  it("the outside man: some runs have nobody at the table; then every accusation is wrong", async () => {
    await unlockTo(7);
    const c = ch(7);
    expect(c.rules & RULE.outside).to.eq(RULE.outside);
    const seen = { nobody: 0, someone: 0 };
    for (let n = 0; n < 14 && (seen.nobody === 0 || seen.someone === 0); n++) {
      await start(7);
      const rights: number[] = [];
      for (const m of range(c.crew)) if ((await accuse(m)).right) rights.push(m);
      const r = await finish();
      expect(r.second).to.eq(NO);
      if (r.snitch === NO) {
        seen.nobody++;
        expect(rights).to.deep.eq([]);
      } else {
        seen.someone++;
        expect(rights).to.deep.eq([r.snitch]);
      }
      expect(r.skimmer).to.be.lt(c.crew);
      expect(r.skimmer).to.not.eq(r.snitch);
    }
    expect(seen.nobody).to.be.gt(0);
    expect(seen.someone).to.be.gt(0);
  });

  it("all-in: police on the last part is a raid, whatever the heat", async () => {
    await unlockTo(8);
    const c = ch(8);
    expect(c.rules & RULE.allIn).to.eq(RULE.allIn);
    let raided = false;
    for (let n = 0; n < 8 && !raided; n++) {
      await start(8);
      let heat = 0;
      // careful parts (rung 0); stop early if the crew is already raided
      for (let j = 0; j < c.teams.length - 1 && heat < 3; j++) heat = (await job(8, undefined, 0)).heat;
      if (heat >= 3) {
        await finish();
        continue;
      }
      const last = await job(8, undefined, 3); // the risky way out: bad luck 1 in 2
      if (last.tipped) {
        expect(last.heat).to.be.gte(3);
        const r = await finish();
        expect(r.payout).to.eq(0);
        raided = true;
      } else {
        expect(last.heat).to.eq(heat);
        await finish();
      }
    }
    expect(raided).to.eq(true);
  });
});
