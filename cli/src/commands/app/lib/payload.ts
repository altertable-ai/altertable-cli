import { readDataAppPayload } from "@/commands/app/lib/distribution.ts";

// Source execution reads canonical projects. Release builds replace this module with literal data.
export const dataAppPayload = await readDataAppPayload();
