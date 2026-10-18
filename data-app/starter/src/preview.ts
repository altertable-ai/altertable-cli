import { resolve } from "node:path";
import { localLakehouse } from "@altertable/data-app/server/bun";
import { serveAppFile } from "@altertable/data-app/server/bun/preview";

const preview = await serveAppFile({
  file: resolve(import.meta.dir, "../index.tsx"),
  port: Number(process.env.PORT ?? 25837),
  lakehouse: localLakehouse(),
});

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  try {
    await preview.stop();
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
console.log(`Data app running at ${preview.url}`);
