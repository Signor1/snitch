import { AnimatePresence } from "motion/react";
import { useEffect } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { TopBar } from "../components/ui";
import { findChapter } from "../game/modes";
import { useSnitch } from "../game/store";
import { useSceneAudio } from "../hooks/useSceneAudio";
import { ActionBar } from "../hud/ActionBar";
import { Brief } from "../hud/Brief";
import { Coach } from "../hud/Coach";
import { CrewDock } from "../hud/CrewDock";
import { Ending } from "../hud/Ending";
import { JobBanner, NoteCard, Phone } from "../hud/Feed";
import { HandsOn } from "../hud/Games";
import { Aftermath, JobPrompts, Scout, Seats } from "../hud/Mission";
import { StatusBar } from "../hud/StatusBar";
import { Pause } from "../shell/Pause";
import { ScenePlayer } from "../story/ScenePlayer";
import { ScreenLoader } from "../shell/Loader";
import { useRoomHost } from "../rooms/useRoomHost";
import { useRoom } from "../rooms/store";
import { Ritual } from "../components/ui";

export default function Run() {
  const id = Number(useParams().n);
  const nav = useNavigate();
  const chapter = findChapter(id);
  const current = useSnitch((s) => s.chapter?.id);
  const status = useSnitch((s) => s.status);
  const cut = useSnitch((s) => s.cut);
  const done = useSnitch((s) => s.done);
  const start = useSnitch((s) => s.start);
  const leave = useSnitch((s) => s.leave);
  useSceneAudio("run");
  useRoomHost();

  useEffect(() => {
    if (chapter) start(chapter.id);
    return leave;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (done) nav(done.next !== undefined ? `/run/${done.next}` : "/city");
  }, [done, nav]);

  if (!chapter) return <Navigate to="/city" replace />;
  if (current !== chapter.id) return <ScreenLoader label="Opening the chapter" />;

  return (
    <div className="pointer-events-none relative flex min-h-dvh flex-col">
      <div className="fixed inset-x-0 top-0 h-44 bg-gradient-to-b from-ink/90 to-transparent" />
      <div className="fixed inset-x-0 bottom-0 h-80 bg-gradient-to-t from-ink via-ink/75 to-transparent" />
      <div className="relative z-30">
        <TopBar right={<Pause onRestart={() => start(chapter.id)} />} />
      </div>
      {status !== "story" && (
        <div className={cut ? "fixed inset-x-0 top-[calc(9dvh+0.75rem)] z-20" : "relative"}>
          <StatusBar />
        </div>
      )}
      <Phone />

      <AnimatePresence>{status === "brief" && <Brief />}</AnimatePresence>
      <AnimatePresence>{status === "scout" && <Scout />}</AnimatePresence>
      {cut && <JobBanner />}
      <JobPrompts />
      <AnimatePresence>
        <HandsOn />
      </AnimatePresence>
      <AnimatePresence>{status === "aftermath" && <Aftermath />}</AnimatePresence>
      {status === "ended" && <Ending />}
      {status === "story" && <ScenePlayer />}

      {status === "plan" && (
        <div className="pointer-events-auto fixed inset-x-0 bottom-0 z-20 space-y-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <NoteCard />
          <Seats />
          <CrewDock />
          <ActionBar />
        </div>
      )}
      <Coach />
      <WaitingOnFriends />
    </div>
  );
}

function WaitingOnFriends() {
  const waiting = useRoom((s) => s.waitingOn);
  const crew = useSnitch((s) => s.crew);
  if (!waiting.length) return null;
  const names = waiting.map((i) => crew[i]?.name ?? `Seat ${i + 1}`);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(9dvh+5.5rem)] z-40 flex justify-center px-4">
      <div className="panel rounded-2xl px-5 py-3">
        <Ritual phase="sealing" label={`Waiting for ${names.join(" and ")} to seal a word. Nobody will know what they said.`} />
      </div>
    </div>
  );
}
