import React,{useState} from 'react';
import {trainingContentProposal as proposal} from './trainingStudyProposal';
export default function TrainingContentProposal(){
  const [day,setDay]=useState(1);
  const unit=proposal.units.find(row=>row.day===day)!;
  function download(){
    const sections=['BORRADOR PARA REVISIÓN · No publicado ni asignado',proposal.title,'Duración inicial flexible: 14 días. Los tiempos y criterios son propuestas editables.',`Reglas confirmadas del quiz: aprobación desde ${proposal.pass_percent} %; ${proposal.max_attempts} intentos iniciales; intentos adicionales únicamente con aprobación previa.`,...proposal.units.flatMap(row=>['',`Día ${row.day}: ${row.title}`,`Tiempo propuesto: ${row.estimated_minutes} minutos`,row.objective,'Guía:',...row.guide.map(line=>'- '+line),'Práctica:',...row.practice.map((line,index)=>`${index+1}. ${line}`),'Evidencia: '+row.evidence,'Criterios propuestos:',...row.review_criteria.map(line=>'- '+line)]),'','DECISIONES PENDIENTES',...proposal.agency_decisions.map(line=>'- '+line),'Las preguntas y respuestas del banco privado no se incluyen en esta guía.'];
    const url=URL.createObjectURL(new Blob([sections.join('\n')],{type:'text/plain;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download='capacitacion-propuesta-14-dias.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <section className="td-panel td-content-proposal" aria-label="Propuesta de contenido de capacitación">
    <h3>Propuesta de capacitación · Borrador</h3><p>14 días flexibles, con guía, práctica, evidencia y criterios de revisión por tema. El contenido y los tiempos se proponen para revisión; no son reglas oficiales de MICO ni garantizan resultados.</p>
    <details><summary>Revisar propuesta de capacitación</summary>
      <label>Día de propuesta<select aria-label="Día de propuesta" value={day} onChange={event=>setDay(Number(event.target.value))}>{proposal.units.map(row=><option key={row.key} value={row.day}>Día {row.day} · {row.title}</option>)}</select></label>
      <article aria-label={`Propuesta del día ${unit.day}`}><h3>Día {unit.day} · {unit.title}</h3><p>{unit.objective}</p><p>Tiempo propuesto: {unit.estimated_minutes} minutos · Evidencia y evaluación obligatorias.</p>
        <h4>Guía de estudio</h4><ul>{unit.guide.map(line=><li key={line}>{line}</li>)}</ul>
        <h4>Práctica propuesta</h4><ol>{unit.practice.map(line=><li key={line}>{line}</li>)}</ol>
        <h4>Evidencia propuesta</h4><p>{unit.evidence}</p>
        <h4>Criterios de revisión propuestos</h4><ul>{unit.review_criteria.map(line=><li key={line}>{line}</li>)}</ul>
      </article>
      <h4>Reglas confirmadas del quiz</h4><p>Aprobación desde {proposal.pass_percent} % · {proposal.max_attempts} intentos iniciales. Los intentos adicionales requieren aprobación previa.</p><p>Con 50 preguntas de igual valor se necesitan 38 respuestas correctas para alcanzar el umbral. La solicitud y preaprobación de intentos adicionales están disponibles en la prueba local, con control del servidor.</p>
      <h4>Decisiones de la agencia pendientes</h4><ul>{proposal.agency_decisions.map(line=><li key={line}>{line}</li>)}</ul>
      <p>Banco de 50 preguntas preparado por separado para revisión privada. Esta guía no contiene preguntas ni respuestas del examen. El vencimiento de las invitaciones sigue pendiente de definición.</p>
      <button type="button" onClick={download}>Descargar guía propuesta de 14 días</button>
      <p>Consultar o descargar este borrador no publica contenido ni cambia programas, inscripciones o resultados.</p>
    </details>
  </section>;
}
