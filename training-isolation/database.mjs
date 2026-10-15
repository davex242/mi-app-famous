import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createHash } from 'node:crypto';

const legacyLocalTables = `
      create table training_private.local_credentials (
        auth_user_id uuid primary key references auth.users(id), username text not null unique,
        password_salt text not null, password_digest text not null
      );
      create table training_private.local_sessions (
        token_hash text primary key, auth_user_id uuid not null references auth.users(id),
        expires_at timestamptz not null, revoked_at timestamptz
      );
      alter table training_private.local_credentials enable row level security;
      alter table training_private.local_sessions enable row level security;
      revoke all on training_private.local_credentials,training_private.local_sessions from public,anon,authenticated;
      create table training_private.local_material_content (
        material_id uuid primary key references public.training_materials(id), body text not null
      );
      alter table training_private.local_material_content enable row level security;
      revoke all on training_private.local_material_content from public,anon,authenticated;
`;

// Only the exact preceding local schema can be copied forward. This does not
// accept hosted connections or run DDL against the source store.
export const PRE_EVIDENCE_SCHEMA='37ea1ef49f2cb52acf2efdbd1a5d1424c62a4135b4302be1905460c2beeaaf2d';
const evidenceTables = `
      create table training_private.local_evidence_content (
        evidence_id uuid primary key references public.training_evidence(id), body text not null
      );
      alter table training_private.local_evidence_content enable row level security;
      revoke all on training_private.local_evidence_content from public,anon,authenticated;
`;
const localTables=legacyLocalTables+evidenceTables;
export async function upgradePreEvidenceCopy(tx) {
  const s=await schemaSources();
  const previous=createHash('sha256').update(s.bootstrap+s.sql+legacyLocalTables).digest('hex');
  if(previous!==PRE_EVIDENCE_SCHEMA)throw Error('Unsupported local copy upgrade');
  await tx.exec(evidenceTables);
  await tx.exec(await readFile(new URL('../training-hosted/enrollment-scope.sql',import.meta.url),'utf8'));
}

async function schemaSources() {
  const [bootstrap,sql]=await Promise.all([
    readFile(new URL('bootstrap.sql',import.meta.url),'utf8'),
    readFile(new URL('../docs/training-stage-2/schema-and-rls.draft.sql',import.meta.url),'utf8'),
  ]);
  const guard=/do \$\$ begin\s+raise exception 'DESIGN ONLY:[^\n]+\nend \$\$;/;
  if(!guard.test(sql)||!/rollback;\s*$/.test(sql))throw Error('Unexpected draft format');
  return {bootstrap,sql,executable:sql.replace(guard,'-- Isolated synthetic sandbox only').replace(/rollback;\s*$/,'commit;')};
}
export async function sandboxSchemaFingerprint() {
  const s=await schemaSources();const migration=await readFile(new URL('../training-hosted/enrollment-scope.sql',import.meta.url),'utf8');return createHash('sha256').update(s.bootstrap+s.sql+localTables+migration).digest('hex');
}
// Caller must supply a new, exclusively owned synthetic database, never an existing service.
export async function initializeSandboxSchema(db) {
  const s=await schemaSources();
  await db.exec(s.bootstrap);
  await db.exec(s.executable);
  await db.exec(localTables);
  await db.exec(await readFile(new URL('../training-hosted/enrollment-scope.sql',import.meta.url),'utf8'));
}

// Deliberately has no URL, connection-string or persistent-directory argument.
export async function createIsolatedDatabase() {
  const db = new PGlite();
  try {
    await initializeSandboxSchema(db);
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}
