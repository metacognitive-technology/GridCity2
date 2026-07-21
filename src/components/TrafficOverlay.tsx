import React from 'react';
import { TrafficControl, TrafficState } from '../types';
import { edgePortLabel, getStopSignPosition, getStoplightPosition } from '../traffic';

const PHASE_COLORS: Record<string, string> = {
  red: '#ef4444',
  yellow: '#eab308',
  green: '#22c55e',
};

/** Regular octagon with flat top (stop-sign shape) in 20×20 viewBox */
const OCTAGON_POINTS = '6.5,1.5 13.5,1.5 18.5,6.5 18.5,13.5 13.5,18.5 6.5,18.5 1.5,13.5 1.5,6.5';

interface TrafficOverlayProps {
  gridKey: string;
  tileRotation: number;
  controls: TrafficControl[];
  showIds?: boolean;
  stopSignScale?: number;
  stoplightScale?: number;
  selectedIds?: Set<string | number>;
  onLightClick?: (control: TrafficControl, e: React.MouseEvent) => void;
  onSignClick?: (control: TrafficControl, e: React.MouseEvent) => void;
}

export function TrafficOverlay({
  gridKey,
  tileRotation,
  controls,
  showIds = false,
  stopSignScale = 1,
  stoplightScale = 1,
  selectedIds,
  onLightClick,
  onSignClick,
}: TrafficOverlayProps) {
  const cellControls = controls.filter(c => c.gridKey === gridKey);
  if (!cellControls.length) return null;

  const signSize = 14 * stopSignScale;
  const lightDiameter = 10 * stoplightScale;

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 5 }}>
      {cellControls.map(ctrl => {
        const isSelected = selectedIds?.has(trafficControlKey(ctrl)) ?? false;
        const highlightPad = 6;

        if (ctrl.kind === 'stop-sign') {
          const pos = getStopSignPosition(ctrl.edgePort, tileRotation);
          const half = signSize / 2;
          return (
            <div
              key={ctrl.id}
              className={`absolute ${onSignClick ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'}`}
              style={{
                left: pos.x - half,
                top: pos.y - half,
                width: signSize,
                height: signSize,
              }}
              title={`Stop sign #${ctrl.id} (${edgePortLabel(ctrl.edgePort)})`}
              onClick={onSignClick ? (e) => { e.stopPropagation(); onSignClick(ctrl, e); } : undefined}
            >
              {isSelected && (
                <div
                  className="absolute rounded-full border-[3px] border-red-500 pointer-events-none"
                  style={{
                    left: '50%',
                    top: '50%',
                    width: signSize + highlightPad,
                    height: signSize + highlightPad,
                    transform: 'translate(-50%, -50%)',
                    boxShadow: '0 0 4px rgba(239, 68, 68, 0.6)',
                  }}
                />
              )}
              <svg viewBox="0 0 20 20" className="w-full h-full drop-shadow-md relative">
                <polygon points={OCTAGON_POINTS} fill="#dc2626" stroke="#fff" strokeWidth="1.25" />
                <text x="10" y="11.5" textAnchor="middle" fill="#fff" fontSize="4.5" fontWeight="bold" fontFamily="system-ui,sans-serif">
                  STOP
                </text>
              </svg>
              {showIds && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[8px] font-bold text-slate-700 bg-white/90 px-0.5 rounded whitespace-nowrap pointer-events-none">
                  #{ctrl.id}
                </div>
              )}
            </div>
          );
        }

        const pos = getStoplightPosition(ctrl.heading, ctrl.lane, tileRotation);
        const radius = lightDiameter / 2;
        return (
          <div
            key={ctrl.id}
            className={`absolute ${onLightClick ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'}`}
            style={{
              left: pos.x - radius,
              top: pos.y - radius,
              width: lightDiameter,
              height: lightDiameter,
            }}
            title={`Light #${ctrl.id} — ${ctrl.phase}`}
            onClick={onLightClick ? (e) => { e.stopPropagation(); onLightClick(ctrl, e); } : undefined}
          >
            {isSelected && (
              <div
                className="absolute rounded-full border-[3px] border-red-500 pointer-events-none"
                style={{
                  left: '50%',
                  top: '50%',
                  width: lightDiameter + highlightPad,
                  height: lightDiameter + highlightPad,
                  transform: 'translate(-50%, -50%)',
                  boxShadow: '0 0 4px rgba(239, 68, 68, 0.6)',
                }}
              />
            )}
            <div
              className="w-full h-full rounded-full shadow-md"
              style={{
                backgroundColor: PHASE_COLORS[ctrl.phase],
                boxShadow: `0 0 ${4 * stoplightScale}px ${PHASE_COLORS[ctrl.phase]}`,
              }}
            />
            {showIds && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[8px] font-bold text-slate-700 bg-white/90 px-0.5 rounded whitespace-nowrap pointer-events-none">
                #{ctrl.id}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function TrafficCountdownBadge({ seconds }: { seconds: number }) {
  if (seconds <= 0) return null;
  return (
    <div
      className="absolute -top-4 left-1/2 -translate-x-1/2 z-30 pointer-events-none"
      style={{ minWidth: 18 }}
    >
      <div className="bg-red-600 text-white text-[9px] font-bold px-1 py-0.5 rounded-full shadow text-center leading-none">
        {Math.ceil(seconds)}
      </div>
    </div>
  );
}

export function getAllTrafficControls(traffic: TrafficState): TrafficControl[] {
  return Object.values(traffic.controls);
}

export function trafficControlKey(c: TrafficControl): string {
  return String(c.id);
}