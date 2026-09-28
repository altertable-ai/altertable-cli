import type { DataContext } from "@altertable/data-app-runtime/ui";

export const dataContext = {
  description:
    "Explore how tracked identities at organizations other than Altertable used selected product features from August 29 through September 28, 2026 (UTC). This focused view of instrumented actions excludes marketing pageviews and scroll events. A dated snapshot collected September 28 remains visible when the local CLI profile cannot query the lakehouse.",
  glossary: {
    trackedPeople: {
      term: "Tracked people",
      definition:
        "Distinct identity_uuid values with a selected product event. These are analytics identities, not necessarily unique humans. Per-feature counts overlap.",
      queryNames: ["usage-summary", "usage-by-feature"],
    },
    featureActions: {
      term: "Feature actions",
      definition:
        "Rows in product_analytics.analytics.events for eight selected event names. Repeated actions by one identity each count. Viewed and completed actions are different behaviors.",
      queryNames: ["usage-summary", "usage-by-feature"],
    },
    organizationScope: {
      term: "Other organizations",
      definition:
        "Events with a non-null organization_slug other than 'altertable'. This excludes the Altertable workspace, but may include demos and other internal activity under different organization names.",
      queryNames: ["usage-summary"],
    },
  },
} satisfies DataContext;
