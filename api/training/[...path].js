import {randomUUID} from 'node:crypto';
import {previewProxyConfig} from '../../training-hosted/configuration.mjs';
// Preview-only proxy. No database credentials, browser roles or arbitrary target URLs.
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 const config=previewProxyConfig(name=>process.env[name]);
 if(!config){res.statusCode=404;return res.end();}
 const incoming=new URL(req.url,'https://training.invalid');
 const path=incoming.pathname==='/api/training/health'?'/health':incoming.pathname==='/api/training/gateway'?incoming.searchParams.get('route')||'':'';
 if(!/^\/(health|api\/[a-z/-]+)$/.test(path)||!['GET','POST'].includes(req.method)){res.statusCode=404;return res.end();}
 if(req.headers.origin&&req.headers.origin!==`https://${req.headers.host}`){res.statusCode=403;return res.end();}
 try{
  const auth=req.headers['x-training-authorization'];
  if(path!=='/health'&&(typeof auth!=='string'||auth.length>8200)){res.statusCode=401;return res.end(JSON.stringify({error:'Verified session required'}));}
  let body;if(req.method==='POST'){
   if(req.body!==undefined){body=typeof req.body==='string'?req.body:JSON.stringify(req.body);}
   else {let size=0;const parts=[];for await(const chunk of req){size+=chunk.length;if(size>3*1024*1024){res.statusCode=413;return res.end();}parts.push(chunk);}body=Buffer.concat(parts).toString('utf8');}
   if(Buffer.byteLength(body)>3*1024*1024){res.statusCode=413;return res.end();}
  }
  // Retry lightweight GET requests once. Workspace queries may be expensive;
  // allow a longer timeout instead of starting a duplicate query.
  // Never retry POST: doing so could duplicate an enrollment or identity update.
  const requestId=randomUUID();
  res.setHeader('X-Training-Request-Id',requestId);
  const attempts=req.method==='GET'&&path!=='/api/workspace'?2:1;
  for(let attempt=0;attempt<attempts;attempt++){
   try{
    const response=await fetch(config.backend+path,{method:req.method,redirect:'error',signal:AbortSignal.timeout(path==='/api/workspace'?25000:15000),headers:{...(auth?{Authorization:auth}:{}),'Content-Type':'application/json'},...(body?{body}:{})});
    if(req.method==='GET'&&attempt===0&&[502,503,504].includes(response.status)){await response.body?.cancel();continue;}
    res.setHeader('Content-Type','application/json');
    res.statusCode=response.status;
    return res.end(await response.text());
   }catch(error){
    console.error('Training upstream request failed',{requestId,route:path,method:req.method,attempt:attempt+1,errorType:error?.name||'unknown'});
    if(attempt+1===attempts){res.statusCode=503;res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({error:'Training backend unavailable',request_id:requestId}));}
   }
  }
 }catch(error){console.error('Training gateway error',{errorType:error?.name||'unknown'});res.statusCode=503;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:'Training backend unavailable'}));}
}
