import React,{useState} from 'react';
import {AcceptedCoursePreview,LocalTrainingApi,LocalWorkspace} from './localTrainingApi';
type Props={api:LocalTrainingApi;workspace:LocalWorkspace;busy:boolean;run:(operation:()=>Promise<void>)=>Promise<void>;refresh:()=>Promise<void>;notify:(message:string)=>void};
export default function TrainingLocalCatalogueImport({api,workspace,busy,run,refresh,notify}:Props){
 const [preview,setPreview]=useState<{data:AcceptedCoursePreview;workspace:LocalWorkspace}|null>(null),[confirmed,setConfirmed]=useState(false);
 const current=preview?.workspace===workspace?preview.data:null;
 return <section className="td-panel" aria-label="Carga del catálogo inicial"><h3>Preparar catálogo inicial · Prueba local</h3>
   <p>El contenido aceptado se cargará como temas, guías de texto y un programa en borrador. Las inscripciones actuales conservan su programa. El banco privado del quiz se prepara por separado.</p>
   <button disabled={busy} onClick={()=>void run(async()=>{setConfirmed(false);setPreview({data:await api.previewAcceptedCourse(),workspace});})}>Revisar carga del catálogo inicial</button>
   {current&&<article aria-label="Resumen de carga del catálogo"><h4>{current.title}</h4><p>{current.topics} temas · {current.materials} guías de texto · {current.practices} prácticas · {current.duration_days} días flexibles.</p><p>Las guías tendrán vista previa y descarga permitidas; sus revisiones quedan fijadas al programa. Todas las prácticas requieren evidencia y evaluación.</p><p>Quiz: {current.policy.pass_percent} % · {current.policy.initial_attempts} intentos iniciales · extras preaprobados · invitaciones de {current.policy.invitation_hours} horas.</p>
    {current.state==='ready'&&<><label className="td-weekday"><input aria-label="Confirmo cargar catálogo como borradores" type="checkbox" checked={confirmed} disabled={busy} onChange={event=>setConfirmed(event.target.checked)}/>Confirmo crear 14 temas, 14 materiales y un programa como borradores locales.</label>
      <button disabled={busy||!confirmed} onClick={()=>void run(async()=>{if(!current||!confirmed)return;setConfirmed(false);const result=await api.loadAcceptedCourse(current.source_hash);setPreview(null);await refresh();notify(result.already_loaded?'El catálogo ya estaba cargado; no se duplicó ningún registro.':'Catálogo inicial cargado: 14 temas, 14 materiales y un programa en borrador. Publicar requiere acciones separadas.');})}>Cargar catálogo inicial en borrador</button></>}
    {current.state==='already_loaded'&&<p>Este catálogo ya está cargado. Puedes revisar sus revisiones en los editores de Biblioteca y Programas. Volver a cargar no duplica ni reemplaza revisiones.</p>}
    {current.state==='conflict'&&<p>El catálogo existente no coincide con esta fuente. Revisa sus versiones antes de intentar cargarlo.</p>}
   </article>}
   {preview&&!current&&<p>Los datos cambiaron. Revisa nuevamente la carga antes de confirmarla.</p>}
   <p>La carga no publica temas, materiales o programas, no crea exámenes y no asigna emisores. Para publicar, primero revisa los temas, después los materiales y finalmente el programa.</p>
 </section>;
}
