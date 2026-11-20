import { useEffect } from "react";
import { totalTake } from "../game/data";
import { useSnitch } from "../game/store";
import { roomHost } from "./store";

/** Relays what the whole crew would see. Tails and wiretaps stay private to the boss. */
export function useRoomHost() {
  useEffect(() => {
    if (!roomHost.active()) return;
    return useSnitch.subscribe((s, prev) => {
      const name = (i: number) => s.crew[i]?.name ?? "?";
      if (s.cut && !prev.cut) roomHost.feed("info", `${s.cut.job}: the crew is going in`, `On the job: ${s.cut.team.map(name).join(", ")}.`);
      if (s.after && s.after !== prev.after) {
        const a = s.after;
        const lifted = a.lifted !== undefined ? ` ${name(a.lifted)} got picked up on the way out.` : "";
        roomHost.feed(
          a.tipped ? "bad" : "good",
          a.tipped ? `${a.job.name}: the police were waiting` : `${a.job.name}: clean`,
          a.tipped ? `Heat ${s.heat} of 3. Somebody on that team talked, or it was bad luck.` : `$${a.gained.toLocaleString("en-US")} in the bag.${lifted}`,
        );
      }
      const last = s.log.length > prev.log.length ? s.log[s.log.length - 1] : undefined;
      if (last?.kind === "accuse")
        roomHost.feed(last.right ? "good" : "bad", `The boss accused ${name(last.member)}`, last.right ? "It was them. They're out, and the bag doubled." : "They were loyal. They walked out, and the heat went up.");
      if (s.ending && !prev.ending && s.chapter) {
        const e = s.ending;
        // Snitch wins on a raid or if the crew ends under 40% of the chapter's max payout.
        const snitchWon = e.raided || e.bag < 0.4 * totalTake(s.chapter);
        roomHost.end(e.snitch, snitchWon, e.payout);
      }
    });
  }, []);
}
