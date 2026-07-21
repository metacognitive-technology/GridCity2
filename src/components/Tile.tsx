import React from 'react';
import {
  BRIDGE_PILLAR_LEFT,
  BRIDGE_PILLAR_RIGHT,
  DIVIDER_LEFT,
  DIVIDER_RIGHT,
  RAIL_LEFT,
  RAIL_RIGHT,
  ROAD_INSET_2L,
  ROAD_INSET_4L,
  ROAD_OUTER_2L,
  ROAD_OUTER_4L,
  ROAD_WIDTH_2L,
  ROAD_WIDTH_4L,
  TILE_CENTER,
  TILE_PX,
  svgN,
} from '../roadGeometry';
import { TileType } from '../types';

interface TileProps {
  type: TileType;
  rotation?: number;
  size?: number;
  className?: string;
  part?: 'anchor' | 'member';
  localX?: number;
  localY?: number;
  w?: number;
  h?: number;
  growthProgress?: number;
  coneStageRatio?: number;
  /** When set and in the future, render tree as burning */
  burningUntil?: number;
  /** Wall-clock now for burn animation progress (optional; Tile may use Date.now) */
  burnNow?: number;
}

const PineTreeGraphic = () => (
  <>
    <path d="M 32 8 L 12 56 L 52 56 Z" fill="#065f46" />
    <rect x="28" y="56" width="8" height="4" fill="#451a03" />
  </>
);

type Pt = [number, number];

/** Point reflection through tile center — mirrors NW one-way curve art to SE. */
function mirrorPt([x, y]: Pt): Pt {
  return [TILE_PX - x, TILE_PX - y];
}

const ONE_WAY_CURVE_NW_CENTER: [Pt, Pt, Pt] = [[TILE_CENTER, 0], [TILE_CENTER, TILE_CENTER], [0, TILE_CENTER]];

const ONE_WAY_CURVE_NW_ROAD = `M ${svgN(ROAD_INSET_2L)} 0 Q ${svgN(ROAD_INSET_2L)} ${svgN(ROAD_INSET_2L)} 0 ${svgN(ROAD_INSET_2L)} L 0 ${svgN(ROAD_OUTER_2L)} Q ${svgN(ROAD_OUTER_2L)} ${svgN(ROAD_OUTER_2L)} ${svgN(ROAD_OUTER_2L)} 0 Z`;

const ONE_WAY_CURVE_SE_ROAD = `M ${svgN(ROAD_OUTER_2L)} ${TILE_PX} Q ${svgN(ROAD_OUTER_2L)} ${svgN(ROAD_OUTER_2L)} ${TILE_PX} ${svgN(ROAD_OUTER_2L)} L ${TILE_PX} ${svgN(ROAD_INSET_2L)} Q ${svgN(ROAD_INSET_2L)} ${svgN(ROAD_INSET_2L)} ${svgN(ROAD_INSET_2L)} ${TILE_PX} Z`;

/** Rotation (deg) so default-up arrow matches a travel tangent vector */
function tangentToArrowAngle(dx: number, dy: number): number {
  return (Math.atan2(dy, dx) * 180) / Math.PI + 90;
}

function quadBezierPoint(p0: Pt, p1: Pt, p2: Pt, t: number): Pt {
  const mt = 1 - t;
  return [
    mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0],
    mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1],
  ];
}

function quadBezierTangentAngle(p0: Pt, p1: Pt, p2: Pt, t: number): number {
  const mt = 1 - t;
  const dx = 2 * mt * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]);
  const dy = 2 * mt * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]);
  return tangentToArrowAngle(dx, dy);
}

const OneWayArrowHead: React.FC<{
  x: number;
  y: number;
  angle?: number;
  size?: number;
  color?: string;
}> = ({ x, y, angle = 0, size = 7, color = '#ffffff' }) => {
  const halfW = size * 0.7;
  const tipY = -size * 0.85;
  const baseY = size * 0.55;
  return (
    <path
      d={`M 0 ${tipY} L ${-halfW} ${baseY} L ${halfW} ${baseY} Z`}
      fill={color}
      transform={`translate(${x} ${y}) rotate(${angle})`}
    />
  );
};

const LaneCurveArrows: React.FC<{
  p0: Pt;
  p1: Pt;
  p2: Pt;
  samples: number[];
  color: string;
}> = ({ p0, p1, p2, samples, color }) => (
  <>
    {samples.map(t => {
      const [x, y] = quadBezierPoint(p0, p1, p2, t);
      return <OneWayArrowHead key={t} x={x} y={y} angle={quadBezierTangentAngle(p0, p1, p2, t)} color={color} />;
    })}
  </>
);

const OneWayStraightMarkings: React.FC<{ stripeColor: string }> = ({ stripeColor }) => {
  // Tile art is N–S; rotation handles world heading. Travel is northbound (port 0) in local space.
  const centerX = TILE_CENTER;
  const travelAngle = tangentToArrowAngle(0, -1);
  const arrowYs = [14, 32, 50];
  return (
    <>
      <line
        x1={centerX}
        y1="4"
        x2={centerX}
        y2="60"
        stroke={stripeColor}
        strokeWidth="2"
        strokeDasharray="5,5"
        opacity="0.95"
      />
      {arrowYs.map(y => (
        <OneWayArrowHead key={y} x={centerX} y={y} angle={travelAngle} color={stripeColor} />
      ))}
    </>
  );
};

const OneWayCurveMarkings: React.FC<{
  stripeColor: string;
  variant: 'nw' | 'se';
}> = ({ stripeColor, variant }) => {
  const center: [Pt, Pt, Pt] =
    variant === 'nw'
      ? ONE_WAY_CURVE_NW_CENTER
      : ONE_WAY_CURVE_NW_CENTER.map(mirrorPt) as [Pt, Pt, Pt];
  const [p0, p1, p2] = center;

  return (
    <>
      <path
        d={`M ${p0[0]} ${p0[1]} Q ${p1[0]} ${p1[1]} ${p2[0]} ${p2[1]}`}
        fill="none"
        stroke={stripeColor}
        strokeWidth="2"
        strokeDasharray="5,5"
        opacity="0.95"
      />
      <LaneCurveArrows
        p0={p0}
        p1={p1}
        p2={p2}
        samples={[0.22, 0.5, 0.78]}
        color={stripeColor}
      />
    </>
  );
};

const TREE_BURN_MS = 30_000;

function BurningTreeOverlay({ burnProgress }: { burnProgress: number }) {
  // burnProgress 0 = just lit, 1 = about to ash
  const intensity = 0.55 + 0.45 * Math.min(1, Math.max(0, burnProgress));
  const char = Math.min(1, Math.max(0, burnProgress));
  return (
    <g className="tree-fire-layer" style={{ pointerEvents: 'none' }}>
      {/* Scorched ground */}
      <ellipse
        cx="32"
        cy="56"
        rx={14 + char * 6}
        ry={5 + char * 2}
        fill={`rgba(28, 25, 23, ${0.25 + char * 0.45})`}
      />
      {/* Flame body */}
      <g className="tree-flame" opacity={intensity}>
        <ellipse cx="28" cy="28" rx="7" ry="14" fill="#fbbf24" className="tree-flame-core" />
        <ellipse cx="36" cy="24" rx="6" ry="12" fill="#f97316" className="tree-flame-mid" />
        <ellipse cx="32" cy="18" rx="5" ry="11" fill="#ef4444" className="tree-flame-tip" />
        <ellipse cx="24" cy="34" rx="4" ry="8" fill="#fde047" className="tree-flame-side" />
        <ellipse cx="40" cy="32" rx="3.5" ry="7" fill="#fb923c" className="tree-flame-side" />
      </g>
      {/* Smoke */}
      <g className="tree-smoke" opacity={0.35 + char * 0.4}>
        <circle cx="30" cy="10" r="4" fill="#94a3b8" className="tree-smoke-puff" />
        <circle cx="38" cy="6" r="5" fill="#64748b" className="tree-smoke-puff tree-smoke-puff-delay" />
        <circle cx="26" cy="4" r="3.5" fill="#475569" className="tree-smoke-puff tree-smoke-puff-delay2" />
      </g>
      {/* Ember sparks */}
      <circle cx="22" cy="22" r="1.2" fill="#fef08a" className="tree-ember" />
      <circle cx="42" cy="18" r="1" fill="#fdba74" className="tree-ember tree-ember-delay" />
      <circle cx="34" cy="12" r="0.9" fill="#fecaca" className="tree-ember tree-ember-delay2" />
    </g>
  );
}

export const Tile: React.FC<TileProps> = ({ 
  type, 
  rotation = 0, 
  size = 64, 
  className = "",
  part,
  localX = 0,
  localY = 0,
  w = 1,
  h = 1,
  growthProgress = 0,
  coneStageRatio = 0.125,
  burningUntil,
  burnNow,
}) => {
  const now = burnNow ?? Date.now();
  const isBurning = typeof burningUntil === 'number' && burningUntil > now;
  const burnProgress = isBurning
    ? Math.min(1, Math.max(0, 1 - (burningUntil! - now) / TREE_BURN_MS))
    : 0;
  const isRail = type.startsWith('rail');
  const color = isRail ? 'transparent' : '#374151'; // Transparent for rail, Gray-700 for road
  const stripeColor = isRail ? '#9ca3af' : '#ffffff'; // Gray-400 for rail ties, White for road lines
  const railMetalColor = '#64748b'; // Slate-500 for the metal rails

  const renderParkingCell = (
    tileType: string,
    lx: number,
    ly: number,
    widthVal: number,
    heightVal: number
  ) => {
    // Asphalt base
    const bg = '#334155';
    const lineColor = '#fbbf24';
    const stopperColor = '#94a3b8';
    const stopperStroke = '#475569';
    
    // Draw base asphalt
    const elements: React.ReactNode[] = [
      <rect key="bg" x="0" y="0" width="64" height="64" fill={bg} />
    ];

    // Determine the border around the entire parking lot (not cell-by-cell borders, but outer lot borders!)
    const curbColor = '#1e293b';
    if (lx === 0) {
      elements.push(<rect key="curb-l" x="0" y="0" width="4" height="64" fill={curbColor} />);
    }
    if (lx === widthVal - 1) {
      elements.push(<rect key="curb-r" x="60" y="0" width="4" height="64" fill={curbColor} />);
    }
    if (ly === 0) {
      elements.push(<rect key="curb-t" x="0" y="0" width="64" height="4" fill={curbColor} />);
    }
    if (ly === heightVal - 1) {
      elements.push(<rect key="curb-b" x="0" y="60" width="64" height="4" fill={curbColor} />);
    }

    // Now, render the inner markings based on the type of parking lot!
    if (tileType === 'parking-1x1' || tileType === 'parking-1x2' || tileType === 'parking-1x3') {
      // VERTICAL CAR BAYS (2 slots side by side per cell)
      const curbTop = ly === 0;
      const curbBottom = ly === heightVal - 1;

      // Vertical line dividers
      elements.push(<line key="line-l" x1="8" y1="4" x2="8" y2="60" stroke={lineColor} strokeWidth="1.5" strokeDasharray={(!curbTop && !curbBottom) ? "4,4" : undefined} />);
      elements.push(<line key="line-m" x1="32" y1="4" x2="32" y2="60" stroke={lineColor} strokeWidth="1.5" strokeDasharray={(!curbTop && !curbBottom) ? "4,4" : undefined} />);
      elements.push(<line key="line-r" x1="56" y1="4" x2="56" y2="60" stroke={lineColor} strokeWidth="1.5" strokeDasharray={(!curbTop && !curbBottom) ? "4,4" : undefined} />);

      // Horizontal curbs (yellow line + concrete stopper blocks)
      if (curbTop) {
        elements.push(<line key="curb-line-t" x1="8" y1="8" x2="56" y2="8" stroke={lineColor} strokeWidth="2" />);
        elements.push(<rect key="stop-t1" x="12" y="10" width="12" height="4" rx="1" fill={stopperColor} stroke={stopperStroke} strokeWidth="1" />);
        elements.push(<rect key="stop-t2" x="40" y="10" width="12" height="4" rx="1" fill={stopperColor} stroke={stopperStroke} strokeWidth="1" />);
      }
      if (curbBottom) {
        elements.push(<line key="curb-line-b" x1="8" y1="56" x2="56" y2="56" stroke={lineColor} strokeWidth="2" />);
        elements.push(<rect key="stop-b1" x="12" y="50" width="12" height="4" rx="1" fill={stopperColor} stroke={stopperStroke} strokeWidth="1" />);
        elements.push(<rect key="stop-b2" x="40" y="50" width="12" height="4" rx="1" fill={stopperColor} stroke={stopperStroke} strokeWidth="1" />);
      }

      // Draw EV/Car painted icons for aesthetic details
      if (ly % 2 === 0) {
        elements.push(
          <g key="stencil-1" opacity="0.15" transform="translate(16, 26) scale(0.6)">
            <rect x="0" y="4" width="8" height="12" rx="2" fill="#ffffff" />
            <rect x="1" y="8" width="6" height="4" fill={bg} />
            <circle cx="2" cy="18" r="1.5" fill="#ffffff" />
            <circle cx="6" cy="18" r="1.5" fill="#ffffff" />
          </g>
        );
        elements.push(
          <text 
            key="text-2" 
            x="46" 
            y="36" 
            fill="#ffffff" 
            opacity="0.2" 
            fontSize="8" 
            fontWeight="bold" 
            textAnchor="middle"
          >
            CAR
          </text>
        );
      }
    } else if (tileType === 'parking-2x2') {
      // HORIZONTAL CAR BAYS (Back-to-back layout)
      const isLeft = lx === 0;

      elements.push(<line key="div-t" x1="4" y1="8" x2="60" y2="8" stroke={lineColor} strokeWidth="1.5" />);
      elements.push(<line key="div-m" x1="4" y1="32" x2="60" y2="32" stroke={lineColor} strokeWidth="1.5" />);
      elements.push(<line key="div-b" x1="4" y1="56" x2="60" y2="56" stroke={lineColor} strokeWidth="1.5" />);

      if (isLeft) {
        elements.push(<line key="curb-l" x1="8" y1="8" x2="8" y2="56" stroke={lineColor} strokeWidth="2" />);
        elements.push(<rect key="stop-l1" x="10" y="14" width="4" height="12" rx="1" fill={stopperColor} stroke={stopperStroke} strokeWidth="1" />);
        elements.push(<rect key="stop-l2" x="10" y="38" width="4" height="12" rx="1" fill={stopperColor} stroke={stopperStroke} strokeWidth="1" />);
      } else {
        elements.push(<line key="curb-r" x1="56" y1="8" x2="56" y2="56" stroke={lineColor} strokeWidth="2" />);
        elements.push(<rect key="stop-r1" x="50" y="14" width="4" height="12" rx="1" fill={stopperColor} stroke={stopperStroke} strokeWidth="1" />);
        elements.push(<rect key="stop-r2" x="50" y="38" width="4" height="12" rx="1" fill={stopperColor} stroke={stopperStroke} strokeWidth="1" />);
      }

      elements.push(
        <text 
          key="compact-text" 
          x={isLeft ? 24 : 40} 
          y={ly === 0 ? 23 : 47} 
          fill="#ffffff" 
          opacity="0.15" 
          fontSize="7" 
          fontWeight="bold" 
          textAnchor="middle"
        >
          COMPACT
        </text>
      );
    } else if (tileType === 'parking-2x4') {
      // HORIZONTAL SEMI BAYS (2 bays spanning columns 0 and 1)
      const isLeftCol = lx === 0;

      elements.push(<line key="semi-div-t" x1="0" y1="8" x2="64" y2="8" stroke={lineColor} strokeWidth="2" />);
      elements.push(<line key="semi-div-m" x1="0" y1="32" x2="64" y2="32" stroke={lineColor} strokeWidth="2" />);
      elements.push(<line key="semi-div-b" x1="0" y1="56" x2="64" y2="56" stroke={lineColor} strokeWidth="2" />);

      if (isLeftCol) {
        elements.push(<line key="semi-curb" x1="8" y1="8" x2="8" y2="56" stroke={lineColor} strokeWidth="2.5" />);
        elements.push(<rect key="semi-stop-1" x="12" y="12" width="6" height="16" rx="1.5" fill={stopperColor} stroke={stopperStroke} strokeWidth="1.5" />);
        elements.push(<rect key="semi-stop-2" x="12" y="36" width="6" height="16" rx="1.5" fill={stopperColor} stroke={stopperStroke} strokeWidth="1.5" />);
        
        elements.push(
          <g key="semi-icon-1" opacity="0.15" transform="translate(32, 16) scale(0.6)">
            <rect x="16" y="2" width="10" height="8" rx="1" fill={lineColor} />
            <rect x="0" y="0" width="15" height="12" fill={lineColor} />
          </g>
        );
        elements.push(
          <g key="semi-icon-2" opacity="0.15" transform="translate(32, 40) scale(0.6)">
            <rect x="16" y="2" width="10" height="8" rx="1" fill={lineColor} />
            <rect x="0" y="0" width="15" height="12" fill={lineColor} />
          </g>
        );
      } else {
        elements.push(
          <text 
            key="semi-text-1" 
            x="24" 
            y="23" 
            fill={lineColor} 
            opacity="0.2" 
            fontSize="8" 
            fontWeight="bold" 
            textAnchor="start"
            letterSpacing="1"
          >
            SEMI
          </text>
        );
        elements.push(
          <text 
            key="semi-text-2" 
            x="24" 
            y="47" 
            fill={lineColor} 
            opacity="0.2" 
            fontSize="8" 
            fontWeight="bold" 
            textAnchor="start"
            letterSpacing="1"
          >
            SEMI
          </text>
        );
      }
    } else if (tileType === 'parking-4x4') {
      // 4x4 HYBRID LOT
      if (lx === 0 || lx === 1) {
        const isLeftCol = lx === 0;

        elements.push(<line key="s-div-t" x1="0" y1="8" x2="64" y2="8" stroke={lineColor} strokeWidth="2" />);
        elements.push(<line key="s-div-m" x1="0" y1="32" x2="64" y2="32" stroke={lineColor} strokeWidth="2" />);
        elements.push(<line key="s-div-b" x1="0" y1="56" x2="64" y2="56" stroke={lineColor} strokeWidth="2" />);

        if (isLeftCol) {
          elements.push(<line key="s-curb" x1="8" y1="8" x2="8" y2="56" stroke={lineColor} strokeWidth="2.5" />);
          elements.push(<rect key="s-stop-1" x="12" y="12" width="6" height="16" rx="1.5" fill={stopperColor} stroke={stopperStroke} strokeWidth="1.5" />);
          elements.push(<rect key="s-stop-2" x="12" y="36" width="6" height="16" rx="1.5" fill={stopperColor} stroke={stopperStroke} strokeWidth="1.5" />);
        } else {
          elements.push(
            <text key="s-t-1" x="24" y="23" fill={lineColor} opacity="0.2" fontSize="8" fontWeight="bold" textAnchor="start">
              SEMI
            </text>
          );
          elements.push(
            <text key="s-t-2" x="24" y="47" fill={lineColor} opacity="0.2" fontSize="8" fontWeight="bold" textAnchor="start">
              SEMI
            </text>
          );
        }
      } else {
        const isLeftCarCol = lx === 2;

        elements.push(<line key="c-div-t" x1="0" y1="8" x2="64" y2="8" stroke={lineColor} strokeWidth="1.5" />);
        elements.push(<line key="c-div-1" x1="0" y1="20" x2="64" y2="20" stroke={lineColor} strokeWidth="1.5" />);
        elements.push(<line key="c-div-m" x1="0" y1="32" x2="64" y2="32" stroke={lineColor} strokeWidth="1.5" />);
        elements.push(<line key="c-div-2" x1="0" y1="44" x2="64" y2="44" stroke={lineColor} strokeWidth="1.5" />);
        elements.push(<line key="c-div-b" x1="0" y1="56" x2="64" y2="56" stroke={lineColor} strokeWidth="1.5" />);

        if (isLeftCarCol) {
          elements.push(<line key="c-curb-l" x1="8" y1="8" x2="8" y2="56" stroke={lineColor} strokeWidth="2" />);
          elements.push(<rect key="c-stop-l1" x="10" y="11" width="4" height="6" rx="1" fill={stopperColor} stroke={stopperStroke} strokeWidth="1" />);
          elements.push(<rect key="c-stop-l2" x="10" y="23" width="4" height="6" rx="1" fill={stopperColor} stroke={stopperStroke} strokeWidth="1" />);
          elements.push(<rect key="c-stop-l3" x="10" y="35" width="4" height="6" rx="1" fill={stopperColor} stroke={stopperStroke} strokeWidth="1" />);
          elements.push(<rect key="c-stop-l4" x="10" y="47" width="4" height="6" rx="1" fill={stopperColor} stroke={stopperStroke} strokeWidth="1" />);
        } else {
          elements.push(<line key="c-curb-r" x1="56" y1="8" x2="56" y2="56" stroke={lineColor} strokeWidth="2" />);
          elements.push(<rect key="c-stop-r1" x="50" y="11" width="4" height="6" rx="1" fill={stopperColor} stroke={stopperStroke} strokeWidth="1" />);
          elements.push(<rect key="c-stop-r2" x="50" y="23" width="4" height="6" rx="1" fill={stopperColor} stroke={stopperStroke} strokeWidth="1" />);
          elements.push(<rect key="c-stop-r3" x="50" y="35" width="4" height="6" rx="1" fill={stopperColor} stroke={stopperStroke} strokeWidth="1" />);
          elements.push(<rect key="c-stop-r4" x="50" y="47" width="4" height="6" rx="1" fill={stopperColor} stroke={stopperStroke} strokeWidth="1" />);
        }

        elements.push(
          <text 
            key="c-stencil" 
            x={isLeftCarCol ? 28 : 36} 
            y={38} 
            fill="#ffffff" 
            opacity="0.12" 
            fontSize="6" 
            fontWeight="bold" 
            textAnchor="middle"
          >
            CAR
          </text>
        );
      }
    }

    return <>{elements}</>;
  };

  const renderContent = () => {
    switch (type) {
      case 'parking-1x1':
      case 'parking-1x2':
      case 'parking-1x3':
      case 'parking-2x2':
      case 'parking-2x4':
      case 'parking-4x4':
        return renderParkingCell(type, localX, localY, w, h);
      case 'road-straight':
      case 'rail-straight':
      case 'road-bridge':
      case 'road-4lane-bridge':
      case 'rail-trestle':
      case 'road-oneway-straight':
      case 'road-oneway-bridge':
      case 'road-4lane-straight':
        const isBridge = type === 'road-bridge' || type === 'road-oneway-bridge' || type === 'rail-trestle' || type === 'road-4lane-bridge';
        const is4Lane = type === 'road-4lane-straight' || type === 'road-4lane-bridge';
        const isOneWay = type === 'road-oneway-straight' || type === 'road-oneway-bridge';
        const roadWidth = is4Lane ? ROAD_WIDTH_4L : ROAD_WIDTH_2L;
        const roadX = is4Lane ? ROAD_INSET_4L : ROAD_INSET_2L;
        
        return (
          <>
            <rect x={roadX} y="0" width={roadWidth} height="64" fill={color} />
            {isRail ? (
              <>
                {/* Rail ties */}
                {[8, 24, 40, 56].map(y => (
                  <rect key={y} x={svgN(RAIL_LEFT - 3)} y={y-2} width={svgN(RAIL_RIGHT - RAIL_LEFT + 6)} height="4" fill={stripeColor} />
                ))}
                {/* Metal rails */}
                <rect x={svgN(RAIL_LEFT)} y="0" width="2" height="64" fill={railMetalColor} />
                <rect x={svgN(RAIL_RIGHT)} y="0" width="2" height="64" fill={railMetalColor} />
              </>
            ) : is4Lane ? (
              // 4-lane stripes: Yellow center, white dashed lanes
              <>
                {/* Yellow centerline */}
                <rect x={TILE_CENTER - 1} y="0" width="2" height="64" fill="#fbbf24" />
                {/* White dashed lane boundaries */}
                <line x1={svgN(DIVIDER_LEFT)} y1="0" x2={svgN(DIVIDER_LEFT)} y2="64" stroke={stripeColor} strokeWidth="1" strokeDasharray="4,4" opacity="0.6" />
                <line x1={svgN(DIVIDER_RIGHT)} y1="0" x2={svgN(DIVIDER_RIGHT)} y2="64" stroke={stripeColor} strokeWidth="1" strokeDasharray="4,4" opacity="0.6" />
              </>
            ) : isOneWay ? (
              <OneWayStraightMarkings stripeColor={stripeColor} />
            ) : (
              // Standard road stripes
              <>
                <rect x={TILE_CENTER - 1} y="8" width="2" height="12" fill={stripeColor} />
                <rect x={TILE_CENTER - 1} y="44" width="2" height="12" fill={stripeColor} />
              </>
            )}
            {isBridge && (
              <>
                <rect x={svgN(BRIDGE_PILLAR_LEFT)} y="0" width="4" height="64" fill="#94a3b8" />
                <rect x={svgN(BRIDGE_PILLAR_RIGHT)} y="0" width="4" height="64" fill="#94a3b8" />
                {[4, 20, 36, 52].map(y => (
                  <rect key={y} x={svgN(BRIDGE_PILLAR_LEFT)} y={y} width={svgN(BRIDGE_PILLAR_RIGHT - BRIDGE_PILLAR_LEFT)} height="2" fill="#64748b" />
                ))}
              </>
            )}
          </>
        );
      case 'road-curve':
      case 'rail-curve':
      case 'road-oneway-curve':
      case 'road-oneway-curve-reverse':
      case 'road-4lane-curve':
        const is4LaneCurve = type === 'road-4lane-curve';
        const isOneWayCurve = type === 'road-oneway-curve';
        const isOneWayCurveReverse = type === 'road-oneway-curve-reverse';
        return (
          <>
            {is4LaneCurve ? (
               <path d={`M ${svgN(ROAD_OUTER_4L)} 0 Q ${svgN(ROAD_OUTER_4L)} ${svgN(ROAD_OUTER_4L)} 0 ${svgN(ROAD_OUTER_4L)} L 0 ${svgN(ROAD_INSET_4L)} Q ${svgN(ROAD_INSET_4L)} ${svgN(ROAD_INSET_4L)} ${svgN(ROAD_INSET_4L)} 0 Z`} fill={color} />
            ) : isOneWayCurveReverse ? (
               <path d={ONE_WAY_CURVE_SE_ROAD} fill={color} />
            ) : isOneWayCurve ? (
               <path d={ONE_WAY_CURVE_NW_ROAD} fill={color} />
            ) : (
               <path d={`M ${svgN(ROAD_INSET_2L)} 0 Q ${svgN(ROAD_INSET_2L)} ${svgN(ROAD_INSET_2L)} 0 ${svgN(ROAD_INSET_2L)} L 0 ${svgN(ROAD_OUTER_2L)} Q ${svgN(ROAD_OUTER_2L)} ${svgN(ROAD_OUTER_2L)} ${svgN(ROAD_OUTER_2L)} 0 Z`} fill={color} />
            )}
            {isRail ? (
               <>
                 <path d={`M ${TILE_CENTER} 0 Q ${TILE_CENTER} ${TILE_CENTER} 0 ${TILE_CENTER}`} fill="none" stroke={stripeColor} strokeWidth="4" strokeDasharray="4,4" />
                 <path d={`M ${svgN(RAIL_LEFT)} 0 Q ${svgN(RAIL_LEFT)} ${svgN(RAIL_LEFT)} 0 ${svgN(RAIL_LEFT)}`} fill="none" stroke={railMetalColor} strokeWidth="2" />
                 <path d={`M ${svgN(RAIL_RIGHT)} 0 Q ${svgN(RAIL_RIGHT)} ${svgN(RAIL_RIGHT)} 0 ${svgN(RAIL_RIGHT)}`} fill="none" stroke={railMetalColor} strokeWidth="2" />
               </>
            ) : is4LaneCurve ? (
               <>
                 <path d={`M ${TILE_CENTER} 0 Q ${TILE_CENTER} ${TILE_CENTER} 0 ${TILE_CENTER}`} fill="none" stroke="#fbbf24" strokeWidth="2" />
                 <path d={`M ${svgN(DIVIDER_RIGHT)} 0 Q ${svgN(DIVIDER_RIGHT)} ${svgN(DIVIDER_RIGHT)} 0 ${svgN(DIVIDER_RIGHT)}`} fill="none" stroke={stripeColor} strokeWidth="1" strokeDasharray="4,4" opacity="0.6" />
                 <path d={`M ${svgN(DIVIDER_LEFT)} 0 Q ${svgN(DIVIDER_LEFT)} ${svgN(DIVIDER_LEFT)} 0 ${svgN(DIVIDER_LEFT)}`} fill="none" stroke={stripeColor} strokeWidth="1" strokeDasharray="4,4" opacity="0.6" />
               </>
            ) : isOneWayCurve ? (
              <OneWayCurveMarkings stripeColor={stripeColor} variant="nw" />
            ) : isOneWayCurveReverse ? (
              <OneWayCurveMarkings stripeColor={stripeColor} variant="se" />
            ) : (
               <path d={`M ${TILE_CENTER} 0 Q ${TILE_CENTER} ${TILE_CENTER} 0 ${TILE_CENTER}`} fill="none" stroke={stripeColor} strokeWidth="2" strokeDasharray="8,8" />
            )}
          </>
        );
      case 'road-t':
      case 'rail-t':
      case 'road-4lane-t':
        const is4LaneT = type === 'road-4lane-t';
        const tRoadWidth = is4LaneT ? ROAD_WIDTH_4L : ROAD_WIDTH_2L;
        const tRoadX = is4LaneT ? ROAD_INSET_4L : ROAD_INSET_2L;
        return (
          <>
            <rect x={tRoadX} y="0" width={tRoadWidth} height="64" fill={color} />
            <rect x="0" y={(64 - tRoadWidth) / 2} width="32" height={tRoadWidth} fill={color} />
            {isRail && (
              <>
                {/* Vertical ties */}
                {[8, 24, 40, 56].map(y => (
                  <rect key={y} x={svgN(RAIL_LEFT - 3)} y={y-2} width={svgN(RAIL_RIGHT - RAIL_LEFT + 6)} height="4" fill={stripeColor} />
                ))}
                {/* Horizontal ties */}
                {[8, 24].map(x => (
                  <rect key={x} x={x-2} y={svgN(RAIL_LEFT - 3)} width="4" height={svgN(RAIL_RIGHT - RAIL_LEFT + 6)} fill={stripeColor} />
                ))}
                {/* Vertical rails */}
                <rect x={svgN(RAIL_LEFT)} y="0" width="2" height="64" fill={railMetalColor} />
                <rect x={svgN(RAIL_RIGHT)} y="0" width="2" height="64" fill={railMetalColor} />
                {/* Horizontal rails */}
                <rect x="0" y={svgN(RAIL_LEFT)} width="32" height="2" fill={railMetalColor} />
                <rect x="0" y={svgN(RAIL_RIGHT)} width="32" height="2" fill={railMetalColor} />
              </>
            )}
            {!isRail && (
              <>
                {is4LaneT ? (
                  <>
                    <rect x={TILE_CENTER - 1} y="0" width="2" height="64" fill="#fbbf24" />
                    <rect x="0" y={TILE_CENTER - 1} width="32" height="2" fill="#fbbf24" />
                    <line x1={svgN(DIVIDER_LEFT)} y1="0" x2={svgN(DIVIDER_LEFT)} y2="64" stroke={stripeColor} strokeWidth="1" strokeDasharray="4,4" opacity="0.6" />
                    <line x1={svgN(DIVIDER_RIGHT)} y1="0" x2={svgN(DIVIDER_RIGHT)} y2="64" stroke={stripeColor} strokeWidth="1" strokeDasharray="4,4" opacity="0.6" />
                    <line x1="0" y1={svgN(DIVIDER_LEFT)} x2="32" y2={svgN(DIVIDER_LEFT)} stroke={stripeColor} strokeWidth="1" strokeDasharray="4,4" opacity="0.6" />
                    <line x1="0" y1={svgN(DIVIDER_RIGHT)} x2="32" y2={svgN(DIVIDER_RIGHT)} stroke={stripeColor} strokeWidth="1" strokeDasharray="4,4" opacity="0.6" />
                  </>
                ) : (
                  <>
                    <rect x={TILE_CENTER - 1} y="8" width="2" height="12" fill={stripeColor} />
                    <rect x={TILE_CENTER - 1} y="44" width="2" height="12" fill={stripeColor} />
                    <rect x={svgN(ROAD_INSET_2L - 12)} y={TILE_CENTER - 1} width="12" height="2" fill={stripeColor} />
                  </>
                )}
              </>
            )}
          </>
        );
      case 'road-cross':
      case 'rail-cross':
      case 'road-4lane-cross':
        const is4LaneCross = type === 'road-4lane-cross';
        const crossRoadWidth = is4LaneCross ? ROAD_WIDTH_4L : ROAD_WIDTH_2L;
        const crossRoadX = is4LaneCross ? ROAD_INSET_4L : ROAD_INSET_2L;
        return (
          <>
            <rect x={crossRoadX} y="0" width={crossRoadWidth} height="64" fill={color} />
            <rect x="0" y={(64 - crossRoadWidth) / 2} width="64" height={crossRoadWidth} fill={color} />
            {isRail && (
              <>
                {/* Vertical ties */}
                {[8, 24, 40, 56].map(y => (
                  <rect key={y} x={svgN(RAIL_LEFT - 3)} y={y-2} width={svgN(RAIL_RIGHT - RAIL_LEFT + 6)} height="4" fill={stripeColor} />
                ))}
                {/* Horizontal ties */}
                {[8, 24, 40, 56].map(x => (
                  <rect key={x} x={x-2} y={svgN(RAIL_LEFT - 3)} width="4" height={svgN(RAIL_RIGHT - RAIL_LEFT + 6)} fill={stripeColor} />
                ))}
                {/* Vertical rails */}
                <rect x={svgN(RAIL_LEFT)} y="0" width="2" height="64" fill={railMetalColor} />
                <rect x={svgN(RAIL_RIGHT)} y="0" width="2" height="64" fill={railMetalColor} />
                {/* Horizontal rails */}
                <rect x="0" y={svgN(RAIL_LEFT)} width="64" height="2" fill={railMetalColor} />
                <rect x="0" y={svgN(RAIL_RIGHT)} width="64" height="2" fill={railMetalColor} />
              </>
            )}
            {!isRail && (
              <>
                {is4LaneCross ? (
                  <>
                    <rect x={TILE_CENTER - 1} y="0" width="2" height="64" fill="#fbbf24" />
                    <rect x="0" y={TILE_CENTER - 1} width="64" height="2" fill="#fbbf24" />
                    <line x1={svgN(DIVIDER_LEFT)} y1="0" x2={svgN(DIVIDER_LEFT)} y2="64" stroke={stripeColor} strokeWidth="1" strokeDasharray="4,4" opacity="0.6" />
                    <line x1={svgN(DIVIDER_RIGHT)} y1="0" x2={svgN(DIVIDER_RIGHT)} y2="64" stroke={stripeColor} strokeWidth="1" strokeDasharray="4,4" opacity="0.6" />
                    <line x1="0" y1={svgN(DIVIDER_LEFT)} x2="64" y2={svgN(DIVIDER_LEFT)} stroke={stripeColor} strokeWidth="1" strokeDasharray="4,4" opacity="0.6" />
                    <line x1="0" y1={svgN(DIVIDER_RIGHT)} x2="64" y2={svgN(DIVIDER_RIGHT)} stroke={stripeColor} strokeWidth="1" strokeDasharray="4,4" opacity="0.6" />
                  </>
                ) : (
                  <>
                    <rect x={TILE_CENTER - 1} y="8" width="2" height="12" fill={stripeColor} />
                    <rect x={TILE_CENTER - 1} y="44" width="2" height="12" fill={stripeColor} />
                    <rect x={svgN(ROAD_INSET_2L - 12)} y={TILE_CENTER - 1} width="12" height="2" fill={stripeColor} />
                    <rect x={svgN(ROAD_OUTER_2L)} y={TILE_CENTER - 1} width="12" height="2" fill={stripeColor} />
                  </>
                )}
              </>
            )}
          </>
        );
      case 'road-roundabout':
        return (
          <>
            {/* The roundabout arc (quarter circle) */}
            <path 
              d={`M ${svgN(ROAD_INSET_2L)} 64 A ${svgN(ROAD_OUTER_2L)} ${svgN(ROAD_OUTER_2L)} 0 0 1 64 ${svgN(ROAD_INSET_2L)} L 64 ${svgN(ROAD_OUTER_2L)} A ${svgN(ROAD_INSET_2L)} ${svgN(ROAD_INSET_2L)} 0 0 0 ${svgN(ROAD_OUTER_2L)} 64 Z`}
              fill={color} 
            />
            {/* The entrance/exit road */}
            <rect x="0" y={svgN(ROAD_INSET_2L)} width="32" height={svgN(ROAD_WIDTH_2L)} fill={color} />
            {/* Markings */}
            <path 
              d={`M ${TILE_CENTER} 64 A ${TILE_CENTER} ${TILE_CENTER} 0 0 1 64 ${TILE_CENTER}`}
              fill="none" 
              stroke={stripeColor} 
              strokeWidth="2" 
              strokeDasharray="8,8" 
            />
            <line x1="0" y1={TILE_CENTER - 1} x2={svgN(ROAD_OUTER_2L - 20)} y2={TILE_CENTER - 1} stroke={stripeColor} strokeWidth="2" strokeDasharray="8,8" />
          </>
        );
      case 'road-end':
      case 'road-4lane-end':
      case 'rail-end':
        const is4LaneEnd = type === 'road-4lane-end';
        const endWidth = is4LaneEnd ? ROAD_WIDTH_4L : ROAD_WIDTH_2L;
        const endX = is4LaneEnd ? ROAD_INSET_4L : ROAD_INSET_2L;
        return (
          <>
            <rect x={endX} y="32" width={endWidth} height="32" fill={color} />
            {isRail ? (
              <>
                <rect x={svgN(RAIL_LEFT - 3)} y="40" width={svgN(RAIL_RIGHT - RAIL_LEFT + 6)} height="4" fill={stripeColor} />
                <rect x={svgN(RAIL_LEFT - 3)} y="56" width={svgN(RAIL_RIGHT - RAIL_LEFT + 6)} height="4" fill={stripeColor} />
                <rect x={svgN(RAIL_LEFT)} y="32" width="2" height="32" fill={railMetalColor} />
                <rect x={svgN(RAIL_RIGHT)} y="32" width="2" height="32" fill={railMetalColor} />
                <rect x={svgN(RAIL_LEFT - 3)} y="32" width={svgN(RAIL_RIGHT - RAIL_LEFT + 6)} height="4" fill="#64748b" />
              </>
            ) : is4LaneEnd ? (
              <>
                <rect x={TILE_CENTER - 1} y="32" width="2" height="32" fill="#fbbf24" />
                <line x1={svgN(DIVIDER_LEFT)} y1="32" x2={svgN(DIVIDER_LEFT)} y2="64" stroke={stripeColor} strokeWidth="1" strokeDasharray="4,4" opacity="0.6" />
                <line x1={svgN(DIVIDER_RIGHT)} y1="32" x2={svgN(DIVIDER_RIGHT)} y2="64" stroke={stripeColor} strokeWidth="1" strokeDasharray="4,4" opacity="0.6" />
                <rect x={endX} y="32" width={endWidth} height="4" fill="#475569" />
              </>
            ) : (
              <>
                <rect x={TILE_CENTER - 1} y="44" width="2" height="12" fill={stripeColor} />
                <rect x={endX} y="32" width={endWidth} height="4" fill="#475569" />
              </>
            )}
          </>
        );
      case 'road-transition-2to4':
        return (
          <>
            <path d={`M ${svgN(ROAD_INSET_2L)} 0 L ${svgN(ROAD_OUTER_2L)} 0 L ${svgN(ROAD_OUTER_4L)} 64 L ${svgN(ROAD_INSET_4L)} 64 Z`} fill={color} />
            <rect x={TILE_CENTER - 1} y="8" width="2" height="12" fill={stripeColor} />
            <rect x={TILE_CENTER - 1} y="44" width="2" height="12" fill={stripeColor} />
            <path d={`M ${svgN(DIVIDER_LEFT)} 40 L ${svgN(DIVIDER_LEFT)} 56`} stroke={stripeColor} strokeWidth="1" strokeDasharray="4,4" opacity="0.5" />
            <path d={`M ${svgN(DIVIDER_RIGHT)} 40 L ${svgN(DIVIDER_RIGHT)} 56`} stroke={stripeColor} strokeWidth="1" strokeDasharray="4,4" opacity="0.5" />
          </>
        );
      case 'building-home':
        return (
          <>
            <rect x="16" y="32" width="32" height="24" fill="#fca5a5" />
            <path d="M 12 32 L 32 12 L 52 32 Z" fill="#b91c1c" />
            <rect x="28" y="44" width="8" height="12" fill="#451a03" />
            <rect x="20" y="36" width="6" height="6" fill="#bfdbfe" />
            <rect x="38" y="36" width="6" height="6" fill="#bfdbfe" />
          </>
        );
      case 'building-school':
        return (
          <>
            <rect x="8" y="24" width="48" height="32" fill="#fde68a" />
            <rect x="24" y="8" width="16" height="16" fill="#f59e0b" />
            <rect x="28" y="12" width="8" height="8" fill="#ffffff" />
            <circle cx="32" cy="16" r="1" fill="#000000" />
            <rect x="28" y="44" width="8" height="12" fill="#451a03" />
            {[12, 20, 36, 44].map(x => (
              <rect key={x} x={x} y="28" width="6" height="8" fill="#bfdbfe" />
            ))}
          </>
        );
      case 'building-store':
        return (
          <>
            <rect x="8" y="16" width="48" height="40" fill="#e2e8f0" />
            <rect x="8" y="16" width="48" height="8" fill="#3b82f6" />
            <rect x="12" y="32" width="40" height="16" fill="#bfdbfe" />
            <rect x="28" y="44" width="8" height="12" fill="#475569" />
            <path d="M 8 24 L 16 32 L 24 24 L 32 32 L 40 24 L 48 32 L 56 24 Z" fill="#2563eb" />
          </>
        );
      case 'building-playground':
        return (
          <>
            <rect x="0" y="0" width="64" height="64" fill="#dcfce7" />
            <path d="M 16 16 L 32 48" stroke="#f43f5e" strokeWidth="4" strokeLinecap="round" />
            <rect x="40" y="16" width="16" height="16" fill="#3b82f6" opacity="0.6" />
            <circle cx="48" cy="48" r="8" fill="#fbbf24" />
          </>
        );
      case 'building-police':
        return (
          <>
            <rect x="8" y="16" width="48" height="40" fill="#1e3a8a" />
            <rect x="12" y="24" width="40" height="8" fill="#ffffff" opacity="0.2" />
            <path d="M 32 24 L 36 32 L 44 32 L 38 38 L 40 46 L 32 40 L 24 46 L 26 38 L 20 32 L 28 32 Z" fill="#fbbf24" />
            <rect x="28" y="44" width="8" height="12" fill="#0f172a" />
          </>
        );
      case 'building-fire':
        return (
          <>
            <rect x="8" y="16" width="48" height="40" fill="#991b1b" />
            <rect x="12" y="32" width="20" height="24" fill="#475569" />
            <rect x="36" y="32" width="16" height="16" fill="#bfdbfe" />
            <circle cx="32" cy="12" r="4" fill="#fbbf24" />
          </>
        );
      case 'rail-road-crossing':
        return (
          <>
            <rect x="0" y={svgN(ROAD_INSET_2L)} width="64" height={svgN(ROAD_WIDTH_2L)} fill="#374151" />
            <rect x={svgN(ROAD_INSET_2L)} y="0" width={svgN(ROAD_WIDTH_2L)} height="64" fill="transparent" />
            {[8, 24, 40, 56].map(y => (
              <rect key={y} x={svgN(RAIL_LEFT - 3)} y={y-2} width={svgN(RAIL_RIGHT - RAIL_LEFT + 6)} height="4" fill="#9ca3af" />
            ))}
            <rect x={svgN(RAIL_LEFT)} y="0" width="2" height="64" fill={railMetalColor} />
            <rect x={svgN(RAIL_RIGHT)} y="0" width="2" height="64" fill={railMetalColor} />
            <rect x={svgN(ROAD_INSET_2L - 12)} y={TILE_CENTER - 1} width="12" height="2" fill="#ffffff" />
            <rect x={svgN(ROAD_OUTER_2L)} y={TILE_CENTER - 1} width="12" height="2" fill="#ffffff" />
            <circle cx="12" cy="12" r="4" fill="#ef4444" />
            <circle cx="52" cy="52" r="4" fill="#ef4444" />
          </>
        );
      case 'building-factory':
        return (
          <>
            <rect x="8" y="16" width="48" height="32" fill="#94a3b8" />
            <path d="M 8 16 L 24 8 L 40 16 L 56 8 L 56 16 Z" fill="#64748b" />
            <rect x="16" y="40" width="8" height="8" fill="#334155" />
            <rect x="40" y="24" width="8" height="8" fill="#cbd5e1" />
            <rect x="24" y="0" width="8" height="12" fill="#475569" />
          </>
        );
      case 'building-warehouse':
        return (
          <>
            <rect x="8" y="8" width="48" height="48" fill="#cbd5e1" />
            <rect x="12" y="12" width="40" height="40" fill="#94a3b8" stroke="#64748b" strokeWidth="2" />
            <rect x="24" y="40" width="16" height="12" fill="#475569" />
          </>
        );
      case 'building-station':
        return (
          <>
            <rect x="4" y="4" width="56" height="56" fill="#f1f5f9" />
            <rect x="12" y="12" width="40" height="40" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="2" />
            <rect x="0" y="48" width="64" height="16" fill="#4b5563" />
            <rect x="20" y="20" width="24" height="24" fill="#3b82f6" opacity="0.3" />
          </>
        );
      // === NEW LARGE MULTI-TILE BUILDINGS (relative to 1x1 house) ===
      case 'building-strip-mall':
        // 3x1 strip of shops - repeated facades + awnings
        return (
          <>
            <rect x="0" y="0" width="64" height="64" fill="#e2e8f0" />
            {/* Shop bays */}
            {[0, 21, 42].map((ox, i) => (
              <g key={i}>
                <rect x={ox + 2} y="8" width="18" height="40" fill="#f8fafc" stroke="#64748b" strokeWidth="1" />
                <rect x={ox + 4} y="12" width="14" height="18" fill="#bfdbfe" opacity="0.7" />
                <rect x={ox + 8} y="38" width="6" height="10" fill="#475569" />
                <rect x={ox + 2} y="4" width="18" height="6" fill="#1e40af" />
              </g>
            ))}
            <text x="32" y="58" fill="#334155" fontSize="7" textAnchor="middle" fontWeight="bold">STRIP MALL</text>
          </>
        );
      case 'building-lumbermill':
        // 3x2 sawmill + log yard + 1 dock bay
        return (
          <>
            <rect x="0" y="0" width="64" height="64" fill="#f1f5f9" />
            {/* Main mill building (left 2 cols) */}
            <rect x="4" y="8" width="40" height="32" fill="#78716c" stroke="#44403c" strokeWidth="2" />
            <circle cx="24" cy="24" r="9" fill="#57534e" />
            <circle cx="24" cy="24" r="5" fill="#fbbf24" />
            {/* Saw teeth */}
            {[0,1,2].map(k => <rect key={k} x={18+k*4} y="18" width="2" height="12" fill="#e2e8f0" />)}
            {/* Log piles (right side + bottom) */}
            {[48, 52, 56].map((x,i) => <rect key={i} x={x} y="12" width="5" height="18" fill="#78350f" />)}
            <rect x="8" y="44" width="48" height="12" fill="#854d0e" />
            {/* Dock bay marking (localY=1 row) */}
            {localY === 1 && <rect x="4" y="48" width="56" height="12" fill="#334155" />}
            {localY === 1 && <text x="32" y="57" fill="#fbbf24" fontSize="6" textAnchor="middle">LOAD</text>}
            <text x="32" y="6" fill="#fefce8" fontSize="6" textAnchor="middle" fontWeight="bold">LUMBER</text>
          </>
        );
      case 'building-apartment':
        // 2x3 multi-unit with windows/balconies
        return (
          <>
            <rect x="0" y="0" width="64" height="64" fill="#64748b" />
            {/* Windows grid per floor */}
            {[12,28,44].map((fy, fi) => (
              [8, 24, 40, 52].map((wx, wi) => (
                <rect key={`${fi}-${wi}`} x={wx} y={fy} width="10" height="10" fill="#bfdbfe" stroke="#1e293b" strokeWidth="0.5" />
              ))
            ))}
            {/* Balconies on right column */}
            {[14,30,46].map(y => <rect key={y} x="52" y={y} width="8" height="6" fill="#475569" />)}
            <rect x="22" y="52" width="20" height="10" fill="#334155" />
            <text x="32" y="60" fill="#e0f2fe" fontSize="5" textAnchor="middle">APARTMENTS</text>
          </>
        );
      case 'building-highschool':
        // 3x3 campus building + yard
        return (
          <>
            <rect x="0" y="0" width="64" height="64" fill="#dcfce7" />
            <rect x="8" y="12" width="48" height="28" fill="#fde68a" stroke="#b45309" strokeWidth="2" />
            <rect x="24" y="4" width="16" height="12" fill="#f59e0b" />
            {/* Windows + doors */}
            {[14,26,38,50].map(x => <rect key={x} x={x} y="18" width="8" height="8" fill="#bfdbfe" />)}
            <rect x="28" y="32" width="8" height="8" fill="#451a03" />
            {/* Yard / track hint */}
            <circle cx="48" cy="50" r="10" fill="none" stroke="#86efac" strokeWidth="3" />
            <text x="32" y="58" fill="#166534" fontSize="6" textAnchor="middle" fontWeight="bold">HIGH SCHOOL</text>
          </>
        );
      case 'building-college':
        // 4x2 quad + buildings
        return (
          <>
            <rect x="0" y="0" width="64" height="64" fill="#e0e7ff" />
            {/* Wings */}
            <rect x="4" y="8" width="24" height="20" fill="#6366f1" />
            <rect x="36" y="8" width="24" height="20" fill="#6366f1" />
            {/* Central quad green */}
            <rect x="20" y="32" width="24" height="18" fill="#86efac" />
            {[10,22,34,46].map(x => <rect key={x} x={x} y="12" width="6" height="10" fill="#bfdbfe" />)}
            <text x="32" y="56" fill="#312e81" fontSize="7" textAnchor="middle" fontWeight="bold">COLLEGE</text>
          </>
        );
      case 'building-university':
        // 4x3 large campus with spanning architecture + prominent label
        return (
          <>
            <rect x="0" y="0" width="64" height="64" fill="#e0f2fe" />
            {/* Main quad and central hall spanning center cells */}
            <rect x="12" y="12" width="40" height="28" fill="#1e40af" rx="2" />
            <rect x="18" y="8" width="28" height="8" fill="#1e3a8a" />
            {/* Tower */}
            <rect x="28" y="4" width="8" height="12" fill="#312e81" />
            <polygon points="24,4 32,0 40,4" fill="#1e3a8a" />
            {/* Left and right academic wings - unique per side */}
            <rect x="2" y="18" width="20" height="30" fill="#3b82f6" />
            <rect x="42" y="18" width="20" height="30" fill="#3b82f6" />
            {/* Arched windows and details varying by cell */}
            {localX < 2 && <rect x="6" y="24" width="4" height="18" fill="#bae6fd" />}
            {localX > 2 && <rect x="52" y="24" width="4" height="18" fill="#bae6fd" />}
            <circle cx="32" cy="26" r="6" fill="#fbbf24" /> {/* seal */}
            {/* Large clear label designed for the scale */}
            <text x="32" y="54" fill="#0c4a6e" fontSize="10" textAnchor="middle" fontWeight="bold" letterSpacing="2">UNIVERSITY</text>
          </>
        );
      case 'building-large-park':
        // 4x4 large park with proper spanning decorations + clear label
        return (
          <>
            <rect x="0" y="0" width="64" height="64" fill="#4ade80" />
            {/* Varied grass and tree clusters designed for large area */}
            {localX % 2 === 0 && localY % 2 === 0 && <circle cx="20" cy="20" r="8" fill="#16a34a" />}
            {localX === 3 && localY === 0 && <circle cx="50" cy="12" r="6" fill="#166534" />}
            {localX === 0 && localY === 3 && <circle cx="12" cy="52" r="7" fill="#15803d" />}
            
            {/* Playground spanning NW cells */}
            {(localX <= 1 && localY <= 1) && (
              <>
                <rect x="6" y="6" width="52" height="22" fill="#86efac" rx="2" />
                <path d="M12 10 L12 24" stroke="#e11d48" strokeWidth="3" />
                <rect x="22" y="8" width="10" height="14" fill="#3b82f6" rx="1" />
                <circle cx="40" cy="16" r="5" fill="#fbbf24" />
                <rect x="48" y="20" width="6" height="3" fill="#854d0e" />
              </>
            )}
            
            {/* Full baseball diamond designed for large SE area */}
            {(localX >= 1 && localY >= 1) && (
              <>
                <path d="M 8 56 Q 56 56 56 8" fill="none" stroke="#166534" strokeWidth="2" /> {/* outfield arc */}
                <rect x="22" y="28" width="20" height="20" fill="#854d0e" /> {/* infield */}
                <polygon points="32,32 40,40 32,48 24,40" fill="#fefce8" /> {/* bases */}
                <circle cx="32" cy="50" r="2.5" fill="#fff" /> {/* home plate */}
                <text x="32" y="62" fill="#052e16" fontSize="7" textAnchor="middle" fontWeight="bold">BASEBALL</text>
              </>
            )}
            
            {/* Prominent label */}
            <text x="32" y="14" fill="#052e16" fontSize="9" textAnchor="middle" fontWeight="bold" letterSpacing="1">CENTRAL PARK</text>
          </>
        );
      case 'building-warehouse-large':
        // 3x2 big box + 2 loading docks at bottom
        return (
          <>
            <rect x="0" y="0" width="64" height="64" fill="#cbd5e1" />
            <rect x="4" y="4" width="56" height="36" fill="#94a3b8" stroke="#475569" strokeWidth="2" />
            {/* Roll doors / roof lines */}
            <rect x="8" y="8" width="16" height="24" fill="#64748b" />
            <rect x="28" y="8" width="16" height="24" fill="#64748b" />
            <rect x="48" y="8" width="8" height="24" fill="#475569" />
            {/* DOCK cells (localY=1) asphalt + bay markings */}
            {localY === 1 && (
              <>
                <rect x="0" y="42" width="64" height="22" fill="#334155" />
                <rect x="6" y="46" width="20" height="14" fill="#1e293b" />
                <rect x="34" y="46" width="20" height="14" fill="#1e293b" />
                <text x="16" y="55" fill="#fbbf24" fontSize="5" textAnchor="middle">DOCK</text>
                <text x="44" y="55" fill="#fbbf24" fontSize="5" textAnchor="middle">DOCK</text>
              </>
            )}
            <text x="32" y="26" fill="#e2e8f0" fontSize="8" textAnchor="middle" fontWeight="bold">WAREHOUSE</text>
          </>
        );
      case 'building-repair-shop': {
        // 4×6 shop + 4 deep service bays (localY >= 3)
        const bay = (localY ?? 0) >= 3;
        const bayNum = (localX ?? 0) + 1;
        return (
          <>
            {bay ? (
              <>
                <rect x="0" y="0" width="64" height="64" fill="#475569" />
                <rect x="4" y="2" width="56" height="60" fill="#334155" />
                {/* Bay lane stripes */}
                <line x1="32" y1="4" x2="32" y2="60" stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="4 4" />
                <rect x="8" y="6" width="48" height="8" fill="#1e293b" opacity="0.5" />
                <text x="32" y="36" fill="#fbbf24" fontSize="10" textAnchor="middle" fontWeight="bold">
                  BAY {bayNum}
                </text>
                <text x="32" y="48" fill="#94a3b8" fontSize="5" textAnchor="middle">SERVICE</text>
              </>
            ) : (
              <>
                <rect x="0" y="0" width="64" height="64" fill="#e2e8f0" />
                <rect x="4" y="8" width="56" height="40" fill="#fb923c" stroke="#c2410c" strokeWidth="2" />
                <rect x="10" y="14" width="18" height="14" fill="#fdba74" />
                <rect x="36" y="14" width="18" height="14" fill="#fdba74" />
                <rect x="24" y="34" width="16" height="14" fill="#7c2d12" />
                {/* Tool / lift hint */}
                {(localX ?? 0) === 0 && (localY ?? 0) === 0 && (
                  <text x="32" y="6" fill="#9a3412" fontSize="6" textAnchor="middle" fontWeight="bold">REPAIR</text>
                )}
                {(localY ?? 0) === 2 && (
                  <rect x="0" y="52" width="64" height="12" fill="#334155" />
                )}
                <text x="32" y="30" fill="#fff7ed" fontSize="7" textAnchor="middle" fontWeight="bold">
                  {(localY ?? 0) === 1 ? 'SHOP' : 'GARAGE'}
                </text>
              </>
            )}
          </>
        );
      }
      case 'building-hospital': {
        // 4×4 hospital: wards (localY 0–1) + ambulance bays (localY 2–3)
        const ambBay = (localY ?? 0) >= 2;
        const bayNum = (localX ?? 0) + 1;
        return (
          <>
            {ambBay ? (
              <>
                <rect x="0" y="0" width="64" height="64" fill="#64748b" />
                <rect x="3" y="2" width="58" height="60" fill="#475569" />
                <line x1="32" y1="4" x2="32" y2="60" stroke="#f8fafc" strokeWidth="1.5" strokeDasharray="4 3" />
                <rect x="10" y="8" width="44" height="10" fill="#1e293b" opacity="0.45" />
                <text x="32" y="34" fill="#fecaca" fontSize="9" textAnchor="middle" fontWeight="bold">
                  EMS {bayNum}
                </text>
                <text x="32" y="46" fill="#e2e8f0" fontSize="5" textAnchor="middle">AMBULANCE</text>
                {/* Red cross hint on bay apron */}
                <rect x="28" y="52" width="8" height="2" fill="#ef4444" />
                <rect x="31" y="49" width="2" height="8" fill="#ef4444" />
              </>
            ) : (
              <>
                <rect x="0" y="0" width="64" height="64" fill="#fce7f3" />
                <rect x="4" y="6" width="56" height="46" fill="#fff" stroke="#e11d48" strokeWidth="2" />
                {/* Red cross */}
                <rect x="26" y="16" width="12" height="28" fill="#ef4444" />
                <rect x="18" y="24" width="28" height="12" fill="#ef4444" />
                {/* Windows */}
                <rect x="8" y="12" width="8" height="8" fill="#bfdbfe" />
                <rect x="48" y="12" width="8" height="8" fill="#bfdbfe" />
                <rect x="8" y="40" width="8" height="8" fill="#bfdbfe" />
                <rect x="48" y="40" width="8" height="8" fill="#bfdbfe" />
                {(localX ?? 0) === 0 && (localY ?? 0) === 0 && (
                  <text x="32" y="8" fill="#9f1239" fontSize="6" textAnchor="middle" fontWeight="bold">HOSPITAL</text>
                )}
                {(localY ?? 0) === 1 && (
                  <>
                    <rect x="0" y="54" width="64" height="10" fill="#e11d48" />
                    <text x="32" y="61" fill="#fff" fontSize="6" textAnchor="middle" fontWeight="bold">
                      {(localX ?? 0) === 0 ? 'ER' : (localX ?? 0) === 3 ? 'WARDS' : 'CARE'}
                    </text>
                  </>
                )}
              </>
            )}
          </>
        );
      }
      case 'building-factory-large':
        // 3x2 industrial + chimneys + 2 docks
        return (
          <>
            <rect x="0" y="0" width="64" height="64" fill="#e2e8f0" />
            <rect x="4" y="10" width="56" height="30" fill="#64748b" stroke="#334155" strokeWidth="2" />
            {/* Smokestacks */}
            <rect x="10" y="2" width="6" height="12" fill="#475569" />
            <rect x="48" y="2" width="6" height="12" fill="#475569" />
            <circle cx="13" cy="2" r="2" fill="#94a3b8" opacity="0.6" />
            {/* Conveyor / equipment */}
            <rect x="20" y="18" width="24" height="8" fill="#334155" />
            {/* Docks bottom */}
            {localY === 1 && (
              <>
                <rect x="0" y="42" width="64" height="22" fill="#334155" />
                <rect x="8" y="46" width="18" height="12" fill="#1e293b" />
                <rect x="38" y="46" width="18" height="12" fill="#1e293b" />
                <text x="17" y="55" fill="#f59e0b" fontSize="5" textAnchor="middle">IN</text>
                <text x="47" y="55" fill="#f59e0b" fontSize="5" textAnchor="middle">OUT</text>
              </>
            )}
            <text x="32" y="26" fill="#f1f5f9" fontSize="7" textAnchor="middle" fontWeight="bold">FACTORY</text>
          </>
        );
      case 'building-train-station-large':
        // 2x2 station + platforms
        return (
          <>
            <rect x="0" y="0" width="64" height="64" fill="#f8fafc" />
            <rect x="6" y="8" width="52" height="32" fill="#e2e8f0" stroke="#64748b" strokeWidth="2" />
            <rect x="14" y="14" width="36" height="18" fill="#3b82f6" opacity="0.25" />
            {/* Platform edge */}
            {localY === 1 && <rect x="0" y="42" width="64" height="8" fill="#475569" />}
            <rect x="24" y="40" width="16" height="6" fill="#1e40af" />
            <text x="32" y="24" fill="#1e293b" fontSize="6" textAnchor="middle" fontWeight="bold">STATION</text>
          </>
        );
      case 'grass-plain':
        return <rect x="0" y="0" width="64" height="64" fill="#dcfce7" />;
      case 'grass-tall':
        return (
          <>
            <rect x="0" y="0" width="64" height="64" fill="#dcfce7" />
            {[10, 30, 50].map(x => [10, 30, 50].map(y => (
              <path key={`${x}-${y}`} d={`M ${x} ${y} Q ${x+4} ${y-8} ${x+8} ${y}`} fill="none" stroke="#166534" strokeWidth="1" />
            )))}
          </>
        );
      case 'grass-flowers':
        return (
          <>
            <rect x="0" y="0" width="64" height="64" fill="#dcfce7" />
            {[16, 48].map(x => [16, 48].map(y => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r="2" fill="#f43f5e" />
            )))}
          </>
        );
      case 'tree-pine':
        return (
          <>
            <rect x="0" y="0" width="64" height="64" fill="#dcfce7" />
            <g style={isBurning ? { filter: `saturate(${1 - burnProgress * 0.85}) brightness(${1 - burnProgress * 0.45})` } : undefined}>
              <PineTreeGraphic />
            </g>
            {isBurning && <BurningTreeOverlay burnProgress={burnProgress} />}
          </>
        );
      case 'tree-pine-seedling': {
        const progress = Math.max(0, Math.min(1, growthProgress));
        const coneEnd = Math.max(0.01, Math.min(0.95, coneStageRatio));
        if (progress < coneEnd) {
          return (
            <>
              <rect x="0" y="0" width="64" height="64" fill="#dcfce7" />
              <g style={isBurning ? { filter: `saturate(${1 - burnProgress * 0.85}) brightness(${1 - burnProgress * 0.45})` } : undefined}>
                <ellipse cx="32" cy="50" rx="5" ry="7" fill="#92400e" />
                <path d="M 32 42 L 26 50 L 38 50 Z" fill="#78350f" />
                <path d="M 28 48 Q 32 44 36 48" fill="none" stroke="#451a03" strokeWidth="0.8" />
                <path d="M 27 52 Q 32 48 37 52" fill="none" stroke="#451a03" strokeWidth="0.8" />
              </g>
              {isBurning && <BurningTreeOverlay burnProgress={burnProgress} />}
            </>
          );
        }
        const t = (progress - coneEnd) / (1 - coneEnd);
        const scale = 0.08 + t * 0.92;
        return (
          <>
            <rect x="0" y="0" width="64" height="64" fill="#dcfce7" />
            <g
              transform={`translate(32 56) scale(${scale}) translate(-32 -56)`}
              style={isBurning ? { filter: `saturate(${1 - burnProgress * 0.85}) brightness(${1 - burnProgress * 0.45})` } : undefined}
            >
              <PineTreeGraphic />
            </g>
            {isBurning && <BurningTreeOverlay burnProgress={burnProgress} />}
          </>
        );
      }
      case 'tree-oak':
        return (
          <>
            <rect x="0" y="0" width="64" height="64" fill="#dcfce7" />
            <g style={isBurning ? { filter: `saturate(${1 - burnProgress * 0.85}) brightness(${1 - burnProgress * 0.45})` } : undefined}>
              <circle cx="32" cy="24" r="16" fill="#166534" />
              <rect x="28" y="40" width="8" height="16" fill="#451a03" />
            </g>
            {isBurning && <BurningTreeOverlay burnProgress={burnProgress} />}
          </>
        );
      case 'landscape-gravel':
        return (
          <>
            <rect x="0" y="0" width="64" height="64" fill="#f1f5f9" />
            {[...Array(20)].map((_, i) => (
              <circle key={i} cx={(i * 13) % 64} cy={(i * 17) % 64} r="1" fill="#94a3b8" />
            ))}
          </>
        );
      case 'landscape-sand':
        return (
          <>
            <rect x="0" y="0" width="64" height="64" fill="#fef3c7" />
            {[...Array(30)].map((_, i) => (
              <circle key={i} cx={(i * 7) % 64} cy={(i * 11) % 64} r="0.5" fill="#f59e0b" opacity="0.5" />
            ))}
          </>
        );
      default:
        return null;
    }
  };

  return (
    <svg 
      viewBox="0 0 64 64" 
      width={size} 
      height={size} 
      className={`transition-transform duration-200 ${className}`}
      style={{ transform: `rotate(${rotation}deg)` }}
    >
      {renderContent()}
    </svg>
  );
};
