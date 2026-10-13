import React, { useState } from 'react';
import { Users, CalendarDays, Library, Sparkles, History, RefreshCw, UserPlus } from 'lucide-react';
import { DemoList, DemoNotice, DisabledAction, EmptyState, ReadOnlyNotice, TabBar } from './shared';
import FinalQuizPlaceholder from './FinalQuizPlaceholder';

const TABS = [
  { id: 'trainees', label: 'My Trainees' },
  { id: 'agenda', label: 'My Agenda' },
  { id: 'library', label: 'Training Library' },
  { id: 'free', label: 'Free Training' },
  { id: 'history', label: 'Training History' },
  { id: 'updates', label: 'Program Updates' },
];

export default function RecruiterTrainingWorkspace({ readOnly = false }: { readOnly?: boolean }) {
  const [tab, setTab] = useState('trainees');

  return (
    <div className="space-y-4">
      {readOnly && <ReadOnlyNotice />}
      <TabBar tabs={TABS} active={tab} onChange={setTab} />
      <DemoNotice />

      {tab === 'trainees' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 justify-between items-center">
            <p className="text-sm text-gray-500">Hosts you are training.</p>
            {!readOnly && <DisabledAction label="Enroll trainee" icon={UserPlus} />}
          </div>
          <EmptyState icon={Users} title="No trainees enrolled" description="Enrolled hosts and their progress will appear here. Enrollment is not available yet." />
          <DemoList rows={[{ title: 'Sample Trainee A', meta: 'Day 3 of 14 · 21% progress', status: 'Sample' }]} />
        </div>
      )}

      {tab === 'agenda' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">Automatically generated, editable agenda (coming later).</p>
          <EmptyState icon={CalendarDays} title="No sessions scheduled" description="Your generated agenda will be listed here." />
          <DemoList rows={[{ title: 'Day 1 · Platform onboarding basics', meta: 'Sample session · 30 min', status: 'Sample scheduled' }]} />
        </div>
      )}

      {tab === 'library' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">Published topics and materials for download and preview.</p>
          <EmptyState icon={Library} title="Library is empty" description="Published materials will be available here." />
          <DemoList rows={[{ title: 'Welcome guide.pdf', meta: 'Document · download + preview', status: 'Sample' }]} />
        </div>
      )}

      {tab === 'free' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">Free (unscheduled) trainings outside the 14-day program.</p>
          <EmptyState icon={Sparkles} title="No free trainings" description="Free trainings you register will be listed here. Nothing can be registered yet." />
          <FinalQuizPlaceholder />
        </div>
      )}

      {tab === 'history' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">Completed sessions, evidence and assessments.</p>
          <EmptyState icon={History} title="No history yet" description="Attendance, evidence and assessment records will show here." />
        </div>
      )}

      {tab === 'updates' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">Optional program updates. Applying one will preserve existing progress.</p>
          <EmptyState icon={RefreshCw} title="No updates available" description="You'll be notified here when a new program version is published." />
        </div>
      )}
    </div>
  );
}
