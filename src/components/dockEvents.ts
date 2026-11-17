import type React from 'react';

const stop = (e: React.SyntheticEvent) => {
  e.stopPropagation();
};

/** Keep dock clicks and wheels from reaching the city grid. */
export const blockGridPointerEvents = {
  onMouseDown: stop,
  onMouseUp: stop,
  onMouseMove: stop,
  onPointerDown: stop,
  onPointerUp: stop,
  onClick: stop,
  onDoubleClick: stop,
  onWheel: (e: React.WheelEvent) => {
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
  },
  onContextMenu: stop,
};
