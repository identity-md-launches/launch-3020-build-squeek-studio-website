import { existsSync } from "node:fs";
import { resolve } from "node:path";
const deps = resolve(
  existsSync("node_modules/vite")
    ? "node_modules"
    : "test/scratch/node_modules",
);
export default {
  base: "./",
  resolve: {
    alias: ["react", "react-dom", "viem", "qrcode", "fflate"].map((name) => ({
      find: new RegExp("^" + name + "(/.*)?$"),
      replacement: deps + "/" + name + "$1",
    })),
  },
  build: { target: "es2022", chunkSizeWarningLimit: 800 },
  worker: { format: "es" },
};
