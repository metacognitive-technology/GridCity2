import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import socket from '../../socket';

type Party = { taskId: string; title: string; worldId: string };

const COLORS = ['#f43f5e', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#facc15', '#fb7185'];

type Bit = {
  id: number;
  x: number;
  y: number;
  rotate: number;
  color: string;
  delay: number;
  w: number;
  h: number;
};

function burstBits(seed: number): Bit[] {
  return Array.from({ length: 32 }, (_, i) => {
    const angle = (Math.PI * 2 * i) / 32 + (i % 4) * 0.15;
    const distance = 90 + ((i * 17 + seed) % 7) * 28;
    return {
      id: i,
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance * 0.72 + 160,
      rotate: (i % 2 === 0 ? 1 : -1) * (120 + i * 18),
      color: COLORS[i % COLORS.length],
      delay: (i % 8) * 0.025,
      w: 8 + (i % 3) * 4,
      h: 6 + (i % 2) * 4,
    };
  });
}

/**
 * Room-wide celebration. The server emits task-celebrate only to that world room.
 * Ignore a payload for any other room so a leftover socket membership cannot pop the banner.
 */
export function Celebration({ roomCode }: { roomCode: string | null }) {
  const [party, setParty] = useState<Party | null>(null);
  const [stars, setStars] = useState(0);
  const [burst, setBurst] = useState(0);

  useEffect(() => {
    const onParty = (payload: Party) => {
      if (!payload || typeof payload.worldId !== 'string' || typeof payload.taskId !== 'string') return;
      if (!roomCode || payload.worldId !== roomCode) return;
      setParty({
        taskId: payload.taskId,
        title: typeof payload.title === 'string' ? payload.title : '',
        worldId: payload.worldId,
      });
      setStars((count) => count + 1);
      setBurst((count) => count + 1);
    };
    socket.on('task-celebrate', onParty);
    return () => {
      socket.off('task-celebrate', onParty);
    };
  }, [roomCode]);

  useEffect(() => {
    if (!party) return;
    const timer = window.setTimeout(() => setParty(null), 8000);
    return () => window.clearTimeout(timer);
  }, [party, burst]);

  if (!party) return null;
  const bits = burstBits(burst);

  return (
    <>
      <div
        data-testid="confetti"
        className="fixed inset-0 z-[275] pointer-events-none overflow-hidden"
        aria-hidden="true"
      >
        {bits.map((bit) => (
          <motion.span
            key={`${burst}-${bit.id}`}
            className="absolute left-1/2 top-16 rounded-sm"
            style={{ width: bit.w, height: bit.h, background: bit.color }}
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.4 }}
            animate={{ x: bit.x, y: bit.y, opacity: 0, rotate: bit.rotate, scale: 1 }}
            transition={{ duration: 1.7, delay: bit.delay, ease: 'easeOut' }}
          />
        ))}
      </div>
      <div
        data-testid="celebrate-banner"
        data-task-id={party.taskId}
        role="status"
        className="fixed top-4 left-1/2 -translate-x-1/2 z-[280] bg-slate-900 text-white text-sm font-bold px-4 py-2 rounded-full shadow-lg flex items-center gap-3"
      >
        <span>🎉 You built it!</span>
        <span data-testid="celebrate-stars" className="text-amber-300 tabular-nums">★ {stars}</span>
      </div>
    </>
  );
}
