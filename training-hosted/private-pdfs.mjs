import {inspectPDF} from './pdf-inspector.mjs';
import {createHash} from 'node:crypto';
const MAX_BYTES=2*1024*1024;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export const isPDFMaterial=material=>material.kind==='document'&&material.storage_path===`sandbox/materials/${material.id}.pdf`;

const inspect=inspectPDF;
export async function validatePDF(base64,fail){
 const invalid=()=>fail(400,'Static PDF without passwords, forms, actions or attachments required');
 if(typeof base64!=='string'||!base64.length||base64.length>Math.ceil(MAX_BYTES/3)*4)fail(400,'PDF exceeds 2 MiB limit');
 if(base64.length%4||!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))invalid();
 const bytes=Buffer.from(base64,'base64');if(bytes.length>MAX_BYTES)fail(400,'PDF exceeds 2 MiB limit');
 if(bytes.toString('base64')!==base64||!/^%PDF-(?:1\.[0-7]|2\.0)(?:\r|\n)/.test(bytes.subarray(0,16).toString('latin1')))invalid();
 const trailer=/startxref\s+(\d+)\s+%%EOF[\t\r\n ]*$/.exec(bytes.subarray(Math.max(0,bytes.length-1024)).toString('latin1'));
 if(!trailer)invalid();const offset=Number(trailer[1]);
 if(!Number.isSafeInteger(offset)||offset<=0||offset>=bytes.length||!/^(?:xref\b|\d+\s+\d+\s+obj\b)/.test(bytes.subarray(offset,offset+64).toString('latin1')))invalid();
 let result;try{result=await inspect(bytes);}catch{invalid();}
 if(!result?.ok)invalid();
 return {format:'training-private-pdf-v1',data:base64,sha256:digest(bytes),bytes:bytes.length,pages:result.pages};
}
export async function loadPrivatePDF(tx,id,fail){
 const row=(await tx.query('select body from training_private.local_material_content where material_id=$1',[id])).rows[0];let pdf;
 try{pdf=JSON.parse(row?.body);if(pdf?.format!=='training-private-pdf-v1')throw Error();
  const checked=await validatePDF(pdf.data,()=>{throw Error();});if(checked.sha256!==pdf.sha256||checked.bytes!==pdf.bytes||checked.pages!==pdf.pages)throw Error();
 }catch{fail(409,'Private PDF content unavailable');}
 return pdf;
}
