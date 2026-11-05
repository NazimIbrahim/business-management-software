import React from 'react';
import {
  ClipboardCheck,
  CreditCard,
  PackageCheck,
  Truck,
  Warehouse,
  Factory,
  Package,
  Check,
  CheckCircle2,
} from 'lucide-react';

export const VALID_PROCUREMENT_STATUSES = [
  'Availability Confirmed',
  'Payment Done',
  'Dispatched',
  'On the Way',
  'Reached to Godown',
] as const;

export type ProcurementStatusType = (typeof VALID_PROCUREMENT_STATUSES)[number];

export const PROCUREMENT_STEPS_CONFIG = [
  {
    key: 'Availability Confirmed',
    line1: 'Availability',
    line2: 'Confirmed',
    Icon: ClipboardCheck,
  },
  {
    key: 'Payment Done',
    line1: 'Payment',
    line2: 'Done',
    Icon: CreditCard,
  },
  {
    key: 'Dispatched',
    line1: 'Order',
    line2: 'Dispatched',
    Icon: PackageCheck,
  },
  {
    key: 'On the Way',
    line1: 'On the',
    line2: 'Way',
    Icon: Truck,
  },
  {
    key: 'Reached to Godown',
    line1: 'Reached to',
    line2: 'Godown',
    Icon: Warehouse,
  },
] as const;

export interface ProcurementStepperProps {
  status: string; // 'Need to Arrange from Local' | 'Factory Order' | string
  procurementStatus?: string | null;
  procurementNotes?: string | null;
  onChangeStatus?: (newStage: string) => void;
  onChangeNotes?: (notes: string) => void;
  onMarkReadyStock?: () => void;
  isViewOnly?: boolean;
  itemName?: string;
}

export const ProcurementStepper: React.FC<ProcurementStepperProps> = ({
  status,
  procurementStatus,
  procurementNotes,
  onChangeStatus,
  onChangeNotes,
  onMarkReadyStock,
  isViewOnly = false,
  itemName,
}) => {
  const isFactoryOrder = status === 'Factory Order';
  const currentIdx = VALID_PROCUREMENT_STATUSES.indexOf(
    (procurementStatus || '') as any
  );

  // Line progress percentage between milestone 0 and 4
  const progressPercent =
    currentIdx >= 0 ? Math.min(100, (currentIdx / (VALID_PROCUREMENT_STATUSES.length - 1)) * 100) : 0;

  return (
    <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-3.5 sm:p-4 my-1 transition-all">
      {/* Top Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 border-b border-slate-100">
        <div className="flex items-center space-x-2">
          <span
            className={`inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-black uppercase tracking-wider ${
              isFactoryOrder
                ? 'bg-indigo-50 text-indigo-900 border border-indigo-200'
                : 'bg-amber-50 text-amber-900 border border-amber-200'
            }`}
          >
            {isFactoryOrder ? (
              <Factory size={13} className="text-indigo-600 mr-0.5" />
            ) : (
              <Package size={13} className="text-amber-600 mr-0.5" />
            )}
            <span>{isFactoryOrder ? 'Factory Order' : 'Local Purchase'}</span>
          </span>

          <span className="text-[11px] font-semibold text-slate-500">
            {currentIdx >= 0 ? (
              <span className="text-slate-700 font-bold">
                Stage {currentIdx + 1} of 5: <span className="text-indigo-700">{VALID_PROCUREMENT_STATUSES[currentIdx]}</span>
              </span>
            ) : (
              <span className="text-slate-400 italic">Procurement stage not started</span>
            )}
          </span>
        </div>

        {/* Mark Ready Stock button if reached to godown */}
        {procurementStatus === 'Reached to Godown' && onMarkReadyStock && !isViewOnly && (
          <button
            type="button"
            onClick={onMarkReadyStock}
            className="btn btn-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold border-none shrink-0 shadow-xs cursor-pointer flex items-center space-x-1.5 px-3 py-1 rounded-md transition-transform active:scale-95"
            title="Item has arrived in godown! Set dispatch status to Ready Stock"
          >
            <CheckCircle2 size={13} />
            <span>Mark Ready Stock</span>
          </button>
        )}
      </div>

      {/* Horizontal Minimalist Stepper Track */}
      <div className="overflow-x-auto py-2">
        <div className="min-w-[460px] relative px-6 pt-3 pb-1">
          {/* Background Track Line */}
          <div className="absolute left-9 right-9 top-[25px] h-1.5 bg-slate-200 rounded-full z-0" />

          {/* Active Progress Track Line */}
          {currentIdx >= 0 && (
            <div
              className="absolute left-9 top-[25px] h-1.5 bg-indigo-600 rounded-full z-0 transition-all duration-300 ease-out"
              style={{
                width: `calc((100% - 4.5rem) * ${progressPercent / 100})`,
              }}
            />
          )}

          {/* Milestone Step Nodes */}
          <div className="relative flex items-start justify-between z-10">
            {PROCUREMENT_STEPS_CONFIG.map((step, sIdx) => {
              const isCompleted = currentIdx >= 0 && sIdx <= currentIdx;
              const isCurrent = currentIdx === sIdx;

              return (
                <div
                  key={step.key}
                  className="flex flex-col items-center select-none"
                  style={{ width: '80px' }}
                >
                  {/* Circular Node Button */}
                  <button
                    type="button"
                    disabled={isViewOnly}
                    onClick={() => {
                      if (!isViewOnly && onChangeStatus) {
                        onChangeStatus(step.key);
                      }
                    }}
                    title={
                      isViewOnly
                        ? step.key
                        : `Click to set procurement milestone: ${step.key}`
                    }
                    className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                      isViewOnly ? 'cursor-default' : 'cursor-pointer hover:scale-110 active:scale-95'
                    } ${
                      isCurrent
                        ? 'bg-indigo-600 text-white shadow-md ring-4 ring-indigo-200'
                        : isCompleted
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-white border-2 border-slate-300 text-transparent hover:border-indigo-400'
                    }`}
                  >
                    {isCompleted ? (
                      <Check size={14} strokeWidth={3} className="text-white" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                    )}
                  </button>

                  {/* Icon & Label Underneath */}
                  <button
                    type="button"
                    disabled={isViewOnly}
                    onClick={() => {
                      if (!isViewOnly && onChangeStatus) {
                        onChangeStatus(step.key);
                      }
                    }}
                    className={`mt-2.5 flex items-center space-x-1.5 text-left transition-colors ${
                      isViewOnly ? 'cursor-default' : 'cursor-pointer group'
                    }`}
                  >
                    <step.Icon
                      size={18}
                      className={`shrink-0 transition-colors ${
                        isCurrent
                          ? 'text-indigo-600'
                          : isCompleted
                          ? 'text-indigo-600'
                          : 'text-slate-400 group-hover:text-slate-600'
                      }`}
                    />
                    <div className="leading-tight">
                      <div
                        className={`text-[11px] font-bold ${
                          isCompleted
                            ? 'text-slate-900'
                            : 'text-slate-400 group-hover:text-slate-600'
                        }`}
                      >
                        {step.line1}
                      </div>
                      <div
                        className={`text-[11px] font-bold ${
                          isCompleted
                            ? 'text-slate-900'
                            : 'text-slate-400 group-hover:text-slate-600'
                        }`}
                      >
                        {step.line2}
                      </div>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Procurement Notes / LR & Supplier Reference */}
      <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
        <div className="flex items-center space-x-1.5 text-[11px] text-slate-500 shrink-0">
          <span className="font-bold text-slate-700">Procurement Notes / LR:</span>
        </div>
        <div className="flex-1">
          {isViewOnly ? (
            <span className="text-[11px] text-slate-600 italic">
              {procurementNotes || 'No notes specified.'}
            </span>
          ) : (
            <input
              type="text"
              placeholder="Supplier / LR tracking number / Payment details / Notes..."
              value={procurementNotes || ''}
              onChange={(e) => onChangeNotes && onChangeNotes(e.target.value)}
              className="input input-xs text-[11px] w-full bg-slate-50/80 focus:bg-white border-slate-200 focus:border-indigo-400 rounded-md"
            />
          )}
        </div>
      </div>
    </div>
  );
};
