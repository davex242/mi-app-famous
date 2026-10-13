import {normalizePNG} from './private-images.mjs';
import {validateMP4} from './private-videos.mjs';
import {validatePDF} from './private-pdfs.mjs';
export const evidencePath=(id,kind='image')=>`sandbox/evidence/${id}.${kind==='pdf'?'pdf':kind==='video'?'mp4':'png'}`;
export const isEvidencePDF=e=>e.storage_path===evidencePath(e.id,'pdf');
export const isEvidenceVideo=e=>e.storage_path===evidencePath(e.id,'video');
export const evidenceMetadata=file=>({sha256:file.sha256,bytes:file.bytes,...(file.format==='training-private-mp4-v1'?{mime:'video/mp4',width:file.width,height:file.height,duration_seconds:file.duration_seconds,audio:file.audio,codec:file.codec}:file.format==='training-private-pdf-v1'?{mime:'application/pdf',pages:file.pages}:{mime:'image/png',width:file.width,height:file.height})});

// Private bytes never appear in workspace, catalogue or audit events.
export async function loadEvidenceFile(tx,evidence,fail){
 if(!evidence.storage_path)return null;
 const pdf=isEvidencePDF(evidence),video=isEvidenceVideo(evidence);
 if(!pdf&&!video&&evidence.storage_path!==evidencePath(evidence.id))fail(409,'Private evidence content unavailable');
 const record=(await tx.query('select body from training_private.local_evidence_content where evidence_id=$1',[evidence.id])).rows[0];
 let file;
 try{
  file=JSON.parse(record?.body);
  if(file?.format!==(pdf?'training-private-pdf-v1':video?'training-private-mp4-v1':'training-private-png-v1'))throw Error();
  const verified=pdf?await validatePDF(file.data,()=>{throw Error();}):video?validateMP4(file.data,()=>{throw Error();}):normalizePNG(file.data,()=>{throw Error();});
  const keys=pdf?['data','sha256','bytes','pages']:video?['data','sha256','bytes','width','height','duration_seconds','audio','codec']:['data','sha256','bytes','width','height'];
  if(keys.some(k=>verified[k]!==file[k]))throw Error();
 }catch{fail(409,'Private evidence content unavailable');}
 return file;
}
export function createEvidenceFileOperations(run,{fields,uuid,fail,enrollment,audit}){
 async function access(tx,actor,body,download){
  fields(body,['evidence_id']);
  const evidence=(await tx.query('select * from public.training_evidence where id=$1 for share',[uuid(body.evidence_id)])).rows[0];
  if(!evidence)fail(404,'Record unavailable');
  await enrollment(tx,actor,evidence.enrollment_id,false);
  if(!evidence.storage_path)fail(404,'Record unavailable');
  const pdf=isEvidencePDF(evidence),video=isEvidenceVideo(evidence);
  if(pdf&&!download)fail(403,'Evidence PDF preview unavailable');
  const file=await loadEvidenceFile(tx,evidence,fail);
  await audit(tx,actor,download?'evidence_file_downloaded':'evidence_file_previewed','evidence',evidence.id,evidence.enrollment_id,evidenceMetadata(file));
  return download?{evidence_id:evidence.id,filename:`evidence-${evidence.id}.${pdf?'pdf':video?'mp4':'png'}`,...evidenceMetadata(file),...(pdf?{pdf_base64:file.data}:video?{video_base64:file.data}:{image_base64:file.data})}:{evidence_id:evidence.id,...(video?{type:'video',video:file}:{type:'image',image:file})};
 }
 return {
  previewEvidenceFile:(token,body)=>run(token,(tx,actor)=>access(tx,actor,body,false)),
  downloadEvidenceFile:(token,body)=>run(token,(tx,actor)=>access(tx,actor,body,true)),
 };
}
