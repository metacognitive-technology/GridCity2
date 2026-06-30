/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import JSZip from 'jszip';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Trash2, 
  Download, 
  Map as MapIcon, 
  Train, 
  Route, 
  MousePointer2,
  Hand,
  PanelLeftClose,
  PanelLeftOpen,
  Layers,
  Info,
  Undo,
  Redo,
  Copy,
  Scissors,
  ClipboardPaste,
  Square,
  X,
  Grid,
  Save,
  Plus,
  Bookmark,
  Trees,
  Upload,
  LogOut,
  Database,
  Car,
  CarFront,
  PlayCircle,
  FolderOpen,
  Sprout,
  Play,
  Pause,
  Shuffle,
  Dices,
  Target,
  ParkingCircle,
  CircleX,
  MapPin,
  Truck
} from 'lucide-react';
import { Tile } from './components/Tile';
import { Vehicle as VehicleComponent, ParkedTrailerVisual } from './components/Vehicle';
import { TileType, GridData, Point, GridTile, Vehicle, RailcarType, EconomyState, BuildingConfig, ItemDef, Cargo, ItemId, PlantGrowthSettings, ParkedTrailer } from './types';
import socket from './socket';

const GRID_SIZE = 64;
const GRID_CANVAS_CELLS = 500;
const GRID_CANVAS_MIN = -Math.floor(GRID_CANVAS_CELLS / 2);
const GRID_CANVAS_MAX = GRID_CANVAS_MIN + GRID_CANVAS_CELLS - 1;
const GRID_CANVAS_BOUNDS = {
  minX: GRID_CANVAS_MIN,
  minY: GRID_CANVAS_MIN,
  maxX: GRID_CANVAS_MAX,
  maxY: GRID_CANVAS_MAX,
};
const INITIAL_ZOOM = 1;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3;

const WORDS = [
  "red", "blue", "green", "fast", "slow", "happy", "sad", "big", "small", "tall", 
  "short", "hot", "cold", "brave", "calm", "cool", "dark", "light", "loud", "quiet", 
  "cat", "dog", "bird", "fish", "bear", "lion", "tiger", "wolf", "fox", "deer", 
  "sun", "moon", "star", "sky", "sea", "tree", "rock", "wind", "fire", "ice", 
  "car", "bus", "train", "boat", "ship", "jet", "road", "rail", "path", "town", 
  "city", "farm", "lake", "river", "hill", "mountain", "alpha", "beta", "gamma", "delta"
];
const SIDEBAR_WIDTH = 288;
const MAX_HISTORY = 50;

const isWithinGridCanvas = (x: number, y: number) =>
  x >= GRID_CANVAS_MIN && x <= GRID_CANVAS_MAX &&
  y >= GRID_CANVAS_MIN && y <= GRID_CANVAS_MAX;

const clipGridDataToCanvas = (data: GridData): GridData => {
  const clipped: GridData = {};
  Object.entries(data).forEach(([key, tiles]) => {
    const [x, y] = key.split(',').map(Number);
    if (isWithinGridCanvas(x, y)) {
      clipped[key] = tiles;
    }
  });
  return clipped;
};

const clampBoundsToCanvas = (minX: number, minY: number, maxX: number, maxY: number) => ({
  minX: Math.max(GRID_CANVAS_MIN, minX),
  minY: Math.max(GRID_CANVAS_MIN, minY),
  maxX: Math.min(GRID_CANVAS_MAX, maxX),
  maxY: Math.min(GRID_CANVAS_MAX, maxY),
});

const clampViewportOffset = (
  off: Point,
  z: number,
  viewportW: number,
  viewportH: number,
): Point => {
  const worldMin = GRID_CANVAS_MIN * GRID_SIZE;
  const worldMax = (GRID_CANVAS_MAX + 1) * GRID_SIZE;
  const canvasWorldW = worldMax - worldMin;
  const canvasWorldH = worldMax - worldMin;
  const viewW = viewportW / z;
  const viewH = viewportH / z;

  let viewX = -off.x / z;
  let viewY = -off.y / z;

  if (viewW >= canvasWorldW) {
    viewX = worldMin + (canvasWorldW - viewW) / 2;
  } else {
    viewX = Math.max(worldMin, Math.min(worldMax - viewW, viewX));
  }

  if (viewH >= canvasWorldH) {
    viewY = worldMin + (canvasWorldH - viewH) / 2;
  } else {
    viewY = Math.max(worldMin, Math.min(worldMax - viewH, viewY));
  }

  return { x: -viewX * z, y: -viewY * z };
};

const TILE_CONNECTIONS: Record<string, number[]> = {
  'road-straight': [0, 2],
  'road-curve': [0, 3],
  'road-t': [0, 2, 3],
  'road-cross': [0, 1, 2, 3],
  'road-bridge': [0, 2],
  'road-oneway-straight': [0, 2],
  'road-oneway-bridge': [0, 2],
  'road-oneway-curve': [0, 3],
  'road-oneway-curve-reverse': [1, 2],
  'road-4lane-straight': [0, 2],
  'road-4lane-curve': [0, 3],
  'road-4lane-t': [0, 2, 3],
  'road-4lane-cross': [0, 1, 2, 3],
  'road-4lane-bridge': [0, 2],
  'road-transition-2to4': [0, 2],
  'road-roundabout': [0, 1, 2, 3],
  'road-end': [2],
  'road-4lane-end': [2],
  'rail-straight': [0, 2],
  'rail-curve': [0, 3],
  'rail-t': [0, 2, 3],
  'rail-cross': [0, 1, 2, 3],
  'rail-end': [2],
  'rail-trestle': [0, 2],
  'rail-road-crossing': [0, 1, 2, 3],
  'parking-1x1': [0, 1, 2, 3],
  'parking-1x2': [0, 1, 2, 3],
  'parking-1x3': [0, 1, 2, 3],
  'parking-2x2': [0, 1, 2, 3],
  'parking-2x4': [0, 1, 2, 3],
  'parking-4x4': [0, 1, 2, 3],
};

const FOUR_LANE_INNER = 1;
const FOUR_LANE_OUTER = 2.5;

function isIntersectionTile(type: string): boolean {
  return type.includes('cross') || type.includes('roundabout') || type.includes('-t');
}

function shiftLaneRight(lane: number, is4Lane: boolean): number | null {
  if (is4Lane) {
    if (lane < 0) {
      return lane <= -FOUR_LANE_OUTER ? FOUR_LANE_INNER * -1 : null;
    }
    return lane < FOUR_LANE_OUTER ? FOUR_LANE_OUTER : null;
  }
  return lane < FOUR_LANE_INNER ? FOUR_LANE_INNER : null;
}

function shiftLaneLeft(lane: number, is4Lane: boolean): number | null {
  if (is4Lane) {
    if (lane > 0) {
      return lane >= FOUR_LANE_OUTER ? FOUR_LANE_INNER : null;
    }
    return lane > -FOUR_LANE_OUTER ? -FOUR_LANE_OUTER : null;
  }
  return lane > -FOUR_LANE_INNER ? -FOUR_LANE_INNER : null;
}

export function getMultiTileCells(type: string, rotation: number): { dx: number; dy: number; isAnchor: boolean; localX: number; localY: number }[] {
  const { w, h } = getMultiTileDimensions(type);
  const cells = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let dx = x;
      let dy = y;
      if (rotation === 90) {
        dx = -y;
        dy = x;
      } else if (rotation === 180) {
        dx = -x;
        dy = -y;
      } else if (rotation === 270) {
        dx = y;
        dy = -x;
      }
      cells.push({
        dx,
        dy,
        isAnchor: x === 0 && y === 0,
        localX: x,
        localY: y
      });
    }
  }
  return cells;
}

// New multi-tile dimensions for large buildings (relative to 1x1 house)
export function getMultiTileDimensions(type: string): { w: number; h: number } {
  if (type === 'parking-1x1') return { w: 1, h: 1 };
  if (type === 'parking-1x2') return { w: 1, h: 2 };
  if (type === 'parking-1x3') return { w: 1, h: 3 };
  if (type === 'parking-2x2') return { w: 2, h: 2 };
  if (type === 'parking-2x4') return { w: 2, h: 4 };
  if (type === 'parking-4x4') return { w: 4, h: 4 };
  // Large buildings (sized relative to house=1 tile)
  if (type === 'building-strip-mall') return { w: 3, h: 1 };
  if (type === 'building-lumbermill') return { w: 3, h: 2 };
  if (type === 'building-apartment') return { w: 2, h: 3 };
  if (type === 'building-highschool') return { w: 3, h: 3 };
  if (type === 'building-college') return { w: 4, h: 2 };
  if (type === 'building-university') return { w: 4, h: 3 };
  if (type === 'building-large-park') return { w: 4, h: 4 };
  if (type === 'building-warehouse-large') return { w: 3, h: 2 };
  if (type === 'building-factory-large') return { w: 3, h: 2 };
  if (type === 'building-train-station-large') return { w: 2, h: 2 };
  return { w: 1, h: 1 };
}

// Economy / dock helpers (new buildings)
export function isEconomyBuilding(type: string): boolean {
  return type.startsWith('building-') && (
    type.includes('warehouse') || type.includes('factory') || type === 'building-store' ||
    type === 'building-strip-mall' || type === 'building-lumbermill' || type === 'building-station' ||
    type === 'building-train-station-large'
  );
}

export function getBuildingRole(type: string): 'warehouse' | 'factory' | 'store' | 'lumbermill' | 'none' {
  if (type === 'building-warehouse' || type === 'building-warehouse-large') return 'warehouse';
  if (type === 'building-factory' || type === 'building-factory-large') return 'factory';
  if (type === 'building-lumbermill') return 'lumbermill';
  if (type === 'building-store' || type === 'building-strip-mall') return 'store';
  return 'none';
}

const ITEM_EMOJI_MAP: Record<string, string> = {
  lumber: '🪵',
  logs: '🌲',
  goods: '📦',
  steel: '🔩',
  food: '🍎',
  ore: '⛏️',
  coal: '🪨',
  water: '💧',
  fuel: '⛽',
  plastic: '🧴',
  glass: '🫙',
  cotton: '🧵',
  wheat: '🌾',
  meat: '🥩',
  fish: '🐟',
  tools: '🔧',
  parts: '⚙️',
};

const ITEM_EMOJI_PICKER = [
  '📦', '🪵', '🌲', '🔩', '🍎', '💧', '⛽', '⛏️', '🔧', '⚙️', '🥩', '🐟', '🌾', '🧵', '🪨', '🧴', '🫙',
  '🍞', '🪴', '⚡', '🧱', '🛢️', '🚗', '💎', '🧪', '📄', '🔋', '🏭', '📊', '🧊', '☕', '🥫', '🧃',
];

function normalizeItemId(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '_');
}

function guessItemEmoji(itemId: string): string {
  if (ITEM_EMOJI_MAP[itemId]) return ITEM_EMOJI_MAP[itemId];
  const label = itemId.toLowerCase();
  if (/wood|lumber|log/.test(label)) return '🪵';
  if (/food|apple|bread|meal/.test(label)) return '🍎';
  if (/steel|metal|iron/.test(label)) return '🔩';
  if (/water/.test(label)) return '💧';
  if (/fuel|gas|oil/.test(label)) return '⛽';
  if (/ore|rock|stone|coal/.test(label)) return '⛏️';
  if (/tool|part|goods/.test(label)) return '🔧';
  return '📦';
}

export function getItemEmoji(itemId: string, itemDefs?: ItemDef[]): string {
  const def = itemDefs?.find(d => d.id === itemId);
  if (def?.emoji) return def.emoji;
  if (ITEM_EMOJI_MAP[itemId]) return ITEM_EMOJI_MAP[itemId];
  const label = (def?.name || itemId).toLowerCase();
  if (/wood|lumber|log/.test(label)) return '🪵';
  if (/food|apple|bread|meal/.test(label)) return '🍎';
  if (/steel|metal|iron/.test(label)) return '🔩';
  if (/water/.test(label)) return '💧';
  if (/fuel|gas|oil/.test(label)) return '⛽';
  if (/ore|rock|stone|coal/.test(label)) return '⛏️';
  if (/tool|part/.test(label)) return '🔧';
  return '📦';
}

function getItemDisplayName(itemId: string, itemDefs: ItemDef[]): string {
  const def = itemDefs.find(d => d.id === itemId);
  return def
    ? `${getItemEmoji(itemId, itemDefs)} ${def.name}`
    : `${getItemEmoji(itemId, itemDefs)} ${itemId}`;
}

function getItemIdLabel(itemId: string, itemDefs: ItemDef[]): string {
  return `${getItemEmoji(itemId, itemDefs)} ${itemId}`;
}

function VehicleTypeIcon({ type }: { type?: Vehicle['type'] }) {
  const cls = 'w-3.5 h-3.5 shrink-0 text-slate-500';
  if (type === 'train') return <Train className={cls} aria-hidden />;
  if (type === 'semi') return <CarFront className={cls} aria-hidden />;
  return <Car className={cls} aria-hidden />;
}

function getVehicleCargoTotals(v: Vehicle): Array<[string, number]> {
  const totals = new Map<string, number>();
  const addCargo = (cargo?: Cargo) => {
    Object.entries(cargo || {}).forEach(([id, qty]) => {
      if (qty > 0) totals.set(id, (totals.get(id) || 0) + qty);
    });
  };
  v.trailerCargos?.forEach(addCargo);
  v.railcarCargos?.forEach(addCargo);
  return Array.from(totals.entries());
}

function ItemSelect({
  itemDefs,
  value,
  onChange,
  placeholder = 'Select item…',
  className = 'flex-1 min-w-0',
  excludeIds = [],
}: {
  itemDefs: ItemDef[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  className?: string;
  excludeIds?: string[];
}) {
  const options = itemDefs.filter(d => !excludeIds.includes(d.id) || d.id === value);
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={`border px-1 text-xs rounded bg-white ${className}`}
    >
      <option value="">{placeholder}</option>
      {options.map(def => (
        <option key={def.id} value={def.id}>
          {getItemEmoji(def.id, itemDefs)} {def.name}
        </option>
      ))}
    </select>
  );
}

function ItemEmojiPicker({
  value,
  onChange,
  compact = false,
}: {
  value: string;
  onChange: (emoji: string) => void;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-wrap gap-0.5 ${compact ? '' : 'mt-1'}`}>
      {ITEM_EMOJI_PICKER.map(emoji => (
        <button
          key={emoji}
          type="button"
          onClick={() => onChange(emoji)}
          className={`leading-none rounded border transition-colors ${
            compact ? 'text-sm px-1 py-0.5' : 'text-base px-1.5 py-1'
          } ${value === emoji ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-400' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
          title={`Use ${emoji}`}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

function ItemCountBadge({
  emoji,
  count,
  variant,
  alert,
}: {
  emoji: string;
  count: number;
  variant: 'in' | 'out' | 'inv';
  alert?: 'red' | 'yellow' | null;
}) {
  const colors = {
    in: 'bg-amber-100/95 border-amber-300 text-amber-950',
    out: 'bg-emerald-100/95 border-emerald-300 text-emerald-950',
    inv: 'bg-sky-100/95 border-sky-300 text-sky-950',
  };
  const alertClass = alert === 'red' ? 'badge-blink-red' : alert === 'yellow' ? 'badge-blink-yellow' : '';
  return (
    <span className={`inline-flex items-center gap-px px-0.5 py-px rounded border text-[8px] font-bold leading-none shadow-sm ${colors[variant]} ${alertClass}`}>
      <span className="text-[9px]">{emoji}</span>
      <span>{count}</span>
    </span>
  );
}

const DEFAULT_INVENTORY_CAPACITY = 100;

function getDefaultItemCapacity(role: BuildingConfig['role'], itemId: string): number {
  if (role === 'warehouse') return 200;
  if (role === 'store') return itemId === 'goods' ? 80 : 60;
  if (role === 'factory') {
    if (itemId === 'lumber') return 100;
    if (itemId === 'goods') return 80;
    return DEFAULT_INVENTORY_CAPACITY;
  }
  if (role === 'lumbermill') {
    if (itemId === 'logs') return 120;
    if (itemId === 'lumber') return 100;
    return DEFAULT_INVENTORY_CAPACITY;
  }
  return DEFAULT_INVENTORY_CAPACITY;
}

function buildDefaultInventoryCapacities(cfg: BuildingConfig): Record<string, number> {
  const caps: Record<string, number> = { ...(cfg.inventoryCapacity || {}) };
  const seedItems = new Set<string>();
  Object.keys(cfg.inventory || {}).forEach(id => seedItems.add(id));
  (cfg.recipeInputs || []).forEach(i => i.item && seedItems.add(i.item));
  (cfg.recipeOutputs || []).forEach(o => o.item && seedItems.add(o.item));
  Object.keys(cfg.consumptionRates || {}).forEach(id => seedItems.add(id));
  if (cfg.role === 'factory') ['lumber', 'goods'].forEach(id => seedItems.add(id));
  if (cfg.role === 'lumbermill') ['logs', 'lumber'].forEach(id => seedItems.add(id));
  if (cfg.role === 'store') seedItems.add('goods');
  seedItems.forEach(itemId => {
    if (caps[itemId] === undefined) caps[itemId] = getDefaultItemCapacity(cfg.role, itemId);
  });
  return caps;
}

function normalizeBuildingConfig(cfg: BuildingConfig): BuildingConfig {
  const inventoryCapacity = buildDefaultInventoryCapacities(cfg);
  const withCaps = { ...cfg, inventoryCapacity };
  const inventory = { ...(cfg.inventory || {}) };
  Object.keys(inventory).forEach(itemId => {
    inventory[itemId] = Math.min(inventory[itemId], getItemCapacity(withCaps, itemId));
  });
  return { ...withCaps, inventory };
}

function getItemCapacity(cfg: BuildingConfig, itemId: string): number {
  return cfg.inventoryCapacity?.[itemId] ?? getDefaultItemCapacity(cfg.role, itemId);
}

function getInventorySpace(cfg: BuildingConfig, itemId: string): number {
  return Math.max(0, getItemCapacity(cfg, itemId) - (cfg.inventory[itemId] || 0));
}

function getAcceptAmount(cfg: BuildingConfig, itemId: string, offered: number): number {
  return Math.min(offered, getInventorySpace(cfg, itemId));
}

function hasOutputCapacity(cfg: BuildingConfig): boolean {
  return (cfg.recipeOutputs || []).every(
    out => getInventorySpace(cfg, out.item) >= (out.amount || 1)
  );
}

function isProcessBuilding(cfg: BuildingConfig): boolean {
  return (cfg.role === 'factory' || cfg.role === 'lumbermill') && !!(cfg.recipeInputs?.length);
}

function getRecipeInputItemAlert(
  cfg: BuildingConfig,
  itemId: string,
  economyPaused: boolean
): 'red' | 'yellow' | null {
  if (!isProcessBuilding(cfg) || !cfg.productionEnabled || economyPaused) return null;
  const inp = (cfg.recipeInputs || []).find(i => i.item === itemId);
  if (!inp) return null;
  const qty = cfg.inventory[itemId] || 0;
  const need = inp.amount || 1;
  if (qty < need) return 'red';
  if (qty < need * 2) return 'yellow';
  return null;
}

function getOutputItemAlert(cfg: BuildingConfig, itemId: string, qty: number): 'red' | 'yellow' | null {
  const cap = getItemCapacity(cfg, itemId);
  if (qty >= cap) return 'red';
  if (qty >= cap * 0.8) return 'yellow';
  return null;
}

function getProcessInputInventory(cfg: BuildingConfig): Array<[string, number]> {
  return (cfg.recipeInputs || [])
    .filter(inp => inp.item)
    .map(inp => [inp.item, cfg.inventory[inp.item] || 0] as [string, number]);
}

function getProcessOutputInventory(cfg: BuildingConfig): Array<[string, number]> {
  const inputIds = new Set((cfg.recipeInputs || []).map(inp => inp.item));
  const items = new Map<string, number>();
  (cfg.recipeOutputs || []).forEach(out => {
    if (out.item) items.set(out.item, cfg.inventory[out.item] || 0);
  });
  Object.entries(cfg.inventory || {}).forEach(([id, qty]) => {
    if (qty > 0 && !inputIds.has(id)) items.set(id, qty);
  });
  return Array.from(items.entries());
}

function BuildingTileBadges({
  cfg,
  buildingW,
  buildingH,
  itemDefs,
  showInventoryLabels = true,
  cycleRemaining = null,
  economyPaused = false,
  onToggleProduction,
  canControlProduction = false,
}: {
  cfg: BuildingConfig;
  buildingW: number;
  buildingH: number;
  itemDefs: ItemDef[];
  showInventoryLabels?: boolean;
  cycleRemaining?: number | null;
  economyPaused?: boolean;
  onToggleProduction?: () => void;
  canControlProduction?: boolean;
}) {
  const footprintW = buildingW * GRID_SIZE;
  const footprintH = buildingH * GRID_SIZE;

  if (isProcessBuilding(cfg)) {
    if (!showInventoryLabels) return null;
    const inputs = getProcessInputInventory(cfg);
    const outputs = getProcessOutputInventory(cfg);
    const cycleSec = cfg.cycleTimeSec;
    if (inputs.length === 0 && outputs.length === 0 && !cycleSec) return null;

    return (
      <div
        className="absolute pointer-events-none z-10 flex flex-col items-center justify-center gap-px leading-none"
        style={{ width: footprintW, height: footprintH }}
      >
        {inputs.length > 0 && (
          <div className="flex flex-wrap justify-center gap-px px-0.5 shrink-0">
            {inputs.map(([itemId, qty]) => (
              <ItemCountBadge
                key={`proc-in-${itemId}`}
                emoji={getItemEmoji(itemId, itemDefs)}
                count={qty}
                variant="inv"
                alert={getRecipeInputItemAlert(cfg, itemId, economyPaused)}
              />
            ))}
          </div>
        )}

        {(cycleRemaining !== null || cycleSec || onToggleProduction) && (
          <div
            className="flex items-center justify-center gap-0.5 shrink-0 -my-px pointer-events-auto"
            data-grid-control
          >
            {onToggleProduction && (
              <button
                type="button"
                title={cfg.productionEnabled ? 'Stop production' : 'Start production'}
                disabled={!canControlProduction || economyPaused}
                onMouseDown={e => e.stopPropagation()}
                onClick={e => {
                  e.stopPropagation();
                  onToggleProduction();
                }}
                className={`inline-flex items-center justify-center w-4 h-4 rounded border shadow-sm transition-colors disabled:opacity-40 ${
                  cfg.productionEnabled
                    ? 'bg-indigo-600 border-indigo-700 text-white hover:bg-indigo-700'
                    : 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cfg.productionEnabled ? (
                  <Pause className="w-2.5 h-2.5" />
                ) : (
                  <Play className="w-2.5 h-2.5" />
                )}
              </button>
            )}
            {cycleRemaining !== null ? (
              <CycleCountdownBadge remaining={cycleRemaining} className="text-[8px] px-0.5 py-px" />
            ) : cycleSec ? (
              <span className="inline-flex items-center gap-px px-0.5 py-px rounded border text-[8px] font-bold leading-none shadow-sm bg-violet-100/95 border-violet-300 text-violet-950">
                <span className="text-[8px]">🕐</span>
                <span>{cycleSec}s</span>
              </span>
            ) : null}
          </div>
        )}

        {outputs.length > 0 && (
          <div className="flex flex-wrap justify-center gap-px px-0.5 shrink-0">
            {outputs.map(([itemId, qty]) => (
              <ItemCountBadge
                key={`proc-out-${itemId}`}
                emoji={getItemEmoji(itemId, itemDefs)}
                count={qty}
                variant="out"
                alert={getOutputItemAlert(cfg, itemId, qty)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const name = cfg.name?.trim();
  const inputs = (cfg.recipeInputs || []).filter(inp => inp.item);
  const recipeOutputs = (cfg.recipeOutputs || []).filter(out => out.item);
  const storeOutputs =
    cfg.role === 'store'
      ? Object.entries(cfg.consumptionRates || {})
          .filter(([, rate]) => rate > 0)
          .map(([item, amount]) => ({ item, amount }))
      : [];
  const outputs = recipeOutputs.length > 0 ? recipeOutputs : storeOutputs;
  const inventory = Object.entries(cfg.inventory || {}).filter(([, qty]) => qty > 0);

  if (!name && inputs.length === 0 && outputs.length === 0 && inventory.length === 0 && cycleRemaining === null) {
    return null;
  }

  return (
    <div
      className="absolute pointer-events-none z-10"
      style={{ width: footprintW, height: footprintH }}
    >
      {inputs.length > 0 && (
        <div className="absolute top-0.5 left-0 right-0 flex flex-wrap justify-center gap-0.5 px-0.5">
          {inputs.map((inp, i) => (
            <ItemCountBadge
              key={`in-${inp.item}-${i}`}
              emoji={getItemEmoji(inp.item, itemDefs)}
              count={inp.amount}
              variant="in"
            />
          ))}
        </div>
      )}

      {(name || cycleRemaining !== null) && (
        <div className="absolute inset-0 flex items-center justify-center px-1 pointer-events-none">
          <div className="flex flex-col items-center gap-0.5 max-w-full">
            {name && (
              <div className="px-1.5 py-0.5 bg-white/92 border border-slate-300 rounded-full text-[9px] font-bold text-slate-800 shadow-sm max-w-full truncate">
                {name}
              </div>
            )}
            {cycleRemaining !== null && <CycleCountdownBadge remaining={cycleRemaining} />}
          </div>
        </div>
      )}

      {outputs.length > 0 && (
        <div
          className="absolute left-0 right-0 flex flex-wrap justify-center gap-0.5 px-0.5"
          style={{ bottom: inventory.length > 0 ? 14 : 2 }}
        >
          {outputs.map((out, i) => (
            <ItemCountBadge
              key={`out-${out.item}-${i}`}
              emoji={getItemEmoji(out.item, itemDefs)}
              count={out.amount}
              variant="out"
            />
          ))}
        </div>
      )}

      {showInventoryLabels && inventory.length > 0 && (
        <div className="absolute bottom-0.5 left-0 right-0 flex flex-wrap justify-center gap-0.5 px-0.5">
          {inventory.map(([itemId, qty]) => (
            <ItemCountBadge
              key={`inv-${itemId}`}
              emoji={getItemEmoji(itemId, itemDefs)}
              count={qty}
              variant="inv"
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function getDockLocalCells(type: string, rotation: number = 0): { localX: number; localY: number }[] {
  // Return local (unrotated) dock positions for semis. Docks face "south" in local coords for simplicity.
  if (type === 'building-warehouse-large') {
    // Bottom row has 2 dock bays
    return [{ localX: 0, localY: 1 }, { localX: 1, localY: 1 }];
  }
  if (type === 'building-factory-large') {
    return [{ localX: 0, localY: 1 }, { localX: 2, localY: 1 }];
  }
  if (type === 'building-lumbermill') {
    return [{ localX: 1, localY: 1 }]; // one main loading bay
  }
  if (type === 'building-train-station-large') {
    return [{ localX: 0, localY: 1 }, { localX: 1, localY: 1 }];
  }
  return [];
}

export function isDockCell(type: string, localX: number, localY: number, rotation: number = 0): boolean {
  const docks = getDockLocalCells(type, rotation);
  return docks.some(d => d.localX === localX && d.localY === localY);
}

const TRANSFER_BATCH = 5;

export type TrailerRef =
  | { kind: 'parked'; id: string }
  | { kind: 'vehicle'; vehicleId: string; trailerIndex: number };

export type RailcarRef = { vehicleId: string; railcarIndex: number };

export type VehiclePanelType = 'car' | 'semi' | 'train';

function railcarCanHoldCargo(railcarType: RailcarType): boolean {
  return railcarType !== 'passenger';
}

function syncRailcarCargos(v: Vehicle): Vehicle {
  if (v.type !== 'train' || !v.railcars?.length) {
    if (v.railcarCargos) {
      const next = { ...v };
      delete next.railcarCargos;
      return next;
    }
    return v;
  }
  const cargos = [...(v.railcarCargos || [])];
  while (cargos.length < v.railcars.length) cargos.push({});
  if (cargos.length > v.railcars.length) cargos.splice(v.railcars.length);
  return { ...v, railcarCargos: cargos };
}

function isSemiParkingTile(tile: GridTile): boolean {
  if (tile.type === 'parking-2x4') return true;
  if (tile.type === 'parking-4x4') return (tile.localX ?? 0) <= 1;
  return false;
}

function gridDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function getBuildingCells(grid: GridData, anchorKey: string): { x: number; y: number }[] {
  const cells: { x: number; y: number }[] = [];
  for (const [key, tiles] of Object.entries(grid)) {
    for (const t of tiles) {
      const isAnchor = t.part !== 'member' && key === anchorKey;
      const isMember = t.part === 'member' && t.anchorKey === anchorKey;
      if (isAnchor || isMember) {
        const [x, y] = key.split(',').map(Number);
        cells.push({ x, y });
      }
    }
  }
  return cells;
}

function getEconomyBuildingAtPoint(
  gridX: number,
  gridY: number,
  grid: GridData
): { anchorKey: string; tile: GridTile } | null {
  const tiles = grid[`${gridX},${gridY}`];
  if (!tiles?.length) return null;
  for (let i = tiles.length - 1; i >= 0; i--) {
    const t = tiles[i];
    if (isEconomyBuilding(t.type)) {
      const anchorKey = t.part === 'member' ? t.anchorKey! : `${gridX},${gridY}`;
      return { anchorKey, tile: t };
    }
  }
  return null;
}

function getDockBuildingAtPoint(gridX: number, gridY: number, grid: GridData): string | null {
  const hit = getEconomyBuildingAtPoint(gridX, gridY, grid);
  if (!hit) return null;
  const lx = hit.tile.localX ?? 0;
  const ly = hit.tile.localY ?? 0;
  if (isDockCell(hit.tile.type, lx, ly, hit.tile.rotation)) return hit.anchorKey;
  return null;
}

function findNearbyEconomyBuildings(
  x: number,
  y: number,
  grid: GridData,
  economy: EconomyState,
  maxDist = 3
): string[] {
  const result: string[] = [];
  for (const anchorKey of Object.keys(economy.buildings)) {
    const cells = getBuildingCells(grid, anchorKey);
    if (!cells.length) continue;
    const minDist = Math.min(...cells.map(c => gridDistance(c, { x, y })));
    if (minDist <= maxDist) result.push(anchorKey);
  }
  return result;
}

function getTrailerWorldPoint(
  ref: TrailerRef,
  vehicles: Record<string, Vehicle>,
  economy: EconomyState
): { x: number; y: number } | null {
  if (ref.kind === 'parked') {
    const t = economy.parkedTrailers?.[ref.id];
    return t ? { x: t.gridX, y: t.gridY } : null;
  }
  const v = vehicles[ref.vehicleId];
  return v ? { x: v.x, y: v.y } : null;
}

function getTrailerCargo(
  ref: TrailerRef,
  vehicles: Record<string, Vehicle>,
  economy: EconomyState
): Cargo {
  if (ref.kind === 'parked') {
    return { ...(economy.parkedTrailers?.[ref.id]?.cargo || {}) };
  }
  const v = vehicles[ref.vehicleId];
  return { ...(v?.trailerCargos?.[ref.trailerIndex] || {}) };
}

function setTrailerCargo(
  ref: TrailerRef,
  cargo: Cargo,
  vehicles: Record<string, Vehicle>,
  economy: EconomyState
): { vehicles: Record<string, Vehicle>; economy: EconomyState } {
  const cleaned = { ...cargo };
  Object.keys(cleaned).forEach(k => { if (cleaned[k] <= 0) delete cleaned[k]; });

  if (ref.kind === 'parked') {
    const t = economy.parkedTrailers?.[ref.id];
    if (!t) return { vehicles, economy };
    const nextTrailers = { ...(economy.parkedTrailers || {}), [ref.id]: { ...t, cargo: cleaned } };
    return { vehicles, economy: { ...economy, parkedTrailers: nextTrailers } };
  }

  const v = vehicles[ref.vehicleId];
  if (!v) return { vehicles, economy };
  const newCargos = [...(v.trailerCargos || [])];
  while (newCargos.length <= ref.trailerIndex) newCargos.push({});
  newCargos[ref.trailerIndex] = cleaned;
  return {
    vehicles: { ...vehicles, [ref.vehicleId]: { ...v, trailerCargos: newCargos } },
    economy,
  };
}

function getRailcarCargo(
  ref: RailcarRef,
  vehicles: Record<string, Vehicle>
): Cargo {
  const v = vehicles[ref.vehicleId];
  return { ...(v?.railcarCargos?.[ref.railcarIndex] || {}) };
}

function setRailcarCargo(
  ref: RailcarRef,
  cargo: Cargo,
  vehicles: Record<string, Vehicle>
): Record<string, Vehicle> {
  const cleaned = { ...cargo };
  Object.keys(cleaned).forEach(k => { if (cleaned[k] <= 0) delete cleaned[k]; });

  const v = vehicles[ref.vehicleId];
  if (!v) return vehicles;
  const newCargos = [...(v.railcarCargos || [])];
  while (newCargos.length <= ref.railcarIndex) newCargos.push({});
  newCargos[ref.railcarIndex] = cleaned;
  return { ...vehicles, [ref.vehicleId]: syncRailcarCargos({ ...v, railcarCargos: newCargos }) };
}

function transferTrailerToBuilding(
  trailerCargo: Cargo,
  buildingCfg: BuildingConfig,
  itemId: string,
  amount = TRANSFER_BATCH
): { trailerCargo: Cargo; buildingCfg: BuildingConfig; moved: number } | null {
  const qty = trailerCargo[itemId] || 0;
  if (qty <= 0) return null;
  const move = getAcceptAmount(buildingCfg, itemId, Math.min(amount, qty));
  if (move <= 0) return null;
  const newCargo = { ...trailerCargo };
  newCargo[itemId] = qty - move;
  if (newCargo[itemId] <= 0) delete newCargo[itemId];
  const newInv = { ...(buildingCfg.inventory || {}) };
  newInv[itemId] = (newInv[itemId] || 0) + move;
  return {
    trailerCargo: newCargo,
    buildingCfg: { ...buildingCfg, inventory: newInv },
    moved: move,
  };
}

function transferBuildingToTrailer(
  trailerCargo: Cargo,
  buildingCfg: BuildingConfig,
  itemId: string,
  amount = TRANSFER_BATCH
): { trailerCargo: Cargo; buildingCfg: BuildingConfig; moved: number } | null {
  const qty = buildingCfg.inventory[itemId] || 0;
  if (qty <= 0) return null;
  const move = Math.min(amount, qty);
  if (move <= 0) return null;
  const newInv = { ...buildingCfg.inventory };
  newInv[itemId] = qty - move;
  if (newInv[itemId] <= 0) delete newInv[itemId];
  const newCargo = { ...trailerCargo };
  newCargo[itemId] = (newCargo[itemId] || 0) + move;
  return {
    trailerCargo: newCargo,
    buildingCfg: { ...buildingCfg, inventory: newInv },
    moved: move,
  };
}

function isStallOccupied(
  parkingLotKey: string,
  stallIndex: number,
  parkedTrailers: Record<string, ParkedTrailer> | undefined,
  excludeId?: string
): boolean {
  return Object.values(parkedTrailers || {}).some(
    t => t.id !== excludeId && t.parkingLotKey === parkingLotKey && t.stallIndex === stallIndex
  );
}

function getVehicleSurfaceTile(v: Vehicle, grid: GridData): GridTile | undefined {
  const tiles = grid[`${v.x},${v.y}`];
  if (!tiles) return undefined;
  return tiles.find(t => {
    const isBridge = t.type.includes('bridge');
    return (v.zIndex === 1 && isBridge) || (v.zIndex === 0 && !isBridge);
  });
}

function getSemiParkingLotKey(v: Vehicle, grid: GridData): string | null {
  if (v.lastParkingKey) return v.lastParkingKey;
  const tile = getVehicleSurfaceTile(v, grid);
  if (!tile || !isSemiParkingTile(tile)) return null;
  const key = `${v.x},${v.y}`;
  return tile.part === 'member' ? tile.anchorKey || key : key;
}

function normalizeVehicles(raw: Record<string, Vehicle> | Vehicle[] | null | undefined): Record<string, Vehicle> {
  if (!raw) return {};
  const entries: [string, Vehicle][] = Array.isArray(raw)
    ? raw.filter(Boolean).map(v => [v.id, syncRailcarCargos({ ...v, id: v.id })])
    : Object.entries(raw).map(([key, v]) => {
        const id = v?.id || key;
        return [id, syncRailcarCargos({ ...v, id })] as [string, Vehicle];
      });
  return Object.fromEntries(entries);
}

function getVehicleById(vehicleMap: Record<string, Vehicle>, id: string): Vehicle | undefined {
  return vehicleMap[id] ?? Object.values(vehicleMap).find(v => v.id === id);
}

function isSemiVehicle(v: Vehicle | undefined): boolean {
  if (!v) return false;
  return v.type === 'semi' || (v.trailers ?? 0) > 0;
}

function getSemiTrailerCount(v: Vehicle): number {
  if (!isSemiVehicle(v)) return 0;
  return Math.max(0, v.trailers ?? 1);
}

function vehicleMatchesPanelType(v: Vehicle | undefined, panelType: VehiclePanelType): boolean {
  if (!v) return false;
  if (panelType === 'car') return !v.type || v.type === 'car';
  if (panelType === 'semi') return isSemiVehicle(v);
  return v.type === 'train';
}

function filterSelectionByPanelType(
  selected: Set<string>,
  vehicleMap: Record<string, Vehicle>,
  panelType: VehiclePanelType
): Set<string> {
  return new Set(Array.from(selected).filter(id => vehicleMatchesPanelType(getVehicleById(vehicleMap, id), panelType)));
}

function getSelectedSemiIds(
  selected: Set<string>,
  vehicleMap: Record<string, Vehicle>
): string[] {
  return Array.from(selected).filter(id => isSemiVehicle(getVehicleById(vehicleMap, id)));
}

function canSemiDropTrailer(v: Vehicle, grid: GridData): boolean {
  if (!isSemiVehicle(v) || getSemiTrailerCount(v) <= 0) return false;
  return !!getSemiParkingLotKey(v, grid);
}

function getDropTrailerHint(
  v: Vehicle,
  grid: GridData,
  parkedTrailers: Record<string, ParkedTrailer> | undefined
): string {
  if (!isSemiVehicle(v)) return 'Select a semi truck.';
  if (getSemiTrailerCount(v) <= 0) return 'This semi has no trailers attached.';
  const lotKey = getSemiParkingLotKey(v, grid);
  if (!lotKey) return 'Drive into a semi parking lot (2×4 or 4×4 semi bays), then drop.';
  const stallIdx = v.parkingStallIndex ?? 0;
  if (isStallOccupied(lotKey, stallIdx, parkedTrailers)) return 'This parking stall already has a dropped trailer.';
  return 'Ready — drop the rear trailer in the current stall.';
}

function canPickupParkedTrailer(v: Vehicle, trailer: ParkedTrailer): boolean {
  if (!isSemiVehicle(v) || getSemiTrailerCount(v) >= 2) return false;
  const sameLot = v.lastParkingKey === trailer.parkingLotKey;
  const near = gridDistance({ x: v.x, y: v.y }, { x: trailer.gridX, y: trailer.gridY }) <= 2;
  return sameLot || near;
}

function makeParkedTrailerId(): string {
  return `trailer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getSemiDockBuilding(v: Vehicle, grid: GridData, economy: EconomyState): string | null {
  const dockKey = getDockBuildingAtPoint(v.x, v.y, grid);
  if (dockKey && economy.buildings[dockKey]) return dockKey;
  return findNearbyEconomyBuildings(v.x, v.y, grid, economy, 2)[0] || null;
}

function findParkingTileForTrailer(pt: ParkedTrailer, grid: GridData): GridTile | undefined {
  const key = `${pt.gridX},${pt.gridY}`;
  const tiles = grid[key];
  if (!tiles?.length) return undefined;
  return (
    tiles.find(t => {
      if (!t.type.startsWith('parking-')) return false;
      const lotKey = t.part === 'member' ? t.anchorKey : key;
      return lotKey === pt.parkingLotKey;
    }) || tiles.find(t => t.type.startsWith('parking-'))
  );
}

function findNearbyTrailersForBuilding(
  bkey: string,
  grid: GridData,
  economy: EconomyState,
  vehicles: Record<string, Vehicle>,
  maxDist = 3
): TrailerRef[] {
  const cells = getBuildingCells(grid, bkey);
  if (!cells.length) return [];
  const refs: TrailerRef[] = [];

  for (const pt of Object.values(economy.parkedTrailers || {})) {
    const minDist = Math.min(...cells.map(c => gridDistance(c, { x: pt.gridX, y: pt.gridY })));
    if (minDist <= maxDist) refs.push({ kind: 'parked', id: pt.id });
  }

  for (const v of Object.values(vehicles) as Vehicle[]) {
    if (v.type !== 'semi' || !(v.trailers ?? 0)) continue;
    const minDist = Math.min(...cells.map(c => gridDistance(c, { x: v.x, y: v.y })));
    if (minDist <= maxDist) {
      for (let i = 0; i < (v.trailers ?? 0); i++) {
        refs.push({ kind: 'vehicle', vehicleId: v.id, trailerIndex: i });
      }
    }
  }
  return refs;
}

// === DESTINATION ROUTING: BFS for recommended exit heading at a junction ===
interface RouteNode {
  x: number;
  y: number;
  heading: number;
  cost: number;
  firstExit: number;
  prev?: { x: number; y: number; heading: number; exit: number };
}

function isDrivableForVehicle(tile: GridTile, vType: string): boolean {
  const isCrossing = tile.type === 'rail-road-crossing';
  if (vType === 'train') {
    return tile.type.startsWith('rail') || tile.type.includes('trestle') || isCrossing;
  }
  if (vType === 'semi') {
    const isBigParking = tile.type === 'parking-2x4' || tile.type === 'parking-4x4';
    return tile.type.startsWith('road') || isBigParking || isCrossing;
  }
  return tile.type.startsWith('road') || tile.type.startsWith('parking-') || isCrossing;
}

function resolveDestinationPoint(
  gridX: number,
  gridY: number,
  grid: GridData,
  vType: string
): Point | null {
  const tryCell = (x: number, y: number): Point | null => {
    const tiles = grid[`${x},${y}`];
    if (!tiles?.length) return null;
    const top = tiles[tiles.length - 1];
    return isDrivableForVehicle(top, vType) ? { x, y } : null;
  };

  const direct = tryCell(gridX, gridY);
  if (direct) return direct;

  const visited = new Set<string>();
  const queue: { x: number; y: number; d: number }[] = [{ x: gridX, y: gridY, d: 0 }];
  visited.add(`${gridX},${gridY}`);

  while (queue.length > 0) {
    const { x, y, d } = queue.shift()!;
    if (d > 40) break;

    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      const key = `${nx},${ny}`;
      if (visited.has(key)) continue;
      visited.add(key);

      const snapped = tryCell(nx, ny);
      if (snapped) return snapped;

      if (grid[key]) queue.push({ x: nx, y: ny, d: d + 1 });
    }
  }

  return null;
}

function getDestinationArrivalPatch(vehicle: Vehicle, tileX: number, tileY: number): Partial<Vehicle> {
  if (!vehicle.destination) return {};
  if (vehicle.destination.x === tileX && vehicle.destination.y === tileY) {
    return { destination: null, isMoving: false, turnIntent: null, progress: 0.5 };
  }
  return {};
}

export function getRecommendedExit(
  cx: number,
  cy: number,
  entryHeading: number,
  dest: Point,
  vType: 'car' | 'train' | 'semi' = 'car',
  grid: GridData
): number | null {
  if (!dest) return null;
  const g = grid || {};
  const key = (x: number, y: number, h: number) => `${x},${y},${h}`;
  const visited = new Set<string>();
  const queue: RouteNode[] = [];

  // Start after "current" tile: try all possible exits from current junction
  const startPorts = (TILE_CONNECTIONS[g[`${cx},${cy}`]?.[0]?.type || ''] || []).map(p => (p + (g[`${cx},${cy}`]?.[0]?.rotation || 0) / 90) % 4);
  const entryPort = (entryHeading / 90 + 2) % 4;
  const possibleExits = startPorts.filter(p => p !== entryPort);

  if (possibleExits.length === 0) return null;

  // Seed queue with 1-step moves
  for (const exitPort of possibleExits) {
    const exitH = exitPort * 90;
    const dx = exitH === 90 ? 1 : exitH === 270 ? -1 : 0;
    const dy = exitH === 180 ? 1 : exitH === 0 ? -1 : 0;
    const nx = cx + dx;
    const ny = cy + dy;
    const nkey = key(nx, ny, exitH);
    if (!visited.has(nkey)) {
      visited.add(nkey);
      queue.push({
        x: nx, y: ny, heading: exitH, cost: 1,
        firstExit: exitH,
        prev: { x: cx, y: cy, heading: entryHeading, exit: exitH },
      });
    }
  }

  const maxDepth = 180;
  let best: RouteNode | null = null;
  let bestCost = Infinity;

  while (queue.length > 0) {
    const node = queue.shift()!;
    if (node.cost > maxDepth) continue;

    // Reached dest tile (or any cell of a multi-building containing dest)
    if (node.x === dest.x && node.y === dest.y) {
      if (node.cost < bestCost) {
        bestCost = node.cost;
        best = node;
      }
      continue;
    }

    // Explore next exits
    const curTiles = g[`${node.x},${node.y}`];
    if (!curTiles) continue;
    const curTile = curTiles.find((t: any) => {
      const br = t.type.includes('bridge') || t.type.includes('trestle');
      return (node.heading === 0 || node.heading === 180 ? !br : true); // rough
    }) || curTiles[0];

    const ports = (TILE_CONNECTIONS[curTile?.type || ''] || []).map((p: number) => (p + (curTile?.rotation || 0) / 90) % 4);
    const entP = (node.heading / 90 + 2) % 4;
    let nextExits = ports.filter((p: number) => p !== entP);

    // Type filters (reuse existing logic)
    if (vType === 'train') {
      if (!curTile?.type?.startsWith('rail') && curTile?.type !== 'rail-road-crossing') continue;
    }

    for (const exP of nextExits) {
      const exH = exP * 90;
      const dx = exH === 90 ? 1 : exH === 270 ? -1 : 0;
      const dy = exH === 180 ? 1 : exH === 0 ? -1 : 0;
      const nx = node.x + dx, ny = node.y + dy;
      const nkey = key(nx, ny, exH);
      if (visited.has(nkey)) continue;
      visited.add(nkey);
      queue.push({
        x: nx, y: ny, heading: exH, cost: node.cost + 1,
        firstExit: node.firstExit,
        prev: { x: node.x, y: node.y, heading: node.heading, exit: exH },
      });
    }
  }

  if (best) return best.firstExit;

  // Fallback: pick the exit that points most toward dest
  const dx = dest.x - cx;
  const dy = dest.y - cy;
  let bestExit = possibleExits[0] * 90;
  let bestDot = -999;
  for (const p of possibleExits) {
    const h = p * 90;
    const ddx = (h === 90 ? 1 : h === 270 ? -1 : 0);
    const ddy = (h === 180 ? 1 : h === 0 ? -1 : 0);
    const dot = ddx * dx + ddy * dy;
    if (dot > bestDot) { bestDot = dot; bestExit = h; }
  }
  return bestExit;
}

const rotateGridData = (data: GridData): GridData => {
  const rotated: GridData = {};
  const entries = Object.entries(data) as [string, GridTile[]][];
  if (entries.length === 0) return {};

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  entries.forEach(([key]) => {
    const [x, y] = key.split(',').map(Number);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  });

  const width = maxX - minX;
  const height = maxY - minY;

  entries.forEach(([key, tiles]) => {
    const [x, y] = key.split(',').map(Number);
    const relX = x - minX;
    const relY = y - minY;
    
    const newRelX = height - relY;
    const newRelY = relX;
    
    rotated[`${newRelX},${newRelY}`] = tiles.map(tile => ({
      ...tile,
      rotation: (tile.rotation + 90) % 360
    }));
  });

  return rotated;
};

const DEFAULT_PLANT_GROWTH: PlantGrowthSettings = {
  growthDurationSec: 120,
  germinationSec: 15,
  paused: false,
};

const stopGridPropagation = (e: React.SyntheticEvent) => {
  e.stopPropagation();
};

const stopGridWheel = (e: React.WheelEvent) => {
  e.stopPropagation();
  e.nativeEvent.stopImmediatePropagation();
};

const isFromGridControl = (e: { target: EventTarget | null; composedPath?: () => EventTarget[] }) => {
  if (typeof e.composedPath === 'function') {
    const path = e.composedPath();
    if (path.some(node => node instanceof HTMLElement && node.hasAttribute('data-grid-control'))) {
      return true;
    }
  }
  const target = e.target as HTMLElement | null;
  if (target?.closest?.('[data-grid-control]')) return true;
  return false;
};

const isWheelOverGridControl = (e: WheelEvent) => {
  if (isFromGridControl(e)) return true;
  const atPoint = document.elementFromPoint(e.clientX, e.clientY);
  return !!atPoint?.closest('[data-grid-control]');
};

const blockGridPointerEvents: Pick<
  React.HTMLAttributes<HTMLElement>,
  | 'onMouseDown'
  | 'onMouseUp'
  | 'onMouseMove'
  | 'onPointerDown'
  | 'onPointerUp'
  | 'onClick'
  | 'onDoubleClick'
  | 'onWheel'
  | 'onContextMenu'
> = {
  onMouseDown: stopGridPropagation,
  onMouseUp: stopGridPropagation,
  onMouseMove: stopGridPropagation,
  onPointerDown: stopGridPropagation,
  onPointerUp: stopGridPropagation,
  onClick: stopGridPropagation,
  onDoubleClick: stopGridPropagation,
  onWheel: stopGridWheel,
  onContextMenu: stopGridPropagation,
};

const PALETTE_TILES: { type: TileType; label: string; category: 'road' | 'rail' | 'building' | 'landscape' }[] = [
  { type: 'road-straight', label: 'Straight Road', category: 'road' },
  { type: 'road-curve', label: 'Curve Road', category: 'road' },
  { type: 'road-t', label: 'T-Junction', category: 'road' },
  { type: 'road-cross', label: 'Crossroad', category: 'road' },
  { type: 'road-bridge', label: 'Road Bridge', category: 'road' },
  { type: 'road-oneway-straight', label: 'One-Way St', category: 'road' },
  { type: 'road-oneway-bridge', label: 'One-Way Bridge', category: 'road' },
  { type: 'road-oneway-curve', label: 'One-Way Cv', category: 'road' },
  { type: 'road-oneway-curve-reverse', label: 'One-Way Cv Rev', category: 'road' },
  { type: 'road-4lane-straight', label: '4-Lane St', category: 'road' },
  { type: 'road-4lane-curve', label: '4-Lane Cv', category: 'road' },
  { type: 'road-4lane-t', label: '4-Lane T', category: 'road' },
  { type: 'road-4lane-cross', label: '4-Lane X', category: 'road' },
  { type: 'road-4lane-bridge', label: '4-Lane Bridge', category: 'road' },
  { type: 'road-transition-2to4', label: '2-4 Transition', category: 'road' },
  { type: 'road-roundabout', label: 'Roundabout', category: 'road' },
  { type: 'rail-straight', label: 'Straight Rail', category: 'rail' },
  { type: 'rail-curve', label: 'Curve Rail', category: 'rail' },
  { type: 'rail-t', label: 'Rail T-Junction', category: 'rail' },
  { type: 'rail-cross', label: 'Rail Crossing', category: 'rail' },
  { type: 'rail-trestle', label: 'Rail Trestle', category: 'rail' },
  { type: 'rail-road-crossing', label: 'RR Crossing', category: 'rail' },
  { type: 'building-factory', label: 'Factory', category: 'building' },
  { type: 'building-warehouse', label: 'Warehouse', category: 'building' },
  { type: 'building-station', label: 'Train Station', category: 'building' },
  { type: 'building-home', label: 'Home', category: 'building' },
  { type: 'building-school', label: 'School', category: 'building' },
  { type: 'building-store', label: 'Store', category: 'building' },
  { type: 'building-playground', label: 'Playground', category: 'building' },
  { type: 'building-police', label: 'Police Station', category: 'building' },
  { type: 'building-fire', label: 'Fire Station', category: 'building' },
  { type: 'grass-plain', label: 'Grass', category: 'landscape' },
  { type: 'grass-tall', label: 'Tall Grass', category: 'landscape' },
  { type: 'grass-flowers', label: 'Flowers', category: 'landscape' },
  { type: 'tree-pine', label: 'Pine Tree', category: 'landscape' },
  { type: 'tree-pine-seedling', label: 'Pine Seedling', category: 'landscape' },
  { type: 'tree-oak', label: 'Oak Tree', category: 'landscape' },
  { type: 'landscape-gravel', label: 'Gravel', category: 'landscape' },
  { type: 'landscape-sand', label: 'Sand', category: 'landscape' },
  { type: 'parking-1x1', label: '1x1 Parking', category: 'road' },
  { type: 'parking-1x2', label: '1x2 Parking', category: 'road' },
  { type: 'parking-1x3', label: '1x3 Parking', category: 'road' },
  { type: 'parking-2x2', label: '2x2 Parking', category: 'road' },
  { type: 'parking-2x4', label: '2x4 Parking', category: 'road' },
  { type: 'parking-4x4', label: '4x4 Parking', category: 'road' },
  // New large multi-tile buildings (relative to 1-tile house)
  { type: 'building-strip-mall', label: 'Strip Mall (3x1)', category: 'building' },
  { type: 'building-lumbermill', label: 'Lumbermill (3x2)', category: 'building' },
  { type: 'building-apartment', label: 'Apartment (2x3)', category: 'building' },
  { type: 'building-highschool', label: 'High School (3x3)', category: 'building' },
  { type: 'building-college', label: 'College (4x2)', category: 'building' },
  { type: 'building-university', label: 'University (4x3)', category: 'building' },
  { type: 'building-large-park', label: 'Large Park (4x4)', category: 'building' },
  { type: 'building-warehouse-large', label: 'Warehouse Large + Docks (3x2)', category: 'building' },
  { type: 'building-factory-large', label: 'Factory Large + Docks (3x2)', category: 'building' },
  { type: 'building-train-station-large', label: 'Train Station Large (2x2)', category: 'building' },
];

function getDefaultBuildingName(type: string): string {
  return PALETTE_TILES.find(t => t.type === type)?.label || 'Building';
}

function getBuildingDisplayName(cfg: BuildingConfig, anchorKey: string): string {
  return cfg.name?.trim() || anchorKey;
}

function isRecipeBuilding(cfg: BuildingConfig): boolean {
  return (
    (cfg.role === 'factory' || cfg.role === 'lumbermill') &&
    !!cfg.productionEnabled &&
    !!cfg.cycleTimeSec &&
    !!(cfg.recipeInputs?.length) &&
    !!(cfg.recipeOutputs?.length)
  );
}

function hasRecipeInputs(cfg: BuildingConfig): boolean {
  return (cfg.recipeInputs || []).every(
    inp => (cfg.inventory[inp.item] || 0) >= (inp.amount || 1)
  );
}

function getRecipeCycleRemaining(
  cfg: BuildingConfig,
  economyPaused: boolean,
  elapsedSinceSyncSec = 0
): number | null {
  if (!isRecipeBuilding(cfg)) return null;
  const cycle = cfg.cycleTimeSec!;
  let accum = cfg.processAccum || 0;
  if (!economyPaused && hasRecipeInputs(cfg) && hasOutputCapacity(cfg)) accum += elapsedSinceSyncSec;
  const mod = accum % cycle;
  const remaining = mod === 0 ? cycle : cycle - mod;
  return Math.max(0, Math.min(cycle, remaining));
}

function formatCycleCountdown(seconds: number): string {
  if (seconds >= 10) return `${Math.ceil(seconds)}s`;
  return `${seconds.toFixed(1)}s`;
}

function CycleCountdownBadge({ remaining, className = '' }: { remaining: number; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-px px-0.5 py-px rounded border text-[8px] font-bold leading-none shadow-sm bg-violet-100/95 border-violet-300 text-violet-950 ${className}`}
    >
      <span className="text-[9px]">🕐</span>
      <span>{formatCycleCountdown(remaining)}</span>
    </span>
  );
}

function CargoTransferPanel({
  containerLabel = 'Trailer',
  containerCargo,
  buildingKey,
  buildingCfg,
  itemDefs,
  onTransferToBuilding,
  onTransferToContainer,
  canLoadIntoContainer = true,
}: {
  containerLabel?: string;
  containerCargo: Cargo;
  buildingKey: string;
  buildingCfg: BuildingConfig;
  itemDefs: ItemDef[];
  onTransferToBuilding: (itemId: string) => void;
  onTransferToContainer: (itemId: string) => void;
  canLoadIntoContainer?: boolean;
}) {
  const containerItems = Object.entries(containerCargo).filter(([, q]) => q > 0);
  const buildingItems = Object.entries(buildingCfg.inventory || {}).filter(([, q]) => q > 0);
  const label = buildingCfg.name || buildingKey;

  return (
    <div className="border rounded-lg p-2 bg-amber-50/60 border-amber-200 text-xs mb-2">
      <div className="font-semibold text-amber-800 mb-1">{label}</div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="font-medium text-[10px] text-slate-600 mb-0.5">{containerLabel}</div>
          {containerItems.length === 0 && <div className="text-[10px] text-slate-400">Empty</div>}
          {containerItems.map(([it, q]) => {
            const space = getInventorySpace(buildingCfg, it);
            return (
              <div key={it} className="flex justify-between text-[10px] py-0.5 gap-1">
                <span className="truncate">{getItemDisplayName(it, itemDefs)}: {q}</span>
                <button
                  disabled={space <= 0}
                  onClick={() => onTransferToBuilding(it)}
                  className="text-emerald-600 hover:underline disabled:opacity-30 shrink-0"
                >Unload</button>
              </div>
            );
          })}
        </div>
        <div>
          <div className="font-medium text-[10px] text-slate-600 mb-0.5">Building</div>
          {buildingItems.length === 0 && <div className="text-[10px] text-slate-400">Empty</div>}
          {buildingItems.map(([it, q]) => (
            <div key={it} className="flex justify-between text-[10px] py-0.5 gap-1">
              <span className="truncate">{getItemDisplayName(it, itemDefs)}: {q}/{getItemCapacity(buildingCfg, it)}</span>
              <button
                disabled={!canLoadIntoContainer}
                onClick={() => onTransferToContainer(it)}
                className="text-blue-600 hover:underline shrink-0 disabled:opacity-30"
              >Load</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function VehicleMotionControls({
  panelType,
  filteredSelection,
  vehicles,
  roomCode,
  pendingRouteVehicleId,
  isPlacingVehicles,
  onSpeedChange,
  onToggleAttribute,
  onDistribute,
  onToggleDestination,
  onPark,
  onUnpark,
  onTogglePlacing,
  showParkControls = true,
  showTurnControls = true,
}: {
  panelType: VehiclePanelType;
  filteredSelection: Set<string>;
  vehicles: Record<string, Vehicle>;
  roomCode: string | null;
  pendingRouteVehicleId: string | null;
  isPlacingVehicles: boolean;
  onSpeedChange: (speed: number) => void;
  onToggleAttribute: (attr: 'isMoving' | 'turnAroundAtDeadEnd' | 'randomTurning') => void;
  onDistribute: () => void;
  onToggleDestination: () => void;
  onPark: () => void;
  onUnpark: () => void;
  onTogglePlacing: () => void;
  showParkControls?: boolean;
  showTurnControls?: boolean;
}) {
  const selectedList = Array.from(filteredSelection);
  const activeCountIsMoving = selectedList.filter(id => vehicles[id]?.isMoving).length;
  const isMovingActive = filteredSelection.size > 0 && activeCountIsMoving >= filteredSelection.size / 2;
  const activeCountTurnAround = selectedList.filter(id => vehicles[id]?.turnAroundAtDeadEnd).length;
  const isTurnAroundActive = filteredSelection.size > 0 && activeCountTurnAround >= filteredSelection.size / 2;
  const activeCountRandomTurn = selectedList.filter(id => vehicles[id]?.randomTurning).length;
  const isRandomTurnActive = filteredSelection.size > 0 && activeCountRandomTurn >= filteredSelection.size / 2;
  const selectedHaveDestination = selectedList.some(id => vehicles[id]?.destination);
  const isDestinationToggleActive = !!pendingRouteVehicleId || selectedHaveDestination;
  const isParkNextActive = selectedList.some(id => vehicles[id]?.parkOnNextLot);
  const firstSpeed = selectedList.length > 0 ? (vehicles[selectedList[0]]?.speed || 1) : 1;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        <span className="text-sm font-medium text-slate-700 w-12">Speed</span>
        <input
          type="range"
          min="0.5"
          max="5"
          step="0.5"
          disabled={filteredSelection.size === 0 || !roomCode}
          value={firstSpeed}
          onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
          className="flex-1"
        />
        <span className="text-xs font-bold text-slate-400 w-8 text-right">
          {filteredSelection.size > 0 ? firstSpeed.toFixed(1) : '-'}x
        </span>
      </div>

      <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm space-y-2">
        <div className={`flex items-center gap-1 ${filteredSelection.size === 0 ? 'opacity-40' : ''}`}>
          <button
            type="button"
            title={isMovingActive ? 'Stop' : 'Go'}
            disabled={filteredSelection.size === 0 || !roomCode}
            onClick={() => onToggleAttribute('isMoving')}
            className={`flex-1 p-2 rounded-lg transition-colors flex items-center justify-center ${
              isMovingActive ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            {isMovingActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          {showTurnControls && (
            <>
              <button
                type="button"
                title="Turn around at end"
                disabled={filteredSelection.size === 0 || !roomCode}
                onClick={() => onToggleAttribute('turnAroundAtDeadEnd')}
                className={`flex-1 p-2 rounded-lg transition-colors flex items-center justify-center ${
                  isTurnAroundActive ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                type="button"
                title="Random turns"
                disabled={filteredSelection.size === 0 || !roomCode}
                onClick={() => onToggleAttribute('randomTurning')}
                className={`flex-1 p-2 rounded-lg transition-colors flex items-center justify-center ${
                  isRandomTurnActive ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                <Shuffle className="w-4 h-4" />
              </button>
            </>
          )}
          <button
            type="button"
            title="Distribute randomly"
            disabled={filteredSelection.size === 0 || !roomCode}
            onClick={onDistribute}
            className="flex-1 p-2 rounded-lg transition-colors flex items-center justify-center bg-slate-100 text-slate-500 hover:bg-slate-200 disabled:opacity-40"
          >
            <Dices className="w-4 h-4" />
          </button>
        </div>

        <div className={`flex items-center gap-1 ${filteredSelection.size === 0 ? 'opacity-40' : ''}`}>
          <button
            type="button"
            title={
              pendingRouteVehicleId
                ? 'Click a road tile to set destination (toggle off to clear)'
                : selectedHaveDestination
                  ? 'Clear destinations for selected vehicles'
                  : 'Set destination for selected vehicles'
            }
            disabled={filteredSelection.size === 0 || !roomCode}
            onClick={onToggleDestination}
            className={`flex-1 p-2 rounded-lg transition-colors flex items-center justify-center ${
              isDestinationToggleActive
                ? pendingRouteVehicleId
                  ? 'bg-red-600 text-white shadow-sm animate-pulse'
                  : 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            <Target className="w-4 h-4" />
          </button>
          {showParkControls && (
            <>
              <button
                type="button"
                title="Park at next parking lot"
                disabled={filteredSelection.size === 0 || !roomCode}
                onClick={onPark}
                className={`flex-1 p-2 rounded-lg transition-colors flex items-center justify-center ${
                  isParkNextActive ? 'bg-amber-500 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                <ParkingCircle className="w-4 h-4" />
              </button>
              <button
                type="button"
                title="Unpark selected vehicles"
                disabled={filteredSelection.size === 0 || !roomCode}
                onClick={onUnpark}
                className="flex-1 p-2 rounded-lg transition-colors flex items-center justify-center bg-slate-100 text-slate-500 hover:bg-slate-200"
              >
                <CircleX className="w-4 h-4" />
              </button>
            </>
          )}
          <button
            type="button"
            title={`Place selected ${panelType === 'train' ? 'trains' : panelType === 'semi' ? 'semis' : 'cars'} on grid`}
            disabled={filteredSelection.size === 0 || !roomCode}
            onClick={onTogglePlacing}
            className={`flex-1 p-2 rounded-lg transition-colors flex items-center justify-center ${
              isPlacingVehicles ? 'bg-orange-500 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            <MapPin className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function TrailerInspectorModal({
  trailerRef,
  vehicles,
  economy,
  grid,
  setEconomy,
  setVehicles,
  roomCode,
  onClose,
  onPickup,
  onDrop,
}: {
  trailerRef: TrailerRef;
  vehicles: Record<string, Vehicle>;
  economy: EconomyState;
  grid: GridData;
  setEconomy: (eco: EconomyState | ((prev: EconomyState) => EconomyState)) => void;
  setVehicles: (vs: Record<string, Vehicle> | ((prev: Record<string, Vehicle>) => Record<string, Vehicle>)) => void;
  roomCode: string | null;
  onClose: () => void;
  onPickup?: (trailerId: string, vehicleId: string) => void;
  onDrop?: (vehicleId: string, trailerIndex: number) => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const [position, setPosition] = useState<Point | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [localCargo, setLocalCargo] = useState<Cargo>(() => getTrailerCargo(trailerRef, vehicles, economy));
  const [addItemId, setAddItemId] = useState('');
  const [addQty, setAddQty] = useState(1);
  const itemDefs = economy.itemDefs || [];

  const trailerPoint = getTrailerWorldPoint(trailerRef, vehicles, economy);
  const nearbyBuildings = trailerPoint
    ? findNearbyEconomyBuildings(trailerPoint.x, trailerPoint.y, grid, economy, 3)
    : [];

  const title = trailerRef.kind === 'parked'
    ? `Parked Trailer`
    : `Semi Trailer #${trailerRef.trailerIndex + 1}`;

  const attachedVehicle = trailerRef.kind === 'vehicle'
    ? getVehicleById(vehicles, trailerRef.vehicleId)
    : undefined;
  const canDrop = attachedVehicle ? canSemiDropTrailer(attachedVehicle, grid) : false;
  const dropHint = attachedVehicle
    ? getDropTrailerHint(attachedVehicle, grid, economy.parkedTrailers)
    : '';

  const pickupSemiOptions = trailerRef.kind === 'parked'
    ? Object.keys(vehicles).filter(id => {
        const v = getVehicleById(vehicles, id);
        const t = economy.parkedTrailers?.[trailerRef.id];
        return v && t && canPickupParkedTrailer(v, t);
      })
    : [];

  const nearbyParkedForSemi = trailerRef.kind === 'vehicle' && attachedVehicle
    ? Object.values(economy.parkedTrailers || {}).filter(t => canPickupParkedTrailer(attachedVehicle, t))
    : [];

  const centerPanel = useCallback(() => {
    const overlay = overlayRef.current;
    const panel = panelRef.current;
    if (!overlay || !panel) return;
    setPosition({
      x: Math.max(0, (overlay.clientWidth - panel.offsetWidth) / 2),
      y: Math.max(0, (overlay.clientHeight - panel.offsetHeight) / 2),
    });
  }, []);

  useLayoutEffect(() => {
    setLocalCargo(getTrailerCargo(trailerRef, vehicles, economy));
    centerPanel();
  }, [trailerRef, vehicles, economy, centerPanel]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      e.preventDefault();
      const overlay = overlayRef.current;
      const panel = panelRef.current;
      if (!overlay || !panel) return;
      const rect = overlay.getBoundingClientRect();
      const maxX = Math.max(0, overlay.clientWidth - panel.offsetWidth);
      const maxY = Math.max(0, overlay.clientHeight - panel.offsetHeight);
      setPosition({
        x: Math.max(0, Math.min(maxX, e.clientX - rect.left - dragOffsetRef.current.x)),
        y: Math.max(0, Math.min(maxY, e.clientY - rect.top - dragOffsetRef.current.y)),
      });
    };
    const onUp = () => setIsDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDragging]);

  const persistCargo = (cargo: Cargo) => {
    const cleaned = { ...cargo };
    Object.keys(cleaned).forEach(k => { if (cleaned[k] <= 0) delete cleaned[k]; });
    setLocalCargo(cleaned);
    const { vehicles: nextVs, economy: nextEco } = setTrailerCargo(trailerRef, cleaned, vehicles, economy);
    setVehicles(nextVs);
    setEconomy(nextEco);
    if (roomCode) {
      socket.emit('update-vehicles', { roomCode, vehicles: nextVs });
      socket.emit('update-economy', { roomCode, economy: nextEco });
    }
  };

  const applyBuildingTransfer = (bkey: string, updater: (cargo: Cargo, cfg: BuildingConfig) => ReturnType<typeof transferTrailerToBuilding>) => {
    const bcfg = normalizeBuildingConfig(economy.buildings[bkey] || { anchorKey: bkey, role: 'warehouse', inventory: {} });
    const cargo = getTrailerCargo(trailerRef, vehicles, economy);
    const result = updater(cargo, bcfg);
    if (!result) return;
    const { vehicles: nextVs, economy: nextEco } = setTrailerCargo(trailerRef, result.trailerCargo, vehicles, economy);
    const newBuildings = { ...nextEco.buildings, [bkey]: result.buildingCfg };
    const finalEco = { ...nextEco, buildings: newBuildings };
    setLocalCargo(result.trailerCargo);
    setVehicles(nextVs);
    setEconomy(finalEco);
    if (roomCode) {
      socket.emit('update-vehicles', { roomCode, vehicles: nextVs });
      socket.emit('update-economy', { roomCode, economy: finalEco });
    }
  };

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 bg-black/30 z-[120]"
      data-grid-control
      {...blockGridPointerEvents}
      onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={panelRef}
        className="absolute bg-white rounded-2xl shadow-2xl w-[min(32rem,calc(100%-2rem))] max-h-[85vh] flex flex-col overflow-hidden"
        style={{ left: position?.x ?? 0, top: position?.y ?? 0 }}
        data-grid-control
        {...stopGridPropagation}
      >
        <div
          className="px-4 py-3 bg-slate-800 text-white font-bold text-sm cursor-move select-none flex justify-between items-center"
          onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            if (!position || !overlayRef.current) return;
            const rect = overlayRef.current.getBoundingClientRect();
            dragOffsetRef.current = { x: e.clientX - rect.left - position.x, y: e.clientY - rect.top - position.y };
            setIsDragging(true);
          }}
        >
          <span>🚛 {title}</span>
          <button onClick={onClose} className="text-white/70 hover:text-white text-lg leading-none">×</button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {trailerRef.kind === 'vehicle' && onDrop && (
            <div className="mb-3 p-3 rounded-lg border border-amber-200 bg-amber-50">
              <div className="font-semibold text-sm text-amber-900 mb-2">Trailer Actions</div>
              <button
                type="button"
                onClick={() => {
                  onDrop(trailerRef.vehicleId, trailerRef.trailerIndex);
                  onClose();
                }}
                disabled={!roomCode || !canDrop}
                title={dropHint}
                className="w-full py-2 text-sm font-semibold rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:bg-amber-200 disabled:text-amber-600"
              >
                Drop Trailer in Parking Stall
              </button>
              <p className={`text-[10px] mt-1.5 leading-snug ${canDrop ? 'text-emerald-700' : 'text-amber-800/80'}`}>
                {dropHint}
              </p>
              {nearbyParkedForSemi.length > 0 && onPickup && (
                <div className="mt-2 pt-2 border-t border-amber-200/80 space-y-1">
                  <div className="text-[10px] font-medium text-amber-900">Pick up parked trailer</div>
                  {nearbyParkedForSemi.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        onPickup(t.id, trailerRef.vehicleId);
                        onClose();
                      }}
                      disabled={!roomCode || getSemiTrailerCount(attachedVehicle!) >= 2}
                      className="w-full py-1.5 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
                    >
                      Pick Up Parked Trailer
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {trailerRef.kind === 'parked' && onPickup && pickupSemiOptions.length > 0 && (
            <div className="mb-3 p-3 rounded-lg border border-emerald-200 bg-emerald-50">
              <div className="font-semibold text-sm text-emerald-900 mb-2">Trailer Actions</div>
              {pickupSemiOptions.map(semiId => (
                <button
                  key={semiId}
                  type="button"
                  onClick={() => {
                    onPickup(trailerRef.id, semiId);
                    onClose();
                  }}
                  disabled={!roomCode}
                  className="w-full mb-1 last:mb-0 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
                >
                  Pick Up Trailer (attach to semi)
                </button>
              ))}
            </div>
          )}

          {trailerRef.kind === 'parked' && onPickup && pickupSemiOptions.length === 0 && (
            <div className="mb-3 p-2 rounded-lg border border-slate-200 bg-slate-50 text-[10px] text-slate-500">
              Park a semi nearby to pick up this trailer.
            </div>
          )}

          <div className="font-semibold text-sm mb-2">Cargo Contents</div>
          {itemDefs.length === 0 && (
            <div className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1 mb-2">
              Create items in Logistics &amp; Economy first.
            </div>
          )}
          <div className="border rounded p-2 text-xs bg-slate-50 mb-3">
            {Object.keys(localCargo).length === 0 && <div className="text-slate-400">Empty trailer</div>}
            {Object.entries(localCargo).map(([itemId, qty]) => (
              <div key={itemId} className="flex items-center gap-2 mb-1">
                <span className="flex-1">{getItemDisplayName(itemId, itemDefs)}</span>
                <input
                  type="number"
                  min={0}
                  value={qty}
                  onChange={e => {
                    const n = Math.max(0, parseInt(e.target.value) || 0);
                    const next = { ...localCargo, [itemId]: n };
                    if (n === 0) delete next[itemId];
                    persistCargo(next);
                  }}
                  className="w-16 text-right border px-1 text-xs rounded"
                />
                <button
                  onClick={() => {
                    const next = { ...localCargo };
                    delete next[itemId];
                    persistCargo(next);
                  }}
                  className="text-red-500 text-[10px]"
                >×</button>
              </div>
            ))}
            <div className="flex gap-1 mt-2 items-center">
              <ItemSelect
                itemDefs={itemDefs}
                value={addItemId}
                onChange={setAddItemId}
                placeholder="Add item…"
                className="flex-1"
              />
              <input
                type="number"
                min={1}
                value={addQty}
                onChange={e => setAddQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-14 text-right border px-1 text-xs rounded"
              />
              <button
                disabled={!addItemId}
                onClick={() => {
                  if (!addItemId) return;
                  persistCargo({ ...localCargo, [addItemId]: (localCargo[addItemId] || 0) + addQty });
                  setAddItemId('');
                  setAddQty(1);
                }}
                className="text-xs px-2 bg-emerald-100 text-emerald-700 rounded disabled:opacity-40"
              >Add</button>
            </div>
          </div>

          {nearbyBuildings.length > 0 && (
            <>
              <div className="font-semibold text-sm mb-2">Transfer to Nearby Buildings</div>
              {nearbyBuildings.map(bkey => {
                const bcfg = normalizeBuildingConfig(economy.buildings[bkey] || { anchorKey: bkey, role: 'warehouse', inventory: {} });
                const cargo = getTrailerCargo(trailerRef, vehicles, economy);
                return (
                  <CargoTransferPanel
                    key={bkey}
                    containerCargo={cargo}
                    buildingKey={bkey}
                    buildingCfg={bcfg}
                    itemDefs={itemDefs}
                    onTransferToBuilding={(itemId) => applyBuildingTransfer(bkey, (c, cfg) => transferTrailerToBuilding(c, cfg, itemId))}
                    onTransferToContainer={(itemId) => applyBuildingTransfer(bkey, (c, cfg) => transferBuildingToTrailer(c, cfg, itemId))}
                  />
                );
              })}
            </>
          )}
          {nearbyBuildings.length === 0 && (
            <div className="text-[10px] text-slate-500">No configured buildings within range for transfers.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function RailcarInspectorModal({
  railcarRef,
  vehicles,
  economy,
  grid,
  setEconomy,
  setVehicles,
  roomCode,
  onClose,
}: {
  railcarRef: RailcarRef;
  vehicles: Record<string, Vehicle>;
  economy: EconomyState;
  grid: GridData;
  setEconomy: (eco: EconomyState | ((prev: EconomyState) => EconomyState)) => void;
  setVehicles: (vs: Record<string, Vehicle> | ((prev: Record<string, Vehicle>) => Record<string, Vehicle>)) => void;
  roomCode: string | null;
  onClose: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const [position, setPosition] = useState<Point | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [localCargo, setLocalCargo] = useState<Cargo>(() => getRailcarCargo(railcarRef, vehicles));
  const [addItemId, setAddItemId] = useState('');
  const [addQty, setAddQty] = useState(1);
  const itemDefs = economy.itemDefs || [];

  const train = getVehicleById(vehicles, railcarRef.vehicleId);
  const railcarType = train?.railcars?.[railcarRef.railcarIndex];
  const holdsCargo = railcarType ? railcarCanHoldCargo(railcarType) : false;
  const title = railcarType
    ? `Railcar #${railcarRef.railcarIndex + 1} (${railcarType.replace(/-/g, ' ')})`
    : `Railcar #${railcarRef.railcarIndex + 1}`;

  const railcarPoint = train ? { x: train.x, y: train.y } : null;
  const nearbyBuildings = railcarPoint
    ? findNearbyEconomyBuildings(railcarPoint.x, railcarPoint.y, grid, economy, 3)
    : [];

  const centerPanel = useCallback(() => {
    const overlay = overlayRef.current;
    const panel = panelRef.current;
    if (!overlay || !panel) return;
    setPosition({
      x: Math.max(0, (overlay.clientWidth - panel.offsetWidth) / 2),
      y: Math.max(0, (overlay.clientHeight - panel.offsetHeight) / 2),
    });
  }, []);

  useLayoutEffect(() => {
    setLocalCargo(getRailcarCargo(railcarRef, vehicles));
    centerPanel();
  }, [railcarRef, vehicles, centerPanel]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      e.preventDefault();
      const overlay = overlayRef.current;
      const panel = panelRef.current;
      if (!overlay || !panel) return;
      const rect = overlay.getBoundingClientRect();
      const maxX = Math.max(0, overlay.clientWidth - panel.offsetWidth);
      const maxY = Math.max(0, overlay.clientHeight - panel.offsetHeight);
      setPosition({
        x: Math.max(0, Math.min(maxX, e.clientX - rect.left - dragOffsetRef.current.x)),
        y: Math.max(0, Math.min(maxY, e.clientY - rect.top - dragOffsetRef.current.y)),
      });
    };
    const onUp = () => setIsDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDragging]);

  const persistCargo = (cargo: Cargo) => {
    if (!holdsCargo) return;
    const cleaned = { ...cargo };
    Object.keys(cleaned).forEach(k => { if (cleaned[k] <= 0) delete cleaned[k]; });
    setLocalCargo(cleaned);
    const nextVs = setRailcarCargo(railcarRef, cleaned, vehicles);
    setVehicles(nextVs);
    if (roomCode) socket.emit('update-vehicles', { roomCode, vehicles: nextVs });
  };

  const applyBuildingTransfer = (bkey: string, updater: (cargo: Cargo, cfg: BuildingConfig) => ReturnType<typeof transferTrailerToBuilding>) => {
    if (!holdsCargo) return;
    const bcfg = normalizeBuildingConfig(economy.buildings[bkey] || { anchorKey: bkey, role: 'warehouse', inventory: {} });
    const cargo = getRailcarCargo(railcarRef, vehicles);
    const result = updater(cargo, bcfg);
    if (!result) return;
    const nextVs = setRailcarCargo(railcarRef, result.trailerCargo, vehicles);
    const newBuildings = { ...economy.buildings, [bkey]: result.buildingCfg };
    const finalEco = { ...economy, buildings: newBuildings };
    setLocalCargo(result.trailerCargo);
    setVehicles(nextVs);
    setEconomy(finalEco);
    if (roomCode) {
      socket.emit('update-vehicles', { roomCode, vehicles: nextVs });
      socket.emit('update-economy', { roomCode, economy: finalEco });
    }
  };

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 bg-black/30 z-[120]"
      data-grid-control
      {...blockGridPointerEvents}
      onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={panelRef}
        className="absolute bg-white rounded-2xl shadow-2xl w-[min(32rem,calc(100%-2rem))] max-h-[85vh] flex flex-col overflow-hidden"
        style={{ left: position?.x ?? 0, top: position?.y ?? 0 }}
        data-grid-control
        {...stopGridPropagation}
      >
        <div
          className="px-4 py-3 bg-slate-800 text-white font-bold text-sm cursor-move select-none flex justify-between items-center"
          onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            if (!position || !overlayRef.current) return;
            const rect = overlayRef.current.getBoundingClientRect();
            dragOffsetRef.current = { x: e.clientX - rect.left - position.x, y: e.clientY - rect.top - position.y };
            setIsDragging(true);
          }}
        >
          <span>🚂 {title}</span>
          <button onClick={onClose} className="text-white/70 hover:text-white text-lg leading-none">×</button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {train && (
            <div className="text-[10px] text-slate-500 mb-3">
              Attached to train <span className="font-mono">{train.id}</span>
            </div>
          )}

          {!holdsCargo && (
            <div className="mb-3 p-3 rounded-lg border border-blue-200 bg-blue-50 text-sm text-blue-900">
              Passenger cars do not carry freight cargo.
            </div>
          )}

          {holdsCargo && (
            <>
              <div className="font-semibold text-sm mb-2">Cargo Contents</div>
              {itemDefs.length === 0 && (
                <div className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1 mb-2">
                  Create items in Logistics &amp; Economy first.
                </div>
              )}
              <div className="border rounded p-2 text-xs bg-slate-50 mb-3">
                {Object.keys(localCargo).length === 0 && <div className="text-slate-400">Empty railcar</div>}
                {Object.entries(localCargo).map(([itemId, qty]) => (
                  <div key={itemId} className="flex items-center gap-2 mb-1">
                    <span className="flex-1">{getItemDisplayName(itemId, itemDefs)}</span>
                    <input
                      type="number"
                      min={0}
                      value={qty}
                      onChange={e => {
                        const n = Math.max(0, parseInt(e.target.value) || 0);
                        const next = { ...localCargo, [itemId]: n };
                        if (n === 0) delete next[itemId];
                        persistCargo(next);
                      }}
                      className="w-16 text-right border px-1 text-xs rounded"
                    />
                    <button
                      onClick={() => {
                        const next = { ...localCargo };
                        delete next[itemId];
                        persistCargo(next);
                      }}
                      className="text-red-500 text-[10px]"
                    >×</button>
                  </div>
                ))}
                <div className="flex gap-1 mt-2 items-center">
                  <ItemSelect
                    itemDefs={itemDefs}
                    value={addItemId}
                    onChange={setAddItemId}
                    placeholder="Add item…"
                    className="flex-1"
                  />
                  <input
                    type="number"
                    min={1}
                    value={addQty}
                    onChange={e => setAddQty(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-14 text-right border px-1 text-xs rounded"
                  />
                  <button
                    disabled={!addItemId}
                    onClick={() => {
                      if (!addItemId) return;
                      persistCargo({ ...localCargo, [addItemId]: (localCargo[addItemId] || 0) + addQty });
                      setAddItemId('');
                      setAddQty(1);
                    }}
                    className="text-xs px-2 bg-emerald-100 text-emerald-700 rounded disabled:opacity-40"
                  >Add</button>
                </div>
              </div>

              {nearbyBuildings.length > 0 && (
                <>
                  <div className="font-semibold text-sm mb-2">Transfer to Nearby Buildings</div>
                  {nearbyBuildings.map(bkey => {
                    const bcfg = normalizeBuildingConfig(economy.buildings[bkey] || { anchorKey: bkey, role: 'warehouse', inventory: {} });
                    const cargo = getRailcarCargo(railcarRef, vehicles);
                    return (
                      <CargoTransferPanel
                        key={bkey}
                        containerLabel="Railcar"
                        containerCargo={cargo}
                        buildingKey={bkey}
                        buildingCfg={bcfg}
                        itemDefs={itemDefs}
                        onTransferToBuilding={(itemId) => applyBuildingTransfer(bkey, (c, cfg) => transferTrailerToBuilding(c, cfg, itemId))}
                        onTransferToContainer={(itemId) => applyBuildingTransfer(bkey, (c, cfg) => transferBuildingToTrailer(c, cfg, itemId))}
                      />
                    );
                  })}
                </>
              )}
              {nearbyBuildings.length === 0 && (
                <div className="text-[10px] text-slate-500">No configured buildings within range for transfers.</div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function createBuildingConfig(anchorKey: string, type: string): BuildingConfig {
  const role = getBuildingRole(type);
  const base: BuildingConfig = {
    anchorKey,
    name: getDefaultBuildingName(type),
    role,
    inventory: {},
    productionEnabled: role === 'factory' || role === 'lumbermill',
    cycleTimeSec: role === 'factory' ? 18 : role === 'lumbermill' ? 12 : undefined,
    recipeInputs: role === 'factory' ? [{ item: 'lumber', amount: 2 }] : role === 'lumbermill' ? [{ item: 'logs', amount: 1 }] : undefined,
    recipeOutputs: role === 'factory' ? [{ item: 'goods', amount: 1 }] : role === 'lumbermill' ? [{ item: 'lumber', amount: 3 }] : undefined,
    consumptionRates: role === 'store' ? { goods: 0.4 } : undefined,
    processAccum: 0,
  };
  return normalizeBuildingConfig(base);
}

function BuildingInspectorModal({
  bkey,
  cfg,
  economy,
  grid,
  vehicles,
  setEconomy,
  setVehicles,
  roomCode,
  onClose,
  onOpenTrailer,
}: {
  bkey: string;
  cfg: BuildingConfig;
  economy: EconomyState;
  grid: GridData;
  vehicles: Record<string, Vehicle>;
  setEconomy: (eco: EconomyState | ((prev: EconomyState) => EconomyState)) => void;
  setVehicles: (vs: Record<string, Vehicle> | ((prev: Record<string, Vehicle>) => Record<string, Vehicle>)) => void;
  roomCode: string | null;
  onClose: () => void;
  onOpenTrailer?: (ref: TrailerRef) => void;
}) {
  const role = cfg.role;
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const [position, setPosition] = useState<Point | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [localName, setLocalName] = useState(cfg.name || '');
  const [localInv, setLocalInv] = useState<Record<string, number>>({ ...(cfg.inventory || {}) });
  const [localCaps, setLocalCaps] = useState<Record<string, number>>({ ...(cfg.inventoryCapacity || {}) });
  const [localRates, setLocalRates] = useState<Record<string, number>>({ ...(cfg.consumptionRates || {}) });
  const [localInputs, setLocalInputs] = useState<Array<{ item: string; amount: number }>>([...(cfg.recipeInputs || [])]);
  const [localOutputs, setLocalOutputs] = useState<Array<{ item: string; amount: number }>>([...(cfg.recipeOutputs || [])]);
  const [localCycle, setLocalCycle] = useState(cfg.cycleTimeSec || 30);
  const [editorTick, setEditorTick] = useState(0);
  const [addInvItem, setAddInvItem] = useState('');
  const [addCapItem, setAddCapItem] = useState('');
  const [addRateItem, setAddRateItem] = useState('');
  const cfgSyncRef = useRef(Date.now());
  const itemDefs = economy.itemDefs || [];
  const nearbyTrailers = findNearbyTrailersForBuilding(bkey, grid, economy, vehicles, 3);

  const getItemLabel = (id: string) => getItemDisplayName(id, itemDefs);

  const pickDefaultItem = (used: string[] = []) =>
    itemDefs.find(d => !used.includes(d.id))?.id || itemDefs[0]?.id || '';

  const stopPanelEvent = stopGridPropagation;

  const centerPanel = useCallback(() => {
    const overlay = overlayRef.current;
    const panel = panelRef.current;
    if (!overlay || !panel) return;
    const x = Math.max(0, (overlay.clientWidth - panel.offsetWidth) / 2);
    const y = Math.max(0, (overlay.clientHeight - panel.offsetHeight) / 2);
    setPosition({ x, y });
  }, []);

  // Only re-init when opening a different building — cfg updates every economy tick and must not reset the panel
  useLayoutEffect(() => {
    setLocalName(cfg.name || '');
    setLocalInv({ ...(cfg.inventory || {}) });
    setLocalCaps({ ...buildDefaultInventoryCapacities(cfg) });
    setLocalRates({ ...(cfg.consumptionRates || {}) });
    setLocalInputs([...(cfg.recipeInputs || [])]);
    setLocalOutputs([...(cfg.recipeOutputs || [])]);
    setLocalCycle(cfg.cycleTimeSec || 30);
    cfgSyncRef.current = Date.now();
    centerPanel();
  }, [bkey, centerPanel]);

  useEffect(() => {
    cfgSyncRef.current = Date.now();
  }, [cfg.processAccum]);

  useEffect(() => {
    if (!isRecipeBuilding(cfg) || economy.economyPaused) return;
    const iv = setInterval(() => setEditorTick(t => t + 1), 100);
    return () => clearInterval(iv);
  }, [bkey, economy.economyPaused]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      e.preventDefault();
      const overlay = overlayRef.current;
      const panel = panelRef.current;
      if (!overlay || !panel) return;
      const rect = overlay.getBoundingClientRect();
      const maxX = Math.max(0, overlay.clientWidth - panel.offsetWidth);
      const maxY = Math.max(0, overlay.clientHeight - panel.offsetHeight);
      const x = Math.max(0, Math.min(maxX, e.clientX - rect.left - dragOffsetRef.current.x));
      const y = Math.max(0, Math.min(maxY, e.clientY - rect.top - dragOffsetRef.current.y));
      setPosition({ x, y });
    };
    const onUp = () => setIsDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDragging]);

  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!position || !overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    dragOffsetRef.current = {
      x: e.clientX - rect.left - position.x,
      y: e.clientY - rect.top - position.y,
    };
    setIsDragging(true);
  };

  const saveConfig = () => {
    const cappedCfg = { ...cfg, inventoryCapacity: { ...localCaps } };
    const clampedInv = { ...localInv };
    Object.keys(clampedInv).forEach(itemId => {
      clampedInv[itemId] = Math.min(clampedInv[itemId], getItemCapacity(cappedCfg, itemId));
    });
    const updated: BuildingConfig = {
      ...cfg,
      name: localName.trim() || cfg.name,
      inventory: clampedInv,
      inventoryCapacity: { ...localCaps },
      consumptionRates: role === 'store' ? { ...localRates } : cfg.consumptionRates,
      recipeInputs: (role === 'factory' || role === 'lumbermill') ? [...localInputs] : cfg.recipeInputs,
      recipeOutputs: (role === 'factory' || role === 'lumbermill') ? [...localOutputs] : cfg.recipeOutputs,
      cycleTimeSec: (role === 'factory' || role === 'lumbermill') ? localCycle : cfg.cycleTimeSec,
    };
    const nextB = { ...economy.buildings, [bkey]: updated };
    const nextEco = { ...economy, buildings: nextB };
    setEconomy(nextEco);
    if (roomCode) socket.emit('update-economy', { roomCode, economy: nextEco });
  };

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 bg-black/30 z-[120]"
      data-grid-control
      {...blockGridPointerEvents}
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="absolute bg-white rounded-2xl shadow-2xl w-[min(32rem,calc(100%-2rem))] max-h-[85vh] flex flex-col overflow-hidden"
        style={{
          left: position?.x ?? 0,
          top: position?.y ?? 0,
        }}
        data-grid-control
        {...blockGridPointerEvents}
      >
        <div
          className={`flex justify-between items-center px-5 py-3 border-b border-slate-100 bg-slate-50 rounded-t-2xl shrink-0 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          onMouseDown={handleHeaderMouseDown}
        >
          <div className="pointer-events-none min-w-0 flex-1">
            <div className="font-bold text-lg truncate">Building Config</div>
            <div className="text-xs text-slate-500">Role: {role} • {bkey}</div>
          </div>
          <button
            type="button"
            onMouseDown={e => e.stopPropagation()}
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-auto overscroll-contain">
        <div className="mb-4">
          <div className="font-semibold text-sm mb-1">Building Name</div>
          <input
            type="text"
            value={localName}
            onChange={e => setLocalName(e.target.value)}
            placeholder="e.g. North Factory"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            maxLength={32}
          />
          <div className="text-[10px] text-slate-400 mt-1">Shown as a badge on the building tile.</div>
        </div>

        <div className="mb-4">
          <div className="font-semibold text-sm mb-1">Inventory</div>
          <div className="border rounded p-2 text-xs bg-slate-50 max-h-32 overflow-auto">
            {Object.keys(localInv).length === 0 && <div className="text-slate-400">Empty</div>}
            {Object.entries(localInv).map(([it, qty]) => {
              const cap = localCaps[it] ?? getDefaultItemCapacity(role, it);
              return (
                <div key={it} className="flex items-center justify-between py-0.5 gap-2">
                  <span className="truncate max-w-[8rem]">{getItemLabel(it)}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setLocalInv(p => ({ ...p, [it]: Math.max(0, (p[it] || 0) - 1) }))} className="px-1.5">-</button>
                    <input
                      type="number"
                      value={qty}
                      onChange={e => setLocalInv(p => ({ ...p, [it]: Math.min(cap, Math.max(0, parseInt(e.target.value) || 0)) }))}
                      className="w-14 text-right border px-1 text-xs"
                    />
                    <span className="text-[10px] text-slate-400">/{cap}</span>
                    <button onClick={() => setLocalInv(p => ({ ...p, [it]: Math.min(cap, (p[it] || 0) + 1) }))} className="px-1.5">+</button>
                    <button onClick={() => { const n = { ...localInv }; delete n[it]; setLocalInv(n); }} className="text-red-500 text-[10px] ml-1">×</button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex gap-1 mt-1 items-center">
            <ItemSelect
              itemDefs={itemDefs}
              value={addInvItem}
              onChange={setAddInvItem}
              excludeIds={Object.keys(localInv)}
              placeholder={itemDefs.length === 0 ? 'Create items in Logistics first' : 'Add item…'}
            />
            <button
              disabled={!addInvItem}
              onClick={() => {
                const cap = localCaps[addInvItem] ?? getDefaultItemCapacity(role, addInvItem);
                setLocalCaps(p => ({ ...p, [addInvItem]: p[addInvItem] ?? cap }));
                setLocalInv(p => ({ ...p, [addInvItem]: Math.min(cap, (p[addInvItem] || 0) + 10) }));
                setAddInvItem('');
              }}
              className="text-xs px-2 bg-slate-200 rounded disabled:opacity-40"
            >+10</button>
          </div>
        </div>

        <div className="mb-4">
          <div className="font-semibold text-sm mb-1">Inventory Capacity (per item)</div>
          <div className="border rounded p-2 text-xs bg-slate-50 max-h-28 overflow-auto">
            {Object.keys(localCaps).length === 0 && <div className="text-slate-400">No capacity limits set</div>}
            {Object.entries(localCaps).map(([it, cap]) => (
              <div key={it} className="flex items-center justify-between py-0.5 gap-2">
                <span className="truncate max-w-[8rem]">{getItemLabel(it)}</span>
                <input
                  type="number"
                  min={1}
                  value={cap}
                  onChange={e => {
                    const nextCap = Math.max(1, parseInt(e.target.value) || 1);
                    setLocalCaps(p => ({ ...p, [it]: nextCap }));
                    setLocalInv(p => ({ ...p, [it]: Math.min(nextCap, p[it] || 0) }));
                  }}
                  className="w-16 text-right border px-1 text-xs"
                />
                <button
                  onClick={() => {
                    const n = { ...localCaps };
                    delete n[it];
                    setLocalCaps(n);
                  }}
                  className="text-red-500 text-[10px]"
                >×</button>
              </div>
            ))}
          </div>
          <div className="flex gap-1 mt-1 items-center">
            <ItemSelect
              itemDefs={itemDefs}
              value={addCapItem}
              onChange={setAddCapItem}
              excludeIds={Object.keys(localCaps)}
              placeholder={itemDefs.length === 0 ? 'Create items in Logistics first' : 'Set capacity for…'}
            />
            <button
              disabled={!addCapItem}
              onClick={() => {
                setLocalCaps(p => ({ ...p, [addCapItem]: p[addCapItem] ?? getDefaultItemCapacity(role, addCapItem) }));
                setAddCapItem('');
              }}
              className="text-xs px-2 bg-slate-200 rounded disabled:opacity-40"
            >Add</button>
          </div>
        </div>

        {role === 'store' && (
          <div className="mb-4">
            <div className="font-semibold text-sm mb-1">Consumption Rates (per second)</div>
            <div className="border rounded p-2 text-xs bg-slate-50">
              {(Object.keys(localRates).length === 0) && <div className="text-slate-400 text-[10px]">No rates set</div>}
              {Object.entries(localRates).map(([it, rate]) => (
                <div key={it} className="flex items-center justify-between py-0.5">
                  <span>{getItemLabel(it)}</span>
                  <div className="flex items-center gap-1">
                    <input type="number" step="0.1" value={rate} onChange={e => setLocalRates(p => ({ ...p, [it]: Math.max(0, parseFloat(e.target.value) || 0) }))} className="w-16 text-right border px-1 text-xs" />
                    <span className="text-[10px] text-slate-500">/s</span>
                    <button onClick={() => { const n = { ...localRates }; delete n[it]; setLocalRates(n); }} className="text-red-500 text-[10px]">×</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-1 mt-1 items-center">
              <ItemSelect
                itemDefs={itemDefs}
                value={addRateItem}
                onChange={setAddRateItem}
                excludeIds={Object.keys(localRates)}
                placeholder={itemDefs.length === 0 ? 'Create items in Logistics first' : 'Add rate for…'}
              />
              <button
                disabled={!addRateItem}
                onClick={() => {
                  setLocalRates(p => ({ ...p, [addRateItem]: (p[addRateItem] || 0) + 0.5 }));
                  setAddRateItem('');
                }}
                className="text-xs px-2 bg-slate-200 rounded disabled:opacity-40"
              >+0.5/s</button>
            </div>
          </div>
        )}

        {(role === 'factory' || role === 'lumbermill') && (
          <div className="mb-4 space-y-3">
            {itemDefs.length === 0 && (
              <div className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                Create items in Logistics &amp; Economy before configuring recipes.
              </div>
            )}
            <div>
              <div className="font-semibold text-sm mb-1">Recipe Inputs (consumed per cycle)</div>
              <div className="border rounded p-2 text-xs bg-slate-50">
                {localInputs.length === 0 && <div className="text-slate-400">No inputs</div>}
                {localInputs.map((inp, idx) => (
                  <div key={idx} className="flex gap-1 items-center mb-1">
                    <ItemSelect
                      itemDefs={itemDefs}
                      value={inp.item}
                      onChange={id => { const n = [...localInputs]; n[idx].item = id; setLocalInputs(n); }}
                      className="flex-1 min-w-0"
                    />
                    <input type="number" value={inp.amount} onChange={e => { const n = [...localInputs]; n[idx].amount = Math.max(1, parseInt(e.target.value) || 1); setLocalInputs(n); }} className="w-12 text-right border px-1 text-xs" />
                    <button onClick={() => setLocalInputs(localInputs.filter((_, i) => i !== idx))} className="text-red-500">×</button>
                  </div>
                ))}
                <button
                  disabled={itemDefs.length === 0}
                  onClick={() => setLocalInputs([...localInputs, { item: pickDefaultItem(localInputs.map(i => i.item)), amount: 1 }])}
                  className="text-[10px] text-emerald-600 disabled:opacity-40"
                >+ Add Input</button>
              </div>
            </div>

            <div>
              <div className="font-semibold text-sm mb-1">Recipe Outputs (produced per cycle)</div>
              <div className="border rounded p-2 text-xs bg-slate-50">
                {localOutputs.length === 0 && <div className="text-slate-400">No outputs</div>}
                {localOutputs.map((out, idx) => (
                  <div key={idx} className="flex gap-1 items-center mb-1">
                    <ItemSelect
                      itemDefs={itemDefs}
                      value={out.item}
                      onChange={id => { const n = [...localOutputs]; n[idx].item = id; setLocalOutputs(n); }}
                      className="flex-1 min-w-0"
                    />
                    <input type="number" value={out.amount} onChange={e => { const n = [...localOutputs]; n[idx].amount = Math.max(1, parseInt(e.target.value) || 1); setLocalOutputs(n); }} className="w-12 text-right border px-1 text-xs" />
                    <button onClick={() => setLocalOutputs(localOutputs.filter((_, i) => i !== idx))} className="text-red-500">×</button>
                  </div>
                ))}
                <button
                  disabled={itemDefs.length === 0}
                  onClick={() => setLocalOutputs([...localOutputs, { item: pickDefaultItem(localOutputs.map(o => o.item)), amount: 1 }])}
                  className="text-[10px] text-emerald-600 disabled:opacity-40"
                >+ Add Output</button>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span>Cycle time (seconds):</span>
              <input type="number" value={localCycle} onChange={e => setLocalCycle(Math.max(1, parseInt(e.target.value) || 30))} className="w-20 border px-1" />
            </div>

            {isRecipeBuilding(cfg) && (() => {
              void editorTick;
              const elapsed = economy.economyPaused ? 0 : (Date.now() - cfgSyncRef.current) / 1000;
              const remaining = getRecipeCycleRemaining(cfg, economy.economyPaused, elapsed);
              return remaining !== null ? (
                <div className="flex items-center justify-between p-2 rounded-lg bg-violet-50 border border-violet-200">
                  <span className="text-xs font-medium text-violet-800">Next batch</span>
                  <CycleCountdownBadge remaining={remaining} className="text-[10px] px-1.5 py-0.5" />
                </div>
              ) : null;
            })()}
          </div>
        )}

        {nearbyTrailers.length > 0 && (
          <div className="mb-4">
            <div className="font-semibold text-sm mb-2">Nearby Trailer Transfers</div>
            {nearbyTrailers.map((tRef, idx) => {
              const cargo = getTrailerCargo(tRef, vehicles, economy);
              const label = tRef.kind === 'parked'
                ? `Parked Trailer`
                : `Semi Trailer #${tRef.trailerIndex + 1}`;
              const bcfg = normalizeBuildingConfig(economy.buildings[bkey] || cfg);
              return (
                <div key={`${tRef.kind}-${tRef.kind === 'parked' ? tRef.id : `${tRef.vehicleId}-${tRef.trailerIndex}`}-${idx}`}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] font-medium text-slate-600">{label}</span>
                    {onOpenTrailer && (
                      <button onClick={() => onOpenTrailer(tRef)} className="text-[10px] text-blue-600 hover:underline">
                        Inspect
                      </button>
                    )}
                  </div>
                  <CargoTransferPanel
                    containerCargo={cargo}
                    buildingKey={bkey}
                    buildingCfg={bcfg}
                    itemDefs={itemDefs}
                    onTransferToBuilding={(itemId) => {
                      const result = transferTrailerToBuilding(cargo, bcfg, itemId);
                      if (!result) return;
                      const { vehicles: nextVs, economy: nextEco } = setTrailerCargo(tRef, result.trailerCargo, vehicles, economy);
                      const finalEco = { ...nextEco, buildings: { ...nextEco.buildings, [bkey]: result.buildingCfg } };
                      setVehicles(nextVs);
                      setEconomy(finalEco);
                      if (roomCode) {
                        socket.emit('update-vehicles', { roomCode, vehicles: nextVs });
                        socket.emit('update-economy', { roomCode, economy: finalEco });
                      }
                    }}
                    onTransferToContainer={(itemId) => {
                      const result = transferBuildingToTrailer(cargo, bcfg, itemId);
                      if (!result) return;
                      const { vehicles: nextVs, economy: nextEco } = setTrailerCargo(tRef, result.trailerCargo, vehicles, economy);
                      const finalEco = { ...nextEco, buildings: { ...nextEco.buildings, [bkey]: result.buildingCfg } };
                      setVehicles(nextVs);
                      setEconomy(finalEco);
                      if (roomCode) {
                        socket.emit('update-vehicles', { roomCode, vehicles: nextVs });
                        socket.emit('update-economy', { roomCode, economy: finalEco });
                      }
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}

        <div className="flex gap-2 mt-4">
          <button onClick={saveConfig} className="flex-1 bg-emerald-600 text-white rounded py-1 text-sm">Save Changes</button>
          <button onClick={() => {
            const nextB = { ...economy.buildings };
            delete nextB[bkey];
            const next = { ...economy, buildings: nextB };
            setEconomy(next);
            if (roomCode) socket.emit('update-economy', { roomCode, economy: next });
            onClose();
          }} className="text-red-600 text-xs px-3">Remove Config</button>
          <button onClick={onClose} className="px-4 py-1 bg-slate-800 text-white rounded text-xs">Close</button>
        </div>
        <div className="text-[10px] text-emerald-600 mt-2">Tip: Click trailers on the map to edit cargo. Transfer with nearby buildings here or in the Semis &amp; Trailers panel.</div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [grid, _setGrid] = useState<GridData>({});
  const localGridRef = useRef<GridData>({});
  const lastSyncedGrid = useRef<GridData>({});
  // Always up-to-date grid for hot paths (simulation, routing) to avoid stale closures
  const gridRef = useRef<GridData>({});

  // Safe accessors that prefer the always-fresh ref (avoids stale closures in effects/callbacks)
  const getTile = (x: number, y: number): GridTile[] | undefined => gridRef.current[`${x},${y}`];
  const hasTile = (x: number, y: number): boolean => !!gridRef.current[`${x},${y}`];
  const setGrid = useCallback((newGrid: GridData | ((prev: GridData) => GridData)) => {
    if (typeof newGrid === 'function') {
      _setGrid((prev) => {
        const next = clipGridDataToCanvas(newGrid(prev));
        localGridRef.current = next;
        gridRef.current = next;
        return next;
      });
    } else {
      const next = clipGridDataToCanvas(newGrid);
      localGridRef.current = next;
      gridRef.current = next;
      _setGrid(next);
    }
  }, []);

  const normalizeEconomy = (eco: Partial<EconomyState> | undefined): EconomyState => ({
    itemDefs: Array.isArray(eco?.itemDefs) ? eco!.itemDefs : [],
    buildings:
      eco?.buildings && typeof eco.buildings === 'object'
        ? Object.fromEntries(
            Object.entries(eco.buildings).map(([k, b]) => [k, normalizeBuildingConfig(b as BuildingConfig)])
          )
        : {},
    parkedTrailers:
      eco?.parkedTrailers && typeof eco.parkedTrailers === 'object' ? { ...eco.parkedTrailers } : {},
    showInventoryLabels: eco?.showInventoryLabels ?? true,
    showCargoLabels: eco?.showCargoLabels ?? true,
    economyPaused: eco?.economyPaused ?? false,
    plantGrowth: {
      growthDurationSec: eco?.plantGrowth?.growthDurationSec ?? DEFAULT_PLANT_GROWTH.growthDurationSec,
      germinationSec:
        eco?.plantGrowth?.germinationSec ??
        (eco?.plantGrowth as { coneStageSec?: number } | undefined)?.coneStageSec ??
        DEFAULT_PLANT_GROWTH.germinationSec,
      paused: eco?.plantGrowth?.paused ?? DEFAULT_PLANT_GROWTH.paused,
    },
  });

  const setEconomy = useCallback((newEco: EconomyState | ((prev: EconomyState) => EconomyState)) => {
    if (typeof newEco === 'function') {
      _setEconomy((prev) => {
        const next = normalizeEconomy(newEco(prev));
        localEconomyRef.current = next;
        economyTimerSyncRef.current = Date.now();
        return next;
      });
    } else {
      const next = normalizeEconomy(newEco);
      localEconomyRef.current = next;
      economyTimerSyncRef.current = Date.now();
      _setEconomy(next);
    }
  }, []);
  const [history, setHistory] = useState<GridData[]>([{}]);
  const [historyIndex, setHistoryIndex] = useState(0);
  
  const [selectedTile, setSelectedTile] = useState<TileType | null>(null);
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(INITIAL_ZOOM);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<Point>({ x: 0, y: 0 });
  
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<Point | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<Point | null>(null);
  const [clipboard, setClipboard] = useState<GridData | null>(null);
  const [isPasting, setIsPasting] = useState(false);

  const [activeCategory, setActiveCategory] = useState<'road' | 'rail' | 'building' | 'landscape'>('road');
  const [showInfo, setShowInfo] = useState(false);
  const [showGridLines, setShowGridLines] = useState(true);
  const [showSidebar, setShowSidebar] = useState(true);
  const [library, setLibrary] = useState<{ id: string; name: string; data: GridData }[]>([]);
  const [newLayoutName, setNewLayoutName] = useState('');
  const [lastSavedGrid, setLastSavedGrid] = useState<GridData>({});
  const [mousePos, setMousePos] = useState<Point>({ x: 0, y: 0 });
  const [densityModal, setDensityModal] = useState<{ type: 'road' | 'rail' | 'map' | null }>({ type: null });
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [showLoadConfirm, setShowLoadConfirm] = useState(false);
  const [showDeleteLayoutConfirm, setShowDeleteLayoutConfirm] = useState<{ id: string; name: string } | null>(null);
  const [pendingLayout, setPendingLayout] = useState<GridData | null>(null);
  const [pastePreviewPos, setPastePreviewPos] = useState<Point | null>(null);
  const [vehicles, _setVehicles] = useState<Record<string, Vehicle>>({});
  const setVehicles = useCallback((next: Record<string, Vehicle> | ((prev: Record<string, Vehicle>) => Record<string, Vehicle>)) => {
    if (typeof next === 'function') {
      _setVehicles(prev => normalizeVehicles(next(prev)));
    } else {
      _setVehicles(normalizeVehicles(next));
    }
  }, []);
  const [selectedVehicles, setSelectedVehicles] = useState<Set<string>>(new Set());
  const [isPlacingVehicles, setIsPlacingVehicles] = useState(false);
  const [showCarsPanel, setShowCarsPanel] = useState(false);
  const [showSemiTrailerPanel, setShowSemiTrailerPanel] = useState(false);
  const [showTrainPanel, setShowTrainPanel] = useState(false);
  const addCarsCountRef = useRef<HTMLInputElement>(null);
  const [userColor, setUserColor] = useState<string>('#ef4444');

  const [simulations, setSimulations] = useState<any[]>([]);
  const [libraryTab, setLibraryTab] = useState<'layouts' | 'simulations'>('layouts');
  const [showSaveSimulationConfirm, setShowSaveSimulationConfirm] = useState(false);
  const [newSimulationName, setNewSimulationName] = useState('');
  const [showDeleteSimulationConfirm, setShowDeleteSimulationConfirm] = useState<{ id: string; name: string } | null>(null);

  // Economy / Logistics system (new)
  const [economy, _setEconomy] = useState<EconomyState>({
    itemDefs: [],
    buildings: {},
    parkedTrailers: {},
    showInventoryLabels: true,
    showCargoLabels: true,
    economyPaused: false,
  });
  const localEconomyRef = useRef<EconomyState>({ itemDefs: [], buildings: {}, parkedTrailers: {}, showInventoryLabels: true, showCargoLabels: true, economyPaused: false });
  const economyTimerSyncRef = useRef(Date.now());
  const [cycleUiTick, setCycleUiTick] = useState(0);
  const lastSyncedEconomy = useRef<EconomyState>({ itemDefs: [], buildings: {}, parkedTrailers: {}, showInventoryLabels: true, showCargoLabels: true, economyPaused: false });
  const [showLogistics, setShowLogistics] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemEmoji, setNewItemEmoji] = useState('📦');
  const [editingItemEmoji, setEditingItemEmoji] = useState<string | null>(null);
  const [showPlantGrowth, setShowPlantGrowth] = useState(false);

  const getCycleRemainingForBuilding = useCallback((cfg: BuildingConfig) => {
    void cycleUiTick;
    const elapsed = economy.economyPaused ? 0 : (Date.now() - economyTimerSyncRef.current) / 1000;
    return getRecipeCycleRemaining(cfg, economy.economyPaused, elapsed);
  }, [cycleUiTick, economy.economyPaused]);

  useEffect(() => {
    const hasActiveRecipe = Object.values(economy.buildings).some(b => isRecipeBuilding(b));
    if (!hasActiveRecipe || economy.economyPaused) return;
    const iv = setInterval(() => setCycleUiTick(t => t + 1), 100);
    return () => clearInterval(iv);
  }, [economy.buildings, economy.economyPaused]);
  const [inspectBuildingKey, setInspectBuildingKey] = useState<string | null>(null);
  const [inspectTrailerRef, setInspectTrailerRef] = useState<TrailerRef | null>(null);
  const [inspectRailcarRef, setInspectRailcarRef] = useState<RailcarRef | null>(null);
  const [pendingRouteVehicleId, setPendingRouteVehicleId] = useState<string | null>(null);
  const roomCodeRef = useRef<string | null>(null);

  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [tempRoomCode, setTempRoomCode] = useState('');
  const lastForceReloadRef = useRef<number>(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const clampOffset = useCallback((next: Point, z = zoom) => {
    const cw = containerRef.current?.clientWidth ?? 0;
    const ch = containerRef.current?.clientHeight ?? 0;
    return clampViewportOffset(next, z, cw, ch);
  }, [zoom]);

  const minimapRef = useRef<HTMLCanvasElement>(null);
  const minimapSize = 180;
  const [minimapDragging, setMinimapDragging] = useState(false);
  const [showOverview, setShowOverview] = useState(false);
  const overviewHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getMinimapLayout = useCallback(() => {
    const bounds = GRID_CANVAS_BOUNDS;
    const gridW = GRID_CANVAS_CELLS;
    const gridH = GRID_CANVAS_CELLS;
    const scale = minimapSize / GRID_CANVAS_CELLS;
    const drawW = gridW * scale;
    const drawH = gridH * scale;
    const offsetX = (minimapSize - drawW) / 2;
    const offsetY = (minimapSize - drawH) / 2;
    return { bounds, gridW, gridH, scale, offsetX, offsetY, drawW, drawH };
  }, []);

  const pulseOverview = useCallback(() => {
    setShowOverview(true);
    if (overviewHideTimerRef.current) {
      clearTimeout(overviewHideTimerRef.current);
    }
    overviewHideTimerRef.current = setTimeout(() => {
      setShowOverview(false);
      overviewHideTimerRef.current = null;
    }, 500);
  }, []);

  const redrawMinimap = useCallback(() => {
    const canvas = minimapRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const size = minimapSize;
    const gridData = gridRef.current;
    const { bounds, scale, offsetX, offsetY, drawW, drawH } = getMinimapLayout();
    const cellSize = Math.max(1, scale);

    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(offsetX, offsetY, drawW, drawH);

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.strokeRect(offsetX, offsetY, drawW, drawH);

    Object.entries(gridData).forEach(([key, tiles]) => {
      const [gx, gy] = key.split(',').map(Number);
      if (gx < bounds.minX || gx > bounds.maxX || gy < bounds.minY || gy > bounds.maxY) return;

      const x = offsetX + (gx - bounds.minX) * scale;
      const y = offsetY + (gy - bounds.minY) * scale;

      let color = '#e2e8f0';

      const topTile = tiles[tiles.length - 1];
      const t = topTile?.type || '';

      if (t.startsWith('road')) color = '#94a3b8';
      else if (t.startsWith('rail')) color = '#64748b';
      else if (t.startsWith('building')) color = '#f87171';
      else if (t.startsWith('parking')) color = '#e2e8f0';
      else if (t.startsWith('grass') || t.startsWith('tree') || t.startsWith('landscape')) color = '#86efac';

      ctx.fillStyle = color;
      ctx.fillRect(x, y, cellSize, cellSize);
    });

    if (containerRef.current) {
      const cw = containerRef.current.clientWidth;
      const ch = containerRef.current.clientHeight;

      const viewWorldW = cw / zoom;
      const viewWorldH = ch / zoom;
      const viewX = -offset.x / zoom;
      const viewY = -offset.y / zoom;

      const mapX = offsetX + (viewX / GRID_SIZE - bounds.minX) * scale;
      const mapY = offsetY + (viewY / GRID_SIZE - bounds.minY) * scale;
      const mapW = (viewWorldW / GRID_SIZE) * scale;
      const mapH = (viewWorldH / GRID_SIZE) * scale;

      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 2;
      ctx.strokeRect(mapX, mapY, mapW, mapH);
    }
  }, [grid, offset, zoom, getMinimapLayout]);

  const handleMinimapInteraction = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    pulseOverview();
    const canvas = minimapRef.current;
    if (!canvas || !containerRef.current) return;

    const rect = canvas.getBoundingClientRect();
    let clientX = e.clientX;
    let clientY = e.clientY;

    // Support dragging even if mouse moves outside canvas
    if (minimapDragging && (e.type === 'mousemove' || e.type === 'mouseup')) {
      // clamp to canvas rect for better UX
      clientX = Math.max(rect.left, Math.min(rect.right, clientX));
      clientY = Math.max(rect.top, Math.min(rect.bottom, clientY));
    }

    const { bounds, scale, offsetX, offsetY } = getMinimapLayout();
    const canvasX = clientX - rect.left;
    const canvasY = clientY - rect.top;

    const clickCellX = bounds.minX + (canvasX - offsetX) / scale;
    const clickCellY = bounds.minY + (canvasY - offsetY) / scale;

    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;

    const targetWorldX = clickCellX * GRID_SIZE;
    const targetWorldY = clickCellY * GRID_SIZE;

    const newOffsetX = -(targetWorldX * zoom - cw / 2);
    const newOffsetY = -(targetWorldY * zoom - ch / 2);

    setOffset(clampOffset({ x: newOffsetX, y: newOffsetY }));

    if (e.type === 'mousedown') {
      setMinimapDragging(true);
    }
  }, [zoom, minimapDragging, getMinimapLayout, pulseOverview, clampOffset]);

  useEffect(() => {
    return () => {
      if (overviewHideTimerRef.current) {
        clearTimeout(overviewHideTimerRef.current);
      }
    };
  }, []);

  // Redraw minimap when visible and viewport changes
  useEffect(() => {
    if (showOverview) {
      requestAnimationFrame(() => redrawMinimap());
    }
  }, [redrawMinimap, showOverview]);

  // Redraw when container resizes (affects viewport rectangle)
  useEffect(() => {
    const handleResize = () => redrawMinimap();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [redrawMinimap]);

  // Handle minimap drag release
  useEffect(() => {
    const handleUp = () => setMinimapDragging(false);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('mouseleave', handleUp);
    return () => {
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('mouseleave', handleUp);
    };
  }, []);

  const [user, setUser] = useState<{ uid: string } | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [availableRooms, setAvailableRooms] = useState<{ id: string, updatedAt: number }[]>([]);
  
  // Sync library from backend
  useEffect(() => {
    if (!roomCode) {
      socket.emit('join-room', 'lobby');
      
      const handleAvailableRooms = (rooms: any[]) => {
        setAvailableRooms(rooms);
      };
      
      socket.on('available-rooms', handleAvailableRooms);
      return () => {
        socket.off('available-rooms', handleAvailableRooms);
      };
    }
  }, [roomCode]);

  useEffect(() => {
    const handleLayouts = (newLibrary: any[]) => {
      setLibrary(newLibrary);
    };
    const handleSims = (newSimulations: any[]) => {
      setSimulations(newSimulations);
    };

    socket.on('layouts-updated', handleLayouts);
    socket.on('simulations-updated', handleSims);

    return () => {
      socket.off('layouts-updated', handleLayouts);
      socket.off('simulations-updated', handleSims);
    };
  }, []);

  // Simple Auth replacement
  useEffect(() => {
    let uid = localStorage.getItem('gridcity_uid');
    if (!uid) {
      uid = Math.random().toString(36).substring(2, 11);
      localStorage.setItem('gridcity_uid', uid);
    }
    setUser({ uid });
    
    // Assign a random color
    const colors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    setUserColor(randomColor);
  }, []);

  useEffect(() => {
    roomCodeRef.current = roomCode;
  }, [roomCode]);

  // Sync grid from Socket.io
  useEffect(() => {
    if (!roomCode) return;
    
    socket.emit('join-room', roomCode);

    const handleWorldState = (data: any) => {
      if (data.grid) {
        const clippedGrid = clipGridDataToCanvas(data.grid);
        lastSyncedGrid.current = clippedGrid;
        gridRef.current = clippedGrid;
        setGrid(clippedGrid);
      }
      if (data.vehicles) {
        setVehicles(data.vehicles);
      }
      if (data.economy) {
        const loaded = data.economy || {};
        const safeEconomy = normalizeEconomy(loaded);
        lastSyncedEconomy.current = safeEconomy;
        setEconomy(safeEconomy);
        localEconomyRef.current = safeEconomy;
      }
    };

    const handleGridUpdated = (updates: Record<string, any>) => {
      const currentGrid = localGridRef.current;
      const newGrid = { ...currentGrid };
      
      Object.entries(updates).forEach(([key, val]) => {
        const [x, y] = key.split(',').map(Number);
        if (!isWithinGridCanvas(x, y)) {
          delete newGrid[key];
          return;
        }
        if (val === null || val === undefined) {
          delete newGrid[key];
        } else {
          newGrid[key] = val;
        }
      });

      if (JSON.stringify(newGrid) !== JSON.stringify(currentGrid)) {
        setGrid(newGrid);
        lastSyncedGrid.current = newGrid;
      }
    };

    const handleVehiclesUpdated = (newVehicles: any) => {
      setVehicles(newVehicles);
    };

    const handleEconomyUpdated = (newEconomy: any) => {
      setEconomy(newEconomy);
      lastSyncedEconomy.current = newEconomy;
      localEconomyRef.current = newEconomy;
    };

    socket.on('world-state', handleWorldState);
    socket.on('grid-updated', handleGridUpdated);
    socket.on('vehicles-updated', handleVehiclesUpdated);
    socket.on('economy-updated', handleEconomyUpdated);

    return () => {
      socket.off('world-state', handleWorldState);
      socket.off('grid-updated', handleGridUpdated);
      socket.off('vehicles-updated', handleVehiclesUpdated);
      socket.off('economy-updated', handleEconomyUpdated);
    };
  }, [roomCode]);

  // Push local changes to backend
  useEffect(() => {
    if (!roomCode) return;

    const flushGridUpdates = () => {
      const updates: Record<string, any> = {};
      let hasChanges = false;
      const currentGrid = localGridRef.current;
      const allKeys = new Set([...Object.keys(lastSyncedGrid.current), ...Object.keys(currentGrid)]);
      
      for (const key of allKeys) {
        const currentVal = currentGrid[key];
        const lastVal = lastSyncedGrid.current[key];
        if (JSON.stringify(currentVal) !== JSON.stringify(lastVal)) {
          updates[key] = currentVal !== undefined ? currentVal : null;
          hasChanges = true;
        }
      }
      
      if (!hasChanges) return;

      lastSyncedGrid.current = currentGrid;
      socket.emit('update-grid', { roomCode, updates });
    };

    const intervalId = setInterval(flushGridUpdates, 1000);
    return () => clearInterval(intervalId);
  }, [roomCode]);

  const createRoom = async () => {
    const w1 = WORDS[Math.floor(Math.random() * WORDS.length)];
    const w2 = WORDS[Math.floor(Math.random() * WORDS.length)];
    const w3 = WORDS[Math.floor(Math.random() * WORDS.length)];
    const candidateCode = `${w1}-${w2}-${w3}`;
    setRoomCode(candidateCode);
  };

  const joinRoom = () => {
    if (tempRoomCode.trim()) {
      setRoomCode(tempRoomCode.trim().toUpperCase());
    }
  };

  const saveToLibrary = async (forceWholeGrid = false) => {
    if (!newLayoutName.trim()) return;

    let dataToSave: GridData = {};

    if (selectionStart && selectionEnd && !forceWholeGrid) {
      const x1 = Math.min(selectionStart.x, selectionEnd.x);
      const y1 = Math.min(selectionStart.y, selectionEnd.y);
      const x2 = Math.max(selectionStart.x, selectionEnd.x);
      const y2 = Math.max(selectionStart.y, selectionEnd.y);

      for (let x = x1; x <= x2; x++) {
        for (let y = y1; y <= y2; y++) {
          const key = `${x},${y}`;
          const tiles = getTile(x, y);
          if (tiles) {
            dataToSave[`${x - x1},${y - y1}`] = [...tiles];
          }
        }
      }
    } else if (!forceWholeGrid && Object.keys(grid).length > 0) {
      setShowSaveConfirm(true);
      return;
    } else {
      dataToSave = grid;
    }

    try {
      socket.emit('save-layout', {
        name: newLayoutName.trim(),
        data: dataToSave
      });
      setNewLayoutName('');
      setLastSavedGrid(grid);
      setSelectionStart(null);
      setSelectionEnd(null);
    } catch (err) {
      console.error("Error saving layout:", err);
    }
  };

  const deleteFromLibrary = async (id: string, name: string) => {
    setShowDeleteLayoutConfirm({ id, name });
  };

  const saveToSimulations = async () => {
    if (!newSimulationName.trim()) return;

    try {
      socket.emit('save-simulation', {
        name: newSimulationName.trim(),
        data: { grid, vehicles }
      });
      setNewSimulationName('');
      setShowSaveSimulationConfirm(false);
    } catch (err) {
      console.error("Error saving simulation:", err);
    }
  };

  const loadSimulation = (sim: any) => {
    setGrid(sim.data.grid || {});
    setVehicles(sim.data.vehicles || {});
    setSelectedVehicles(new Set());
    if (roomCode) {
      socket.emit('update-grid', { roomCode, updates: sim.data.grid || {} });
      socket.emit('update-vehicles', { roomCode, vehicles: sim.data.vehicles || {} });
    }
  };

  const confirmDeleteSimulation = async () => {
    if (!showDeleteSimulationConfirm) return;
    socket.emit('delete-simulation', showDeleteSimulationConfirm.id);
    setShowDeleteSimulationConfirm(null);
  };

  const distributeSelectedCars = (targetIds: Iterable<string> = selectedVehicles) => {
    let updatedVehicles = { ...vehicles };
    let anyUpdates = false;

    for (const id of targetIds) {
      const v = updatedVehicles[id];
      if (v) {
        const vType = v.type || 'car';
        const roadTiles = Object.entries(grid).filter(([key, tiles]) => 
          (tiles as GridTile[]).some(t => {
            if (t.type === 'rail-road-crossing') return true;
            if (vType === 'train') return t.type.startsWith('rail') || t.type.includes('trestle');
            if (vType === 'semi') return t.type.startsWith('road') || t.type === 'parking-2x4' || t.type === 'parking-4x4';
            return t.type.startsWith('road') || t.type.startsWith('parking-');
          })
        );
        if (roadTiles.length === 0) return;

        const randomRoad = roadTiles[Math.floor(Math.random() * roadTiles.length)];
        const [rx, ry] = randomRoad[0].split(',').map(Number);
        const tileList = randomRoad[1] as GridTile[];
        
        let targetTileIndex = tileList.length - 1;
        // Optionally find the specific road/rail 
        let targetTile = tileList[targetTileIndex];
        let zIndex = 0;
        if (targetTile.type.includes('bridge') || targetTile.type.includes('trestle')) zIndex = 1;

        let heading = targetTile.rotation;
        if (targetTile.type === 'rail-road-crossing' && vType !== 'train') {
           heading = (heading + 90) % 360;
        }

        const is4Lane = targetTile.type.includes('4lane');
        updatedVehicles[id] = {
           ...v,
           x: rx,
           y: ry,
           heading: heading,
           progress: Math.random(),
           lane: vType === 'train' ? 0 : (is4Lane ? (Math.random() > 0.5 ? 1 : 2.5) * (Math.random() > 0.5 ? 1 : -1) : (Math.random() > 0.5 ? 1 : -1)),
           zIndex
        };
        anyUpdates = true;
      }
    }

    if (anyUpdates) {
      setVehicles(updatedVehicles);
    }
  };

  const addRandomCars = (type: 'car' | 'train' | 'semi' = 'car') => {
    const count = parseInt(addCarsCountRef.current?.value || '1', 10);
    if (isNaN(count) || count <= 0) return;

    const roadTiles = Object.entries(grid).filter(([key, tiles]) => 
      (tiles as GridTile[]).some(t => {
        if (t.type === 'rail-road-crossing') return true;
        if (type === 'train') return t.type.startsWith('rail') || t.type.includes('trestle');
        if (type === 'semi') return t.type.startsWith('road') || t.type === 'parking-2x4' || t.type === 'parking-4x4';
        return t.type.startsWith('road') || t.type.startsWith('parking-');
      })
    );

    if (roadTiles.length === 0) return;

    const updatedVehicles = { ...vehicles };
    const newIds = [];
    
    for(let i=0; i<count; i++) {
        const id = Math.random().toString(36).substring(2, 11);
        newIds.push(id);
        const randomColor = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
        
        let newX = 0, newY = 0, heading = 0, lane = 1, zIndex = 0;
        const randomRoad = roadTiles[Math.floor(Math.random() * roadTiles.length)];
        const [rx, ry] = randomRoad[0].split(',').map(Number);
        const tilesList = randomRoad[1] as GridTile[];
        const topTile = tilesList[tilesList.length - 1];
        const is4Lane = topTile.type.includes('4lane');
        newX = rx;
        newY = ry;
        heading = topTile.rotation;
        if (topTile.type === 'rail-road-crossing' && type !== 'train') {
           heading = (heading + 90) % 360; // Cars should go along the road axis
        }
        lane = type === 'train' ? 0 : (is4Lane ? (Math.random() > 0.5 ? 1 : 2.5) * (Math.random() > 0.5 ? 1 : -1) : (Math.random() > 0.5 ? 1 : -1));
        zIndex = topTile.type.includes('bridge') || topTile.type.includes('trestle') ? 1 : 0;

        updatedVehicles[id] = {
           id,
           type,
           x: newX,
           y: newY,
           heading,
           progress: Math.random(),
           lane,
           color: randomColor,
           zIndex,
           isMoving: true,
           speed: 1,
           turnAroundAtDeadEnd: true,
           randomTurning: true,
           turnIntent: ['left', 'right', 'straight'][Math.floor(Math.random() * 3)] as any,
           trailers: type === 'semi' ? 1 : 0,
        };
    }
    setVehicles(updatedVehicles);
    setSelectedVehicles(new Set([...selectedVehicles, ...newIds]));
    if (roomCode) {
      socket.emit('update-vehicles', { roomCode, vehicles: updatedVehicles });
    }
  };

  const removeSelectedCars = (targetIds: Iterable<string> = selectedVehicles) => {
    const ids = Array.from(targetIds);
    if (ids.length === 0) return;
    const updatedVehicles = { ...vehicles };
    ids.forEach(id => {
      delete updatedVehicles[id];
    });
    setVehicles(updatedVehicles);
    setSelectedVehicles(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.delete(id));
      return next;
    });
    if (roomCode) {
      socket.emit('update-vehicles', { roomCode, vehicles: updatedVehicles });
    }
  };

  const toggleAllVehiclesOfType = (panelType: VehiclePanelType) => {
    const typeIds = Object.values(vehicles).filter(v => vehicleMatchesPanelType(v, panelType)).map(v => v.id);
    const filteredSelected = filterSelectionByPanelType(selectedVehicles, vehicles, panelType);
    if (filteredSelected.size === typeIds.length && typeIds.length > 0) {
      setSelectedVehicles(prev => {
        const next = new Set(prev);
        typeIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelectedVehicles(prev => new Set([...prev, ...typeIds]));
    }
  };

  const toggleSelectedCarsAttribute = (
    attr: 'isMoving' | 'turnAroundAtDeadEnd' | 'randomTurning',
    targetIds: Iterable<string> = selectedVehicles
  ) => {
    const ids = Array.from(targetIds);
    if (ids.length === 0) return;
    const updatedVehicles = { ...vehicles };
    let anyUpdates = false;

    // determine majority state to toggle to opposite
    let activeCount = 0;
    ids.forEach(id => {
      if (updatedVehicles[id]?.[attr]) activeCount++;
    });
    const newState = activeCount < ids.length / 2;

    ids.forEach(id => {
      if (updatedVehicles[id]) {
        updatedVehicles[id] = { ...updatedVehicles[id], [attr]: newState };
        anyUpdates = true;
      }
    });

    if (anyUpdates) {
      setVehicles(updatedVehicles);
      if (roomCode) {
        socket.emit('update-vehicles', { roomCode, vehicles: updatedVehicles });
      }
    }
  };

  const parkSelectedVehicles = (targetIds: Iterable<string> = selectedVehicles) => {
    const ids = Array.from(targetIds);
    if (ids.length === 0) return;
    const updatedVehicles = { ...vehicles };
    let anyUpdates = false;
    ids.forEach(id => {
      const v = updatedVehicles[id];
      if (v) {
        updatedVehicles[id] = { ...v, parkOnNextLot: true };
        anyUpdates = true;
      }
    });
    if (anyUpdates) {
      setVehicles(updatedVehicles);
      if (roomCode) {
        socket.emit('update-vehicles', { roomCode, vehicles: updatedVehicles });
      }
    }
  };

  const clearSelectedDestinations = (targetIds: Iterable<string> = selectedVehicles) => {
    const ids = Array.from(targetIds);
    const updatedVehicles = { ...vehicles };
    let anyUpdates = false;
    ids.forEach(id => {
      if (updatedVehicles[id]?.destination) {
        updatedVehicles[id] = { ...updatedVehicles[id], destination: null };
        anyUpdates = true;
      }
    });
    if (anyUpdates) {
      setVehicles(updatedVehicles);
      if (roomCode) {
        socket.emit('update-vehicles', { roomCode, vehicles: updatedVehicles });
      }
    }
  };

  const handleVehicleSelect = useCallback((vehicleId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (e.shiftKey) {
      setSelectedVehicles(prev => {
        const next = new Set(prev);
        if (next.has(vehicleId)) next.delete(vehicleId);
        else next.add(vehicleId);
        return next;
      });
    } else {
      setSelectedVehicles(new Set([vehicleId]));
    }
  }, []);

  const toggleBuildingProduction = useCallback((anchorKey: string) => {
    setEconomy(prev => {
      const cfg = prev.buildings[anchorKey];
      if (!cfg) return prev;
      const nextEco = {
        ...prev,
        buildings: {
          ...prev.buildings,
          [anchorKey]: { ...cfg, productionEnabled: !cfg.productionEnabled },
        },
      };
      if (roomCode) socket.emit('update-economy', { roomCode, economy: nextEco });
      return nextEco;
    });
  }, [roomCode, setEconomy]);

  const toggleDestinationMode = (targetIds: Iterable<string> = selectedVehicles) => {
    const ids = Array.from(targetIds);
    if (ids.length === 0) return;
    const haveDestination = ids.some(id => vehicles[id]?.destination);
    if (pendingRouteVehicleId || haveDestination) {
      setPendingRouteVehicleId(null);
      clearSelectedDestinations(ids);
      return;
    }
    setIsPlacingVehicles(false);
    setPendingRouteVehicleId(ids[0]);
  };

  const unparkSelectedVehicles = (targetIds: Iterable<string> = selectedVehicles) => {
    const ids = Array.from(targetIds);
    if (ids.length === 0) return;
    const updatedVehicles = { ...vehicles };
    let anyUpdates = false;
    ids.forEach(id => {
      const v = updatedVehicles[id];
      if (v && v.parkingStopUntil) {
        const newV = { ...v };
        delete newV.parkingStopUntil;
        updatedVehicles[id] = newV;
        anyUpdates = true;
      }
    });
    if (anyUpdates) {
      setVehicles(updatedVehicles);
      if (roomCode) {
        socket.emit('update-vehicles', { roomCode, vehicles: updatedVehicles });
      }
    }
  };

  const changeSelectedTrailers = (delta: number, targetIds: Iterable<string> = selectedVehicles) => {
    const ids = Array.from(targetIds);
    if (ids.length === 0) return;
    const updatedVehicles = { ...vehicles };
    let anyUpdates = false;
    ids.forEach(id => {
      const v = getVehicleById(updatedVehicles, id);
      if (v && isSemiVehicle(v)) {
        const current = v.trailers ?? 1;
        const next = Math.max(0, Math.min(2, current + delta));
        if (current !== next) {
          let cargos = v.trailerCargos ? [...v.trailerCargos] : [];
          if (next > cargos.length) {
            cargos = [...cargos, ...Array(next - cargos.length).fill({})];
          } else if (next < cargos.length) {
            cargos = cargos.slice(0, next);
          }
          updatedVehicles[id] = { ...v, trailers: next, trailerCargos: cargos.length ? cargos : undefined };
          anyUpdates = true;
        }
      }
    });

    if (anyUpdates) {
      setVehicles(updatedVehicles);
      if (roomCode) {
        socket.emit('update-vehicles', { roomCode, vehicles: updatedVehicles });
      }
    }
  };

  const dropTrailerFromSemi = useCallback((vehicleId: string, trailerIndex?: number) => {
    const v = getVehicleById(vehicles, vehicleId);
    const currentGrid = gridRef.current || grid;
    if (!v || !canSemiDropTrailer(v, currentGrid)) return;

    const idx = trailerIndex ?? Math.max(0, getSemiTrailerCount(v) - 1);
    const stallIndex = v.parkingStallIndex ?? 0;
    const parkingLotKey = getSemiParkingLotKey(v, currentGrid);
    if (!parkingLotKey || isStallOccupied(parkingLotKey, stallIndex, economy.parkedTrailers)) return;

    const cargos = [...(v.trailerCargos || [])];
    while (cargos.length <= idx) cargos.push({});
    const droppedCargo = { ...cargos[idx] };
    cargos.splice(idx, 1);
    const nextTrailers = Math.max(0, getSemiTrailerCount(v) - 1);

    const parked: ParkedTrailer = {
      id: makeParkedTrailerId(),
      parkingLotKey,
      stallIndex,
      gridX: v.x,
      gridY: v.y,
      heading: v.heading,
      cargo: droppedCargo,
    };

    const updatedVehicles = {
      ...vehicles,
      [vehicleId]: {
        ...v,
        trailers: nextTrailers,
        trailerCargos: cargos.length ? cargos : undefined,
      },
    };
    const nextEco = {
      ...economy,
      parkedTrailers: { ...(economy.parkedTrailers || {}), [parked.id]: parked },
    };

    setVehicles(updatedVehicles);
    setEconomy(nextEco);
    if (roomCode) {
      socket.emit('update-vehicles', { roomCode, vehicles: updatedVehicles });
      socket.emit('update-economy', { roomCode, economy: nextEco });
    }
  }, [vehicles, grid, economy, roomCode]);

  const pickupParkedTrailer = useCallback((trailerId: string, vehicleId: string) => {
    const v = getVehicleById(vehicles, vehicleId);
    const trailer = economy.parkedTrailers?.[trailerId];
    if (!v || !trailer || !canPickupParkedTrailer(v, trailer)) return;

    const nextCount = (v.trailers ?? 0) + 1;
    const cargos = [...(v.trailerCargos || [])];
    while (cargos.length < nextCount - 1) cargos.push({});
    cargos.push({ ...trailer.cargo });

    const updatedVehicles = {
      ...vehicles,
      [vehicleId]: {
        ...v,
        trailers: nextCount,
        trailerCargos: cargos,
      },
    };
    const nextParked = { ...(economy.parkedTrailers || {}) };
    delete nextParked[trailerId];
    const nextEco = { ...economy, parkedTrailers: nextParked };

    setVehicles(updatedVehicles);
    setEconomy(nextEco);
    setInspectTrailerRef(null);
    if (roomCode) {
      socket.emit('update-vehicles', { roomCode, vehicles: updatedVehicles });
      socket.emit('update-economy', { roomCode, economy: nextEco });
    }
  }, [vehicles, economy, roomCode]);

  const handleTrailerSelect = useCallback((vehicleId: string, trailerIndex: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setInspectTrailerRef({ kind: 'vehicle', vehicleId, trailerIndex });
    setInspectRailcarRef(null);
    if (!e.shiftKey) setSelectedVehicles(new Set([vehicleId]));
  }, []);

  const handleRailcarSelect = useCallback((vehicleId: string, railcarIndex: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setInspectRailcarRef({ vehicleId, railcarIndex });
    setInspectTrailerRef(null);
    if (!e.shiftKey) setSelectedVehicles(new Set([vehicleId]));
  }, []);

  const handleParkedTrailerSelect = useCallback((trailerId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setInspectTrailerRef({ kind: 'parked', id: trailerId });
    setInspectRailcarRef(null);
  }, []);

  const modifySelectedRailcars = (
    action: 'add' | 'remove' | 'move',
    payload?: any,
    targetIds: Iterable<string> = selectedVehicles
  ) => {
    const ids = Array.from(targetIds);
    if (ids.length === 0) return;
    const updatedVehicles = { ...vehicles };
    let anyUpdates = false;

    ids.forEach(id => {
      const v = updatedVehicles[id];
      if (v && v.type === 'train') {
        const rc = [...(v.railcars || [])];
        const cargos = [...(v.railcarCargos || [])];
        let changed = false;

        if (action === 'add' && rc.length < 12) {
          rc.push(payload as RailcarType);
          cargos.push({});
          changed = true;
        } else if (action === 'remove') {
          rc.splice(payload as number, 1);
          cargos.splice(payload as number, 1);
          changed = true;
        } else if (action === 'move') {
          const { from, to } = payload as { from: number, to: number };
          if (from >= 0 && from < rc.length && to >= 0 && to < rc.length) {
            const tempRc = rc[from];
            rc.splice(from, 1);
            rc.splice(to, 0, tempRc);
            const tempCargo = cargos[from] || {};
            cargos.splice(from, 1);
            cargos.splice(to, 0, tempCargo);
            changed = true;
          }
        }

        if (changed) {
          updatedVehicles[id] = syncRailcarCargos({ ...v, railcars: rc, railcarCargos: cargos });
          anyUpdates = true;
        }
      }
    });

    if (anyUpdates) {
      setVehicles(updatedVehicles);
      if (roomCode) {
        socket.emit('update-vehicles', { roomCode, vehicles: updatedVehicles });
      }
    }
  };

  const changeSelectedCarsSpeed = (newSpeed: number, targetIds: Iterable<string> = selectedVehicles) => {
    const ids = Array.from(targetIds);
    if (ids.length === 0) return;
    const updatedVehicles = { ...vehicles };
    let anyUpdates = false;
    ids.forEach(id => {
      if (updatedVehicles[id]) {
        updatedVehicles[id] = { ...updatedVehicles[id], speed: newSpeed };
        anyUpdates = true;
      }
    });

    if (anyUpdates) {
      setVehicles(updatedVehicles);
      if (roomCode) {
        socket.emit('update-vehicles', { roomCode, vehicles: updatedVehicles });
      }
    }
  };

  const requestRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  const updateVehicleLoop = useCallback((time: number) => {
    const currentGrid = gridRef.current || grid || {};
    if (lastTimeRef.current !== 0) {
      const deltaTime = time - lastTimeRef.current;
      
      setVehicles(prev => {
        let hasChanges = false;
        let needsVehicleSync = false;
        const nextVehicles = { ...prev };

        for (const [uid, v] of Object.entries(prev)) {
          const vehicle = v as Vehicle;

          if (vehicle.destination && vehicle.x === vehicle.destination.x && vehicle.y === vehicle.destination.y) {
            const arrivalPatch = getDestinationArrivalPatch(vehicle, vehicle.x, vehicle.y);
            nextVehicles[uid] = { ...vehicle, ...arrivalPatch };
            hasChanges = true;
            if (arrivalPatch.destination === null) needsVehicleSync = true;
            continue;
          }

          if (vehicle.parkingStopUntil) {
            if (Date.now() >= vehicle.parkingStopUntil) {
              const newVehicle = { ...vehicle };
              delete newVehicle.parkingStopUntil;
              nextVehicles[uid] = newVehicle;
              hasChanges = true;
            }
            continue;
          }

          if (!vehicle.isMoving && !vehicle.stepForward && !vehicle.stepBackward) continue;

          let { x, y, heading, lane, progress, zIndex, turnIntent } = vehicle;
          
          let newParkingStopUntil = vehicle.parkingStopUntil;
          let newLastParkingKey = vehicle.lastParkingKey;
          let newStallIndex = vehicle.parkingStallIndex;
          let newParkOnNextLot = vehicle.parkOnNextLot;
          
          const currentTileKey = `${x},${y}`;
          const currentTiles = currentGrid[currentTileKey];
          const currentTile = currentTiles?.find(t => {
            const isBridge = t.type.includes('bridge') || t.type.includes('trestle');
            return (zIndex === 1 && isBridge) || (zIndex === 0 && !isBridge);
          });
          
          if (currentTile && currentTile.type.startsWith('parking-')) {
            const parkingLotId = currentTile.part === 'member' ? currentTile.anchorKey : currentTileKey;
            if (vehicle.lastParkingKey !== parkingLotId || vehicle.parkOnNextLot) {
              newParkingStopUntil = Date.now() + Math.floor(Math.random() * 4001) + 1000;
              newLastParkingKey = parkingLotId;
              newParkOnNextLot = false;
              let maxStalls = 2;
              if (currentTile.type === 'parking-4x4') {
                const lx = currentTile.localX ?? 0;
                if (lx >= 2) {
                  maxStalls = 4;
                }
              }
              newStallIndex = Math.floor(Math.random() * maxStalls);
            }
          } else {
            newLastParkingKey = undefined;
          }

          if (
            newParkingStopUntil !== vehicle.parkingStopUntil || 
            newLastParkingKey !== vehicle.lastParkingKey ||
            newStallIndex !== vehicle.parkingStallIndex ||
            newParkOnNextLot !== vehicle.parkOnNextLot
          ) {
            nextVehicles[uid] = {
              ...vehicle,
              parkingStopUntil: newParkingStopUntil,
              lastParkingKey: newLastParkingKey,
              parkingStallIndex: newStallIndex,
              parkOnNextLot: newParkOnNextLot
            };
            hasChanges = true;
            continue;
          }

          hasChanges = true;

          const speed = vehicle.speed || 1;
          let step = 0;
          
          if (vehicle.isMoving) {
            step = (speed * deltaTime) / 1000;
          } else if (vehicle.stepForward) {
            step = 0.1; // One step forward
          } else if (vehicle.stepBackward) {
            step = -0.1; // One step backward
          }
          
          progress += step;

          let newVehicleState = { ...vehicle, progress };
          
          if (vehicle.stepForward || vehicle.stepBackward) {
            newVehicleState.stepForward = false;
            newVehicleState.stepBackward = false;
          }

          // Handle tile boundaries (forward)
          if (progress >= 1) {
            let exitHeading = heading;
            const currentTiles = currentGrid[`${x},${y}`];
            const currentTile = currentTiles?.find(t => {
              const isBridge = t.type.includes('bridge') || t.type.includes('trestle');
              return (zIndex === 1 && isBridge) || (zIndex === 0 && !isBridge);
            });

            if (currentTile) {
              const ports = (TILE_CONNECTIONS[currentTile.type] || []).map(p => (p + currentTile.rotation / 90) % 4);
              const entryPort = (heading / 90 + 2) % 4;
              let otherPorts = ports.filter(p => p !== entryPort);
              
              if (currentTile.type === 'rail-road-crossing') {
                const straightPort = (entryPort + 2) % 4;
                otherPorts = otherPorts.includes(straightPort) ? [straightPort] : [];
              }
              
              if (otherPorts.length > 0) {
                let exitPort = otherPorts[0];
                if (otherPorts.length > 1) {
                  const straightPort = (entryPort + 2) % 4;
                  const leftPort = (entryPort + 3) % 4;
                  const rightPort = (entryPort + 1) % 4;

                  if (vehicle.destination) {
                    const recExit = getRecommendedExit(x, y, heading, vehicle.destination, (vehicle.type || 'car') as any, currentGrid);
                    if (recExit !== null) {
                      exitPort = Math.round(recExit / 90) % 4;
                    } else if (turnIntent === 'left' && otherPorts.includes(leftPort)) exitPort = leftPort;
                    else if (turnIntent === 'right' && otherPorts.includes(rightPort)) exitPort = rightPort;
                    else if (otherPorts.includes(straightPort)) exitPort = straightPort;
                  } else if (turnIntent === 'left' && otherPorts.includes(leftPort)) exitPort = leftPort;
                  else if (turnIntent === 'right' && otherPorts.includes(rightPort)) exitPort = rightPort;
                  else if (otherPorts.includes(straightPort)) exitPort = straightPort;
                }
                exitHeading = exitPort * 90;
              }
            }

            const dx = exitHeading === 90 ? 1 : exitHeading === 270 ? -1 : 0;
            const dy = exitHeading === 180 ? 1 : exitHeading === 0 ? -1 : 0;
            const nextX = x + dx;
            const nextY = y + dy;
            const nextKey = `${nextX},${nextY}`;
            
            if (currentGrid[nextKey]) {
              const nextTiles = currentGrid[nextKey];
              let validNextTiles = nextTiles.filter(t => {
                const isCrossing = t.type === 'rail-road-crossing';
                if (vehicle.type === 'train') {
                  return t.type.startsWith('rail') || isCrossing;
                } else if (vehicle.type === 'semi') {
                  const isBigParking = t.type === 'parking-2x4' || t.type === 'parking-4x4';
                  return t.type.startsWith('road') || isBigParking || isCrossing;
                } else {
                  return t.type.startsWith('road') || t.type.startsWith('parking-') || isCrossing;
                }
              });

              let nextTile = validNextTiles.find(t => {
                const isBridge = t.type.includes('bridge') || t.type.includes('trestle');
                return (zIndex === 1 && isBridge) || (zIndex === 0 && !isBridge);
              }) || validNextTiles[0];

              if (nextTile) {
                const nextPorts = (TILE_CONNECTIONS[nextTile.type] || []).map(p => (p + nextTile.rotation / 90) % 4);
                const nextEntryPort = (exitHeading / 90 + 2) % 4;

                if (nextPorts.includes(nextEntryPort)) {
                  const isNext4Lane = nextTile.type.includes('4lane');
                  const nextIsBridge = nextTile.type.includes('bridge') || nextTile.type.includes('trestle');
                  
                  // Force vehicles strictly forward on rail crossings without turning
                  if (nextTile.type === 'rail-road-crossing') {
                     const isEnteringRailAxis = (nextEntryPort % 2 === (nextTile.rotation / 90) % 2);
                     if (vehicle.type === 'train' && !isEnteringRailAxis) {
                         // Turn around if Train entering road axis
                         newVehicleState = vehicle.turnAroundAtDeadEnd !== false ? { 
                           ...vehicle, heading: (exitHeading + 180) % 360, progress: 0, isMoving: true 
                         } : { ...vehicle, progress: 0.99, isMoving: false };
                     } else if (vehicle.type !== 'train' && isEnteringRailAxis) {
                         // Turn around if Car entering rail axis
                         newVehicleState = vehicle.turnAroundAtDeadEnd !== false ? { 
                           ...vehicle, heading: (exitHeading + 180) % 360, progress: 0, isMoving: true 
                         } : { ...vehicle, progress: 0.99, isMoving: false };
                     } else {
                         // Must continue straight over the crossing without turning intent checking
                         newVehicleState = {
                           ...vehicle,
                           x: nextX,
                           y: nextY,
                           heading: exitHeading,
                           progress: progress - 1,
                           zIndex: 0,
                           turnIntent: null,
                           lane: vehicle.type === 'train' ? 0 : 1,
                           ...getDestinationArrivalPatch(vehicle, nextX, nextY),
                         };
                         if (vehicle.destination && nextX === vehicle.destination.x && nextY === vehicle.destination.y) {
                           needsVehicleSync = true;
                         }
                     }
                  } else {
                    newVehicleState = {
                      ...vehicle,
                      x: nextX,
                      y: nextY,
                      heading: exitHeading,
                      progress: progress - 1,
                      zIndex: nextIsBridge ? 1 : 0,
                      turnIntent: vehicle.destination ? null : (vehicle.randomTurning ? ['left', 'right', 'straight'][Math.floor(Math.random() * 3)] as any : null),
                      lane: vehicle.type === 'train' ? 0 : isNext4Lane ? vehicle.lane : 1,
                      ...getDestinationArrivalPatch(vehicle, nextX, nextY),
                    };
                    if (vehicle.destination && nextX === vehicle.destination.x && nextY === vehicle.destination.y) {
                      needsVehicleSync = true;
                    }
                  }
                  } else {
                    // Turn around at dead end (not connected port)
                    newVehicleState = vehicle.turnAroundAtDeadEnd !== false ? { 
                      ...vehicle, 
                      heading: (exitHeading + 180) % 360, 
                      progress: 0, 
                      isMoving: true 
                    } : { ...vehicle, progress: 0.99, isMoving: false };
                  }
                } else {
                  // Turn around if no matching tile
                  newVehicleState = vehicle.turnAroundAtDeadEnd !== false ? { 
                    ...vehicle, 
                    heading: (exitHeading + 180) % 360, 
                    progress: 0, 
                    isMoving: true 
                  } : { ...vehicle, progress: 0.99, isMoving: false };
                }
              } else {
              // Turn around if no next tile in grid
              newVehicleState = vehicle.turnAroundAtDeadEnd !== false ? { 
                ...vehicle, 
                heading: (exitHeading + 180) % 360, 
                progress: 0, 
                isMoving: true 
              } : { ...vehicle, progress: 0.99, isMoving: false };
            }
          } else if (progress < 0) {
            // Simple clamping for backward movement to avoid complex backward routing
            newVehicleState.progress = 0;
          }

          nextVehicles[uid] = newVehicleState;
        }

        if (needsVehicleSync && roomCodeRef.current) {
          queueMicrotask(() => {
            socket.emit('update-vehicles', { roomCode: roomCodeRef.current, vehicles: nextVehicles });
          });
        }

        return hasChanges ? nextVehicles : prev;
      });
    }
    lastTimeRef.current = time;
    requestRef.current = requestAnimationFrame(updateVehicleLoop);
  }, [user, grid]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(updateVehicleLoop);
    return () => cancelAnimationFrame(requestRef.current);
  }, [updateVehicleLoop]);

  // Economy simulation tick (simple rates + factory batches)
  useEffect(() => {
    if (!roomCode) return;
    const iv = setInterval(() => {
      const economy = localEconomyRef.current;
      if (!economy || economy.economyPaused) return;
      let changed = false;
      const nextB: Record<string, BuildingConfig> = { ...(economy.buildings || {}) };

      Object.keys(nextB).forEach(ak => {
        const cfg = { ...nextB[ak] };
        const dt = 0.25; // seconds per tick
        if (cfg.role === 'store' && cfg.consumptionRates) {
          Object.keys(cfg.consumptionRates).forEach(it => {
            const rate = cfg.consumptionRates![it] || 0;
            const cur = cfg.inventory[it] || 0;
            const nextQty = Math.max(0, Math.floor(cur - rate * dt));
            if (nextQty !== cur) { cfg.inventory[it] = nextQty; changed = true; }
          });
        }
        if ((cfg.role === 'factory' || cfg.role === 'lumbermill') && cfg.productionEnabled && cfg.cycleTimeSec && cfg.recipeInputs && cfg.recipeOutputs) {
          if (hasRecipeInputs(cfg) && hasOutputCapacity(cfg)) {
            cfg.processAccum = (cfg.processAccum || 0) + dt;
            changed = true;
            const cycle = cfg.cycleTimeSec;
            while (cfg.processAccum >= cycle) {
              if (!hasRecipeInputs(cfg) || !hasOutputCapacity(cfg)) break;
              (cfg.recipeInputs || []).forEach(inp => { cfg.inventory[inp.item] = (cfg.inventory[inp.item] || 0) - (inp.amount || 1); });
              (cfg.recipeOutputs || []).forEach(out => { cfg.inventory[out.item] = (cfg.inventory[out.item] || 0) + (out.amount || 1); });
              cfg.processAccum -= cycle;
            }
          }
        }
        nextB[ak] = cfg;
      });

      if (changed) {
        const nextEco = { ...economy, buildings: nextB };
        setEconomy(nextEco);
        if (roomCode) socket.emit('update-economy', { roomCode, economy: nextEco });
      }
    }, 250);
    return () => clearInterval(iv);
  }, [roomCode, setEconomy]);

  // Plant growth tick
  useEffect(() => {
    if (!roomCode) return;
    const iv = setInterval(() => {
      const settings = localEconomyRef.current.plantGrowth || DEFAULT_PLANT_GROWTH;
      if (settings.paused || settings.growthDurationSec <= 0) return;

      const dt = 0.25;
      const progressPerTick = dt / settings.growthDurationSec;
      let changed = false;
      const currentGrid = gridRef.current;
      const newGrid: GridData = { ...currentGrid };

      Object.entries(currentGrid).forEach(([key, tiles]) => {
        if (!tiles?.length) return;
        const topIdx = tiles.length - 1;
        const tile = tiles[topIdx];
        if (tile.type !== 'tree-pine-seedling') return;

        const progress = (tile.growthProgress ?? 0) + progressPerTick;
        const newTiles = [...tiles];
        if (progress >= 1) {
          newTiles[topIdx] = { type: 'tree-pine', rotation: 0 };
        } else {
          newTiles[topIdx] = { ...tile, growthProgress: progress };
        }
        newGrid[key] = newTiles;
        changed = true;
      });

      if (changed) {
        setGrid(newGrid);
      }
    }, 250);
    return () => clearInterval(iv);
  }, [roomCode, setGrid]);

  const confirmDeleteFromLibrary = async () => {
    if (!showDeleteLayoutConfirm) return;
    try {
      socket.emit('delete-layout', showDeleteLayoutConfirm.id);
      setShowDeleteLayoutConfirm(null);
    } catch (err) {
      console.error("Error deleting layout:", err);
    }
  };

  const exportLibraries = async () => {
    const zip = new JSZip();
    const layoutsFolder = zip.folder("layouts");
    library.forEach((item: any, index: number) => {
      layoutsFolder?.file(`${item.name || 'layout_' + index}.json`, JSON.stringify(item.data, null, 2));
    });
    const simsFolder = zip.folder("simulations");
    simulations.forEach((item: any, index: number) => {
      simsFolder?.file(`${item.name || 'sim_' + index}.json`, JSON.stringify(item.data, null, 2));
    });
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gridcity_libraries.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const importLibraries = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const zip = await JSZip.loadAsync(file);
      const promises: Promise<void>[] = [];
      zip.forEach((relativePath, zipEntry) => {
        if (!zipEntry.dir && relativePath.endsWith('.json')) {
          promises.push(
            zipEntry.async('string').then((content) => {
              try {
                const data = JSON.parse(content);
                const nameMatch = relativePath.match(/([^\/]+)\.json$/);
                const name = nameMatch ? nameMatch[1] : 'imported';
                if (relativePath.startsWith('layouts/')) {
                  socket.emit('save-layout', { name, data });
                } else if (relativePath.startsWith('simulations/') || relativePath.startsWith('sims/')) {
                  socket.emit('save-simulation', { name, data });
                }
              } catch (e) {
                console.error('Error parsing JSON from zip', relativePath, e);
              }
            })
          );
        }
      });
      await Promise.all(promises);
      // Reset input
      event.target.value = '';
    } catch (error) {
      console.error("Error importing libraries", error);
    }
  };

  const loadFromLibrary = (data: GridData) => {
    setPendingLayout(data);
    setShowLoadConfirm(true);
  };

  const addToHistory = useCallback((newGrid: GridData) => {
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(newGrid);
      if (newHistory.length > MAX_HISTORY) {
        newHistory.shift();
      }
      return newHistory;
    });
    setHistoryIndex(prev => {
      const nextIndex = prev + 1;
      return nextIndex >= MAX_HISTORY ? MAX_HISTORY - 1 : nextIndex;
    });
  }, [historyIndex]);

  const rotateClipboard = useCallback(() => {
    if (!clipboard) return;
    setClipboard(rotateGridData(clipboard));
  }, [clipboard]);

  const rotateSelection = useCallback(() => {
    if (!selectionStart || !selectionEnd) return;
    const x1 = Math.min(selectionStart.x, selectionEnd.x);
    const y1 = Math.min(selectionStart.y, selectionEnd.y);
    const x2 = Math.max(selectionStart.x, selectionEnd.x);
    const y2 = Math.max(selectionStart.y, selectionEnd.y);

    const selectedData: GridData = {};
    const newGrid = { ...grid };
    let hasTiles = false;
    
    for (let x = x1; x <= x2; x++) {
      for (let y = y1; y <= y2; y++) {
        const key = `${x},${y}`;
        const tiles = getTile(x, y);
        if (tiles) {
          selectedData[`${x - x1},${y - y1}`] = [...tiles];
          delete newGrid[key];
          hasTiles = true;
        }
      }
    }

    if (!hasTiles) return;

    const rotated = rotateGridData(selectedData);
    
    (Object.entries(rotated) as [string, GridTile[]][]).forEach(([relKey, tiles]) => {
      const [rx, ry] = relKey.split(',').map(Number);
      newGrid[`${x1 + rx},${y1 + ry}`] = tiles;
    });

    setGrid(newGrid);
    addToHistory(newGrid);
    
    const width = x2 - x1;
    const height = y2 - y1;
    setSelectionEnd({ x: x1 + height, y: y1 + width });
  }, [grid, selectionStart, selectionEnd]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setGrid(history[newIndex]);
    }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setGrid(history[newIndex]);
    }
  }, [history, historyIndex]);

  const copySelection = useCallback(() => {
    if (!selectionStart || !selectionEnd) return;
    const x1 = Math.min(selectionStart.x, selectionEnd.x);
    const y1 = Math.min(selectionStart.y, selectionEnd.y);
    const x2 = Math.max(selectionStart.x, selectionEnd.x);
    const y2 = Math.max(selectionStart.y, selectionEnd.y);

    const newClipboard: GridData = {};
    for (let x = x1; x <= x2; x++) {
      for (let y = y1; y <= y2; y++) {
        const key = `${x},${y}`;
        const tiles = getTile(x, y);
        if (tiles) {
          newClipboard[`${x - x1},${y - y1}`] = [...tiles];
        }
      }
    }
    setClipboard(newClipboard);
    setSelectionStart(null);
    setSelectionEnd(null);
  }, [grid, selectionStart, selectionEnd]);

  const cutSelection = useCallback(() => {
    if (!selectionStart || !selectionEnd) return;
    copySelection();
    
    const x1 = Math.min(selectionStart.x, selectionEnd.x);
    const y1 = Math.min(selectionStart.y, selectionEnd.y);
    const x2 = Math.max(selectionStart.x, selectionEnd.x);
    const y2 = Math.max(selectionStart.y, selectionEnd.y);

    const newGrid = { ...grid };
    for (let x = x1; x <= x2; x++) {
      for (let y = y1; y <= y2; y++) {
        delete newGrid[`${x},${y}`];
      }
    }
    setGrid(newGrid);
    addToHistory(newGrid);
  }, [grid, selectionStart, selectionEnd, copySelection]);

  const deleteSelection = useCallback(() => {
    if (!selectionStart || !selectionEnd) return;
    
    const x1 = Math.min(selectionStart.x, selectionEnd.x);
    const y1 = Math.min(selectionStart.y, selectionEnd.y);
    const x2 = Math.max(selectionStart.x, selectionEnd.x);
    const y2 = Math.max(selectionStart.y, selectionEnd.y);

    const newGrid = { ...grid };
    let hasChanges = false;
    for (let x = x1; x <= x2; x++) {
      for (let y = y1; y <= y2; y++) {
        const key = `${x},${y}`;
        if (newGrid[key]) {
          delete newGrid[key];
          hasChanges = true;
        }
      }
    }
    
    if (hasChanges) {
      setGrid(newGrid);
      addToHistory(newGrid);
    }
    setSelectionStart(null);
    setSelectionEnd(null);
  }, [grid, selectionStart, selectionEnd]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      if (e.repeat) return;

      // Vehicle controls
      if (selectedVehicles.size > 0) {
        const key = e.key.toLowerCase();
        let anyUpdated = false;
        const updatedVehicles = { ...vehicles };

        selectedVehicles.forEach(id => {
          const myVehicle = updatedVehicles[id];
          if (!myVehicle) return;
          let updated = false;
          let newVehicle = { ...myVehicle };

          if (key === 'g') {
            newVehicle.isMoving = !newVehicle.isMoving;
            updated = true;
          } else if (key === 's') {
            if (newVehicle.isMoving !== false) {
              newVehicle.isMoving = false;
              updated = true;
            }
          } else if (key === 'f') {
            newVehicle.isMoving = false;
            newVehicle.stepForward = true;
            updated = true;
          } else if (key === 'b') {
            newVehicle.isMoving = false;
            newVehicle.stepBackward = true;
            updated = true;
          } else if (e.key === 'ArrowUp') {
            const newSpeed = Math.min((newVehicle.speed || 1) + 0.5, 5);
            if (newVehicle.speed !== newSpeed) {
              newVehicle.speed = newSpeed;
              updated = true;
            }
          } else if (e.key === 'ArrowDown') {
            const newSpeed = Math.max((newVehicle.speed || 1) - 0.5, 0.5);
            if (newVehicle.speed !== newSpeed) {
              newVehicle.speed = newSpeed;
              updated = true;
            }
          } else if (key === 'l' || key === 'r') {
            if ((newVehicle.type || 'car') === 'train') return;

            // Use gridRef for latest grid to avoid stale closure (grid not in effect deps)
            const currentTiles = gridRef.current[`${myVehicle.x},${myVehicle.y}`];
            const currentTile = currentTiles?.find(t => {
              const isBridge = t.type.includes('bridge') || t.type.includes('trestle');
              return (myVehicle.zIndex === 1 && isBridge) || (myVehicle.zIndex === 0 && !isBridge);
            });

            if (!currentTile?.type.startsWith('road')) return;

            const isIntersection = isIntersectionTile(currentTile.type);
            const is4Lane = currentTile.type.includes('4lane');

            if (isIntersection) {
              const intent = key === 'r' ? 'right' : 'left';
              if (newVehicle.turnIntent !== intent) {
                newVehicle.turnIntent = intent;
                updated = true;
              }
            } else {
              const nextLane = key === 'r'
                ? shiftLaneRight(newVehicle.lane, is4Lane)
                : shiftLaneLeft(newVehicle.lane, is4Lane);
              if (nextLane !== null && nextLane !== newVehicle.lane) {
                newVehicle.lane = nextLane;
                newVehicle.turnIntent = null;
                updated = true;
              }
            }
          }

          if (updated) {
            updatedVehicles[id] = newVehicle;
            anyUpdated = true;
          }
        });

        if (anyUpdated) {
          setVehicles(updatedVehicles);
          return;
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) redo();
        else undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') redo();
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') copySelection();
      if ((e.ctrlKey || e.metaKey) && e.key === 'x') cutSelection();
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        if (clipboard) {
          setIsPasting(true);
          setSelectedTile(null);
        }
      }

      if (e.key.toLowerCase() === 'r') {
        if (isPasting) {
          rotateClipboard();
        } else if (selectionStart && selectionEnd) {
          rotateSelection();
        } else {
          setRotation(prev => (prev + 90) % 360);
        }
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectionStart && selectionEnd) {
          deleteSelection();
        }
      }
      if (e.key === 'Escape') {
        setSelectedTile(null);
        setIsPasting(false);
        setSelectionStart(null);
        setSelectionEnd(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, copySelection, cutSelection, deleteSelection, clipboard, rotateClipboard, rotateSelection, isPasting, selectionStart, selectionEnd, vehicles, user]);

  useEffect(() => {
    if (!isPanning && !isSelecting) return;
    const endInteraction = () => {
      setIsPanning(false);
      setIsSelecting(false);
    };
    window.addEventListener('mouseup', endInteraction);
    window.addEventListener('pointerup', endInteraction);
    return () => {
      window.removeEventListener('mouseup', endInteraction);
      window.removeEventListener('pointerup', endInteraction);
    };
  }, [isPanning, isSelecting]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isFromGridControl(e)) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const worldX = Math.floor((e.clientX - rect.left - offset.x) / zoom / GRID_SIZE);
    const worldY = Math.floor((e.clientY - rect.top - offset.y) / zoom / GRID_SIZE);

    if (e.button === 1 || (e.button === 0 && !selectedTile && !isPasting && !e.altKey)) {
      pulseOverview();
      setIsPanning(true);
      setPanStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    } else if (e.button === 0 && e.altKey) {
      setIsSelecting(true);
      setSelectionStart({ x: worldX, y: worldY });
      setSelectionEnd({ x: worldX, y: worldY });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isFromGridControl(e)) return;
    setMousePos({ x: e.clientX, y: e.clientY });
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const worldX = Math.floor((e.clientX - rect.left - offset.x) / zoom / GRID_SIZE);
    const worldY = Math.floor((e.clientY - rect.top - offset.y) / zoom / GRID_SIZE);

    if (isPanning) {
      pulseOverview();
      setOffset(clampOffset({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      }));
    } else if (isSelecting) {
      setSelectionEnd({ x: worldX, y: worldY });
    }

    if (isPasting) {
      setPastePreviewPos({ x: worldX, y: worldY });
    } else {
      setPastePreviewPos(null);
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setIsSelecting(false);
  };

  const zoomRef = useRef(zoom);
  const offsetRef = useRef(offset);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { offsetRef.current = offset; }, [offset]);

  // Native wheel blockers on all control surfaces (React stopPropagation is not enough)
  useEffect(() => {
    const blockers = new Map<Element, (e: Event) => void>();

    const attachBlockers = () => {
      document.querySelectorAll('[data-grid-control]').forEach(el => {
        if (blockers.has(el)) return;
        const handler = (e: Event) => e.stopPropagation();
        el.addEventListener('wheel', handler, { passive: false });
        blockers.set(el, handler);
      });
    };

    attachBlockers();
    const observer = new MutationObserver(attachBlockers);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      blockers.forEach((handler, el) => el.removeEventListener('wheel', handler));
      blockers.clear();
    };
  }, []);

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (isWheelOverGridControl(e)) return;

      const el = containerRef.current;
      if (!el) return;

      const path = e.composedPath();
      const overGrid = path.includes(el) || el.contains(e.target as Node);
      if (!overGrid) return;

      e.preventDefault();
      pulseOverview();

      const currentZoom = zoomRef.current;
      const currentOffset = offsetRef.current;
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, currentZoom * delta));

      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const worldX = (mouseX - currentOffset.x) / currentZoom;
      const worldY = (mouseY - currentOffset.y) / currentZoom;

      setZoom(newZoom);
      setOffset(clampOffset({
        x: mouseX - worldX * newZoom,
        y: mouseY - worldY * newZoom,
      }, newZoom));
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, [pulseOverview, clampOffset]);

  const getClipboardOffset = useCallback(() => {
    if (!clipboard) return { x: 0, y: 0 };
    const keys = Object.keys(clipboard);
    if (keys.length === 0) return { x: 0, y: 0 };
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    keys.forEach(key => {
      const [x, y] = key.split(',').map(Number);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    });
    
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    
    return {
      x: Math.floor(width / 2) + minX,
      y: Math.floor(height / 2) + minY
    };
  }, [clipboard]);

  const handleGridClick = (e: React.MouseEvent) => {
    if (isFromGridControl(e) || isPanning || isSelecting) return;

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const worldX = (mouseX - offset.x) / zoom;
    const worldY = (mouseY - offset.y) / zoom;

    const gridX = Math.floor(worldX / GRID_SIZE);
    const gridY = Math.floor(worldY / GRID_SIZE);

    const key = `${gridX},${gridY}`;

    // Destination assignment — highest priority (works even with palette tile selected)
    if (pendingRouteVehicleId && selectedVehicles.size > 0 && hasTile(gridX, gridY)) {
      const currentGrid = gridRef.current || grid;
      const updatedVehicles = { ...vehicles };
      let anyAssigned = false;

      selectedVehicles.forEach(id => {
        const v = updatedVehicles[id];
        if (!v) return;
        const vType = v.type || 'car';
        const dest = resolveDestinationPoint(gridX, gridY, currentGrid, vType);
        if (!dest) return;
        updatedVehicles[id] = {
          ...v,
          destination: dest,
          isMoving: true,
          turnIntent: null,
          randomTurning: false,
        };
        anyAssigned = true;
      });

      if (anyAssigned) {
        setVehicles(updatedVehicles);
        if (roomCode) {
          socket.emit('update-vehicles', { roomCode, vehicles: updatedVehicles });
        }
        setPendingRouteVehicleId(null);
      }
      return;
    }
    
    if (isPasting && clipboard) {
      const pasteOffset = getClipboardOffset();
      const newGrid = { ...grid };
      (Object.entries(clipboard) as [string, GridTile[]][]).forEach(([relKey, tiles]) => {
        const [rx, ry] = relKey.split(',').map(Number);
        const tx = gridX + rx - pasteOffset.x;
        const ty = gridY + ry - pasteOffset.y;
        const targetKey = `${tx},${ty}`;
        // Only apply if there are tiles in the clipboard cell (ignore empty cells)
        if (tiles && tiles.length > 0 && isWithinGridCanvas(tx, ty)) {
          newGrid[targetKey] = [...tiles];
        }
      });
      setGrid(newGrid);
      addToHistory(newGrid);
      setIsPasting(false);
      setPastePreviewPos(null);
      return;
    }

    if (!selectedTile) {
      // Handle placing selected vehicles if mode is active
      if (isPlacingVehicles && selectedVehicles.size > 0 && hasTile(gridX, gridY)) {
        const localX = worldX - gridX * GRID_SIZE;
        const localY = worldY - gridY * GRID_SIZE;
        const existingTiles = getTile(gridX, gridY)!;
        const targetTile = existingTiles[existingTiles.length - 1];
        
        let zIndex = 0;
        if (targetTile.type.includes('bridge') || targetTile.type.includes('trestle')) {
          zIndex = 1;
        }

        let lane = 1;
        let heading = targetTile.rotation;
        
        const relX = localX / GRID_SIZE;
        const relY = localY / GRID_SIZE;
        
        const is4Lane = targetTile.type.includes('4lane');
        const isOneWay = targetTile.type.includes('oneway');
        const isRail = targetTile.type.startsWith('rail');

        if (isRail) {
          lane = 0;
          if (targetTile.rotation === 0 || targetTile.rotation === 180) {
            heading = relY > 0.5 ? 0 : 180;
          } else {
            heading = relX < 0.5 ? 90 : 270;
          }
        } else if (isOneWay) {
          heading = targetTile.rotation;
          if (heading === 0 || heading === 180) {
            lane = relX > 0.5 ? 1 : -1;
            if (heading === 180) lane = -lane;
          } else {
            lane = relY > 0.5 ? -1 : 1;
            if (heading === 270) lane = -lane;
          }
        } else {
          if (targetTile.rotation === 0 || targetTile.rotation === 180 || targetTile.type.includes('cross')) {
            if (relX > 0.5) {
              heading = 0;
              lane = is4Lane ? (relX > 0.75 ? 2.5 : 1) : 1;
            } else {
              heading = 180;
              lane = is4Lane ? (relX < 0.25 ? 2.5 : 1) : 1;
            }
          } else {
            if (relY > 0.5) {
              heading = 90;
              lane = is4Lane ? (relY > 0.75 ? 2.5 : 1) : 1;
            } else {
              heading = 270;
              lane = is4Lane ? (relY < 0.25 ? 2.5 : 1) : 1;
            }
          }
        }

        const updatedVehicles = { ...vehicles };
        selectedVehicles.forEach(id => {
          if (updatedVehicles[id]) {
            updatedVehicles[id] = {
              ...updatedVehicles[id],
              x: gridX,
              y: gridY,
              heading,
              lane,
              progress: 0.5,
              zIndex
            };
          }
        });

        setVehicles(updatedVehicles);
        return;
      }

      // Click economy building (no palette selected) → open inspector
      if (!selectedTile && hasTile(gridX, gridY)) {
        const top = getTile(gridX, gridY)![getTile(gridX, gridY)!.length - 1];
        if (isEconomyBuilding(top.type)) {
          const anchorK = top.part === 'member' ? top.anchorKey : key;
          if (anchorK) {
            if (!economy.buildings[anchorK]) {
              const initCfg = createBuildingConfig(anchorK, top.type);
              const nextEco = { ...economy, buildings: { ...economy.buildings, [anchorK]: initCfg } };
              setEconomy(nextEco);
              if (roomCode) socket.emit('update-economy', { roomCode, economy: nextEco });
            }
            setInspectBuildingKey(anchorK);
            setShowLogistics(true);
            return;
          }
        }
      }

      // Spawn new single vehicle on alt-click
      if (e.altKey && hasTile(gridX, gridY)) {
        const localX = worldX - gridX * GRID_SIZE;
        const localY = worldY - gridY * GRID_SIZE;
        
        // Determine if we clicked a bridge or ground tile
        const existingTiles = getTile(gridX, gridY)!;
        let targetTile = existingTiles[existingTiles.length - 1];
        let zIndex = 0;
        
        // If there's a bridge, check if we clicked "high" or "low"
        // For simplicity, we'll check the top tile first. 
        // If it's a bridge, we're on zIndex 1.
        if (targetTile.type.includes('bridge') || targetTile.type.includes('trestle')) {
          zIndex = 1;
        }

        if (targetTile.type.startsWith('road') || targetTile.type.startsWith('rail') || targetTile.type.startsWith('parking-')) {
          // Determine lane and direction based on click position
          let lane = 1;
          let heading = targetTile.rotation;
          
          const relX = localX / GRID_SIZE;
          const relY = localY / GRID_SIZE;
          
          const is4Lane = targetTile.type.includes('4lane');
          const isOneWay = targetTile.type.includes('oneway');
          const isRail = targetTile.type.startsWith('rail');

          if (isRail) {
            lane = 0;
            if (targetTile.rotation === 0 || targetTile.rotation === 180) {
              heading = relY > 0.5 ? 0 : 180;
            } else {
              heading = relX < 0.5 ? 90 : 270;
            }
          } else if (isOneWay) {
            heading = targetTile.rotation;
            if (heading === 0 || heading === 180) {
              lane = relX > 0.5 ? 1 : -1;
              if (heading === 180) lane = -lane;
            } else {
              lane = relY > 0.5 ? -1 : 1;
              if (heading === 270) lane = -lane;
            }
          } else {
            if (targetTile.rotation === 0 || targetTile.rotation === 180 || targetTile.type.includes('cross') || targetTile.type.startsWith('parking-')) {
              if (relX > 0.5) {
                heading = 0;
                lane = is4Lane ? (relX > 0.75 ? 2.5 : 1) : 1;
              } else {
                heading = 180;
                lane = is4Lane ? (relX < 0.25 ? 2.5 : 1) : 1;
              }
            } else {
              if (relY > 0.5) {
                heading = 90;
                lane = is4Lane ? (relY > 0.75 ? 2.5 : 1) : 1;
              } else {
                heading = 270;
                lane = is4Lane ? (relY < 0.25 ? 2.5 : 1) : 1;
              }
            }
          }

          const newId = Math.random().toString(36).substring(2, 11);
          const newType = isRail ? 'train' : 'car';
          const newVehicle: Vehicle = {
            id: newId,
            type: newType,
            x: gridX,
            y: gridY,
            heading: heading,
            lane: lane,
            progress: 0.5,
            color: userColor,
            zIndex: zIndex,
            isMoving: false,
            speed: 1,
            turnAroundAtDeadEnd: true,
            randomTurning: true,
            turnIntent: ['left', 'right', 'straight'][Math.floor(Math.random() * 3)] as any,
            trailers: newType === 'semi' ? 1 : 0,
          };
          const updatedVehicles = { ...vehicles, [newId]: newVehicle };
          setVehicles(updatedVehicles);
          setSelectedVehicles(new Set([...selectedVehicles, newId]));
          if (roomCode) {
            socket.emit('update-vehicles', { roomCode, vehicles: updatedVehicles });
          }
        }
      }
      return;
    }

    if (e.shiftKey) {
      const newGrid = { ...grid };
      const clickedTiles = getTile(gridX, gridY) || [];
      if (clickedTiles && clickedTiles.length > 0) {
        const topTile = clickedTiles[clickedTiles.length - 1];
        const isMulti = topTile.type.startsWith('parking-') || 
          topTile.type === 'building-strip-mall' || topTile.type === 'building-lumbermill' ||
          topTile.type === 'building-apartment' || topTile.type === 'building-highschool' ||
          topTile.type === 'building-college' || topTile.type === 'building-university' ||
          topTile.type === 'building-large-park' || topTile.type === 'building-warehouse-large' ||
          topTile.type === 'building-factory-large' || topTile.type === 'building-train-station-large';
        if (isMulti) {
          const anchorKey = topTile.part === 'member' ? topTile.anchorKey : key;
          if (anchorKey) {
            const [ax, ay] = anchorKey.split(',').map(Number);
            const anchorTiles = getTile(ax, ay) || [];
            if (anchorTiles && anchorTiles.length > 0) {
              const anchorTile = anchorTiles[anchorTiles.length - 1];
              const cells = getMultiTileCells(anchorTile.type, anchorTile.rotation);
              cells.forEach(cell => {
                const targetKey = `${ax + cell.dx},${ay + cell.dy}`;
                delete newGrid[targetKey];
              });
            } else {
              delete newGrid[key];
            }
          } else {
            delete newGrid[key];
          }
        } else {
          delete newGrid[key];
        }
      } else {
        delete newGrid[key];
      }
      setGrid(newGrid);
      addToHistory(newGrid);
    } else if (!isWithinGridCanvas(gridX, gridY)) {
      return;
    } else {
      const newGrid = { ...grid };
      
      const isBuilding = selectedTile.startsWith('building-');
      const isMultiTile = selectedTile.startsWith('parking-') || 
        selectedTile === 'building-strip-mall' || selectedTile === 'building-lumbermill' ||
        selectedTile === 'building-apartment' || selectedTile === 'building-highschool' ||
        selectedTile === 'building-college' || selectedTile === 'building-university' ||
        selectedTile === 'building-large-park' || selectedTile === 'building-warehouse-large' ||
        selectedTile === 'building-factory-large' || selectedTile === 'building-train-station-large';
      if (isMultiTile) {
        const { w, h } = getMultiTileDimensions(selectedTile);
        const cells = getMultiTileCells(selectedTile, rotation);
        if (!cells.every(cell => isWithinGridCanvas(gridX + cell.dx, gridY + cell.dy))) {
          return;
        }
        cells.forEach(cell => {
          const targetKey = `${gridX + cell.dx},${gridY + cell.dy}`;
          const newTile: GridTile = {
            type: selectedTile,
            rotation: rotation,
            part: cell.isAnchor ? 'anchor' : 'member',
            localX: cell.localX,
            localY: cell.localY,
            w,
            h,
            anchorKey: `${gridX},${gridY}`
          };
          newGrid[targetKey] = [newTile];
        });
        if (isEconomyBuilding(selectedTile)) {
          const ak = `${gridX},${gridY}`;
          if (!economy.buildings[ak]) {
            const initCfg = createBuildingConfig(ak, selectedTile);
            const nextEco = { ...economy, buildings: { ...economy.buildings, [ak]: initCfg } };
            setEconomy(nextEco);
            if (roomCode) socket.emit('update-economy', { roomCode, economy: nextEco });
          }
        }
      } else {
        const existingTiles = getTile(gridX, gridY) || [];
        
        const isTree = selectedTile.startsWith('tree-');
        const finalRotation = (isBuilding || isTree) ? 0 : rotation;
        
        const newTile: GridTile = {
          type: selectedTile,
          rotation: finalRotation,
          ...(selectedTile === 'tree-pine-seedling' ? { growthProgress: 0 } : {}),
        };
        
        const BRIDGE_TILE_TYPES = ['road-bridge', 'road-oneway-bridge', 'rail-trestle', 'road-4lane-bridge'] as const;
        const isNewBridge = BRIDGE_TILE_TYPES.includes(selectedTile as typeof BRIDGE_TILE_TYPES[number]);
        const hasLowerSection = existingTiles.some(t => 
          t.type.startsWith('road-') || t.type.startsWith('rail-')
        ) && !existingTiles.some(t => BRIDGE_TILE_TYPES.includes(t.type as typeof BRIDGE_TILE_TYPES[number]));

        if (isNewBridge && hasLowerSection) {
          // Stack bridge on top of existing road/rail
          newGrid[key] = [...existingTiles, newTile];
        } else if (!isNewBridge && existingTiles.some(t => BRIDGE_TILE_TYPES.includes(t.type as typeof BRIDGE_TILE_TYPES[number]))) {
          // If placing road/rail under a bridge
          const isNewRoadRail = selectedTile.startsWith('road-') || selectedTile.startsWith('rail-');
          if (isNewRoadRail) {
            newGrid[key] = [newTile, ...existingTiles.filter(t => BRIDGE_TILE_TYPES.includes(t.type as typeof BRIDGE_TILE_TYPES[number]))];
          } else {
            newGrid[key] = [newTile];
          }
        } else {
          // Default replacement
          newGrid[key] = [newTile];
        }
      }

      if (isBuilding && isEconomyBuilding(selectedTile)) {
        const ak = key;
        if (!economy.buildings[ak]) {
          const initCfg = createBuildingConfig(ak, selectedTile);
          const nextEco = { ...economy, buildings: { ...economy.buildings, [ak]: initCfg } };
          setEconomy(nextEco);
          if (roomCode) socket.emit('update-economy', { roomCode, economy: nextEco });
        }
      }

      setGrid(newGrid);
      addToHistory(newGrid);
    }
  };

  const clearGrid = () => {
    setGrid({});
    addToHistory({});
  };

  const exportGrid = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(grid));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "gridcity_layout.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const importGrid = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        setClipboard(data);
        setIsPasting(true);
        setSelectedTile(null);
      } catch (err) {
        console.error('Failed to parse imported file', err);
      }
    };
    reader.readAsText(file);
    // Reset input
    e.target.value = '';
  };

  const randomLandscaping = (baseGrid?: GridData) => {
    const currentGrid = baseGrid || grid;
    const newGrid = { ...currentGrid };
    const landscapables = PALETTE_TILES.filter(t => t.category === 'landscape').map(t => t.type);
    const buildings = PALETTE_TILES.filter(t => t.category === 'building').map(t => t.type);
    
    // Rules: which tiles can be adjacent to each other
    const rules: Record<string, string[]> = {
      'grass-plain': ['grass-plain', 'grass-tall', 'grass-flowers', 'tree-pine', 'tree-pine-seedling', 'tree-oak', 'landscape-gravel', 'landscape-sand', ...buildings],
      'grass-tall': ['grass-plain', 'grass-tall', 'grass-flowers'],
      'grass-flowers': ['grass-plain', 'grass-tall', 'grass-flowers'],
      'tree-pine': ['grass-plain', 'tree-pine', 'tree-pine-seedling', 'tree-oak'],
      'tree-pine-seedling': ['grass-plain', 'tree-pine', 'tree-pine-seedling', 'tree-oak'],
      'tree-oak': ['grass-plain', 'tree-pine', 'tree-pine-seedling', 'tree-oak'],
      'landscape-gravel': ['grass-plain', 'landscape-gravel', 'landscape-sand'],
      'landscape-sand': ['grass-plain', 'landscape-gravel', 'landscape-sand'],
    };
    buildings.forEach(b => {
      rules[b] = ['grass-plain'];
    });

    const weights: Record<string, number> = {
      'grass-plain': 20,
      'grass-tall': 8,
      'grass-flowers': 5,
      'tree-pine': 6,
      'tree-pine-seedling': 2,
      'tree-oak': 6,
      'landscape-gravel': 3,
      'landscape-sand': 3,
    };
    buildings.forEach(b => {
      weights[b] = 2; // Low weight for buildings in landscaping
    });

    // Determine bounds
    let minX: number, minY: number, maxX: number, maxY: number;
    if (selectionStart && selectionEnd) {
      minX = Math.min(selectionStart.x, selectionEnd.x);
      maxX = Math.max(selectionStart.x, selectionEnd.x);
      minY = Math.min(selectionStart.y, selectionEnd.y);
      maxY = Math.max(selectionStart.y, selectionEnd.y);
    } else {
      minX = -10; minY = -10; maxX = 10; maxY = 10;
      const keys = Object.keys(currentGrid);
      if (keys.length > 0) {
        keys.forEach(key => {
          const [x, y] = key.split(',').map(Number);
          minX = Math.min(minX, x - 5);
          minY = Math.min(minY, y - 5);
          maxX = Math.max(maxX, x + 5);
          maxY = Math.max(maxY, y + 5);
        });
      }
    }

    // Limit size to avoid performance issues (WFC is O(N^2) or worse depending on propagation)
    const rangeX = maxX - minX;
    const rangeY = maxY - minY;
    if (rangeX * rangeY > 1600) { // Max 40x40 area
      const centerX = Math.floor((minX + maxX) / 2);
      const centerY = Math.floor((minY + maxY) / 2);
      minX = centerX - 20;
      maxX = centerX + 20;
      minY = centerY - 20;
      maxY = centerY + 20;
    }

    ({ minX, minY, maxX, maxY } = clampBoundsToCanvas(minX, minY, maxX, maxY));
    if (maxX < minX || maxY < minY) return baseGrid || currentGrid;

    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    const wave: string[][] = Array(width * height).fill(null).map(() => [...landscapables, ...buildings]);
    const collapsed: (string | null)[] = Array(width * height).fill(null);

    // Fill in existing landscape tiles if any (to seed the WFC)
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const key = `${x},${y}`;
        const idx = (x - minX) + (y - minY) * width;
        if (currentGrid[key]) {
          const topTile = currentGrid[key][currentGrid[key].length - 1];
          if (landscapables.includes(topTile.type)) {
            collapsed[idx] = topTile.type;
            wave[idx] = [topTile.type];
          } else {
             // Non-landscape tiles act as "grass-plain" for constraint purposes
             collapsed[idx] = 'grass-plain';
             wave[idx] = ['grass-plain'];
          }
        }
      }
    }

    const getNeighbors = (idx: number) => {
      const x = idx % width;
      const y = Math.floor(idx / width);
      const neighbors = [];
      if (x > 0) neighbors.push(idx - 1);
      if (x < width - 1) neighbors.push(idx + 1);
      if (y > 0) neighbors.push(idx - width);
      if (y < height - 1) neighbors.push(idx + width);
      return neighbors;
    };

    const propagate = (startIdx: number) => {
      const stack = [startIdx];
      while (stack.length > 0) {
        const curr = stack.pop()!;
        const currOptions = wave[curr];
        
        for (const neighbor of getNeighbors(curr)) {
          if (collapsed[neighbor]) continue;
          
          const neighborOptions = wave[neighbor];
          const nextNeighborOptions = neighborOptions.filter(opt => {
            return currOptions.some(currOpt => rules[currOpt].includes(opt));
          });

          if (nextNeighborOptions.length < neighborOptions.length) {
            wave[neighbor] = nextNeighborOptions;
            stack.push(neighbor);
          }
        }
      }
    };

    // Initial propagation
    for (let i = 0; i < collapsed.length; i++) {
      if (collapsed[i]) propagate(i);
    }

    while (true) {
      let minEntropy = Infinity;
      let targetIdx = -1;
      
      for (let i = 0; i < wave.length; i++) {
        if (collapsed[i]) continue;
        const entropy = wave[i].length;
        if (entropy === 0) continue;
        if (entropy > 1 && entropy < minEntropy) {
          minEntropy = entropy;
          targetIdx = i;
        } else if (entropy > 1 && entropy === minEntropy && Math.random() > 0.5) {
          targetIdx = i;
        }
      }

      if (targetIdx === -1) {
        // Find any uncollapsed cell with options
        for (let i = 0; i < wave.length; i++) {
          if (!collapsed[i] && wave[i].length > 0) {
            targetIdx = i;
            break;
          }
        }
      }

      if (targetIdx === -1) break;

      const options = wave[targetIdx];
      const totalWeight = options.reduce((sum, opt) => sum + weights[opt], 0);
      let r = Math.random() * totalWeight;
      let choice = options[0];
      for (const opt of options) {
        r -= weights[opt];
        if (r <= 0) {
          choice = opt;
          break;
        }
      }

      collapsed[targetIdx] = choice;
      wave[targetIdx] = [choice];
      propagate(targetIdx);
    }

    let added = false;
    for (let i = 0; i < collapsed.length; i++) {
      const x = (i % width) + minX;
      const y = Math.floor(i / width) + minY;
      const key = `${x},${y}`;
      
      if (!currentGrid[key] && !grid[key] && collapsed[i]) {
        const tileType = collapsed[i] as TileType;
        const isTree = tileType.startsWith('tree-');
        const isBuilding = tileType.startsWith('building-');
        newGrid[key] = [{ 
          type: tileType, 
          rotation: (isTree || isBuilding) ? 0 : Math.floor(Math.random() * 4) * 90,
          ...(tileType === 'tree-pine-seedling' ? { growthProgress: 0 } : {}),
        }];
        added = true;
      }
    }

    if (added && !baseGrid) {
      setGrid(newGrid);
      addToHistory(newGrid);
    }
    return newGrid;
  };

  const generateMap = (density: 'dense' | 'sparse' | 'very-sparse' | 'extremely-sparse' = 'sparse') => {
    // 1. Roads
    const roadGrid = randomRoads(density, grid);
    // 2. Rails
    const railGrid = randomRails('extremely-sparse', roadGrid);
    // 3. Landscaping
    const finalGrid = randomLandscaping(railGrid);
    
    setGrid(finalGrid);
    addToHistory(finalGrid);
  };

  const randomRoads = (density: 'dense' | 'sparse' | 'very-sparse' | 'extremely-sparse' = 'sparse', baseGrid?: GridData) => {
    const newGrid = baseGrid ? { ...baseGrid } : { ...grid };
    
    // 1. Determine Bounds
    let minX: number, minY: number, maxX: number, maxY: number;
    if (selectionStart && selectionEnd) {
      minX = Math.min(selectionStart.x, selectionEnd.x);
      maxX = Math.max(selectionStart.x, selectionEnd.x);
      minY = Math.min(selectionStart.y, selectionEnd.y);
      maxY = Math.max(selectionStart.y, selectionEnd.y);
    } else {
      minX = -8; maxX = 8; minY = -8; maxY = 8;
      const keys = Object.keys(baseGrid || grid);
      if (keys.length > 0) {
        keys.forEach(key => {
          const [x, y] = key.split(',').map(Number);
          minX = Math.min(minX, x - 2);
          maxX = Math.max(maxX, x + 2);
          minY = Math.min(minY, y - 2);
          maxY = Math.max(maxY, y + 2);
        });
      }
    }

    ({ minX, minY, maxX, maxY } = clampBoundsToCanvas(minX, minY, maxX, maxY));
    if (maxX < minX || maxY < minY) return newGrid;

    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    if (width <= 0 || height <= 0) return;

    // 2. Generate Skeleton (Infrastructure Map)
    // Values: 'road2', 'road4'
    const skeleton: Record<string, 'road2' | 'road4'> = {};
    
    const getDist = (x1: number, y1: number, x2: number, y2: number) => Math.abs(x1 - x2) + Math.abs(y1 - y2);

    const connectPoints = (p1: {x: number, y: number}, p2: {x: number, y: number}, type: 'road2' | 'road4') => {
      let curr = { ...p1 };
      while (curr.x !== p2.x || curr.y !== p2.y) {
        skeleton[`${curr.x},${curr.y}`] = type;
        const dx = Math.sign(p2.x - curr.x);
        const dy = Math.sign(p2.y - curr.y);
        
        if (curr.x !== p2.x && (curr.y === p2.y || Math.random() > 0.5)) {
          curr.x += dx;
        } else {
          curr.y += dy;
        }
      }
      skeleton[`${p2.x},${p2.y}`] = type;
    };

    // Pick Hubs based on density
    const densityMap = {
      'dense': 20,
      'sparse': 40,
      'very-sparse': 70,
      'extremely-sparse': 100
    };
    const hubs: {x: number, y: number}[] = [];
    const hubCount = Math.max(2, Math.floor((width * height) / densityMap[density]));
    for (let i = 0; i < hubCount; i++) {
      hubs.push({
        x: Math.floor(Math.random() * width) + minX,
        y: Math.floor(Math.random() * height) + minY
      });
    }

    // Connect Hubs in a chain or MST-like fashion
    for (let i = 0; i < hubs.length - 1; i++) {
      const type = Math.random() > 0.5 ? 'road4' : 'road2';
      connectPoints(hubs[i], hubs[i+1], type);
    }

    // Add some random spurs
    hubs.forEach(hub => {
      if (Math.random() > 0.5) {
        const length = Math.floor(Math.random() * 4) + 2;
        const dir = Math.floor(Math.random() * 4);
        const dx = [0, 1, 0, -1][dir];
        const dy = [-1, 0, 1, 0][dir];
        let curr = { ...hub };
        const type = skeleton[`${hub.x},${hub.y}`] || 'road2';
        for (let i = 0; i < length; i++) {
          curr.x += dx;
          curr.y += dy;
          if (curr.x < minX || curr.x > maxX || curr.y < minY || curr.y > maxY) break;
          skeleton[`${curr.x},${curr.y}`] = type;
        }
      }
    });

    // 3. Determine Tile Types and Rotations
    const getNeighbors = (x: number, y: number, type: string) => {
      const n = skeleton[`${x},${y-1}`] === type;
      const e = skeleton[`${x+1},${y}`] === type;
      const s = skeleton[`${x},${y+1}`] === type;
      const w = skeleton[`${x-1},${y}`] === type;
      return [n, e, s, w];
    };

    const resolveTile = (x: number, y: number, infraType: 'road2' | 'road4' | 'rail'): { type: TileType, rotation: number } => {
      const [n, e, s, w] = getNeighbors(x, y, infraType);
      const count = [n, e, s, w].filter(Boolean).length;
      const prefix = infraType === 'rail' ? 'rail' : (infraType === 'road4' ? 'road-4lane' : 'road');

      if (count === 4) return { type: `${prefix}-cross` as TileType, rotation: 0 };
      if (count === 3) {
        if (!n) return { type: `${prefix}-t` as TileType, rotation: 90 };
        if (!e) return { type: `${prefix}-t` as TileType, rotation: 180 };
        if (!s) return { type: `${prefix}-t` as TileType, rotation: 270 };
        return { type: `${prefix}-t` as TileType, rotation: 0 };
      }
      if (count === 2) {
        if (n && s) return { type: `${prefix}-straight` as TileType, rotation: 0 };
        if (e && w) return { type: `${prefix}-straight` as TileType, rotation: 90 };
        if (n && e) return { type: `${prefix}-curve` as TileType, rotation: 90 };
        if (e && s) return { type: `${prefix}-curve` as TileType, rotation: 180 };
        if (s && w) return { type: `${prefix}-curve` as TileType, rotation: 270 };
        if (w && n) return { type: `${prefix}-curve` as TileType, rotation: 0 };
      }
      if (count === 1) {
        if (n) return { type: `${prefix}-end` as TileType, rotation: 180 };
        if (e) return { type: `${prefix}-end` as TileType, rotation: 270 };
        if (s) return { type: `${prefix}-end` as TileType, rotation: 0 };
        if (w) return { type: `${prefix}-end` as TileType, rotation: 90 };
      }
      return { type: `${prefix}-straight` as TileType, rotation: 0 };
    };

    // 4. Apply Infrastructure
    let added = false;
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const key = `${x},${y}`;
        if (grid[key] || (baseGrid && baseGrid[key])) continue;

        if (skeleton[key]) {
          const { type, rotation } = resolveTile(x, y, skeleton[key]);
          newGrid[key] = [{ type, rotation }];
          added = true;
        }
      }
    }

    if (added && !baseGrid) {
      setGrid(newGrid);
      addToHistory(newGrid);
    }
    return newGrid;
  };

  const randomRails = (density: 'dense' | 'sparse' | 'very-sparse' | 'extremely-sparse' = 'extremely-sparse', baseGrid?: GridData) => {
    const newGrid = baseGrid ? { ...baseGrid } : { ...grid };
    
    // 1. Determine Bounds
    let minX: number, minY: number, maxX: number, maxY: number;
    if (selectionStart && selectionEnd) {
      minX = Math.min(selectionStart.x, selectionEnd.x);
      maxX = Math.max(selectionStart.x, selectionEnd.x);
      minY = Math.min(selectionStart.y, selectionEnd.y);
      maxY = Math.max(selectionStart.y, selectionEnd.y);
    } else {
      minX = -8; maxX = 8; minY = -8; maxY = 8;
      const keys = Object.keys(baseGrid || grid);
      if (keys.length > 0) {
        keys.forEach(key => {
          const [x, y] = key.split(',').map(Number);
          minX = Math.min(minX, x - 2);
          maxX = Math.max(maxX, x + 2);
          minY = Math.min(minY, y - 2);
          maxY = Math.max(maxY, y + 2);
        });
      }
    }

    ({ minX, minY, maxX, maxY } = clampBoundsToCanvas(minX, minY, maxX, maxY));
    if (maxX < minX || maxY < minY) return newGrid;

    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    if (width <= 0 || height <= 0) return;

    // 2. Generate Skeleton (Infrastructure Map)
    const skeleton: Record<string, 'rail'> = {};
    
    const connectPoints = (p1: {x: number, y: number}, p2: {x: number, y: number}) => {
      let curr = { ...p1 };
      while (curr.x !== p2.x || curr.y !== p2.y) {
        skeleton[`${curr.x},${curr.y}`] = 'rail';
        const dx = Math.sign(p2.x - curr.x);
        const dy = Math.sign(p2.y - curr.y);
        if (curr.x !== p2.x && (curr.y === p2.y || Math.random() > 0.5)) {
          curr.x += dx;
        } else {
          curr.y += dy;
        }
      }
      skeleton[`${p2.x},${p2.y}`] = 'rail';
    };

    // Pick Hubs based on density
    const densityMap = {
      'dense': 20,
      'sparse': 40,
      'very-sparse': 70,
      'extremely-sparse': 100
    };
    const hubs: {x: number, y: number}[] = [];
    const hubCount = Math.max(2, Math.floor((width * height) / densityMap[density]));
    for (let i = 0; i < hubCount; i++) {
      hubs.push({
        x: Math.floor(Math.random() * width) + minX,
        y: Math.floor(Math.random() * height) + minY
      });
    }

    for (let i = 0; i < hubs.length - 1; i++) {
      connectPoints(hubs[i], hubs[i+1]);
    }

    // 3. Determine Tile Types and Rotations
    const getNeighbors = (x: number, y: number) => {
      const n = skeleton[`${x},${y-1}`] === 'rail';
      const e = skeleton[`${x+1},${y}`] === 'rail';
      const s = skeleton[`${x},${y+1}`] === 'rail';
      const w = skeleton[`${x-1},${y}`] === 'rail';
      return [n, e, s, w];
    };

    const resolveTile = (x: number, y: number): { type: TileType, rotation: number } => {
      const [n, e, s, w] = getNeighbors(x, y);
      const count = [n, e, s, w].filter(Boolean).length;
      const prefix = 'rail';

      if (count === 4) return { type: `${prefix}-cross` as TileType, rotation: 0 };
      if (count === 3) {
        if (!n) return { type: `${prefix}-t` as TileType, rotation: 90 };
        if (!e) return { type: `${prefix}-t` as TileType, rotation: 180 };
        if (!s) return { type: `${prefix}-t` as TileType, rotation: 270 };
        return { type: `${prefix}-t` as TileType, rotation: 0 };
      }
      if (count === 2) {
        if (n && s) return { type: `${prefix}-straight` as TileType, rotation: 0 };
        if (e && w) return { type: `${prefix}-straight` as TileType, rotation: 90 };
        if (n && e) return { type: `${prefix}-curve` as TileType, rotation: 90 };
        if (e && s) return { type: `${prefix}-curve` as TileType, rotation: 180 };
        if (s && w) return { type: `${prefix}-curve` as TileType, rotation: 270 };
        if (w && n) return { type: `${prefix}-curve` as TileType, rotation: 0 };
      }
      if (count === 1) {
        if (n) return { type: `${prefix}-end` as TileType, rotation: 180 };
        if (e) return { type: `${prefix}-end` as TileType, rotation: 270 };
        if (s) return { type: `${prefix}-end` as TileType, rotation: 0 };
        if (w) return { type: `${prefix}-end` as TileType, rotation: 90 };
      }
      return { type: `${prefix}-straight` as TileType, rotation: 0 };
    };

    // 4. Apply Rails
    let added = false;
    for (const key in skeleton) {
      const [x, y] = key.split(',').map(Number);
      
      // Never overwrite non-empty cells
      if (grid[key] || (baseGrid && baseGrid[key])) continue;

      const { type, rotation } = resolveTile(x, y);
      newGrid[key] = [{ type, rotation }];
      added = true;
    }

    if (added && !baseGrid) {
      setGrid(newGrid);
      addToHistory(newGrid);
    }
    return newGrid;
  };
  const effectiveSidebarWidth = showSidebar ? SIDEBAR_WIDTH : 0;
  const worldX = (mousePos.x - effectiveSidebarWidth - offset.x) / zoom;
  const worldY = (mousePos.y - offset.y) / zoom;
  const gridX = Math.floor(worldX / GRID_SIZE);
  const gridY = Math.floor(worldY / GRID_SIZE);

  const selectedVehiclesList = Array.from(selectedVehicles);
  const activeCountIsMoving = selectedVehiclesList.filter(id => vehicles[id]?.isMoving).length;
  const isMovingActive = selectedVehicles.size > 0 && activeCountIsMoving >= selectedVehicles.size / 2;

  const activeCountTurnAround = selectedVehiclesList.filter(id => vehicles[id]?.turnAroundAtDeadEnd).length;
  const isTurnAroundActive = selectedVehicles.size > 0 && activeCountTurnAround >= selectedVehicles.size / 2;

  const activeCountRandomTurn = selectedVehiclesList.filter(id => vehicles[id]?.randomTurning).length;
  const isRandomTurnActive = selectedVehicles.size > 0 && activeCountRandomTurn >= selectedVehicles.size / 2;

  const selectedHaveDestination = selectedVehiclesList.some(id => vehicles[id]?.destination);
  const isDestinationToggleActive = !!pendingRouteVehicleId || selectedHaveDestination;
  const isParkNextActive = selectedVehiclesList.some(id => vehicles[id]?.parkOnNextLot);
  const selectedSemiIds = getSelectedSemiIds(selectedVehicles, vehicles);

  const carsFilteredSelection = filterSelectionByPanelType(selectedVehicles, vehicles, 'car');
  const semiFilteredSelection = filterSelectionByPanelType(selectedVehicles, vehicles, 'semi');
  const trainFilteredSelection = filterSelectionByPanelType(selectedVehicles, vehicles, 'train');

  const carsList = (Object.values(vehicles) as Vehicle[]).filter(v => vehicleMatchesPanelType(v, 'car'));
  const semisList = (Object.values(vehicles) as Vehicle[]).filter(v => vehicleMatchesPanelType(v, 'semi'));
  const trainsList = (Object.values(vehicles) as Vehicle[]).filter(v => vehicleMatchesPanelType(v, 'train'));
  const parkedTrailersList = Object.values(economy.parkedTrailers || {});

  const toggleCarsPanel = () => {
    setShowCarsPanel(p => !p);
    setShowSemiTrailerPanel(false);
    setShowTrainPanel(false);
  };
  const toggleSemiTrailerPanel = () => {
    setShowSemiTrailerPanel(p => !p);
    setShowCarsPanel(false);
    setShowTrainPanel(false);
  };
  const toggleTrainPanel = () => {
    setShowTrainPanel(p => !p);
    setShowCarsPanel(false);
    setShowSemiTrailerPanel(false);
  };

  const renderVehicleListItem = (v: Vehicle) => {
    const cargoTotals = getVehicleCargoTotals(v);
    return (
      <label key={v.id} className="flex items-center gap-3 p-3 hover:bg-slate-50 border-b border-slate-50 cursor-pointer">
        <input
          type="checkbox"
          checked={selectedVehicles.has(v.id)}
          onChange={(e) => {
            const newSet = new Set(selectedVehicles);
            if (e.target.checked) newSet.add(v.id);
            else newSet.delete(v.id);
            setSelectedVehicles(newSet);
          }}
          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
        />
        <div className="w-4 h-4 rounded-full shadow-inner shrink-0" style={{ backgroundColor: v.color }} />
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <VehicleTypeIcon type={v.type} />
            <span className="text-xs font-mono text-slate-500 truncate">{v.id}</span>
            {v.destination && (
              <span className="text-[9px] text-blue-500 shrink-0">→{v.destination.x},{v.destination.y}</span>
            )}
          </div>
          {cargoTotals.length > 0 && (
            <div className="flex flex-wrap gap-1 pl-5">
              {cargoTotals.map(([itemId, qty]) => (
                <span key={itemId} className="text-[9px] text-slate-500 font-mono">
                  {getItemIdLabel(itemId, economy.itemDefs)}×{qty}
                </span>
              ))}
            </div>
          )}
        </div>
      </label>
    );
  };

  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden font-sans text-slate-900 select-none">
      <AnimatePresence>
        {!roomCode && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-[2.5rem] p-10 shadow-2xl max-w-md w-full text-center border border-white/20"
            >
              <div className="bg-blue-600 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-lg shadow-blue-200">
                <MapIcon className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-3xl font-black text-slate-900 mb-3 tracking-tight">Grid City Collaborative</h2>
              <p className="text-slate-500 mb-10 text-lg leading-relaxed">
                Design cities together in real-time. Create a new room or join an existing one.
              </p>

              <div className="space-y-6">
                <div className="space-y-4">
                  <button 
                    onClick={createRoom}
                    className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-xl shadow-blue-200 flex items-center justify-center gap-3"
                  >
                    <Plus className="w-5 h-5" />
                    Create New Room
                  </button>

                  <div className="relative flex items-center py-2">
                    <div className="flex-grow border-t border-slate-100"></div>
                    <span className="flex-shrink mx-4 text-slate-300 text-[10px] font-bold uppercase tracking-[0.2em]">or join existing</span>
                    <div className="flex-grow border-t border-slate-100"></div>
                  </div>

                  <div className="flex gap-2">
                    <input 
                      type="text"
                      placeholder="ROOM CODE"
                      value={tempRoomCode}
                      onChange={(e) => setTempRoomCode(e.target.value.toUpperCase())}
                      onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
                      className="flex-1 py-4 px-6 bg-slate-50 border-2 border-slate-100 rounded-2xl text-center text-xl font-black tracking-widest focus:outline-none focus:border-blue-500 transition-all uppercase"
                      maxLength={6}
                    />
                    <button 
                      onClick={joinRoom}
                      disabled={!tempRoomCode.trim()}
                      className="bg-slate-900 text-white px-6 rounded-2xl font-bold hover:bg-slate-800 disabled:opacity-30 transition-all"
                    >
                      Join
                    </button>
                  </div>
                </div>

                {availableRooms.length > 0 && (
                  <div className="mt-6 text-left">
                     <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-2 mb-2">Previous Rooms</p>
                     <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                       {availableRooms.map(room => (
                          <div key={room.id} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl p-3 hover:border-blue-200 hover:bg-blue-50/50 transition-colors group cursor-pointer" onClick={() => setRoomCode(room.id)}>
                            <div className="flex flex-col items-start px-2">
                               <span className="font-bold text-slate-700 tracking-wider flex items-center">{room.id}</span>
                              {room.updatedAt && <span className="text-[10px] text-slate-400">{new Date(room.updatedAt).toLocaleString()}</span>}
                            </div>
                            <button 
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                if (window.confirm(`Are you sure you want to delete room ${room.id}?`)) {
                                  socket.emit('delete-room', room.id);
                                }
                              }} 
                              className="p-2 text-slate-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                              title="Delete Room"
                            >
                               <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                       ))}
                     </div>
                  </div>
                )}

                {authError && (
                  <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-left relative">
                    <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1">Notice</p>
                    <p className="text-xs text-amber-700 leading-tight pr-6">{authError}</p>
                    <button onClick={() => setAuthError(null)} className="absolute top-3 right-3 text-amber-300 hover:text-amber-500">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Sidebar Palette */}
      <motion.div
        initial={false}
        animate={{ width: showSidebar ? SIDEBAR_WIDTH : 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 35 }}
        className="shrink-0 overflow-hidden bg-white border-r border-slate-200 z-20 shadow-xl"
        data-grid-control
        {...blockGridPointerEvents}
      >
        <div className="w-72 h-full flex flex-col overscroll-contain">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center justify-between mb-4 gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-800 flex items-center gap-2 min-w-0">
              <MapIcon className="w-6 h-6 text-blue-600 shrink-0" />
              <span className="truncate">Grid City</span>
            </h1>
            <button
              type="button"
              onClick={() => setShowSidebar(false)}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
              title="Hide panel"
            >
              <PanelLeftClose className="w-5 h-5" />
            </button>
          </div>

          {roomCode && (
            <div className="flex items-center justify-between bg-blue-50/50 p-2.5 rounded-xl border border-blue-100 mb-4 group transition-all hover:bg-blue-50">
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  <div className="absolute inset-0 w-2 h-2 rounded-full bg-blue-400 animate-ping opacity-75" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-blue-400 uppercase tracking-[0.2em] leading-none mb-1">Active Room</span>
                  <span className="text-sm font-black text-blue-700 tracking-widest leading-none">{roomCode}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(roomCode);
                    // Optional: add a toast or temporary icon change
                  }}
                  className="p-2 text-blue-400 hover:text-blue-600 hover:bg-white rounded-lg transition-all"
                  title="Copy Room Code"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button 
                  onClick={() => setRoomCode(null)}
                  className="p-2 text-blue-400 hover:text-red-500 hover:bg-white rounded-lg transition-all"
                  title="Leave Room"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {authError && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-100 rounded-xl relative group">
              <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1">Auth Notice</p>
              <p className="text-[10px] text-amber-500 leading-tight pr-4">{authError}</p>
              <button onClick={() => setAuthError(null)} className="absolute top-2 right-2 text-amber-300 hover:text-amber-500">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

        </div>

        <div className="flex border-b border-slate-100">
          <button 
            onClick={() => setActiveCategory('road')}
            className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${activeCategory === 'road' ? 'border-blue-500 text-blue-600 bg-blue-50/50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <Route className="w-4 h-4 mx-auto mb-1" />
            Roads
          </button>
          <button 
            onClick={() => setActiveCategory('rail')}
            className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${activeCategory === 'rail' ? 'border-blue-500 text-blue-600 bg-blue-50/50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <Train className="w-4 h-4 mx-auto mb-1" />
            Rails
          </button>
          <button 
            onClick={() => setActiveCategory('building')}
            className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${activeCategory === 'building' ? 'border-blue-500 text-blue-600 bg-blue-50/50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <Layers className="w-4 h-4 mx-auto mb-1" />
            Build
          </button>
          <button 
            onClick={() => setActiveCategory('landscape')}
            className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${activeCategory === 'landscape' ? 'border-blue-500 text-blue-600 bg-blue-50/50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <MapIcon className="w-4 h-4 mx-auto mb-1" />
            Land
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain p-4 content-start space-y-6">
          <div className="grid grid-cols-4 gap-2">
            {PALETTE_TILES.filter(t => t.category === activeCategory).map((tile) => (
              <button
                key={tile.type}
                onClick={() => setSelectedTile(tile.type)}
                className={`p-1 rounded-xl border-2 transition-all flex flex-col items-center gap-1 group ${
                  selectedTile === tile.type 
                  ? 'border-blue-500 bg-blue-50 shadow-sm' 
                  : 'border-slate-100 hover:border-slate-300 bg-white'
                }`}
                title={tile.label}
              >
                <div className="bg-slate-50 rounded-lg p-1 group-hover:scale-110 transition-transform">
                  <Tile type={tile.type} size={32} />
                </div>
              </button>
            ))}
          </div>

          {/* Library Section */}
          <div className="pt-4 border-t border-slate-100 flex flex-col pt-0">
            <div className="flex gap-2 px-1 mt-3">
              <button
                onClick={exportLibraries}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-xs font-medium transition-colors"
                title="Export Libraries to Zip"
              >
                <Download className="w-3 h-3" />
                Export
              </button>
              <label className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-green-50 hover:bg-green-100 text-green-600 rounded-lg text-xs font-medium transition-colors cursor-pointer" title="Import Libraries from Zip">
                <Upload className="w-3 h-3" />
                Import
                <input type="file" accept=".zip" className="hidden" onChange={importLibraries} />
              </label>
            </div>
            
            <div className="flex border-b border-slate-100 mt-2 mb-2">
              <button 
                onClick={() => setLibraryTab('layouts')}
                className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${libraryTab === 'layouts' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
              >
                Layouts
              </button>
              <button 
                onClick={() => setLibraryTab('simulations')}
                className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${libraryTab === 'simulations' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
              >
                Sims
              </button>
            </div>
            
            {libraryTab === 'layouts' ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="Layout name..."
                    value={newLayoutName}
                    onChange={(e) => setNewLayoutName(e.target.value)}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                  <button 
                    onClick={(e) => {
                      e.preventDefault();
                      saveToLibrary(false);
                    }}
                    disabled={!newLayoutName.trim()}
                    className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 disabled:opacity-30 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                  {library.length === 0 ? (
                    <p className="text-[10px] text-slate-400 italic text-center py-4">No saved layouts yet</p>
                  ) : (
                    library.map((item, index) => (
                      <div key={index} className="group flex items-center justify-between bg-white border border-slate-100 rounded-lg p-2 hover:border-blue-200 transition-colors">
                        <button 
                          onClick={() => loadFromLibrary(item.data)}
                          className="flex-1 text-left text-xs font-medium text-slate-600 truncate"
                        >
                          {item.name}
                        </button>
                        <button 
                          onClick={() => deleteFromLibrary(item.id, item.name)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-500 transition-all"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="Sim name..."
                    value={newSimulationName}
                    onChange={(e) => setNewSimulationName(e.target.value)}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500/50"
                  />
                  <button 
                    onClick={(e) => {
                      e.preventDefault();
                      saveToSimulations();
                    }}
                    disabled={!newSimulationName.trim()}
                    className="bg-purple-600 text-white p-2 rounded-lg hover:bg-purple-700 disabled:opacity-30 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                  {simulations.length === 0 ? (
                    <p className="text-[10px] text-slate-400 italic text-center py-4">No saved simulations yet</p>
                  ) : (
                    simulations.map((item, index) => (
                      <div key={index} className="group flex items-center justify-between bg-white border border-slate-100 rounded-lg p-2 hover:border-purple-200 transition-colors">
                        <button 
                          onClick={() => loadSimulation(item)}
                          className="flex-1 flex items-center gap-2 text-left text-xs font-medium text-slate-600 truncate"
                        >
                          <PlayCircle className="w-3 h-3 text-purple-400" />
                          <span className="truncate">{item.name}</span>
                        </button>
                        <button 
                          onClick={() => setShowDeleteSimulationConfirm({ id: item.id, name: item.name })}
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-500 transition-all"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex flex-col gap-3">
          <div className="flex items-center justify-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
            <button onClick={undo} disabled={historyIndex === 0} className="p-2 hover:bg-slate-100 rounded-md text-slate-600 disabled:opacity-30 transition-colors" title="Undo"><Undo className="w-4 h-4" /></button>
            <button onClick={redo} disabled={historyIndex === history.length - 1} className="p-2 hover:bg-slate-100 rounded-md text-slate-600 disabled:opacity-30 transition-colors" title="Redo"><Redo className="w-4 h-4" /></button>
            <div className="w-px h-4 bg-slate-200 mx-1" />
            <button onClick={copySelection} disabled={!selectionStart || !selectionEnd} className="p-2 hover:bg-slate-100 rounded-md text-slate-600 disabled:opacity-30 transition-colors" title="Copy (Ctrl+C)"><Copy className="w-4 h-4" /></button>
            <button onClick={cutSelection} disabled={!selectionStart || !selectionEnd} className="p-2 hover:bg-slate-100 rounded-md text-slate-600 disabled:opacity-30 transition-colors" title="Cut (Ctrl+X)"><Scissors className="w-4 h-4" /></button>
            <button onClick={() => { if(clipboard){setIsPasting(true);setSelectedTile(null);} }} disabled={!clipboard} className="p-2 hover:bg-slate-100 rounded-md text-slate-600 disabled:opacity-30 transition-colors" title="Paste (Ctrl+V)"><ClipboardPaste className="w-4 h-4" /></button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setRotation(prev => (prev + 90) % 360)} className="flex items-center justify-center gap-2 py-2 px-3 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors">
              <RotateCcw className="w-3 h-3" />
              Rotate (R)
            </button>
            <button onClick={() => { setSelectedTile(null); setIsPasting(false); }} className={`flex items-center justify-center gap-2 py-2 px-3 border rounded-lg text-xs font-medium transition-colors ${!selectedTile && !isPasting ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'}`}>
              <MousePointer2 className="w-3 h-3" />
              Select
            </button>
          </div>

          <div className="flex justify-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
            <button onClick={() => setShowClearConfirm(true)} className="flex-1 flex justify-center p-2 hover:bg-red-50 text-red-600 rounded-md transition-colors" title="Clear Grid"><Trash2 className="w-4 h-4" /></button>
            <div className="w-px h-4 bg-slate-200 mx-1 self-center" />
            <button onClick={exportGrid} className="flex-1 flex justify-center p-2 hover:bg-slate-100 text-slate-600 rounded-md transition-colors" title="Export JSON"><Download className="w-4 h-4" /></button>
            <button onClick={() => fileInputRef.current?.click()} className="flex-1 flex justify-center p-2 hover:bg-slate-100 text-slate-600 rounded-md transition-colors" title="Import JSON"><Upload className="w-4 h-4" /></button>
          </div>
          <input type="file" ref={fileInputRef} onChange={importGrid} accept=".json" className="hidden" />

          <div className="flex justify-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
            <button onClick={() => setDensityModal({ type: 'map' })} className="flex-1 flex justify-center p-2 hover:bg-blue-50 text-blue-600 rounded-md transition-colors" title="Generate Full Map"><MapIcon className="w-4 h-4" /></button>
            <div className="w-px h-4 bg-slate-200 mx-1 self-center" />
            <button onClick={() => setDensityModal({ type: 'road' })} className="flex-1 flex justify-center p-2 hover:bg-slate-100 text-slate-600 rounded-md transition-colors" title="Random Roads"><Route className="w-4 h-4" /></button>
            <button onClick={() => setDensityModal({ type: 'rail' })} className="flex-1 flex justify-center p-2 hover:bg-slate-100 text-slate-600 rounded-md transition-colors" title="Random Rails"><Train className="w-4 h-4" /></button>
            <button onClick={() => randomLandscaping()} className="flex-1 flex justify-center p-2 hover:bg-emerald-50 text-emerald-600 rounded-md transition-colors" title="Auto-Landscape"><Trees className="w-4 h-4" /></button>
          </div>

          <button onClick={() => setShowInfo(true)} className="w-full flex items-center justify-center gap-2 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors">
            <Info className="w-3 h-3" />
            Help Guide
          </button>
        </div>
        </div>
      </motion.div>

      {/* Main Viewport */}
      <div 
        ref={containerRef}
        className={`flex-1 relative overflow-hidden cursor-${isPanning ? 'grabbing' : pendingRouteVehicleId ? 'crosshair' : selectedTile ? 'crosshair' : 'grab'}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleGridClick}
      >
        {!showSidebar && (
          <button
            type="button"
            onClick={() => setShowSidebar(true)}
            className="absolute top-4 left-4 z-[60] p-3 bg-white rounded-xl shadow-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            title="Show tile palette"
            data-grid-control
            {...blockGridPointerEvents}
          >
            <PanelLeftOpen className="w-5 h-5" />
          </button>
        )}
        {pendingRouteVehicleId && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 pointer-events-none bg-red-600 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg">
            Click a road tile to set destination
          </div>
        )}
        {/* Outside canvas backdrop */}
        <div className="absolute inset-0 pointer-events-none bg-slate-200/50" />

        {/* Tiles Layer */}
        <div 
          className="absolute origin-top-left"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`
          }}
        >
          {/* Grid canvas (500×500 cells) */}
          <div
            className="absolute pointer-events-none bg-white shadow-inner"
            style={{
              left: GRID_CANVAS_MIN * GRID_SIZE,
              top: GRID_CANVAS_MIN * GRID_SIZE,
              width: GRID_CANVAS_CELLS * GRID_SIZE,
              height: GRID_CANVAS_CELLS * GRID_SIZE,
              backgroundImage: showGridLines ? `
                linear-gradient(to right, #93c5fd 1px, transparent 1px),
                linear-gradient(to bottom, #93c5fd 1px, transparent 1px)
              ` : 'none',
              backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
              boxShadow: 'inset 0 0 0 2px rgba(148, 163, 184, 0.8)',
            }}
          />
          {(Object.entries(grid) as [string, GridTile[]][]).map(([key, tiles]) => {
            const [x, y] = key.split(',').map(Number);
            return (
              <div 
                key={key}
                className="absolute"
                style={{
                  left: x * GRID_SIZE,
                  top: y * GRID_SIZE,
                  width: GRID_SIZE,
                  height: GRID_SIZE
                }}
              >
                {tiles.map((tile, i) => (
                  <div key={i} className="absolute inset-0">
                    <Tile 
                      type={tile.type} 
                      rotation={tile.rotation} 
                      size={GRID_SIZE} 
                      part={tile.part}
                      localX={tile.localX}
                      localY={tile.localY}
                      w={tile.w}
                      h={tile.h}
                      growthProgress={tile.growthProgress}
                      coneStageRatio={
                        tile.type === 'tree-pine-seedling'
                          ? Math.min(
                              0.95,
                              (economy.plantGrowth?.germinationSec ?? DEFAULT_PLANT_GROWTH.germinationSec) /
                                (economy.plantGrowth?.growthDurationSec ?? DEFAULT_PLANT_GROWTH.growthDurationSec)
                            )
                          : undefined
                      }
                    />
                  </div>
                ))}
              </div>
            );
          })}

          {/* Building name + economy badges */}
          {Object.entries(grid).map(([anchorKey, anchorTiles]) => {
            if (!anchorTiles?.length) return null;
            const topTile = anchorTiles[anchorTiles.length - 1];
            if (topTile.part !== 'anchor' && topTile.part !== undefined) return null;
            if (!isEconomyBuilding(topTile.type)) return null;
            const cfg = economy.buildings[anchorKey] || createBuildingConfig(anchorKey, topTile.type);
            const [ax, ay] = anchorKey.split(',').map(Number);
            const dims = getMultiTileDimensions(topTile.type);
            const buildingW = topTile.w ?? dims.w;
            const buildingH = topTile.h ?? dims.h;
            return (
              <div
                key={`badges-${anchorKey}`}
                className="absolute"
                style={{
                  left: ax * GRID_SIZE,
                  top: ay * GRID_SIZE,
                }}
              >
                <BuildingTileBadges
                  cfg={cfg}
                  buildingW={buildingW}
                  buildingH={buildingH}
                  itemDefs={economy.itemDefs || []}
                  showInventoryLabels={economy.showInventoryLabels}
                  cycleRemaining={getCycleRemainingForBuilding(cfg)}
                  economyPaused={economy.economyPaused}
                  canControlProduction={!!roomCode}
                  onToggleProduction={
                    isProcessBuilding(cfg)
                      ? () => toggleBuildingProduction(anchorKey)
                      : undefined
                  }
                />
              </div>
            );
          })}

          {/* Vehicles */}
          <AnimatePresence>
            {(Object.values(vehicles) as Vehicle[])
              .sort((a, b) => {
                if (a.type === 'train' && b.type !== 'train') return 1;
                if (a.type !== 'train' && b.type === 'train') return -1;
                return 0;
              })
              .map((v) => {
              const currentTiles = grid ? grid[`${v.x},${v.y}`] : undefined;
              const currentTile = currentTiles?.find(t => {
                const isBridge = t.type.includes('bridge') || t.type.includes('trestle');
                return (v.zIndex === 1 && isBridge) || (v.zIndex === 0 && !isBridge);
              });
              
              let exitHeading = v.heading;
              if (currentTile) {
                const ports = (TILE_CONNECTIONS[currentTile.type] || []).map(p => (p + currentTile.rotation / 90) % 4);
                const entryPort = (v.heading / 90 + 2) % 4;
                const otherPorts = ports.filter(p => p !== entryPort);
                
                if (otherPorts.length > 0) {
                  let exitPort = otherPorts[0];
                  if (otherPorts.length > 1) {
                    const straightPort = (entryPort + 2) % 4;
                    const leftPort = (entryPort + 3) % 4;
                    const rightPort = (entryPort + 1) % 4;

                    if (v.turnIntent === 'left' && otherPorts.includes(leftPort)) exitPort = leftPort;
                    else if (v.turnIntent === 'right' && otherPorts.includes(rightPort)) exitPort = rightPort;
                    else if (otherPorts.includes(straightPort)) exitPort = straightPort;
                  }
                  exitHeading = exitPort * 90;
                }
              }
              
              return (
                <div key={v.id}>
                  {selectedVehicles.has(v.id) && (
                    <div 
                      className="absolute border-2 border-yellow-400 rounded-full z-20 pointer-events-none"
                      style={{
                        left: v.x * GRID_SIZE - 2,
                        top: v.y * GRID_SIZE - 2,
                        width: GRID_SIZE + 4,
                        height: GRID_SIZE + 4,
                        opacity: 0.8
                      }}
                    />
                  )}
                  <VehicleComponent 
                    {...v} 
                    tileType={currentTile?.type}
                    tileRotation={currentTile?.rotation}
                    tilePart={currentTile?.part}
                    tileLocalX={currentTile?.localX}
                    tileLocalY={currentTile?.localY}
                    tileW={currentTile?.w}
                    tileH={currentTile?.h}
                    parkingStallIndex={v.parkingStallIndex}
                    lastParkingKey={v.lastParkingKey}
                    exitHeading={exitHeading}
                    trailerCargos={v.trailerCargos}
                    railcarCargos={v.railcarCargos}
                    showCargoLabels={economy.showCargoLabels}
                    itemEmojiResolver={(itemId) => getItemEmoji(itemId, economy.itemDefs)}
                    onSelect={(e) => handleVehicleSelect(v.id, e)}
                    onTrailerSelect={(idx, e) => handleTrailerSelect(v.id, idx, e)}
                    onRailcarSelect={(idx, e) => handleRailcarSelect(v.id, idx, e)}
                    selectedRailcarIndex={
                      inspectRailcarRef?.vehicleId === v.id ? inspectRailcarRef.railcarIndex : undefined
                    }
                  />
                </div>
              );
            })}
          </AnimatePresence>

          {/* Parked trailers */}
          <AnimatePresence>
            {Object.values(economy.parkedTrailers || {}).map((pt) => {
              const currentTile = grid ? findParkingTileForTrailer(pt, grid) : undefined;
              const isSelected = inspectTrailerRef?.kind === 'parked' && inspectTrailerRef.id === pt.id;
              return (
                <ParkedTrailerVisual
                  key={pt.id}
                  gridX={pt.gridX}
                  gridY={pt.gridY}
                  heading={pt.heading}
                  tileType={currentTile?.type || 'parking-2x4'}
                  tileRotation={currentTile?.rotation}
                  tileLocalX={currentTile?.localX}
                  tileLocalY={currentTile?.localY}
                  tileW={currentTile?.w}
                  tileH={currentTile?.h}
                  stallIndex={pt.stallIndex}
                  cargo={pt.cargo}
                  showCargoLabels={economy.showCargoLabels}
                  itemEmojiResolver={(itemId) => getItemEmoji(itemId, economy.itemDefs)}
                  selected={isSelected}
                  onSelect={(e) => handleParkedTrailerSelect(pt.id, e)}
                />
              );
            })}
          </AnimatePresence>

          {/* Destination bullseyes (selected vehicles only) */}
          {(Object.values(vehicles) as Vehicle[])
            .filter(v => v.destination && selectedVehicles.has(v.id))
            .map(v => {
              const { x: dx, y: dy } = v.destination!;
              return (
                <div
                  key={`dest-target-${v.id}`}
                  className="absolute pointer-events-none z-[60] flex items-center justify-center"
                  style={{
                    left: dx * GRID_SIZE,
                    top: dy * GRID_SIZE,
                    width: GRID_SIZE,
                    height: GRID_SIZE,
                  }}
                >
                  <div className="relative w-[90%] h-[90%] animate-pulse">
                    <div className="absolute inset-0 rounded-full border-[3px] border-red-600 shadow-[0_0_10px_rgba(239,68,68,0.85)]" />
                    <div className="absolute inset-[28%] rounded-full bg-red-500" />
                    <div className="absolute top-1/2 left-0 right-0 h-[3px] bg-red-500 -translate-y-1/2" />
                    <div className="absolute left-1/2 top-0 bottom-0 w-[3px] bg-red-500 -translate-x-1/2" />
                  </div>
                </div>
              );
            })}

          {/* Paste Preview */}
          {isPasting && clipboard && pastePreviewPos && (
            <div className="pointer-events-none opacity-60">
              {(Object.entries(clipboard) as [string, GridTile[]][]).map(([relKey, tiles]) => {
                const [rx, ry] = relKey.split(',').map(Number);
                return (
                  <div 
                    key={relKey}
                    className="absolute"
                    style={{
                      left: (pastePreviewPos.x + rx - getClipboardOffset().x) * GRID_SIZE,
                      top: (pastePreviewPos.y + ry - getClipboardOffset().y) * GRID_SIZE,
                      width: GRID_SIZE,
                      height: GRID_SIZE
                    }}
                  >
                    {tiles.map((tile, i) => (
                      <div key={i} className="absolute inset-0">
                        <Tile type={tile.type} rotation={tile.rotation} size={GRID_SIZE} />
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
          {/* Selection Box */}
          {selectionStart && selectionEnd && (
            <div 
              className="absolute border-2 border-blue-500 bg-blue-500/10 pointer-events-none z-10"
              style={{
                left: Math.min(selectionStart.x, selectionEnd.x) * GRID_SIZE,
                top: Math.min(selectionStart.y, selectionEnd.y) * GRID_SIZE,
                width: (Math.abs(selectionStart.x - selectionEnd.x) + 1) * GRID_SIZE,
                height: (Math.abs(selectionStart.y - selectionEnd.y) + 1) * GRID_SIZE,
              }}
            />
          )}
        </div>

        {/* Selected Tile Preview Follower */}
        {selectedTile && !isPanning && (
          (() => {
            const dims = getMultiTileDimensions(selectedTile);
            const isMulti = dims.w > 1 || dims.h > 1;
            if (isMulti) {
              return getMultiTileCells(selectedTile, rotation).map((cell, idx) => (
                <div 
                  key={idx}
                  className="absolute pointer-events-none opacity-40 z-10"
                  style={{
                    left: (gridX + cell.dx) * GRID_SIZE * zoom + offset.x,
                    top: (gridY + cell.dy) * GRID_SIZE * zoom + offset.y,
                    width: GRID_SIZE * zoom,
                    height: GRID_SIZE * zoom,
                  }}
                >
                  <Tile 
                    type={selectedTile} 
                    rotation={rotation} 
                    size={GRID_SIZE * zoom} 
                    part={cell.isAnchor ? 'anchor' : 'member'}
                    localX={cell.localX}
                    localY={cell.localY}
                    w={dims.w}
                    h={dims.h}
                  />
                </div>
              ));
            } else {
              return (
                <div 
                  className="absolute pointer-events-none opacity-40 z-10"
                  style={{
                    left: gridX * GRID_SIZE * zoom + offset.x,
                    top: gridY * GRID_SIZE * zoom + offset.y,
                    width: GRID_SIZE * zoom,
                    height: GRID_SIZE * zoom,
                  }}
                >
                  <Tile type={selectedTile} rotation={rotation} size={GRID_SIZE * zoom} />
                </div>
              );
            }
          })()
        )}

        {/* Paste Preview Follower */}
        {isPasting && clipboard && !isPanning && (
          <div 
            className="absolute pointer-events-none opacity-40 z-10"
            style={{
              left: (gridX - getClipboardOffset().x) * GRID_SIZE * zoom + offset.x,
              top: (gridY - getClipboardOffset().y) * GRID_SIZE * zoom + offset.y,
              transform: `scale(${zoom})`,
              transformOrigin: 'top left'
            }}
          >
            {(Object.entries(clipboard) as [string, GridTile[]][]).map(([relKey, tiles]) => {
              const [rx, ry] = relKey.split(',').map(Number);
              return (
                <div 
                  key={relKey}
                  className="absolute"
                  style={{
                    left: rx * GRID_SIZE,
                    top: ry * GRID_SIZE,
                    width: GRID_SIZE,
                    height: GRID_SIZE
                  }}
                >
                  {tiles.map((tile, i) => (
                    <div key={i} className="absolute inset-0">
                      <Tile type={tile.type} rotation={tile.rotation} size={GRID_SIZE} />
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* Minimap Overview — visible only while zooming or panning */}
        <AnimatePresence>
          {showOverview && (
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ duration: 0.15 }}
              className="absolute bottom-4 right-4 z-[60] bg-white/95 border border-slate-200 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-sm"
              style={{ width: minimapSize + 8, height: minimapSize + 24 }}
              data-grid-control
              {...blockGridPointerEvents}
            >
              <div className="px-2 py-0.5 text-[10px] text-slate-500 font-medium tracking-wider">OVERVIEW</div>
              <canvas
                ref={minimapRef}
                width={minimapSize}
                height={minimapSize}
                className="block cursor-crosshair"
                onMouseDown={handleMinimapInteraction}
                onMouseMove={handleMinimapInteraction}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating Controls */}
        <div 
          className="absolute bottom-8 right-8 flex flex-col gap-2"
          data-grid-control
          {...blockGridPointerEvents}
        >
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-2 flex flex-col gap-1">
            <button 
              onClick={() => setShowGridLines(!showGridLines)}
              className={`p-3 rounded-xl transition-colors ${showGridLines ? 'text-blue-600 bg-blue-50' : 'text-slate-400 hover:bg-slate-50'}`}
              title="Toggle Grid Lines"
            >
              <Grid className="w-5 h-5" />
            </button>
            <div className="h-px bg-slate-100 mx-2" />
            <button 
              onClick={() => { pulseOverview(); setZoom(z => Math.min(MAX_ZOOM, z * 1.2)); }}
              className="p-3 hover:bg-slate-50 rounded-xl transition-colors text-slate-600"
              title="Zoom In"
            >
              <ZoomIn className="w-5 h-5" />
            </button>
            <div className="h-px bg-slate-100 mx-2" />
            <button 
              onClick={() => { pulseOverview(); setZoom(z => Math.max(MIN_ZOOM, z / 1.2)); }}
              className="p-3 hover:bg-slate-50 rounded-xl transition-colors text-slate-600"
              title="Zoom Out"
            >
              <ZoomOut className="w-5 h-5" />
            </button>
            <div className="h-px bg-slate-100 mx-2" />
            <button 
              onClick={() => {
                pulseOverview();
                setZoom(INITIAL_ZOOM);
                setOffset(clampOffset({ x: 0, y: 0 }, INITIAL_ZOOM));
              }}
              className="p-3 hover:bg-slate-50 rounded-xl transition-colors text-slate-600"
              title="Reset View"
            >
              <Hand className="w-5 h-5" />
            </button>
            <div className="h-px bg-slate-100 mx-2" />
            <button
              onClick={toggleCarsPanel}
              className={`p-3 rounded-xl transition-colors ${showCarsPanel ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400 hover:bg-slate-50'}`}
              title="Cars"
            >
              <Car className="w-5 h-5" />
            </button>
            <button
              onClick={toggleSemiTrailerPanel}
              className={`p-3 rounded-xl transition-colors ${showSemiTrailerPanel ? 'text-amber-600 bg-amber-50' : 'text-slate-400 hover:bg-slate-50'}`}
              title="Semis & Trailers"
            >
              <Truck className="w-5 h-5" />
            </button>
            <button
              onClick={toggleTrainPanel}
              className={`p-3 rounded-xl transition-colors ${showTrainPanel ? 'text-emerald-600 bg-emerald-50' : 'text-slate-400 hover:bg-slate-50'}`}
              title="Trains & Railcars"
            >
              <Train className="w-5 h-5" />
            </button>
            <div className="h-px bg-slate-100 mx-2" />
            <button 
              onClick={() => setShowLogistics(!showLogistics)}
              className={`p-3 rounded-xl transition-colors ${showLogistics ? 'text-emerald-600 bg-emerald-50' : 'text-slate-400 hover:bg-slate-50'}`}
              title="Logistics & Economy"
            >
              <Database className="w-5 h-5" />
            </button>
            <div className="h-px bg-slate-100 mx-2" />
            <button 
              onClick={() => setShowPlantGrowth(!showPlantGrowth)}
              className={`p-3 rounded-xl transition-colors ${showPlantGrowth ? 'text-lime-600 bg-lime-50' : 'text-slate-400 hover:bg-slate-50'}`}
              title="Plant Growth"
            >
              <Sprout className="w-5 h-5" />
            </button>

            {/* Destination Floater */}
            <button 
              onClick={() => {
                if (selectedVehicles.size > 0) {
                  toggleDestinationMode();
                } else {
                  toggleCarsPanel();
                }
              }}
              className={`p-3 rounded-xl flex items-center justify-center shadow transition-colors ${
                isDestinationToggleActive
                  ? 'bg-red-600 hover:bg-red-700 text-white ring-2 ring-red-300'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              } ${pendingRouteVehicleId ? 'animate-pulse' : ''}`}
              title={
                pendingRouteVehicleId
                  ? 'Click a road tile to set destination (toggle off to clear)'
                  : selectedHaveDestination
                    ? 'Clear destinations for selected vehicles'
                    : 'Set destination for selected vehicles'
              }
            >
              <Target className="w-5 h-5" />
            </button>

            {/* Factory / Recipe Floater */}
            <button 
              onClick={() => setShowLogistics(true)}
              className="p-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white flex items-center justify-center text-lg shadow"
              title="Open Factories & Recipes"
            >
              🏭
            </button>
          </div>
          
          <div className="bg-white rounded-full shadow-2xl border border-slate-200 p-3 flex items-center justify-center text-slate-400 text-xs font-bold">
            {Math.round(zoom * 100)}%
          </div>
        </div>

        {/* Logistics & Economy Panel (new) */}
        <AnimatePresence>
          {showLogistics && (
            <motion.div
              initial={{ x: 400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 400, opacity: 0 }}
              className="absolute right-0 top-0 bottom-0 w-96 bg-white/95 backdrop-blur-md shadow-2xl border-l border-slate-200 z-[110] flex flex-col overscroll-contain"
              data-grid-control
              {...blockGridPointerEvents}
            >
              <div className="p-4 border-b flex items-center justify-between bg-emerald-50">
                <div className="flex items-center gap-2"><Database className="w-5 h-5 text-emerald-600" /><span className="font-bold">Logistics &amp; Economy</span></div>
                <button onClick={() => setShowLogistics(false)}><X className="w-5 h-5" /></button>
              </div>
              <div className="p-4 overflow-auto overscroll-contain flex-1 text-sm space-y-4">
                <div>
                  <div className="font-semibold mb-1">Items (create/destroy)</div>
                  <div className="flex gap-2">
                    <input
                      value={newItemName}
                      onChange={e => setNewItemName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          (e.currentTarget.nextElementSibling as HTMLButtonElement | null)?.click();
                        }
                      }}
                      placeholder="e.g. lumber"
                      className="flex-1 border rounded px-2 py-1 text-xs"
                    />
                    <button
                      onClick={() => {
                        if (!newItemName.trim()) return;
                        const id = normalizeItemId(newItemName);
                        const exists = (economy.itemDefs || []).some(d => d.id === id);
                        if (!exists) {
                          const next = {
                            ...economy,
                            itemDefs: [
                              ...economy.itemDefs,
                              { id, name: newItemName.trim(), emoji: newItemEmoji || guessItemEmoji(id) },
                            ],
                          };
                          setEconomy(next);
                          if (roomCode) socket.emit('update-economy', { roomCode, economy: next });
                        }
                        setNewItemName('');
                        setNewItemEmoji('📦');
                      }}
                      className="px-3 bg-emerald-600 text-white rounded text-xs"
                    >
                      Add
                    </button>
                  </div>
                  <div className="mt-2">
                    <div className="text-[10px] text-slate-500 mb-0.5">Icon for new item</div>
                    <ItemEmojiPicker value={newItemEmoji} onChange={setNewItemEmoji} compact />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(economy.itemDefs || []).map(def => (
                      <div key={def.id} className="flex flex-col max-w-full">
                        <span className="px-2 py-0.5 bg-slate-100 rounded text-xs flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setEditingItemEmoji(editingItemEmoji === def.id ? null : def.id)}
                            className="hover:scale-110 transition-transform"
                            title="Change icon"
                          >
                            {getItemEmoji(def.id, economy.itemDefs)}
                          </button>
                          {def.name}
                          <button
                            onClick={() => {
                              const nextDefs = (economy.itemDefs || []).filter(d => d.id !== def.id);
                              const nextBld: Record<string, BuildingConfig> = {};
                              Object.keys(economy.buildings).forEach(k => {
                                const b = { ...economy.buildings[k] };
                                if (b.inventory) delete b.inventory[def.id];
                                if (b.inventoryCapacity) delete b.inventoryCapacity[def.id];
                                if (b.consumptionRates) delete b.consumptionRates[def.id];
                                if (b.recipeInputs) b.recipeInputs = b.recipeInputs.filter(r => r.item !== def.id);
                                if (b.recipeOutputs) b.recipeOutputs = b.recipeOutputs.filter(r => r.item !== def.id);
                                nextBld[k] = b;
                              });
                              const next = { ...economy, itemDefs: nextDefs, buildings: nextBld };
                              setEconomy(next);
                              if (editingItemEmoji === def.id) setEditingItemEmoji(null);
                              if (roomCode) socket.emit('update-economy', { roomCode, economy: next });
                            }}
                            className="text-red-500"
                          >
                            ×
                          </button>
                        </span>
                        {editingItemEmoji === def.id && (
                          <ItemEmojiPicker
                            compact
                            value={def.emoji || getItemEmoji(def.id, economy.itemDefs)}
                            onChange={emoji => {
                              const nextDefs = (economy.itemDefs || []).map(d =>
                                d.id === def.id ? { ...d, emoji } : d
                              );
                              const next = { ...economy, itemDefs: nextDefs };
                              setEconomy(next);
                              if (roomCode) socket.emit('update-economy', { roomCode, economy: next });
                            }}
                          />
                        )}
                      </div>
                    ))}
                    {economy.itemDefs.length === 0 && (
                      <span className="text-slate-400 text-xs">No items defined yet. Add some to enable production.</span>
                    )}
                  </div>
                </div>

                <div className="border-t pt-3">
                  <div className="font-semibold mb-1">Quick Stock (bulk add to buildings)</div>
                  <div className="flex flex-wrap gap-1">
                    {(economy.itemDefs || []).map(def => (
                      <button
                        key={def.id}
                        onClick={() => {
                          const nextB: Record<string, BuildingConfig> = {};
                          Object.keys(economy.buildings).forEach(k => {
                            const b = normalizeBuildingConfig({ ...economy.buildings[k] });
                            if (!b.inventory) b.inventory = {};
                            const add = getAcceptAmount(b, def.id, 20);
                            if (add > 0) b.inventory[def.id] = (b.inventory[def.id] || 0) + add;
                            nextB[k] = b;
                          });
                          const next = { ...economy, buildings: nextB };
                          setEconomy(next);
                          if (roomCode) socket.emit('update-economy', { roomCode, economy: next });
                        }}
                        className="px-2 py-0.5 text-[10px] bg-emerald-100 hover:bg-emerald-200 rounded text-emerald-700"
                      >
                        +20 {getItemDisplayName(def.id, economy.itemDefs)}
                      </button>
                    ))}
                    {(economy.itemDefs || []).length === 0 && (
                      <span className="text-xs text-slate-400">Create items above first.</span>
                    )}
                  </div>
                  <div className="text-[9px] text-slate-400 mt-1">Adds to all warehouses, factories, stores etc.</div>
                </div>

                {/* Buildings overview */}
                <div className="border-t pt-3">
                  <div className="font-semibold mb-2">Buildings</div>
                  {Object.keys(economy.buildings).length === 0 ? (
                    <div className="text-xs text-slate-400">No economy buildings yet. Place a warehouse, factory, or store.</div>
                  ) : (
                    <div className="space-y-1">
                      {Object.entries(economy.buildings).map(([bkey, bcfg]) => {
                        const invCount = Object.values(bcfg.inventory || {}).reduce((sum, qty) => sum + qty, 0);
                        const cycleRemaining = getCycleRemainingForBuilding(bcfg);
                        return (
                          <div
                            key={bkey}
                            className="flex items-center justify-between gap-2 p-2 rounded-lg border border-slate-200 bg-slate-50/80"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-xs truncate">{getBuildingDisplayName(bcfg, bkey)}</div>
                              <div className="text-[10px] text-slate-400 truncate">
                                {bcfg.role} • {bkey}
                                {invCount > 0 ? ` • ${invCount} in stock` : ''}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {cycleRemaining !== null && <CycleCountdownBadge remaining={cycleRemaining} />}
                              <button
                                onClick={() => setInspectBuildingKey(bkey)}
                                className="text-[10px] px-1.5 py-0.5 bg-white border rounded hover:bg-slate-100"
                              >
                                Edit
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Factories & Recipes - direct controls */}
                <div className="border-t pt-3">
                  <div className="font-semibold mb-2 text-amber-600">Factories &amp; Recipes</div>
                  {Object.keys(economy.buildings).filter(k => {
                    const r = economy.buildings[k].role;
                    return r === 'factory' || r === 'lumbermill';
                  }).length === 0 && (
                    <div className="text-xs text-slate-400">No factories placed yet. Place a Factory Large or Lumbermill to configure recipes.</div>
                  )}

                  {Object.entries(economy.buildings)
                    .filter(([k, b]) => b.role === 'factory' || b.role === 'lumbermill')
                    .map(([bkey, bcfg]) => (
                      <div key={bkey} className="mb-3 p-2 border border-amber-200 rounded bg-amber-50/50">
                        <div className="flex justify-between items-center gap-2 mb-1">
                          <div className="min-w-0">
                            <div className="font-medium text-xs truncate">{getBuildingDisplayName(bcfg, bkey)}</div>
                            <div className="text-[10px] text-slate-500">{bcfg.role} • {bkey}</div>
                          </div>
                          <button 
                            onClick={() => setInspectBuildingKey(bkey)}
                            className="shrink-0 text-[10px] px-1.5 py-0.5 bg-white border rounded hover:bg-amber-100"
                          >
                            Open Full Editor
                          </button>
                        </div>

                        {/* Simple inline recipe editor */}
                        <div className="text-[10px] space-y-1">
                          <div>
                            <span className="font-medium">Inputs:</span> 
                            {(bcfg.recipeInputs || []).map((inp, i) => (
                              <span key={i} className="ml-1 px-1 bg-white rounded border text-[9px]">
                                {getItemDisplayName(inp.item, economy.itemDefs)}×{inp.amount}
                              </span>
                            ))}
                            {(bcfg.recipeInputs || []).length === 0 && <span className="text-slate-400 ml-1">none</span>}
                          </div>
                          <div>
                            <span className="font-medium">Outputs:</span> 
                            {(bcfg.recipeOutputs || []).map((out, i) => (
                              <span key={i} className="ml-1 px-1 bg-white rounded border text-[9px]">
                                {getItemDisplayName(out.item, economy.itemDefs)}×{out.amount}
                              </span>
                            ))}
                            {(bcfg.recipeOutputs || []).length === 0 && <span className="text-slate-400 ml-1">none</span>}
                          </div>
                          <div className="flex items-center justify-between gap-2 text-[9px] text-amber-700">
                            <span>Cycle: {bcfg.cycleTimeSec || 30}s</span>
                            {(() => {
                              const remaining = getCycleRemainingForBuilding(bcfg);
                              if (remaining !== null) return <CycleCountdownBadge remaining={remaining} />;
                              if (economy.economyPaused && isRecipeBuilding(bcfg)) {
                                return <span className="text-slate-400">Paused</span>;
                              }
                              return null;
                            })()}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>

                <div className="border-t pt-3">
                  <div className="font-semibold mb-1">Toggles</div>
                  <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={economy.showInventoryLabels} onChange={e => {
                    const next = { ...economy, showInventoryLabels: e.target.checked };
                    setEconomy(next); if (roomCode) socket.emit('update-economy', { roomCode, economy: next });
                  }} /> Show building inventory badges</label>
                  <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={economy.showCargoLabels} onChange={e => {
                    const next = { ...economy, showCargoLabels: e.target.checked };
                    setEconomy(next); if (roomCode) socket.emit('update-economy', { roomCode, economy: next });
                  }} /> Show trailer cargo labels</label>
                  <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={economy.economyPaused} onChange={e => {
                    const next = { ...economy, economyPaused: e.target.checked };
                    setEconomy(next); if (roomCode) socket.emit('update-economy', { roomCode, economy: next });
                  }} /> Pause economy simulation</label>
                </div>

                <div className="text-[10px] text-slate-500 pt-2 border-t">
                  Use the 🎯 and 🏭 floaters (bottom-right) for quick access to Destinations and Factories/Recipes. Or open Cars / Semis / Trains panels or Logistics for full controls.
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Plant Growth Panel */}
        <AnimatePresence>
          {showPlantGrowth && (
            <motion.div
              initial={{ x: 400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 400, opacity: 0 }}
              className="absolute right-0 top-0 bottom-0 w-80 bg-white/95 backdrop-blur-md shadow-2xl border-l border-slate-200 z-[105] flex flex-col overscroll-contain"
              data-grid-control
              {...blockGridPointerEvents}
            >
              <div className="p-4 border-b flex items-center justify-between bg-lime-50">
                <div className="flex items-center gap-2">
                  <Sprout className="w-5 h-5 text-lime-600" />
                  <span className="font-bold">Plant Growth</span>
                </div>
                <button onClick={() => setShowPlantGrowth(false)}><X className="w-5 h-5" /></button>
              </div>
              <div className="p-4 overflow-auto overscroll-contain flex-1 text-sm space-y-4">
                <p className="text-xs text-slate-500">
                  Place <span className="font-medium text-slate-700">Pine Seedling</span> tiles from the landscape palette.
                  They germinate as a pine cone, then scale up into a full pine tree.
                </p>

                <div>
                  <label className="font-semibold text-xs block mb-1">
                    Total growth time: {economy.plantGrowth?.growthDurationSec ?? DEFAULT_PLANT_GROWTH.growthDurationSec}s
                  </label>
                  <input
                    type="range"
                    min={10}
                    max={600}
                    step={5}
                    value={economy.plantGrowth?.growthDurationSec ?? DEFAULT_PLANT_GROWTH.growthDurationSec}
                    onChange={e => {
                      const growthDurationSec = Math.max(10, parseInt(e.target.value, 10) || 120);
                      const next = normalizeEconomy({
                        ...economy,
                        plantGrowth: { ...(economy.plantGrowth || DEFAULT_PLANT_GROWTH), growthDurationSec },
                      });
                      setEconomy(next);
                      if (roomCode) socket.emit('update-economy', { roomCode, economy: next });
                    }}
                    className="w-full"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                    <span>10s (fast)</span>
                    <span>600s (slow)</span>
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-xs block mb-1">
                    Germination time: {economy.plantGrowth?.germinationSec ?? DEFAULT_PLANT_GROWTH.germinationSec}s
                  </label>
                  <input
                    type="range"
                    min={5}
                    max={60}
                    step={1}
                    value={economy.plantGrowth?.germinationSec ?? DEFAULT_PLANT_GROWTH.germinationSec}
                    onChange={e => {
                      const germinationSec = Math.min(60, Math.max(5, parseInt(e.target.value, 10) || 15));
                      const next = normalizeEconomy({
                        ...economy,
                        plantGrowth: { ...(economy.plantGrowth || DEFAULT_PLANT_GROWTH), germinationSec },
                      });
                      setEconomy(next);
                      if (roomCode) socket.emit('update-economy', { roomCode, economy: next });
                    }}
                    className="w-full"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                    <span>5s</span>
                    <span>60s</span>
                  </div>
                </div>

                <div className="border-t pt-3">
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={economy.plantGrowth?.paused ?? false}
                      onChange={e => {
                        const next = normalizeEconomy({
                          ...economy,
                          plantGrowth: { ...(economy.plantGrowth || DEFAULT_PLANT_GROWTH), paused: e.target.checked },
                        });
                        setEconomy(next);
                        if (roomCode) socket.emit('update-economy', { roomCode, economy: next });
                      }}
                    />
                    Pause plant growth
                  </label>
                </div>

                <div className="border-t pt-3 text-xs text-slate-600 space-y-1">
                  <div className="font-semibold">Active seedlings</div>
                  <div>
                    {Object.values(grid).filter(tiles => tiles?.[tiles.length - 1]?.type === 'tree-pine-seedling').length} growing
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Mature seedlings automatically become full pine trees.
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Cars Panel */}
        <AnimatePresence>
          {showCarsPanel && (
            <motion.div
              initial={{ x: 400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 400, opacity: 0 }}
              className="absolute right-0 top-0 bottom-0 w-80 bg-white/95 backdrop-blur-md shadow-2xl border-l border-slate-200 z-[100] flex flex-col min-h-0 overflow-hidden"
              data-grid-control
              {...blockGridPointerEvents}
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-50 text-indigo-500 rounded-xl">
                    <Car className="w-5 h-5" />
                  </div>
                  <h2 className="font-bold text-slate-800">Cars</h2>
                </div>
                <button onClick={() => setShowCarsPanel(false)} className="p-2 hover:bg-slate-50 text-slate-400 rounded-xl transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 flex flex-col gap-4">
                <div className="bg-slate-50 rounded-xl px-2 py-1.5 border border-slate-100 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      ref={addCarsCountRef}
                      defaultValue={1}
                      min={1}
                      max={50}
                      title="Spawn count"
                      aria-label="Spawn count"
                      className="w-11 shrink-0 px-1.5 py-1.5 text-xs text-center border border-slate-200 rounded-lg outline-none focus:border-indigo-500 bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => addRandomCars('car')}
                      title="Add car(s)"
                      disabled={!roomCode}
                      className="flex-1 flex items-center justify-center gap-1 min-w-0 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-50"
                    >
                      <Plus className="w-3 h-3 shrink-0" aria-hidden />
                      <Car className="w-4 h-4 shrink-0" aria-hidden />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between px-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={carsList.length > 0 && carsFilteredSelection.size === carsList.length}
                      onChange={() => toggleAllVehiclesOfType('car')}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                    />
                    Select All ({carsFilteredSelection.size}/{carsList.length})
                  </label>
                  <button
                    onClick={() => removeSelectedCars(carsFilteredSelection)}
                    disabled={carsFilteredSelection.size === 0 || !roomCode}
                    className="text-red-500 hover:text-red-600 disabled:opacity-30 disabled:pointer-events-none p-1 bg-red-50 hover:bg-red-100 rounded-md transition-colors"
                    title="Remove Selected"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>

                <div className="bg-white border border-slate-100 rounded-2xl overflow-y-auto overscroll-contain shadow-inner flex flex-col min-h-[120px] max-h-[280px] shrink-0">
                  {carsList.map(renderVehicleListItem)}
                  {carsList.length === 0 && (
                    <div className="flex-1 flex items-center justify-center text-sm text-slate-400 p-4">No cars active</div>
                  )}
                </div>
              </div>

              <div className="shrink-0 p-4 border-t border-slate-200 bg-slate-50/50 max-h-[45vh] overflow-y-auto overscroll-contain">
                <VehicleMotionControls
                  panelType="car"
                  filteredSelection={carsFilteredSelection}
                  vehicles={vehicles}
                  roomCode={roomCode}
                  pendingRouteVehicleId={pendingRouteVehicleId}
                  isPlacingVehicles={isPlacingVehicles}
                  onSpeedChange={(s) => changeSelectedCarsSpeed(s, carsFilteredSelection)}
                  onToggleAttribute={(a) => toggleSelectedCarsAttribute(a, carsFilteredSelection)}
                  onDistribute={() => distributeSelectedCars(carsFilteredSelection)}
                  onToggleDestination={() => toggleDestinationMode(carsFilteredSelection)}
                  onPark={() => parkSelectedVehicles(carsFilteredSelection)}
                  onUnpark={() => unparkSelectedVehicles(carsFilteredSelection)}
                  onTogglePlacing={() => {
                    const next = !isPlacingVehicles;
                    setIsPlacingVehicles(next);
                    if (next) setPendingRouteVehicleId(null);
                  }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Semis & Trailers Panel */}
        <AnimatePresence>
          {showSemiTrailerPanel && (
            <motion.div
              initial={{ x: 400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 400, opacity: 0 }}
              className="absolute right-0 top-0 bottom-0 w-96 bg-white/95 backdrop-blur-md shadow-2xl border-l border-slate-200 z-[100] flex flex-col min-h-0 overflow-hidden"
              data-grid-control
              {...blockGridPointerEvents}
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                    <Truck className="w-5 h-5" />
                  </div>
                  <h2 className="font-bold text-slate-800">Semis &amp; Trailers</h2>
                </div>
                <button onClick={() => setShowSemiTrailerPanel(false)} className="p-2 hover:bg-slate-50 text-slate-400 rounded-xl transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 flex flex-col gap-4">
                <div className="bg-slate-50 rounded-xl px-2 py-1.5 border border-slate-100 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      ref={addCarsCountRef}
                      defaultValue={1}
                      min={1}
                      max={50}
                      title="Spawn count"
                      aria-label="Spawn count"
                      className="w-11 shrink-0 px-1.5 py-1.5 text-xs text-center border border-slate-200 rounded-lg outline-none focus:border-amber-500 bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => addRandomCars('semi')}
                      title="Add semi(s)"
                      disabled={!roomCode}
                      className="flex-1 flex items-center justify-center gap-1 min-w-0 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white transition-colors disabled:opacity-50"
                    >
                      <Plus className="w-3 h-3 shrink-0" aria-hidden />
                      <Truck className="w-4 h-4 shrink-0" aria-hidden />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between px-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={semisList.length > 0 && semiFilteredSelection.size === semisList.length}
                      onChange={() => toggleAllVehiclesOfType('semi')}
                      className="rounded border-slate-300 text-amber-600 focus:ring-amber-600"
                    />
                    Semis ({semiFilteredSelection.size}/{semisList.length})
                  </label>
                  <button
                    onClick={() => removeSelectedCars(semiFilteredSelection)}
                    disabled={semiFilteredSelection.size === 0 || !roomCode}
                    className="text-red-500 hover:text-red-600 disabled:opacity-30 disabled:pointer-events-none p-1 bg-red-50 hover:bg-red-100 rounded-md transition-colors"
                    title="Remove Selected"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>

                <div className="bg-white border border-slate-100 rounded-2xl overflow-y-auto overscroll-contain shadow-inner flex flex-col max-h-[160px] shrink-0">
                  {semisList.map(renderVehicleListItem)}
                  {semisList.length === 0 && (
                    <div className="flex items-center justify-center text-sm text-slate-400 p-4">No semis active</div>
                  )}
                </div>

                {semiFilteredSelection.size > 0 && (
                  <div className="flex items-center justify-between gap-3 bg-white p-3 rounded-xl border border-amber-200 shadow-sm shrink-0">
                    <span className="text-sm font-medium text-slate-700">Trailers on selected semis (max 2)</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => changeSelectedTrailers(-1, semiFilteredSelection)} disabled={!roomCode} className="w-8 h-8 flex justify-center items-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold">-</button>
                      <button onClick={() => changeSelectedTrailers(1, semiFilteredSelection)} disabled={!roomCode} className="w-8 h-8 flex justify-center items-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold">+</button>
                    </div>
                  </div>
                )}

                <div className="bg-white border border-amber-100 rounded-2xl overflow-y-auto overscroll-contain shadow-inner flex flex-col max-h-[200px] shrink-0">
                  <div className="px-3 py-2 text-xs font-semibold text-amber-800 border-b border-amber-50 bg-amber-50/50">Attached Trailers</div>
                  {semisList.map(semi => {
                    const count = getSemiTrailerCount(semi);
                    if (count === 0) return null;
                    return (
                      <div key={semi.id} className="p-2 border-b border-slate-50 text-xs">
                        <div className="font-medium text-slate-700 mb-1 flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: semi.color }} />
                          <span className="font-mono truncate">{semi.id}</span>
                        </div>
                        {Array.from({ length: count }).map((_, i) => {
                          const ref: TrailerRef = { kind: 'vehicle', vehicleId: semi.id, trailerIndex: i };
                          const cargo = getTrailerCargo(ref, vehicles, economy);
                          const cargoSummary = Object.entries(cargo).filter(([, q]) => q > 0).map(([id, q]) => `${getItemEmoji(id, economy.itemDefs)}×${q}`).join(' ') || 'Empty';
                          const isInspecting = inspectTrailerRef?.kind === 'vehicle' && inspectTrailerRef.vehicleId === semi.id && inspectTrailerRef.trailerIndex === i;
                          const canDrop = canSemiDropTrailer(semi, grid);
                          return (
                            <div key={i} className={`flex items-center justify-between gap-2 py-1 px-1 rounded ${isInspecting ? 'bg-amber-50' : ''}`}>
                              <button
                                type="button"
                                onClick={() => setInspectTrailerRef(ref)}
                                className="flex-1 text-left hover:underline truncate"
                              >
                                Trailer #{i + 1} — {cargoSummary}
                              </button>
                              <button
                                type="button"
                                disabled={!roomCode || !canDrop}
                                onClick={() => dropTrailerFromSemi(semi.id, i)}
                                className="text-[10px] px-2 py-0.5 rounded bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40 shrink-0"
                              >
                                Drop
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                  {semisList.every(s => getSemiTrailerCount(s) === 0) && (
                    <div className="p-3 text-sm text-slate-400 text-center">No attached trailers</div>
                  )}
                </div>

                <div className="bg-white border border-emerald-100 rounded-2xl overflow-y-auto overscroll-contain shadow-inner flex flex-col max-h-[180px] shrink-0">
                  <div className="px-3 py-2 text-xs font-semibold text-emerald-800 border-b border-emerald-50 bg-emerald-50/50">
                    Parked Trailers ({parkedTrailersList.length})
                  </div>
                  {parkedTrailersList.map(pt => {
                    const cargoSummary = Object.entries(pt.cargo).filter(([, q]) => q > 0).map(([id, q]) => `${getItemEmoji(id, economy.itemDefs)}×${q}`).join(' ') || 'Empty';
                    const pickupSemis = semisList.filter(s => canPickupParkedTrailer(s, pt));
                    const isInspecting = inspectTrailerRef?.kind === 'parked' && inspectTrailerRef.id === pt.id;
                    return (
                      <div key={pt.id} className={`p-2 border-b border-slate-50 text-xs ${isInspecting ? 'bg-emerald-50' : ''}`}>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <button type="button" onClick={() => setInspectTrailerRef({ kind: 'parked', id: pt.id })} className="font-medium text-slate-700 hover:underline truncate text-left">
                            Stall @ {pt.parkingLotKey} — {cargoSummary}
                          </button>
                        </div>
                        {pickupSemis.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {pickupSemis.map(semi => (
                              <button
                                key={semi.id}
                                type="button"
                                disabled={!roomCode || getSemiTrailerCount(semi) >= 2}
                                onClick={() => pickupParkedTrailer(pt.id, semi.id)}
                                className="text-[10px] px-2 py-0.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
                              >
                                Pick up → {semi.id.slice(0, 6)}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="text-[10px] text-slate-400">Park a semi nearby to pick up</div>
                        )}
                      </div>
                    );
                  })}
                  {parkedTrailersList.length === 0 && (
                    <div className="p-3 text-sm text-slate-400 text-center">No parked trailers</div>
                  )}
                </div>
              </div>

              <div className="shrink-0 p-4 border-t border-slate-200 bg-slate-50/50 max-h-[40vh] overflow-y-auto overscroll-contain">
                <VehicleMotionControls
                  panelType="semi"
                  filteredSelection={semiFilteredSelection}
                  vehicles={vehicles}
                  roomCode={roomCode}
                  pendingRouteVehicleId={pendingRouteVehicleId}
                  isPlacingVehicles={isPlacingVehicles}
                  onSpeedChange={(s) => changeSelectedCarsSpeed(s, semiFilteredSelection)}
                  onToggleAttribute={(a) => toggleSelectedCarsAttribute(a, semiFilteredSelection)}
                  onDistribute={() => distributeSelectedCars(semiFilteredSelection)}
                  onToggleDestination={() => toggleDestinationMode(semiFilteredSelection)}
                  onPark={() => parkSelectedVehicles(semiFilteredSelection)}
                  onUnpark={() => unparkSelectedVehicles(semiFilteredSelection)}
                  onTogglePlacing={() => {
                    const next = !isPlacingVehicles;
                    setIsPlacingVehicles(next);
                    if (next) setPendingRouteVehicleId(null);
                  }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Trains & Railcars Panel */}
        <AnimatePresence>
          {showTrainPanel && (
            <motion.div
              initial={{ x: 400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 400, opacity: 0 }}
              className="absolute right-0 top-0 bottom-0 w-96 bg-white/95 backdrop-blur-md shadow-2xl border-l border-slate-200 z-[100] flex flex-col min-h-0 overflow-hidden"
              data-grid-control
              {...blockGridPointerEvents}
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                    <Train className="w-5 h-5" />
                  </div>
                  <h2 className="font-bold text-slate-800">Trains &amp; Railcars</h2>
                </div>
                <button onClick={() => setShowTrainPanel(false)} className="p-2 hover:bg-slate-50 text-slate-400 rounded-xl transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 flex flex-col gap-4">
                <div className="bg-slate-50 rounded-xl px-2 py-1.5 border border-slate-100 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      ref={addCarsCountRef}
                      defaultValue={1}
                      min={1}
                      max={50}
                      title="Spawn count"
                      aria-label="Spawn count"
                      className="w-11 shrink-0 px-1.5 py-1.5 text-xs text-center border border-slate-200 rounded-lg outline-none focus:border-emerald-500 bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => addRandomCars('train')}
                      title="Add train(s)"
                      disabled={!roomCode}
                      className="flex-1 flex items-center justify-center gap-1 min-w-0 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50"
                    >
                      <Plus className="w-3 h-3 shrink-0" aria-hidden />
                      <Train className="w-4 h-4 shrink-0" aria-hidden />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between px-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={trainsList.length > 0 && trainFilteredSelection.size === trainsList.length}
                      onChange={() => toggleAllVehiclesOfType('train')}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                    />
                    Trains ({trainFilteredSelection.size}/{trainsList.length})
                  </label>
                  <button
                    onClick={() => removeSelectedCars(trainFilteredSelection)}
                    disabled={trainFilteredSelection.size === 0 || !roomCode}
                    className="text-red-500 hover:text-red-600 disabled:opacity-30 disabled:pointer-events-none p-1 bg-red-50 hover:bg-red-100 rounded-md transition-colors"
                    title="Remove Selected"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>

                <div className="bg-white border border-slate-100 rounded-2xl overflow-y-auto overscroll-contain shadow-inner flex flex-col max-h-[140px] shrink-0">
                  {trainsList.map(renderVehicleListItem)}
                  {trainsList.length === 0 && (
                    <div className="flex items-center justify-center text-sm text-slate-400 p-4">No trains active</div>
                  )}
                </div>

                {trainFilteredSelection.size === 1 && (() => {
                  const trainId = Array.from(trainFilteredSelection)[0];
                  const train = vehicles[trainId];
                  if (!train) return null;
                  const railcars = train.railcars || [];
                  return (
                    <div className="flex flex-col gap-2 bg-white p-3 rounded-xl border border-emerald-200 shadow-sm shrink-0">
                      <span className="text-sm font-medium text-slate-700">Railcars on {trainId.slice(0, 8)} (max 12)</span>
                      {railcars.length > 0 && (
                        <div className="flex flex-col gap-1 max-h-[160px] overflow-y-auto">
                          {railcars.map((rt, i) => {
                            const cargo = train.railcarCargos?.[i] || {};
                            const cargoSummary = Object.entries(cargo).filter(([, q]) => q > 0).map(([id, q]) => `${getItemEmoji(id, economy.itemDefs)}×${q}`).join(' ') || (railcarCanHoldCargo(rt) ? 'Empty' : 'Passengers');
                            const isInspecting = inspectRailcarRef?.vehicleId === trainId && inspectRailcarRef?.railcarIndex === i;
                            return (
                              <div key={i} className={`flex justify-between items-center text-xs p-1 px-2 rounded border ${isInspecting ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-100'}`}>
                                <button type="button" onClick={() => setInspectRailcarRef({ vehicleId: trainId, railcarIndex: i })} className="flex-1 text-left font-mono text-slate-600 capitalize hover:underline truncate">
                                  {i + 1}. {rt.replace(/-/g, ' ')} — {cargoSummary}
                                </button>
                                <div className="flex gap-1 shrink-0">
                                  <button onClick={() => modifySelectedRailcars('move', { from: i, to: i - 1 }, trainFilteredSelection)} disabled={i === 0 || !roomCode} className="hover:text-slate-900 disabled:opacity-30">▲</button>
                                  <button onClick={() => modifySelectedRailcars('move', { from: i, to: i + 1 }, trainFilteredSelection)} disabled={i === railcars.length - 1 || !roomCode} className="hover:text-slate-900 disabled:opacity-30">▼</button>
                                  <button onClick={() => modifySelectedRailcars('remove', i, trainFilteredSelection)} disabled={!roomCode} className="text-red-500 hover:text-red-600 disabled:opacity-30"><Trash2 className="w-3 h-3" /></button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1">
                        {(['passenger', 'flatbed', 'boxcar', 'container', 'closed-hopper', 'open-hopper', 'tank'] as RailcarType[]).map(rt => (
                          <button
                            key={rt}
                            onClick={() => modifySelectedRailcars('add', rt, trainFilteredSelection)}
                            disabled={!roomCode || railcars.length >= 12}
                            className="px-2 py-1 text-[10px] uppercase font-bold rounded border border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                          >
                            + {rt.replace(/-/g, ' ')}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {trainFilteredSelection.size !== 1 && trainFilteredSelection.size > 0 && (
                  <div className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg p-2">
                    Select a single train to manage its railcars.
                  </div>
                )}
              </div>

              <div className="shrink-0 p-4 border-t border-slate-200 bg-slate-50/50 max-h-[40vh] overflow-y-auto overscroll-contain">
                <VehicleMotionControls
                  panelType="train"
                  filteredSelection={trainFilteredSelection}
                  vehicles={vehicles}
                  roomCode={roomCode}
                  pendingRouteVehicleId={pendingRouteVehicleId}
                  isPlacingVehicles={isPlacingVehicles}
                  onSpeedChange={(s) => changeSelectedCarsSpeed(s, trainFilteredSelection)}
                  onToggleAttribute={(a) => toggleSelectedCarsAttribute(a, trainFilteredSelection)}
                  onDistribute={() => distributeSelectedCars(trainFilteredSelection)}
                  onToggleDestination={() => toggleDestinationMode(trainFilteredSelection)}
                  onPark={() => parkSelectedVehicles(trainFilteredSelection)}
                  onUnpark={() => unparkSelectedVehicles(trainFilteredSelection)}
                  onTogglePlacing={() => {
                    const next = !isPlacingVehicles;
                    setIsPlacingVehicles(next);
                    if (next) setPendingRouteVehicleId(null);
                  }}
                  showParkControls={false}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

          {/* Building Economy Inspector Modal (new) */}
          <AnimatePresence>
            {inspectBuildingKey && economy.buildings[inspectBuildingKey] && (
              <BuildingInspectorModal
                bkey={inspectBuildingKey}
                cfg={economy.buildings[inspectBuildingKey]}
                economy={economy}
                grid={grid}
                vehicles={vehicles}
                setEconomy={setEconomy}
                setVehicles={setVehicles}
                roomCode={roomCode}
                onClose={() => setInspectBuildingKey(null)}
                onOpenTrailer={(ref) => setInspectTrailerRef(ref)}
              />
            )}
          </AnimatePresence>

          {/* Railcar Inspector Modal */}
          <AnimatePresence>
            {inspectRailcarRef && (
              <RailcarInspectorModal
                railcarRef={inspectRailcarRef}
                vehicles={vehicles}
                economy={economy}
                grid={grid}
                setEconomy={setEconomy}
                setVehicles={setVehicles}
                roomCode={roomCode}
                onClose={() => setInspectRailcarRef(null)}
              />
            )}
          </AnimatePresence>

          {/* Trailer Inspector Modal */}
          <AnimatePresence>
            {inspectTrailerRef && (
              <TrailerInspectorModal
                trailerRef={inspectTrailerRef}
                vehicles={vehicles}
                economy={economy}
                grid={grid}
                setEconomy={setEconomy}
                setVehicles={setVehicles}
                roomCode={roomCode}
                onClose={() => setInspectTrailerRef(null)}
                onPickup={pickupParkedTrailer}
                onDrop={dropTrailerFromSemi}
              />
            )}
          </AnimatePresence>

          {/* Modals */}
          <AnimatePresence>
            {showDeleteSimulationConfirm && (
              <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-[110] flex items-center justify-center p-4" data-grid-control {...blockGridPointerEvents}>
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white border border-slate-200 rounded-[2rem] p-8 shadow-2xl max-w-sm w-full text-center"
                >
                  <div className="bg-red-100 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <Trash2 className="w-8 h-8 text-red-600" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Delete Simulation?</h3>
                  <p className="text-slate-500 mb-8 leading-relaxed">
                    Are you sure you want to delete <span className="font-bold text-slate-700">"{showDeleteSimulationConfirm.name}"</span>? This action cannot be undone.
                  </p>
                  <div className="flex gap-3">
                    <button 
                      onClick={() => setShowDeleteSimulationConfirm(null)}
                      className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={confirmDeleteSimulation}
                      className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
                    >
                      Delete
                    </button>
                  </div>
                </motion.div>
              </div>
            )}

            {showSaveSimulationConfirm && (
              <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-[110] flex items-center justify-center p-4" data-grid-control {...blockGridPointerEvents}>
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white border border-slate-200 rounded-[2rem] p-8 shadow-2xl max-w-sm w-full text-center"
                >
                  <div className="bg-purple-100 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <Save className="w-8 h-8 text-purple-600" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Save Simulation?</h3>
                  <p className="text-slate-500 mb-8">
                    Your Simulation name is active. Would you like to save it?
                  </p>
                  <div className="flex gap-3">
                    <button 
                      onClick={() => setShowSaveSimulationConfirm(false)}
                      className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={() => {
                        saveToSimulations();
                        setShowSaveSimulationConfirm(false);
                      }}
                      className="flex-1 py-3 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition-colors"
                    >
                      Save
                    </button>
                  </div>
                </motion.div>
              </div>
            )}

            {showDeleteLayoutConfirm && (
              <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-[110] flex items-center justify-center p-4" data-grid-control {...blockGridPointerEvents}>
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white border border-slate-200 rounded-[2rem] p-8 shadow-2xl max-w-sm w-full text-center"
                >
                  <div className="bg-red-100 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <Trash2 className="w-8 h-8 text-red-600" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Delete Layout?</h3>
                  <p className="text-slate-500 mb-8 leading-relaxed">
                    Are you sure you want to delete <span className="font-bold text-slate-700">"{showDeleteLayoutConfirm.name}"</span>? This action cannot be undone.
                  </p>
                  <div className="flex gap-3">
                    <button 
                      onClick={() => setShowDeleteLayoutConfirm(null)}
                      className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={confirmDeleteFromLibrary}
                      className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
                    >
                      Delete
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
            {showClearConfirm && (
              <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-[110] flex items-center justify-center p-4" data-grid-control {...blockGridPointerEvents}>
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white border border-slate-200 rounded-[2rem] p-8 shadow-2xl max-w-sm w-full text-center"
                >
                  <div className="bg-red-100 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <Trash2 className="w-8 h-8 text-red-600" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">
                    {selectionStart && selectionEnd ? 'Clear Selection?' : 'Clear Grid?'}
                  </h3>
                  <p className="text-slate-500 mb-8">
                    {selectionStart && selectionEnd 
                      ? 'This will permanently delete all tiles within the selected area.' 
                      : 'This will permanently delete all tiles in the current grid. This action cannot be undone.'}
                  </p>
                  <div className="flex gap-3">
                    <button 
                      onClick={() => setShowClearConfirm(false)}
                      className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={() => {
                        if (selectionStart && selectionEnd) {
                          deleteSelection();
                        } else {
                          clearGrid();
                        }
                        setShowClearConfirm(false);
                      }}
                      className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors"
                    >
                      Clear {selectionStart && selectionEnd ? 'Selection' : 'All'}
                    </button>
                  </div>
                </motion.div>
              </div>
            )}

            {showSaveConfirm && (
              <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-[110] flex items-center justify-center p-4" data-grid-control {...blockGridPointerEvents}>
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white border border-slate-200 rounded-[2rem] p-8 shadow-2xl max-w-sm w-full text-center"
                >
                  <div className="bg-blue-100 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <Save className="w-8 h-8 text-blue-600" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Save Entire Grid?</h3>
                  <p className="text-slate-500 mb-8">
                    You don't have a selection active. Would you like to save the entire layout to your library?
                  </p>
                  <div className="flex gap-3">
                    <button 
                      onClick={() => setShowSaveConfirm(false)}
                      className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={() => {
                        saveToLibrary(true);
                        setShowSaveConfirm(false);
                      }}
                      className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors"
                    >
                      Save All
                    </button>
                  </div>
                </motion.div>
              </div>
            )}

            {showLoadConfirm && pendingLayout && (
              <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-[110] flex items-center justify-center p-4" data-grid-control {...blockGridPointerEvents}>
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white border border-slate-200 rounded-[2rem] p-8 shadow-2xl max-w-sm w-full text-center"
                >
                  <div className="bg-blue-100 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <ClipboardPaste className="w-8 h-8 text-blue-600" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Load Layout</h3>
                  <p className="text-slate-500 mb-8">
                    Would you like to replace your entire city with this layout, or paste it into your existing city?
                  </p>
                  <div className="flex flex-col gap-3">
                    <button 
                      onClick={() => {
                        setGrid(pendingLayout);
                        addToHistory(pendingLayout);
                        setShowLoadConfirm(false);
                        setPendingLayout(null);
                      }}
                      className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors"
                    >
                      Replace Entire Layout
                    </button>
                    <button 
                      onClick={() => {
                        setClipboard(pendingLayout);
                        setIsPasting(true);
                        setSelectedTile(null);
                        setShowLoadConfirm(false);
                        setPendingLayout(null);
                      }}
                      className="w-full py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors"
                    >
                      Paste into Existing
                    </button>
                    <button 
                      onClick={() => {
                        setShowLoadConfirm(false);
                        setPendingLayout(null);
                      }}
                      className="w-full py-2 text-slate-400 text-xs hover:text-slate-600 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </motion.div>
              </div>
            )}


          {densityModal.type && (
            <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm z-50 flex items-center justify-center p-4" data-grid-control {...blockGridPointerEvents}>
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-white border border-slate-200 rounded-3xl p-8 shadow-2xl max-w-sm w-full relative"
              >
                <button 
                  onClick={() => setDensityModal({ type: null })}
                  className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
                <h3 className="text-2xl font-bold mb-2 flex items-center gap-3">
                  <div className="bg-blue-100 p-2 rounded-xl">
                    {densityModal.type === 'road' ? <Route className="w-6 h-6 text-blue-600" /> : <Train className="w-6 h-6 text-blue-600" />}
                  </div>
                  Generation Density
                </h3>
                <p className="text-slate-500 text-sm mb-6">Choose how dense you want the {densityModal.type} network to be.</p>
                
                <div className="grid grid-cols-1 gap-3">
                  {[
                    { id: 'dense', label: 'Dense', desc: 'Maximum connectivity, urban feel' },
                    { id: 'sparse', label: 'Sparse', desc: 'Balanced network, suburban feel' },
                    { id: 'very-sparse', label: 'Very Sparse', desc: 'Few connections, rural feel' },
                    { id: 'extremely-sparse', label: 'Extremely Sparse', desc: 'Minimal network, isolated feel' }
                  ].map((d) => (
                    <button
                      key={d.id}
                      onClick={() => {
                        if (densityModal.type === 'road') randomRoads(d.id as any);
                        else if (densityModal.type === 'rail') randomRails(d.id as any);
                        else if (densityModal.type === 'map') generateMap(d.id as any);
                        setDensityModal({ type: null });
                      }}
                      className="flex flex-col items-start p-4 border-2 border-slate-100 rounded-2xl hover:border-blue-500 hover:bg-blue-50 transition-all text-left group"
                    >
                      <span className="font-bold text-slate-800 group-hover:text-blue-700">{d.label}</span>
                      <span className="text-xs text-slate-500">{d.desc}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            </div>
          )}

          {showInfo && (
            <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm z-50 flex items-center justify-center p-4" data-grid-control {...blockGridPointerEvents}>
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-white border border-slate-200 rounded-3xl p-8 shadow-2xl max-w-md w-full relative"
              >
                <button 
                  onClick={() => setShowInfo(false)}
                  className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
                <h3 className="text-2xl font-bold mb-6 flex items-center gap-3">
                  <div className="bg-blue-100 p-2 rounded-xl">
                    <Info className="w-6 h-6 text-blue-600" />
                  </div>
                  How to Design
                </h3>
                <ul className="space-y-4 text-slate-600">
                  <li className="flex items-start gap-4">
                    <div className="bg-slate-100 px-2 py-1 rounded text-xs font-bold text-slate-500 mt-0.5">CLICK</div>
                    <p>Place the selected tile on the grid.</p>
                  </li>
                  <li className="flex items-start gap-4">
                    <div className="bg-slate-100 px-2 py-1 rounded text-xs font-bold text-slate-500 mt-0.5">ALT+DRAG</div>
                    <p>Select a region of tiles.</p>
                  </li>
                  <li className="flex items-start gap-4">
                    <div className="bg-slate-100 px-2 py-1 rounded text-xs font-bold text-slate-500 mt-0.5">CTRL+C/X/V</div>
                    <p>Copy, Cut, and Paste selected regions.</p>
                  </li>
                  <li className="flex items-start gap-4">
                    <div className="bg-slate-100 px-2 py-1 rounded text-xs font-bold text-slate-500 mt-0.5">CTRL+Z/Y</div>
                    <p>Undo and Redo your actions.</p>
                  </li>
                  <li className="flex items-start gap-4">
                    <div className="bg-slate-100 px-2 py-1 rounded text-xs font-bold text-slate-500 mt-0.5">SHIFT+CLICK</div>
                    <p>Remove a tile from the grid.</p>
                  </li>
                  <li className="flex items-start gap-4">
                    <div className="bg-slate-100 px-2 py-1 rounded text-xs font-bold text-slate-500 mt-0.5">DRAG</div>
                    <p>Pan around the infinite grid.</p>
                  </li>
                  <li className="flex items-start gap-4">
                    <div className="bg-slate-100 px-2 py-1 rounded text-xs font-bold text-slate-500 mt-0.5">SCROLL</div>
                    <p>Zoom in and out of your design.</p>
                  </li>
                  <li className="flex items-start gap-4">
                    <div className="bg-slate-100 px-2 py-1 rounded text-xs font-bold text-slate-500 mt-0.5">R KEY</div>
                    <p>Rotate the selected tile by 90 degrees.</p>
                  </li>
                  <li className="flex items-start gap-4">
                    <div className="bg-blue-100 px-2 py-1 rounded text-xs font-bold text-blue-500 mt-0.5">G / S</div>
                    <p>Drive vehicle continuously (G) or Stop (S).</p>
                  </li>
                  <li className="flex items-start gap-4">
                    <div className="bg-blue-100 px-2 py-1 rounded text-xs font-bold text-blue-500 mt-0.5">UP / DOWN</div>
                    <p>Accelerate or Decelerate vehicle.</p>
                  </li>
                  <li className="flex items-start gap-4">
                    <div className="bg-blue-100 px-2 py-1 rounded text-xs font-bold text-blue-500 mt-0.5">L / R</div>
                    <p>Turn at intersections, or change lanes on 4-lane roads.</p>
                  </li>
                </ul>
                <button 
                  onClick={() => setShowInfo(false)}
                  className="mt-8 w-full py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 active:scale-95"
                >
                  Start Building
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
