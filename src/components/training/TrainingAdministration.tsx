import React, { useState } from 'react';
import {
  BookOpen,
  FolderOpen,
  CalendarRange,
  CheckSquare,
  BarChart3,
  GitBranch,
  Plus,
  Upload,
} from 'lucide-react';
import { DemoList, DemoNotice, DisabledAction, EmptyState, TabBar } from './shared';
import FinalQuizPlaceholder from './FinalQuizPlaceholder';

const TABS = [
  { id: 'topics', label: 'Topics' },
  { id: 'materials', label: 'Materials Library' },
  { id: 'program', label: 'Program & Agenda Builder' },
  { id: 'approvals', label: 'Approvals' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'versions', label: 'Version History' },
];

export default function TrainingAdministration() {
  const [tab, setTab] = useState('topics');

  return (
    <div className="space-y-4">
      <TabBar tabs={TABS} active={tab} onChange={setTab} />
      <DemoNotice />

      {tab === 'topics' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 justify-between items-center">
            <p className="text-sm text-gray-500">Dynamic topic catalog (editable by subadmin and superadmin).</p>
            <DisabledAction label="New topic" icon={Plus} />
          </div>
          <EmptyState icon={BookOpen} title="No topics yet" description="Topics you create will appear here once the training backend is connected." />
          <DemoList
            rows={[
              { title: 'Platform onboarding basics', meta: 'Category: Onboarding · ~30 min', status: 'Sample' },
              { title: 'Live room etiquette', meta: 'Category: Performance · ~45 min', status: 'Sample' },
            ]}
          />
        </div>
      )}

      {tab === 'materials' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 justify-between items-center">
            <p className="text-sm text-gray-500">Downloadable and previewable materials.</p>
            <DisabledAction label="Upload material" icon={Upload} />
          </div>
          <EmptyState icon={FolderOpen} title="Library is empty" description="No files are stored. Uploads are disabled until a private storage bucket is configured in a later stage." />
          <DemoList
            rows={[
              { title: 'Welcome guide.pdf', meta: 'Document · download + preview', status: 'Sample' },
              { title: 'Camera setup walkthrough', meta: 'Video · preview only', status: 'Sample' },
            ]}
          />
        </div>
      )}

      {tab === 'program' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 justify-between items-center">
            <p className="text-sm text-gray-500">Flexible 14-day initial program with an automatically generated, editable agenda.</p>
            <DisabledAction label="Publish version" icon={CalendarRange} />
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm font-medium text-gray-800 mb-3">14-day layout preview (DEMO)</p>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
              {Array.from({ length: 14 }, (_, i) => (
                <div key={i} className="aspect-square rounded-lg border border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center text-xs text-gray-400">
                  <span className="font-semibold text-gray-500">Day {i + 1}</span>
                  <span>empty</span>
                </div>
              ))}
            </div>
          </div>
          <FinalQuizPlaceholder />
        </div>
      )}

      {tab === 'approvals' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">Administrative validation of practical evidence and assessments.</p>
          <EmptyState icon={CheckSquare} title="Nothing to review" description="Pending evidence and approval requests will be listed here. No approval can be granted or rejected in this stage." />
          <DemoList
            rows={[{ title: 'Evidence: practice stream recording', meta: 'Submitted by a recruiter · awaiting review', status: 'Sample pending' }]}
          />
        </div>
      )}

      {tab === 'analytics' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {['Active trainees', 'Completion rate', 'Avg. attendance', 'Pending approvals'].map(label => (
              <div key={label} className="bg-white rounded-xl p-4 border border-gray-200">
                <p className="text-xs text-gray-500">{label}</p>
                <p className="text-2xl font-bold text-gray-300">—</p>
                <p className="text-[10px] text-gray-400">No data</p>
              </div>
            ))}
          </div>
          <EmptyState icon={BarChart3} title="No analytics yet" description="Metrics will be computed from real enrollments and attendance once they exist." />
        </div>
      )}

      {tab === 'versions' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">Program versions. Updates are optional for in-progress trainees and preserve their progress.</p>
          <EmptyState icon={GitBranch} title="No versions published" description="Version history appears here after the first program is published." />
          <DemoList rows={[{ title: 'Initial 14-day program · v1', meta: 'Draft layout · not published', status: 'Sample' }]} />
        </div>
      )}
    </div>
  );
}
