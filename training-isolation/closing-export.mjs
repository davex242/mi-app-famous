import {createHash} from 'node:crypto';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sha256=value=>createHash('sha256').update(value,'utf8').digest('hex');
const css=`@page{size:A4;margin:16mm}*{box-sizing:border-box}body{font:15px/1.55 system-ui,sans-serif;color:#17243a;background:#eef2f6;margin:0;padding:24px}main{max-width:960px;margin:auto;background:white;padding:32px;border:1px solid #ccd6e2;border-radius:12px}h1{font-size:28px;line-height:1.2}h2{font-size:19px;margin-top:28px}.badge{font-weight:700;color:#1d5e55}.muted{color:#516078}dl{display:grid;grid-template-columns:170px 1fr;gap:8px 16px}dt{font-weight:600}dd{margin:0;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;font-size:13px}td,th{text-align:left;padding:10px;border-bottom:1px solid #d7dfeb;vertical-align:top;overflow-wrap:anywhere}th{background:#eef2f6}.notes{white-space:pre-wrap;overflow-wrap:anywhere;border-left:4px solid #327b70;padding:14px;background:#f2f8f6}.identifier{overflow-wrap:anywhere;font-size:12px}footer{border-top:1px solid #ccd6e2;margin-top:30px;padding-top:16px;font-size:12px}@media(max-width:600px){body{padding:10px}main{padding:18px}dl{grid-template-columns:1fr;gap:2px}dd{margin-bottom:10px}table{font-size:12px}td,th{padding:6px}.identifier{font-size:11px}}@media print{body{padding:0;background:white;font-size:12px}main{border:0;padding:0;border-radius:0;max-width:none}.print-help{display:none}thead{display:table-header-group}tr{break-inside:avoid}h2{break-after:avoid}.notes{background:white}footer{font-size:10px}}`;

// Explicit projection: exported records never contain request hashes, bearer
// credentials, private quiz answers/keys or arbitrary event metadata.
function report(record) {
  const s=record.details.snapshot;
  return {
    format:'host-training-closing-report',version:1,sandbox:true,
    record_id:record.id,enrollment_id:record.enrollment_id,host_id:s.host_id,
    closed_at:new Date(record.created_at).toISOString(),closed_by:record.actor_app_user_id,
    program:{id:s.program_version_id,title:s.program_title,version:s.program_version},
    progress:{completed_items:s.progress.completed_items,total_items:s.progress.total_items,percent:s.progress.percent},
    practices:s.checks.map(c=>({item_id:c.item_id,topic_id:c.topic_id,day:c.day,
      validated_by:c.completion.validated_by,validated_at:c.completion.validated_at,
      session_id:c.session_id,evidence_id:c.evidence_id,
      ...(c.evidence_attachment?{evidence_attachment:{mime:c.evidence_attachment.mime,sha256:c.evidence_attachment.sha256,bytes:c.evidence_attachment.bytes,...(c.evidence_attachment.mime==='application/pdf'?{pages:c.evidence_attachment.pages}:{width:c.evidence_attachment.width,height:c.evidence_attachment.height})}}:{}),
      assessment:c.assessment?{id:c.assessment.id,passed:c.assessment.passed,score:c.assessment.score,assessed_by:c.assessment.assessed_by,assessed_at:c.assessment.assessed_at}:null})),
    quiz:{attempt_id:s.quiz.attempt_id,assignment_id:s.quiz.assignment_id,exam_version_id:s.quiz.exam_version_id,
      title:s.quiz.exam_key,version:s.quiz.exam_version,submitted_at:s.quiz.submitted_at,
      score_percent:s.quiz.score_percent,pass_percent:s.quiz.pass_percent},
    conclusion:record.details.notes,
  };
}
function html(r){
  const rows=r.practices.map((p,i)=>`<tr><td>Práctica ${i+1}<br>Día ${escape(p.day)}<p class="identifier">Tema: ${escape(p.topic_id)}</p></td><td>Validada<br><span class="identifier">${escape(p.validated_at)}<br>Administrador: ${escape(p.validated_by)}</span></td><td>${p.evidence_id?'Evidencia aprobada':'Sin evidencia obligatoria'}<br>${p.evidence_attachment?`<p class="identifier">${p.evidence_attachment.mime==='application/pdf'?`Documento PDF · ${escape(p.evidence_attachment.pages)} páginas`:`Imagen PNG · ${escape(p.evidence_attachment.width)} × ${escape(p.evidence_attachment.height)}`} · ${escape(p.evidence_attachment.bytes)} bytes<br>SHA-256: ${escape(p.evidence_attachment.sha256)}</p>`:''}${p.assessment?`Evaluación satisfactoria: ${escape(p.assessment.score)}/100`:'Sin evaluación obligatoria'}</td></tr>`).join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'sha256-${createHash('sha256').update(css).digest('base64')}'; base-uri 'none'; form-action 'none'"><title>Informe de cierre · ${escape(r.program.title)}</title><style>${css}</style></head><body><main><p class="badge">HOST TRAINING &amp; DEVELOPMENT · DEMO</p><h1>Informe de cierre del entrenamiento</h1><p class="muted">Registro administrativo del entorno de prueba. No es una certificación oficial.</p><p class="print-help">Puedes imprimir este informe o guardarlo como PDF desde el menú de impresión del navegador.</p><h2>${escape(r.program.title)}</h2><dl><dt>Versión conservada</dt><dd>${escape(r.program.version)}</dd><dt>Emisor (ID interno)</dt><dd>${escape(r.host_id)}</dd><dt>Inscripción</dt><dd>${escape(r.enrollment_id)}</dd><dt>Cierre (UTC)</dt><dd>${escape(r.closed_at)}</dd><dt>Administrador (ID)</dt><dd>${escape(r.closed_by)}</dd><dt>Prácticas validadas</dt><dd>${escape(r.progress.completed_items)} de ${escape(r.progress.total_items)} · ${escape(r.progress.percent)}%</dd></dl><h2>Prácticas verificadas al confirmar el cierre</h2><table><thead><tr><th>Requisito</th><th>Validación</th><th>Evidencia y evaluación</th></tr></thead><tbody>${rows}</tbody></table><h2>Quiz final aprobado</h2><p>${escape(r.quiz.title)} · Versión ${escape(r.quiz.version)}</p><p>Resultado: <strong>${escape(r.quiz.score_percent)}%</strong> · Umbral de aprobación: ${escape(r.quiz.pass_percent)}%</p><p class="identifier">Intento: ${escape(r.quiz.attempt_id)}<br>Enviado (UTC): ${escape(r.quiz.submitted_at)}</p><h2>Conclusión administrativa y plan de mejora</h2><p class="notes">${escape(r.conclusion)}</p><footer><p class="identifier">Registro de cierre: ${escape(r.record_id)}<br>Versión del programa (ID): ${escape(r.program.id)}</p><p>Esta copia contiene los resultados conservados al cerrar. El nombre del programa y los identificadores provienen de ese registro; no se incorpora el perfil actual del emisor. El archivo descargado puede editarse y no tiene firma digital. El registro original se consulta en el sistema con una cuenta autorizada.</p></footer></main></body></html>`;
}

export function createClosingExportOperations(run,{fields,uuid,fail,enrollment,audit}) {
  return {
    exportClosing:(token,body)=>run(token,async(tx,actor)=>{
      fields(body,['record_id','format']);uuid(body.record_id);
      if(!['html','json'].includes(body.format))fail(400,'Choose HTML or JSON report');
      const record=(await tx.query("select id,enrollment_id,actor_app_user_id,created_at,details from public.training_events where id=$1 and event_type='training_completed' and entity_type='enrollment'",[body.record_id])).rows[0];
      if(!record)fail(404,'Record unavailable');
      const e=await enrollment(tx,actor,record.enrollment_id,false);
      if(e.status!=='completed'||record.details.snapshot?.enrollment_id!==e.id||record.details.snapshot?.host_id!==e.host_id)fail(409,'Closing record is inconsistent');
      const r=report(record),content=body.format==='json'?JSON.stringify(r,null,2)+'\n':html(r);
      const checksum=sha256(content);
      await audit(tx,actor,'training_closing_exported','training_closing',record.id,e.id,{format:body.format,sha256:checksum});
      return {content,filename:`training-closing-${record.id}.${body.format}`,mime:body.format==='json'?'application/json;charset=utf-8':'text/html;charset=utf-8',sha256:checksum};
    }),
  };
}
