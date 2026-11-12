import React from 'react';
import {
  Sparkles,
  ArrowLeft,
  Clock,
  Layers,
  CheckCircle2,
  Bell,
  HelpCircle,
  FileCode,
  ShieldCheck,
} from 'lucide-react';

import { NavTab } from './Sidebar';

interface Props {
  title: string;
  category?: string;
  description?: string;
  isQuickAction?: boolean;
  onBackToDashboard?: () => void;
  onNavigateToModule?: (tab: NavTab) => void;
}

export const ModuleComingSoon: React.FC<Props> = ({
  title,
  category = 'Enterprise Suite',
  description,
  isQuickAction = false,
  onBackToDashboard,
  onNavigateToModule,
}) => {
  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-4 sm:p-8 bg-slate-50/50 dark:bg-slate-950/40 select-none">
      <div className="max-w-4xl mx-auto w-full my-auto py-6 sm:py-12 animate-fade-in">
        {/* Breadcrumb / Category Tag */}
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold tracking-wider uppercase px-2.5 py-1 rounded-full bg-teal-100/80 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 border border-teal-300/60 dark:border-teal-800/60">
              {category}
            </span>
            <span className="text-slate-400 text-xs">•</span>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Enterprise Roadmap Module
            </span>
          </div>

          {onBackToDashboard && (
            <button
              onClick={onBackToDashboard}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-2xs hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors cursor-pointer"
            >
              <ArrowLeft size={13} />
              <span>Back to Dashboard</span>
            </button>
          )}
        </div>

        {/* Hero Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-6 sm:p-10 relative overflow-hidden">
          {/* Subtle Accent Glow */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-teal-500/10 dark:bg-teal-500/5 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10">
            <div className="flex items-start justify-between gap-4">
              <div className="w-14 h-14 rounded-2xl bg-teal-600/10 dark:bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-700 dark:text-teal-400 shadow-inner">
                <Sparkles size={28} />
              </div>

              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-300/60 dark:border-amber-800/60">
                <Clock size={12} className="animate-spin-slow" />
                <span>Scheduled for Release v2.5</span>
              </div>
            </div>

            <div className="mt-6">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                {title}
              </h1>
              <p className="mt-2.5 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
                {description ||
                  `The ${title} module is currently scheduled for deployment as part of the unified Enterprise Resource Planning (ERP) workflow. Backend schemas and API contracts are finalized.`}
              </p>
            </div>

            {isQuickAction && (
              <div className="mt-6 p-4 rounded-xl bg-teal-50/80 dark:bg-teal-950/40 border border-teal-200/80 dark:border-teal-800/60 text-xs text-teal-900 dark:text-teal-200 flex items-start gap-3">
                <ShieldCheck size={18} className="text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Quick Create Action Triggered:</span>
                  <p className="mt-0.5 text-teal-800 dark:text-teal-300">
                    You clicked the quick-create action (<span className="font-mono font-bold">[+]</span>) for {title}. Quick entry forms and direct validation will activate immediately once this module is unlocked.
                  </p>
                </div>
              </div>
            )}

            {/* Feature Checklist */}
            <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800/80">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-4">
                Architecture & Readiness Checklist
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="flex items-center gap-2.5 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 text-slate-700 dark:text-slate-300">
                  <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                  <span>PostgreSQL Table Schema & Constraints Defined</span>
                </div>
                <div className="flex items-center gap-2.5 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 text-slate-700 dark:text-slate-300">
                  <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                  <span>Role-Based Permissions & Clearance Configured</span>
                </div>
                <div className="flex items-center gap-2.5 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 text-slate-700 dark:text-slate-300">
                  <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                  <span>WebSocket Real-Time Notification Event Hooks Ready</span>
                </div>
                <div className="flex items-center gap-2.5 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 text-slate-700 dark:text-slate-300">
                  <Clock size={16} className="text-amber-500 shrink-0" />
                  <span>Frontend React Data Table & Form Validation in Progress</span>
                </div>
              </div>
            </div>

            {/* Suggested Alternative Active Modules */}
            <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <HelpCircle size={14} />
                <span>Need to perform operations right now? Use the active modules below:</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {onNavigateToModule && (
                  <>
                    <button
                      onClick={() => onNavigateToModule('quotations')}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/50 dark:hover:bg-teal-900/60 text-teal-800 dark:text-teal-200 border border-teal-200 dark:border-teal-800 transition-colors cursor-pointer"
                    >
                      Quotations
                    </button>
                    <button
                      onClick={() => onNavigateToModule('customers')}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/50 dark:hover:bg-teal-900/60 text-teal-800 dark:text-teal-200 border border-teal-200 dark:border-teal-800 transition-colors cursor-pointer"
                    >
                      Customers
                    </button>
                    <button
                      onClick={() => onNavigateToModule('payments')}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/50 dark:hover:bg-teal-900/60 text-teal-800 dark:text-teal-200 border border-teal-200 dark:border-teal-800 transition-colors cursor-pointer"
                    >
                      Payments
                    </button>
                    <button
                      onClick={() => onNavigateToModule('dispatch-all-closed')}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/50 dark:hover:bg-teal-900/60 text-teal-800 dark:text-teal-200 border border-teal-200 dark:border-teal-800 transition-colors cursor-pointer"
                    >
                      Dispatch Hub
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
