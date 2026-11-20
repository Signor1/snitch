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
const City = lazy(() => import("./routes/City"));
const Identity = lazy(() => import("./routes/Identity"));
const Lab = import.meta.env.DEV ? lazy(() => import("./routes/Lab")) : () => null;
const Run = lazy(() => import("./routes/Run"));
const Evidence = lazy(() => import("./routes/Evidence"));
const Rooms = lazy(() => import("./routes/Rooms"));
const Room = lazy(() => import("./routes/Room"));
const About = lazy(() => import("./routes/About"));
const Shop = lazy(() => import("./routes/Shop"));
const Record = lazy(() => import("./routes/Record"));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
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
