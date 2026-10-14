# Accepted initial course — integrated local verification

Scope: feature branch `base44/setup-b8f0f68b`. Main, Vercel production, DatabasePad and the unrelated sewing application remain untouched. The accepted course is 14 days, with mandatory evidence/assessment, a 50-question exam at 75%, three initial attempts, preapproved extras and 24-hour invitations.

## What was exercised

The new `training-isolation/accepted-training-journey.test.mjs` runs one continuous journey against the real isolated service and native React application:

1. An authenticated superadmin previews/confirms the 14-unit catalogue import in Biblioteca. The imported program remains a draft; publishing it before its topics/materials is refused. All 14 guides are checked for evidence and review criteria, then published separately through the administrative service, followed by their exact program version.
2. The administrative React editor validates/loads the private JSON file. Loading alone cannot publish it. Separate review confirmation publishes its 50 questions and private keys locally, preserving the 75% threshold and clearing the editor draft.
3. The assigned recruiter enrolls a synthetic emitter through React, then previews/confirms 14 sessions at 19:00 Costa Rica time. The initial UTC date resolves to the following day at 01:00. Preview writes nothing.
4. Through the real service, all 14 sessions receive attendance, evidence, administrative review, passing assessment and explicit practical validation. The first three include synthetic PNG, PDF and MP4 proofs. Premature practical validation is refused. Even 100% practical completion cannot waive the quiz.
5. Three attempts with 37 correct answers score 74% and fail. A fourth start or replacement invitation is refused. A pending extra request grants nothing, and a recruiter cannot approve it. A verified subadmin preapproves one extra attempt before its invitation is issued.
6. The mobile public quiz shows 50 questions without answer keys/rationales and removes its invitation secret from the URL. With 38 correct answers, its server result is 76% and passes. The approved fourth attempt consumes the enlarged allowance exactly once. Invitations expire 24 hours from server issuance.
7. React displays the complete checklist, requires separate final-closing consent and closes the training. Downloaded JSON/HTML reports retain 14 practices and the verified 76% result against 75%, excluding answers, rationales and invitation credentials.
8. A future exam revision cannot rewrite the historical report. An unrelated recruiter cannot review/export the record. Closed training refuses evidence writes and public quiz access. Browser storage stays empty, with no external requests or browser errors.

## Inputs and results

**71 checks pass with the repository's synthetic fixture, and 71 with the actual private review JSON.** The actual questions/keys/rationales are never embedded in source, console output, screenshots, tracing or committed artifacts. Type/content validation happens before using either bank; the public fixture is based only on the pre-existing DEMO bank.

The test uses a fresh **memory-only database**, loopback-only HTTP server and temporary React build. Cleanup closes the browser, database and server and deletes temporary build files. The private input remains in its original private review file. Test publications/enrollments are discarded, so this is a verification run rather than a durable setup of a user environment.

Run `npm run test:accepted-journey` inside `training-isolation` using the same `APP_NODE_MODULES` / `BROWSER_EXECUTABLE_PATH` settings as the other native React suites. Optionally supply `TRAINING_PRIVATE_BANK_FILE` pointing to a private local JSON file. Do not add that file to the public repository. Screenshot/tracing output is intentionally unavailable in this journey.

## Remaining boundary

This verifies the accepted content, local permissions and connected workflows. It does not establish hosted deployment readiness, real recruiter/MICO identity, DatabasePad integration, multi-user production concurrency, persistent hosted files or release/rollback guarantees. Those remain separate work. The next isolated step is to define the adapter and identity/access contract without changing the live backend.
