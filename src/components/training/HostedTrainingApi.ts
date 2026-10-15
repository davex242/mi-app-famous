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
 private static readonly sessionKey='famous_training_preview_session';
 private refreshToken:string|null=null;
 private expiresAt=0;
 override clear(){super.clear();this.refreshToken=null;this.expiresAt=0;sessionStorage.removeItem(HostedTrainingApi.sessionKey);}
 private persist(){if(this.token&&this.refreshToken)sessionStorage.setItem(HostedTrainingApi.sessionKey,JSON.stringify({url:this.config.url,access:this.token,refresh:this.refreshToken,expires:this.expiresAt}));}
 private async renew(){const generation=this.generation;if(!this.refreshToken)throw new LocalTrainingError(401);const response=await fetch(this.config.url+'/auth/v1/token?grant_type=refresh_token',{method:'POST',credentials:'omit',cache:'no-store',headers:{apikey:this.config.key,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:this.refreshToken})});if(generation!==this.generation||!response.ok)throw new LocalTrainingError(401);const data=await response.json();if(generation!==this.generation)throw new LocalTrainingError(401);this.token=data.access_token;this.refreshToken=data.refresh_token;this.expiresAt=Date.now()+(Number(data.expires_in)||3600)*1000;this.persist();}
 async restore(){try{const raw=sessionStorage.getItem(HostedTrainingApi.sessionKey);if(!raw)return null;const saved=JSON.parse(raw);if(saved.url!==this.config.url||typeof saved.refresh!=='string'||typeof saved.access!=='string')return null;this.token=saved.access;this.refreshToken=saved.refresh;this.expiresAt=Number(saved.expires)||0;this.verified=true;if(Date.now()>this.expiresAt-60000)await this.renew();return await this.load();}catch{this.clear();sessionStorage.removeItem(HostedTrainingApi.sessionKey);return null;}}

 quizUrl(token:string){return `${window.location.origin}/training-quiz/index.html#${token}`;}
 protected async request(path:string,body?:object):Promise<unknown>{
  if(!hostedTrainingEnabled(this.config))throw new LocalTrainingError(403);
  const generation=this.generation;
  if(this.refreshToken&&Date.now()>this.expiresAt-60000)await this.renew();
  if(generation!==this.generation)throw new LocalTrainingError(401);
  // Vercel's same-origin protection cookie unlocks the preview only.
  // The proxy forwards the training bearer, never browser cookies, to Supabase.
  const controller=new AbortController();this.controllers.add(controller);
  try{const response=await fetch(path==='/health'?'/api/training/health':'/api/training/gateway?route='+encodeURIComponent(path),{method:body?'POST':'GET',credentials:'same-origin',redirect:'error',cache:'no-store',signal:controller.signal,headers:{...(body?{'Content-Type':'application/json'}:{}),...(this.token?{'X-Training-Authorization':'Bearer '+this.token}:{})},...(body?{body:JSON.stringify(body)}:{})});
   if(generation!==this.generation)throw new LocalTrainingError(401);
   if(!response.ok){if(response.status===401)this.clear();let reason:unknown;try{reason=(await response.json())?.error;}catch{/* Keep the generic error for a non-JSON response. */}throw hostedRequestError(response.status,reason);}
   const result=await response.json();if(generation!==this.generation)throw new LocalTrainingError(401);return result;
  }finally{this.controllers.delete(controller);}
 }
 async resume(){return this.verified&&this.token?await this.load():await this.restore();}
 async connect(){const health=await this.request('/health') as {storage:string;initialized:boolean};if(health.storage!=='hosted-preview'||!health.initialized)throw new LocalTrainingError(503);this.verified=true;}
 async login(email:string,password:string){
  this.clear();await this.connect();const generation=this.generation;
  const response=await fetch(this.config.url+'/auth/v1/token?grant_type=password',{method:'POST',credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000),headers:{apikey:this.config.key,'Content-Type':'application/json'},body:JSON.stringify({email,password})});
  if(generation!==this.generation)throw new LocalTrainingError(401);
  if(!response.ok){
   let code='';try{const payload=await response.json();code=typeof payload?.error_code==='string'?payload.error_code:'';}catch{/* Do not expose provider payloads. */}
   const error=new LocalTrainingError(response.status===429?429:401);
   if(code==='email_not_confirmed')error.message='La cuenta de capacitación no está confirmada.';
   else if(response.status===429)error.message='Demasiados intentos de acceso a capacitación. Espera antes de volver a intentarlo.';
   else if(response.status>=500)error.message='El servicio de autenticación de capacitación no está disponible temporalmente.';
   else error.message='Capacitación rechazó las credenciales. Comprueba que esta cuenta esté vinculada y autorizada.';
   throw error;
  }
  const data=await response.json();if(generation!==this.generation)throw new LocalTrainingError(401);if(typeof data.access_token!=='string'||data.access_token.length>8192)throw new LocalTrainingError(401);
  this.token=data.access_token;this.refreshToken=data.refresh_token;this.expiresAt=Date.now()+(Number(data.expires_in)||3600)*1000;this.persist();try{return await this.load();}catch(error){await this.logout();throw error;}
 }
 async reassignEnrollment(enrollment_id:string,trainer_id:string){return this.request('/api/enrollments/reassign',{enrollment_id,trainer_id});}
 async identities(){return await this.request('/api/identity/list',{}) as {users:Record<string,unknown>[];hosts:Record<string,unknown>[]};}
 async saveIdentity(kind:'user'|'host',body:object){return this.request('/api/identity/'+kind,body);}
 async register(email:string,password:string){
  if(!hostedTrainingEnabled(this.config))throw new LocalTrainingError(403);
  const response=await fetch(this.config.url+'/auth/v1/signup',{method:'POST',credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000),headers:{apikey:this.config.key,'Content-Type':'application/json'},body:JSON.stringify({email,password})});
  if(!response.ok)throw new LocalTrainingError(response.status===429?429:400);
 }
 async logout(){const token=this.token;this.clear();this.refreshToken=null;this.expiresAt=0;sessionStorage.removeItem(HostedTrainingApi.sessionKey);sessionStorage.removeItem('famous_training_section');if(token){try{await fetch(this.config.url+'/auth/v1/logout?scope=local',{method:'POST',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(10000),headers:{apikey:this.config.key,Authorization:'Bearer '+token}});}catch{/* Local credentials have already been cleared. */}}}
}
