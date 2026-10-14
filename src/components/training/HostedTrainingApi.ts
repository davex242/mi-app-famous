import {LocalTrainingApi,LocalTrainingError} from './localTrainingApi';
export type HostedTrainingConfig={enabled:boolean;url:string;key:string};
export function hostedTrainingEnabled(config?:HostedTrainingConfig){return !!config?.enabled&&/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(config.url)&&!!config.key&&typeof window!=='undefined'&&window.location.protocol==='https:';}
export function hostedRequestError(status:number,reason:unknown){
 const messages:Record<string,string>={
  'Invalid fields':'El formulario envió campos que no corresponden a esta operación.',
  'Invalid text':'Revisa la descripción o las notas: deben contener texto y respetar el límite indicado.',
  'Invalid ID':'Selecciona una sesión o evidencia válida y actualiza los datos.',
  'Evidence file consent required':'Confirma que el archivo adjunto está autorizado para esta prueba.',
  'Choose one evidence file':'Adjunta un solo archivo por evidencia.',
  'Static PDF without passwords, forms, actions or attachments required':'El PDF debe ser estático, sin contraseña, formularios, acciones ni adjuntos.',
  'PDF exceeds 2 MiB limit':'El PDF supera el límite de 2 MiB.',
  'Valid RGB or RGBA PNG required':'No se pudo validar la copia PNG preparada. Prueba con otra imagen PNG, JPEG o WebP.',
  'PNG exceeds 2 MiB limit':'La imagen supera el límite de 2 MiB.',
  'PNG dimensions exceed sandbox limit':'La imagen supera las dimensiones admitidas: hasta 2048 por lado y 4 millones de píxeles.',
  'Compatible MP4 H264 with optional AAC required':'El video debe ser MP4 con H.264 y audio AAC opcional.',
  'Video exceeds 2 MiB limit':'El video supera el límite de 2 MiB.',
  'Video duration exceeds 60 seconds':'El video debe durar como máximo 60 segundos.',
  'Video dimensions exceed sandbox limit':'El video debe tener hasta 1280 píxeles por lado y 921600 píxeles en total.',
  'Invalid JSON':'No se pudo interpretar el formulario enviado.',
  'Invalid decision':'Selecciona Aprobar o Rechazar antes de guardar la revisión.'
 };
 const error=new LocalTrainingError(status);
 if(typeof reason==='string'&&messages[reason])error.message=messages[reason];
 error.message+=' (API de capacitación: HTTP '+status+')';
 return error;
}
export class HostedTrainingApi extends LocalTrainingApi{
 constructor(private config:HostedTrainingConfig){super();}
 quizUrl(token:string){return `${window.location.origin}/training-quiz/index.html#${token}`;}
 protected async request(path:string,body?:object):Promise<unknown>{
  if(!hostedTrainingEnabled(this.config))throw new LocalTrainingError(403);
  // Vercel's same-origin protection cookie unlocks the preview only.
  // The proxy forwards the training bearer, never browser cookies, to Supabase.
  const generation=this.generation,controller=new AbortController();this.controllers.add(controller);
  try{const response=await fetch(path==='/health'?'/api/training/health':'/api/training/gateway?route='+encodeURIComponent(path),{method:body?'POST':'GET',credentials:'same-origin',redirect:'error',cache:'no-store',signal:controller.signal,headers:{...(body?{'Content-Type':'application/json'}:{}),...(this.token?{'X-Training-Authorization':'Bearer '+this.token}:{})},...(body?{body:JSON.stringify(body)}:{})});
   if(generation!==this.generation)throw new LocalTrainingError(401);
   if(!response.ok){if(response.status===401)this.clear();let reason:unknown;try{reason=(await response.json())?.error;}catch{}throw hostedRequestError(response.status,reason);}
   const result=await response.json();if(generation!==this.generation)throw new LocalTrainingError(401);return result;
  }finally{this.controllers.delete(controller);}
 }
 async resume(){return this.verified&&this.token?await this.load():null;}
 async connect(){const health=await this.request('/health') as {storage:string;initialized:boolean};if(health.storage!=='hosted-preview'||!health.initialized)throw new LocalTrainingError(503);this.verified=true;}
 async login(email:string,password:string){
  this.clear();await this.connect();const generation=this.generation;
  const response=await fetch(this.config.url+'/auth/v1/token?grant_type=password',{method:'POST',credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000),headers:{apikey:this.config.key,'Content-Type':'application/json'},body:JSON.stringify({email,password})});
  if(generation!==this.generation)throw new LocalTrainingError(401);
  if(!response.ok)throw new LocalTrainingError(401);
  const data=await response.json();if(generation!==this.generation)throw new LocalTrainingError(401);if(typeof data.access_token!=='string'||data.access_token.length>8192)throw new LocalTrainingError(401);
  this.token=data.access_token;try{return await this.load();}catch(error){await this.logout();throw error;}
 }
 async identities(){return await this.request('/api/identity/list',{}) as {users:Record<string,unknown>[];hosts:Record<string,unknown>[]};}
 async saveIdentity(kind:'user'|'host',body:object){return this.request('/api/identity/'+kind,body);}
 async register(email:string,password:string){
  if(!hostedTrainingEnabled(this.config))throw new LocalTrainingError(403);
  const response=await fetch(this.config.url+'/auth/v1/signup',{method:'POST',credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000),headers:{apikey:this.config.key,'Content-Type':'application/json'},body:JSON.stringify({email,password})});
  if(!response.ok)throw new LocalTrainingError(response.status===429?429:400);
 }
 async logout(){const token=this.token;this.clear();if(token){try{await fetch(this.config.url+'/auth/v1/logout?scope=local',{method:'POST',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(10000),headers:{apikey:this.config.key,Authorization:'Bearer '+token}});}catch{}}}
}
