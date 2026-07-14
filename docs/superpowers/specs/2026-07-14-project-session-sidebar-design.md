# Project Session Sidebar Design

## Goal

Replace the separate project and session-history areas with a project tree that owns its sessions. Remove the sidebar workspace card and the sidebar model and mode selectors because those controls already exist in the chat composer.

## Sidebar Structure

- Keep the top-level New Chat action and project add action.
- Render every project as a first-level tree row.
- Render each project's non-archived sessions directly below that project.
- Keep all projects expanded by default for existing state.
- Clicking a project row toggles only that project's expanded state.
- Clicking a session activates its project and then activates the session.
- Keep the existing Primary, Workspace, Observability, and Preferences navigation groups.
- Add an Archived item to the Workspace navigation group.
- Remove the bottom workspace card, model selector, mode selector, and separate session-history section.

## Persistent State

Store the following additions in the existing product state:

- `project.preferences.sidebarExpanded`: boolean, defaulting to `true` when absent.
- `thread.pinned`: boolean, defaulting to `false` when absent.
- `thread.archivedAt`: ISO timestamp or `null`, defaulting to `null` when absent.

The product-state normalizers in both renderer and Electron must preserve these fields and provide backward-compatible defaults. No destructive migration is required.

## Session Ordering And Status

- Hide archived sessions from the project tree.
- Show pinned sessions before unpinned sessions within their original project order.
- Preserve relative order within the pinned and unpinned groups.
- While a session has status `running`, show a spinner at the end of its row.
- When processing completes for a session that is not active, show its existing blue unread indicator.
- Activating a session clears its unread indicator through the existing thread activation flow.

## Session Actions

On hover, show icon buttons at the end of the session row:

- Pin or unpin the session.
- Archive the session.

On right-click, open a context menu containing:

- Rename.
- Delete.

The context menu replaces the always-visible three-dot action button. Existing rename validation, delete confirmation, busy handling, and errors remain in use.

Archiving the active session activates the next available non-archived session in the same project. If none exists, the app creates a new session. Archive and pin changes are persisted before reporting success.

## Archived View

Add a dedicated Archived workspace view that:

- Groups archived sessions by project.
- Shows the session title and archive time.
- Provides a Restore action.
- Restores the session to its original project while preserving its pinned value.
- Allows the restored session to appear immediately in the project tree according to normal sorting.

Archived sessions remain eligible for rename and delete through the same context-menu behavior where practical, while Restore remains the primary visible action.

## Error Handling

- Failed pin, archive, restore, rename, or delete operations leave the previous persisted state intact when possible and show a user-visible error.
- Project/session navigation busy states disable conflicting actions.
- Menus close when clicking elsewhere, switching project/session, or beginning a mutation.
- Archived sessions cannot be activated until restored.

## Verification

- Unit-test product-state defaults and preservation for expanded, pinned, and archived fields.
- Unit-test session filtering and stable pinned-first ordering.
- Unit-test archive and restore behavior, including archiving the active session.
- Unit-test project expansion persistence.
- Run lint, unit tests, and production build.
- Launch the Electron app and verify the sidebar and Archived view at desktop size, including hover buttons, right-click menu, spinner, unread dot, folding, restore, and absence of the removed controls.
