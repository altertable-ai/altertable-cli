import { readDataAppPayload } from '@/commands/app/lib/distribution.ts';

// Source execution reads project templates. Release builds replace this module with literal data.
export const dataAppPayload = await readDataAppPayload();
