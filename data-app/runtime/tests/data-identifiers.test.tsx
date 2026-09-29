import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { defineDataIdentifiers } from "../src/react/ui/data-identifiers.tsx";

const identifiers = defineDataIdentifiers({
  tables: {
    events: { catalog: "product_analytics", schema: "analytics", name: "events" },
  },
  columns: {
    identityUuid: { table: "events", name: "identity_uuid" },
  },
});

test("data identifiers render exact source names from compact IDs", () => {
  const { DataIdentifier } = identifiers;
  const html = renderToStaticMarkup(
    <p>
      <DataIdentifier id="tables.events" /> uses <DataIdentifier id="columns.events.identityUuid" />
      .
    </p>,
  );
  expect(html.replace(/<[^>]*>/g, "")).toContain(
    "product_analytics.analytics.events uses identity_uuid.",
  );
  expect(html).toContain('data-kind="table"');
  expect(html).toContain('data-kind="column"');
  expect(html).toContain('title="product_analytics.analytics.events.identity_uuid"');
  expect(identifiers.definitions["columns.events.identityUuid"]).toEqual({
    kind: "column",
    tableId: "tables.events",
    table: { catalog: "product_analytics", schema: "analytics", name: "events" },
    name: "identity_uuid",
  });
});

test("aliases cannot obscure the compact ID structure", () => {
  expect(() =>
    defineDataIdentifiers({
      tables: { "events.archive": { catalog: "a", schema: "b", name: "events" } },
      columns: {},
    }),
  ).toThrow("Invalid data identifier alias events.archive.");
});

test("unknown references fail rather than rendering misleading text", () => {
  const { DataIdentifier } = identifiers;
  expect(() =>
    renderToStaticMarkup(<DataIdentifier id={"tables.missing" as "tables.events"} />),
  ).toThrow("Unknown data identifier tables.missing.");
});

// @ts-expect-error Unknown reference IDs must fail app typechecking.
const unknownIdentifier = <identifiers.DataIdentifier id="columns.events.missing" />;
void unknownIdentifier;

function invalidIdentifierDefinition() {
  const unknownTable = defineDataIdentifiers({
    tables: { events: { catalog: "a", schema: "b", name: "c" } },
    // @ts-expect-error A column must name a registered table.
    columns: { id: { table: "missing", name: "id" } },
  });
  return unknownTable;
}
void invalidIdentifierDefinition;
