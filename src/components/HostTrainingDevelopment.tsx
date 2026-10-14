import React from 'react';
import { GraduationCap, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import TrainingAdministration from './training/TrainingAdministration';
import RecruiterTrainingWorkspace from './training/RecruiterTrainingWorkspace';

/**
 * Host Training & Development — native React DEMO by default. Explicit localhost opt-in
 * selects a separate synthetic API session; no production client is imported.
 *
 * The workspace is chosen from the authenticated role and the *other* workspace
 * component is never mounted, so its content is not rendered for unauthorized roles
 * (not merely hidden). NOTE: auth in this app is client-side, so real enforcement
 * must come from the future verified server integration, not this DEMO.
 *
 *  - superadmin / subadmin -> Training Administration
 *  - edit                  -> Recruiter Training Workspace
 *  - readonly              -> Recruiter Training Workspace, read-only (no write actions)
 */
export default function HostTrainingDevelopment() {
  const { user } = useAuth();
  const role = user?.role;

  let title = 'Host Training & Development';
  let subtitle = '';
  let body: React.ReactNode;

  if (role === 'superadmin' || role === 'subadmin') {
    title = 'Training Administration';
    subtitle = 'Programas, prácticas y evaluación en una vista DEMO.';
    body = <TrainingAdministration defaultEmail={user?.email} />;
  } else if (role === 'edit') {
    title = 'Recruiter Training Workspace';
    subtitle = 'Tu agenda, tus emisores de ejemplo y su próximo paso.';
    body = <RecruiterTrainingWorkspace defaultEmail={user?.email} />;
  } else if (role === 'readonly') {
    title = 'Recruiter Training Workspace';
    subtitle = 'Consulta de solo lectura con datos ficticios.';
    body = <RecruiterTrainingWorkspace readOnly defaultEmail={user?.email} />;
  } else {
    body = (
      <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
        <ShieldAlert className="w-10 h-10 text-red-400 mx-auto mb-3" />
        <h3 className="font-semibold text-gray-900">Access restricted</h3>
        <p className="text-sm text-gray-500 mt-1">Your role does not have access to this module.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <div className="p-3 bg-blue-50 rounded-xl">
          <GraduationCap className="w-7 h-7 text-blue-500" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-500">Host Training &amp; Development</p>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          {subtitle && <p className="text-gray-500 mt-1">{subtitle}</p>}
        </div>
      </div>
      {body}
    </div>
  );
}

