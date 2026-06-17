/**
 * Split-pane and tab-state helpers.
 *
 * Responsibilities:
 * - Keep document tab close, lookup, recent-file, and split-pane normalization logic pure.
 * - Clamp drawer widths so resize behavior cannot collapse the editor workspace.
 *
 * Contracts:
 * - Helpers must not mutate their inputs; React state updates depend on value replacement.
 * - The editor always normalizes back to a primary group when one split pane disappears.
 */

import {
  maxRecentFiles,
  minEditorWorkspaceWidth,
  minResizableDrawerWidth,
} from "./defaults.js";

export type SplitGroupId = "primary" | "secondary";

export type SplitTabGroup<Tab> = {
  id: SplitGroupId;
  tabs: Tab[];
  activeTabId: string;
};

export function tabIdForFile(relativePath: string) {
  return `file:${relativePath}`;
}

export function findTabAcrossSplitGroups<Tab extends { id: string }>(
  groups: Record<SplitGroupId, SplitTabGroup<Tab>>,
  tabId: string,
) {
  // A file should have one editable owner at a time. When a path is already
  // open in either split, the UI switches to that tab instead of creating a
  // second copy that could later race on save.
  const groupIds: SplitGroupId[] = ["primary", "secondary"];

  for (const groupId of groupIds) {
    const tab = groups[groupId].tabs.find((candidate) => candidate.id === tabId);

    if (tab) {
      return { groupId, tab };
    }
  }

  return null;
}

export function tabsAfterClose<Tab extends { id: string }>(
  tabs: Tab[],
  activeTabId: string,
  closedTabId: string,
) {
  const closedIndex = tabs.findIndex((tab) => tab.id === closedTabId);

  if (closedIndex === -1) {
    return null;
  }

  const nextTabs = tabs.filter((tab) => tab.id !== closedTabId);
  const wasActiveTab = closedTabId === activeTabId;
  const nextActiveTab =
    wasActiveTab && nextTabs.length > 0
      ? nextTabs[Math.min(closedIndex, nextTabs.length - 1)]
      : (nextTabs.find((tab) => tab.id === activeTabId) ?? null);

  return {
    nextTabs,
    nextActiveTab,
    nextActiveTabId: nextActiveTab?.id ?? "",
    wasActiveTab,
  };
}

export function splitHasDirtyTabs<Tab extends { dirty: boolean }>(tabs: Tab[]) {
  return tabs.some((tab) => tab.dirty);
}

export function recentFilesWithOpenedFile<File extends { name: string; relativePath: string }>(
  recentFiles: File[],
  openedFile: File,
  limit = maxRecentFiles,
) {
  const seenPath = openedFile.relativePath.toLowerCase();
  const deduplicated = recentFiles.filter(
    (file) => file.relativePath.toLowerCase() !== seenPath,
  );

  return [openedFile, ...deduplicated].slice(0, limit);
}

export function remainingGroupAfterSplitPaneClose<Tab extends { id: string }>(
  groups: Record<SplitGroupId, SplitTabGroup<Tab>>,
  closedGroupId: SplitGroupId,
) {
  // The rest of the app assumes there is always a primary editor group. When
  // closing the last tab in one split pane, the surviving pane is normalized
  // back into primary rather than keeping a visible "secondary-only" state.
  const remainingGroupId: SplitGroupId = closedGroupId === "primary" ? "secondary" : "primary";
  const remainingGroup = groups[remainingGroupId];
  const activeTab =
    remainingGroup.tabs.find((tab) => tab.id === remainingGroup.activeTabId) ??
    remainingGroup.tabs[0];

  if (!activeTab) {
    return null;
  }

  return {
    remainingGroupId,
    activeTab,
    primaryGroup: {
      id: "primary" as const,
      tabs: remainingGroup.tabs,
      activeTabId: remainingGroup.activeTabId || activeTab.id,
    },
  };
}

export function clampResizableDrawerWidth(
  requestedWidth: number,
  workspaceWidth: number,
  oppositeWidth: number,
  handleWidth: number,
  minimumWidth = minResizableDrawerWidth,
  minimumEditorWidth = minEditorWorkspaceWidth,
) {
  // Drawer dragging is constrained by the editor, not just the drawer itself:
  // shrinking the center area too far makes the WYSIWYG surface unusable.
  const availableWidth = workspaceWidth - oppositeWidth - handleWidth - minimumEditorWidth;
  const maximumWidth = Math.max(minimumWidth, availableWidth);

  return Math.min(Math.max(requestedWidth, minimumWidth), maximumWidth);
}
