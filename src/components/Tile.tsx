import React from 'react';
import { TileType } from '../types';

interface TileProps {
  type: TileType;
  rotation?: number;
  size?: number;
  className?: string;
}

export const Tile: React.FC<TileProps> = ({ type, rotation = 0, size = 64, className = "" }) => {
  const isRail = type.startsWith('rail');
  const color = isRail ? 'transparent' : '#374151'; // Transparent for rail, Gray-700 for road
  const stripeColor = isRail ? '#9ca3af' : '#ffffff'; // Gray-400 for rail ties, White for road lines
  const railMetalColor = '#64748b'; // Slate-500 for the metal rails

  const renderContent = () => {
    switch (type) {
      case 'road-straight':
      case 'rail-straight':
      case 'road-bridge':
      case 'road-4lane-bridge':
      case 'rail-trestle':
      case 'road-oneway-straight':
      case 'road-4lane-straight':
        const isBridge = type === 'road-bridge' || type === 'rail-trestle' || type === 'road-4lane-bridge';
        const is4Lane = type === 'road-4lane-straight' || type === 'road-4lane-bridge';
        const isOneWay = type === 'road-oneway-straight';
        const roadWidth = is4Lane ? 40 : 24;
        const roadX = (64 - roadWidth) / 2;
        
        return (
          <>
            <rect x={roadX} y="0" width={roadWidth} height="64" fill={color} />
            {isRail ? (
              <>
                {/* Rail ties */}
                {[8, 24, 40, 56].map(y => (
                  <rect key={y} x="16" y={y-2} width="32" height="4" fill={stripeColor} />
                ))}
                {/* Metal rails */}
                <rect x="22" y="0" width="2" height="64" fill={railMetalColor} />
                <rect x="40" y="0" width="2" height="64" fill={railMetalColor} />
              </>
            ) : is4Lane ? (
              // 4-lane stripes: Yellow center, white dashed lanes
              <>
                {/* Yellow centerline */}
                <rect x="31" y="0" width="2" height="64" fill="#fbbf24" />
                {/* White dashed lane boundaries */}
                <line x1="21" y1="0" x2="21" y2="64" stroke={stripeColor} strokeWidth="1" strokeDasharray="4,4" opacity="0.6" />
                <line x1="43" y1="0" x2="43" y2="64" stroke={stripeColor} strokeWidth="1" strokeDasharray="4,4" opacity="0.6" />
              </>
            ) : isOneWay ? (
              // One-way arrow
              <>
                <rect x="31" y="8" width="2" height="12" fill={stripeColor} />
                <rect x="31" y="44" width="2" height="12" fill={stripeColor} />
                <path d="M 32 20 L 28 28 L 36 28 Z" fill={stripeColor} />
                <path d="M 32 36 L 28 44 L 36 44 Z" fill={stripeColor} />
              </>
            ) : (
              // Standard road stripes
              <>
                <rect x="31" y="8" width="2" height="12" fill={stripeColor} />
                <rect x="31" y="44" width="2" height="12" fill={stripeColor} />
              </>
            )}
            {isBridge && (
              <>
                <rect x="16" y="0" width="4" height="64" fill="#94a3b8" />
                <rect x="44" y="0" width="4" height="64" fill="#94a3b8" />
                {[4, 20, 36, 52].map(y => (
                  <rect key={y} x="16" y={y} width="32" height="2" fill="#64748b" />
                ))}
              </>
            )}
          </>
        );
      case 'road-curve':
      case 'rail-curve':
      case 'road-oneway-curve':
      case 'road-4lane-curve':
        const is4LaneCurve = type === 'road-4lane-curve';
        const isOneWayCurve = type === 'road-oneway-curve';
        return (
          <>
            {is4LaneCurve ? (
               <path d="M 52 0 Q 52 52 0 52 L 0 12 Q 12 12 12 0 Z" fill={color} />
            ) : (
               <path d="M 20 0 Q 20 20 0 20 L 0 44 Q 44 44 44 0 Z" fill={color} />
            )}
            {isRail ? (
               <>
                 <path d="M 32 0 Q 32 32 0 32" fill="none" stroke={stripeColor} strokeWidth="4" strokeDasharray="4,4" />
                 <path d="M 22 0 Q 22 22 0 22" fill="none" stroke={railMetalColor} strokeWidth="2" />
                 <path d="M 42 0 Q 42 42 0 42" fill="none" stroke={railMetalColor} strokeWidth="2" />
               </>
            ) : is4LaneCurve ? (
               <>
                 <path d="M 32 0 Q 32 32 0 32" fill="none" stroke="#fbbf24" strokeWidth="2" />
                 <path d="M 42 0 Q 42 42 0 42" fill="none" stroke={stripeColor} strokeWidth="1" strokeDasharray="4,4" opacity="0.6" />
                 <path d="M 22 0 Q 22 22 0 22" fill="none" stroke={stripeColor} strokeWidth="1" strokeDasharray="4,4" opacity="0.6" />
               </>
            ) : (
               <path d="M 32 0 Q 32 32 0 32" fill="none" stroke={stripeColor} strokeWidth="2" strokeDasharray="8,8" />
            )}
            {isOneWayCurve && (
              <path d="M 28 12 L 32 4 L 36 12 Z" fill={stripeColor} transform="rotate(-45 32 8)" />
            )}
          </>
        );
      case 'road-t':
      case 'rail-t':
      case 'road-4lane-t':
        const is4LaneT = type === 'road-4lane-t';
        const tRoadWidth = is4LaneT ? 40 : 24;
        const tRoadX = (64 - tRoadWidth) / 2;
        return (
          <>
            <rect x={tRoadX} y="0" width={tRoadWidth} height="64" fill={color} />
            <rect x="0" y={(64 - tRoadWidth) / 2} width="32" height={tRoadWidth} fill={color} />
            {isRail && (
              <>
                {/* Vertical ties */}
                {[8, 24, 40, 56].map(y => (
                  <rect key={y} x="16" y={y-2} width="32" height="4" fill={stripeColor} />
                ))}
                {/* Horizontal ties */}
                {[8, 24].map(x => (
                  <rect key={x} x={x-2} y="16" width="4" height="32" fill={stripeColor} />
                ))}
                {/* Vertical rails */}
                <rect x="22" y="0" width="2" height="64" fill={railMetalColor} />
                <rect x="40" y="0" width="2" height="64" fill={railMetalColor} />
                {/* Horizontal rails */}
                <rect x="0" y="22" width="32" height="2" fill={railMetalColor} />
                <rect x="0" y="40" width="32" height="2" fill={railMetalColor} />
              </>
            )}
            {!isRail && (
              <>
                {is4LaneT ? (
                  <>
                    {/* Vertical yellow center */}
                    <rect x="31" y="0" width="2" height="64" fill="#fbbf24" />
                    {/* Horizontal yellow center */}
                    <rect x="0" y="31" width="32" height="2" fill="#fbbf24" />
                    {/* Dashed lines */}
                    <line x1="21" y1="0" x2="21" y2="64" stroke={stripeColor} strokeWidth="1" strokeDasharray="4,4" opacity="0.6" />
                    <line x1="43" y1="0" x2="43" y2="64" stroke={stripeColor} strokeWidth="1" strokeDasharray="4,4" opacity="0.6" />
                    <line x1="0" y1="21" x2="32" y2="21" stroke={stripeColor} strokeWidth="1" strokeDasharray="4,4" opacity="0.6" />
                    <line x1="0" y1="43" x2="32" y2="43" stroke={stripeColor} strokeWidth="1" strokeDasharray="4,4" opacity="0.6" />
                  </>
                ) : (
                  <>
                    <rect x="31" y="8" width="2" height="12" fill={stripeColor} />
                    <rect x="31" y="44" width="2" height="12" fill={stripeColor} />
                    <rect x="8" y="31" width="12" height="2" fill={stripeColor} />
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
        const crossRoadWidth = is4LaneCross ? 40 : 24;
        const crossRoadX = (64 - crossRoadWidth) / 2;
        return (
          <>
            <rect x={crossRoadX} y="0" width={crossRoadWidth} height="64" fill={color} />
            <rect x="0" y={(64 - crossRoadWidth) / 2} width="64" height={crossRoadWidth} fill={color} />
            {isRail && (
              <>
                {/* Vertical ties */}
                {[8, 24, 40, 56].map(y => (
                  <rect key={y} x="16" y={y-2} width="32" height="4" fill={stripeColor} />
                ))}
                {/* Horizontal ties */}
                {[8, 24, 40, 56].map(x => (
                  <rect key={x} x={x-2} y="16" width="4" height="32" fill={stripeColor} />
                ))}
                {/* Vertical rails */}
                <rect x="22" y="0" width="2" height="64" fill={railMetalColor} />
                <rect x="40" y="0" width="2" height="64" fill={railMetalColor} />
                {/* Horizontal rails */}
                <rect x="0" y="22" width="64" height="2" fill={railMetalColor} />
                <rect x="0" y="40" width="64" height="2" fill={railMetalColor} />
              </>
            )}
            {!isRail && (
              <>
                {is4LaneCross ? (
                  <>
                    <rect x="31" y="0" width="2" height="64" fill="#fbbf24" />
                    <rect x="0" y="31" width="64" height="2" fill="#fbbf24" />
                    <line x1="21" y1="0" x2="21" y2="64" stroke={stripeColor} strokeWidth="1" strokeDasharray="4,4" opacity="0.6" />
                    <line x1="43" y1="0" x2="43" y2="64" stroke={stripeColor} strokeWidth="1" strokeDasharray="4,4" opacity="0.6" />
                    <line x1="0" y1="21" x2="64" y2="21" stroke={stripeColor} strokeWidth="1" strokeDasharray="4,4" opacity="0.6" />
                    <line x1="0" y1="43" x2="64" y2="43" stroke={stripeColor} strokeWidth="1" strokeDasharray="4,4" opacity="0.6" />
                  </>
                ) : (
                  <>
                    <rect x="31" y="8" width="2" height="12" fill={stripeColor} />
                    <rect x="31" y="44" width="2" height="12" fill={stripeColor} />
                    <rect x="8" y="31" width="12" height="2" fill={stripeColor} />
                    <rect x="44" y="31" width="12" height="2" fill={stripeColor} />
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
              d="M 20 64 A 44 44 0 0 1 64 20 L 64 44 A 20 20 0 0 0 44 64 Z" 
              fill={color} 
            />
            {/* The entrance/exit road */}
            <rect x="0" y="20" width="32" height="24" fill={color} />
            {/* Markings */}
            <path 
              d="M 32 64 A 32 32 0 0 1 64 32" 
              fill="none" 
              stroke={stripeColor} 
              strokeWidth="2" 
              strokeDasharray="8,8" 
            />
            <line x1="0" y1="31" x2="24" y2="31" stroke={stripeColor} strokeWidth="2" strokeDasharray="8,8" />
          </>
        );
      case 'road-end':
      case 'road-4lane-end':
      case 'rail-end':
        const is4LaneEnd = type === 'road-4lane-end';
        const endWidth = is4LaneEnd ? 40 : 24;
        const endX = (64 - endWidth) / 2;
        return (
          <>
            <rect x={endX} y="32" width={endWidth} height="32" fill={color} />
            {isRail ? (
              <>
                <rect x="16" y="40" width="32" height="4" fill={stripeColor} />
                <rect x="16" y="56" width="32" height="4" fill={stripeColor} />
                <rect x="22" y="32" width="2" height="32" fill={railMetalColor} />
                <rect x="40" y="32" width="2" height="32" fill={railMetalColor} />
                <rect x="16" y="32" width="32" height="4" fill="#64748b" />
              </>
            ) : is4LaneEnd ? (
              <>
                <rect x="31" y="32" width="2" height="32" fill="#fbbf24" />
                <line x1="21" y1="32" x2="21" y2="64" stroke={stripeColor} strokeWidth="1" strokeDasharray="4,4" opacity="0.6" />
                <line x1="43" y1="32" x2="43" y2="64" stroke={stripeColor} strokeWidth="1" strokeDasharray="4,4" opacity="0.6" />
                <rect x={endX} y="32" width={endWidth} height="4" fill="#475569" />
              </>
            ) : (
              <>
                <rect x="31" y="44" width="2" height="12" fill={stripeColor} />
                <rect x={endX} y="32" width={endWidth} height="4" fill="#475569" />
              </>
            )}
          </>
        );
      case 'road-transition-2to4':
        return (
          <>
            <path d="M 20 0 L 44 0 L 52 64 L 12 64 Z" fill={color} />
            <rect x="31" y="8" width="2" height="12" fill={stripeColor} />
            <rect x="31" y="44" width="2" height="12" fill={stripeColor} />
            <path d="M 22 40 L 23 56" stroke={stripeColor} strokeWidth="1" strokeDasharray="4,4" opacity="0.5" />
            <path d="M 42 40 L 41 56" stroke={stripeColor} strokeWidth="1" strokeDasharray="4,4" opacity="0.5" />
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
            <rect x="0" y="20" width="64" height="24" fill="#374151" />
            <rect x="20" y="0" width="24" height="64" fill="transparent" />
            {[8, 24, 40, 56].map(y => (
              <rect key={y} x="16" y={y-2} width="32" height="4" fill="#9ca3af" />
            ))}
            <rect x="22" y="0" width="2" height="64" fill={railMetalColor} />
            <rect x="40" y="0" width="2" height="64" fill={railMetalColor} />
            <rect x="8" y="31" width="12" height="2" fill="#ffffff" />
            <rect x="44" y="31" width="12" height="2" fill="#ffffff" />
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
            <path d="M 32 8 L 12 56 L 52 56 Z" fill="#065f46" />
            <rect x="28" y="56" width="8" height="4" fill="#451a03" />
          </>
        );
      case 'tree-oak':
        return (
          <>
            <rect x="0" y="0" width="64" height="64" fill="#dcfce7" />
            <circle cx="32" cy="24" r="16" fill="#166534" />
            <rect x="28" y="40" width="8" height="16" fill="#451a03" />
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
