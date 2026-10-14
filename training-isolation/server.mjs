import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createIsolatedDatabase } from './database.mjs';
import { createTrainingService, provisionSyntheticUser, ApiError } from './service.mjs';
import { seedDemoProgram } from './demo-fixtures.mjs';

function requestBody(req,maxBytes){
  return new Promise((resolve,reject)=>{
    let size=0;const chunks=[];
    const clean=()=>{req.off('data',data);req.off('end',end);req.off('error',error);req.off('aborted',abort);};
    const error=e=>{clean();reject(e);},abort=()=>error(new ApiError(400,'Invalid JSON'));
    const end=()=>{clean();resolve(Buffer.concat(chunks,size).toString('utf8'));};
    const data=chunk=>{size+=chunk.length;if(size>maxBytes){clean();chunks.length=0;req.once('error',()=>{});req.resume();reject(new ApiError(413,'Body too large'));}else chunks.push(chunk);};
    req.on('data',data);req.once('end',end);req.once('error',error);req.once('aborted',abort);
  });
}

export function createSandboxHttpServer(service,{storage='memory',reactAssets=null}={}) {
  if(!['memory','local-persistent'].includes(storage))throw Error('Invalid sandbox storage mode');
  // Optional locally compiled React assets; fixed routes, no caller-selected paths.
  const reactRoutes = {'/react-training':['index.html','text/html; charset=utf-8'], '/react-training/bundle.js':['bundle.js','text/javascript; charset=utf-8'], '/react-training/bundle.css':['bundle.css','text/css; charset=utf-8']};
  const limits = new Map();
  const server = createServer(async (req, res) => {
    const send = (status, body) => {
      if(status===413)res.setHeader('connection','close');
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(JSON.stringify(body));
    };
    try {
      const port = server.address().port;
      const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
      if (!hosts.includes(req.headers.host)) throw new ApiError(403, 'Invalid local host');
      if (req.headers.origin && !hosts.map(host => `http://${host}`).includes(req.headers.origin)) throw new ApiError(403, 'Origin denied');
      const path = new URL(req.url, `http://127.0.0.1:${port}`).pathname;
      const now = Date.now();
      // Bound entries and age them out; no username or credential values in limiter keys.
      for (const [key, value] of limits) if (value.until <= now) limits.delete(key);
      const key = `${req.socket.remoteAddress}:${path === '/api/login' ? 'login' : 'api'}`;
      const limit = limits.get(key) ?? { count: 0, until: now + 60000 };
      limit.count++; limits.set(key, limit);
      if (limit.count > (path === '/api/login' ? 20 : 200)) throw new ApiError(429, 'Try again later');
      const assets = { '/image-input.mjs':['image-input.mjs','text/javascript; charset=utf-8'], '/': ['index.html', 'text/html; charset=utf-8'], '/quiz': ['quiz.html', 'text/html; charset=utf-8'], '/quiz.mjs': ['quiz.mjs', 'text/javascript; charset=utf-8'], '/exams-ui.mjs': ['exams-ui.mjs', 'text/javascript; charset=utf-8'], '/ui.mjs': ['ui.mjs', 'text/javascript; charset=utf-8'], '/programs-ui.mjs': ['programs-ui.mjs', 'text/javascript; charset=utf-8'], '/updates-ui.mjs': ['updates-ui.mjs', 'text/javascript; charset=utf-8'], '/closing-ui.mjs':['closing-ui.mjs','text/javascript; charset=utf-8'], '/ui.css': ['ui.css', 'text/css; charset=utf-8'] };
      if (reactAssets && reactRoutes[path]) assets[path] = reactRoutes[path];
      if (req.method === 'GET' && assets[path]) {
        const [file, mime] = assets[path];
        let content = await readFile(reactAssets && reactRoutes[path] ? new URL(file, reactAssets) : new URL(`web/${file}`, import.meta.url));
        if(mime.startsWith('text/html')){
          content=content.toString().replace('<body>',`<body data-storage="${storage}">`);
          if(storage==='local-persistent')content=content
            .replace('Los datos se eliminan al reiniciar el servidor','Los datos se conservan al reiniciar')
            .replace('Usa una cuenta DEMO y su contraseña temporal, mostrada en la consola al iniciar el servidor.','Usa una cuenta DEMO y la contraseña definida al preparar esta prueba local.')
            .replace('Contraseña temporal','Contraseña DEMO')
            .replace('DEMO · Datos temporales ·','DEMO · Datos guardados localmente ·')
            .replace('Los datos son temporales','Los datos se guardan localmente')
            .replace('Los datos se eliminan al reiniciar.','Los datos se conservan al reiniciar.');
        }
        res.writeHead(200, {
          'content-type': mime, 'cache-control': 'no-store', 'referrer-policy':'no-referrer', 'x-content-type-options': 'nosniff',
          'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; media-src blob:; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'",
        });
        return res.end(content);
      }
      if (req.method === 'GET' && path === '/health') return send(200, { sandbox: true, storage, react_training_api: 1 });
      const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization ?? '')?.[1];
      if (req.method === 'GET' && path === '/api/me') return send(200, await service.me(token));
      if (req.method === 'GET' && path === '/api/enrollments') return send(200, await service.listEnrollments(token));
      if (req.method === 'GET' && path === '/api/workspace') return send(200, await service.workspace(token));
      const routes = {
        '/api/training/closing-preview':'previewClosing', '/api/training/complete':'completeTraining',
        '/api/training/closing-export':'exportClosing',
        '/api/exams/edit-data':'examEditData', '/api/exams/template':'examTemplate', '/api/exams/publish':'publishExam', '/api/exams/issue':'issueExam', '/api/exams/revoke':'revokeExam', '/api/exams/extra-request':'requestExtraAttempts', '/api/exams/extra-review':'reviewExtraAttempts',
        '/api/quiz/status':'examStatus', '/api/quiz/start':'startExam', '/api/quiz/submit':'submitExam',
        '/api/login': 'login', '/api/logout': 'logout', '/api/enrollments': 'enroll',
        '/api/sessions': 'schedule', '/api/evidence': 'submitEvidence',
        '/api/evidence/file-preview':'previewEvidenceFile', '/api/evidence/file-download':'downloadEvidenceFile',
        '/api/evidence/review': 'reviewEvidence', '/api/assessments': 'assess', '/api/items/complete': 'completeItem',
        '/api/topics': 'saveTopic', '/api/topics/publish': 'publishTopic',
        '/api/materials': 'saveMaterial', '/api/materials/image':'saveImageMaterial', '/api/materials/pdf':'savePDFMaterial', '/api/materials/video':'saveVideoMaterial', '/api/materials/publish': 'publishMaterial',
        '/api/materials/edit-data': 'materialEditData', '/api/materials/preview': 'previewMaterial',
        '/api/materials/download': 'downloadMaterial',
        '/api/programs': 'saveProgram', '/api/programs/publish': 'publishProgram',
        '/api/agenda/preview': 'previewAgenda', '/api/agenda/generate': 'generateAgenda',
        '/api/sessions/reschedule': 'reschedule', '/api/attendance': 'recordAttendance',
        '/api/program-updates/preview': 'previewUpdate', '/api/program-updates/accept': 'acceptUpdate',
      };
      if (!routes[path]) throw new ApiError(404, 'Endpoint unavailable');
      if (req.method !== 'POST') throw new ApiError(405, 'Method unavailable');
      if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw new ApiError(415, 'JSON required');
      const raw=await requestBody(req,['/api/materials/image','/api/materials/pdf','/api/materials/video','/api/evidence'].includes(path)?Math.ceil(2*1024*1024/3)*4+8192:path==='/api/exams/publish'?1024*1024:path==='/api/programs'?3*1024*1024:32768);
      let body;
      try { body = JSON.parse(raw); } catch { throw new ApiError(400, 'Invalid JSON'); }
      const result = path === '/api/login' ? await service.login(body) : await service[routes[path]](token, body);
      send(200, result);
    } catch (error) {
      send(error instanceof ApiError ? error.status : 500, { error: error instanceof ApiError ? error.message : 'Internal sandbox error' });
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  return server;
}

// Standalone sandbox startup; never imports the app's client or accepts DB URLs.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = await createIsolatedDatabase();
  const accounts = [];
  const principals = {};
  for (const role of ['superadmin', 'subadmin', 'edit', 'readonly']) {
    const password = randomBytes(18).toString('base64url');
    principals[role] = await provisionSyntheticUser(db, `demo-${role}`, password, role);
    accounts.push({ username: `demo-${role}`, password, role });
  }
  const demo = await seedDemoProgram(db, principals.superadmin.app_user_id, principals.edit.app_user_id);
  const server = createSandboxHttpServer(createTrainingService(db));
  server.listen(4317, '127.0.0.1', () => {
    console.log('SANDBOX ONLY: http://127.0.0.1:4317 — temporary synthetic data; no production connection.');
    console.log('Local test credentials (regenerated on every start):', accounts);
    console.log('Synthetic program and host IDs:', demo);
  });
  server.on('error', async error => { console.error(error.code ?? 'Sandbox startup error'); await db.close(); process.exitCode = 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
    server.close(async () => { await db.close(); });
    server.closeAllConnections();
  });
}
