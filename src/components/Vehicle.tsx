import React from 'react';
import {
  RAILCAR_LENGTH,
  RAILCAR_OFFSET_BASE,
  RAILCAR_OFFSET_SPACING,
  TRAILER_LENGTH,
  TRAILER_OFFSET_BASE,
  TRAILER_OFFSET_SPACING,
  VEHICLE_DIMS,
} from '../vehicleShapes';
import { motion } from 'motion/react';

import { RailcarType } from '../types';

interface VehicleProps {
  id: string;
  x: number;
  y: number;
  heading: number;
  lane: number;
  progress: number;
  color: string;
  zIndex: number;
  tileType?: string;
  tileRotation?: number;
  turnIntent?: 'left' | 'right' | null;
  exitHeading?: number;
  type?: 'car' | 'train' | 'semi' | 'fire-truck' | 'police' | 'ambulance' | 'tow-truck' | 'taxi' | 'bus';
  trailers?: number;
  railcars?: RailcarType[];
  tilePart?: 'anchor' | 'member';
  tileLocalX?: number;
  tileLocalY?: number;
  tileW?: number;
  tileH?: number;
  parkingStopUntil?: number;
  trafficStopUntil?: number;
  trafficStopReason?: 'stop-sign' | 'stoplight' | 'yield' | 'vehicle';
  parkingStallIndex?: number;
  lastParkingKey?: string;
  /** When false, service vehicle light bar is dark (default true for service types). */
  emergencyLightsOn?: boolean;
  onSelect?: (e: React.MouseEvent) => void;
  onTrailerSelect?: (trailerIndex: number, e: React.MouseEvent) => void;
  onRailcarSelect?: (railcarIndex: number, e: React.MouseEvent) => void;
  trailerCargos?: Record<string, number>[];
  railcarCargos?: Record<string, number>[];
  selectedRailcarIndex?: number;
  /** Trailer cargo badges (semis) */
  showCargoLabels?: boolean;
  /** Railcar cargo badges (trains); falls back to showCargoLabels when omitted */
  showRailcarCargoLabels?: boolean;
  /** Parking / traffic stop countdown badge */
  showStopTimerBadge?: boolean;
  itemEmojiResolver?: (itemId: string) => string;
}

const GRID_SIZE = 64;

export function getParkingStallOffset(
  tileType: string,
  tileLocalX = 0,
  tileLocalY = 0,
  tileW = 1,
  tileH = 1,
  stallIndex = 0
): { offsetX: number; offsetY: number; localRot: number } {
  let offsetX = 32;
  let offsetY = 32;
  let localRot = 0;

  if (tileType === 'parking-1x1' || tileType === 'parking-1x2' || tileType === 'parking-1x3') {
    offsetX = stallIndex === 0 ? 18 : 46;
    if (tileLocalY === 0) {
      offsetY = 16;
      localRot = 0;
    } else if (tileLocalY === tileH - 1) {
      offsetY = 48;
      localRot = 180;
    } else {
      offsetY = 32;
      localRot = 0;
    }
  } else if (tileType === 'parking-2x2') {
    offsetY = stallIndex === 0 ? 20 : 44;
    if (tileLocalX === 0) {
      offsetX = 16;
      localRot = 270;
    } else {
      offsetX = 48;
      localRot = 90;
    }
  } else if (tileType === 'parking-2x4') {
    offsetY = stallIndex === 0 ? 20 : 44;
    if (tileLocalX === 0) {
      offsetX = 16;
      localRot = 270;
    } else {
      offsetX = -48;
      localRot = 270;
    }
  } else if (tileType === 'parking-4x4') {
    if (tileLocalX === 0 || tileLocalX === 1) {
      offsetY = stallIndex === 0 ? 20 : 44;
      if (tileLocalX === 0) {
        offsetX = 16;
        localRot = 270;
      } else {
        offsetX = -48;
        localRot = 270;
      }
    } else {
      const carStalls = [14, 26, 38, 50];
      offsetY = carStalls[stallIndex % 4];
      if (tileLocalX === 2) {
        offsetX = 16;
        localRot = 270;
      } else {
        offsetX = 48;
        localRot = 90;
      }
    }
  } else if (tileType === 'building-repair-shop' || tileType === 'building-hospital') {
    // Service / ambulance bays: center vehicle in the bay cell, nose toward building
    offsetX = 32;
    offsetY = 32;
    localRot = 0;
  } else if (tileType === 'building-home') {
    // Driveway parking in front of the house
    offsetX = 32;
    offsetY = 50;
    localRot = 0;
  }

  return { offsetX, offsetY, localRot };
}

export function getParkingStallWorldPosition(
  gridX: number,
  gridY: number,
  tileType: string,
  tileRotation = 0,
  tileLocalX = 0,
  tileLocalY = 0,
  tileW = 1,
  tileH = 1,
  stallIndex = 0
): { posX: number; posY: number; rotation: number } {
  const { offsetX, offsetY, localRot } = getParkingStallOffset(
    tileType, tileLocalX, tileLocalY, tileW, tileH, stallIndex
  );
  const tileRotRad = (tileRotation * Math.PI) / 180;
  const dxLocal = offsetX - 32;
  const dyLocal = offsetY - 32;
  const worldOffsetX = dxLocal * Math.cos(tileRotRad) - dyLocal * Math.sin(tileRotRad);
  const worldOffsetY = dxLocal * Math.sin(tileRotRad) + dyLocal * Math.cos(tileRotRad);
  return {
    posX: (gridX + 0.5) * GRID_SIZE + worldOffsetX,
    posY: (gridY + 0.5) * GRID_SIZE + worldOffsetY,
    rotation: ((localRot + tileRotation) % 360 + 360) % 360,
  };
}

import { getTrajectory } from '../vehicleTrajectory';

export { getTrajectory };

function sampleHistory(history: {x: number, y: number, r: number, d: number}[], targetDist: number) {
  if (history.length === 1 || targetDist <= history[0].d) {
     const oldest = history[0];
     const overshoot = oldest.d - targetDist;
     const rad = (oldest.r - 90) * (Math.PI / 180);
     return {
       x: oldest.x - Math.cos(rad) * overshoot,
       y: oldest.y - Math.sin(rad) * overshoot,
       r: oldest.r
     };
  } else if (targetDist >= history[history.length - 1].d) {
     const newest = history[history.length - 1];
     const overshoot = targetDist - newest.d;
     const rad = (newest.r - 90) * (Math.PI / 180);
     return {
       x: newest.x + Math.cos(rad) * overshoot,
       y: newest.y + Math.sin(rad) * overshoot,
       r: newest.r
     };
  } else {
     for (let j = history.length - 1; j >= 1; j--) {
         const p1 = history[j-1];
         const p2 = history[j];
         if (targetDist >= p1.d && targetDist <= p2.d) {
             const t = (targetDist - p1.d) / (p2.d - p1.d);
             let rDiff = (p2.r - p1.r) % 360;
             if (rDiff > 180) rDiff -= 360;
             if (rDiff < -180) rDiff += 360;
             return {
               x: p1.x + (p2.x - p1.x) * t,
               y: p1.y + (p2.y - p1.y) * t,
               r: p1.r + rDiff * t
             };
         }
     }
  }
  return history[0];
}

const vehicleSelectHandlers = (onSelect?: (e: React.MouseEvent) => void) =>
  onSelect
    ? {
        onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
        onClick: (e: React.MouseEvent) => {
          e.stopPropagation();
          onSelect(e);
        },
      }
    : {};

export const TrailerVisual: React.FC<{
  posX: number;
  posY: number;
  rotation: number;
  zIndex?: number;
  onSelect?: (e: React.MouseEvent) => void;
  cargoLabels?: Array<{ emoji: string; qty: number }>;
  selected?: boolean;
}> = ({ posX, posY, rotation, zIndex = 0, onSelect, cargoLabels, selected }) => {
  const prevRotationRef = React.useRef(rotation);
  
  let diff = (rotation - prevRotationRef.current) % 360;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  
  const displayRotation = prevRotationRef.current + diff;
  prevRotationRef.current = displayRotation;

  return (
    <motion.div
      style={{
        position: 'absolute',
        width: VEHICLE_DIMS.trailer.width,
        height: VEHICLE_DIMS.trailer.length,
        backgroundColor: '#94a3b8',
        borderRadius: 1,
        border: `1px solid rgba(0,0,0,0.3)`,
        zIndex: 100 + zIndex,
        pointerEvents: onSelect ? 'auto' : 'none',
        cursor: onSelect ? 'pointer' : undefined,
      }}
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{
        opacity: 1,
        scale: 1,
        left: posX,
        top: posY,
        rotate: displayRotation,
        x: "-50%",
        y: "-50%",
        scaleX: zIndex > 0 ? 1.1 : 1,
        scaleY: zIndex > 0 ? 1.1 : 1,
      }}
      exit={{ opacity: 0, scale: 0.5 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      {...vehicleSelectHandlers(onSelect)}
    >
      {selected && (
        <div
          style={{
            position: 'absolute',
            inset: -4,
            border: '2px solid #fbbf24',
            borderRadius: 2,
            pointerEvents: 'none',
          }}
        />
      )}
      {cargoLabels && cargoLabels.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: -10,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: 2,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {cargoLabels.map((c, i) => (
            <span
              key={i}
              style={{
                fontSize: 8,
                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                color: '#fff',
                border: '1px solid #fbbf24',
                borderRadius: 4,
                padding: '1px 3px',
              }}
            >
              {c.emoji}{c.qty}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
};

const Railcar: React.FC<{
  posX: number;
  posY: number;
  rotation: number;
  zIndex: number;
  railcarType: RailcarType;
  onSelect?: (e: React.MouseEvent) => void;
  cargoLabels?: Array<{ emoji: string; qty: number }>;
  selected?: boolean;
}> = ({ posX, posY, rotation, zIndex, railcarType, onSelect, cargoLabels, selected }) => {
  const prevRotationRef = React.useRef(rotation);
  
  let diff = (rotation - prevRotationRef.current) % 360;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  
  const displayRotation = prevRotationRef.current + diff;
  prevRotationRef.current = displayRotation;

  let bg = '#94a3b8';
  let inner = null;
  switch (railcarType) {
    case 'passenger':
      bg = '#2563eb';
      inner = (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '4px 0', justifyContent: 'space-evenly', alignItems: 'center' }}>
          {[...Array(5)].map((_, i) => <div key={i} style={{ width: 10, height: 4, backgroundColor: '#bfdbfe', borderRadius: 1 }} />)}
        </div>
      );
      break;
    case 'flatbed':
      bg = '#78350f';
      inner = <div style={{ position: 'absolute', top: 2, bottom: 2, left: 2, right: 2, backgroundColor: '#b45309' }} />;
      break;
    case 'boxcar':
      bg = '#c2410c';
      inner = <div style={{ position: 'absolute', top: '40%', bottom: '40%', left: 0, right: 0, backgroundColor: '#9a3412', borderTop: '1px solid #ea580c', borderBottom: '1px solid #ea580c' }} />;
      break;
    case 'container':
      bg = '#047857';
      inner = <div style={{ position: 'absolute', top: 2, bottom: 2, left: 2, right: 2, backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.2) 3px, rgba(0,0,0,0.2) 6px)' }} />;
      break;
    case 'closed-hopper':
      bg = '#64748b';
      inner = (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-evenly', alignItems: 'center' }}>
          {[...Array(3)].map((_, i) => <div key={i} style={{ width: 12, height: 12, backgroundColor: '#475569', borderRadius: '50%' }} />)}
        </div>
      );
      break;
    case 'open-hopper':
      bg = '#334155';
      inner = <div style={{ position: 'absolute', top: 2, bottom: 2, left: 2, right: 2, backgroundColor: '#0f172a', borderRadius: 2 }} />;
      break;
    case 'tank':
      bg = '#cbd5e1';
      inner = <div style={{ position: 'absolute', top: 2, bottom: 2, left: 1, right: 1, backgroundColor: '#e2e8f0', borderRadius: '8px' }} />;
      break;
  }

  return (
    <motion.div
      style={{
        position: 'absolute',
        width: VEHICLE_DIMS.railcar.width,
        height: VEHICLE_DIMS.railcar.length,
        backgroundColor: bg,
        borderRadius: 2,
        border: `1px solid rgba(0,0,0,0.4)`,
        zIndex: 100 + zIndex,
        pointerEvents: onSelect ? 'auto' : 'none',
        cursor: onSelect ? 'pointer' : undefined,
        overflow: 'hidden'
      }}
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{
        opacity: 1,
        scale: 1,
        left: posX,
        top: posY,
        rotate: displayRotation,
        x: "-50%",
        y: "-50%",
        scaleX: zIndex > 0 ? 1.1 : 1,
        scaleY: zIndex > 0 ? 1.1 : 1,
      }}
      exit={{ opacity: 0, scale: 0.5 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      {...vehicleSelectHandlers(onSelect)}
    >
      {selected && (
        <div
          style={{
            position: 'absolute',
            inset: -4,
            border: '2px solid #fbbf24',
            borderRadius: 2,
            pointerEvents: 'none',
          }}
        />
      )}
      {cargoLabels && cargoLabels.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: -10,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: 2,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {cargoLabels.map((c, i) => (
            <span
              key={i}
              style={{
                fontSize: 8,
                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                color: '#fff',
                border: '1px solid #fbbf24',
                borderRadius: 4,
                padding: '1px 3px',
              }}
            >
              {c.emoji}{c.qty}
            </span>
          ))}
        </div>
      )}
      {inner}
    </motion.div>
  );
};

export const Vehicle: React.FC<VehicleProps> = ({ 
  x, y, heading, lane, progress, color, zIndex, exitHeading, 
  type = 'car', trailers = 0, railcars = [],
  tileType, tileRotation, tilePart, tileLocalX = 0, tileLocalY = 0, tileW = 1, tileH = 1,
  parkingStopUntil, trafficStopUntil, trafficStopReason, parkingStallIndex = 0, lastParkingKey,
  emergencyLightsOn,
  onSelect, onTrailerSelect, onRailcarSelect,
  trailerCargos, railcarCargos, selectedRailcarIndex, showCargoLabels,
  showRailcarCargoLabels, showStopTimerBadge = true, itemEmojiResolver
}) => {
  const showRailCargo = showRailcarCargoLabels ?? showCargoLabels;
  const targetHeading = exitHeading !== undefined ? exitHeading : heading;
  
  const stopUntil = parkingStopUntil || trafficStopUntil;
  const [timeLeft, setTimeLeft] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (stopUntil) {
      const update = () => {
        const remainingMs = stopUntil - Date.now();
        if (remainingMs <= 0) {
          setTimeLeft(null);
          return;
        }
        setTimeLeft(Math.max(1, Math.ceil(remainingMs / 1000)));
        requestAnimationFrame(update);
      };
      update();
    } else {
      setTimeLeft(null);
    }
  }, [stopUntil]);

  const { posX: standardX, posY: standardY, rotation: standardRot } = getTrajectory(x, y, heading, targetHeading, lane, progress);

  // Normalize rotation to avoid 360 -> 0 spin
  // We can use a ref to keep track of the continuous rotation
  const prevRotationRef = React.useRef(standardRot);
  
  let diff = (standardRot - prevRotationRef.current) % 360;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  
  const standardDisplayRotation = prevRotationRef.current + diff;

  // Calculate parking spot position and interpolate if vehicle is parked/parking
  let posX = standardX;
  let posY = standardY;
  let displayRotation = standardDisplayRotation;

  const isParkedCell =
    tileType &&
    lastParkingKey &&
    (tileType.startsWith('parking-') ||
      tileType === 'building-repair-shop' ||
      tileType === 'building-hospital' ||
      tileType === 'building-home');
  if (isParkedCell) {
    const stall = parkingStallIndex ?? 0;
    const { posX: parkedX, posY: parkedY, rotation: parkedRot } = getParkingStallWorldPosition(
      x, y, tileType, tileRotation || 0, tileLocalX ?? 0, tileLocalY ?? 0, tileW ?? 1, tileH ?? 1, stall
    );

    if (progress <= 0.5) {
      const t = progress / 0.5;
      posX = standardX * (1 - t) + parkedX * t;
      posY = standardY * (1 - t) + parkedY * t;

      let rDiff = (parkedRot - standardRot) % 360;
      if (rDiff > 180) rDiff -= 360;
      if (rDiff < -180) rDiff += 360;
      const targetDisplayRot = standardRot + rDiff * t;
      
      let continuousDiff = (targetDisplayRot - prevRotationRef.current) % 360;
      if (continuousDiff > 180) continuousDiff -= 360;
      if (continuousDiff < -180) continuousDiff += 360;
      displayRotation = prevRotationRef.current + continuousDiff;
    } else {
      const t = (progress - 0.5) / 0.5;
      posX = parkedX * (1 - t) + standardX * t;
      posY = parkedY * (1 - t) + standardY * t;

      let rDiff = (standardRot - parkedRot) % 360;
      if (rDiff > 180) rDiff -= 360;
      if (rDiff < -180) rDiff += 360;
      const targetDisplayRot = parkedRot + rDiff * t;
      
      let continuousDiff = (targetDisplayRot - prevRotationRef.current) % 360;
      if (continuousDiff > 180) continuousDiff -= 360;
      if (continuousDiff < -180) continuousDiff += 360;
      displayRotation = prevRotationRef.current + continuousDiff;
    }
  } else {
    posX = standardX;
    posY = standardY;
    displayRotation = standardDisplayRotation;
  }
  prevRotationRef.current = displayRotation;

  // History tracking for trailers
  const traveledRef = React.useRef(0);
  const historyRef = React.useRef<{x: number, y: number, r: number, d: number}[]>([{ x: posX, y: posY, r: displayRotation, d: 0 }]);

  const lastPushed = historyRef.current[historyRef.current.length - 1];
  const dx = posX - lastPushed.x;
  const dy = posY - lastPushed.y;
  const dist = Math.sqrt(dx*dx + dy*dy);

  if (dist > GRID_SIZE * 2) {
    historyRef.current = [{ x: posX, y: posY, r: displayRotation, d: traveledRef.current }];
  } else if (dist > 0.1) {
    traveledRef.current += dist;
    historyRef.current.push({ x: posX, y: posY, r: displayRotation, d: traveledRef.current });
    
    while (historyRef.current.length > 2 && historyRef.current[1].d < traveledRef.current - 800) {
      historyRef.current.shift();
    }
  }

  const isEmergency =
    type === 'fire-truck' || type === 'police' || type === 'ambulance' || type === 'tow-truck';
  const isTransit = type === 'taxi' || type === 'bus';
  const isService = isEmergency || isTransit;
  // Emergency lights default ON unless explicitly turned off (taxi/bus have no light bar)
  const lightsFlashing = isEmergency && emergencyLightsOn !== false;
  const dims =
    type === 'semi' || type === 'fire-truck' || type === 'tow-truck' || type === 'bus'
      ? VEHICLE_DIMS.semi
      : type === 'train'
        ? VEHICLE_DIMS.train
        : VEHICLE_DIMS.car;
  const baseWidth = type === 'bus' ? dims.width + 2 : dims.width;
  const baseHeight =
    type === 'fire-truck' || type === 'tow-truck'
      ? VEHICLE_DIMS.car.length + 6
      : type === 'bus'
        ? VEHICLE_DIMS.car.length + 14
        : dims.length;

  const bodyBorder =
    type === 'fire-truck'
      ? '#7f1d1d'
      : type === 'police'
        ? '#172554'
        : type === 'ambulance'
          ? '#dc2626'
          : type === 'tow-truck'
            ? '#854d0e'
            : type === 'taxi'
              ? '#a16207'
              : type === 'bus'
                ? '#1e3a8a'
                : color === '#ef4444'
                  ? '#991b1b'
                  : 'rgba(0,0,0,0.2)';

  return (
    <>
      <motion.div
        style={{
          position: 'absolute',
          width: baseWidth,
          height: baseHeight,
          backgroundColor: color,
          borderRadius: 2,
          border: `1px solid ${bodyBorder}`,
          zIndex: 100 + zIndex,
          pointerEvents: onSelect ? 'auto' : 'none',
          cursor: onSelect ? 'pointer' : undefined,
          // Allow emergency light glow to show outside the body
          overflow: isService ? 'visible' : 'hidden',
        }}
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{
          opacity: 1,
          scale: 1,
          left: posX,
          top: posY,
          rotate: displayRotation,
          x: "-50%",
          y: "-50%",
          scaleX: zIndex > 0 ? 1.1 : 1,
          scaleY: zIndex > 0 ? 1.1 : 1,
        }}
        exit={{ opacity: 0, scale: 0.5 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        {...vehicleSelectHandlers(onSelect)}
      >
        {/* Windshield */}
        {type !== 'train' && (
          <div 
            style={{
              position: 'absolute',
              top: type === 'semi' || type === 'fire-truck' || type === 'tow-truck' || type === 'bus' ? '12%' : '15%',
              left: '10%',
              right: '10%',
              height: type === 'semi' || type === 'fire-truck' || type === 'tow-truck' || type === 'bus' ? '22%' : '20%',
              backgroundColor: type === 'ambulance' ? '#93c5fd' : type === 'taxi' ? '#fef9c3' : '#bfdbfe',
              borderRadius: 1,
            }}
          />
        )}
        {/* Taxi markings */}
        {type === 'taxi' && (
          <>
            <div style={{ position: 'absolute', top: '36%', left: 0, right: 0, height: '16%', backgroundColor: '#111827' }} />
            <div style={{ position: 'absolute', top: '2%', left: '28%', right: '28%', height: '12%', backgroundColor: '#facc15', borderRadius: 1, border: '1px solid #a16207' }} />
            <div style={{ position: 'absolute', top: '4%', left: '34%', right: '34%', height: '8%', backgroundColor: '#111827', borderRadius: 1, fontSize: 5, color: '#facc15', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>TAXI</div>
          </>
        )}
        {/* Bus markings */}
        {type === 'bus' && (
          <>
            <div style={{ position: 'absolute', top: '38%', left: '8%', right: '8%', height: '28%', display: 'flex', gap: 2, justifyContent: 'space-between' }}>
              {[0, 1, 2, 3].map(i => (
                <div key={i} style={{ flex: 1, backgroundColor: '#93c5fd', borderRadius: 1, border: '1px solid #1e40af' }} />
              ))}
            </div>
            <div style={{ position: 'absolute', bottom: '6%', left: '20%', right: '20%', height: '10%', backgroundColor: '#1e40af', borderRadius: 1 }} />
          </>
        )}
        {/* Service markings + emergency light bars (toggleable) */}
        {type === 'police' && (
          <>
            <div style={{ position: 'absolute', top: '38%', left: 0, right: 0, height: '18%', backgroundColor: '#f8fafc' }} />
            <div className="emergency-light-bar" style={{ top: '2%', height: '14%' }}>
              {lightsFlashing ? (
                <>
                  <div className="emergency-light-cell emergency-light-blue" />
                  <div className="emergency-light-cell emergency-light-blue-alt" />
                  <div className="emergency-light-cell emergency-light-blue" style={{ animationDelay: '0.1s' }} />
                  <div className="emergency-light-cell emergency-light-blue-alt" style={{ animationDelay: '0.3s' }} />
                </>
              ) : (
                <>
                  <div className="emergency-light-cell emergency-light-off" />
                  <div className="emergency-light-cell emergency-light-off" />
                  <div className="emergency-light-cell emergency-light-off" />
                  <div className="emergency-light-cell emergency-light-off" />
                </>
              )}
            </div>
          </>
        )}
        {type === 'ambulance' && (
          <>
            <div style={{ position: 'absolute', top: '42%', left: '35%', width: '30%', height: '8%', backgroundColor: '#dc2626' }} />
            <div style={{ position: 'absolute', top: '36%', left: '46%', width: '8%', height: '20%', backgroundColor: '#dc2626' }} />
            <div className="emergency-light-bar" style={{ top: '1%', height: '13%' }}>
              {lightsFlashing ? (
                <>
                  <div className="emergency-light-cell emergency-light-ambulance" />
                  <div className="emergency-light-cell emergency-light-ambulance-alt" />
                  <div className="emergency-light-cell emergency-light-ambulance" style={{ animationDelay: '0.15s' }} />
                  <div className="emergency-light-cell emergency-light-ambulance-alt" style={{ animationDelay: '0.45s' }} />
                </>
              ) : (
                <>
                  <div className="emergency-light-cell emergency-light-off" />
                  <div className="emergency-light-cell emergency-light-off" />
                  <div className="emergency-light-cell emergency-light-off" />
                  <div className="emergency-light-cell emergency-light-off" />
                </>
              )}
            </div>
          </>
        )}
        {type === 'fire-truck' && (
          <>
            <div style={{ position: 'absolute', bottom: '8%', left: '15%', right: '15%', height: '22%', backgroundColor: '#fbbf24', borderRadius: 1, opacity: 0.9 }} />
            <div className="emergency-light-bar" style={{ top: '2%', height: '14%' }}>
              {lightsFlashing ? (
                <>
                  <div className="emergency-light-cell emergency-light-red" />
                  <div className="emergency-light-cell emergency-light-red-alt" />
                  <div className="emergency-light-cell emergency-light-red" style={{ animationDelay: '0.1s' }} />
                  <div className="emergency-light-cell emergency-light-red-alt" style={{ animationDelay: '0.35s' }} />
                </>
              ) : (
                <>
                  <div className="emergency-light-cell emergency-light-off" />
                  <div className="emergency-light-cell emergency-light-off" />
                  <div className="emergency-light-cell emergency-light-off" />
                  <div className="emergency-light-cell emergency-light-off" />
                </>
              )}
            </div>
          </>
        )}
        {type === 'tow-truck' && (
          <>
            <div style={{ position: 'absolute', bottom: '5%', left: '20%', right: '20%', height: '18%', backgroundColor: '#57534e', borderRadius: 1 }} />
            <div className="emergency-light-bar" style={{ top: '2%', height: '14%' }}>
              {lightsFlashing ? (
                <>
                  <div className="emergency-light-cell emergency-light-yellow" />
                  <div className="emergency-light-cell emergency-light-yellow-alt" />
                  <div className="emergency-light-cell emergency-light-yellow" style={{ animationDelay: '0.12s' }} />
                  <div className="emergency-light-cell emergency-light-yellow-alt" style={{ animationDelay: '0.37s' }} />
                </>
              ) : (
                <>
                  <div className="emergency-light-cell emergency-light-off" />
                  <div className="emergency-light-cell emergency-light-off" />
                  <div className="emergency-light-cell emergency-light-off" />
                  <div className="emergency-light-cell emergency-light-off" />
                </>
              )}
            </div>
          </>
        )}
        {/* Headlights */}
        <div style={{ position: 'absolute', top: isEmergency ? '16%' : type === 'bus' || type === 'taxi' ? '2%' : '0', left: '15%', width: '20%', height: type === 'semi' || isService ? '12%' : '10%', backgroundColor: '#fef3c7', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', top: isEmergency ? '16%' : type === 'bus' || type === 'taxi' ? '2%' : '0', right: '15%', width: '20%', height: type === 'semi' || isService ? '12%' : '10%', backgroundColor: '#fef3c7', borderRadius: '50%' }} />
      </motion.div>
      
      {type === 'semi' && Array.from({ length: trailers }).map((_, i) => {
        const offsetFront = TRAILER_OFFSET_BASE + i * TRAILER_OFFSET_SPACING;
        const offsetRear = offsetFront + TRAILER_LENGTH;

        const frontPos = sampleHistory(historyRef.current, traveledRef.current - offsetFront);
        const rearPos = sampleHistory(historyRef.current, traveledRef.current - offsetRear);

        let tX = (frontPos.x + rearPos.x) / 2;
        let tY = (frontPos.y + rearPos.y) / 2;
        let tR = displayRotation;

        const dx = frontPos.x - rearPos.x;
        const dy = frontPos.y - rearPos.y;
        if (Math.sqrt(dx*dx + dy*dy) > 0.1) {
          tR = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
        } else {
          tR = frontPos.r;
        }

        const cargo = trailerCargos?.[i];
        const cargoLabels = showCargoLabels && cargo && itemEmojiResolver
          ? Object.entries(cargo)
              .filter(([, qty]) => qty > 0)
              .map(([itemId, qty]) => ({ emoji: itemEmojiResolver(itemId), qty }))
          : undefined;

        return (
          <TrailerVisual
            key={`trailer-${i}`}
            posX={tX}
            posY={tY}
            rotation={tR}
            zIndex={zIndex}
            onSelect={onTrailerSelect ? (e) => onTrailerSelect(i, e) : onSelect}
            cargoLabels={cargoLabels}
          />
        );
      })}

      {type === 'train' && railcars.map((railcar, i) => {
        const offsetFront = RAILCAR_OFFSET_BASE + i * RAILCAR_OFFSET_SPACING;
        const offsetRear = offsetFront + RAILCAR_LENGTH;

        const frontPos = sampleHistory(historyRef.current, traveledRef.current - offsetFront);
        const rearPos = sampleHistory(historyRef.current, traveledRef.current - offsetRear);

        let tX = (frontPos.x + rearPos.x) / 2;
        let tY = (frontPos.y + rearPos.y) / 2;
        let tR = displayRotation;

        const dx = frontPos.x - rearPos.x;
        const dy = frontPos.y - rearPos.y;
        if (Math.sqrt(dx*dx + dy*dy) > 0.1) {
          tR = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
        } else {
          tR = frontPos.r;
        }

        const cargo = railcarCargos?.[i];
        const cargoLabels = showRailCargo && cargo && itemEmojiResolver
          ? Object.entries(cargo)
              .filter(([, qty]) => qty > 0)
              .map(([itemId, qty]) => ({ emoji: itemEmojiResolver(itemId), qty }))
          : undefined;

        return (
          <Railcar 
            key={`railcar-${i}`}
            posX={tX}
            posY={tY}
            rotation={tR}
            zIndex={zIndex}
            railcarType={railcar}
            onSelect={onRailcarSelect ? (e) => onRailcarSelect(i, e) : onSelect}
            cargoLabels={cargoLabels}
            selected={selectedRailcarIndex === i}
          />
        );
      })}

      {showStopTimerBadge && timeLeft !== null && timeLeft > 0 && (
        <motion.div
          style={{
            position: 'absolute',
            left: posX,
            top: posY - baseHeight - 12,
            transform: 'translate(-50%, -50%)',
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            border: '1.5px solid #fbbf24',
            color: '#ffffff',
            borderRadius: '12px',
            padding: '2px 6px',
            fontSize: '9px',
            fontWeight: 'bold',
            zIndex: 250,
            pointerEvents: 'none',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
          }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
        >
          <span style={{ fontSize: '8px' }}>
            {trafficStopReason === 'stop-sign' ? '🛑' : trafficStopReason === 'stoplight' ? '🚦' : '🅿️'}
          </span>
          <span>{timeLeft}s</span>
        </motion.div>
      )}
    </>
  );
};

export const ParkedTrailerVisual: React.FC<{
  gridX: number;
  gridY: number;
  heading: number;
  tileType: string;
  tileRotation?: number;
  tileLocalX?: number;
  tileLocalY?: number;
  tileW?: number;
  tileH?: number;
  stallIndex: number;
  cargo?: Record<string, number>;
  showCargoLabels?: boolean;
  itemEmojiResolver?: (itemId: string) => string;
  selected?: boolean;
  onSelect?: (e: React.MouseEvent) => void;
}> = ({
  gridX, gridY, heading, tileType, tileRotation = 0, tileLocalX = 0, tileLocalY = 0,
  tileW = 1, tileH = 1, stallIndex, cargo, showCargoLabels, itemEmojiResolver,
  selected, onSelect,
}) => {
  const { posX, posY, rotation } = getParkingStallWorldPosition(
    gridX, gridY, tileType, tileRotation, tileLocalX, tileLocalY, tileW, tileH, stallIndex
  );
  const cargoLabels = showCargoLabels && cargo && itemEmojiResolver
    ? Object.entries(cargo)
        .filter(([, qty]) => qty > 0)
        .map(([itemId, qty]) => ({ emoji: itemEmojiResolver(itemId), qty }))
    : undefined;

  return (
    <TrailerVisual
      posX={posX}
      posY={posY}
      rotation={rotation || heading}
      zIndex={0}
      onSelect={onSelect}
      cargoLabels={cargoLabels}
      selected={selected}
    />
  );
};
