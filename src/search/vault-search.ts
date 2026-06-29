import type { SearchResult } from "../lib/app-types";

// Responsibilities:
// - Shape raw vault search rows into drawer rows.
// Contracts:
// - Backend rows are one-per-match; UI rows are one-per-file with a match count.
// - Results are newest-first by modified timestamp.

export function visibleVaultSearchResults(searchResults: SearchResult[]) {
  const seenPaths = new Set<string>();
  const matchCounts = searchResults.reduce((counts, result) => {
    counts.set(result.relativePath, (counts.get(result.relativePath) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());

  return searchResults
    .filter((result) => {
      if (seenPaths.has(result.relativePath)) {
        return false;
      }

      seenPaths.add(result.relativePath);
      return true;
    })
    .sort((left, right) => (right.modifiedMs ?? 0) - (left.modifiedMs ?? 0))
    .map((result) => ({
      result,
      matchCount: matchCounts.get(result.relativePath) ?? 1,
    }));
}
