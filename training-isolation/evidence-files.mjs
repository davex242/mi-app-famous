import {normalizePNG} from './private-images.mjs';
export const evidencePath=id=>`sandbox/evidence/${id}.png`;
export const evidenceMetadata=image=>({mime:'image/png',sha256:image.sha256,bytes:image.bytes,width:image.width,height:image.height});

// Private bytes never appear in workspace, catalogue or audit events.
export async function loadEvidenceImage(tx,evidence,fail){
 if(!evidence.storage_path)return null;
 if(evidence.storage_path!==evidencePath(evidence.id))fail(409,'Private evidence content unavailable');
 const record=(await tx.query('select body from training_private.local_evidence_content where evidence_id=$1',[evidence.id])).rows[0];
 let image;
 try{
  image=JSON.parse(record?.body);
  if(image?.format!=='training-private-png-v1')throw Error();
  const verified=normalizePNG(image.data,()=>{throw Error();});
  if(['data','sha256','bytes','width','height'].some(k=>verified[k]!==image[k]))throw Error();
 }catch{fail(409,'Private evidence content unavailable');}
 return image;
}
export function createEvidenceFileOperations(run,{fields,uuid,fail,enrollment,audit}){
 async function access(tx,actor,body,download){
  fields(body,['evidence_id']);
  const evidence=(await tx.query('select * from public.training_evidence where id=$1 for share',[uuid(body.evidence_id)])).rows[0];
  if(!evidence)fail(404,'Record unavailable');
  await enrollment(tx,actor,evidence.enrollment_id,false);
  if(!evidence.storage_path)fail(404,'Record unavailable');
  const image=await loadEvidenceImage(tx,evidence,fail);
  await audit(tx,actor,download?'evidence_file_downloaded':'evidence_file_previewed','evidence',evidence.id,evidence.enrollment_id,evidenceMetadata(image));
  return download?{evidence_id:evidence.id,filename:`evidence-${evidence.id}.png`,...evidenceMetadata(image),image_base64:image.data}:{evidence_id:evidence.id,type:'image',image};
 }
 return {
  previewEvidenceFile:(token,body)=>run(token,(tx,actor)=>access(tx,actor,body,false)),
  downloadEvidenceFile:(token,body)=>run(token,(tx,actor)=>access(tx,actor,body,true)),
 };
}
