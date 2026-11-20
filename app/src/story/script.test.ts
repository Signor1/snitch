import { describe, expect, it } from "vitest";
import { CHAPTERS } from "../game/data";
import { EVENTS } from "../game/mission";
import { SCENES } from "./script";

describe("script", () => {
  it("every scene a chapter or job points at exists", () => {
    for (const c of CHAPTERS.filter((x) => x.open)) {
      expect(SCENES[c.intro], c.intro).toBeDefined();
      expect(SCENES[c.outro], c.outro).toBeDefined();
      for (const j of c.jobs) {
        if (j.after) expect(SCENES[j.after], j.after).toBeDefined();
        for (const b of j.beats) expect(EVENTS[b], b).toBeDefined();
      }
    }
  });
  it("a speaker in a scene is someone in that chapter (calls and texts can come from anyone)", () => {
    for (const c of CHAPTERS.filter((x) => x.open)) {
      const keys = [c.intro, c.outro, ...c.jobs.map((j) => j.after).filter(Boolean)] as string[];
      for (const k of keys)
        for (const l of SCENES[k].lines) if (l.t === "say") expect(c.cast as string[], `${k}: ${l.who}`).toContain(l.who);
    }
  });
});
