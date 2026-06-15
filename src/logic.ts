export const initialMarkdown = `# Untitled note

Open a vault from the File menu to browse and edit Markdown files.

- Single-click a directory to browse into it.
- Double-click a directory to open its shadow note.
- Double-click a file to open it in the editor.
`;

export const emptyTableMarkdown = `| Column 1 | Column 2 | Column 3 |
| --- | --- | --- |
|  |  |  |
|  |  |  |`;

export const defaultVaultAssetDirectory = "_assets_";
export const defaultDrawerOpen = false;
export const defaultVaultDrawerOpen = true;
export const defaultVaultDrawerWidth = 320;
export const defaultInspectorDrawerWidth = 360;
export const minResizableDrawerWidth = 220;
export const minEditorWorkspaceWidth = 360;
export const calendarDirectory = "Calendar";
export const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const monthLabels = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export type MarkdownParts = {
  metaHeader: string;
  metaDelimiter: "---" | "+++";
  body: string;
};

export type TocEntry = {
  id: string;
  level: number;
  title: string;
  occurrence: number;
};

export type SplitGroupId = "primary" | "secondary";

export type SplitTabGroup<Tab> = {
  id: SplitGroupId;
  tabs: Tab[];
  activeTabId: string;
};

export const defaultMetaDelimiter: MarkdownParts["metaDelimiter"] = "---";

const supportedImageTypes = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/gif", "gif"],
  ["image/webp", "webp"],
]);

type ImageFileLike = {
  name: string;
  type: string;
};

export function isMacOsPlatform(platform: string, userAgent = "") {
  const normalizedPlatform = platform.toLowerCase();
  const normalizedUserAgent = userAgent.toLowerCase();

  return (
    normalizedPlatform.startsWith("mac") ||
    normalizedUserAgent.includes("macintosh") ||
    normalizedUserAgent.includes("mac os x")
  );
}

export function timestampForAssetName(date = new Date()) {
  const pad = (value: number) => value.toString().padStart(2, "0");

  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(
    date.getHours(),
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export function imageExtensionForFile(file: ImageFileLike) {
  const mimeExtension = supportedImageTypes.get(file.type);

  if (mimeExtension) {
    return mimeExtension;
  }

  const extension = file.name.split(".").pop()?.toLowerCase();

  return extension && ["png", "jpg", "jpeg", "gif", "webp"].includes(extension)
    ? extension
    : "png";
}

export function isSupportedImageFile(file: ImageFileLike) {
  const extension = file.name.split(".").pop()?.toLowerCase();

  return (
    supportedImageTypes.has(file.type) ||
    !!extension && ["png", "jpg", "jpeg", "gif", "webp"].includes(extension)
  );
}

export function sanitizeAssetNameStem(fileName: string) {
  const withoutPath = fileName.split(/[/\\]/).pop() ?? "";
  const withoutExtension = withoutPath.replace(/\.[^.]+$/, "");
  const sanitized = withoutExtension
    .replace(/[^\w\s.-]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[\s.-]+|[\s.-]+$/g, "");

  if (!sanitized || /^image$/i.test(sanitized)) {
    return "Pasted image";
  }

  return sanitized;
}

export function fileNameForDroppedImage(file: ImageFileLike, date = new Date()) {
  const stem = sanitizeAssetNameStem(file.name);
  const extension = imageExtensionForFile(file);

  return `${stem} ${timestampForAssetName(date)}.${extension}`;
}

export function parentDirectory(relativePath: string) {
  const parts = relativePath.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

export function displayPath(path: string) {
  return path || "/";
}

export function fileNameWithoutMarkdownExtension(fileName: string) {
  return fileName.replace(/\.(md|markdown)$/i, "");
}

export function tabIdForFile(relativePath: string) {
  return `file:${relativePath}`;
}

export function findTabAcrossSplitGroups<Tab extends { id: string }>(
  groups: Record<SplitGroupId, SplitTabGroup<Tab>>,
  tabId: string,
) {
  const groupIds: SplitGroupId[] = ["primary", "secondary"];

  for (const groupId of groupIds) {
    const tab = groups[groupId].tabs.find((candidate) => candidate.id === tabId);

    if (tab) {
      return { groupId, tab };
    }
  }

  return null;
}

export function splitHasDirtyTabs<Tab extends { dirty: boolean }>(tabs: Tab[]) {
  return tabs.some((tab) => tab.dirty);
}

export function remainingGroupAfterSplitPaneClose<Tab extends { id: string }>(
  groups: Record<SplitGroupId, SplitTabGroup<Tab>>,
  closedGroupId: SplitGroupId,
) {
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
  const availableWidth = workspaceWidth - oppositeWidth - handleWidth - minimumEditorWidth;
  const maximumWidth = Math.max(minimumWidth, availableWidth);

  return Math.min(Math.max(requestedWidth, minimumWidth), maximumWidth);
}

export function ordinalSuffix(day: number) {
  if (day >= 11 && day <= 13) {
    return "th";
  }

  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

export function calendarDayTitle(date: Date) {
  const weekday = weekdayLabels[date.getDay()];
  const month = monthLabels[date.getMonth()];
  const day = date.getDate();

  return `${weekday}, ${month} ${day}${ordinalSuffix(day)} ${date.getFullYear()}`;
}

export function calendarDayRelativePath(date: Date) {
  return `${calendarDirectory}/${calendarDayTitle(date)}.md`;
}

export function calendarDateKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
}

export function calendarPathDateKey(relativePath: string) {
  const fileName = relativePath.split("/").pop() ?? "";
  const match = fileName.match(
    /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat), (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2})(?:st|nd|rd|th)? (\d{4})\.md$/,
  );

  if (!match) {
    return null;
  }

  const [, weekday, monthLabel, dayText, yearText] = match;
  const monthIndex = monthLabels.indexOf(monthLabel);
  const day = Number(dayText);
  const year = Number(yearText);
  const date = new Date(year, monthIndex, day);

  if (
    monthIndex < 0 ||
    date.getFullYear() !== year ||
    date.getMonth() !== monthIndex ||
    date.getDate() !== day ||
    weekdayLabels[date.getDay()] !== weekday
  ) {
    return null;
  }

  return calendarDateKey(date);
}

export function monthTitle(date: Date) {
  return `${date.toLocaleString(undefined, { month: "long" })} ${date.getFullYear()}`;
}

export function sameCalendarDate(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function markdownHeadings(markdown: string): TocEntry[] {
  const headings: TocEntry[] = [];
  const occurrences = new Map<string, number>();
  let inFence = false;
  let fenceMarker = "";

  for (const line of markdown.split(/\r?\n/)) {
    const fenceMatch = line.match(/^\s*(```+|~~~+)/);

    if (fenceMatch) {
      const marker = fenceMatch[1][0];

      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
      } else if (marker === fenceMarker) {
        inFence = false;
        fenceMarker = "";
      }

      continue;
    }

    if (inFence) {
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*$/);

    if (!headingMatch) {
      continue;
    }

    const title = headingMatch[2].replace(/\s+#+\s*$/, "").trim();

    if (!title) {
      continue;
    }

    const level = headingMatch[1].length;
    const key = `${level}:${title}`;
    const occurrence = (occurrences.get(key) ?? 0) + 1;

    occurrences.set(key, occurrence);
    headings.push({
      id: `${key}:${occurrence}`,
      level,
      title,
      occurrence,
    });
  }

  return headings;
}

export function splitMetaHeader(content: string): MarkdownParts {
  const delimiter = content.startsWith("---\n") || content.startsWith("---\r\n")
    ? "---"
    : content.startsWith("+++\n") || content.startsWith("+++\r\n")
      ? "+++"
      : null;

  if (!delimiter) {
    return { metaHeader: "", metaDelimiter: defaultMetaDelimiter, body: content };
  }

  const linePattern = /\r?\n/g;
  let match: RegExpExecArray | null;

  while ((match = linePattern.exec(content)) !== null) {
    const lineStart = match.index + match[0].length;
    const nextBreak = content.indexOf("\n", lineStart);
    const lineEnd = nextBreak === -1 ? content.length : nextBreak;
    const line = content.slice(lineStart, lineEnd).replace(/\r$/, "");

    if (line === delimiter) {
      const headerEnd = nextBreak === -1 ? content.length : nextBreak + 1;

      return {
        metaHeader: content
          .slice(content.indexOf("\n") + 1, match.index)
          .replace(/\r\n/g, "\n")
          .replace(/\r$/, ""),
        metaDelimiter: delimiter,
        body: content.slice(headerEnd),
      };
    }
  }

  return { metaHeader: "", metaDelimiter: defaultMetaDelimiter, body: content };
}

export function composeMarkdown(
  metaHeader: string,
  metaDelimiter: MarkdownParts["metaDelimiter"],
  body: string,
) {
  const cleanMeta = metaHeader.trim();

  if (!cleanMeta) {
    return body;
  }

  return `${metaDelimiter}\n${cleanMeta}\n${metaDelimiter}\n${body}`;
}

export function isUrlLike(value: string) {
  return /^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith("//");
}

export function cleanVaultAssetReference(value: string) {
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

  if (
    parts.length === 0 ||
    parts.some((part) => part === "." || part === "..")
  ) {
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
