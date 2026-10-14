// Server-side integration contract only. No route, provider or hosted database is enabled.
const verifiedActors=new WeakSet();
const roles=new Set(['superadmin','subadmin','edit','readonly']);
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class TrainingIdentityError extends Error{constructor(status,code){super(code);this.status=status;this.code=code;}}
const deny=(status,code)=>{throw new TrainingIdentityError(status,code);};
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const opaque=value=>typeof value==='string'&&value.length>0&&value.length<=500&&value===value.trim();
const uuid=value=>typeof value==='string'&&uuidPattern.test(value)?value.toLowerCase():deny(409,'identity_mapping_invalid');
const mico=value=>value===null?null:typeof value==='string'&&/^[0-9]{1,32}$/.test(value)?value:deny(409,'mico_profile_invalid');
const unique=(rows,key)=>{if(new Set(rows.map(key)).size!==rows.length)deny(409,'identity_mapping_ambiguous');};
function currentIdentity(subject,snapshot){
 if(!record(snapshot)||!['bridges','principals','hosts','assignments'].every(key=>Array.isArray(snapshot[key])))deny(503,'identity_snapshot_unavailable');
 const bridges=snapshot.bridges,principals=snapshot.principals,hosts=snapshot.hosts,assignments=snapshot.assignments;
 for(const row of bridges)if(!record(row)||!opaque(row.provider)||!opaque(row.subject)||!opaque(row.legacy_user_key)||typeof row.is_active!=='boolean')deny(409,'identity_mapping_invalid');
 for(const row of principals){if(!record(row)||!opaque(row.legacy_user_key)||typeof row.is_active!=='boolean')deny(409,'identity_mapping_invalid');uuid(row.training_user_id);mico(row.mico_id);}
 for(const row of hosts){if(!record(row)||!opaque(row.legacy_host_key)||typeof row.is_active!=='boolean')deny(409,'identity_mapping_invalid');uuid(row.training_host_id);mico(row.mico_id);}
 for(const row of assignments){if(!record(row)||typeof row.is_active!=='boolean')deny(409,'identity_mapping_invalid');uuid(row.training_host_id);uuid(row.training_user_id);}
 unique(bridges,row=>JSON.stringify([row.provider,row.subject]));unique(principals,row=>row.legacy_user_key);unique(principals,row=>uuid(row.training_user_id));unique(hosts,row=>row.legacy_host_key);unique(hosts,row=>uuid(row.training_host_id));unique(assignments,row=>uuid(row.training_host_id));
 unique(principals.filter(row=>row.mico_id!==null),row=>row.mico_id);unique(hosts.filter(row=>row.mico_id!==null),row=>row.mico_id);
 if(bridges.some(row=>!principals.some(principal=>principal.legacy_user_key===row.legacy_user_key))||assignments.some(row=>!principals.some(principal=>uuid(principal.training_user_id)===uuid(row.training_user_id))||!hosts.some(host=>uuid(host.training_host_id)===uuid(row.training_host_id))))deny(409,'identity_mapping_orphaned');
 const bridge=bridges.find(row=>row.provider===subject.provider&&row.subject===subject.subject);
 if(!bridge||!bridge.is_active)deny(403,'identity_link_required');
 const principal=principals.find(row=>row.legacy_user_key===bridge.legacy_user_key);
 if(!principal.is_active||!roles.has(principal.role))deny(403,'identity_access_denied');
 const administrator=['superadmin','subadmin'].includes(principal.role);
 const host_ids=assignments.filter(row=>row.is_active&&(administrator||uuid(row.training_user_id)===uuid(principal.training_user_id))&&hosts.some(host=>host.is_active&&uuid(host.training_host_id)===uuid(row.training_host_id))&&principals.some(user=>user.is_active&&roles.has(user.role)&&uuid(user.training_user_id)===uuid(row.training_user_id))).map(row=>uuid(row.training_host_id)).sort();
 const actor=Object.freeze({training_user_id:uuid(principal.training_user_id),role:principal.role,mico_id:principal.mico_id,mico_profile_status:principal.mico_id===null?'missing':'recorded',host_ids:Object.freeze(host_ids)});verifiedActors.add(actor);return actor;
}
/** Trusted server ports: verifySession must verify signature/expiry/revocation itself;
 * readSnapshot must return current server records, never browser/localStorage claims.
 * Resolution is a read snapshot. Mutations must recheck scope under their own transaction. */
export function createTrainingIdentityAdapter({verifySession,readSnapshot}){
 if(typeof verifySession!=='function'||typeof readSnapshot!=='function')throw new TypeError('Trusted server identity ports are required');
 return Object.freeze({async resolve(credential){
  if(typeof credential!=='string'||!credential.trim()||credential!==credential.trim()||credential.length>8192)deny(401,'verified_session_required');
  let subject;try{subject=await verifySession(credential);}catch{deny(401,'verified_session_required');}
  if(!record(subject)||!opaque(subject.provider)||!opaque(subject.subject))deny(401,'verified_session_required');
  let snapshot;try{snapshot=await readSnapshot(Object.freeze({provider:subject.provider,subject:subject.subject}));}catch{deny(503,'identity_snapshot_unavailable');}
  return currentIdentity(subject,snapshot);
 }});
}
export function requireTrainingCapability(actor,capability,host_id){
 if(!record(actor)||!verifiedActors.has(actor)||!roles.has(actor.role)||!Array.isArray(actor.host_ids))deny(403,'identity_access_denied');
 uuid(actor.training_user_id);
 if(!['read','write','admin'].includes(capability))deny(403,'identity_access_denied');
 if(capability==='admin'&&!['superadmin','subadmin'].includes(actor.role)||capability==='write'&&actor.role==='readonly')deny(403,'identity_access_denied');
 if(host_id!==undefined&&!actor.host_ids.includes(uuid(host_id)))deny(404,'training_record_unavailable');
 return actor.training_user_id;
}
