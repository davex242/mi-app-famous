import React,{useRef,useState} from 'react';
import {LocalTrainingApi,LocalWorkspace,PublicRow} from './localTrainingApi';
const text=(row:PublicRow,key:string)=>typeof row[key]==='string'?row[key] as string:'';
const MAX_BYTES=2*1024*1024;
const mime={png:'image/png',pdf:'application/pdf',mp4:'video/mp4'};
type Kind=keyof typeof mime;
const fileKind=(row:PublicRow):Kind=>row.kind==='video'?'mp4':row.kind==='image'?'png':'pdf';
async function encode(file:File){if(!file.size||file.size>MAX_BYTES)throw Error('Invalid file size');const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(binary);}
type Props={api:LocalTrainingApi;workspace:LocalWorkspace;busy:boolean;run:(operation:()=>Promise<void>)=>Promise<void>;refresh:()=>Promise<void>;notify:(message:string)=>void};
export default function TrainingLocalFileEditor({api,workspace,busy,run,refresh,notify}:Props){
  const [source,setSource]=useState(''),[snapshot,setSnapshot]=useState<LocalWorkspace|null>(null),[topicId,setTopicId]=useState(''),[title,setTitle]=useState(''),[kind,setKind]=useState<Kind>('png');
  const [file,setFile]=useState<File|null>(null),[consent,setConsent]=useState(false),[error,setError]=useState(''),[allowPreview,setAllowPreview]=useState(false),[allowDownload,setAllowDownload]=useState(false);
  const input=useRef<HTMLInputElement>(null);
  const latestFiles=workspace.materials.filter(row=>(row.kind==='image'||row.kind==='video'||(row.kind==='document'&&text(row,'storage_path').endsWith('.pdf')))&&!workspace.materials.some(other=>other.content_key===row.content_key&&Number(other.revision)>Number(row.revision)));
  const stale=!!source&&snapshot!==workspace;
  function clearFile(){setFile(null);setConsent(false);setError('');if(input.current)input.current.value='';}
  function reset(){setSource('');setSnapshot(null);setTopicId('');setTitle('');setKind('png');setAllowPreview(false);setAllowDownload(false);clearFile();}
  return <section className="td-panel" aria-label="Editor administrativo de archivos"><h3>Editor de archivos DEMO</h3><p>PNG, PDF estático o MP4 H.264, hasta 2 MiB. Solo archivos ficticios. Guardar crea un borrador; publica la revisión en el panel de borradores de contenido.</p>
    <form onSubmit={event=>{event.preventDefault();if(stale||!consent||(!file&&!source)||error)return;void run(async()=>{
      let data:string;
      if(file)data=await encode(file);else{const previous=await api.editMaterial(source),attachment=previous[kind==='png'?'image':kind==='pdf'?'pdf':'video'] as {data?:unknown}|undefined;if(typeof attachment?.data!=='string')throw Error('Private file unavailable');data=attachment.data;}
      await api.saveFileMaterial(kind,{...(source?{source_id:source}:{}),topic_id:topicId,title,allow_preview:kind!=='pdf'&&allowPreview,allow_download:allowDownload},data);reset();await refresh();notify('Borrador de archivo DEMO guardado. Las revisiones anteriores conservan su contenido.');
    });}}>
      <label>Revisión de archivo para editar<select aria-label="Revisión de archivo para editar" disabled={busy} value={source} onChange={e=>{const id=e.target.value;reset();if(!id)return;const row=latestFiles.find(row=>row.id===id);if(!row)return;setSource(id);setSnapshot(workspace);setTopicId(text(row,'topic_id'));setTitle(text(row,'title'));setKind(fileKind(row));setAllowPreview(row.allow_preview===true);setAllowDownload(row.allow_download===true);}}><option value="">Crear material de archivo nuevo</option>{latestFiles.map(row=><option key={row.id} value={row.id}>{text(row,'title')} · r{String(row.revision)} · {text(row,'status')}</option>)}</select></label>
      <label>Tipo de archivo<select aria-label="Tipo de archivo" disabled={busy||!!source} value={kind} onChange={e=>{setKind(e.target.value as Kind);setAllowPreview(false);clearFile();}}><option value="png">PNG</option><option value="pdf">PDF estático</option><option value="mp4">MP4 H.264</option></select></label>
      <label>Tema y revisión del archivo<select aria-label="Tema y revisión del archivo" required disabled={busy} value={topicId} onChange={e=>setTopicId(e.target.value)}><option value="">Selecciona una revisión exacta de tema</option>{workspace.topics.map(row=><option key={row.id} value={row.id}>{text(row,'title')} · r{String(row.revision)} · {text(row,'status')}</option>)}</select></label>
      <label>Título del archivo<input aria-label="Título del archivo" required maxLength={120} disabled={busy} value={title} onChange={e=>setTitle(e.target.value)}/></label>
      <label>Archivo de material DEMO<input aria-label="Archivo de material DEMO" ref={input} type="file" required={!source} accept={mime[kind]} disabled={busy} onChange={e=>{const value=e.target.files?.[0]??null;setConsent(false);setError('');setFile(null);if(value&&(!value.size||value.size>MAX_BYTES||value.type!==mime[kind])){setError('Selecciona un archivo del tipo elegido de hasta 2 MiB.');e.target.value='';return;}setFile(value);}}/></label>
      {source&&!file&&<p>Sin archivo nuevo se conserva una copia del contenido de la revisión seleccionada. El servidor vuelve a validarla al guardar.</p>}
      {kind!=='pdf'&&<label className="td-weekday"><input aria-label="Permitir vista previa del archivo" type="checkbox" disabled={busy} checked={allowPreview} onChange={e=>setAllowPreview(e.target.checked)}/>Permitir vista previa</label>}
      {kind==='pdf'&&<p>El PDF se descarga con permiso; no tiene vista previa dentro de esta pantalla.</p>}
      <label className="td-weekday"><input aria-label="Permitir descarga del archivo" type="checkbox" disabled={busy} checked={allowDownload} onChange={e=>setAllowDownload(e.target.checked)}/>Permitir descarga</label>
      <label className="td-weekday"><input aria-label="Confirmo archivo ficticio para material" type="checkbox" required disabled={busy||(!source&&!file)} checked={consent} onChange={e=>setConsent(e.target.checked)}/>Confirmo que el contenido es ficticio y autorizado para esta prueba local.</label>
      {error&&<p role="alert">{error}</p>}{stale&&<p>El catálogo cambió. Vuelve a cargar la revisión antes de guardar.</p>}
      <button disabled={busy||stale||!!error||!topicId||!title.trim()||!consent||(!file&&!source)}>Guardar borrador de archivo DEMO</button>
    </form>
  </section>;
}
