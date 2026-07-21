import React from 'react';
import { RemoteCursor } from '../types';

interface RemoteCursorsProps {
  cursors: RemoteCursor[];
  gridSize: number;
}

export const RemoteCursors: React.FC<RemoteCursorsProps> = ({ cursors, gridSize }) => (
  <>
    {cursors.map(cursor => (
      <div
        key={cursor.socketId}
        className="absolute pointer-events-none z-[200]"
        style={{
          left: cursor.gridX * gridSize,
          top: cursor.gridY * gridSize,
          width: gridSize,
          height: gridSize,
        }}
        title={cursor.isBuffered ? `${cursor.userId} (sync pending)` : cursor.userId}
      >
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          {cursor.isBuffered ? (
            <div className="relative flex items-center justify-center">
              <div className="absolute w-5 h-5 rounded-full bg-red-500 animate-ping opacity-60" />
              <div className="relative w-3.5 h-3.5 rounded-full bg-red-600 animate-pulse border-2 border-white shadow-md" />
            </div>
          ) : (
            <div
              className="w-3.5 h-3.5 rounded-full border-2 border-white shadow-md"
              style={{ backgroundColor: cursor.userColor }}
            />
          )}
        </div>
      </div>
    ))}
  </>
);