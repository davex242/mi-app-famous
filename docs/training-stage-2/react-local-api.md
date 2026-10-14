# Native React / local synthetic API

The isolated branch now includes a first operational React connection to the existing local training service. All nine sections read scoped workspace data. Program enrollment writes to the local PGlite sandbox, refreshes the workspace and handles conflicts. Native agenda now supports preview/confirmation, chosen weekdays, local dates/times, attendance and rescheduling with required reasons. Native evidence submission, private PNG/PDF/MP4 downloads and administrative approval/rejection are connected. Native administrative assessment and explicit practical validation are connected. Private material access and quiz invitation/revocation are connected. Final closing and historical HTML/JSON exports are connected. Optional program updates are connected. Native topic and text/HTTPS material authoring are connected. Native exam authoring is connected. Native program authoring is connected. Native file-material PNG/PDF/MP4 upload/revision editing is connected. Native JPEG preparation and private evidence image/video previews are connected; PDFs remain download-only.

## Run

Install the repository's existing dependencies with `npm ci`, then `cd training-isolation && npm ci`. Run `npm run start:react-local` and open the printed `http://127.0.0.1:4317/react-training?trainingSandbox=local` address. Synthetic passwords are generated on startup and printed only by this explicit local launcher. Data is in memory and disappears when the process stops. Stop with Ctrl+C.

The build uses the repository's installed React/esbuild dependencies. `APP_NODE_MODULES` may point to a separate dependency directory for QA. No repository dependency or lockfile change is required. The launcher compiles temporary assets, serves them on the existing sandbox server and removes them on clean shutdown. It does not launch Vite or import the production application client.

The existing app wrappers also select this workspace only with the explicit `trainingSandbox=local` query on HTTP localhost/127.0.0.1. Otherwise they retain the nine-view DEMO. There is no configurable API URL, cross-origin connection, cookie authentication, hosted database access or automatic production enablement. The sandbox server preserves its Host/Origin guards and static-asset allowlist; the React assets are an optional server-constructor capability.

## Sessions and scope

A separate synthetic login is mandatory. Before transmitting these credentials the client checks `/health` for `sandbox: true` and the `react_training_api: 1` capability marker. This marker identifies the local protocol, not a production identity/security mechanism. Tokens stay in the component's API instance and are never put in browser storage. Password input is cleared on submission. Logout/unmount drops the token, aborts pending requests and attempts server revocation; unreachable-server sessions expire on the server.

`/api/me` supplies the current role; `/api/workspace` supplies current assignment-scoped public DTOs. Existing app roles are never transmitted as authorization. Every write remains permission-checked by the server. Refresh applies role changes, and authentication/permission failures clear the displayed workspace. UI values are explicitly projected as text; private answers, credential digests, attachment contents and event details are not rendered.

## Agenda confirmation and concurrency

React sends the exact preview hash when confirming generation. The server recomputes the proposal under the enrollment transaction and rejects a changed hash with HTTP 409. The hash includes the enrollment, pinned program version, timezone, proposed dates/durations and skipped count. It is a consistency check, not an authentication credential. Existing standalone callers can continue without this optional parameter; the native React flow always supplies it.

Changing proposal inputs or refreshing the workspace removes the old confirmation. Already scheduled/completed practices are skipped. Attendance submits the currently displayed recorded timestamp; rescheduling submits the displayed schedule timestamp, enrollment-local date/time and reason. Server checks reject stale timestamps and overlapping sessions. Read-only actors see the scoped agenda with no operational forms, and recording attendance does not complete a practice.

## Evidence and review

Recruiters and administrators can submit a required description with an optional PNG/JPEG, static PDF or H.264 MP4 (up to 2 MiB), using a scoped active session. The file requires an explicit test consent checkbox, reset whenever the file changes. Client size/type checks precede encoding; existing server validators remain authoritative. JPEG headers are bounded before browser decoding (8-bit supported formats, at most 2048 pixels per side and 4 million pixels). Orientation is applied and a proportional PNG copy of up to 768 pixels per side is prepared. The server still validates the resulting PNG. Invalid image preparation preserves the description and makes no upload.

Files are fetched only through permission-checked preview/download endpoints. Workspace DTOs carry no file bytes. Native image previews use normalized private PNG; video previews use a temporary Blob URL, controls, no autoplay and no preload. Closing, filtering, refreshing or unmounting clears the preview, pauses the video and revokes its URL. A response from an obsolete workspace/filter is discarded before creating a URL. PDFs remain download-only. Reviewers must explicitly choose approval/rejection and supply notes. Only administrators see pending review forms; read-only accounts see no submission/review forms. Pending notes survive status filters. Already-reviewed or closed evidence cannot be reviewed again; the server rejects stale review attempts. Evidence approval does not create assessment, completion or final closing.

## Administrative assessment and practical validation

The evidence section now includes a scoped practical evaluation table and server-projected progress. Only administrators see the evaluation selector and operational forms. Scores must be explicitly entered from 0 to 100, with a separately chosen approved/not-approved result and required notes. No automatic passing threshold or default score is invented. Assessments remain append-only through the existing service; the latest assessment controls eligibility.

Practical validation shows the selected item's evidence/assessment requirements. A separate confirmation is tied to the selected session and workspace snapshot; selecting another session, refreshing, or saving an assessment invalidates it. React enables validation only when its displayed prerequisites are met; the server remains authoritative and rejects stale passing assessments or missing approved evidence. Validated practices lose their action form. Scoped completion/progress counts refresh after success. A practice completion does not complete enrollment, issue a quiz or bypass final closing.

## Library and quiz invitations

The native library filters public workspace DTOs by search/topic and requests private content only on explicit preview/download actions. Text renders as text, image previews use server-normalized PNG, and video previews start paused with no preload. Closing/unmounting removes previews and revokes video Blob URLs. PDF inline previews remain disabled; permitted PDFs download through the authenticated endpoint. HTTPS material links require an explicit click; no external content is embedded or fetched automatically. Server flags and current permissions remain authoritative.

Quiz invitations require an active scoped enrollment, an existing published exam, explicitly selected 1–10 attempts and a future expiration within 30 days. The native datetime input is explicitly labeled UTC and converted to an ISO UTC instant. No default attempts, expiration or passing threshold is invented. The exam's published threshold is displayed as read-only metadata; no answer keys are requested.

The generated URL uses the same local origin and `/quiz#<token>`. The existing standalone public quiz removes that fragment before interaction, serves 50 public questions and grades on the server. A bearer invitation authorizes an assignment; it does not verify responder identity. Native invitation URLs exist only in component memory and cannot be recovered after reload or leaving the section. Revocation requires a separate confirmation and invalidates the link server-side. Role downgrade, revoked/finished assignments and expiration remove the displayed token. No email or message is sent.

The launcher intentionally starts with a synthetic program, not preapproved exam/material content. To exercise these native flows manually, use the existing local administration screen at `/` with the same synthetic admin credentials to publish DEMO materials/an exam with an explicit threshold, then refresh the React view. Do not substitute actual agency content or connect production as part of this test.

## Final closing and historical exports

The native closing view lets scoped users select an enrollment and a submitted quiz attempt, then request a server-verified closing preview. It shows practical checks, current progress and verified quiz readiness; 100% practices alone cannot enable closing. Only administrators receive the final form. Notes and a separate checkbox are mandatory. Selection changes discard the preview; refreshing invalidates its workspace reference; changing notes removes consent. The existing server recomputes the preview hash and validates evidence, assessments, completion sources and private quiz grading before committing one immutable closing record. A stale preview is rejected without closing.

After success the completed enrollment has no closing action. Scoped administrators/recruiters/read-only users may download allowed historical records through the existing export endpoint; current host assignment is still enforced. Exports are downloaded as HTML/JSON, never inserted as HTML into React. Their server projection includes preserved results, explicitly escaped notes and attachment metadata, without raw file bytes, quiz answers/keys, invitation tokens or request hashes. The HTML is printable from the browser, not an official certification or digitally signed document.

## Optional program updates

Native updates are offered only for active/paused scoped enrollments and newer published optional versions of the same program. Publication does not change any enrollment automatically. Preview shows previous progress, equivalent completed practices, continuing sessions, new requirements, historical-only items and resulting progress. Read-only accounts see accepted history without operational controls.

Acceptance requires a separate checkbox tied to the preview, selections and workspace snapshot. Selection changes or refresh invalidate the displayed proposal. The existing server rechecks source version, scope and preview hash inside the transaction; stale session/completion state is rejected without applying an update. Only equivalent completions get new-version credit, while original completions and sessions remain historical. The native view also explains that a quiz issued for the older version does not satisfy new-version closing. Previous completed-enrollment snapshots remain unchanged. No SQL/schema or update service changes were needed.

To exercise this flow manually, publish a newer program revision through the existing local administration screen, then refresh React. Drafts and different program families are excluded from the native update selector.

## Native content editor

The library mounts the content editor only for verified administrators. Topics support creation and new immutable revisions with explicit titles, descriptions, categories and 1–480 estimated minutes. Text and HTTPS materials support creation and revision, exact topic revision selection, and explicit preview/download flags. Links cannot have document download permissions. File-material authoring has a separate native upload/revision editor; PNG/JPEG preparation is shared with the evidence form.

Saving creates a draft. Publication is a separate per-revision confirmation and server-checked action. Only latest revisions are offered as edit sources or publication candidates; the server independently enforces revision/publication conflicts. A material's parent topic must be published first. Private text/link content is loaded only through the administrative edit endpoint when an edit source is selected. Refresh invalidates an edit snapshot; unsaved values remain visible but cannot be submitted until the source is reloaded. Published bodies and program references are never overwritten by these edits.

Run `npm run test:react-content` for the dedicated synthetic authoring journey. It exercises draft visibility, publication dependencies, revision immutability, private edit-data access, refresh conflicts, link flags, nonadministrator server denial and mobile layout. It uses its own fresh local database and browser instance.

## Native administrative exam editor

Only verified superadmin/subadmin actors mount this component. A teacher can explicitly load the server-only DEMO bank, create 50 empty questions, or load a published exam through the new administrative `/api/exams/edit-data` endpoint. That endpoint resolves current identity and requires administrator permissions before querying selected question/answer-key fields. Existing primary/unique indexes support the exam lookup, ordered question lookup and private key join; no schema/index change was required.

The private draft exists only in component memory. It is not persisted in browser storage or workspace DTOs and disappears on leaving the section or losing administrative role. Exactly 50 distinct prompts, 2–6 distinct options per question, a selected correct option and an explicit 0.01–100 approval percentage are required. New banks have no default passing threshold. Edits/reset/refresh invalidate publication consent; publishing requires a separate review checkbox. Published versions remain immutable and existing invitations retain their original questions and keys.

The local HTTP exam publication endpoint now permits up to 1 MiB JSON so all supported valid long-question banks fit; ordinary JSON endpoints retain 32 KiB and existing attachment endpoints retain their limits. Larger exam requests are rejected with 413. The new private edit endpoint does not alter public quiz status/start/submit responses or expose keys to participants/recruiters/read-only actors.

Run `npm run test:react-exam-editor` for the synthetic administrative journey: empty banks, explicit thresholds, consent, stale source conflicts, immutable versions, original-invitation grading, role downgrade, nonadmin private-data denial, long valid bank acceptance and bounded requests.

## Native administrative program editor

Only administrators mount the editor. New programs or newer versions require a title, explicit 1–90 day duration, changelog and 1–180 practices. Each practice chooses a day, exact topic revision, notes and at most 20 exact material revisions belonging to that topic. Reordering controls determine positions within each day; changing topic clears incompatible material selections. Every saved practice retains mandatory evidence and assessment.

Saving creates a new immutable version in draft. Editing loads source program/item/material references from scoped workspace DTOs and refresh invalidates that source snapshot. Publishing requires a separate confirmation and the existing server checks current draft status and published topic/material dependencies. Creating or publishing a version never changes existing enrollments or historical program references.

The local `/api/programs` request limit is now 3 MiB to fit the supported maximum valid draft; ordinary JSON endpoints remain 32 KiB, exam publication 1 MiB, and attachment limits unchanged. Larger program requests are rejected with 413. No program service or schema change was needed.

Run `npm run test:react-program-editor` for the dedicated synthetic journey: days, ordering, exact material filtering/loading, dependency checks, snapshot invalidation, immutable references, enrollment pinning, nonadmin denial and request bounds.

## Native file-material editor

Verified administrators can upload PNG/JPEG, static PDF or H.264 MP4 materials, each up to 2 MiB. The native editor requires an explicit exact topic revision, title, preview/download flags and confirmation that test content is fictitious/authorized. PDF preview remains disabled. Client size/MIME checks precede encoding; existing server validators remain authoritative and reject spoofed content.

Editing selects only latest file revisions and preserves their type. Supplying another file resets consent and creates a separate new revision. Without a replacement, saving explicitly fetches the old validated content through the administrative edit endpoint and submits a copy for server validation. Private bytes are not fetched on mere source selection or placed in workspace/browser storage. Refresh invalidates the edit snapshot. Original bytes/metadata and historical references remain unchanged. Saving creates a draft; publication is still a separate action in the content draft panel.

Run `npm run test:react-file-editor` for the dedicated synthetic journey: all three formats, original-byte retention, metadata-only copying, replacement revisions, consent/size checks, stale snapshots, PDF preview policy, spoofed content, nonadmin server denial and mobile layout. No catalogue/evidence service or schema change was needed.

## Validation

`npm run test:react-local` exercises the actual React component, HTTP server, credential service and isolated database in Chromium, including enrollment, duplicate conflicts, read-only denial, role downgrade, revocation, explicit opt-in and capability checks, mobile navigation and absence of external traffic/browser persistence. Set `BROWSER_EXECUTABLE_PATH` for an existing Chromium binary if needed.

Validation on 2026-10-13: 48 native file-editor checks (without optional screenshots), 30 preceding native program-editor checks, 46 HTTP API/program tests, 38 preceding native exam-editor checks, 48 preceding HTTP API/exam tests, 31 preceding content-editor checks, 237 local React/API checks (without optional screenshots), 233 default React DEMO checks, strict TypeScript checking passed. The catalogue/update/closing/assessment/evidence services were not modified; the preceding agenda stage also passed 46 HTTP API/program tests. Enrollment screenshots are in `preview/react-local-api/`; agenda/attendance screenshots are in `preview/react-agenda-api/`, and review screenshots in `preview/react-evidence-api/`, and practical validation screenshots in `preview/react-assessment-api/`, and library/invitation screenshots in `preview/react-library-api/` (invitation tokens omitted), and closing screenshots in `preview/react-closing-api/`, and update screenshots in `preview/react-updates-api/`, and content-editor screenshots in `preview/react-content-api/`, and synthetic administrative exam screenshots in `preview/react-exam-editor-api/`, and program editor screenshots in `preview/react-program-editor-api/`, and file editor screenshots in `preview/react-file-editor-api/`.

Keep `npm run test:react-demo` as the default-mode regression check. These local tests do not establish production readiness, hosted access policies, concurrent hosted behavior or a migration plan. Training remains on `base44/setup-b8f0f68b` and is not merged into main.

## Responsive review

Run `npm run test:react-layout` for the dedicated synthetic interface review. It checks all nine sections under superadmin/subadmin/edit/readonly at 1440, 768, 390 and 320px, long unbroken descriptions/titles, loaded 14-practice program and 50-question exam editors, permission-specific forms, evidence dialogs/Escape, active tab styling, keyboard table access, 44px button height and absence of external traffic/browser persistence. The 2026-10-13 review passed 570 checks; see `react-layout-review.md` for corrections, captures and limits.
