import {pathToFileURL} from 'node:url';
import {startPersistentSandbox} from './local-runtime.mjs';
import {buildLocalReact} from './react-local-build.mjs';
// Loopback-only persistent React review. Existing memory launcher is unchanged.
export async function startPersistentReactSandbox(store,password,port=4317){
 const built=await buildLocalReact();let runtime;
 try{
  runtime=await startPersistentSandbox(store,password,port,{reactAssets:built.assets});let closed=false;
  return {...runtime,async close(){if(closed)return;closed=true;try{await runtime.close();}finally{await built.cleanup();}}};
 }catch(error){if(runtime)await runtime.close();await built.cleanup();throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [store,...extra]=process.argv.slice(2);let runtime;
 try{
  if(!store||extra.length)throw Error('Specify exactly one local store name');
  runtime=await startPersistentReactSandbox(store,process.env.TRAINING_DEMO_PASSWORD);delete process.env.TRAINING_DEMO_PASSWORD;
  console.log('PERSISTENT LOCAL REVIEW: http://127.0.0.1:4317/react-training?trainingSandbox=local');
  console.log('Synthetic accounts: demo-superadmin, demo-subadmin, demo-edit, demo-readonly. Use the password selected on first setup.');
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void runtime.close());
 }catch(error){delete process.env.TRAINING_DEMO_PASSWORD;if(runtime)await runtime.close();console.error(error.message);process.exitCode=1;}
}
