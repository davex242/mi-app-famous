import { pathToFileURL } from 'node:url';
import { openPersistentSandbox,backupLocalSandbox,restoreLocalSandbox,upgradeLocalSandbox } from './local-storage.mjs';
import { createTrainingService,provisionSyntheticUser } from './service.mjs';
import { seedDemoProgram } from './demo-fixtures.mjs';
import { createSandboxHttpServer } from './server.mjs';

export async function preparePersistentDemo(db,password) {
  return db.transaction(async tx=>{
    const metadata=(await tx.query('select fixture from training_private.local_runtime_metadata where singleton for update')).rows[0];
    if(!metadata)throw Error('Persistent sandbox metadata is missing');
    if(metadata.fixture)return {created:false,...metadata.fixture};
    if(typeof password!=='string'||password.length<12||password.length>200)throw Error('First startup requires TRAINING_DEMO_PASSWORD with 12 to 200 characters');
    // Existing fixture helpers join one transaction, so interrupted provisioning rolls back.
    const adapter={query:(...args)=>tx.query(...args),transaction:operation=>operation(tx)};
    const principals={};
    for(const role of ['superadmin','subadmin','edit','readonly'])principals[role]=await provisionSyntheticUser(adapter,'demo-'+role,password,role);
    const demo=await seedDemoProgram(adapter,principals.superadmin.app_user_id,principals.edit.app_user_id);
    const fixture={demo,principals};
    await tx.query('update training_private.local_runtime_metadata set fixture=$1 where singleton',[JSON.stringify(fixture)]);
    return {created:true,...fixture};
  });
}

export async function startPersistentSandbox(store='demo',password,port=4317) {
  const local=await openPersistentSandbox(store);let server;
  try{
    const fixture=await preparePersistentDemo(local.db,password);
    server=createSandboxHttpServer(createTrainingService(local.db),{storage:'local-persistent'});
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{server.removeListener('error',reject);resolve();});});
    let closed=false;
    return {...local,server,fixture,async close(){if(closed)return;closed=true;try{await new Promise(r=>{server.close(r);server.closeAllConnections();});}finally{await local.close();}}};
  }catch(e){if(server)server.closeAllConnections();await local.close();throw e;}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [command='start',store='demo',target,...extra]=process.argv.slice(2);
  try{
    if(extra.length || (!['restore','upgrade'].includes(command)&&target!==undefined))throw Error('Unexpected command arguments');
    if(command==='start'){
      const runtime=await startPersistentSandbox(store,process.env.TRAINING_DEMO_PASSWORD);
      delete process.env.TRAINING_DEMO_PASSWORD;
      console.log('SANDBOX LOCAL: http://127.0.0.1:4317 — synthetic data is retained after restart.');
      console.log('DEMO accounts: demo-superadmin, demo-subadmin, demo-edit, demo-readonly. Use the password set on first startup.');
      console.log('Local store:',store,'; fixtures created:',runtime.fixture.created);
      for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await runtime.close();});
    }else if(command==='backup')console.log(await backupLocalSandbox(store));
    else if(command==='restore')console.log(await restoreLocalSandbox(store,target));
    else if(command==='upgrade')console.log(await upgradeLocalSandbox(store,target));
    else throw Error('Use start, backup, restore, or upgrade');
  }catch(e){delete process.env.TRAINING_DEMO_PASSWORD;console.error(e.message);process.exitCode=1;}
}
