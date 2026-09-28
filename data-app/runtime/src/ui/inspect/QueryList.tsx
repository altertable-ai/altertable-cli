import { useEffect, useState, type ComponentPropsWithRef, type ReactNode } from "react";
import type { DisclosedQuery } from "../../contract.ts";
import { Button } from "../primitives/Button.tsx";
import { classNames } from "../primitives/classNames.ts";
import { AppIcon } from "../primitives/icons.ts";
import { Tooltip } from "../primitives/Tooltip.tsx";
import "./QueryList.css";

export type QueryListProps = {
  queries?: DisclosedQuery[];
  names?: string[];
  summary?: ReactNode;
  expanded?: boolean;
} & Omit<ComponentPropsWithRef<"details">, "children">;

const CLAUSE =
  /\b(WITH|SELECT|FROM|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|UNION ALL|UNION|QUALIFY|WINDOW)\b/gi;
const KEYWORD =
  /\b(WITH|SELECT|FROM|WHERE|AND|OR|NOT|IN|AS|ON|JOIN|LEFT|RIGHT|INNER|FULL|OUTER|CROSS|GROUP BY|ORDER BY|HAVING|LIMIT|UNION|ALL|DISTINCT|CASE|WHEN|THEN|ELSE|END|NULL|TRUE|FALSE|BETWEEN|LIKE|ILIKE|EXISTS|VALUES|CAST|COUNT|SUM|AVG|MIN|MAX|QUALIFY|WINDOW|OVER|PARTITION|BY)\b/gi;

export function formatSql(statement: string): string {
  const trimmed = statement.trim();
  if (!trimmed || trimmed.includes("\n")) return trimmed;
  return trimmed.replace(/\s+/g, " ").replace(CLAUSE, "\n$1").replace(/^\n/, "");
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
  const [wrapped, setWrapped] = useState(true);
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
          <AppIcon name="sql" size={15} />
          {name.endsWith(".sql") ? name : `${name}.sql`}
        </span>
        <span className="altertable-query-actions">
          <Tooltip content={wrapped ? "Show unwrapped lines" : "Wrap long lines"}>
            <Button
              className="altertable-query-action"
              aria-label="Wrap long lines"
              aria-pressed={wrapped}
              onClick={() => setWrapped((value) => !value)}
            >
              <AppIcon name="wrap" size={16} />
            </Button>
          </Tooltip>
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
          {copyState === "error" && <span role="status">Could not copy SQL</span>}
        </span>
      </figcaption>
      <pre tabIndex={0} data-wrap={wrapped || undefined}>
        <SqlCode statement={statement} />
      </pre>
    </figure>
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
  if (expanded)
    return <div className={classNames("altertable-query-list", className)}>{figures}</div>;
  return (
    <details {...props} className={classNames("altertable-query-list", className)}>
      <summary>{summary}</summary>
      {figures}
    </details>
  );
}
