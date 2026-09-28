import type { Usage } from "./operations.ts";

// Executed against altertable/production on 2026-09-28. The period ends on 2026-09-29 UTC.
export const snapshot: Usage = {
  events: 2983,
  people: 40,
  organizations: 26,
  features: [
    { event: "Insight Viewed", events: 1538, people: 25 },
    { event: "Ask Agent Completed", events: 619, people: 17 },
    { event: "Query Run Submitted", events: 574, people: 18 },
    { event: "Ask Agent Message Sent", events: 112, people: 17 },
    { event: "Dashboard Viewed", events: 98, people: 15 },
    { event: "Insight Created", events: 26, people: 5 },
    { event: "Catalog Created", events: 11, people: 10 },
    { event: "Dashboard Created", events: 5, people: 4 },
  ],
};
