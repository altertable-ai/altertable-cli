import { extractDataAppManifest } from "@altertable/data-app-manifest";

// Parse source without evaluating the app or resolving its imports.
const source = await new Response(Bun.stdin.stream()).text();
console.log(JSON.stringify(extractDataAppManifest(source)));
