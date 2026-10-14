import React from 'react';
import TrainingSandboxWorkspace from './TrainingSandboxWorkspace';
import {localTrainingEnabled} from './localTrainingApi';
import {hostedTrainingConfig} from './hostedTrainingConfig';
import TrainingDemoWorkspace from './TrainingDemoWorkspace';

export default function TrainingAdministration() {
  if (localTrainingEnabled()) return <TrainingSandboxWorkspace />;
  const hosted=hostedTrainingConfig();if(hosted)return <TrainingSandboxWorkspace hosted={hosted}/>;
  return <TrainingDemoWorkspace mode="admin" />;
}
