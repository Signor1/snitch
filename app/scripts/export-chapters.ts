// Writes contracts/chapters.json so deploy and contract tests use the app's numbers.
// Run: npx vite-node scripts/export-chapters.ts
import { writeFileSync } from "node:fs";
import { CHAPTERS } from "../src/game/data";

const RULE = { two: 1, recruit: 2, outside: 4, allIn: 8 };
const bit = (m?: number) => (m === undefined ? 0 : 1 << m);

const out = CHAPTERS.filter((c) => !c.prologue).map((c) => {
  const r = c.rules ?? {};
  return {
    id: c.id,
    name: c.name,
    crew: c.cast.length,
    teams: c.jobs.map((j) => j.roles.length),
    takes: c.jobs.map((j) => j.take),
    flags: c.jobs.map((j) => (j.task.kind === "hot" ? 1 : 0) | (j.task.kind === "dark" ? 2 : 0)),
    needs: c.jobs.map((j) => (j.task.kind === "need" ? bit(j.task.member) : 0)),
    bans: c.jobs.map((j) => (j.task.kind === "ban" ? bit(j.task.member) : 0)),
    hasSkimmer: c.skimmer,
    hasWiretap: c.wiretap,
    rules: (r.snitches === 2 ? RULE.two : 0) | (r.recruitAt !== undefined ? RULE.recruit : 0) | (r.outside ? RULE.outside : 0) | (r.allIn ? RULE.allIn : 0),
    recruitAt: r.recruitAt ?? 0,
  };
});
writeFileSync(new URL("../../contracts/chapters.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${out.length} chapters`);
