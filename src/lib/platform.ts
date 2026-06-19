/**
 * Platform detection helpers.
 *
 * Responsibilities:
 * - Keep platform-specific UI decisions testable without reading browser globals directly.
 *
 * Contracts:
 * - Callers provide platform/user-agent strings; this module has no side effects.
 * - Detection is intentionally conservative and used only for presentation/shortcut behavior.
 */

export function isMacOsPlatform(platform: string, userAgent = "") {
  const normalizedPlatform = platform.toLowerCase();
  const normalizedUserAgent = userAgent.toLowerCase();

  return (
    normalizedPlatform.startsWith("mac") ||
    normalizedUserAgent.includes("macintosh") ||
    normalizedUserAgent.includes("mac os x")
  );
}

export function isWindowsPlatform(platform: string, userAgent = "") {
  const normalizedPlatform = platform.toLowerCase();
  const normalizedUserAgent = userAgent.toLowerCase();

  return normalizedPlatform.startsWith("win") || normalizedUserAgent.includes("windows");
}
