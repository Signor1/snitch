import { useEffect } from "react";
import { audio, type Scene } from "../fx/audio";
import { useSnitch } from "../game/store";

/** The only place that maps game state to music. */
export function useSceneAudio(screen: "title" | "city" | "run") {
  const status = useSnitch((s) => s.status);
  const cut = useSnitch((s) => s.cut?.state);
  const busy = useSnitch((s) => s.busy);
  const ending = useSnitch((s) => s.ending);

  let scene: Scene = "title";
  if (screen === "city") scene = "hideout";
  else if (screen === "run") {
    if (ending) scene = ending.raided ? "lose" : ending.payout > 0 ? "win" : "lose";
    else if (cut === "tipped") scene = "police";
    else if (cut === "clean") scene = "clean";
    else if (cut === "go") scene = "job";
    else if (busy === "end") scene = "reveal";
    else if (busy === "accuse" || busy === "tail" || busy === "wiretap") scene = "planning";
    else scene = status === "plan" ? "planning" : "hideout";
  }

  useEffect(() => {
    audio.autoUnlock();
  }, []);
  useEffect(() => {
    if (status === "story") return;
    // Sting first, then the win/lose bed.
    if (ending) {
      const t = setTimeout(() => audio.setScene(scene), 2600);
      return () => clearTimeout(t);
    }
    audio.setScene(scene);
  }, [scene, ending, status]);
}
