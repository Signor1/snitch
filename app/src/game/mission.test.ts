import { describe, expect, it } from "vitest";
import { CHAPTERS, MODES, castOf, jobTake } from "./data";
import { LUCK, matches, oddsFor } from "./mission";

const ch1 = CHAPTERS.find((c) => c.id === 1)!;
const crew = castOf(ch1);
const pawn = ch1.jobs[0]; // roles: Muscle, Driver

describe("mission odds", () => {
  it("counts the right person in the right seat", () => {
    expect(matches(pawn, [2, 0], crew)).toBe(2); // Dutch (muscle), Vex (driver)
    expect(matches(pawn, [0, 2], crew)).toBe(0);
  });
  it("the right seats pay more", () => {
    const right = oddsFor(pawn, [2, 0], crew, MODES[0], { choices: [0, 0] });
    const wrong = oddsFor(pawn, [0, 2], crew, MODES[0], { choices: [0, 0] });
    expect(right.take).toBeGreaterThan(wrong.take);
  });
  it("risky calls climb the bad-luck ladder, a paid cop steps down", () => {
    const safe = oddsFor(pawn, [2, 0], crew, MODES[0], { scout: "cop", choices: [0, 0] });
    const bold = oddsFor(pawn, [2, 0], crew, MODES[0], { choices: [1, 1] });
    expect(safe.badLuck).toBeLessThan(bold.badLuck);
    expect(LUCK).toContain(safe.badLuck as (typeof LUCK)[number]);
    expect(LUCK).toContain(bold.badLuck as (typeof LUCK)[number]);
  });
  it("sloppy inside work costs take and adds risk", () => {
    const good = oddsFor(pawn, [2, 0], crew, MODES[0], { choices: [0, 0], game: 1 });
    const bad = oddsFor(pawn, [2, 0], crew, MODES[0], { choices: [0, 0], game: 0.1 });
    expect(good.take).toBeGreaterThan(bad.take);
    expect(bad.rung).toBeGreaterThan(good.rung);
  });
  it("the harbour raid is written: police always come", () => {
    const pro = CHAPTERS.find((c) => c.prologue)!;
    const harbour = pro.jobs[2];
    expect(oddsFor(harbour, [0, 2, 1], castOf(pro), MODES[0], { choices: [0, 0] }).badLuck).toBe(1);
  });
  it("every job has two decision beats and a team", () => {
    for (const c of CHAPTERS.filter((x) => x.open))
      for (const j of c.jobs) {
        expect(j.beats.length).toBe(2);
        expect(j.roles.length).toBeGreaterThan(1);
        expect(j.roles.length).toBeLessThanOrEqual(c.cast.length);
        expect(jobTake(j)).toBeGreaterThan(0);
      }
  });
});

describe("contract parity", () => {
  it("sends a rung and a share the contract accepts, and the take is base x share / 10000", () => {
    for (const c of CHAPTERS.filter((x) => x.open && !x.prologue))
      for (const j of c.jobs)
        for (const choices of [[0, 0], [1, 1], [0, 1]])
          for (const game of [0, 0.5, 1])
            for (const scout of ["case", "plans", "cop"] as const) {
              const cr = castOf(c);
              const team = [...Array(j.roles.length).keys()];
              const o = oddsFor(j, team, cr, MODES[2], { scout, choices, game });
              expect(o.rung).toBeGreaterThanOrEqual(0);
              expect(o.rung).toBeLessThanOrEqual(3);
              expect(o.bps).toBeGreaterThanOrEqual(2000);
              expect(o.bps).toBeLessThanOrEqual(Math.min(25000, 15000 + 5000 * o.rung));
              expect(o.take).toBe(Math.floor((jobTake(j) * o.bps) / 10000));
            }
  });
});

describe("chapters match the contract (Snitch.sol v2 constructor)", () => {
  // team sizes, takes, hot, dark, need seats, ban seats, as shipped on-chain
  const chain: Record<number, { total: number; jobs: [number, number, boolean, boolean, number[], number[]][] }> = {
    1: { total: 38000, jobs: [[2, 1000, false, false, [], []], [2, 2500, false, false, [0], []], [3, 4500, false, false, [1], []], [3, 6000, false, false, [], []], [3, 9000, false, false, [], [2]], [4, 15000, false, false, [1], []]] },
    2: { total: 92000, jobs: [[2, 2000, false, false, [], [2]], [3, 5000, false, true, [], []], [3, 7000, false, false, [], []], [3, 12000, true, false, [], []], [3, 9000, false, false, [5], []], [4, 15000, false, false, [], []], [4, 30000, false, false, [1], []]] },
    3: { total: 211000, jobs: [[2, 4000, false, false, [], []], [3, 10000, false, false, [], [4]], [3, 14000, false, false, [], []], [4, 25000, false, true, [], []], [3, 9000, true, false, [], []], [4, 20000, false, false, [], []], [4, 60000, true, false, [], []]] },
  };
  for (const [id, c] of Object.entries(chain))
    it(`chapter ${id}`, () => {
      const ch = CHAPTERS.find((x) => x.id === Number(id))!;
      expect(ch.jobs.reduce((a, j) => a + jobTake(j), 0)).toBe(c.total);
      ch.jobs.forEach((j, i) => {
        const [team, take, hot, dark, need, ban] = c.jobs[i];
        expect([j.roles.length, j.take, j.task.kind === "hot", j.task.kind === "dark"]).toEqual([team, take, hot, dark]);
        expect(j.task.kind === "need" ? [j.task.member] : []).toEqual(need);
        expect(j.task.kind === "ban" ? [j.task.member] : []).toEqual(ban);
      });
      expect(ch.jobs.length).toBe(c.jobs.length);
    });
});
