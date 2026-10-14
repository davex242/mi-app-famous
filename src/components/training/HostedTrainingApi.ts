import {LocalTrainingApi,LocalTrainingError} from './localTrainingApi';
export type HostedTrainingConfig={enabled:boolean;url:string;key:string};
export function hostedTrainingEnabled(config?:HostedTrainingConfig){return !!config?.enabled&&/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(config.url)&&!!config.key&&typeof window!=='undefined'&&window.location.protocol==='https:';}
export class HostedTrainingApi extends LocalTrainingApi{
 constructor(private config:HostedTrainingConfig){super();}
 quizUrl(token:string){return `${window.location.origin}/training-quiz/index.html#${token}`;}
 protected async request(path:string,body?:object):Promise<unknown>{
  if(!hostedTrainingEnabled(this.config))throw new LocalTrainingError(403);
  // Vercel's same-origin protection cookie unlocks the preview only.
  // The proxy forwards the training bearer, never browser cookies, to Supabase.
  const generation=this.generation,controller=new AbortController();this.controllers.add(controller);
  try{const response=await fetch('/api/training'+path,{method:body?'POST':'GET',credentials:'same-origin',redirect:'error',cache:'no-store',signal:controller.signal,headers:{...(body?{'Content-Type':'application/json'}:{}),...(this.token?{Authorization:'Bearer '+this.token}:{})},...(body?{body:JSON.stringify(body)}:{})});
   if(generation!==this.generation)throw new LocalTrainingError(401);
   if(!response.ok){if(response.status===401)this.clear();throw new LocalTrainingError(response.status);}
   const result=await response.json();if(generation!==this.generation)throw new LocalTrainingError(401);return result;
  }finally{this.controllers.delete(controller);}
 }
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
