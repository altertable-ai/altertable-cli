import type { ComponentPropsWithRef } from "react";
import { classNames } from "./classNames.ts";
import type { SearchMatchValue } from "./searchItems.ts";
import "./SearchMatch.css";

export type SearchMatchProps = {
  match: SearchMatchValue;
} & Omit<ComponentPropsWithRef<"span">, "children">;

export function SearchMatch({ match, className, ...props }: SearchMatchProps) {
  const { text, ranges } = match;
  const parts = [];
  let position = 0;
  for (const range of ranges) {
    const start = Math.max(position, Math.min(text.length, range.start));
    const end = Math.max(start, Math.min(text.length, range.end));
    if (start > position) parts.push(text.slice(position, start));
    if (end > start) parts.push(<mark key={`${start}-${end}`}>{text.slice(start, end)}</mark>);
    position = end;
  }
  if (position < text.length) parts.push(text.slice(position));
  return (
    <span {...props} className={classNames("altertable-search-match", className)}>
      {parts}
    </span>
  );
}
