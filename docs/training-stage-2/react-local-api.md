# Native React / local synthetic API

The isolated branch now includes a first operational React connection to the existing local training service. All nine sections read scoped workspace data. Program enrollment writes to the local PGlite sandbox, refreshes the workspace and handles conflicts. Native agenda now supports preview/confirmation, chosen weekdays, local dates/times, attendance and rescheduling with required reasons. Native evidence submission, private PNG/PDF/MP4 downloads and administrative approval/rejection are connected. Native administrative assessment and explicit practical validation are connected. Private material access and quiz invitation/revocation are connected. Final closing and historical HTML/JSON exports are connected. Optional program updates are connected. Native catalogue/exam authoring and attachment refinements remain to be adapted; the standalone local UI remains their working reference.

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

Recruiters and administrators can submit a required description with an optional PNG, static PDF or H.264 MP4 (up to 2 MiB), using a scoped active session. The file requires an explicit test consent checkbox, reset whenever the file changes. Client size/type checks precede encoding; existing server validators remain authoritative. Native JPEG preparation is still pending; the standalone runtime's JPEG conversion remains available and unchanged.

Files are fetched only through the permission-checked download endpoint and a short-lived browser Blob URL. Workspace DTOs carry no file bytes. The current native view does not inline-preview attachments. Reviewers must explicitly choose approval/rejection and supply notes. Only administrators see pending review forms; read-only accounts see no submission/review forms. Pending notes survive status filters. Already-reviewed or closed evidence cannot be reviewed again; the server rejects stale review attempts. Evidence approval does not create assessment, completion or final closing.

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

## Validation

`npm run test:react-local` exercises the actual React component, HTTP server, credential service and isolated database in Chromium, including enrollment, duplicate conflicts, read-only denial, role downgrade, revocation, explicit opt-in and capability checks, mobile navigation and absence of external traffic/browser persistence. Set `BROWSER_EXECUTABLE_PATH` for an existing Chromium binary if needed.

Validation on 2026-10-13: 233 local React/API checks, 233 default React DEMO checks, strict TypeScript checking passed. The update/closing/assessment/evidence services were not modified; the preceding agenda stage also passed 46 HTTP API/program tests. Enrollment screenshots are in `preview/react-local-api/`; agenda/attendance screenshots are in `preview/react-agenda-api/`, and review screenshots in `preview/react-evidence-api/`, and practical validation screenshots in `preview/react-assessment-api/`, and library/invitation screenshots in `preview/react-library-api/` (invitation tokens omitted), and closing screenshots in `preview/react-closing-api/`, and update screenshots in `preview/react-updates-api/`.

Keep `npm run test:react-demo` as the default-mode regression check. These local tests do not establish production readiness, hosted access policies, concurrent hosted behavior or a migration plan. Training remains on `base44/setup-b8f0f68b` and is not merged into main.
