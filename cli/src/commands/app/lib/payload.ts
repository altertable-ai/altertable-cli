import type { DataAppPayload } from '@/commands/app/lib/distribution.ts';

let payloadPromise: Promise<DataAppPayload> | undefined;

// Load SDK build tools only when an app command needs the source templates.
// Release builds replace this module with the already embedded payload.
export function loadDataAppPayload(): Promise<DataAppPayload> {
  return (payloadPromise ??=
    import('@/commands/app/lib/distribution-source.ts').then(
      ({ readDataAppPayload }) => readDataAppPayload()
    ));
}
