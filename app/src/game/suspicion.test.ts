import { describe, expect, it } from "vitest";
import { MODES } from "./data";
import { suspicion } from "./suspicion";

describe("suspicion", () => {
  it("starts even", () => {
    expect(suspicion(5, MODES[0], [])).toEqual([0.2, 0.2, 0.2, 0.2, 0.2]);
  });
  it("a tipped job points at the team", () => {
    const p = suspicion(5, MODES[0], [{ kind: "job", team: [0, 1], tipped: true }]);
    expect(p[0]).toBeGreaterThan(0.4);
    expect(p[2]).toBeLessThan(0.1);
    expect(p.reduce((a, b) => a + b)).toBeCloseTo(1);
  });
  it("a wiretap is exact", () => {
    const p = suspicion(6, MODES[1], [{ kind: "wiretap", pair: [0, 1], hit: false }]);
    expect(p[0]).toBe(0);
    expect(p[2]).toBeCloseTo(0.25);
  });
  it("a wrong accusation clears that member", () => {
    const p = suspicion(5, MODES[0], [{ kind: "accuse", member: 3, right: false }]);
    expect(p[3]).toBe(0);
  });
});

describe("suspicion under chapter rules", () => {
  it("two snitches: everyone starts at 2 in n", () => {
    const p = suspicion(6, MODES[0], [], { snitches: 2 });
    for (const x of p) expect(x).toBeCloseTo(2 / 6);
  });
  it("two snitches: catching one leaves the other still to find", () => {
    const p = suspicion(6, MODES[0], [{ kind: "accuse", member: 0, right: true, t: 0 }], { snitches: 2 });
    expect(p[0]).toBeCloseTo(1);
    expect(p[1]).toBeCloseTo(1 / 5);
  });
  it("outside man: half the time nobody at the table", () => {
    const p = suspicion(6, MODES[0], [], { outside: true });
    expect(p.reduce((a, b) => a + b)).toBeCloseTo(0.5);
  });
  it("recruit: nobody new is suspect before the turn, someone is after", () => {
    const before = suspicion(5, MODES[0], [], { recruitAt: 3 }, 2);
    const after = suspicion(5, MODES[0], [], { recruitAt: 3 }, 4);
    expect(before.reduce((a, b) => a + b)).toBeCloseTo(1);
    expect(after.reduce((a, b) => a + b)).toBeCloseTo(2);
  });
  it("recruit: catching the snitch before the turn stops the recruit", () => {
    const p = suspicion(5, MODES[0], [{ kind: "accuse", member: 2, right: true, t: 1 }], { recruitAt: 3 }, 6);
    expect(p[2]).toBeCloseTo(1);
    expect(p.reduce((a, b) => a + b)).toBeCloseTo(1);
  });
});
