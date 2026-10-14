import { localLakehouse } from "@altertable/data-app/server/bun";
import { serveAppFile } from "@altertable/data-app/server/bun/preview";

const preview = await serveAppFile({
  file: process.env.ALTERTABLE_APP_FILE!,
  port: Number(process.env.PORT),
  lakehouse: localLakehouse(),
});

let stopping = false;
async function stop() {
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
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
console.log(`Data app running at ${preview.url} (${process.env.ALTERTABLE_APP_FILE})`);
