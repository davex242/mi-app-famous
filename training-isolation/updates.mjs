import { createHash } from 'node:crypto';

export function effectiveItemId(itemId, history, currentItems) {
  const next = new Map();
  for (const update of history) for (const pair of update.equivalence_map.pairs ?? []) next.set(pair.old_item_id, pair.new_item_id);
  const seen = new Set();
  while (next.has(itemId) && !seen.has(itemId)) { seen.add(itemId); itemId = next.get(itemId); }
  return currentItems.some(item => item.id === itemId) ? itemId : null;
}
export async function updateHistory(tx, enrollmentId) {
  return (await tx.query(`select h.*,v.version as to_version from public.training_update_history h
    join public.training_program_versions v on v.id=h.to_version_id where enrollment_id=$1 order by v.version,h.id`, [enrollmentId])).rows;
}
export async function currentProgress(tx, e) {
  const items = (await tx.query('select id from public.training_program_items where program_version_id=$1', [e.program_version_id])).rows;
  const completed = (await tx.query(`select c.item_id from public.training_completions c join public.training_program_items i on i.id=c.item_id
    where c.enrollment_id=$1 and i.program_version_id=$2`, [e.id,e.program_version_id])).rows;
  return { enrollment_id:e.id, program_version_id:e.program_version_id, total_items:items.length, completed_items:completed.length,
    percent:items.length ? Math.round(completed.length/items.length*10000)/100 : 0 };
}
export async function propagateCompletion(tx, e, source) {
  const items = (await tx.query('select id from public.training_program_items where program_version_id=$1',[e.program_version_id])).rows;
  const target = effectiveItemId(source.item_id,await updateHistory(tx,e.id),items);
  if (target && target!==source.item_id) await tx.query(`insert into public.training_completions(enrollment_id,item_id,validated_by,validated_at)
    select enrollment_id,$2,validated_by,validated_at from public.training_completions where enrollment_id=$1 and item_id=$3
    on conflict(enrollment_id,item_id) do nothing`,[e.id,target,source.item_id]);
}

export function createUpdateOperations(run,{fields,uuid,fail,requireWrite,enrollment,audit}) {
  async function items(tx,versionId) {
    const entries=(await tx.query('select * from public.training_program_items where program_version_id=$1 order by day,position',[versionId])).rows;
    for(const entry of entries) entry.material_ids=(await tx.query('select material_id from public.training_program_materials where item_id=$1 order by material_id',[entry.id])).rows.map(m=>m.material_id);
    return entries;
  }
  const signature=item=>JSON.stringify([item.topic_id,item.notes,item.evidence_required,item.assessment_required,item.material_ids]);
  function pairItems(oldItems,newItems) {
    const pairs=[];
    for(const key of new Set(newItems.map(signature))) {
      const old=oldItems.filter(i=>signature(i)===key), fresh=newItems.filter(i=>signature(i)===key);
      if(old.length===1 && fresh.length===1) pairs.push({old_item_id:old[0].id,new_item_id:fresh[0].id});
      else for(const target of fresh) {
        const source=old.find(i=>i.day===target.day && i.position===target.position);
        if(source) pairs.push({old_item_id:source.id,new_item_id:target.id});
      }
    }
    return pairs;
  }
  async function context(tx,actor,body) {
    requireWrite(actor);
    const e=await enrollment(tx,actor,uuid(body.enrollment_id),false);
    if(!['active','paused'].includes(e.status)) fail(409,'Only active or paused enrollments can update');
    const from=(await tx.query('select * from public.training_program_versions where id=$1',[e.program_version_id])).rows[0];
    const target=(await tx.query('select * from public.training_program_versions where id=$1',[uuid(body.to_version_id)])).rows[0];
    if(!target || target.status!=='published' || !target.is_optional_update || target.program_key!==from.program_key || target.version<=from.version) fail(409,'Choose a newer published version of the same program');
    const oldItems=await items(tx,from.id), newItems=await items(tx,target.id);
    const pairs=pairItems(oldItems,newItems);
    const completions=(await tx.query('select * from public.training_completions where enrollment_id=$1 order by item_id',[e.id])).rows;
    const sessions=(await tx.query('select * from public.training_sessions where enrollment_id=$1 order by id',[e.id])).rows;
    const history=await updateHistory(tx,e.id), previous=await currentProgress(tx,e);
    const credited=pairs.filter(pair=>completions.some(c=>c.item_id===pair.old_item_id));
    const continued=pairs.filter(pair=>sessions.some(s=>effectiveItemId(s.item_id,history,oldItems)===pair.old_item_id));
    const added=newItems.filter(item=>!pairs.some(pair=>pair.new_item_id===item.id));
    const removed=oldItems.filter(item=>!pairs.some(pair=>pair.old_item_id===item.id));
    const hash=createHash('sha256').update(JSON.stringify({enrollment:e.id,status:e.status,from:from.id,to:target.id,pairs,completions,sessions})).digest('hex');
    return {e,from,target,oldItems,newItems,pairs,completions,credited,continued,added,removed,previous,hash};
  }
  function summary(c) {
    return {enrollment_id:c.e.id,from_version_id:c.from.id,to_version_id:c.target.id,from_version:c.from.version,to_version:c.target.version,
      changelog:c.target.changelog,total_items:c.newItems.length,preserved_completed_items:c.credited.length,
      preserved_session_items:c.continued.length,new_required_items:c.added.length,historical_only_items:c.removed.length,
      previous_progress:c.previous,updated_percent:c.newItems.length?Math.round(c.credited.length/c.newItems.length*10000)/100:0,
      added_items:c.added.map(i=>({id:i.id,topic_id:i.topic_id,day:i.day,position:i.position})),preview_hash:c.hash};
  }
  return {
    previewUpdate:(token,body)=>run(token,async(tx,actor)=>{
      fields(body,['enrollment_id','to_version_id']);return {preview:true,...summary(await context(tx,actor,body))};
    }),
    acceptUpdate:(token,body)=>run(token,async(tx,actor)=>{
      requireWrite(actor);fields(body,['enrollment_id','to_version_id','expected_from_version_id','preview_hash']);
      uuid(body.expected_from_version_id);
      if(typeof body.preview_hash!=='string'||! /^[a-f0-9]{64}$/.test(body.preview_hash)) fail(400,'Preview hash required');
      const e=await enrollment(tx,actor,uuid(body.enrollment_id),false);
      if(!['active','paused'].includes(e.status)) fail(409,'Only active or paused enrollments can update');
      if(e.program_version_id===uuid(body.to_version_id)) {
        const record=(await tx.query('select * from public.training_update_history where enrollment_id=$1 and from_version_id=$2 and to_version_id=$3',[e.id,body.expected_from_version_id,body.to_version_id])).rows[0];
        if(record?.equivalence_map.preview_hash===body.preview_hash) return {already_accepted:true,progress:await currentProgress(tx,e)};
      }
      if(e.program_version_id!==body.expected_from_version_id) fail(409,'Enrollment version changed; preview again');
      const c=await context(tx,actor,body);
      if(c.hash!==body.preview_hash) fail(409,'Training changed; preview the update again');
      for(const pair of c.credited) {
        await tx.query(`insert into public.training_completions(enrollment_id,item_id,validated_by,validated_at)
          select enrollment_id,$2,validated_by,validated_at from public.training_completions where enrollment_id=$1 and item_id=$3
          on conflict(enrollment_id,item_id) do nothing`,[e.id,pair.new_item_id,pair.old_item_id]);
      }
      await tx.query(`insert into public.training_update_history(enrollment_id,from_version_id,to_version_id,accepted_by,previous_progress_percent,equivalence_map)
        values($1,$2,$3,$4,$5,$6)`,[e.id,c.from.id,c.target.id,actor.app_user_id,c.previous.percent,
        JSON.stringify({pairs:c.pairs,preview_hash:c.hash,new_item_ids:c.added.map(i=>i.id),historical_item_ids:c.removed.map(i=>i.id)})]);
      await tx.query('update public.training_enrollments set program_version_id=$2 where id=$1',[e.id,c.target.id]);
      const progress=await currentProgress(tx,{...e,program_version_id:c.target.id});
      await audit(tx,actor,'program_update_accepted','enrollment',e.id,e.id,{from_version_id:c.from.id,to_version_id:c.target.id,preserved_completed_items:c.credited.length,previous_percent:c.previous.percent,new_percent:progress.percent});
      return {already_accepted:false,...summary(c),progress};
    }),
  };
}
