# Requested steps 1–5 — actual completion boundary

The request is to make the training module work while preserving the current application, main and its DatabasePad backend. Existing authorization does not turn access to another application's Supabase project into access to this one.

| Step | Work completed | Still required for the real application |
|---|---|---|
| 1. Verify current backend | Current branch code confirms DatabasePad as the configured URL. AuthContext performs a legacy `app_users` email/password lookup and browser storage restoration. Public metadata/settings retrieval could not be completed through the available reader. Exact lookup of the user-provided separate Supabase project returned a permission error. | Read-only metadata and a verified session mechanism for the exact current DatabasePad project. Effective grants/RLS, primary-key types and auth capabilities remain unverified. |
| 2. Connect identities and permissions | Server identity adapter and explicit canonical mappings are prepared; 52 synthetic contract checks pass. | A real trusted verifier, reviewed actual user/host mappings and assignment records, plus transactional hosted enforcement. Nothing is inferred from names or the browser's stored role. |
| 3. Private storage | Existing local private schema, permission-checked files/keys, mode-restricted persistent snapshots and backups are operational. Native React can now use the persistent local runtime. | A separately identified hosted private store/API with verified access, revocation and backup behavior. Local PGlite persistence is not hosted storage. |
| 4. Integrated testing | 71 accepted-course checks pass with synthetic data and 71 with the private bank. A further 15 checks cover atomic persistent preparation, restart, repeat safety and native React access. | Repeat against an actual staging backend, with real provider sessions, multiple connections and failure recovery. |
| 5. Publish reviewed content | The accepted 14-topic/14-guide/14-practice course and private 50-question, 75% exam are published in a separate persistent local review store, with no enrollment. A private restore bundle preserves the prepared environment. | Publication into the actual staging/hosted environment, after steps 1–3 are verified. No production catalogue or exam was changed. |

The available Supabase connection denied access to project `jpnsxrzlthkvyphepbao`. This is an access limitation, not proof that the project is invalid or that DatabasePad is unavailable. No other project was inspected or changed. Browser login and credentials were not probed. The current app's embedded public client key was not repurposed as server authority.

## Runnable persistent review

The existing memory launcher remains available. The separate persistent launcher is:

```sh
npm run start:react-persistent --prefix training-isolation -- LOCAL_STORE
```

It binds only to `127.0.0.1`, serving `/react-training?trainingSandbox=local`. A first startup of a new store requires `TRAINING_DEMO_PASSWORD`. Later starts preserve the password and data. Accounts remain explicitly synthetic; they do not represent real agency users or a new production login.

After reviewing a private JSON bank, an explicit local preparation command can publish the accepted catalogue and bank atomically:

```sh
npm run prepare:accepted-local --prefix training-isolation -- LOCAL_STORE /private/bank.json --publish
```

`TRAINING_DEMO_PASSWORD` must match the local admin account. Bank validation runs before provisioning. Any publication failure rolls back fixture accounts, catalogue and exam together. Repeating uses the same program/exam; a changed bank conflicts and preserves the existing one. The preparation never enrolls a host, overwrites an existing bank, creates cloud resources or accesses legacy rows. Use a separate named review store, never a production database URL.

The private restore bundle contains the local backup, original private bank and only the synthetic local account access file. Those bytes are outside the repository and must remain private. Restoring creates a new local store and revokes copied sessions/invitations; published content and synthetic credentials remain available. No actual recruiter MICO IDs or agency assignments are fabricated.

## Concrete requirement to continue

Obtain read-only metadata/session access to the current DatabasePad backend and access to the independently chosen training staging backend. The already-prepared `legacy-inspection.readonly.sql` selects metadata only and rolls back. Access to Vercel deployment URLs or the public GitHub source does not supply database administration or a verified identity API. The new local preparation is reviewable now, but it is not evidence that all five hosted integration steps are complete.
