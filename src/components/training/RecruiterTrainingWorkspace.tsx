import React from 'react';
import TrainingDemoWorkspace from './TrainingDemoWorkspace';

export default function RecruiterTrainingWorkspace({ readOnly = false }: { readOnly?: boolean }) {
  return <TrainingDemoWorkspace key={readOnly ? 'readonly' : 'recruiter'} mode={readOnly ? 'readonly' : 'recruiter'} />;
}
