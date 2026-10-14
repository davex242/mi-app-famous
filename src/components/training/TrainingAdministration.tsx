import React from 'react';
import {useAuth} from '@/context/AuthContext';
import {sharedTrainingApi} from './sharedTrainingSession';
import TrainingSandboxWorkspace from './TrainingSandboxWorkspace';
import {localTrainingEnabled} from './localTrainingApi';
import {hostedTrainingConfig} from './hostedTrainingConfig';
import TrainingDemoWorkspace from './TrainingDemoWorkspace';

export default function TrainingAdministration({defaultEmail}: {defaultEmail?:string} = {}) {
  const auth=useAuth() as ReturnType<typeof useAuth>&{logout?:()=>void};
  if (localTrainingEnabled()) return <TrainingSandboxWorkspace />;
  const hosted=hostedTrainingConfig();if(hosted)return <TrainingSandboxWorkspace hosted={hosted} defaultEmail={defaultEmail} sharedApi={sharedTrainingApi(hosted,auth.user?.email)} onLogout={auth.logout}/>;
  return <TrainingDemoWorkspace mode="admin" />;
}
