/**
 * Compatibility barrel for pure frontend logic.
 *
 * Responsibilities:
 * - Preserve the historical `./logic` import surface used by `App.tsx` and tests.
 * - Re-export focused helper modules from `src/lib`.
 *
 * Contracts:
 * - New pure helpers should live in `src/lib/*`, not directly in this barrel.
 * - React components, Tauri calls, and editor side effects do not belong here.
 */

export * from "./lib/assets.js";
export * from "./lib/calendar.js";
export * from "./lib/dates.js";
export * from "./lib/defaults.js";
export * from "./lib/markdown.js";
export * from "./lib/paths.js";
export * from "./lib/platform.js";
export * from "./lib/rich-links.js";
export * from "./lib/tabs.js";
