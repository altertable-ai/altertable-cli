const SEARCH_CHANGE = "altertable:searchchange";

/** Current page search params. */
export function searchParams(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}

/** Listen to Back/Forward and writes made by another runtime control. */
export function subscribeSearch(listener: () => void): () => void {
  window.addEventListener("popstate", listener);
  window.addEventListener(SEARCH_CHANGE, listener);
  return () => {
    window.removeEventListener("popstate", listener);
    window.removeEventListener(SEARCH_CHANGE, listener);
  };
}

/** Write search keys. `null` removes a key. Skips the history write when nothing changed. */
export function writeSearch(
  update: Record<string, string | null>,
  mode: "replace" | "push" = "replace",
): void {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(update)) {
    if (value == null || value === "") url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  const next = `${url.pathname}${url.search}${url.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next === current) return;
  window.history[mode === "push" ? "pushState" : "replaceState"](null, "", next);
  window.dispatchEvent(new Event(SEARCH_CHANGE));
}

/** Stable token for a sheet or tab. */
export function slug(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[^\w]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "item"
  );
}
