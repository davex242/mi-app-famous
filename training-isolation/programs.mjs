import { randomUUID } from 'node:crypto';
import {loadPrivateImage} from './private-images.mjs';
import {isPDFMaterial,loadPrivatePDF} from './private-pdfs.mjs';
import {loadPrivateVideo} from './private-videos.mjs';
import { effectiveItemId, updateHistory } from './updates.mjs';

export async function ensureNoSessionOverlap(tx, enrollmentId, start, duration, ignored, fail) {
  const result = await tx.query(`select id from public.training_sessions where enrollment_id=$1
    and ($4::uuid is null or id<>$4) and status<>'missed'
    and scheduled_at<$2::timestamptz+($3::integer*interval '1 minute')
    and scheduled_at+(duration_minutes*interval '1 minute')>$2::timestamptz`, [enrollmentId, start, duration, ignored]);
  if (result.rows.length) fail(409, 'Agenda overlaps an existing session');
}

export function createProgramOperations(run, { fields, text, uuid, fail, requireAdmin, requireWrite, enrollment, session, audit }) {
  function calendarDate(value) {
    if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) fail(400, 'Valid calendar date required');
    const date = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) fail(400, 'Valid calendar date required');
    return date;
  }
  function time(value) {
    if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) fail(400, 'Valid local time required');
    return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  }
  async function toUTC(tx, date, minutes, zone) {
    const local = `${date} ${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00`;
    const valid = await tx.query('select name from pg_timezone_names where name=$1', [zone]);
    if (!valid.rows.length) fail(400, 'Invalid enrollment timezone');
    // Check all minute-offset candidates around the local time. Reject skipped or
    // repeated wall-clock times instead of silently choosing one side of a DST change.
    const { rows } = await tx.query(`with input as (select $1::timestamp as local,$2::text as zone),
      base as (select local,zone,local at time zone zone as candidate from input)
      select count(*)::integer as n,min(instant) as utc from base cross join lateral
      generate_series(candidate-interval '26 hours',candidate+interval '26 hours',interval '1 minute') as candidates(instant)
      where instant at time zone zone=local`, [local, zone]);
    if (rows[0].n !== 1) fail(409, 'Local time is skipped or repeated by a timezone change');
    return new Date(rows[0].utc).toISOString();
  }
  async function conflict(tx, enrollmentId, start, duration, ignored = null) {
    await ensureNoSessionOverlap(tx, enrollmentId, start, duration, ignored, fail);
  }
  async function plan(tx, actor, body) {
    requireWrite(actor); fields(body, ['enrollment_id', 'start_date', 'local_time', 'weekdays']);
    const e = await enrollment(tx, actor, body.enrollment_id);
    const start = calendarDate(body.start_date), minutes = time(body.local_time);
    const weekdays = body.weekdays ?? [1, 2, 3, 4, 5, 6, 7];
    if (!Array.isArray(weekdays) || !weekdays.length || weekdays.length > 7 ||
      new Set(weekdays).size !== weekdays.length || weekdays.some(day => !Number.isInteger(day) || day < 1 || day > 7)) fail(400, 'Choose valid training weekdays');
    const version = (await tx.query('select duration_days from public.training_program_versions where id=$1', [e.program_version_id])).rows[0];
    if (!version || version.duration_days > 90) fail(409, 'Program exceeds sandbox agenda limit');
    const items = (await tx.query(`select i.*,t.estimated_minutes from public.training_program_items i
      join public.training_topics t on t.id=i.topic_id where program_version_id=$1 order by day,position`, [e.program_version_id])).rows;
    if (!items.length || items.length > 180) fail(409, 'Program has no valid agenda items');
    const history=await updateHistory(tx,e.id);
    const existing = (await tx.query('select item_id from public.training_sessions where enrollment_id=$1', [e.id])).rows.map(row=>({item_id:effectiveItemId(row.item_id,history,items)}));
    existing.push(...(await tx.query('select item_id from public.training_completions where enrollment_id=$1',[e.id])).rows);
    const dates = [], cursor = new Date(start);
    while (dates.length < version.duration_days) {
      if (cursor.getUTCFullYear() > 2099) fail(400, 'Valid calendar date required');
      if (weekdays.includes(cursor.getUTCDay() || 7)) dates.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    const proposals = [], elapsed = new Map(); let skipped = 0;
    for (const item of items) {
      if (!dates[item.day - 1]) fail(409, 'Program item falls outside duration');
      const offset = elapsed.get(item.day) ?? 0;
      const begin = minutes + offset;
      elapsed.set(item.day, offset + item.estimated_minutes);
      if (begin + item.estimated_minutes > 1440) fail(409, 'Daily agenda exceeds one calendar day');
      if (existing.some(row => row.item_id === item.id)) { skipped++; continue; }
      const utc = await toUTC(tx, dates[item.day - 1], begin, e.timezone);
      await conflict(tx, e.id, utc, item.estimated_minutes);
      const end = new Date(utc).getTime() + item.estimated_minutes * 60000;
      if (proposals.some(p => new Date(p.scheduled_at).getTime() < end &&
        new Date(p.scheduled_at).getTime() + p.duration_minutes * 60000 > new Date(utc).getTime())) fail(409, 'Proposed sessions overlap');
      proposals.push({ enrollment_id: e.id, item_id: item.id, topic_id: item.topic_id,
        scheduled_at: utc, duration_minutes: item.estimated_minutes, day: item.day, position: item.position });
    }
    return { enrollment: e, proposals, skipped };
  }
  return {
    saveProgram: (token, body) => run(token, async (tx, actor) => {
      requireAdmin(actor); fields(body, ['source_id', 'title', 'duration_days', 'changelog', 'items']);
      const title = text(body.title, 120), changelog = text(body.changelog, 2000);
      if (!Number.isInteger(body.duration_days) || body.duration_days < 1 || body.duration_days > 90) fail(400, 'Program duration must be 1 to 90 days');
      if (!Array.isArray(body.items) || !body.items.length || body.items.length > 180) fail(400, 'Program must contain 1 to 180 items');
      let key = `sandbox-${randomUUID()}`, version = 1;
      if (body.source_id) {
        const source = (await tx.query('select * from public.training_program_versions where id=$1', [uuid(body.source_id)])).rows[0];
        if (!source) fail(404, 'Record unavailable');
        await tx.query('select id from public.training_program_versions where program_key=$1 and version=1 for update', [source.program_key]);
        const latest = (await tx.query('select id,version from public.training_program_versions where program_key=$1 order by version desc limit 1', [source.program_key])).rows[0];
        if (latest.id !== source.id) fail(409, 'A newer program version exists');
        key = source.program_key; version = latest.version + 1;
      }
      const program = (await tx.query(`insert into public.training_program_versions(program_key,version,title,duration_days,changelog,created_by)
        values($1,$2,$3,$4,$5,$6) returning *`, [key, version, title, body.duration_days, changelog, actor.app_user_id])).rows[0];
      const positions = new Map();
      for (const item of body.items) {
        fields(item, ['day', 'topic_id', 'notes', 'material_ids']);
        if (!Number.isInteger(item.day) || item.day < 1 || item.day > body.duration_days) fail(400, 'Program item falls outside duration');
        if (typeof item.notes !== 'string' || item.notes.length > 2000) fail(400, 'Invalid notes');
        const topic = (await tx.query('select id from public.training_topics where id=$1', [uuid(item.topic_id)])).rows[0];
        if (!topic) fail(404, 'Record unavailable');
        const materialIds = item.material_ids ?? [];
        if (!Array.isArray(materialIds) || materialIds.length > 20 || new Set(materialIds).size !== materialIds.length) fail(400, 'Invalid material list');
        const position = (positions.get(item.day) ?? 0) + 1; positions.set(item.day, position);
        const entry = (await tx.query(`insert into public.training_program_items(program_version_id,topic_id,day,position,notes,evidence_required,assessment_required)
          values($1,$2,$3,$4,$5,true,true) returning id`, [program.id, topic.id, item.day, position, item.notes.trim()])).rows[0];
        for (const materialId of materialIds) {
          const material = (await tx.query('select id,topic_id from public.training_materials where id=$1', [uuid(materialId)])).rows[0];
          if (!material || material.topic_id !== topic.id) fail(409, 'Material must belong to the exact topic revision');
          await tx.query('insert into public.training_program_materials(item_id,material_id) values($1,$2)', [entry.id, material.id]);
        }
      }
      await audit(tx, actor, version === 1 ? 'program_created' : 'program_revised', 'program', program.id);
      return program;
    }),
    publishProgram: (token, body) => run(token, async (tx, actor) => {
      requireAdmin(actor); fields(body, ['id']);
      let program = (await tx.query('select * from public.training_program_versions where id=$1', [uuid(body.id)])).rows[0];
      if (!program) fail(404, 'Record unavailable');
      await tx.query('select id from public.training_program_versions where program_key=$1 and version=1 for update', [program.program_key]);
      program = (await tx.query('select * from public.training_program_versions where id=$1', [program.id])).rows[0];
      if (program.status === 'published') return { ...program, already_published: true };
      const latest = (await tx.query('select id from public.training_program_versions where program_key=$1 order by version desc limit 1', [program.program_key])).rows[0];
      if (program.status !== 'draft' || latest.id !== program.id) fail(409, 'Only the latest draft program can be published');
      const items = (await tx.query(`select i.*,t.status as topic_status from public.training_program_items i
        join public.training_topics t on t.id=i.topic_id where program_version_id=$1`, [program.id])).rows;
      if (!items.length || items.some(item => item.day > program.duration_days || item.topic_status !== 'published' || !item.evidence_required || !item.assessment_required)) fail(409, 'Publish required topic revisions and retain practical requirements');
      const materials = (await tx.query(`select m.* from public.training_program_materials pm
        join public.training_program_items i on i.id=pm.item_id join public.training_materials m on m.id=pm.material_id
        where i.program_version_id=$1`, [program.id])).rows;
      if (materials.some(material => material.status !== 'published')) fail(409, 'Publish required material revisions first');
      for (const material of materials.filter(m => m.kind === 'document')) {
        if(isPDFMaterial(material)){await loadPrivatePDF(tx,material.id,fail);continue;}
        if (!(await tx.query('select material_id from training_private.local_material_content where material_id=$1', [material.id])).rows.length) fail(409, 'Material content unavailable');
      }
      for(const material of materials.filter(m=>m.kind==='video'))await loadPrivateVideo(tx,material.id,fail);
      for(const material of materials.filter(m=>m.kind==='image'))await loadPrivateImage(tx,material.id,fail);
      const result = (await tx.query("update public.training_program_versions set status='published',published_by=$2,published_at=now() where id=$1 returning *", [program.id, actor.app_user_id])).rows[0];
      await tx.query(`insert into public.training_approvals(program_version_id,status,requested_by,reviewed_by,reviewed_at,review_notes)
        values($1,'approved',$2,$2,now(),'Publicación administrativa del programa')`, [program.id, actor.app_user_id]);
      await audit(tx, actor, 'program_published', 'program', program.id); return result;
    }),
    previewAgenda: (token, body) => run(token, async (tx, actor) => {
      const result = await plan(tx, actor, body);
      return { preview: true, timezone: result.enrollment.timezone, skipped: result.skipped, sessions: result.proposals };
    }),
    generateAgenda: (token, body) => run(token, async (tx, actor) => {
      const result = await plan(tx, actor, body), rows = [];
      for (const proposal of result.proposals) {
        const created = (await tx.query(`insert into public.training_sessions(enrollment_id,item_id,topic_id,scheduled_at,duration_minutes,auto_generated,edited_manually)
          values($1,$2,$3,$4,$5,true,false) returning *`, [proposal.enrollment_id, proposal.item_id, proposal.topic_id, proposal.scheduled_at, proposal.duration_minutes])).rows[0];
        rows.push(created);
      }
      if (rows.length) await audit(tx, actor, 'agenda_generated', 'enrollment', result.enrollment.id, result.enrollment.id, { created: rows.length, skipped: result.skipped, start_date: body.start_date, local_time: body.local_time, weekdays: body.weekdays ?? [1,2,3,4,5,6,7] });
      return { created: rows.length, skipped: result.skipped, timezone: result.enrollment.timezone, sessions: rows };
    }),
    reschedule: (token, body) => run(token, async (tx, actor) => {
      requireWrite(actor); fields(body, ['session_id', 'local_date', 'local_time', 'expected_scheduled_at', 'reason']);
      const s = await session(tx, actor, body.session_id);
      if (s.status === 'completed') fail(409, 'Completed sessions cannot be rescheduled');
      if (typeof body.expected_scheduled_at !== 'string' || !Number.isFinite(Date.parse(body.expected_scheduled_at))) fail(400, 'Expected session date required');
      if (new Date(s.scheduled_at).getTime() !== Date.parse(body.expected_scheduled_at)) fail(409, 'Session schedule changed; refresh first');
      const e = await enrollment(tx, actor, s.enrollment_id);
      calendarDate(body.local_date); const local = time(body.local_time), reason = text(body.reason, 1000);
      const utc = await toUTC(tx, body.local_date, local, e.timezone);
      await conflict(tx, e.id, utc, s.duration_minutes, s.id);
      const result = (await tx.query("update public.training_sessions set scheduled_at=$2,status='rescheduled',edited_manually=true where id=$1 returning *", [s.id, utc])).rows[0];
      await audit(tx, actor, 'session_rescheduled', 'session', s.id, e.id, { previous_scheduled_at: s.scheduled_at, scheduled_at: utc, reason });
      return result;
    }),
    recordAttendance: (token, body) => run(token, async (tx, actor) => {
      requireWrite(actor); fields(body, ['session_id', 'status', 'expected_recorded_at']);
      const s = await session(tx, actor, body.session_id);
      if (!['present', 'absent', 'late', 'excused'].includes(body.status)) fail(400, 'Invalid attendance');
      const previous = (await tx.query('select * from public.training_attendance where session_id=$1 for update', [s.id])).rows[0];
      if (previous && (!body.expected_recorded_at || new Date(previous.recorded_at).getTime() !== Date.parse(body.expected_recorded_at))) fail(409, 'Attendance changed; refresh first');
      if (!previous && body.expected_recorded_at) fail(409, 'Attendance changed; refresh first');
      const result = (await tx.query(`insert into public.training_attendance(session_id,status,recorded_by) values($1,$2,$3)
        on conflict(session_id) do update set status=excluded.status,recorded_by=excluded.recorded_by,recorded_at=now() returning *`, [s.id, body.status, actor.app_user_id])).rows[0];
      await audit(tx, actor, 'attendance_recorded', 'session', s.id, s.enrollment_id, { previous_status: previous?.status ?? null, status: body.status });
      return result;
    }),
  };
}
