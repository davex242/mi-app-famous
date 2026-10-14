import {previewProxyConfig} from '../../training-hosted/configuration.mjs';
// Preview-only proxy. No database credentials, browser roles or arbitrary target URLs.
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 const config=previewProxyConfig(name=>process.env[name]);
 if(!config){res.statusCode=404;return res.end();}
 const path=new URL(req.url,'https://training.invalid').pathname.slice('/api/training'.length);
 if(!/^\/(health|api\/[a-z/-]+)$/.test(path)||!['GET','POST'].includes(req.method)){res.statusCode=404;return res.end();}
 if(req.headers.origin&&req.headers.origin!==`https://${req.headers.host}`){res.statusCode=403;return res.end();}
 try{
  const auth=req.headers.authorization;
  if(path!=='/health'&&(typeof auth!=='string'||auth.length>8200)){res.statusCode=401;return res.end(JSON.stringify({error:'Verified session required'}));}
  let body;if(req.method==='POST'){
   if(req.body!==undefined){body=typeof req.body==='string'?req.body:JSON.stringify(req.body);}
   else {let size=0;const parts=[];for await(const chunk of req){size+=chunk.length;if(size>3*1024*1024){res.statusCode=413;return res.end();}parts.push(chunk);}body=Buffer.concat(parts).toString('utf8');}
   if(Buffer.byteLength(body)>3*1024*1024){res.statusCode=413;return res.end();}
  }
  const response=await fetch(config.backend+path,{method:req.method,redirect:'error',signal:AbortSignal.timeout(30000),headers:{...(auth?{Authorization:auth}:{}),'Content-Type':'application/json'},...(body?{body}:{})});
  res.setHeader('Content-Type','application/json');res.statusCode=response.status;res.end(await response.text());
 }catch{res.statusCode=503;res.end(JSON.stringify({error:'Training backend unavailable'}));}
}
