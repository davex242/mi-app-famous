import React from 'react';
import { FlaskConical, Info, Lock } from 'lucide-react';

export function DemoBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide bg-amber-100 text-amber-800 border border-amber-300 ${className}`}
    >
      <FlaskConical className="w-3 h-3" />
      DEMO
    </span>
  );
}

export function DemoNotice({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
      <Info className="w-4 h-4 mt-0.5 shrink-0" />
      <p>
        {children ?? 'Sample content marked DEMO. Nothing on this screen is saved: the training backend is not connected yet.'}
      </p>
    </div>
  );
}

export function ReadOnlyNotice() {
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-700">
      <Lock className="w-4 h-4 mt-0.5 shrink-0" />
      <p>Read-only view. Your role cannot create, edit or submit anything in this module.</p>
    </div>
  );
}

interface EmptyStateProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}

export function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  return (
    <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center bg-white">
      <Icon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
      <h4 className="font-semibold text-gray-800">{title}</h4>
      <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">{description}</p>
    </div>
  );
}

export interface DemoRow {
  title: string;
  meta: string;
  status: string;
}

/** Shows a clearly-labelled DEMO list. Items are static samples, never persisted. */
export function DemoList({ rows }: { rows: DemoRow[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
      {rows.map(row => (
        <div key={row.title} className="p-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium text-gray-900 truncate">{row.title}</p>
              <DemoBadge />
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{row.meta}</p>
          </div>
          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 w-fit">
            {row.status}
          </span>
        </div>
      ))}
    </div>
  );
}

export interface TabDef {
  id: string;
  label: string;
}

/** Simple responsive tab bar (scrolls horizontally on small screens). */
export function TabBar({ tabs, active, onChange }: { tabs: TabDef[]; active: string; onChange: (id: string) => void }) {
  return (
    <div className="border-b border-gray-200 overflow-x-auto">
      <div className="flex gap-1 min-w-max" role="tablist">
        {tabs.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active === tab.id}
            onClick={() => onChange(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              active === tab.id
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Disabled action button for features that do not exist yet. Never performs an action. */
export function DisabledAction({ label, icon: Icon }: { label: string; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <button
      type="button"
      disabled
      title="Not available yet — backend not connected"
      className="px-3 py-2 rounded-lg text-sm bg-gray-100 text-gray-400 cursor-not-allowed inline-flex items-center gap-2"
    >
      {Icon && <Icon className="w-4 h-4" />}
      {label}
      <span className="text-[10px] uppercase tracking-wide">Soon</span>
    </button>
  );
}
