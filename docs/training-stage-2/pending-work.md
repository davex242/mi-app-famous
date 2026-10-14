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

These are functional with synthetic data in the separate local training runtime. The React application now has all nine native DEMO views in its existing training route. Navigation, filters, synthetic material previews/downloads and example closing checklists work. The default hosted DEMO still disables operational writes, real uploads, quiz invitations and closing. An explicitly enabled localhost workspace now reads all nine sections from the functional local training API and supports synthetic enrollment, agenda preview/confirmation, rescheduling, attendance, evidence submission/private downloads and administrative review, assessment and explicit practical validation, private library previews/downloads and quiz invitations/revocation, server-checked final closing and historical HTML/JSON exports and optional program-update preview/acceptance and administrative topic/text/HTTPS authoring and versioned administrative exam and program editing/publication and PNG/JPEG/PDF/MP4 file-material revision editing with verified server sessions. Native JPEG preparation and permission-checked evidence image/video previews are also connected; see `react-local-api.md`.

## Confirmed quiz policy

- Approval threshold: **75%**. With 50 equally weighted questions, 38 correct answers pass (37 give 74%).
- Initial allowance: **3 attempts**.
- Additional attempts require **prior approval**. The request, administrative review and server guard are implemented in the isolated runtime. An enrollment has three initial attempts plus approved extras across all invitations/exam versions; renewal/revocation never resets consumption. Approval audit records persist across local restart.
- Dave accepted the proposed content for initial testing and fixed invitation expiry at **24 hours from server issuance**. Exact timestamps are server-owned.

These values are recorded in the study proposal and private review file. The attempt service now enforces the allowance; approval percentages remain immutable per published exam version. The proposed initial course uses the confirmed 75% when its reviewed exam is later published. Existing synthetic exams/thresholds are preserved.

## Pending, in recommended order

1. **Connect the native React views to the isolated training API for synthetic end-to-end tests.** The initial local API connection is complete: verified synthetic sessions, nine scoped read views, enrollment writes, agenda/asistencia, conflict handling and service errors. Native JPEG preparation and evidence image/video previews are complete, with private file checks, explicit test consent and cleanup on close/filter/refresh. The standalone local runtime remains the operational reference.
2. **Review the remaining interface flows with the user.** Technical responsive review is complete in the isolated React runtime: all nine sections, four synthetic roles and 1440/768/390/320px viewports, plus loaded program/exam editors and evidence dialogs. User visual acceptance remains pending; review captures and results are in `react-layout-review.md`.
3. **Prepare actual training content.** An editable editorial proposal is prepared: 14 study guides/practices/evidence checklists and 50 distinct private case questions with review rationales. Administrators can review the study proposal in Biblioteca. The 50-case bank is kept in a separate private review file because the GitHub repository is public; a generic JSON loader is now implemented only in the verified local administrative editor. It is accepted provisionally for initial testing, but not assigned or published in production. Review `training-content-proposal.md`, The proposed content is accepted for initial testing; the local catalogue importer is implemented with preview, separate confirmation, atomic draft creation and repeat/restart protection. Review/edit the loaded drafts and publish through separate existing actions. Dave confirmed 75% approval and three initial attempts on 2026-10-13; extra attempts require prior approval. Invitation expiry is fixed at 24 hours from server issuance.
4. **Verify recruiter identity and assignments.** MICO profile support is prepared in the branch. Its nullable column remains unapplied. A server-only identity/assignment adapter contract now has 52 synthetic checks (`identity-adapter-contract.md`); it has no hosted provider or routes. Verify real MICO IDs, host assignments and a server-verifiable identity link; never substitute internal user IDs or infer IDs from matching names.
5. **Prepare integration with the existing backend.** Verify the actual DatabasePad schema and permissions, select a supported API/runtime approach, and review the additive training schema and access rules before any authorized hosted change. Do not redirect the app to the separate Supabase project or migrate the current database as part of this work.
6. **Configure production-private training files.** Choose scoped private storage, access checks, upload limits and retention/backups. Existing local attachment handling is not hosted storage, and a file URL is not sufficient authorization.
7. **Validate the real integration in a separate test environment.** Exercise multiple concurrent users, current assignment changes, permission revocation, failure recovery, file access and end-to-end completion against the chosen backend. Local browser/PGlite tests do not establish hosted concurrency or deployment readiness.
8. **Review the release and rollback before merging.** Confirm the intended change set, preview deployment, gradual enablement and backups. A Vercel code rollback does not undo records written or database changes.

The accepted fourteen-day course and private-file exam have now been published and exercised together in disposable local QA databases, including the actual private review file. See `accepted-course-journey.md`; 71 checks pass for each input source. These QA publications are not durable user catalogue data or a hosted release. The server-only identity/access adapter contract is now specified and tested, without activation. Next development step: define the hosted route and data-mapping contract against the chosen backend capabilities; real session verification and mappings remain pending before any hosted change. The accepted study catalogue importer is complete; publication of topics, materials and program remains separate. Private JSON validation/loading is complete, uses screen memory only and sends nothing until explicit local publication; the actual bank stays out of the public repository. Production private-bank hosting remains pending. Attempt preapproval is complete locally; real identity/backend/file-hosting integration remains separate. Items 4–8 require later integration work and explicit authorization for any hosted configuration or schema changes.

## Steps 1–5 requested for completion

See `production-connection-status.md` for the exact boundary. A persistent native React review runtime and atomic repeat-safe private-file course preparation are implemented and tested (15 checks). The actual reviewed bank and catalogue are published in a separate persistent local review store and saved privately as a restore bundle. Actual backend verification, hosted identity, hosted storage and staging integration remain blocked by unavailable access; they are not marked complete. Main and the existing application remain unchanged.
