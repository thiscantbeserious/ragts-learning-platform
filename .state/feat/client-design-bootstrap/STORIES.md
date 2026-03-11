# Stories: Sidebar-based layout and design bootstrap

> Redesign the Erika platform into a real app: persistent sidebar session browser, upload UX, live processing status, cognitive start page, skeleton loading, feedback toasts, and mobile responsiveness — the first functional UI that connects to the backend.

## Stories

### Platform user -- persistent session browser

As a platform user, I want an always-visible sidebar showing my session list while I read a session's detail, so that I can switch between sessions without losing my place or navigating back to a list page.

Acceptance signal: clicking a session in the sidebar opens its detail in the main area without the sidebar disappearing or resetting scroll position.

### Platform user -- live processing status in the sidebar

As a platform user, I want to see a processing indicator next to a session that is still being analyzed, so that I know whether it is safe to open a session or whether it is still being processed.

Acceptance signal: a session uploaded while the app is open shows a progress state (e.g., "Processing...") that automatically updates to "Ready" or "Failed" when the backend finishes, without a page refresh.

### Platform user -- upload from the sidebar

As a platform user, I want to start a new session upload from a "+ New Session" button in the sidebar, so that I never have to leave my current session view to add more recordings.

Acceptance signal: clicking "+ New Session" opens a file picker; the new session appears in the sidebar list after upload without a full page reload.

### Platform user -- drag-to-upload anywhere in the sidebar

As a platform user, I want to drag a `.cast` file anywhere over the sidebar and have it turn into a drop zone, so that I can upload a new session without hunting for a button.

Acceptance signal: dragging a file over the sidebar transforms the session list into a visible drop zone; dropping the file triggers the upload flow.

### Platform user -- session search and status filtering

As a platform user, I want to search sessions by name and filter by status (All / Processing / Ready / Failed) directly in the sidebar, so that I can find a specific session quickly without scrolling through everything.

Acceptance signal: typing in the search bar narrows the visible sessions in real time; selecting a filter pill hides sessions that don't match that status.

### Platform user -- cognitive start page when no session is selected

As a platform user, I want to see a meaningful landing area when I first open the app or have no session selected, so that the main content area is never a blank void and I understand what to do next.

Acceptance signal: the main area shows an animated visual and a clear call to action ("Browse Files" or drag-drop zone) when no session is selected or when the session list is empty.

### Platform user -- skeleton loading while content fetches

As a platform user, I want to see placeholder shapes where sessions and session details will appear while the app is loading data, so that the interface never feels broken or empty during normal network latency.

Acceptance signal: the sidebar and main content area each show animated skeleton placeholders during initial load and navigation; they are replaced by real content once data arrives.

### Platform user -- feedback toasts for upload and processing events

As a platform user, I want a brief, non-intrusive notification when an upload completes, fails, or when processing finishes, so that I can keep working without staring at the sidebar to catch state changes.

Acceptance signal: a toast appears automatically when an upload succeeds or errors, and when a processing job reaches "Ready" or "Failed"; each toast disappears on its own after a few seconds without requiring any action.

### Platform user -- mobile access with collapsible sidebar

As a platform user, I want to access the session browser on a phone or small screen without the sidebar blocking the session detail, so that I can review sessions on the go.

Acceptance signal: on a narrow viewport the sidebar is hidden by default; a hamburger/menu button reveals it as an overlay; tapping a session closes the sidebar and opens the detail.

## Out of Scope

- Backend changes (SSE endpoint, status API, retry endpoint are already merged in PR #66)
- Team/workspace permissions or multi-user session sharing
- Session curation UI (marking segments, annotations) -- separate feature
- Dashboard evolution beyond the initial cognitive start page visual

---
**Sign-off:** Approved
