import React,{useState} from 'react';
import {LocalTrainingApi,LocalWorkspace,PublicRow} from './localTrainingApi';
const text=(row:PublicRow,key:string)=>typeof row[key]==='string'?row[key] as string:'';
const latest=(rows:PublicRow[])=>rows.filter(row=>!rows.some(other=>other.content_key===row.content_key&&Number(other.revision)>Number(row.revision)));
type Props={api:LocalTrainingApi;workspace:LocalWorkspace;busy:boolean;run:(operation:()=>Promise<void>)=>Promise<void>;refresh:()=>Promise<void>;notify:(message:string)=>void};
export default function TrainingLocalContentEditor({api,workspace,busy,run,refresh,notify}:Props){
  const [topicSource,setTopicSource]=useState(''),[title,setTitle]=useState(''),[description,setDescription]=useState(''),[category,setCategory]=useState(''),[minutes,setMinutes]=useState('');
  const [materialSource,setMaterialSource]=useState(''),[topicId,setTopicId]=useState(''),[materialTitle,setMaterialTitle]=useState(''),[kind,setKind]=useState<'document'|'link'>('document'),[content,setContent]=useState(''),[url,setUrl]=useState('');
  const [previewAllowed,setPreviewAllowed]=useState(false),[downloadAllowed,setDownloadAllowed]=useState(false);
  const [topicSnapshot,setTopicSnapshot]=useState<LocalWorkspace|null>(null),[materialSnapshot,setMaterialSnapshot]=useState<LocalWorkspace|null>(null);
  const [publication,setPublication]=useState<{id:string;type:'topic'|'material';workspace:LocalWorkspace}|null>(null);
  const topics=latest(workspace.topics),materials=latest(workspace.materials).filter(row=>row.kind==='link'||(row.kind==='document'&&!text(row,'storage_path').endsWith('.pdf')));
  const durationValid=minutes!==''&&Number.isInteger(Number(minutes))&&Number(minutes)>=1&&Number(minutes)<=480;
  const topicStale=!!topicSource&&topicSnapshot!==workspace,materialStale=!!materialSource&&materialSnapshot!==workspace;
  function resetMaterial(){setMaterialSource('');setTopicId('');setMaterialTitle('');setKind('document');setContent('');setUrl('');setPreviewAllowed(false);setDownloadAllowed(false);setMaterialSnapshot(null);}
  return <section aria-label="Administración de contenido"><h3>Crear y revisar contenido DEMO</h3><p>Guardar crea un borrador nuevo. Editar crea otra revisión; el contenido publicado y los programas que lo usan conservan sus referencias.</p>
    <form className="td-panel" onSubmit={event=>{event.preventDefault();if(!durationValid||topicStale)return;void run(async()=>{
      await api.saveTopic({...(topicSource?{source_id:topicSource}:{}),title,description,category,estimated_minutes:Number(minutes)});setTopicSource('');setTitle('');setDescription('');setCategory('');setMinutes('');setTopicSnapshot(null);await refresh();notify('Borrador de tema DEMO guardado. Publicarlo requiere otra acción.');
    });}}><h4>Editor de temas</h4>
      <label>Revisión de tema para editar<select aria-label="Revisión de tema para editar" disabled={busy} value={topicSource} onChange={e=>{const id=e.target.value,row=workspace.topics.find(row=>row.id===id);setTopicSource(id);setTitle(row?text(row,'title'):'');setDescription(row?text(row,'description'):'');setCategory(row?text(row,'category'):'');setMinutes(row?String(row.estimated_minutes):'');setTopicSnapshot(row?workspace:null);}}><option value="">Crear tema nuevo</option>{topics.map(row=><option key={row.id} value={row.id}>{text(row,'title')} · r{String(row.revision)} · {text(row,'status')}</option>)}</select></label>
      <label>Título del tema<input aria-label="Título del tema" required maxLength={120} disabled={busy} value={title} onChange={e=>setTitle(e.target.value)}/></label>
      <label>Descripción del tema<textarea aria-label="Descripción del tema" maxLength={2000} disabled={busy} value={description} onChange={e=>setDescription(e.target.value)}/></label>
      <label>Categoría del tema<input aria-label="Categoría del tema" required maxLength={100} disabled={busy} value={category} onChange={e=>setCategory(e.target.value)}/></label>
      <label>Duración estimada en minutos<input aria-label="Duración estimada en minutos" type="number" required min="1" max="480" step="1" disabled={busy} value={minutes} onChange={e=>setMinutes(e.target.value)}/></label>
      {topicStale&&<p>El catálogo cambió. Vuelve a seleccionar la revisión antes de guardar.</p>}
      <button disabled={busy||topicStale||!title.trim()||!category.trim()||!durationValid}>Guardar borrador de tema DEMO</button>
    </form>
    <form className="td-panel" onSubmit={event=>{event.preventDefault();if(materialStale)return;void run(async()=>{
      await api.saveTextMaterial({...(materialSource?{source_id:materialSource}:{}),topic_id:topicId,title:materialTitle,kind,allow_preview:previewAllowed,allow_download:kind==='document'&&downloadAllowed,...(kind==='document'?{content}:{external_url:url})});resetMaterial();await refresh();notify('Borrador de material DEMO guardado. No se publicó automáticamente.');
    });}}><h4>Editor de texto y enlaces HTTPS</h4>
      <label>Revisión de material para editar<select aria-label="Revisión de material para editar" disabled={busy} value={materialSource} onChange={e=>{const id=e.target.value;resetMaterial();setMaterialSource(id);if(!id)return;void run(async()=>{const row=await api.editMaterial(id);setTopicId(text(row,'topic_id'));setMaterialTitle(text(row,'title'));setKind(row.kind==='link'?'link':'document');setContent(text(row,'content'));setUrl(text(row,'external_url'));setPreviewAllowed(row.allow_preview===true);setDownloadAllowed(row.allow_download===true);setMaterialSnapshot(workspace);});}}><option value="">Crear material nuevo</option>{materials.map(row=><option key={row.id} value={row.id}>{text(row,'title')} · r{String(row.revision)} · {text(row,'status')}</option>)}</select></label>
      <label>Tema y revisión del material<select aria-label="Tema y revisión del material" required disabled={busy} value={topicId} onChange={e=>setTopicId(e.target.value)}><option value="">Selecciona una revisión de tema</option>{workspace.topics.map(row=><option key={row.id} value={row.id}>{text(row,'title')} · r{String(row.revision)} · {text(row,'status')}</option>)}</select></label>
      <label>Título del material<input aria-label="Título del material" required maxLength={120} disabled={busy} value={materialTitle} onChange={e=>setMaterialTitle(e.target.value)}/></label>
      <label>Tipo de contenido<select aria-label="Tipo de contenido" disabled={busy} value={kind} onChange={e=>{setKind(e.target.value as 'document'|'link');setContent('');setUrl('');setDownloadAllowed(false);}}><option value="document">Texto</option><option value="link">Enlace HTTPS</option></select></label>
      {kind==='document'?<label>Contenido de texto<textarea aria-label="Contenido de texto" required maxLength={20000} disabled={busy} value={content} onChange={e=>setContent(e.target.value)}/></label>:<label>URL HTTPS<input aria-label="URL HTTPS" type="url" required pattern="https://.*" maxLength={2000} disabled={busy} value={url} onChange={e=>setUrl(e.target.value)}/></label>}
      <label className="td-weekday"><input aria-label="Permitir vista previa del material" type="checkbox" disabled={busy} checked={previewAllowed} onChange={e=>setPreviewAllowed(e.target.checked)}/>Permitir vista previa</label>
      {kind==='document'&&<label className="td-weekday"><input aria-label="Permitir descarga del material" type="checkbox" disabled={busy} checked={downloadAllowed} onChange={e=>setDownloadAllowed(e.target.checked)}/>Permitir descarga de texto</label>}
      {materialStale&&<p>El catálogo cambió. Vuelve a cargar la revisión antes de guardar.</p>}
      <button disabled={busy||materialStale||!topicId||!materialTitle.trim()||(kind==='document'?!content.trim():!url.startsWith('https://'))}>Guardar borrador de material DEMO</button>
    </form>
    <h4>Publicación separada de borradores</h4>
    {(['topic','material'] as const).flatMap(type=>latest(type==='topic'?workspace.topics:workspace.materials).filter(row=>row.status==='draft').map(row=><article className="td-panel td-local-draft" key={row.id}><p>{type==='topic'?'Tema':'Material'}: {text(row,'title')} · r{String(row.revision)}</p>
      <label className="td-weekday"><input aria-label={`Confirmo publicar ${text(row,'title')}`} type="checkbox" checked={publication?.id===row.id&&publication?.workspace===workspace} disabled={busy} onChange={e=>setPublication(e.target.checked?{id:row.id!,type,workspace}:null)}/>Confirmo publicar esta revisión DEMO.</label>
      <button disabled={busy||publication?.id!==row.id||publication?.workspace!==workspace} onClick={()=>void run(async()=>{setPublication(null);if(type==='topic')await api.publishTopic(row.id!);else await api.publishMaterial(row.id!);await refresh();notify('Revisión DEMO publicada. Las referencias anteriores siguen conservadas.');})}>Publicar revisión DEMO</button>
    </article>))}
  </section>;
}
