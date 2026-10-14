import postgres from 'npm:postgres@3.4.3';
import {Buffer} from 'node:buffer';
import {createHash} from 'node:crypto';
import {createTrainingService,ApiError} from '../training-isolation/service.mjs';
import {normalizePNG} from '../training-isolation/private-images.mjs';
import {imageFixture} from '../training-isolation/image-fixtures.mjs';
import {hostedAdministration} from './administration.mjs';
import {verifyHostedUser,currentHostedActor} from './identity.mjs';
(globalThis as any).Buffer=Buffer;
import {hostedServerConfig} from './configuration.mjs';
const {project,ownerEmail}=hostedServerConfig(name=>Deno.env.get(name));
const keys=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}');
const key=keys.default||Deno.env.get('SUPABASE_ANON_KEY');
const sql=postgres(Deno.env.get('SUPABASE_DB_URL')!,{prepare:false,max:1,connect_timeout:10,idle_timeout:20});
const operations:Record<string,string>={
 '/api/content-import/preview':'previewAcceptedCourse','/api/content-import/load':'loadAcceptedCourse',
 '/api/training/closing-preview':'previewClosing','/api/training/complete':'completeTraining','/api/training/closing-export':'exportClosing',
 '/api/exams/edit-data':'examEditData','/api/exams/template':'examTemplate','/api/exams/publish':'publishExam','/api/exams/issue':'issueExam','/api/exams/revoke':'revokeExam','/api/exams/extra-request':'requestExtraAttempts','/api/exams/extra-review':'reviewExtraAttempts',
 '/api/quiz/status':'examStatus','/api/quiz/start':'startExam','/api/quiz/submit':'submitExam',
 '/api/identity/list':'identity','/api/identity/user':'identity','/api/identity/host':'identity',
 '/api/enrollments':'enroll','/api/sessions':'schedule','/api/evidence':'submitEvidence','/api/evidence/file-preview':'previewEvidenceFile','/api/evidence/file-download':'downloadEvidenceFile','/api/evidence/review':'reviewEvidence','/api/assessments':'assess','/api/items/complete':'completeItem',
 '/api/topics':'saveTopic','/api/topics/publish':'publishTopic','/api/materials':'saveMaterial','/api/materials/image':'saveImageMaterial','/api/materials/pdf':'savePDFMaterial','/api/materials/video':'saveVideoMaterial','/api/materials/publish':'publishMaterial','/api/materials/edit-data':'materialEditData','/api/materials/preview':'previewMaterial','/api/materials/download':'downloadMaterial',
 '/api/programs':'saveProgram','/api/programs/publish':'publishProgram','/api/agenda/preview':'previewAgenda','/api/agenda/generate':'generateAgenda','/api/sessions/reschedule':'reschedule','/api/attendance':'recordAttendance','/api/program-updates/preview':'previewUpdate','/api/program-updates/accept':'acceptUpdate'
};
const fail=(status:number,message:string)=>{throw new ApiError(status,message);};
async function body(req:Request,max:number){const reader=req.body?.getReader();if(!reader)return {};let size=0;const chunks=[];try{while(true){const row=await reader.read();if(row.done)break;size+=row.value.length;if(size>max){await reader.cancel();fail(413,'Request exceeds limit');}chunks.push(row.value);}}finally{reader.releaseLock();}const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}try{return JSON.parse(new TextDecoder().decode(bytes)||'{}');}catch{fail(400,'Invalid JSON');}}
const adapter=(tx:any)=>({query:async(text:string,params:any[]=[])=>({rows:await tx.unsafe(text,params)}),exec:async(text:string)=>{await tx.unsafe(text);},transaction:(operation:any)=>operation(adapter(tx))});
Deno.serve(async(req:Request)=>{
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 const send=(status:number,value:unknown)=>new Response(JSON.stringify(value),{status,headers});
 try{
  const path=new URL(req.url).pathname.replace(/^\/training-preview/,'');
  if(req.method==='GET'&&path==='/health'){const rows=await sql`select to_regclass('training_private.training_principals') is not null as initialized`;return send(200,{sandbox:true,react_training_api:1,storage:'hosted-preview',initialized:rows[0].initialized,...(new URL(req.url).searchParams.get('check')==='image'?{image_validation:(()=>{try{normalizePNG(imageFixture({width:1,height:1}).toString('base64'),(_status,message)=>{throw Error(message);});return true;}catch{return false;}})()}: {})});}
  if(!((req.method==='GET'&&['/api/me','/api/workspace'].includes(path))||(req.method==='POST'&&operations[path])))fail(404,'Route unavailable');
  const token=req.headers.get('Authorization')?.replace(/^Bearer /,'')||'';
  const publicQuiz=path.startsWith('/api/quiz/');
  const user=publicQuiz?null:await verifyHostedUser(token,{url:project,key});
  const payload=req.method==='POST'?await body(req,['/api/materials/image','/api/materials/pdf','/api/materials/video','/api/evidence'].includes(path)?Math.ceil(2*1024*1024/3)*4+8192:path==='/api/exams/publish'?1024*1024:path==='/api/programs'?3*1024*1024:32768):{};
  const value=await sql.begin(async tx=>{
   await tx.unsafe("set local statement_timeout='20s';set local lock_timeout='5s'");
   const db=adapter(tx),service=createTrainingService(db,{readerRole:'training_preview_reader',verifiedActor:async inner=>{if(!user)fail(401,'Verified session required');return currentHostedActor(inner,user,{ownerEmail});}});
   if(path.startsWith('/api/identity/'))return hostedAdministration(db,await service.me(token),path,payload);
   if(path==='/api/workspace'){const actor=await service.me(token);const labels=(await db.query('select a.host_id,h.display_name,h.mico_id from training_private.training_host_assignments a join training_private.training_hosts h on h.id=a.host_id where $1::boolean or a.recruiter_id=$2',[['superadmin','subadmin'].includes(actor.role),actor.app_user_id])).rows;const result=await service.workspace(token);result.trainees=result.trainees.map(row=>({...row,label:labels.find(h=>h.host_id===row.host_id)?.display_name||'Emisor',mico_id:labels.find(h=>h.host_id===row.host_id)?.mico_id||null}));return result;}
   const result=path==='/api/me'?await service.me(token):path==='/api/workspace'?await service.workspace(token):await (service as any)[operations[path]](token,payload);
   return result;
  });
  return send(200,value);
 }catch(error){const known=error instanceof ApiError;if(known&&error.status===400)console.warn(JSON.stringify({event:'training_validation_rejected',route:new URL(req.url).pathname,reason:error.message.slice(0,200)}));return send(known?error.status:['23505','23503','23514','40P01','55P03'].includes(error?.code)?409:503,{error:known?error.message:'Training service unavailable'});}
});
