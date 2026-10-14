# Server identity and assignment adapter — isolated contract

The executable contract is `training-isolation/integration-identity.mjs`, with synthetic tests in `integration-identity.test.mjs`. It is server-only preparation: no application import, HTTP route, provider configuration, schema migration or hosted connection was added. Default DEMO and localhost synthetic login remain unchanged.

## Sources and identifier boundaries

| Value | Required source | Use |
|---|---|---|
| Provider + subject | Server `verifySession` implementation, verifying authenticity, expiry and revocation according to its actual provider | Resolve one active identity bridge; token role/profile claims do not authorize operations |
| Legacy user key | Explicit reviewed bridge to the existing user record | Locate the current principal; never match by name or email automatically |
| Training user UUID | Explicit canonical mapping in the principal record | Training actor, relationships and audit; never displayed as the recruiter's MICO ID |
| Recruiter MICO ID | Current principal profile `mico_id`, numeric text of 1–32 digits or null | Profile display; preserve leading zeroes; null stays missing |
| Legacy host key | Explicit reviewed host mapping | Connect the real host record to its canonical training host UUID |
| Training host UUID | Reviewed host mapping and active assignment | Training scope and relationships |
| Host MICO ID | Host profile, numeric text or null | Emitter display; does not replace recruiter profile or authorize scope |
| Current role/activity | Current server principal | Roles: superadmin, subadmin, edit, readonly; inactive/unknown roles denied |
| Host assignment | Current server mapping of training host UUID to training user UUID | Assigned staff scope; no inference from `hosts.reclutador`, `rec_id`, display name or matching MICO values |

Actual legacy primary-key types are still unknown. The adapter accepts opaque legacy keys and requires explicit canonical UUID mappings for the existing training design. This does not claim that current `app_users.id` or `hosts.id` are UUIDs and does not create/backfill those mappings. A missing MICO ID does not silently become a UUID or a stored registration `rec_id`; a recorded numeric value also does not prove external MICO account ownership.

## Trusted server ports

`createTrainingIdentityAdapter({verifySession, readSnapshot})` takes implementations supplied by a future server integration, never browser callbacks or request-body objects.

- `verifySession(credential)` returns only the authenticated provider and subject after verification, or denies. No localStorage user object, password hash comparison or unverified JWT decoding is accepted as that implementation. The contract does not choose a provider or copy legacy credentials.
- `readSnapshot({provider,subject})` obtains current authoritative records for `bridges`, `principals`, `hosts` and `assignments`, with a consistent view and explicit mappings. Current role, activity, assignment and MICO profile must be reread, not accepted from credential claims. Missing/failed snapshots fail closed.
- `resolve(credential)` validates references and uniqueness, then returns an immutable, minimal actor projection: canonical training user UUID, current role, nullable recruiter MICO ID and host scope. Credentials, provider subject, legacy keys and unrelated profile contents are omitted. It does not cache identities.
- `requireTrainingCapability(actor, capability, host_id?)` accepts only an actor constructed in-process by this contract, and applies `read`, `write` or `admin`. Objects copied from JSON or assembled by callers are rejected. `readonly` cannot write; only current superadmin/subadmin actors have admin capabilities. Every targeted host must be in the projected scope; inaccessible targets produce 404.

A resolution is a **read snapshot**, not a mutation transaction or a persistent permission grant. A future write route must verify a fresh session and reread/lock principal, assignment and affected training state inside its operation transaction, as the isolated service already does. Never cache/reuse this projection across requests or replace that transaction guard with this helper. Hosted revocation, locking, provider behavior and concurrency remain unimplemented and must be tested after choosing the real backend.

Admins receive only active hosts with valid active assignments to active known-role principals. Assigned edit/readonly staff receive their own active hosts. Hosts without a reviewed assignment are unavailable to this module. This conservative boundary does not change existing application access.

## Rejected states

Duplicate provider subjects, legacy keys, canonical IDs, assignments or non-null MICO IDs within the same profile collection are rejected rather than selecting a record. Recruiter and emitter MICO collections are separate: a person may have both profiles. Orphan bridges/assignments, malformed canonical UUIDs, invalid profile values and non-boolean activity fields are rejected. Inactive subjects/principals are denied. Profile MICO values are strings; neither numeric casting nor trimming is performed during resolution.

The adapter has no inference, writes, SQL, network calls or automatic migration. Its trusted ports are interface boundaries rather than proof that an actual provider exists.

## Verification and remaining work

52 synthetic checks cover current server roles over forged credential claims; missing profile MICO and leading zeroes; assigned/unrelated scope; transfers and role downgrade on the next resolution; both admin roles; inactive records; duplicates/orphans; forged or JSON-copied actors; no name/registration-ID fallback; revoked/invalid sessions and failed snapshots. This is contract validation, not a hosted identity integration test.

The current branch's AuthContext source still uses browser storage and legacy email/password fields; reviewing that code does not establish effective backend permissions or a verified server session. Production login is unchanged. Before implementing the trusted ports, verify the exact DatabasePad project's session capability, legacy types/access rules and profile-column availability; decide how a separately verified training identity is linked to the existing user. Review the mapping data in a separate test environment, then implement transactional guards and real revocation/access tests. No changes to main, production, the unrelated Supabase project or the sewing application are part of this step.
