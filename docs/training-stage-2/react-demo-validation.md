# Native React training DEMO

The existing `host-training` route now mounts the nine reviewed React views. Admin, recruiter and read-only wrappers retain their existing role routing; unknown or signed-out roles do not mount the workspace. Training CSS is scoped to `.training-demo`.

All displayed trainees, programs, sessions, evidence and quiz results come from the explicitly synthetic `demoData.ts` fixture. No production hosts/users are loaded by this module. Operational actions, real file uploads, quiz invitations and closing remain disabled. Only local view state, synthetic closing checklists and example TXT previews/downloads are enabled. No answer keys are included.

The independent functional training runtime remains in `training-isolation`. Connecting it to the React screens is the next integration task; a DEMO score or checklist does not verify a real quiz or evidence.

## Validation

The changed React components passed strict TypeScript checking and browser bundling. A temporary shell also verified that navigating out of the module preserves the existing registration component and its required-field behavior.

The reproducible browser check covers all nine sections at desktop/mobile sizes, active navigation, role scopes, admin-only drafts and review forms, absence of readonly write controls, disabled operational buttons, filtering, retained review notes, accessible material dialogs, synthetic downloads, example completion checks, no browser storage and no API/external requests.

Run after installing the application's locked dependencies from the repository root and the isolated test dependencies:

```sh
npm ci
cd training-isolation
npm ci
npm run test:react-demo
```

Use `BROWSER_EXECUTABLE_PATH` for an existing Chromium installation. `APP_NODE_MODULES` optionally points the test to an alternate application dependency directory; it does not modify the application's package or lockfile. `UI_SCREENSHOT_DIR` optionally preserves synthetic QA screenshots. Otherwise the test's temporary bundle and screenshots are removed when it completes.

Backend identity, real role/assignment enforcement, hosted files and concurrent production behavior are not validated by this DEMO check. Keep the module isolated until those integration gates are reviewed.
