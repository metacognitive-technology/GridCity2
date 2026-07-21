import { GridData, GridTile } from './types';

/** Diff local grid against last server-confirmed state. */
export function diffGrid(current: GridData, lastSynced: GridData): Record<string, GridTile[] | null> {
  const updates: Record<string, GridTile[] | null> = {};
  const allKeys = new Set([...Object.keys(lastSynced), ...Object.keys(current)]);

  for (const key of allKeys) {
    const currentVal = current[key];
    const lastVal = lastSynced[key];
    if (JSON.stringify(currentVal) !== JSON.stringify(lastVal)) {
      updates[key] = currentVal !== undefined ? currentVal : null;
    }
  }

  return updates;
}

/** Apply partial grid updates (null removes a cell). */
export function applyGridUpdates(grid: GridData, updates: Record<string, GridTile[] | null | undefined>): GridData {
  const next = { ...grid };
  for (const [key, val] of Object.entries(updates)) {
    if (val === null || val === undefined) {
      delete next[key];
    } else {
      next[key] = val;
    }
  }
  return next;
}

/** Record server-accepted keys into the synced baseline. */
export function mergeAcceptedIntoBaseline(
  baseline: GridData,
  accepted: Record<string, GridTile[] | null | undefined>
): GridData {
  return applyGridUpdates(baseline, accepted);
}