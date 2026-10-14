import {pathToFileURL} from 'node:url';
import {lstat,readFile} from 'node:fs/promises';
import {openPersistentSandbox} from './local-storage.mjs';
import {preparePersistentDemo} from './local-runtime.mjs';
import {createTrainingService} from './service.mjs';
import {parsePrivateExamFile,PRIVATE_EXAM_MAX_BYTES} from '../src/components/training/privateExamImport.mjs';
const examKey='Accepted initial course · local review';
// One local transaction; no provider, external API, production credentials or legacy rows.
export async function prepareAcceptedLocalCourse(db,password,raw){
 const bank=parsePrivateExamFile(raw);
 return db.transaction(async tx=>{
  const adapter={query:(...args)=>tx.query(...args),exec:(...args)=>tx.exec(...args),transaction:operation=>operation(tx)};
  await preparePersistentDemo(adapter,password);const service=createTrainingService(adapter),token=(await service.login({username:'demo-superadmin',password})).token;
  const preview=await service.previewAcceptedCourse(token,{}),loaded=await service.loadAcceptedCourse(token,{expected_hash:preview.source_hash,confirmed:true});
  const marker=(await tx.query("select details from public.training_events where event_type='accepted_course_loaded' and entity_id=$1",[loaded.program_id])).rows[0];
  if(marker?.details?.links?.length!==14)throw Error('Local accepted course references unavailable');
  const prior=(await tx.query('select * from public.training_exam_versions where exam_key=$1 order by version desc limit 1',[examKey])).rows[0];
  if(prior){const data=await service.examEditData(token,{id:prior.id});if(Number(data.pass_percent)!==75||JSON.stringify(data.questions)!==JSON.stringify(bank.questions))throw Error('Local exam differs from the reviewed file; existing version preserved');}
  for(const link of marker.details.links){await service.publishTopic(token,{id:link.topic_id});await service.publishMaterial(token,{id:link.material_id});}
  await service.publishProgram(token,{id:loaded.program_id});
  const exam=prior||await service.publishExam(token,{exam_key:examKey,pass_percent:75,questions:bank.questions});
  await service.logout(token);
  return {scope:'local-only',program_id:loaded.program_id,exam_id:exam.id,topics:14,materials:14,practices:14,questions:50,pass_percent:75,initial_attempts:3,invitation_hours:24,already_loaded:loaded.already_loaded&&!!prior};
 });
}
export async function readPrivateBank(path){const info=await lstat(path);if(!info.isFile()||info.isSymbolicLink()||info.size>PRIVATE_EXAM_MAX_BYTES)throw Error('Private bank must be a regular JSON file up to 1 MiB');const raw=await readFile(path,'utf8');parsePrivateExamFile(raw);return raw;}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [store,bankPath,confirmation,...extra]=process.argv.slice(2);let local;
 try{
  if(!store||!bankPath||confirmation!=='--publish'||extra.length)throw Error('Use: prepare-accepted-local.mjs LOCAL_STORE PRIVATE_JSON_FILE --publish');
  const raw=await readPrivateBank(bankPath);local=await openPersistentSandbox(store);
  const result=await prepareAcceptedLocalCourse(local.db,process.env.TRAINING_DEMO_PASSWORD,raw);delete process.env.TRAINING_DEMO_PASSWORD;
  await local.close();local=null;console.log(JSON.stringify(result));
 }catch(error){delete process.env.TRAINING_DEMO_PASSWORD;if(local)await local.close();console.error(error.message);process.exitCode=1;}
}
