import type {
  ChangeEvent,
  Dispatch,
  MouseEvent as ReactMouseEvent,
  SetStateAction,
} from "react";
import type { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { CanvasView, type CanvasCommandRequest } from "../CanvasView";
import { renderToolbarIcon, type ToolbarIconName } from "../toolbar-icons";
import {
  frontmatterListValues,
  frontmatterScalarValue,
} from "../lib/markdown";
import { fileNameWithoutMarkdownExtension } from "../lib/paths";
import { normalizeFrontmatterPillSettings } from "../lib/settings";
import type {
  ActiveFile,
  CanvasSettings,
  DocumentTab,
  EditorGroupId,
  EditorGroupState,
  VaultSettings,
} from "../lib/app-types";
import { joinVaultRelativeImagePath, tabTitle } from "../app-state/documents";
import type { PageSearchController } from "../search/page-search";

// Responsibilities:
// - Render one markdown/canvas editor pane and its local chrome.
// - Keep pane JSX out of App while leaving document orchestration in App.
// Contracts:
// - Only the active pane shows command chrome tied to the active editor.
// - All mutations are delegated through callbacks; this component owns no document state.

export type ToolbarAction = {
  label: string;
  icon?: ToolbarIconName;
  title: string;
  isActive: () => boolean;
  isEnabled?: () => boolean;
  run: () => void;
};

export function EditorPane({
  activeFile,
  activeGroupId,
  canvasCommandRequest,
  canvasSettings,
  documentDisplayMode,
  group,
  groupEditor,
  groupId,
  markdown,
  metaHeader,
  metadataOpen,
  onActivateGroup,
  onCanvasChange,
  onCloseTab,
  onEditorContextMenu,
  onFinishPageNameEdit,
  onMarkPageNameDirty,
  onMetaHeaderChange,
  onOpenFile,
  onOpenImagePreview,
  onPageNameChange,
  onSetActiveDocumentDirty,
  onSetEditorFocused,
  onSetPageNameEditing,
  onSetStatus,
  onSwitchTab,
  pageName,
  pageNameEditing,
  pageSearch,
  setMetadataOpen,
  toolbarActions,
  vaultRoot,
  vaultSettings,
}: {
  activeFile: ActiveFile | null;
  activeGroupId: EditorGroupId;
  canvasCommandRequest: CanvasCommandRequest | null;
  canvasSettings: CanvasSettings;
  documentDisplayMode: "edit" | "view";
  group: EditorGroupState;
  groupEditor: Editor | null;
  groupId: EditorGroupId;
  markdown: string;
  metaHeader: string;
  metadataOpen: boolean;
  onActivateGroup: (groupId: EditorGroupId) => void;
  onCanvasChange: (groupId: EditorGroupId, nextContent: string) => void;
  onCloseTab: (tabId: string, groupId: EditorGroupId) => void;
  onEditorContextMenu: (
    event: ReactMouseEvent<HTMLDivElement>,
    editor: Editor | null,
    groupId: EditorGroupId,
  ) => void;
  onFinishPageNameEdit: () => void;
  onMarkPageNameDirty: () => void;
  onMetaHeaderChange: (nextMetaHeader: string) => void;
  onOpenFile: (relativePath: string) => void;
  onOpenImagePreview: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onPageNameChange: (nextPageName: string) => void;
  onSetActiveDocumentDirty: (dirty: boolean) => void;
  onSetEditorFocused: (focused: boolean) => void;
  onSetPageNameEditing: Dispatch<SetStateAction<boolean>>;
  onSetStatus: (message: string) => void;
  onSwitchTab: (tabId: string, groupId: EditorGroupId) => void;
  pageName: string;
  pageNameEditing: boolean;
  pageSearch: PageSearchController;
  setMetadataOpen: Dispatch<SetStateAction<boolean>>;
  toolbarActions: ToolbarAction[];
  vaultRoot: string;
  vaultSettings: VaultSettings;
}) {
  const groupActiveTab =
    group.tabs.find((tab) => tab.id === group.activeTabId) ?? group.tabs[0] ?? null;
  const isActiveGroup = groupId === activeGroupId;
  const panePageName = isActiveGroup ? pageName : groupActiveTab?.pageName ?? "Untitled note";
  const paneMetaHeader = isActiveGroup ? metaHeader : groupActiveTab?.metaHeader ?? "";
  const paneMarkdown = isActiveGroup ? markdown : groupActiveTab?.markdown ?? "";
  const paneActiveFile = isActiveGroup ? activeFile : groupActiveTab?.activeFile ?? null;
  const isCanvasTab = groupActiveTab?.kind === "canvas";
  const showEditingChrome = documentDisplayMode === "edit";
  const frontmatterPillSettings = normalizeFrontmatterPillSettings(
    vaultSettings.frontmatterPills,
  );
  const frontmatterPills = frontmatterPillSettings.enabled
    ? frontmatterListValues(paneMetaHeader, frontmatterPillSettings.headerName)
    : [];
  const bannerSrc = !isCanvasTab
    ? joinVaultRelativeImagePath(vaultRoot, frontmatterScalarValue(paneMetaHeader, "banner"))
    : "";

  function handleMetaHeaderChange(event: ChangeEvent<HTMLTextAreaElement>) {
    onActivateGroup(groupId);
    onMetaHeaderChange(event.currentTarget.value);

    if (paneActiveFile) {
      onSetActiveDocumentDirty(true);
      onSetStatus(`Unsaved changes in ${paneActiveFile.name}`);
    }
  }

  return (
    <div
      className={isActiveGroup ? "editor-pane-shell active-group" : "editor-pane-shell"}
      key={groupId}
      onMouseDown={() => {
        if (!isActiveGroup) {
          onActivateGroup(groupId);
        }
      }}
    >
      <DocumentTabs
        group={group}
        groupId={groupId}
        onCloseTab={onCloseTab}
        onSwitchTab={onSwitchTab}
      />
      {!groupActiveTab ? (
        <div className="editor-pane no-document-pane">
          <div className="empty-document-placeholder no-document">
            Open or create a note to start editing.
          </div>
        </div>
      ) : (
        <div className={isCanvasTab ? "editor-pane canvas-editor-pane" : "editor-pane"}>
          {bannerSrc ? (
            <figure className="document-banner">
              <img alt="" src={bannerSrc} />
            </figure>
          ) : null}
          {!isCanvasTab && showEditingChrome ? (
            <div className="metadata-shell" aria-label="Metadata editor">
              <div className="page-name-control">
                {pageNameEditing && isActiveGroup ? (
                  <input
                    aria-label="Page name"
                    autoFocus
                    disabled={!paneActiveFile}
                    value={pageName}
                    onBlur={onFinishPageNameEdit}
                    onChange={(event) => {
                      onPageNameChange(event.currentTarget.value);
                      onMarkPageNameDirty();
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.currentTarget.blur();
                      } else if (event.key === "Escape") {
                        if (paneActiveFile) {
                          onPageNameChange(
                            fileNameWithoutMarkdownExtension(paneActiveFile.name),
                          );
                        }
                        onSetPageNameEditing(false);
                      }
                    }}
                  />
                ) : (
                  <button
                    className="page-name-display"
                    disabled={!paneActiveFile}
                    type="button"
                    title="Double-click to rename on save"
                    onDoubleClick={() => {
                      onActivateGroup(groupId);
                      if (paneActiveFile) {
                        onSetPageNameEditing(true);
                      }
                    }}
                  >
                    {panePageName || "Untitled note"}
                  </button>
                )}
              </div>
              <div className="frontmatter-header">
                <button
                  className={metadataOpen ? "metadata-toggle open" : "metadata-toggle"}
                  type="button"
                  aria-expanded={metadataOpen}
                  aria-controls={`${groupId}-frontmatter-editor`}
                  aria-label={metadataOpen ? "Hide frontmatter" : "Show frontmatter"}
                  title={metadataOpen ? "Hide frontmatter" : "Show frontmatter"}
                  onClick={() => setMetadataOpen((open) => !open)}
                />
                <span>Frontmatter</span>
                {frontmatterPills.length > 0 ? (
                  <div className="frontmatter-pills" aria-label="Frontmatter list values">
                    {frontmatterPills.map((value) => (
                      <span className="frontmatter-pill" key={value}>
                        {value}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              {metadataOpen ? (
                <label className="metadata-control" id={`${groupId}-frontmatter-editor`}>
                  <textarea
                    disabled={!paneActiveFile}
                    spellCheck="false"
                    value={paneMetaHeader}
                    onChange={handleMetaHeaderChange}
                    placeholder="title: Example&#10;tags: [note]"
                  />
                </label>
              ) : null}
            </div>
          ) : null}

          {isActiveGroup && !isCanvasTab && showEditingChrome ? (
            <Toolbar actions={toolbarActions} onSetEditorFocused={onSetEditorFocused} />
          ) : null}

          {isActiveGroup && !isCanvasTab && pageSearch.open ? (
            <PageSearchBar pageSearch={pageSearch} />
          ) : null}

          {isCanvasTab ? (
            <CanvasView
              commandRequest={isActiveGroup ? canvasCommandRequest : null}
              content={paneMarkdown}
              name={panePageName}
              settings={canvasSettings}
              vaultRoot={vaultRoot}
              onChange={(nextContent) => onCanvasChange(groupId, nextContent)}
              onOpenFile={onOpenFile}
            />
          ) : (
            <div className="editor-surface-frame">
              <EditorContent
                className="editor-surface markdown-rendered markdown-preview-view"
                editor={groupEditor}
                onDoubleClick={onOpenImagePreview}
                onContextMenu={(event) => onEditorContextMenu(event, groupEditor, groupId)}
              />
              {!paneMarkdown.trim() ? (
                <div className="empty-document-placeholder" aria-hidden="true">
                  Start writing...
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DocumentTabs({
  group,
  groupId,
  onCloseTab,
  onSwitchTab,
}: {
  group: EditorGroupState;
  groupId: EditorGroupId;
  onCloseTab: (tabId: string, groupId: EditorGroupId) => void;
  onSwitchTab: (tabId: string, groupId: EditorGroupId) => void;
}) {
  return (
    <div className="document-tabs" role="tablist" aria-label={`${groupId} open documents`}>
      {group.tabs.map((tab: DocumentTab) => (
        <div
          className={tab.id === group.activeTabId ? "document-tab active" : "document-tab"}
          key={tab.id}
          role="tab"
          aria-selected={tab.id === group.activeTabId}
          title={tab.activeFile?.relativePath ?? tabTitle(tab)}
        >
          <button
            className="document-tab-select"
            type="button"
            onClick={() => onSwitchTab(tab.id, groupId)}
          >
            <span>{tabTitle(tab)}</span>
            {tab.dirty ? <em aria-label="Unsaved changes" /> : null}
          </button>
          <button
            className="document-tab-close"
            type="button"
            aria-label={`Close ${tabTitle(tab)}`}
            title={`Close ${tabTitle(tab)}`}
            onClick={(event) => {
              event.stopPropagation();
              onCloseTab(tab.id, groupId);
            }}
          >
            x
          </button>
        </div>
      ))}
    </div>
  );
}

function Toolbar({
  actions,
  onSetEditorFocused,
}: {
  actions: ToolbarAction[];
  onSetEditorFocused: (focused: boolean) => void;
}) {
  return (
    <div className="toolbar" aria-label="Formatting toolbar">
      {actions.map((action) => (
        <button
          aria-label={action.title}
          className={action.isActive() ? "tool-button active" : "tool-button"}
          disabled={action.isEnabled ? !action.isEnabled() : false}
          key={action.title}
          onClick={() => {
            action.run();
            onSetEditorFocused(true);
          }}
          title={action.title}
          type="button"
        >
          {action.icon ? renderToolbarIcon(action.icon) : action.label}
        </button>
      ))}
    </div>
  );
}

function PageSearchBar({ pageSearch }: { pageSearch: PageSearchController }) {
  return (
    <div className="page-search-bar" role="search" aria-label="Find in page">
      <input
        ref={pageSearch.inputRef}
        aria-label="Find in page"
        placeholder="Find in page"
        spellCheck="false"
        value={pageSearch.query}
        onChange={(event) => {
          pageSearch.setQuery(event.currentTarget.value);
          pageSearch.setIndex(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            pageSearch.closeSearch();
          } else if (event.key === "Enter") {
            event.preventDefault();
            pageSearch.move(event.shiftKey ? -1 : 1);
          }
        }}
      />
      <span>
        {pageSearch.query.trim()
          ? pageSearch.results.length > 0
            ? `${pageSearch.activeIndex + 1}/${pageSearch.results.length}`
            : "0/0"
          : "0/0"}
      </span>
      <button
        type="button"
        aria-label="Previous match"
        disabled={pageSearch.results.length === 0}
        onClick={() => pageSearch.move(-1)}
      >
        Up
      </button>
      <button
        type="button"
        aria-label="Next match"
        disabled={pageSearch.results.length === 0}
        onClick={() => pageSearch.move(1)}
      >
        Down
      </button>
      <button type="button" aria-label="Close find in page" onClick={pageSearch.closeSearch}>
        Close
      </button>
    </div>
  );
}
