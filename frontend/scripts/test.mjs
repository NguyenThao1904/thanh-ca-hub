// Runs Vitest from the project folder with an upper-case drive letter.
// On Windows, a terminal opened as "f:\..." instead of "F:\..." makes Vitest
// load itself twice, and every test file then fails with
// "Cannot read properties of undefined (reading 'config')".
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..").replace(/^[a-z]:/, (drive) => drive.toUpperCase());
const vitest = path.join(root, "node_modules", "vitest", "vitest.mjs");

const result = spawnSync(process.execPath, [vitest, ...process.argv.slice(2)], { cwd: root, stdio: "inherit" });
process.exit(result.status ?? 1);
