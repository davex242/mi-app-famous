import React from 'react';
import TrainingSandboxWorkspace from './TrainingSandboxWorkspace';
import {localTrainingEnabled} from './localTrainingApi';
import TrainingDemoWorkspace from './TrainingDemoWorkspace';

export default function RecruiterTrainingWorkspace({ readOnly = false }: { readOnly?: boolean }) {
  if (localTrainingEnabled()) return <TrainingSandboxWorkspace />;
  return <TrainingDemoWorkspace key={readOnly ? 'readonly' : 'recruiter'} mode={readOnly ? 'readonly' : 'recruiter'} />;
}
