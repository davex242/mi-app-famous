/** Synthetic interface fixtures only. Never derive these records from live hosts or users. */
export const DEMO_TRAINEES = [
  { id: 'demo-trainee-1', name: 'Emisor DEMO 1', program: 'DEMO · Bienvenida y networking', version: 1, total: 14, completed: 5, status: 'active', timezone: 'America/Costa_Rica', quiz: null as number | null },
  { id: 'demo-trainee-2', name: 'Emisor DEMO 2', program: 'DEMO · Prácticas de transmisión', version: 1, total: 3, completed: 3, status: 'active', timezone: 'America/Bogota', quiz: 86 as number | null },
  { id: 'demo-trainee-3', name: 'Emisor DEMO 3', program: 'DEMO · Bienvenida y networking', version: 1, total: 14, completed: 2, status: 'paused', timezone: 'America/Costa_Rica', quiz: null as number | null },
];
export const DEMO_PROGRAMS = [
  { id: 'demo-program-1', title: 'DEMO · Bienvenida y networking', version: 1, days: 14, status: 'published', note: 'Presentación, práctica de sala y crecimiento respetuoso de la red.' },
  { id: 'demo-program-2', title: 'DEMO · Prácticas de transmisión', version: 1, days: 3, status: 'published', note: 'Preparación, transmisión supervisada y revisión de resultados.' },
  { id: 'demo-program-3', title: 'DEMO · Bienvenida y networking', version: 2, days: 14, status: 'draft', note: 'Ejemplo de una nueva versión. No modifica las inscripciones anteriores.' },
];
export const DEMO_SESSIONS = [
  { id: 'demo-session-1', traineeId: 'demo-trainee-1', topic: 'DEMO · Presentación y objetivos', at: '2026-10-25T01:00:00Z', minutes: 30, status: 'scheduled', attendance: '' },
  { id: 'demo-session-2', traineeId: 'demo-trainee-1', topic: 'DEMO · Networking respetuoso', at: '2026-10-26T01:00:00Z', minutes: 30, status: 'rescheduled', attendance: '' },
  { id: 'demo-session-3', traineeId: 'demo-trainee-2', topic: 'DEMO · Transmisión supervisada', at: '2026-10-12T01:00:00Z', minutes: 45, status: 'completed', attendance: 'Presente' },
  { id: 'demo-session-4', traineeId: 'demo-trainee-3', topic: 'DEMO · Objetivos personales', at: '2026-10-11T01:00:00Z', minutes: 30, status: 'completed', attendance: 'Tarde' },
];
export const DEMO_EVIDENCE = [
  { id: 'demo-evidence-1', traineeId: 'demo-trainee-1', topic: 'DEMO · Presentación del emisor', description: 'Se practicó la bienvenida y la explicación de los objetivos de la sala.', status: 'pending', format: 'PNG', notes: '', at: '2026-10-13T18:00:00Z' },
  { id: 'demo-evidence-2', traineeId: 'demo-trainee-2', topic: 'DEMO · Transmisión supervisada', description: 'El emisor mantuvo una conversación respetuosa y explicó su plan de mejora.', status: 'approved', format: 'MP4', notes: 'DEMO · Práctica revisada y evaluación satisfactoria.', at: '2026-10-12T18:00:00Z' },
  { id: 'demo-evidence-3', traineeId: 'demo-trainee-1', topic: 'DEMO · Preparación de sala', description: 'Primera revisión del plan de transmisión.', status: 'rejected', format: 'PDF', notes: 'DEMO · Añadir un objetivo concreto y volver a presentar la práctica.', at: '2026-10-11T18:00:00Z' },
];
export const DEMO_MATERIALS = [
  { id: 'demo-material-1', title: 'DEMO · Guía de bienvenida', topic: 'Presentación y objetivos', format: 'TXT', content: 'CONTENIDO DEMO\n\n1. Presenta tu sala y explica tu objetivo.\n2. Escucha y saluda de forma respetuosa.\n3. Revisa con tu reclutador lo aprendido.\n\nEste documento es un ejemplo; no es material oficial de la agencia.' },
  { id: 'demo-material-2', title: 'DEMO · Lista de preparación', topic: 'Preparación de sala', format: 'TXT', content: 'CONTENIDO DEMO\n\nAntes de transmitir: revisa audio, iluminación y conexión.\nDurante la práctica: registra lo que funcionó y qué necesitas mejorar.\n\nEsta lista es únicamente un ejemplo de interfaz.' },
];
