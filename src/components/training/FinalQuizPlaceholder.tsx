import React from 'react';
import { ClipboardCheck, Link2Off } from 'lucide-react';
import { DemoBadge } from './shared';

/**
 * Visual placeholder for the future Final Quiz (50 questions).
 * No real exam is published, no questions or correct answers exist here,
 * and no public link is generated.
 */
export default function FinalQuizPlaceholder() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-start gap-3">
        <div className="p-3 bg-indigo-50 rounded-lg">
          <ClipboardCheck className="w-6 h-6 text-indigo-500" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-semibold text-gray-900">Final Quiz (50 questions)</h4>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700">FUTURE FEATURE</span>
            <DemoBadge />
          </div>
          <p className="text-sm text-gray-500 mt-1">
            A public-link quiz whose results will be linked to the host's profile. No exam is published and no
            question bank exists yet.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
        {[
          ['Questions', '50 (planned)'],
          ['Public link', 'Not generated'],
          ['Results', 'Not recorded'],
        ].map(([label, value]) => (
          <div key={label} className="p-3 rounded-lg bg-gray-50 border border-gray-100">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="text-sm font-medium text-gray-700">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs text-gray-500">
        <Link2Off className="w-4 h-4" />
        Answer keys will be kept server-side only and will never be shown on this screen.
      </div>
    </div>
  );
}
