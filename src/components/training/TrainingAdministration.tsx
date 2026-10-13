import React from 'react';
import TrainingSandboxWorkspace from './TrainingSandboxWorkspace';
import {localTrainingEnabled} from './localTrainingApi';
import TrainingDemoWorkspace from './TrainingDemoWorkspace';

export default function TrainingAdministration() {
  if (localTrainingEnabled()) return <TrainingSandboxWorkspace />;
  return <TrainingDemoWorkspace mode="admin" />;
}
