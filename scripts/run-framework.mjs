import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readExecutionProfile } from "./execution-profile.mjs";

const [command, ...args] = process.argv.slice(2);
if (!["dev", "build"].includes(command)) throw new Error("Expected dev or build.");
const managedLinux = readExecutionProfile() === "managed-linux";
// Persistent local datasets need Node's filesystem; the Cloudflare preview
// runs in an isolated worker filesystem. Keep normal preview/build behavior.
if (!managedLinux && command === "dev") {
  try { process.loadEnvFile(fileURLToPath(new URL("../.env.local", import.meta.url))); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
}
const localData = !managedLinux && command === "dev" && Boolean(process.env.LOCAL_DATA_DIR) && process.env.TASK_STORE_MODE !== "memory";

if (managedLinux && command === "build") {
  const result = spawnSync("bash", [
    fileURLToPath(new URL("./build-verified.sh", import.meta.url)), ...args,
  ], { stdio: "inherit" });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

// Import in this process so the preview owner retains its PID and signals.
const cli = new URL(localData ? "../node_modules/next/dist/bin/next" : managedLinux
  ? "../node_modules/vite/bin/vite.js"
  : "../node_modules/vinext/dist/cli.js", import.meta.url);
process.argv = [process.execPath, fileURLToPath(cli), command,
  ...(!managedLinux && command === "dev" ? ["--port", "5173"] : []), ...args];
await import(cli.href);
