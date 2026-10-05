import { serveLocalApp } from "@altertable/data-app/server/bun";
import { defineDataAppRegistration } from "@altertable/data-app/contract";
const queries: unknown = await Bun.file(new URL("../queries.json", import.meta.url)).json();
const variables: unknown = await Bun.file(new URL("../variables.json", import.meta.url)).json();
import app from "#app/config.ts";

await serveLocalApp({
  entrypoint: new URL("./main.tsx", import.meta.url).pathname,
  registration: defineDataAppRegistration({ queries, variables }),
  title: app.title,
});
