import { readDataAppPayload } from "@/commands/app/lib/distribution.ts";

// Source execution reads the app templates. Release builds replace this module with literal data.
export const dataAppPayload = await readDataAppPayload();
