/**
 * Vault path display and markdown URL helpers.
 *
 * Responsibilities:
 * - Normalize vault-relative display paths for the sidebar and tabs.
 * - Clean local image references before converting them into vault asset URLs.
 * - Escape markdown image labels and URLs for generated markdown.
 *
 * Contracts:
 * - Frontend cleaning is a UX/model guard only; Rust remains the filesystem trust boundary.
 * - Local image references must never accept absolute URLs or parent traversal.
 */

export function parentDirectory(relativePath: string) {
  const parts = relativePath.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

export function displayPath(path: string) {
  return path || "/";
}

export function displayVaultRelativePath(path: string, vaultRoot = "") {
  const cleanRoot = vaultRoot
    .split("/")
    .filter(Boolean)
    .join("/");
  const cleanPath = path
    .split("/")
    .filter(Boolean)
    .join("/");
  const relativePath =
    cleanRoot && (cleanPath === cleanRoot || cleanPath.startsWith(`${cleanRoot}/`))
      ? cleanPath.slice(cleanRoot.length).replace(/^\/+/, "")
      : cleanPath;

  if (!relativePath) {
    return "/";
  }

  return relativePath.replace(/\.(md|markdown)$/i, "");
}

export function fileNameWithoutMarkdownExtension(fileName: string) {
  return fileName.replace(/\.(md|markdown)$/i, "");
}

export function isUrlLike(value: string) {
  return /^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith("//");
}

export function cleanVaultAssetReference(value: string) {
  // Local image syntax accepts Obsidian-style aliases and percent-encoded
  // markdown URLs, but never absolute URLs or path traversal. The backend
  // performs its own filesystem checks; this keeps the editor model clean.
  const trimmed = value.trim();

  if (!trimmed || isUrlLike(trimmed)) {
    return null;
  }

  const withoutAlias = trimmed.split("|")[0]?.trim() ?? "";
  let decoded = withoutAlias;

  try {
    decoded = decodeURIComponent(withoutAlias);
  } catch {
    return null;
  }

  if (isUrlLike(decoded)) {
    return null;
  }

  const parts = decoded.split(/[\\/]+/).filter(Boolean);

  if (parts.length === 0 || parts.some((part) => part === "." || part === "..")) {
    return null;
  }

  return parts.join("/");
}

export function escapeMarkdownImageText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\]/g, "\\]");
}

export function escapeMarkdownUrl(value: string) {
  if (isUrlLike(value)) {
    return value.replace(/\\/g, "\\\\").replace(/\)/g, "\\)");
  }

  return value
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")
    .replace(/\)/g, "\\)");
}
