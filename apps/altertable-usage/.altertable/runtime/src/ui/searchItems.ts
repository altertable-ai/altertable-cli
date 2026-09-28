import fuzzysort from "fuzzysort";

export type SearchRange = { start: number; end: number };
/** The exact displayed text and its offsets stay together for safe rendering. */
export type SearchMatchValue = { text: string; ranges: readonly SearchRange[] };
export type SearchAttribute<Item> = {
  name: string;
  getter: (item: Item) => string;
  weight?: number;
};
export type SearchHit<Item> = {
  item: Item;
  score: number;
  /** Render displayed fields with <SearchMatch match={hit.matches.fieldName} />. */
  matches: Record<string, SearchMatchValue>;
};
export type SearchItemsOptions<Item> = {
  attributes: readonly [SearchAttribute<Item>, ...SearchAttribute<Item>[]];
  /** Literal filtering preserves source order; fuzzy search ranks discovery results. */
  mode?: "literal" | "fuzzy";
  limit?: number;
  fuzzyThreshold?: number;
};

function mergeRanges(ranges: SearchRange[]): SearchRange[] {
  const sorted = ranges.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: SearchRange[] = [];
  for (const range of sorted) {
    const previous = merged.at(-1);
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}

/** Fold accents without losing offsets into the original string. */
function fold(text: string) {
  let value = "";
  const offsets: SearchRange[] = [];
  for (let start = 0; start < text.length;) {
    const point = text.codePointAt(start)!;
    const original = String.fromCodePoint(point);
    const end = start + original.length;
    const normalized = original
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLocaleLowerCase();
    for (let index = 0; index < normalized.length; index++) offsets.push({ start, end });
    value += normalized;
    start = end;
  }
  return { value, offsets };
}

function literalRanges(text: string, terms: readonly string[]): SearchRange[][] {
  const folded = fold(text);
  return terms.map((term) => {
    const ranges: SearchRange[] = [];
    for (
      let index = folded.value.indexOf(term);
      index !== -1;
      index = folded.value.indexOf(term, index + term.length)
    ) {
      const first = folded.offsets[index];
      const last = folded.offsets[index + term.length - 1];
      if (first && last) ranges.push({ start: first.start, end: last.end });
    }
    return ranges;
  });
}

/**
 * Search only a complete local collection. Empty queries retain every item.
 * When a searched field is displayed, render its match with SearchMatch:
 * `hits.map(hit => <SearchMatch match={hit.matches.name} />)`.
 * Fields used only to find a row need no visible highlight.
 */
export function searchItems<Item>(
  items: readonly Item[],
  query: string,
  options: SearchItemsOptions<Item>,
): SearchHit<Item>[] {
  const normalizedQuery = fold(query.trim()).value;
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  const mode = options.mode ?? "literal";
  const hits: SearchHit<Item>[] = [];

  for (const item of items) {
    const matches: Record<string, SearchMatchValue> = {};
    let score = 0;
    let matched = terms.length === 0;
    const matchedTerms = new Set<number>();

    for (const attribute of options.attributes) {
      const value = attribute.getter(item);
      const fuzzy =
        mode === "fuzzy" && normalizedQuery ? fuzzysort.single(query.trim(), value) : null;
      if (fuzzy && fuzzy.score >= (options.fuzzyThreshold ?? 0.3)) {
        matched = true;
        score = Math.max(score, fuzzy.score * (attribute.weight ?? 1));
        matches[attribute.name] = {
          text: value,
          ranges: mergeRanges(
            [...fuzzy.indexes].map((index) => ({ start: index, end: index + 1 })),
          ),
        };
      } else if (mode === "literal" && terms.length) {
        const termMatches = literalRanges(value, terms);
        termMatches.forEach((ranges, index) => {
          if (ranges.length) matchedTerms.add(index);
        });
        matches[attribute.name] = { text: value, ranges: mergeRanges(termMatches.flat()) };
      } else {
        matches[attribute.name] = { text: value, ranges: [] };
      }
    }

    if (mode === "literal" && terms.length) matched = matchedTerms.size === terms.length;
    if (matched) hits.push({ item, score, matches });
  }
  if (mode === "fuzzy" && terms.length) hits.sort((a, b) => b.score - a.score);
  return options.limit === undefined ? hits : hits.slice(0, Math.max(0, options.limit));
}
