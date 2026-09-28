import { createDataClient } from "@altertable/data-app-runtime/client";
import { formatCount, formatPercent, pluralize } from "@altertable/data-app-runtime/format";
import { createDataHooks } from "@altertable/data-app-runtime/react";
import {
  DataApp,
  Grid,
  MetricCard,
  Ranking,
  Stack,
  VisualizationCard,
} from "@altertable/data-app-runtime/ui";
import app from "../app.json";
import { dataContext } from "./data-context.ts";
import type { operations } from "./operations.ts";
import { snapshot } from "./snapshot.ts";
import "./styles.css";

const { useDataView } = createDataHooks(createDataClient<typeof operations>());
const labels: Record<string, string> = {
  "Insight Viewed": "Viewing insights",
  "Ask Agent Completed": "Completing agent requests",
  "Query Run Submitted": "Running queries",
  "Ask Agent Message Sent": "Messaging the agent",
  "Dashboard Viewed": "Viewing dashboards",
  "Insight Created": "Creating insights",
  "Catalog Created": "Creating catalogs",
  "Dashboard Created": "Creating dashboards",
};

export function App() {
  const request = useDataView(
    "usage",
    {},
    {
      isEmpty: (data) => data.events === 0,
      describeInput: () => "August 29–September 28, 2026",
    },
  );
  const view = request.view;
  const data =
    view.kind === "ready" || view.kind === "updating" || view.kind === "stale-error"
      ? view.data
      : snapshot;
  const hasLiveData = data !== snapshot;
  const top = data.features[0];
  const share = top && data.events ? top.events / data.events : 0;
  const snapshotNotice = !hasLiveData && (
    <p className="usage-notice" role="status">
      {view.kind === "error"
        ? "Live query unavailable. Showing the source-backed snapshot collected September 28, 2026."
        : "Checking live data. Showing the source-backed snapshot collected September 28, 2026."}
    </p>
  );

  return (
    <DataApp
      config={app}
      dataContext={dataContext}
      request={hasLiveData ? request : undefined}
      description="What people do across Altertable's analytics, agent, and data workflows."
    >
      <main className="usage-page">
        <div className="usage-intro">
          <div>
            <p className="usage-eyebrow">PRODUCT BEHAVIOR · AUG 29–SEP 28, 2026 · UTC</p>
            <h2>Insights are the most repeated tracked action.</h2>
            <p className="usage-lead">
              {formatCount(top?.events ?? 0)} insight views account for {formatPercent(share)} of
              selected feature actions across organizations other than Altertable. This counts
              actions, not people or successful outcomes.
            </p>
          </div>
          <span className="usage-period">31 calendar days</span>
        </div>
        {snapshotNotice}
        <Grid columns={3}>
          <MetricCard
            label="Feature actions"
            value={formatCount(data.events)}
            description="Selected events; repeat actions count again"
            evidence={{
              id: "actions",
              glossaryIds: ["featureActions"],
              queryNames: ["usage-summary"],
            }}
          />
          <MetricCard
            label="Tracked identities"
            value={formatCount(data.people)}
            description="Distinct across these actions"
            evidence={{
              id: "people",
              glossaryIds: ["trackedPeople"],
              queryNames: ["usage-summary"],
            }}
          />
          <MetricCard
            label="Organizations"
            value={formatCount(data.organizations)}
            description="Excludes the Altertable workspace"
            evidence={{
              id: "organizations",
              glossaryIds: ["organizationScope"],
              queryNames: ["usage-summary"],
            }}
          />
        </Grid>
        <Grid columns={2}>
          <VisualizationCard
            title="What they do"
            description="Number of tracked actions by feature"
            evidence={{
              id: "feature-actions",
              glossaryIds: ["featureActions"],
              queryNames: ["usage-by-feature"],
            }}
            visual={
              <Ranking
                items={data.features.map((feature) => ({
                  id: feature.event,
                  label: labels[feature.event] ?? feature.event,
                  value: feature.events,
                }))}
              />
            }
            insight={
              <p>
                Insight views, agent completions, and query submissions together account for{" "}
                {formatPercent(
                  data.features
                    .filter((feature) =>
                      ["Insight Viewed", "Ask Agent Completed", "Query Run Submitted"].includes(
                        feature.event,
                      ),
                    )
                    .reduce((sum, feature) => sum + feature.events, 0) / (data.events || 1),
                )}{" "}
                of these actions.
              </p>
            }
          />
          <VisualizationCard
            title="How many people reached each feature"
            description="Distinct analytics identities; a person may appear in several rows"
            evidence={{
              id: "feature-people",
              glossaryIds: ["trackedPeople"],
              queryNames: ["usage-by-feature"],
            }}
            visual={
              <Ranking
                items={[...data.features]
                  .sort((a, b) => b.people - a.people)
                  .map((feature) => ({
                    id: feature.event,
                    label: labels[feature.event] ?? feature.event,
                    value: feature.people,
                    detail: `${formatCount(feature.people)} ${pluralize(feature.people, "identity", "identities")}`,
                  }))}
              />
            }
          />
        </Grid>
        <section className="usage-reading" aria-label="How to read this view">
          <Stack gap="sm">
            <h2>How to read this</h2>
            <p>
              Views and submissions measure interest; completed agent requests measure a different
              step. The eight selected events do not cover every product workflow. Identity counts
              overlap across features, and organizations outside the Altertable workspace can
              include demos.
            </p>
          </Stack>
        </section>
      </main>
    </DataApp>
  );
}
