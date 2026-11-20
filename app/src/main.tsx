import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import "./index.css";
import Landing from "./routes/Landing";
import { Boot } from "./shell/Boot";
import { IntroFilm } from "./shell/IntroFilm";

import { Curtain } from "./shell/Curtain";
import { AssetBadge, ScreenLoader } from "./shell/Loader";
import { resumeWallet } from "./chain/store";

resumeWallet();
const World = lazy(() => import("./world/World"));
const screens = {
  City: () => import("./routes/City"),
  Identity: () => import("./routes/Identity"),
  Run: () => import("./routes/Run"),
  Evidence: () => import("./routes/Evidence"),
  Rooms: () => import("./routes/Rooms"),
  Room: () => import("./routes/Room"),
  About: () => import("./routes/About"),
  Shop: () => import("./routes/Shop"),
  Record: () => import("./routes/Record"),
};
const City = lazy(screens.City);
const Identity = lazy(screens.Identity);
const Lab = import.meta.env.DEV ? lazy(() => import("./routes/Lab")) : () => null;
const Run = lazy(screens.Run);
const Evidence = lazy(screens.Evidence);
const Rooms = lazy(screens.Rooms);
const Room = lazy(screens.Room);
const About = lazy(screens.About);
const Shop = lazy(screens.Shop);
const Record = lazy(screens.Record);

// Fetch every screen while the player is still on the title, so a menu tap never waits on the network.
const idle = (f: () => void) => ("requestIdleCallback" in window ? requestIdleCallback(f, { timeout: 4000 }) : setTimeout(f, 1500));
window.addEventListener("load", () => idle(() => Object.values(screens).forEach((s) => void s().catch(() => {}))), { once: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* navigations are transitions: the current screen stays up until the next one can draw, never a spinner */}
    <BrowserRouter useTransitions>
      {/* One persistent 3D world; routes are HUD layers on top. */}
      <Suspense fallback={null}>
        <World />
      </Suspense>
      <Curtain />
      <div className="scanlines pointer-events-none relative z-10 [&_a]:pointer-events-auto [&_button]:pointer-events-auto">
        <Suspense fallback={<ScreenLoader />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/identity" element={<Identity />} />
            <Route path="/city" element={<City />} />
            <Route path="/run/:n" element={<Run />} />
            <Route path="/evidence" element={<Evidence />} />
            <Route path="/rooms" element={<Rooms />} />
            <Route path="/room/:code" element={<Room />} />
            <Route path="/about" element={<About />} />
            <Route path="/shop" element={<Shop />} />
            <Route path="/record" element={<Record />} />
            <Route path="/record/:address" element={<Record />} />
            {import.meta.env.DEV && <Route path="/lab" element={<Lab />} />}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </div>
      <IntroFilm />
      <Boot />
      <AssetBadge />
    </BrowserRouter>
  </StrictMode>,
);
