import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
const root = existsSync("node_modules/vite/package.json")
  ? "node_modules"
  : "test/scratch/node_modules";
const commands = {
  build: ["vite/bin/vite.js", "build"],
  dev: ["vite/bin/vite.js", "--host", "0.0.0.0"],
  preview: ["vite/bin/vite.js", "preview", "--host", "0.0.0.0"],
  typecheck: ["typescript/bin/tsc", "--noEmit"],
  test: ["tsx/dist/cli.mjs", "--test", "src/lib/core.test.ts"],
  snapshot: ["tsx/dist/cli.mjs", "scripts/snapshot.ts"],
};
const entry = commands[process.argv[2]];
if (!entry) throw Error("Unknown command");
const argv = ["test", "snapshot"].includes(process.argv[2])
  ? ["--import", "./" + root + "/tsx/dist/loader.mjs", ...entry.slice(1)]
  : [root + "/" + entry[0], ...entry.slice(1)];
const result = spawnSync(
  process.execPath,
  [...argv, ...process.argv.slice(3)],
  {
    stdio: "inherit",
    env: { ...process.env, TSX_TSCONFIG_PATH: "tsconfig.runtime.json" },
  },
);
process.exit(result.status ?? 1);
