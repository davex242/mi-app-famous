import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import {normalizePNG,loadPrivateImage} from './private-images.mjs';
import {isPDFMaterial,validatePDF,loadPrivatePDF} from './private-pdfs.mjs';

// Called only by the sandbox service's verified-session transaction wrapper.
export function createCatalogueOperations(run, { requireAdmin, fields, text, uuid, fail, audit, admin }) {
  async function row(tx, table, id) {
    const { rows } = await tx.query(`select * from public.training_${table} where id=$1`, [uuid(id)]);
    if (!rows.length) fail(404, 'Record unavailable');
    return rows[0];
  }
  async function nextRevision(tx, table, sourceId) {
    if (!sourceId) return { key: randomUUID(), revision: 1 };
    const source = await row(tx, table, sourceId);
    // Serialize revision creation on the stable first revision, then re-read latest.
    await tx.query(`select id from public.training_${table} where content_key=$1 and revision=1 for update`, [source.content_key]);
    const latest = (await tx.query(`select id,revision from public.training_${table} where content_key=$1 order by revision desc limit 1`, [source.content_key])).rows[0];
    if (latest.id !== source.id) fail(409, 'A newer revision exists');
    return { key: source.content_key, revision: latest.revision + 1 };
  }
  function httpsUrl(value) {
    let url;
    try { url = new URL(text(value, 2000)); } catch { fail(400, 'Valid public HTTPS link required'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      isIP(url.hostname.replace(/^\[|\]$/g, '')) || !url.hostname.includes('.') ||
      /(^|\.)(localhost|local|internal|test|invalid)$/.test(url.hostname)) fail(400, 'Valid public HTTPS link required');
    return url.href;
  }
  async function readableMaterial(tx, actor, id) {
    const material = await row(tx, 'materials', id);
    const topic = await row(tx, 'topics', material.topic_id);
    if (!admin(actor) && (!['published', 'archived'].includes(material.status) || !['published', 'archived'].includes(topic.status))) fail(404, 'Record unavailable');
    return material;
  }
  async function document(tx, material) {
    const { rows } = await tx.query('select body from training_private.local_material_content where material_id=$1', [material.id]);
    if (!rows.length) fail(409, 'Material content unavailable');
    return rows[0].body;
  }
  async function publish(tx, actor, table, id) {
    let value = await row(tx, table, id);
    await tx.query(`select id from public.training_${table} where content_key=$1 and revision=1 for update`, [value.content_key]);
    value = await row(tx, table, id);
    if (value.status === 'published') return { ...value, already_published: true };
    const latest = (await tx.query(`select id from public.training_${table} where content_key=$1 order by revision desc limit 1`, [value.content_key])).rows[0];
    if (value.status !== 'draft' || latest.id !== value.id) fail(409, 'Only the latest draft can be published');
    if (table === 'materials') {
      const parent = await row(tx, 'topics', value.topic_id);
      if (parent.status !== 'published') fail(409, 'Publish the topic revision first');
      if (value.kind === 'document') {if(isPDFMaterial(value))await loadPrivatePDF(tx,value.id,fail);else await document(tx, value);}
      if (value.kind === 'image') await loadPrivateImage(tx,value.id,fail);
    }
    const result = (await tx.query(`update public.training_${table} set status='published' where id=$1 returning *`, [value.id])).rows[0];
    const column = table === 'topics' ? 'topic_id' : 'material_id';
    await tx.query(`insert into public.training_approvals(${column},status,requested_by,reviewed_by,reviewed_at,review_notes)
      values($1,'approved',$2,$2,now(),'Publicación administrativa en entorno de prueba')`, [value.id, actor.app_user_id]);
    await audit(tx, actor, table === 'topics' ? 'topic_published' : 'material_published', table, value.id);
    return { ...result, external_url: table === 'materials' ? null : undefined };
  }
  return {
    saveTopic: (token, body) => run(token, async (tx, actor) => {
      requireAdmin(actor); fields(body, ['source_id', 'title', 'description', 'category', 'estimated_minutes']);
      const title = text(body.title, 120), category = text(body.category, 100);
      if (typeof body.description !== 'string' || body.description.length > 2000) fail(400, 'Invalid description');
      if (!Number.isInteger(body.estimated_minutes) || body.estimated_minutes < 1 || body.estimated_minutes > 480) fail(400, 'Invalid duration');
      const { key, revision } = await nextRevision(tx, 'topics', body.source_id);
      const value = (await tx.query(`insert into public.training_topics(content_key,revision,title,description,category,estimated_minutes,created_by)
        values($1,$2,$3,$4,$5,$6,$7) returning *`, [key, revision, title, body.description.trim(), category, body.estimated_minutes, actor.app_user_id])).rows[0];
      await audit(tx, actor, revision === 1 ? 'topic_created' : 'topic_revised', 'topics', value.id);
      return value;
    }),
    publishTopic: (token, body) => run(token, async (tx, actor) => {
      requireAdmin(actor); fields(body, ['id']); return publish(tx, actor, 'topics', uuid(body.id));
    }),
    saveMaterial: (token, body) => run(token, async (tx, actor) => {
      requireAdmin(actor); fields(body, ['source_id', 'topic_id', 'title', 'kind', 'content', 'external_url', 'allow_preview', 'allow_download']);
      const parent = await row(tx, 'topics', body.topic_id), title = text(body.title, 120);
      if (!['document', 'link'].includes(body.kind)) fail(400, 'Use a text document or HTTPS link');
      if (typeof body.allow_preview !== 'boolean' || typeof body.allow_download !== 'boolean') fail(400, 'Invalid material permissions');
      let content = null, external = null;
      if (body.kind === 'document') {
        content = text(body.content, 20000);
        if (body.external_url) fail(400, 'Text documents cannot include an external URL');
      } else {
        external = httpsUrl(body.external_url);
        if (body.content || body.allow_download) fail(400, 'Links do not support document downloads');
      }
      const { key, revision } = await nextRevision(tx, 'materials', body.source_id);
      const id = randomUUID();
      const value = (await tx.query(`insert into public.training_materials(id,content_key,revision,topic_id,title,kind,storage_path,external_url,allow_preview,allow_download,created_by)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`, [id, key, revision, parent.id, title, body.kind,
        content === null ? null : `sandbox/materials/${id}.txt`, external, body.allow_preview, body.allow_download, actor.app_user_id])).rows[0];
      if (content !== null) await tx.query('insert into training_private.local_material_content(material_id,body) values($1,$2)', [id, content]);
      await audit(tx, actor, revision === 1 ? 'material_created' : 'material_revised', 'materials', id);
      return { ...value, external_url: null };
    }),
    saveImageMaterial:(token,body)=>run(token,async(tx,actor)=>{
      requireAdmin(actor);fields(body,['source_id','topic_id','title','image_base64','allow_preview','allow_download']);
      const parent=await row(tx,'topics',body.topic_id),title=text(body.title,120);
      if(typeof body.allow_preview!=='boolean'||typeof body.allow_download!=='boolean')fail(400,'Invalid material permissions');
      const image=normalizePNG(body.image_base64,fail),{key,revision}=await nextRevision(tx,'materials',body.source_id),id=randomUUID();
      const value=(await tx.query(`insert into public.training_materials(id,content_key,revision,topic_id,title,kind,storage_path,allow_preview,allow_download,created_by)
        values($1,$2,$3,$4,$5,'image',$6,$7,$8,$9) returning *`,[id,key,revision,parent.id,title,`sandbox/materials/${id}.png`,body.allow_preview,body.allow_download,actor.app_user_id])).rows[0];
      await tx.query('insert into training_private.local_material_content(material_id,body) values($1,$2)',[id,JSON.stringify(image)]);
      await audit(tx,actor,revision===1?'material_created':'material_revised','materials',id,null,{format:'png',sha256:image.sha256,bytes:image.bytes,width:image.width,height:image.height});
      return value;
    }),
    savePDFMaterial:(token,body)=>run(token,async(tx,actor)=>{
      requireAdmin(actor);fields(body,['source_id','topic_id','title','pdf_base64','allow_download']);
      const parent=await row(tx,'topics',body.topic_id),title=text(body.title,120);
      if(typeof body.allow_download!=='boolean')fail(400,'Invalid material permissions');
      const pdf=await validatePDF(body.pdf_base64,fail),{key,revision}=await nextRevision(tx,'materials',body.source_id),id=randomUUID();
      const value=(await tx.query(`insert into public.training_materials(id,content_key,revision,topic_id,title,kind,storage_path,allow_preview,allow_download,created_by)
        values($1,$2,$3,$4,$5,'document',$6,false,$7,$8) returning *`,[id,key,revision,parent.id,title,`sandbox/materials/${id}.pdf`,body.allow_download,actor.app_user_id])).rows[0];
      await tx.query('insert into training_private.local_material_content(material_id,body) values($1,$2)',[id,JSON.stringify(pdf)]);
      await audit(tx,actor,revision===1?'material_created':'material_revised','materials',id,null,{format:'pdf',sha256:pdf.sha256,bytes:pdf.bytes,pages:pdf.pages});
      return value;
    }),
    publishMaterial: (token, body) => run(token, async (tx, actor) => {
      requireAdmin(actor); fields(body, ['id']); return publish(tx, actor, 'materials', uuid(body.id));
    }),
    materialEditData: (token, body) => run(token, async (tx, actor) => {
      requireAdmin(actor); fields(body, ['id']);
      const material = await row(tx, 'materials', body.id);
      return { ...material, content: material.kind === 'document'&&!isPDFMaterial(material) ? await document(tx, material) : '',...(isPDFMaterial(material)?{pdf:await loadPrivatePDF(tx,material.id,fail)}:{}),...(material.kind==='image'?{image:await loadPrivateImage(tx,material.id,fail)}:{}) };
    }),
    previewMaterial: (token, body) => run(token, async (tx, actor) => {
      fields(body, ['id']); const material = await readableMaterial(tx, actor, body.id);
      if (!material.allow_preview||isPDFMaterial(material)) fail(403, 'Preview is disabled for this revision');
      const result = material.kind === 'image'?{type:'image',image:await loadPrivateImage(tx,material.id,fail),mime:'image/png'}:material.kind === 'document' ? { type: 'text', content: await document(tx, material) } : { type: 'link', url: material.external_url };
      await audit(tx, actor, 'material_previewed', 'materials', material.id);
      return { ...result, title: material.title, revision: material.revision };
    }),
    downloadMaterial: (token, body) => run(token, async (tx, actor) => {
      fields(body, ['id']); const material = await readableMaterial(tx, actor, body.id);
      if (!['document','image'].includes(material.kind) || !material.allow_download) fail(403, 'Download is disabled for this revision');
      if(isPDFMaterial(material)){
        const pdf=await loadPrivatePDF(tx,material.id,fail);await audit(tx,actor,'material_downloaded','materials',material.id,null,{sha256:pdf.sha256});
        return {pdf_base64:pdf.data,sha256:pdf.sha256,filename:`training-material-${material.id}-r${material.revision}.pdf`,mime:'application/pdf'};
      }
      if(material.kind==='image'){
        const image=await loadPrivateImage(tx,material.id,fail);
        await audit(tx,actor,'material_downloaded','materials',material.id,null,{sha256:image.sha256});
        return {image_base64:image.data,sha256:image.sha256,filename:`training-material-${material.id}-r${material.revision}.png`,mime:'image/png'};
      }
      const content = await document(tx, material);
      await audit(tx, actor, 'material_downloaded', 'materials', material.id);
      return { content, filename: `training-material-${material.id}-r${material.revision}.txt`, mime: 'text/plain;charset=utf-8' };
    }),
  };
}
