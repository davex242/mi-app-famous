import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createHash } from 'node:crypto';

const localTables = `
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
  const s=await schemaSources();return createHash('sha256').update(s.bootstrap+s.sql+localTables).digest('hex');
}
// Caller must supply a new, exclusively owned synthetic database, never an existing service.
export async function initializeSandboxSchema(db) {
  const s=await schemaSources();
  await db.exec(s.bootstrap);
  await db.exec(s.executable);
  await db.exec(localTables);
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
