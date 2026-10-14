# Hosted training preview — separate Supabase backend

Target: the separately verified training Supabase project and feature-branch Vercel preview. Deployment-specific identifiers and owner email are configured outside public source.

## Implemented

- Two additive migrations create the standalone training schema (18 public tables, 10 private tables), with RLS on every table and explicit training UUID mappings. No legacy `hosts`/`app_users` tables or records were copied or created in public.
- The `training-preview` Supabase function bundles the existing operational service, using Postgres transactions rather than PGlite/local files. Its dependencies are pinned. A single connection per worker keeps the bounded PDF decoder isolated within a transaction; the Edge PDF port still needs an authenticated hosted file test before release.
- Supabase Auth validates private requests. Signed-token claims are read only after the Auth user endpoint validates the token. Session existence, current training role and active status are checked in the operation transaction. Roles and MICO IDs never come from editable metadata or the old browser login.
- The first confirmed email account with a provider-recorded confirmation delivery and Dave's configured admin email can bootstrap its own superadmin principal. No password/account was created or emailed by the assistant. Other accounts need verified email and explicit superadmin approval. Profile/assignment changes are audited, require confirmation and reject a changed review hash. Existing app IDs are optional reviewed metadata, never automatic permissions.
- A Node API proxy and branch-specific preview variables prepare React's connection to the function. Cloud server variables are configured; protected Vercel preview verification remains pending. The proxy fails closed on production, other branches, unsupported routes and foreign browser origins. It holds no database credentials. The frontend uses only the publishable key and keeps its training token in memory; no existing app key or configuration was replaced.
- The function's platform JWT gate is disabled deliberately because public quiz invitations use custom opaque tokens. Every private route verifies Supabase identity itself; public quiz routes reuse the hashed-invitation, expiry, host/enrollment and attempt guards. No arbitrary SQL or target URL is accepted by either HTTP layer.
- Browser Data API/GraphQL access to training tables is denied. A backend-only `training_preview_reader` inherits the authenticated RLS policies for scoped workspace reads, while direct authenticated SELECT grants are revoked. Keys, invitation hashes, answers, profile mappings and material/evidence bodies remain private.

## Content/publication boundary

Fourteen topics, fourteen text guides and one fourteen-day program have been loaded as **drafts**, without hosts, assignments, enrollments, quiz versions or answer keys. A labelled preparation principal records the administrative seed; it is not an authenticated human account and has no runtime access.

Automatic approval review rejected uploading the private bank and setting catalogue/exam rows to `published`: it considered explicit publication authorization outstanding. The rejection was respected. The safer draft-only transaction contains no quiz questions or keys. The original private JSON remains in the private review file. Official/persistent publication still needs the user's explicit approval and is not claimed complete.

The public `prepare-content.mjs` script generates a private transaction from an external reviewed JSON file. Default mode is draft-only. The explicit reviewed-publication mode is for a separately approved operation; it is not executed automatically and never adds the generated SQL or actual bank to Git.

## Entry and first account

Use the feature-branch preview. Sign into the existing app normally, open training, and use its separate training login. To create the first account, use Dave's configured admin email and a new password of at least 12 characters, then confirm the email and return to the preview. Creating an account sends the normal provider confirmation only when the user presses the signup button. The existing app's password is not copied or migrated.

The admin can review accounts and canonical host assignments in Programas. Recruiters need their own confirmed account and administrative activation. No actual agency profiles, MICO IDs or assignments are fabricated.

## Validation and release limits

Schema isolation/RLS and the proxy's preview/auth/origin guards are tested locally, with nine provider/session verification checks, TypeScript and the 237-check native local regression. Remote checks confirm 28 RLS-enabled tables and no direct anon/authenticated access to exam questions or private keys. Security advisors' private-table no-policy notices are intentional deny-all rules, not public grants; GraphQL exposure warnings were removed by the private reader migration.

A real authenticated hosted end-to-end run is still pending the first verified account and reviewed host assignment. Provider email settings, PDF runtime compatibility, concurrent hosted users and release/rollback must be verified before production enablement. No production promotion or training merge was performed. A deployment code rollback does not reverse these new standalone database migrations or later data writes.

## Stage 1 checkpoint

Original source recovered after the interrupted save. Public source now uses environment configuration instead of a hardcoded owner email, project URL or deployment identifiers. The deployed function now uses this source revision, including the explicit Buffer injection needed by eagerly initialized bundled modules. No contents are published by saving or building the code.

Vercel server-only configuration: `TRAINING_PREVIEW_ENABLED`, `TRAINING_PREVIEW_BRANCH`, `TRAINING_SUPABASE_URL`. Missing configuration disables the proxy. Production is always disabled.

Edge server-only configuration: `TRAINING_EXPECTED_SUPABASE_URL` must match provider-injected `SUPABASE_URL`; `TRAINING_OWNER_EMAIL` is required for the explicitly confirmed initial owner bootstrap. Existing injected database credentials remain server-only.

Browser configuration: `VITE_TRAINING_PREVIEW_ENABLED`, `VITE_TRAINING_SUPABASE_URL`, `VITE_TRAINING_PUBLISHABLE_KEY`. These are public browser values by design; never put the owner email, database password or secret/service-role keys under `VITE_`.

Next: verify the protected preview in the user’s Vercel session. Authenticated journey and publication remain later stages.

## Stage 2 configuration checkpoint

The user saved the two Edge server variables. The feature preview server variables were set with branch-only scope and the same reviewed commit was rebuilt successfully on Vercel. The Edge bundle was deployed with explicit Buffer injection after a real startup check identified eager module initialization before entrypoint globals. Hosted health and unauthenticated rejection are verified separately from Vercel protected-preview access; an authenticated full journey is not claimed. Production settings, main and draft content remain unchanged.

Direct hosted checks returned HTTP 200 with initialized hosted-preview health and HTTP 401 for the private identity route without a session. These confirm server configuration/startup and database reachability, not the full browser-to-proxy flow. Vercel is READY but automation bypass is denied by the connector; its health route still needs a signed-in browser check.

## Protected preview login correction

Same-origin proxy requests include the browser’s Vercel protection cookie. Previously `credentials: omit` caused a protection redirect before health/login could complete. The proxy does not forward Cookie to Supabase; training authorization still requires the separate bearer/session checks. Direct Supabase Auth requests continue to omit browser credentials.

The first user account was confirmed by the provider, but its confirmation redirect used the project’s default localhost URL. Before additional signups, configure the training project’s Auth Site URL/redirect allowlist for the stable preview. Do not disable confirmation or edit auth users to bypass it.

Private proxy requests carry the training bearer under `X-Training-Authorization`, separate from Vercel’s deployment authorization. The server translates it to standard Authorization only for the fixed Supabase function. The original browser Authorization and Cookie headers are never forwarded. Failed HTTP calls show their status code without tokens or provider details. Provider password login succeeded during review; authenticated workspace verification remains pending the updated protected preview.
