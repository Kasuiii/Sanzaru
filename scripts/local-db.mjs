import "./sites-env.mjs";
import {readFileSync, writeFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const root = new URL("../", import.meta.url);
const built = new URL("dist/server/wrangler.json", root);
let config;
try {
  config = JSON.parse(readFileSync(built, "utf8"));
} catch {
  console.error("Build first: pnpm build (or run pnpm setup:local).");
  process.exit(1);
}
if (!config.d1_databases?.length) throw new Error("Missing local DB binding.");
for (const database of config.d1_databases) database.migrations_dir = "../../drizzle";
const localConfig = new URL("dist/server/wrangler.local.json", root);
writeFileSync(localConfig, JSON.stringify(config, null, 2) + "\n");
for (const database of config.d1_databases) {
  const result = spawnSync(process.execPath, [
    fileURLToPath(new URL("node_modules/wrangler/bin/wrangler.js", root)),
    "d1", "migrations", "apply", database.binding,
    "--local", "--config", fileURLToPath(localConfig),
    "--persist-to", ".wrangler/state",
  ], {stdio: "inherit", env: {...process.env, CI: "true"}});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
