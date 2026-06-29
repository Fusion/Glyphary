import type { ActiveFile, RenamedDirectory, VaultEntry } from "../lib/app-types";

// Responsibilities:
// - Keep vault-relative path rebasing helpers outside App.
// Contracts:
// - Directory shadow notes move with their owning directory.
// - Returned ActiveFile names are derived from the final relative path.

export function relativePathFileName(relativePath: string) {
  return relativePath.split("/").pop() || relativePath;
}

export function rebasePathAfterDirectoryRename(
  relativePath: string,
  oldDirectory: VaultEntry,
  newDirectory: RenamedDirectory,
) {
  const oldDirectoryPath = oldDirectory.relativePath;
  const newDirectoryPath = newDirectory.relativePath;
  const oldShadowPath = `${oldDirectoryPath}/${oldDirectory.name}.md`;
  const newShadowPath = `${newDirectoryPath}/${newDirectory.name}.md`;

  if (relativePath === oldShadowPath) {
    return newShadowPath;
  }

  if (relativePath === oldDirectoryPath) {
    return newDirectoryPath;
  }

  if (relativePath.startsWith(`${oldDirectoryPath}/`)) {
    return `${newDirectoryPath}${relativePath.slice(oldDirectoryPath.length)}`;
  }

  return relativePath;
}

export function activeFileWithRelativePath(relativePath: string): ActiveFile {
  return {
    name: relativePathFileName(relativePath),
    relativePath,
  };
}
