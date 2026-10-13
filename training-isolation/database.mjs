import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Deliberately has no URL, connection-string or persistent-directory argument.
export async function createIsolatedDatabase() {
  const db = new PGlite();
  try {
    await db.exec(await readFile(new URL('bootstrap.sql', import.meta.url), 'utf8'));
    const sql = await readFile(new URL('../docs/training-stage-2/schema-and-rls.draft.sql', import.meta.url), 'utf8');
    const guard = /do \$\$ begin\s+raise exception 'DESIGN ONLY:[^\n]+\nend \$\$;/;
    if (!guard.test(sql) || !/rollback;\s*$/.test(sql)) throw new Error('Unexpected draft format');
    await db.exec(sql.replace(guard, '-- In-memory sandbox only').replace(/rollback;\s*$/, 'commit;'));
    await db.exec(`
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
    `);
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}
