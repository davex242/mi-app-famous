# MICO ID in recruiter profiles — isolated preparation

`AppUser.mico_id` is an optional string, distinct from the internal `AppUser.id`.
User Management can edit this value only when records returned by the backend contain the new column. Legacy backend writes omit `mico_id` and preserve the existing user form.

New registrations use a verified profile MICO ID when available, including after the user list loads. If no value exists, the recruiter enters it manually in `hosts.rec_id`. Changing recruiter clears the previous ID. Ambiguous duplicate names never choose an arbitrary MICO ID. Existing host records retain their stored `rec_id`.

The draft SQL is blocked by an exception and rolls back. No hosted change has been applied. Before enabling this field on the current backend, review the actual table definition and existing access controls, create a proper additive migration with a nullable text column, numeric-format constraint and unique non-null values, test in a separate environment, and verify backups and rollback. The unique constraint permits multiple NULL values.

Do not merge the isolated training code as part of the registration form update. Current main receives only layout, helper labels, optional payment fields and manual recruiter MICO ID. Profile support remains on the isolated branch.

No existing MICO IDs are inferred or backfilled. Reverting application code should retain the nullable column and stored IDs; do not drop them as part of a code rollback.
