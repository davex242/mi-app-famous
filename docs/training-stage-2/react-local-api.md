# Native React / local synthetic API

The isolated branch now includes a first operational React connection to the existing local training service. All nine sections read scoped workspace data. Program enrollment writes to the local PGlite sandbox, refreshes the workspace and handles conflicts. Native agenda now supports preview/confirmation, chosen weekdays, local dates/times, attendance and rescheduling with required reasons. Evidence/review, uploads, material access, invitations and completion remain to be adapted; the standalone local UI remains their working reference.

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

## Validation

`npm run test:react-local` exercises the actual React component, HTTP server, credential service and isolated database in Chromium, including enrollment, duplicate conflicts, read-only denial, role downgrade, revocation, explicit opt-in and capability checks, mobile navigation and absence of external traffic/browser persistence. Set `BROWSER_EXECUTABLE_PATH` for an existing Chromium binary if needed.

Validation on 2026-10-13: 105 local React/API checks, 233 default React DEMO checks, 46 existing HTTP API/program tests and strict TypeScript checking passed. Enrollment screenshots are in `preview/react-local-api/`; agenda/attendance screenshots are in `preview/react-agenda-api/`.

Keep `npm run test:react-demo` as the default-mode regression check. These local tests do not establish production readiness, hosted access policies, concurrent hosted behavior or a migration plan. Training remains on `base44/setup-b8f0f68b` and is not merged into main.
