# Glyphary 1.0.0-beta.2 Release Notes

This beta is focused on making Glyphary feel more natural as a local-first
Markdown editor: cleaner reading, better Obsidian compatibility, richer table
controls, and release packaging that is ready for notarization.

## What's New Since 1.0.0-beta.1

### Reading And Editing

- Added View/Edit chrome modes. View mode hides frontmatter and the formatting
  toolbar while keeping the document editable.
- Added frontmatter-driven page banners with `banner: '![[image.png]]'`.
- Banner images now render above the frontmatter area.
- Added wikilink aliases such as `[[Actual Page|Display Name]]`.
- Wikilinks render as clean links outside the active line, hiding `[[...]]`
  syntax and alias targets while preserving the Markdown on disk.
- Added plain paste with `Cmd+Shift+V`.
- Fixed column insertion so new columns insert at the cursor instead of the end
  of the file.
- Fixed frontmatter parsing so a document wrapped in `---` is not treated as one
  giant metadata block.

### Tabs And Navigation

- The last tab can now be closed, leaving the editor center empty.
- The command palette now stays out of document commands when no note or canvas
  is open.
- Added a configurable New Tab file. When set, `Cmd+T` opens that vault note;
  when unset, Glyphary prompts from the status bar instead of opening a blank tab.
- Opening a daily note from the calendar now refreshes the file drawer selection
  to the opened note.

### File Tree Actions

- Right-clicking empty space in a folder now offers New Note, New Canvas, and New
  Folder actions for that folder.
- Markdown files, canvas files, and folders can be renamed from the right-click
  menu.
- Canvas files can now be created directly from folder context menus.

### Tables

- Added an editor table context menu with the same row and column operations as
  the command palette.
- Added Align Column... with left, center, and right alignment based on Markdown
  table alignment syntax.
- Fixed the table menu styling so it is opaque.
- Fixed the Align Column submenu hover gap.
- Fixed table column alignment so it does not leave the document selected after
  applying or undoing the change.

### Documentation

- Added installation instructions at the start of the documentation for macOS
  GitHub release DMGs and Windows installers.
- Added a developer setup section covering checkout, dependencies, dev builds,
  checks, and release targets.
- Added a Markdown reference page for Glyphary-supported syntax, including table
  alignment and wikilink aliases.
- Updated the README and public site copy for page banners, View/Edit mode,
  configurable New Tab behavior, table context actions, and file-tree actions.

### Packaging

- Version fields are now `1.0.0-beta.2`.
- Fixed the Windows bundle icon configuration.
- Updated the release Makefile to build the universal macOS DMG path directly.
- Fixed macOS release signing so the universal app binary is signed with the
  Developer ID Application identity, hardened runtime, and secure timestamp
  before notarization.

## Notes

`1.0.0-beta.2` is still a beta because these changes touch editing behavior,
Markdown rendering, table mutation, file-tree actions, and platform packaging.
Please test with a real vault before replacing your daily build.
