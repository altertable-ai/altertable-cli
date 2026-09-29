import { useEffect, useState, type ComponentPropsWithRef, type ReactNode } from "react";
import type { DisclosedQuery } from "../contract.ts";
import { Button } from "./Button.tsx";
import { classNames } from "./classNames.ts";
import { AppIcon } from "./icons.ts";
import { Tooltip } from "./Tooltip.tsx";
import "./QueryList.css";

export type QueryListProps = {
  queries?: DisclosedQuery[];
  names?: string[];
  summary?: ReactNode;
  expanded?: boolean;
} & Omit<ComponentPropsWithRef<"details">, "children">;

const KEYWORD =
  /\b(WITH|SELECT|FROM|WHERE|AND|OR|NOT|IN|AS|ON|JOIN|LEFT|RIGHT|INNER|FULL|OUTER|CROSS|GROUP BY|ORDER BY|HAVING|LIMIT|UNION|ALL|DISTINCT|CASE|WHEN|THEN|ELSE|END|NULL|TRUE|FALSE|BETWEEN|LIKE|ILIKE|EXISTS|VALUES|CAST|COUNT|SUM|AVG|MIN|MAX|QUALIFY|WINDOW|OVER|PARTITION|BY)\b/gi;

export function formatSql(statement: string): string {
  return statement.trim();
}

function SqlCode({ statement }: { statement: string }) {
  const formatted = formatSql(statement);
  const parts = formatted.split(KEYWORD);
  return (
    <code>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <span key={index} className="altertable-sql-keyword">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </code>
  );
}

function QueryFigure({ name, statement }: { name: string; statement: string }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  useEffect(() => {
    if (copyState === "idle") return;
    const timer = window.setTimeout(() => setCopyState("idle"), 1500);
    return () => window.clearTimeout(timer);
  }, [copyState]);
  async function copySql() {
    try {
      await navigator.clipboard.writeText(formatSql(statement));
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }
  return (
    <figure>
      <figcaption>
        <span className="altertable-query-filename">
          {name.endsWith(".sql") ? name : `${name}.sql`}
        </span>
        <span className="altertable-query-actions">
          <Tooltip
            content={
              copyState === "copied"
                ? "Copied SQL"
                : copyState === "error"
                  ? "Could not copy SQL"
                  : "Copy SQL"
            }
          >
            <Button
              className="altertable-query-action"
              aria-label={copyState === "copied" ? "Copied SQL" : `Copy SQL for ${name}`}
              onClick={() => void copySql()}
            >
              <AppIcon name={copyState === "copied" ? "check" : "copy"} size={16} />
            </Button>
          </Tooltip>
          {copyState === "error" && <output>Could not copy SQL</output>}
        </span>
      </figcaption>
      <pre>
        <SqlCode statement={statement} />
      </pre>
    </figure>
  );
}

function QueryNotebook({ queries, className }: { queries: DisclosedQuery[]; className?: string }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  useEffect(() => {
    if (copyState === "idle") return;
    const timer = window.setTimeout(() => setCopyState("idle"), 1500);
    return () => window.clearTimeout(timer);
  }, [copyState]);
  async function copyAll() {
    const sql = queries
      .map(({ name, statement }) => {
        const formatted = formatSql(statement);
        return `-- ${name.endsWith(".sql") ? name : `${name}.sql`}\n${formatted.endsWith(";") ? formatted : `${formatted};`}`;
      })
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(sql);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }
  return (
    <section
      className={classNames("altertable-query-list", "altertable-query-notebook", className)}
      aria-label="Query notebook"
    >
      <header className="altertable-query-notebook-header">
        <span>
          {queries.length} {queries.length === 1 ? "SQL query" : "SQL queries"}
        </span>
        <Button
          aria-label={copyState === "copied" ? "Copied all SQL" : "Copy all SQL"}
          onClick={() => void copyAll()}
        >
          <AppIcon name={copyState === "copied" ? "check" : "copy"} size={16} />
          {copyState === "copied" ? "Copied" : "Copy all SQL"}
        </Button>
      </header>
      {copyState === "error" && (
        <output className="altertable-query-notebook-error">Could not copy SQL</output>
      )}
      {queries.map((query) => (
        <QueryFigure key={query.name} name={query.name} statement={query.statement} />
      ))}
    </section>
  );
}

/**
 * `names` selects supporting queries. Missing query evidence is shown explicitly; `expanded`
 * skips the disclosure in a dedicated Queries view.
 */
export function QueryList({
  queries,
  names,
  summary = "Show SQL",
  expanded = false,
  className,
  ...props
}: QueryListProps) {
  const shown = names
    ? (queries ?? []).filter((query) => names.includes(query.name))
    : (queries ?? []);
  if (!shown.length) {
    if (names?.length)
      return <p className="altertable-query-unavailable">SQL was not included with this result.</p>;
    return expanded ? (
      <p className="altertable-query-unavailable">No queries in this view.</p>
    ) : null;
  }
  const figures = shown.map((query) => (
    <QueryFigure key={query.name} name={query.name} statement={query.statement} />
  ));
  if (expanded) return <QueryNotebook queries={shown} className={className} />;
  return (
    <details {...props} className={classNames("altertable-query-list", className)}>
      <summary>{summary}</summary>
      {figures}
    </details>
  );
}
