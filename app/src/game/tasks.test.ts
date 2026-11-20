import { describe, expect, it } from "vitest";
import { CHAPTERS, castOf, jobTake, teamSize, type Job } from "./data";
import { DAILY_ID, ENDLESS_ID, dailyChapter, dayNumber, endlessChapter, findChapter, seeded } from "./modes";
import { autoTeam, barred, blackout, teamProblem } from "./tasks";
import chaptersJson from "../../../contracts/chapters.json";

const story = CHAPTERS.filter((c) => c.open && !c.prologue);
const all = story.flatMap((c) => c.jobs.map((j, i) => ({ c, j, i })));
const of = (kind: Job["task"]["kind"]) => all.filter((x) => x.j.task.kind === kind);

describe("every task type plays by its rule", () => {
  it("each kind appears in the story", () => {
    for (const k of ["plain", "need", "ban", "dark", "hot", "rush"] as const) expect(of(k).length, k).toBeGreaterThan(0);
  });

  it("need: the team can't go without that member, unless they're out of the crew", () => {
    for (const { c, j } of of("need")) {
      if (j.task.kind !== "need") continue;
      const crew = castOf(c);
      const m = j.task.member;
      const others = crew.map((x) => x.id).filter((x) => x !== m).slice(0, teamSize(j));
      expect(teamProblem(j, others, [], crew)).toMatch(/has to be on this team/);
      expect(teamProblem(j, others, [m], crew)).toBeNull(); // out: the rule lifts
      expect(teamProblem(j, [m, ...others].slice(0, teamSize(j)), [], crew)).toBeNull();
    }
  });

  it("ban: that member can never be picked, and the auto team leaves them home", () => {
    for (const { c, i, j } of of("ban")) {
      if (j.task.kind !== "ban") continue;
      expect(barred(j, j.task.member)).toBe(true);
      for (let n = 0; n < 20; n++) expect(autoTeam(c, i, [j.task.member], [])).not.toContain(j.task.member);
    }
  });

  it("dark: tools are off before it; other jobs have the lights on", () => {
    for (const { j } of of("dark")) expect(blackout(j)).toBe(true);
    for (const { j } of of("plain")) expect(blackout(j)).toBe(false);
  });

  it("hot: the base take counts double", () => {
    for (const { j } of of("hot")) expect(jobTake(j)).toBe(j.take * 2);
    for (const { j } of of("plain")) expect(jobTake(j)).toBe(j.take);
  });

  it("rush: a short planning clock, 20 to 25 seconds", () => {
    for (const { j } of of("rush")) if (j.task.kind === "rush") expect(j.task.seconds).toBeGreaterThanOrEqual(20), expect(j.task.seconds).toBeLessThanOrEqual(25);
  });

  it("the auto team is always legal: right size, needed member in, nobody away", () => {
    for (const { c, i, j } of all)
      for (let n = 0; n < 5; n++) {
        const away = j.task.kind === "need" ? [] : [0];
        const t = autoTeam(c, i, [], away);
        expect(new Set(t).size).toBe(teamSize(j));
        expect(teamProblem(j, t, away, castOf(c))).toBeNull();
        for (const m of t) expect(away.includes(m) || barred(j, m)).toBe(false);
      }
  });
});

describe("daily job and endless night", () => {
  it("the daily job is the same for everyone on a day, and changes from day to day", () => {
    const a = dailyChapter(42);
    const b = dailyChapter(42);
    expect(a).toEqual(b);
    expect(a.id).toBe(DAILY_ID);
    expect(a.jobs.length).toBe(4);
    expect(a.jobs.at(-1)!.boss).toBe(true);
    expect(a.jobs.every((j) => !j.after)).toBe(true);
    const days = new Set(Array.from({ length: 30 }, (_, d) => dailyChapter(d + 1).tagline));
    expect(days.size).toBeGreaterThan(10);
    expect(dayNumber(new Date(Date.UTC(2026, 10, 19, 23)))).toBe(1);
    expect(dayNumber(new Date(Date.UTC(2026, 10, 20, 1)))).toBe(2);
  });

  it("endless night has 20 jobs that keep growing, with no seat rules from other casts", () => {
    const e = endlessChapter();
    expect(e.id).toBe(ENDLESS_ID);
    expect(e.jobs.length).toBe(20);
    for (let i = 1; i < 20; i++) expect(e.jobs[i].take).toBeGreaterThanOrEqual(e.jobs[i - 1].take);
    expect(e.jobs.every((j) => j.task.kind !== "need" && j.task.kind !== "ban")).toBe(true);
    expect(e.jobs.every((j) => teamSize(j) < e.cast.length)).toBe(true);
  });

  it("findChapter knows the story and both modes", () => {
    expect(findChapter(1)?.name).toBe("The Corner");
    expect(findChapter(DAILY_ID)?.id).toBe(DAILY_ID);
    expect(findChapter(ENDLESS_ID)?.id).toBe(ENDLESS_ID);
    expect(findChapter(99)).toBeUndefined();
  });

  it("the seeded generator repeats exactly", () => {
    const a = seeded(7);
    const b = seeded(7);
    for (let i = 0; i < 10; i++) expect(a()).toBe(b());
  });
});

describe("chapters.json (what the deploy script adds on-chain) matches the app", () => {
  const json = chaptersJson as unknown as { id: number; crew: number; teams: number[]; takes: number[]; flags: number[]; needs: number[]; bans: number[]; rules: number; recruitAt: number; hasSkimmer: boolean; hasWiretap: boolean }[];
  for (const c of story)
    it(`chapter ${c.id}`, () => {
      const j = json.find((x) => x.id === c.id)!;
      expect(j.crew).toBe(c.cast.length);
      expect(j.teams).toEqual(c.jobs.map(teamSize));
      expect(j.takes).toEqual(c.jobs.map((x) => x.take));
      expect(j.flags).toEqual(c.jobs.map((x) => (x.task.kind === "hot" ? 1 : 0) | (x.task.kind === "dark" ? 2 : 0)));
      expect(j.needs).toEqual(c.jobs.map((x) => (x.task.kind === "need" ? 1 << x.task.member : 0)));
      expect(j.bans).toEqual(c.jobs.map((x) => (x.task.kind === "ban" ? 1 << x.task.member : 0)));
      expect([j.hasSkimmer, j.hasWiretap]).toEqual([c.skimmer, c.wiretap]);
      const r = c.rules ?? {};
      expect(j.rules).toBe((r.snitches === 2 ? 1 : 0) | (r.recruitAt !== undefined ? 2 : 0) | (r.outside ? 4 : 0) | (r.allIn ? 8 : 0));
      expect(j.recruitAt).toBe(r.recruitAt ?? 0);
    });
});
