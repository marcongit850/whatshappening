import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vitest/config";

/** Vitest runs in Node. Wrangler loads the same PNG imports as Data modules. */
function pngBytes(): Plugin {
  return {
    name: "png-bytes",
    enforce: "pre",
    load(id) {
      const file = id.split("?")[0];
      if (!file.endsWith(".png")) return null;
      const b64 = readFileSync(file).toString("base64");
      return `export default Uint8Array.from(atob(${JSON.stringify(b64)}), (c) => c.charCodeAt(0));`;
    },
  };
}

export default defineConfig({
  plugins: [pngBytes()],
});
