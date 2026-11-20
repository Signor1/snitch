import { describe, expect, it } from "vitest";
import { createRehearsalTable } from "./engine";

const on = () => {};
const odds = { badLuck: 0, take: 1000, hot: false };

async function play(chapter: number, f: (t: ReturnType<typeof createRehearsalTable>) => Promise<void>) {
  const t = createRehearsalTable(0);
  await t.start(chapter, 0, on);
  await f(t);
  return t.walkAway(on);
}

describe("practice engine rules", { timeout: 30_000 }, () => {
  it("chapter 4: two different snitches; the bag doubles only for the first caught", async () => {
    for (let k = 0; k < 20; k++) {
      let bag = 0;
      const r = await play(4, async (t) => {
        bag = (await t.runJob([0, 1], { ...odds, badLuck: 0 }, on)).bag;
        // accuse everyone in turn; wrong ones only add heat
        let caught = 0;
        for (let m = 0; m < 7; m++) {
          const a = await t.accuse(m, on);
          if (!a.right) continue;
          caught++;
          expect(a.bag).toBe(caught === 1 ? bag * 2 : bag);
          bag = a.bag;
        }
        expect(caught).toBe(2);
      });
      expect(r.snitches.length).toBe(2);
      expect(new Set(r.snitches).size).toBe(2);
    }
  });
  it("chapter 5: a snitch still at large recruits a second at job 4; caught first, nobody turns", async () => {
    let turned = 0;
    let stopped = 0;
    for (let k = 0; k < 30; k++) {
      const r = await play(5, async (t) => {
        for (let j = 0; j < 5; j++) await t.runJob([0, 1], odds, on);
      });
      if (r.snitches.length === 2) turned++;
      const s = await play(5, async (t) => {
        for (let m = 0; m < 7; m++) if ((await t.accuse(m, on)).right) break;
        for (let j = 0; j < 5; j++) await t.runJob([0, 1], odds, on).catch(() => {});
      });
      if (s.snitches.length === 1) stopped++;
    }
    expect(turned).toBe(30);
    expect(stopped).toBe(30);
  }, 30_000);
  it("chapter 7: sometimes nobody at the table is the snitch", async () => {
    let none = 0;
    for (let k = 0; k < 60; k++) if ((await play(7, async () => {})).snitches.length === 0) none++;
    expect(none).toBeGreaterThan(10);
    expect(none).toBeLessThan(50);
  });
  it("chapter 8: police on the last part is a raid", async () => {
    const t = createRehearsalTable(0);
    await t.start(8, 0, on);
    const r = await t.runJob([0, 1], { badLuck: 1, take: 1000, hot: true, raid: true }, on);
    expect(r.tipped).toBe(true);
    expect(r.heat).toBeGreaterThanOrEqual(3);
  });
});
