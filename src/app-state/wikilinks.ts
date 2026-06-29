import {
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type {
  ActiveFile,
  OpenedFile,
  VaultIndexedFile,
  WikiLinkPickerState,
} from "../lib/app-types";
import { fileNameWithoutMarkdownExtension } from "../lib/paths";
import { type WikiLinkResolution, wikiLinkTargetFromMarkup } from "../editor/wikilinks";

// Responsibilities:
// - Own App-level wikilink index/search/picker state and imperative refs.
// - Keep filename matching and index mutation in one place.
// Contracts:
// - This hook never opens files or edits the editor; App supplies those side effects.
// - Only Markdown files are indexed for wikilink completion and resolution.

export function wikiLinkDisplayName(file: VaultIndexedFile) {
  return fileNameWithoutMarkdownExtension(file.name);
}

function normalizeWikiLinkText(value: string) {
  return value.trim().toLowerCase();
}

function addIndexedFile(files: VaultIndexedFile[], file: ActiveFile | OpenedFile) {
  if (!file.name.toLowerCase().endsWith(".md")) {
    return files;
  }

  const indexed = {
    name: file.name,
    relativePath: file.relativePath,
  };
  const withoutExisting = files.filter((candidate) => candidate.relativePath !== indexed.relativePath);

  return [...withoutExisting, indexed].sort((left, right) =>
    wikiLinkDisplayName(left)
      .toLowerCase()
      .localeCompare(wikiLinkDisplayName(right).toLowerCase()) ||
    left.relativePath.localeCompare(right.relativePath),
  );
}

function removeIndexedFile(files: VaultIndexedFile[], relativePath: string) {
  return files.filter((file) => file.relativePath !== relativePath);
}

function replaceIndexedFile(
  files: VaultIndexedFile[],
  oldRelativePath: string,
  nextFile: ActiveFile | OpenedFile,
) {
  return addIndexedFile(removeIndexedFile(files, oldRelativePath), nextFile);
}

export function useWikiLinkState() {
  const [wikiLinkIndex, setWikiLinkIndex] = useState<VaultIndexedFile[]>([]);
  const [wikiLinkIndexVersion, setWikiLinkIndexVersion] = useState(0);
  const [wikiLinkSearchOpen, setWikiLinkSearchOpen] = useState(false);
  const [wikiLinkSearchQuery, setWikiLinkSearchQuery] = useState("");
  const [wikiLinkSearchSelectedIndex, setWikiLinkSearchSelectedIndex] = useState(0);
  const [wikiLinkPicker, setWikiLinkPicker] = useState<WikiLinkPickerState | null>(null);
  const [wikiLinkPickerSelectedIndex, setWikiLinkPickerSelectedIndex] = useState(0);

  const wikiLinkIndexRef = useRef<VaultIndexedFile[]>([]);
  const wikiLinkSearchInputRef = useRef<HTMLInputElement | null>(null);
  const openWikiLinkSearchRef = useRef<() => void>(() => undefined);
  const resolveWikiLinkTargetRef = useRef<(target: string) => WikiLinkResolution>(() => ({
    candidates: [],
  }));
  const openWikiLinkTargetRef = useRef<
    (target: string, event?: MouseEvent | ReactMouseEvent<HTMLElement>) => void
  >(() => undefined);

  function setWikiLinkIndexAndRef(files: VaultIndexedFile[]) {
    wikiLinkIndexRef.current = files;
    setWikiLinkIndex(files);
    setWikiLinkIndexVersion((version) => version + 1);
  }

  function addFileToWikiLinkIndex(file: ActiveFile | OpenedFile) {
    setWikiLinkIndexAndRef(addIndexedFile(wikiLinkIndexRef.current, file));
  }

  function removeFileFromWikiLinkIndex(relativePath: string) {
    setWikiLinkIndexAndRef(removeIndexedFile(wikiLinkIndexRef.current, relativePath));
  }

  function replaceFileInWikiLinkIndex(oldRelativePath: string, file: ActiveFile | OpenedFile) {
    setWikiLinkIndexAndRef(
      replaceIndexedFile(wikiLinkIndexRef.current, oldRelativePath, file),
    );
  }

  function resolveWikiLinkTarget(target: string): WikiLinkResolution {
    const cleanTarget = wikiLinkTargetFromMarkup(target);
    const normalizedTarget = normalizeWikiLinkText(cleanTarget);

    if (!normalizedTarget) {
      return { candidates: [] };
    }

    const files = wikiLinkIndexRef.current;
    const pathMatches = files.filter((file) => {
      const pathWithoutExtension = fileNameWithoutMarkdownExtension(file.relativePath);
      const normalizedPath = normalizeWikiLinkText(file.relativePath);

      return (
        normalizedPath === normalizedTarget ||
        normalizeWikiLinkText(pathWithoutExtension) === normalizedTarget
      );
    });

    if (pathMatches.length > 0) {
      return { candidates: pathMatches };
    }

    return {
      candidates: files.filter(
        (file) => normalizeWikiLinkText(wikiLinkDisplayName(file)) === normalizedTarget,
      ),
    };
  }

  function openWikiLinkSearch(hasVault: boolean) {
    if (!hasVault) {
      return;
    }

    setWikiLinkSearchQuery("");
    setWikiLinkSearchSelectedIndex(0);
    setWikiLinkSearchOpen(true);
  }

  function closeWikiLinkSearch() {
    setWikiLinkSearchOpen(false);
    setWikiLinkSearchQuery("");
    setWikiLinkSearchSelectedIndex(0);
  }

  const filteredWikiLinkFiles = useMemo(
    () =>
      wikiLinkIndex
        .filter((file) => {
          const query = wikiLinkSearchQuery.trim().toLowerCase();

          return (
            !query ||
            wikiLinkDisplayName(file).toLowerCase().includes(query) ||
            file.relativePath.toLowerCase().includes(query)
          );
        })
        .slice(0, 20),
    [wikiLinkIndex, wikiLinkSearchQuery],
  );
  const selectedWikiLinkSearchIndex =
    filteredWikiLinkFiles.length > 0
      ? Math.min(wikiLinkSearchSelectedIndex, filteredWikiLinkFiles.length - 1)
      : -1;
  const selectedWikiLinkFile =
    selectedWikiLinkSearchIndex >= 0
      ? (filteredWikiLinkFiles[selectedWikiLinkSearchIndex] ?? null)
      : null;

  return {
    addFileToWikiLinkIndex,
    closeWikiLinkSearch,
    filteredWikiLinkFiles,
    openWikiLinkSearch,
    openWikiLinkSearchRef,
    openWikiLinkTargetRef,
    removeFileFromWikiLinkIndex,
    replaceFileInWikiLinkIndex,
    resolveWikiLinkTarget,
    resolveWikiLinkTargetRef,
    selectedWikiLinkFile,
    selectedWikiLinkSearchIndex,
    setWikiLinkIndexAndRef,
    setWikiLinkPicker,
    setWikiLinkPickerSelectedIndex,
    setWikiLinkSearchQuery,
    setWikiLinkSearchSelectedIndex,
    wikiLinkIndexVersion,
    wikiLinkPicker,
    wikiLinkPickerSelectedIndex,
    wikiLinkSearchInputRef,
    wikiLinkSearchOpen,
    wikiLinkSearchQuery,
    wikiLinkSearchSelectedIndex,
  };
}
