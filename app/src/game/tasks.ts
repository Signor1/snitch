import { teamSize, type Chapter, type Job, type Member } from "./data";

export function barred(job: Job | undefined, member: number) {
  return job?.task.kind === "ban" && job.task.member === member;
}

export const blackout = (job: Job | undefined) => job?.task.kind === "dark";

/** Null when the team can go. `away` = out of the crew or lifted. */
export function teamProblem(job: Job | undefined, team: number[], away: number[], crew: Member[]): string | null {
  if (!job) return "No jobs left.";
  const n = teamSize(job);
  if (team.length < n) return `Fill the ${job.roles[team.length].toLowerCase()} seat (${team.length}/${n}).`;
  if (job.task.kind === "need" && !away.includes(job.task.member) && !team.includes(job.task.member)) return `${crew[job.task.member]?.name} has to be on this team.`;
  return null;
}

/** Used when the clock runs out. Keeps the player's picks. */
export function autoTeam(chapter: Chapter, jobIndex: number, picked: number[], away: number[]): number[] {
  const job = chapter.jobs[jobIndex];
  const n = teamSize(job);
  const team = picked.filter((m) => !barred(job, m)).slice(0, n);
  if (job.task.kind === "need" && !away.includes(job.task.member) && !team.includes(job.task.member)) {
    if (team.length >= n) team.pop();
    team.push(job.task.member);
  }
  const pool = [...Array(chapter.cast.length).keys()].filter((m) => !away.includes(m) && !team.includes(m) && !barred(job, m));
  while (team.length < n && pool.length) team.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return team;
}
