import "./data-identifiers.css";

export type TableIdentifier = { catalog: string; schema: string; name: string };
export type ColumnIdentifier<TableId extends string = string> = {
  table: TableId;
  name: string;
};

export type DataIdentifierDefinition =
  | ({ kind: "table" } & TableIdentifier)
  | { kind: "column"; tableId: `tables.${string}`; table: TableIdentifier; name: string };

type IdentifierId<
  Tables extends Record<string, TableIdentifier>,
  Columns extends Record<string, ColumnIdentifier<Extract<keyof Tables, string>>>,
> =
  | `tables.${Extract<keyof Tables, string>}`
  | {
      [Id in Extract<keyof Columns, string>]: `columns.${Columns[Id]["table"]}.${Id}`;
    }[Extract<keyof Columns, string>];

function qualifiedName(definition: DataIdentifierDefinition): string {
  const table = definition.kind === "table" ? definition : definition.table;
  const path = [table.catalog, table.schema, table.name].join(".");
  return definition.kind === "column" ? `${path}.${definition.name}` : path;
}

function assertAlias(id: string) {
  if (!id || id.includes(".")) throw new Error(`Invalid data identifier alias ${id}.`);
}

/** Register exact source names once; returned JSX IDs are checked against this registry. */
export function defineDataIdentifiers<
  const Tables extends Record<string, TableIdentifier>,
  const Columns extends Record<string, ColumnIdentifier<Extract<keyof Tables, string>>>,
>({ tables, columns }: { tables: Tables; columns: Columns }) {
  type Id = IdentifierId<Tables, Columns>;
  const definitions: Record<string, DataIdentifierDefinition> = Object.create(null);

  for (const [id, table] of Object.entries(tables)) {
    assertAlias(id);
    definitions[`tables.${id}`] = { kind: "table", ...table };
  }
  for (const [id, column] of Object.entries(columns)) {
    assertAlias(id);
    const table = tables[column.table];
    if (!table) throw new Error(`Unknown table ${column.table} for column ${id}.`);
    definitions[`columns.${column.table}.${id}`] = {
      kind: "column",
      tableId: `tables.${column.table}`,
      table,
      name: column.name,
    };
  }

  function DataIdentifier({ id, display }: { id: Id; display?: "short" | "qualified" }) {
    const definition = definitions[id];
    if (!definition) throw new Error(`Unknown data identifier ${id}.`);
    const qualified = qualifiedName(definition);
    const shown = display ?? (definition.kind === "table" ? "qualified" : "short");
    return (
      <code className="altertable-data-identifier" title={qualified} data-identifier-id={id}>
        {shown === "qualified" ? qualified : definition.name}
      </code>
    );
  }

  return {
    definitions: definitions as Readonly<Record<Id, DataIdentifierDefinition>>,
    DataIdentifier,
  };
}
