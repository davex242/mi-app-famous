# Training module — remaining work

Updated 2026-10-13. Scope: `base44/setup-b8f0f68b`; keep the current database and hosting in place. No training changes are deployed to main.

## Working in the isolated environment

- Versioned topics, materials, programs and optional program updates.
- Timezone-aware agenda generation, rescheduling and attendance.
- Evidence submission and administrative review, including private PNG/JPEG, PDF and MP4 handling.
- Administrative assessment and practical validation.
- Published 50-question quizzes, temporary invitations, server grading and explicit passing thresholds.
- Server-checked completion requirements, administrative confirmation, immutable historical results and HTML/JSON downloads.
- Local persistence, restart, backup, copy restore and explicit supported copy upgrade.
- Responsive overview, agenda, evidence filters and the progress/closing screen.

These are functional with synthetic data in the separate local training runtime. The React application now has all nine native DEMO views in its existing training route. Navigation, filters, synthetic material previews/downloads and example closing checklists work. The default hosted DEMO still disables operational writes, real uploads, quiz invitations and closing. An explicitly enabled localhost workspace now reads all nine sections from the functional local training API and supports synthetic enrollment with verified server sessions. Remaining operational React forms are pending; see `react-local-api.md`.

## Pending, in recommended order

1. **Connect the native React views to the isolated training API for synthetic end-to-end tests.** The initial local API connection is complete: verified synthetic sessions, nine scoped read views, enrollment writes and service errors. Next adapt native agenda/attendance, evidence/review, material access, updates, quiz invitations and server-checked closing without routing writes to production or exposing answer keys. The standalone local runtime remains the operational reference.
2. **Review the remaining interface flows with the user.** Programs, material library, quiz authoring/invitations and recruiter/read-only views need final visual acceptance inside the application.
3. **Prepare actual training content.** Replace DEMO topics, materials, program items and question banks with reviewed agency content; define each exam's passing threshold and invitation limits explicitly.
4. **Verify recruiter identity and assignments.** MICO profile support is prepared in the branch. Its nullable column remains unapplied. Verify real MICO IDs, host assignments and a server-verifiable identity link; never substitute internal user IDs or infer IDs from matching names.
5. **Prepare integration with the existing backend.** Verify the actual DatabasePad schema and permissions, select a supported API/runtime approach, and review the additive training schema and access rules before any authorized hosted change. Do not redirect the app to the separate Supabase project or migrate the current database as part of this work.
6. **Configure production-private training files.** Choose scoped private storage, access checks, upload limits and retention/backups. Existing local attachment handling is not hosted storage, and a file URL is not sufficient authorization.
7. **Validate the real integration in a separate test environment.** Exercise multiple concurrent users, current assignment changes, permission revocation, failure recovery, file access and end-to-end completion against the chosen backend. Local browser/PGlite tests do not establish hosted concurrency or deployment readiness.
8. **Review the release and rollback before merging.** Confirm the intended change set, preview deployment, gradual enablement and backups. A Vercel code rollback does not undo records written or database changes.

Next development step within the current isolated scope: continue item 1 with native agenda/attendance and evidence/review; review the connected interface under item 2. Items 4–8 require later integration work and explicit authorization for any hosted configuration or schema changes.
