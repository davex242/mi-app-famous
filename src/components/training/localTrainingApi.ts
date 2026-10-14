export type AcceptedCoursePreview={source_key:string;source_hash:string;title:string;duration_days:number;topics:number;materials:number;practices:number;material_kind:'text';allow_preview:true;allow_download:true;policy:{pass_percent:number;initial_attempts:number;extra_attempts_require_preapproval:boolean;invitation_hours:number};state:'ready'|'already_loaded'|'conflict';program_id:string|null;program_status:string|null};
export type EvidencePreview={type:'image';image:{data:string}}|{type:'video';video:{data:string}};
/** Local synthetic API only. The existing application's identity is never sent. */
export function localTrainingEnabled() {
  return typeof window !== 'undefined' && window.location.protocol === 'http:' &&
    ['127.0.0.1', 'localhost'].includes(window.location.hostname) &&
    new URLSearchParams(window.location.search).get('trainingSandbox') === 'local';
}
export class LocalTrainingError extends Error {
  constructor(public status: number) {
    super(status === 401 ? 'La sesión de prueba venció o las credenciales no son válidas.' :
      status === 403 ? 'Tu cuenta de prueba no tiene permiso para esta operación.' :
      status === 409 ? 'Los datos cambiaron o la operación tiene un conflicto. Actualiza la vista y revisa de nuevo.' :
      status === 429 ? 'Demasiadas solicitudes. Espera un momento y vuelve a intentar.' :
      'No se pudo completar la solicitud de prueba. Intenta nuevamente.');
  }
}
export type LocalActor = {sandbox: true; role: 'superadmin' | 'subadmin' | 'edit' | 'readonly'};
export type PublicRow = {id?: string; [key: string]: unknown};
export type LocalWorkspace = {sandbox: true} & Record<string, PublicRow[]>;
const tables = ['trainees','topics','materials','program_versions','program_items','program_materials','enrollments','sessions','attendance','approvals','assessments','completions','evidence','update_history','closing_records','exams','exam_assignments','exam_attempts','exam_attempt_budgets','events','progress'] as const;
export type AgendaParameters = {enrollment_id:string; start_date:string; local_time:string; weekdays:number[]};
export type AgendaPreview = {preview:true; timezone:string; skipped:number; sessions:PublicRow[]; preview_hash:string};
export type MaterialPreview = {type:'text';content:string;title:string}|{type:'link';url:string;title:string}|{type:'image';image:{data:string};title:string}|{type:'video';video:{data:string};title:string};
export type MaterialDownload = {mime:string;content?:string;image_base64?:string;pdf_base64?:string;video_base64?:string};
export type ClosingPreview={ready:boolean;preview_hash:string;program_version_id:string;program_title:string;program_version:number;progress:{completed_items:number;total_items:number;percent:number};checks:{day:number;ready:boolean;problems:string[]}[];quiz:{ready:boolean;score_percent:number|null;pass_percent:number|null};problems:string[]};
export type ProgramUpdatePreview={from_version_id:string;to_version_id:string;from_version:number;to_version:number;changelog:string;total_items:number;preserved_completed_items:number;preserved_session_items:number;new_required_items:number;historical_only_items:number;previous_progress:{completed_items:number;total_items:number;percent:number};updated_percent:number;preview_hash:string};
export type ExamQuestion={prompt:string;options:string[];correct_option:number};
export type ExamEditData={id:string;exam_key:string;version:number;pass_percent:number;questions:ExamQuestion[]};
export type ProgramDraftItem={day:number;topic_id:string;notes:string;material_ids:string[]};
export class LocalTrainingApi {
  protected token: string | null = null;
  protected verified = false;
  protected generation = 0;
  protected controllers = new Set<AbortController>();
  quizUrl(token:string){return `${window.location.origin}/quiz#${token}`;}
  clear() {
    this.generation++; this.token = null; this.verified = false;
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
  }
  protected async request(path: string, body?: object): Promise<unknown> {
    if (!localTrainingEnabled()) throw new LocalTrainingError(403);
    const generation = this.generation, controller = new AbortController();
    this.controllers.add(controller);
    try {
      const response = await fetch(path, {method: body ? 'POST' : 'GET', credentials: 'omit', cache: 'no-store',
        redirect: 'error', signal: controller.signal,
        headers: {...(body ? {'Content-Type':'application/json'} : {}), ...(this.token ? {Authorization:`Bearer ${this.token}`} : {})},
        ...(body ? {body: JSON.stringify(body)} : {})});
      if (generation !== this.generation) throw new LocalTrainingError(401);
      if (!response.ok) {if (response.status === 401) this.clear(); throw new LocalTrainingError(response.status);}
      const result = await response.json();
      if (generation !== this.generation) throw new LocalTrainingError(401);
      return result;
    } finally {this.controllers.delete(controller);}
  }
  async connect() {
    const health = await this.request('/health') as {sandbox?: boolean; react_training_api?: number};
    if (health?.sandbox !== true || health.react_training_api !== 1) throw new LocalTrainingError(403);
    this.verified = true;
  }
  async login(username: string, password: string) {
    this.clear(); await this.connect();
    const result = await this.request('/api/login', {username, password}) as {sandbox?: boolean; token?: string};
    if (result?.sandbox !== true || !/^[A-Za-z0-9_-]{43}$/.test(result.token ?? '')) throw new LocalTrainingError(403);
    this.token = result.token!;
    try {return await this.load();} catch (error) {await this.logout(); throw error;}
  }
  async load(): Promise<{actor: LocalActor; workspace: LocalWorkspace}> {
    if (!this.verified || !this.token) throw new LocalTrainingError(401);
    const actor = await this.request('/api/me') as LocalActor;
    if (actor?.sandbox !== true || !['superadmin','subadmin','edit','readonly'].includes(actor.role)) {this.clear(); throw new LocalTrainingError(403);}
    const workspace = await this.request('/api/workspace') as LocalWorkspace;
    if (workspace?.sandbox !== true || tables.some(key => !Array.isArray(workspace[key]))) {this.clear(); throw new LocalTrainingError(403);}
    return {actor, workspace};
  }
  async enroll(host_id: string, program_version_id: string, timezone: string) {
    if (!this.verified || !this.token) throw new LocalTrainingError(401);
    await this.request('/api/enrollments', {host_id, program_version_id, timezone});
  }
  async previewAgenda(parameters:AgendaParameters):Promise<AgendaPreview> {
    if (!this.verified || !this.token) throw new LocalTrainingError(401);
    return await this.request('/api/agenda/preview', parameters) as AgendaPreview;
  }
  async generateAgenda(parameters:AgendaParameters, expected_preview_hash:string) {
    if (!this.verified || !this.token) throw new LocalTrainingError(401);
    await this.request('/api/agenda/generate', {...parameters,expected_preview_hash});
  }
  async attendance(session_id:string, status:string, expected_recorded_at:string|null) {
    if (!this.verified || !this.token) throw new LocalTrainingError(401);
    await this.request('/api/attendance',{session_id,status,expected_recorded_at});
  }
  async reschedule(session_id:string, local_date:string, local_time:string, expected_scheduled_at:string, reason:string) {
    if (!this.verified || !this.token) throw new LocalTrainingError(401);
    await this.request('/api/sessions/reschedule',{session_id,local_date,local_time,expected_scheduled_at,reason});
  }
  async submitEvidence(body:{session_id:string;description:string;image_base64?:string;pdf_base64?:string;video_base64?:string;consent_confirmed?:boolean}) {
    if (!this.verified || !this.token) throw new LocalTrainingError(401);
    await this.request('/api/evidence',body);
  }
  async reviewEvidence(evidence_id:string,decision:string,notes:string) {
    if (!this.verified || !this.token) throw new LocalTrainingError(401);
    await this.request('/api/evidence/review',{evidence_id,decision,notes});
  }
  async previewEvidence(evidence_id:string) {
    if (!this.verified || !this.token) throw new LocalTrainingError(401);
    return await this.request('/api/evidence/file-preview',{evidence_id}) as EvidencePreview;
  }
  async downloadEvidence(evidence_id:string) {
    if (!this.verified || !this.token) throw new LocalTrainingError(401);
    return await this.request('/api/evidence/file-download',{evidence_id}) as {mime:string;image_base64?:string;pdf_base64?:string;video_base64?:string};
  }
  async assess(session_id:string, score:number, passed:boolean, notes:string) {
    if (!this.verified || !this.token) throw new LocalTrainingError(401);
    await this.request('/api/assessments',{session_id,score,passed,notes});
  }
  async completePractice(session_id:string) {
    if (!this.verified || !this.token) throw new LocalTrainingError(401);
    await this.request('/api/items/complete',{session_id});
  }
  async previewMaterial(id:string) {
    if (!this.verified || !this.token) throw new LocalTrainingError(401);
    return await this.request('/api/materials/preview',{id}) as MaterialPreview;
  }
  async downloadMaterial(id:string) {
    if (!this.verified || !this.token) throw new LocalTrainingError(401);
    return await this.request('/api/materials/download',{id}) as MaterialDownload;
  }
  async issueExam(enrollment_id:string, exam_version_id:string, max_attempts:number) {
    if (!this.verified || !this.token) throw new LocalTrainingError(401);
    return await this.request('/api/exams/issue',{enrollment_id,exam_version_id,max_attempts}) as {assignment:{id:string};invitation_token:string};
  }
  async revokeExam(assignment_id:string) {
    if (!this.verified || !this.token) throw new LocalTrainingError(401);
    await this.request('/api/exams/revoke',{assignment_id});
  }
  async previewClosing(enrollment_id:string, attempt_id?:string) {
    if (!this.verified || !this.token) throw new LocalTrainingError(401);
    return await this.request('/api/training/closing-preview',{enrollment_id,...(attempt_id?{attempt_id}:{})}) as ClosingPreview;
  }
  async closeTraining(enrollment_id:string, attempt_id:string, expected_program_version_id:string, preview_hash:string, notes:string) {
    if (!this.verified || !this.token) throw new LocalTrainingError(401);
    await this.request('/api/training/complete',{enrollment_id,attempt_id,expected_program_version_id,preview_hash,notes});
  }
  async exportClosing(record_id:string, format:'html'|'json') {
    if (!this.verified || !this.token) throw new LocalTrainingError(401);
    return await this.request('/api/training/closing-export',{record_id,format}) as {content:string;mime:string;sha256:string};
  }
  async previewProgramUpdate(enrollment_id:string,to_version_id:string) {
    if (!this.verified || !this.token) throw new LocalTrainingError(401);
    return await this.request('/api/program-updates/preview',{enrollment_id,to_version_id}) as ProgramUpdatePreview;
  }
  async acceptProgramUpdate(enrollment_id:string,to_version_id:string,expected_from_version_id:string,preview_hash:string) {
    if (!this.verified || !this.token) throw new LocalTrainingError(401);
    await this.request('/api/program-updates/accept',{enrollment_id,to_version_id,expected_from_version_id,preview_hash});
  }
  async saveTopic(body:{source_id?:string;title:string;description:string;category:string;estimated_minutes:number}) {
    if (!this.verified || !this.token) throw new LocalTrainingError(401);
    await this.request('/api/topics',body);
  }
  async publishTopic(id:string) {
    if (!this.verified || !this.token) throw new LocalTrainingError(401);
    await this.request('/api/topics/publish',{id});
  }
  async editMaterial(id:string) {
    if (!this.verified || !this.token) throw new LocalTrainingError(401);
    return await this.request('/api/materials/edit-data',{id}) as PublicRow;
  }
  async saveTextMaterial(body:{source_id?:string;topic_id:string;title:string;kind:'document'|'link';content?:string;external_url?:string;allow_preview:boolean;allow_download:boolean}) {
    if (!this.verified || !this.token) throw new LocalTrainingError(401);
    await this.request('/api/materials',body);
  }
  async publishMaterial(id:string) {
    if (!this.verified || !this.token) throw new LocalTrainingError(401);
    await this.request('/api/materials/publish',{id});
  }
  async requestExtraAttempts(enrollment_id:string,extra_attempts:number,reason:string) {
    await this.request('/api/exams/extra-request',{enrollment_id,extra_attempts,reason});
  }
  async reviewExtraAttempts(enrollment_id:string,request_id:string,decision:string,review_notes:string) {
    await this.request('/api/exams/extra-review',{enrollment_id,request_id,decision,review_notes});
  }
  async previewAcceptedCourse() {
    return await this.request('/api/content-import/preview',{}) as AcceptedCoursePreview;
  }
  async loadAcceptedCourse(expected_hash:string) {
    return await this.request('/api/content-import/load',{expected_hash,confirmed:true}) as AcceptedCoursePreview&{already_loaded:boolean};
  }
  async examTemplate() {
    if (!this.verified || !this.token) throw new LocalTrainingError(401);
    return await this.request('/api/exams/template',{}) as {demo:true;questions:ExamQuestion[]};
  }
  async editExam(id:string) {
    if (!this.verified || !this.token) throw new LocalTrainingError(401);
    return await this.request('/api/exams/edit-data',{id}) as ExamEditData;
  }
  async publishExam(body:{source_id?:string;exam_key:string;pass_percent:number;questions:ExamQuestion[]}) {
    if (!this.verified || !this.token) throw new LocalTrainingError(401);
    await this.request('/api/exams/publish',body);
  }
  async saveProgram(body:{source_id?:string;title:string;duration_days:number;changelog:string;items:ProgramDraftItem[]}) {
    if (!this.verified || !this.token) throw new LocalTrainingError(401);
    await this.request('/api/programs',body);
  }
  async publishProgram(id:string) {
    if (!this.verified || !this.token) throw new LocalTrainingError(401);
    await this.request('/api/programs/publish',{id});
  }
  async saveFileMaterial(kind:'png'|'pdf'|'mp4', body:{source_id?:string;topic_id:string;title:string;allow_preview:boolean;allow_download:boolean}, data:string) {
    if (!this.verified || !this.token) throw new LocalTrainingError(401);
    const path=kind==='png'?'/api/materials/image':kind==='pdf'?'/api/materials/pdf':'/api/materials/video';
    const {allow_preview,...common}=body;
    await this.request(path,{...common,...(kind==='pdf'?{pdf_base64:data}:kind==='png'?{image_base64:data,allow_preview}:{video_base64:data,allow_preview})});
  }
  async logout() {
    // Remove UI access immediately; revoke the server session when reachable.
    const token = this.token; this.clear();
    if (token && localTrainingEnabled()) {
      try {await fetch('/api/logout', {method:'POST', credentials:'omit', redirect:'error', cache:'no-store',
        headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`}, body:'{}'});} catch { /* Server expiry remains authoritative. */ }
    }
  }
}
