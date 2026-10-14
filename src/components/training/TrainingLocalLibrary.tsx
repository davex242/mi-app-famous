import TrainingLocalContentEditor from './TrainingLocalContentEditor';
import React,{useEffect,useRef,useState} from 'react';
import {LocalActor,LocalTrainingApi,LocalWorkspace,MaterialPreview,MaterialDownload,PublicRow} from './localTrainingApi';
const text=(row:PublicRow,key:string)=>typeof row[key]==='string'?row[key] as string:'';
const normalized=(value:string)=>value.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
function bytes(data:string){if(data.length>Math.ceil(2*1024*1024/3)*4)throw Error('Invalid material size');return Uint8Array.from(atob(data),char=>char.charCodeAt(0));}
function download(file:MaterialDownload){
  const formats:Record<string,[string|undefined,string]>={'image/png':[file.image_base64,'png'],'application/pdf':[file.pdf_base64,'pdf'],'video/mp4':[file.video_base64,'mp4']};
  let blob:Blob,extension:string;
  if(file.mime==='text/plain;charset=utf-8'&&typeof file.content==='string'){blob=new Blob([file.content],{type:file.mime});extension='txt';}
  else {const format=formats[file.mime];if(!format?.[0])throw Error('Invalid material');blob=new Blob([bytes(format[0])],{type:file.mime});extension=format[1];}
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`material-demo.${extension}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
type Props={api:LocalTrainingApi;workspace:LocalWorkspace;role:LocalActor['role'];refresh:()=>Promise<void>;notify:(message:string)=>void;busy:boolean;run:(operation:()=>Promise<void>)=>Promise<void>};
export default function TrainingLocalLibrary({api,workspace,role,refresh,notify,busy,run}:Props){
  const [search,setSearch]=useState(''),[topic,setTopic]=useState('');
  const [preview,setPreview]=useState<{data:MaterialPreview;workspace:LocalWorkspace;videoUrl?:string}|null>(null);
  const dialog=useRef<HTMLDialogElement>(null),video=useRef<HTMLVideoElement>(null);
  useEffect(()=>{setPreview(null);},[workspace]);
  useEffect(()=>{const url=preview?.videoUrl,element=video.current;return ()=>{if(element){element.pause();element.removeAttribute('src');element.load();}if(url)URL.revokeObjectURL(url);};},[preview]);
  useEffect(()=>{if(preview&&preview.workspace===workspace)dialog.current?.showModal();else dialog.current?.close();},[preview,workspace]);
  function close(){video.current?.pause();setPreview(null);}
  const visible=workspace.materials.filter(row=>(!topic||row.topic_id===topic)&&normalized(text(row,'title')).includes(normalized(search)));
  const data=preview?.workspace===workspace?preview.data:null;
  return <>
    <label>Buscar material local<input aria-label="Buscar material local" value={search} onChange={e=>setSearch(e.target.value)}/></label>
    <label>Tema del material local<select aria-label="Tema del material local" value={topic} onChange={e=>setTopic(e.target.value)}><option value="">Todos</option>{workspace.topics.map(row=><option key={row.id} value={row.id}>{text(row,'title')}</option>)}</select></label>
    {visible.map(row=><article className="td-panel td-local-material" key={row.id}><h3>{text(row,'title')}</h3><p>Revisión {String(row.revision)} · {text(row,'kind')} · {text(row,'status')}</p>
      <button disabled={busy||row.allow_preview!==true||text(row,'storage_path').endsWith('.pdf')} onClick={()=>void run(async()=>{
        const result=await api.previewMaterial(row.id!);
        if(result.type==='link'&&new URL(result.url).protocol!=='https:')throw Error('Invalid material link');
        const videoUrl=result.type==='video'?URL.createObjectURL(new Blob([bytes(result.video.data)],{type:'video/mp4'})):undefined;
        setPreview({data:result,workspace,videoUrl});
      })}>Vista previa de material</button>
      <button disabled={busy||row.allow_download!==true||row.kind==='link'} onClick={()=>void run(async()=>download(await api.downloadMaterial(row.id!)))}>Descargar material DEMO</button>
    </article>)}
    {!visible.length&&<p>Sin materiales para estos filtros.</p>}
    <dialog ref={dialog} aria-labelledby="tl-material-title" onCancel={close} onClose={close}><h3 id="tl-material-title">{data?.title??'Material DEMO'}</h3>
      {data?.type==='text'&&<pre>{data.content}</pre>}
      {data?.type==='link'&&<a href={data.url} target="_blank" rel="noopener noreferrer">Abrir enlace HTTPS del material</a>}
      {data?.type==='image'&&<img alt="Material de prueba" src={`data:image/png;base64,${data.image.data}`}/>}
      {data?.type==='video'&&<video ref={video} controls preload="none" src={preview?.videoUrl}/>}
      <button onClick={close}>Cerrar material</button>
    </dialog>
    {(role==='superadmin'||role==='subadmin')&&<TrainingLocalContentEditor api={api} workspace={workspace} busy={busy} run={run} refresh={refresh} notify={notify}/>}
  </>;
}
