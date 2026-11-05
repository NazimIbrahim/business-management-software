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
    <div
      className="stream-procure-card"
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '12px',
        border: '1px solid #E2E8F0',
        padding: '12px 16px',
        margin: '6px 0',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
      }}
    >
      {/* Top Header Row */}
      <div
        className="stream-procure-header"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          paddingBottom: '10px',
          borderBottom: '1px solid #F1F5F9',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '2px 10px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              backgroundColor: isFactoryOrder ? '#EEF2FF' : '#FEF3C7',
              color: isFactoryOrder ? '#3730A3' : '#92400E',
              border: `1px solid ${isFactoryOrder ? '#C7D2FE' : '#FDE68A'}`,
            }}
          >
            {isFactoryOrder ? (
              <Factory size={13} color="#4F46E5" />
            ) : (
              <Package size={13} color="#D97706" />
            )}
            <span>{isFactoryOrder ? 'Factory Order' : 'Local Purchase'}</span>
          </span>

          <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748B' }}>
            {currentIdx >= 0 ? (
              <span style={{ color: '#334155', fontWeight: 700 }}>
                Stage {currentIdx + 1} of 5:{' '}
                <span style={{ color: '#4F46E5', fontWeight: 800 }}>
                  {VALID_PROCUREMENT_STATUSES[currentIdx]}
                </span>
              </span>
            ) : (
              <span style={{ color: '#94A3B8', fontStyle: 'italic' }}>
                Procurement stage not started
              </span>
            )}
          </span>
        </div>

        {/* Mark Ready Stock button if reached to godown */}
        {procurementStatus === 'Reached to Godown' && onMarkReadyStock && !isViewOnly && (
          <button
            type="button"
            onClick={onMarkReadyStock}
            style={{
              backgroundColor: '#059669',
              color: '#FFFFFF',
              fontWeight: 700,
              fontSize: '11px',
              border: 'none',
              borderRadius: '6px',
              padding: '4px 12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 5px rgba(5, 150, 105, 0.3)',
              transition: 'background-color 0.15s ease, transform 0.1s ease',
            }}
            title="Item has arrived in godown! Set dispatch status to Ready Stock"
          >
            <CheckCircle2 size={13} />
            <span>Mark Ready Stock</span>
          </button>
        )}
      </div>

      {/* Horizontal Minimalist Stepper Track */}
      <div style={{ overflowX: 'auto', padding: '10px 0 6px 0' }}>
        <div
          style={{
            position: 'relative',
            minWidth: '500px',
            padding: '12px 24px 6px 24px',
          }}
        >
          {/* Background Inactive Track Line (Always Visible) */}
          <div
            className="stream-procure-bg-line"
            style={{
              position: 'absolute',
              top: '26px', // 12px container top padding + 14px center of 28px buttons
              left: '52px', // Centered through node 0
              right: '52px', // Centered through node 4
              height: '5px',
              backgroundColor: '#E2E8F0',
              borderRadius: '9999px',
              zIndex: 1,
            }}
          />

          {/* Active Progress Track Line (Solid Vivid Indigo) */}
          {currentIdx >= 0 && (
            <div
              className="stream-procure-fill-line"
              style={{
                position: 'absolute',
                top: '26px',
                left: '52px',
                height: '5px',
                width: `calc((100% - 104px) * ${progressPercent / 100})`,
                backgroundColor: '#4F46E5',
                borderRadius: '9999px',
                zIndex: 2,
                transition: 'width 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: '0 1px 4px rgba(79, 70, 229, 0.35)',
              }}
            />
          )}

          {/* Milestone Step Nodes */}
          <div
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              zIndex: 3,
            }}
          >
            {PROCUREMENT_STEPS_CONFIG.map((step, sIdx) => {
              const isCompleted = currentIdx >= 0 && sIdx <= currentIdx;
              const isCurrent = currentIdx === sIdx;

              return (
                <div
                  key={step.key}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    width: '84px',
                    userSelect: 'none',
                  }}
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
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: isViewOnly ? 'default' : 'pointer',
                      border: isCompleted ? 'none' : '2.5px solid #CBD5E1',
                      backgroundColor: isCompleted ? '#4F46E5' : '#FFFFFF',
                      color: isCompleted ? '#FFFFFF' : 'transparent',
                      boxShadow: isCurrent
                        ? '0 0 0 4px #C7D2FE, 0 3px 8px rgba(79, 70, 229, 0.45)'
                        : isCompleted
                        ? '0 2px 6px rgba(79, 70, 229, 0.35)'
                        : '0 1px 2px rgba(0, 0, 0, 0.04)',
                      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                      boxSizing: 'border-box',
                    }}
                  >
                    {isCompleted ? (
                      <Check size={15} strokeWidth={3} color="#FFFFFF" />
                    ) : (
                      <span
                        style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          backgroundColor: '#94A3B8',
                          display: 'block',
                        }}
                      />
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
                    style={{
                      marginTop: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: 'transparent',
                      border: 'none',
                      cursor: isViewOnly ? 'default' : 'pointer',
                      textAlign: 'left',
                      padding: 0,
                    }}
                  >
                    <step.Icon
                      size={16}
                      color={isCurrent || isCompleted ? '#4F46E5' : '#94A3B8'}
                      style={{ flexShrink: 0, transition: 'color 0.2s ease' }}
                    />
                    <div style={{ lineHeight: 1.2 }}>
                      <div
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          color: isCompleted ? '#0F172A' : '#64748B',
                          transition: 'color 0.2s ease',
                        }}
                      >
                        {step.line1}
                      </div>
                      <div
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          color: isCompleted ? '#0F172A' : '#64748B',
                          transition: 'color 0.2s ease',
                        }}
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
      <div
        style={{
          marginTop: '10px',
          paddingTop: '8px',
          borderTop: '1px solid #F1F5F9',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '11px',
            color: '#64748B',
            flexShrink: 0,
          }}
        >
          <span style={{ fontWeight: 700, color: '#334155' }}>
            Procurement Notes / LR:
          </span>
        </div>
        <div style={{ flex: 1, minWidth: '240px' }}>
          {isViewOnly ? (
            <span style={{ fontSize: '11px', color: '#475569', fontStyle: 'italic' }}>
              {procurementNotes || 'No notes specified.'}
            </span>
          ) : (
            <input
              type="text"
              placeholder="Supplier / LR tracking number / Payment details / Notes..."
              value={procurementNotes || ''}
              onChange={(e) => onChangeNotes && onChangeNotes(e.target.value)}
              style={{
                width: '100%',
                fontSize: '11px',
                padding: '5px 10px',
                backgroundColor: '#F8FAFC',
                border: '1px solid #CBD5E1',
                borderRadius: '6px',
                color: '#0F172A',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s ease, background-color 0.2s ease',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#4F46E5';
                e.currentTarget.style.backgroundColor = '#FFFFFF';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#CBD5E1';
                e.currentTarget.style.backgroundColor = '#F8FAFC';
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};
