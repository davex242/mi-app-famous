import {randomBytes} from 'node:crypto';
import {createIsolatedDatabase} from './database.mjs';
import {createTrainingService,provisionSyntheticUser} from './service.mjs';
import {createSandboxHttpServer} from './server.mjs';
import {seedDemoProgram} from './demo-fixtures.mjs';
import {buildLocalReact} from './react-local-build.mjs';
// Explicit local-only launcher. No app auth, connection string, hosted client or CORS.
const assets=await buildLocalReact();
let db,server;
try {
  db=await createIsolatedDatabase();
  const principals={},accounts=[];
  for(const role of ['superadmin','subadmin','edit','readonly']) {
    const password=randomBytes(18).toString('base64url'),username=`demo-${role}`;
    principals[role]=await provisionSyntheticUser(db,username,password,role);
    accounts.push({username,password,role});
  }
  await seedDemoProgram(db,principals.superadmin.app_user_id,principals.edit.app_user_id);
  server=createSandboxHttpServer(createTrainingService(db),{reactAssets:assets.assets});
  server.listen(4317,'127.0.0.1',()=>{
    console.log('PRUEBA LOCAL: http://127.0.0.1:4317/react-training?trainingSandbox=local');
    console.log('Cuentas ficticias; contraseñas regeneradas al iniciar:',accounts);
  });
  async function close(){server.closeAllConnections();await new Promise(r=>server.close(r));await db.close();await assets.cleanup();}
  server.on('error',async error=>{console.error(error.code??'Local startup error');await db.close();await assets.cleanup();process.exitCode=1;});
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void close());
} catch(error) {if(db)await db.close();await assets.cleanup();throw error;}
