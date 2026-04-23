import React from 'react';
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
  type?: 'car' | 'train' | 'semi';
  trailers?: number;
  railcars?: RailcarType[];
}

const GRID_SIZE = 64;

export function getTrajectory(x: number, y: number, heading: number, targetHeading: number, lane: number, progress: number) {
  const centerX = (x + 0.5) * GRID_SIZE;
  const centerY = (y + 0.5) * GRID_SIZE;
  
  const laneWidth = 12; // Half of 24
  const lOffset = lane * (laneWidth / 2);
  
  let posX = centerX;
  let posY = centerY;
  let currentRotation = heading;

  if (targetHeading !== heading) {
    let turnAngle = targetHeading - heading;
    if (turnAngle > 180) turnAngle -= 360;
    if (turnAngle < -180) turnAngle += 360;
    
    const entryRad = (heading - 90) * (Math.PI / 180);
    const ex = Math.cos(entryRad);
    const ey = Math.sin(entryRad);
    
    const rightRad = heading * (Math.PI / 180);
    const rx = Math.cos(rightRad);
    const ry = Math.sin(rightRad);
    
    const turnDir = turnAngle > 0 ? 1 : -1;
    
    const arcCenterX = centerX - ex * (GRID_SIZE / 2) + rx * (GRID_SIZE / 2) * turnDir;
    const arcCenterY = centerY - ey * (GRID_SIZE / 2) + ry * (GRID_SIZE / 2) * turnDir;
    
    const radius = Math.abs((GRID_SIZE / 2) - lOffset * turnDir);
    
    const startAngleRad = entryRad - (Math.PI / 2) * turnDir;
    const currentAngleRad = startAngleRad + progress * (Math.PI / 2) * turnDir;
    
    posX = arcCenterX + Math.cos(currentAngleRad) * radius;
    posY = arcCenterY + Math.sin(currentAngleRad) * radius;
    
    currentRotation = heading + progress * turnAngle;
  } else {
    const pOffset = (progress - 0.5) * GRID_SIZE;
    
    const rad = (heading - 90) * (Math.PI / 180);
    const dx = Math.cos(rad);
    const dy = Math.sin(rad);
    
    posX += dx * pOffset;
    posY += dy * pOffset;
    
    const rightRad = heading * (Math.PI / 180);
    const rx = Math.cos(rightRad);
    const ry = Math.sin(rightRad);
    
    posX += rx * lOffset;
    posY += ry * lOffset;
  }

  return { posX, posY, rotation: currentRotation };
}

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

const Trailer: React.FC<{
  posX: number;
  posY: number;
  rotation: number;
  zIndex: number;
}> = ({ posX, posY, rotation, zIndex }) => {
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
        width: 12,
        height: 40,
        backgroundColor: '#94a3b8',
        borderRadius: 1,
        border: `1px solid rgba(0,0,0,0.3)`,
        zIndex: 100 + zIndex,
        pointerEvents: 'none',
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
    />
  );
};

const Railcar: React.FC<{
  posX: number;
  posY: number;
  rotation: number;
  zIndex: number;
  railcarType: RailcarType;
}> = ({ posX, posY, rotation, zIndex, railcarType }) => {
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
        width: 18,
        height: 48,
        backgroundColor: bg,
        borderRadius: 2,
        border: `1px solid rgba(0,0,0,0.4)`,
        zIndex: 100 + zIndex,
        pointerEvents: 'none',
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
    >
      {inner}
    </motion.div>
  );
};

export const Vehicle: React.FC<VehicleProps> = ({ x, y, heading, lane, progress, color, zIndex, exitHeading, type = 'car', trailers = 0, railcars = [] }) => {
  const targetHeading = exitHeading !== undefined ? exitHeading : heading;
  
  const { posX, posY, rotation: currentRotation } = getTrajectory(x, y, heading, targetHeading, lane, progress);

  // Normalize rotation to avoid 360 -> 0 spin
  // We can use a ref to keep track of the continuous rotation
  const prevRotationRef = React.useRef(currentRotation);
  
  let diff = (currentRotation - prevRotationRef.current) % 360;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  
  const displayRotation = prevRotationRef.current + diff;
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

  let baseHeight = 20;
  let baseWidth = 12;
  if (type === 'semi') baseHeight = 10;
  else if (type === 'train') { baseHeight = 40; baseWidth = 18; }

  return (
    <>
      <motion.div
        style={{
          position: 'absolute',
          width: baseWidth,
          height: baseHeight,
          backgroundColor: color,
          borderRadius: 2,
          border: `1px solid ${color === '#ef4444' ? '#991b1b' : 'rgba(0,0,0,0.2)'}`,
          zIndex: 100 + zIndex,
          pointerEvents: 'none',
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
      >
        {/* Windshield */}
        {type !== 'train' && (
          <div 
            style={{
              position: 'absolute',
              top: type === 'semi' ? '25%' : '15%',
              left: '10%',
              right: '10%',
              height: type === 'semi' ? '40%' : '20%',
              backgroundColor: '#bfdbfe',
              borderRadius: 1,
            }}
          />
        )}
        {/* Headlights */}
        <div style={{ position: 'absolute', top: '0', left: '15%', width: '20%', height: type === 'semi' ? '20%' : '10%', backgroundColor: '#fef3c7', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', top: '0', right: '15%', width: '20%', height: type === 'semi' ? '20%' : '10%', backgroundColor: '#fef3c7', borderRadius: '50%' }} />
      </motion.div>
      
      {type === 'semi' && Array.from({ length: trailers }).map((_, i) => {
        const offsetFront = 7 + i * 42;
        const offsetRear = offsetFront + 40;

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

        return (
          <Trailer 
            key={`trailer-${i}`}
            posX={tX}
            posY={tY}
            rotation={tR}
            zIndex={zIndex}
          />
        );
      })}

      {type === 'train' && railcars.map((railcar, i) => {
        const offsetFront = 25 + i * 50;
        const offsetRear = offsetFront + 48;

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

        return (
          <Railcar 
            key={`railcar-${i}`}
            posX={tX}
            posY={tY}
            rotation={tR}
            zIndex={zIndex}
            railcarType={railcar}
          />
        );
      })}
    </>
  );
};
