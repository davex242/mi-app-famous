import { randomUUID } from 'node:crypto';

// All entities are synthetic, recreated on each startup, and marked DEMO.
// Published state below is a fixture, not a content-publication implementation.
export async function seedDemoProgram(db, administrator, recruiter, programKey = 'DEMO-SANDBOX') {
  const host = randomUUID(), program = randomUUID(), itemIds = [];
  await db.transaction(async tx => {
    await tx.query('insert into public.hosts(id) values($1)', [host]);
    await tx.query('insert into training_private.training_host_assignments(host_id,recruiter_id,assigned_by) values($1,$2,$3)', [host, recruiter, administrator]);
    await tx.query(`insert into public.training_program_versions(id,program_key,version,title,status,created_by,published_by,published_at)
      values($1,$3,1,'DEMO — programa flexible de 14 días','published',$2,$2,now())`, [program, administrator, programKey]);
    for (let day = 1; day <= 14; day++) {
      const topic = randomUUID(), item = randomUUID();
      await tx.query(`insert into public.training_topics(id,content_key,revision,title,category,status,estimated_minutes,created_by)
        values($1,$1,1,$2,'DEMO','published',30,$3)`, [topic, `DEMO · Práctica ${day}`, administrator]);
      await tx.query(`insert into public.training_program_items(id,program_version_id,topic_id,day,position)
        values($1,$2,$3,$4,1)`, [item, program, topic, day]);
      itemIds.push(item);
    }
  });
  return { host_id: host, program_version_id: program, item_ids: itemIds, timezone: 'America/Costa_Rica', sandbox: true };
}
