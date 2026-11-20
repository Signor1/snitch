import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { forward } from "./server/pimlico";

// COOP/COEP let the Zama FHE WASM run multithreaded in the browser.
const isolation = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "credentialless",
};

// Dev stand-in for the Cloudflare function at functions/api/pimlico.ts.
function pimlico(key?: string): Plugin {
  return {
    name: "pimlico-proxy",
    configureServer(server) {
      server.middlewares.use("/api/pimlico", async (req, res) => {
        let raw = "";
        for await (const chunk of req) raw += chunk;
        let body: unknown;
        try {
          body = JSON.parse(raw);
        } catch {
          res.statusCode = 400;
          return res.end();
        }
        const out = await forward(body, key);
        res.statusCode = out.status;
        res.setHeader("content-type", "application/json");
        res.end(await out.text());
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), pimlico(loadEnv(mode, process.cwd(), "").PIMLICO_API_KEY)],
  server: { headers: isolation },
  preview: { headers: isolation },
}));
