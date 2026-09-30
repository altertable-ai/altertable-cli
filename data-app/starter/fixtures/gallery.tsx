import { GalleryCases } from "./gallery-cases.tsx";
import { useState } from "react";
import {
  DataApp,
  Button,
  Checkbox,
  Combobox,
  DataWidget,
  Grid,
  MetricWidget,
  SearchField,
  SelectableBarChart,
  Stack,
  TableWidget,
  Tooltip,
  VisualizationWidget,
  mountDataApp,
} from "@altertable/data-app/react";

const options = [
  { id: "http", label: "HTTP" },
  { id: "postgres", label: "Postgres" },
  { id: "other", label: "Other" },
];
const evidence = { id: "gallery-trend", queryNames: ["gallery-trend"] as [string] };
const bars = [
  { id: "monday", label: "Monday", value: 12 },
  { id: "tuesday", label: "Tuesday", value: 0 },
  { id: "wednesday", label: "Wednesday", value: 8 },
];
const rows = Array.from({ length: 23 }, (_, index) => ({
  id: index,
  name: index === 0 ? "A long record name that wraps in narrow containers" : `Record ${index + 1}`,
}));

const config = {
  title: "Runtime component gallery",
  scope: { organization: "Fixtures", environment: "development" },
  appearance: { mode: "light" },
};
const dataContext = { glossary: {}, description: "Static runtime component fixtures." };

function Gallery() {
  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <DataApp
      config={config}
      dataContext={dataContext}
      description="Shared defaults, interaction states, and inspection. Use the footer to switch themes."
    >
      <Stack>
        <nav className="gallery-navigation" aria-label="Gallery sections">
          {[
            "controls",
            "widgets",
            "buttons",
            "picker-edges",
            "refresh",
            "metrics",
            "tables",
            "charts",
            "requests",
            "dates",
            "empty-loading",
            "overlays",
            "chrome",
            "layout",
          ].map((id) => (
            <a key={id} href={`#${id}`}>
              {id.replaceAll("-", " ")}
            </a>
          ))}
        </nav>
        <section id="controls" aria-label="Control states">
          <Stack>
            <h2>Controls</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              <Button>Default button</Button>
              <Button variant="ghost" size="compact">
                Compact ghost action
              </Button>
              <Button disabled>Disabled action</Button>
              <Tooltip content="This describes the action">
                <Button>Hint action</Button>
              </Tooltip>
              <Checkbox
                label="Include archived records"
                description="Checkbox and picker marks share one implementation."
                checked={checked}
                onChange={setChecked}
              />
            </div>
            <SearchField label="Search gallery records" value={query} onChange={setQuery} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              <Combobox
                label="Categories"
                options={options}
                values={categories}
                onChange={setCategories}
                maxSelected={2}
                emptySelectionLabel="Choose categories"
                missingOption={{
                  id: "missing",
                  label: "No value",
                  description: "Records without a category value",
                }}
              />
              <Combobox
                label="Loading categories"
                options={loading ? [] : options}
                values={[]}
                onChange={() => {}}
                maxSelected={2}
                emptySelectionLabel="Choose categories"
                loading={loading}
              />
              <Button size="compact" onClick={() => setLoading(false)}>
                Complete loading
              </Button>
              <Combobox
                label="Refreshing categories"
                options={options}
                value="http"
                onChange={() => {}}
                loading
              />
              <Combobox
                label="Failed categories"
                options={options}
                value="http"
                onChange={() => {}}
                error={error}
                onRetry={() => setError(false)}
              />
              <Combobox
                label="Empty categories"
                options={[]}
                values={[]}
                onChange={() => {}}
                maxSelected={2}
                emptySelectionLabel="Choose categories"
              />
              <Combobox
                label="Disabled categories"
                options={options}
                value="http"
                onChange={() => {}}
                disabled
              />
            </div>
          </Stack>
        </section>
        <section id="widgets" aria-label="Widget states">
          <Stack>
            <h2>Widgets</h2>
            <Grid columns={2}>
              <VisualizationWidget
                title="Weekly activity"
                reading={{ loading: false, value: bars }}
                evidence={evidence}
                isEmpty={(items) => items.length === 0}
                empty={{ title: "No activity" }}
                viewLabel="Activity presentation"
                views={[
                  {
                    id: "chart",
                    label: "Chart",
                    render: (items) => (
                      <SelectableBarChart
                        items={items}
                        selectedId={selected}
                        onSelectionChange={setSelected}
                        unit="events"
                        ariaLabel="Weekly events"
                      />
                    ),
                  },
                  {
                    id: "summary",
                    label: "Summary",
                    render: (items) => (
                      <p>{items.reduce((sum, item) => sum + item.value, 0)} events this week</p>
                    ),
                  },
                ]}
              />
              <TableWidget
                title="Gallery records"
                rows={rows}
                rowKey={(row) => row.id}
                columns={[{ id: "name", header: "Record", cell: (row) => row.name }]}
                search={{
                  label: "Search table records",
                  value: query,
                  onChange: setQuery,
                  attributes: [{ name: "name", getter: (row) => row.name }],
                }}
                evidence={{ id: "gallery-records", queryNames: ["gallery-records"] }}
                empty={{ title: "No matching records" }}
              />
              <DataWidget
                title="Loading widget"
                reading={{ loading: true }}
                evidence={evidence}
                isEmpty={() => false}
                empty={{ title: "No activity" }}
              >
                {() => null}
              </DataWidget>
              <DataWidget
                title="Empty widget"
                empty={{ title: "No activity yet", description: "Choose another period." }}
              >
                {null}
              </DataWidget>
              <DataWidget
                title="Updating widget"
                status={{ kind: "updating", message: "Refreshing activity" }}
              >
                <p>The displayed result remains visible.</p>
              </DataWidget>
              <DataWidget
                title="Failed refresh"
                status={{ kind: "error", message: "Couldn’t refresh activity", onRetry: () => {} }}
              >
                <p>The last successful result remains visible.</p>
              </DataWidget>
            </Grid>
            <div style={{ maxWidth: 320 }} data-testid="narrow-controls">
              <Combobox
                label="A deliberately long category label for narrow layouts"
                options={options}
                value="postgres"
                onChange={() => {}}
              />
              <MetricWidget
                label="A long metric label that wraps without overflowing its container"
                value={0}
                format={{ kind: "count" }}
              />
            </div>
          </Stack>
        </section>
        <GalleryCases />
      </Stack>
    </DataApp>
  );
}

mountDataApp({ config, component: Gallery });
