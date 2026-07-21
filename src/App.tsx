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
  Truck,
  Timer,
  Link2,
  Unlink,
  Flame,
  Shield,
  Cross,
  Wrench,
  Siren,
  Bus,
  CarTaxiFront,
  Users,
  Home,
  UserPlus,
  UserMinus,
  Pencil,
  Briefcase,
} from 'lucide-react';
import { Tile } from './components/Tile';
import { Vehicle as VehicleComponent, ParkedTrailerVisual } from './components/Vehicle';
import { TrafficOverlay, getAllTrafficControls, trafficControlKey } from './components/TrafficOverlay';
import { RemoteCursors } from './components/RemoteCursors';
import { diffGrid, mergeAcceptedIntoBaseline } from './gridSync';
import {
  TileType, GridData, Point, GridTile, Vehicle, VehicleType, RailcarType, EconomyState, BuildingConfig,
  ItemDef, Cargo, ItemId, PlantGrowthSettings, ParkedTrailer, TrafficState, TrafficControl, TrafficLightPhase,
  RemoteCursor, LayoutSnapshot, ServiceVehicleType, SERVICE_VEHICLE_TYPES, isServiceVehicleType,
  hasEmergencyLights,
  RepairRecipe, ActiveRepair, IllnessRecipe, ActivePatient,
  Person, Family,
} from './types';
import {
  populateHomes,
  tickPeopleSimulation,
  personDisplayName,
  formatAge,
  locationLabel,
  getMaxPassengers,
  boardPerson,
  alightPerson,
  canBoardAsDriver,
  canBoardAsPassenger,
  getDriverId,
  getPassengerIds,
  getPeopleInVehicle,
  peopleAtHome,
  peopleResidingAt,
  familiesAtHome,
  peopleInBuilding,
  syncVehicleOccupancy,
  isAdult,
  MS_PER_AGE_YEAR,
  countEmployeesAtBuilding,
  assignPeopleWorkplace,
  createPerson,
  randomFirstName,
  randomLastName,
  listHomeKeys,
} from './people';
import {
  DEFAULT_TRAFFIC_STATE,
  normalizeTraffic,
  isRoadTile,
  canPlaceStopSignOnTile,
  getGroundRoadTile,
  detectStopSignPlacementClick,
  getTrafficRoadTile,
  detectLightSlotClick,
  createStopSign,
  findStopSignAt,
  createStoplight,
  cycleLightPhase,
  advanceLightPhase,
  coordinateLightGroup,
  getLightGroupSize,
  unlinkStoplights,
  shouldStopForSign,
  findStopSignForVehicle,
  shouldStopForLight,
  hasConflictingTraffic,
  getAvailableLightSlots,
  getStoplightsAt,
  edgePortLabel,
} from './traffic';
import {
  canResumeAfterVehicleStop,
  findMaxSafeProgress,
} from './vehicleCollision';
import socket from './socket';

const GRID_SIZE = 64;
/** Retry delayed grid edits after server rejects due to another user's cell lock. */
const CELL_LOCK_RETRY_MS = 200;
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
  // Service bays driveable from any adjacent road / bay cell
  'building-repair-shop': [0, 1, 2, 3],
  'building-hospital': [0, 1, 2, 3],
  // Houses are approachable driveway-style parking for assigned cars
  'building-home': [0, 1, 2, 3],
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
  // 4 bays wide × 6 deep (shop + long service bays for any vehicle size)
  if (type === 'building-repair-shop') return { w: 4, h: 6 };
  // 4×4 hospital: wards + ambulance parking strip
  if (type === 'building-hospital') return { w: 4, h: 4 };
  return { w: 1, h: 1 };
}

// Economy / dock helpers (new buildings)
export function isEconomyBuilding(type: string): boolean {
  return type.startsWith('building-') && (
    type.includes('warehouse') || type.includes('factory') || type === 'building-store' ||
    type === 'building-strip-mall' || type === 'building-lumbermill' || type === 'building-station' ||
    type === 'building-train-station-large' || type === 'building-repair-shop' ||
    type === 'building-hospital'
  );
}

export function getBuildingRole(type: string): BuildingConfig['role'] {
  if (type === 'building-warehouse' || type === 'building-warehouse-large') return 'warehouse';
  if (type === 'building-factory' || type === 'building-factory-large') return 'factory';
  if (type === 'building-lumbermill') return 'lumbermill';
  if (type === 'building-store' || type === 'building-strip-mall') return 'store';
  if (type === 'building-repair-shop') return 'repair-shop';
  if (type === 'building-hospital') return 'hospital';
  return 'none';
}

/** Service bay rows are the bottom 3 tiles of the 4×6 repair shop (deep enough for semis). */
export function isRepairShopServiceBay(tile: GridTile | undefined | null): boolean {
  if (!tile || tile.type !== 'building-repair-shop') return false;
  return (tile.localY ?? 0) >= 3;
}

export function getRepairShopBayIndex(tile: GridTile): number {
  return Math.max(0, Math.min(3, tile.localX ?? 0));
}

/** Ambulance parking: bottom 2 rows of the 4×4 hospital (4 bays × 2 deep). */
export function isHospitalAmbulanceBay(tile: GridTile | undefined | null): boolean {
  if (!tile || tile.type !== 'building-hospital') return false;
  return (tile.localY ?? 0) >= 2;
}

export function getHospitalBayIndex(tile: GridTile): number {
  return Math.max(0, Math.min(3, tile.localX ?? 0));
}

/** Any building cell that vehicles can park in (repair bays or hospital ambulance bays). */
export function isBuildingParkingBay(tile: GridTile | undefined | null): boolean {
  return isRepairShopServiceBay(tile) || isHospitalAmbulanceBay(tile);
}

export function getBuildingParkingBayIndex(tile: GridTile): number {
  if (isHospitalAmbulanceBay(tile)) return getHospitalBayIndex(tile);
  return getRepairShopBayIndex(tile);
}

export const DEFAULT_REPAIR_RECIPES: RepairRecipe[] = [
  {
    id: 'oil-change',
    name: 'Oil Change',
    description: 'Drain and refill engine oil, replace filter.',
    inputs: [{ item: 'motor-oil', amount: 1 }, { item: 'oil-filter', amount: 1 }],
    cycleTimeSec: 12,
  },
  {
    id: 'tire-swap',
    name: 'Tire Replacement',
    description: 'Mount and balance a new tire.',
    inputs: [{ item: 'tire', amount: 1 }],
    cycleTimeSec: 18,
  },
  {
    id: 'brake-job',
    name: 'Brake Job',
    description: 'Replace pads and resurface rotors.',
    inputs: [{ item: 'brake-pads', amount: 1 }, { item: 'brake-fluid', amount: 1 }],
    cycleTimeSec: 24,
  },
  {
    id: 'battery-service',
    name: 'Battery Service',
    description: 'Test and replace the vehicle battery.',
    inputs: [{ item: 'battery', amount: 1 }],
    cycleTimeSec: 10,
  },
  {
    id: 'engine-repair',
    name: 'Engine Repair',
    description: 'Major mechanical repair using engine parts.',
    inputs: [{ item: 'engine-parts', amount: 2 }, { item: 'motor-oil', amount: 1 }],
    cycleTimeSec: 45,
  },
  {
    id: 'body-work',
    name: 'Body Work',
    description: 'Panel replacement and finish supplies.',
    inputs: [{ item: 'body-panels', amount: 1 }, { item: 'paint', amount: 1 }],
    cycleTimeSec: 36,
  },
  {
    id: 'tow-hookup',
    name: 'Tow Hookup Prep',
    description: 'Inspect and prep a vehicle for towing.',
    inputs: [{ item: 'tow-supplies', amount: 1 }],
    cycleTimeSec: 8,
    vehicleTypes: ['tow-truck', 'car', 'semi', 'fire-truck', 'police', 'ambulance'],
  },
];

export const SERVICE_VEHICLE_META: Record<
  ServiceVehicleType,
  { label: string; color: string; emoji: string }
> = {
  'fire-truck': { label: 'Fire Truck', color: '#dc2626', emoji: '🚒' },
  police: { label: 'Police Car', color: '#1e3a8a', emoji: '🚓' },
  ambulance: { label: 'Ambulance', color: '#f8fafc', emoji: '🚑' },
  'tow-truck': { label: 'Tow Truck', color: '#ca8a04', emoji: '🚛' },
  taxi: { label: 'Taxi', color: '#facc15', emoji: '🚕' },
  bus: { label: 'Bus', color: '#2563eb', emoji: '🚌' },
};

export const DEFAULT_ILLNESS_RECIPES: IllnessRecipe[] = [
  {
    id: 'flu',
    name: 'Flu / Viral Infection',
    description: 'Rest, fluids, and antiviral support.',
    inputs: [{ item: 'medicine', amount: 1 }, { item: 'iv-fluids', amount: 1 }],
    stayDurationSec: 20,
    vehicleTypes: ['ambulance'],
  },
  {
    id: 'broken-bone',
    name: 'Broken Bone',
    description: 'Set, cast, and pain management.',
    inputs: [{ item: 'bandages', amount: 2 }, { item: 'painkillers', amount: 1 }],
    stayDurationSec: 40,
    vehicleTypes: ['ambulance'],
  },
  {
    id: 'cardiac',
    name: 'Cardiac Event',
    description: 'Stabilize heart rhythm and monitor.',
    inputs: [{ item: 'defibrillator-pads', amount: 1 }, { item: 'epinephrine', amount: 1 }, { item: 'iv-fluids', amount: 1 }],
    stayDurationSec: 55,
    vehicleTypes: ['ambulance'],
  },
  {
    id: 'trauma',
    name: 'Trauma / Accident',
    description: 'Emergency trauma care and transfusion support.',
    inputs: [{ item: 'blood-bags', amount: 2 }, { item: 'bandages', amount: 2 }, { item: 'painkillers', amount: 1 }],
    stayDurationSec: 70,
    vehicleTypes: ['ambulance'],
  },
  {
    id: 'infection',
    name: 'Severe Infection',
    description: 'IV antibiotics and monitoring.',
    inputs: [{ item: 'antibiotics', amount: 2 }, { item: 'iv-fluids', amount: 1 }],
    stayDurationSec: 35,
    vehicleTypes: ['ambulance'],
  },
  {
    id: 'observation',
    name: 'Observation / Checkup',
    description: 'Short stay for evaluation.',
    inputs: [{ item: 'medicine', amount: 1 }],
    stayDurationSec: 12,
  },
];

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
  'motor-oil': '🛢️',
  'oil-filter': '🔧',
  tire: '🛞',
  'brake-pads': '🛑',
  'brake-fluid': '🧴',
  battery: '🔋',
  'engine-parts': '⚙️',
  'body-panels': '🪟',
  paint: '🎨',
  'tow-supplies': '🪝',
  medicine: '💊',
  bandages: '🩹',
  painkillers: '💉',
  'blood-bags': '🩸',
  'iv-fluids': '💧',
  antibiotics: '🧴',
  'defibrillator-pads': '⚡',
  epinephrine: '🧪',
  'medical-supplies': '🏥',
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

/** Human-readable label from an item id (e.g. "motor-oil" → "Motor Oil"). */
function itemIdToDisplayName(itemId: string): string {
  return itemId
    .split(/[-_]/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ') || itemId;
}

function makeItemDef(itemId: string, existing?: ItemDef): ItemDef {
  if (existing?.id) {
    return {
      id: existing.id,
      name: existing.name || itemIdToDisplayName(existing.id),
      emoji: existing.emoji || guessItemEmoji(existing.id),
    };
  }
  return {
    id: itemId,
    name: itemIdToDisplayName(itemId),
    emoji: guessItemEmoji(itemId),
  };
}

/**
 * Collect item ids required/produced/stored by a building.
 * Includes inventory stock, consumption rates, recipe I/O, and shop/hospital protocol inputs.
 * Capacity-only keys are ignored so default capacities cannot re-add a deleted Logistics item.
 */
function collectItemIdsFromBuilding(cfg: BuildingConfig | undefined | null): string[] {
  if (!cfg) return [];
  const ids = new Set<string>();
  const add = (id?: string) => {
    if (id && typeof id === 'string' && id.trim()) ids.add(id.trim());
  };
  Object.keys(cfg.inventory || {}).forEach(add);
  Object.keys(cfg.consumptionRates || {}).forEach(add);
  (cfg.recipeInputs || []).forEach(r => add(r?.item));
  (cfg.recipeOutputs || []).forEach(r => add(r?.item));
  (cfg.repairRecipes || []).forEach(r => (r.inputs || []).forEach(i => add(i?.item)));
  (cfg.illnessRecipes || []).forEach(r => (r.inputs || []).forEach(i => add(i?.item)));
  return Array.from(ids);
}

/** All item ids required/produced/stored by buildings (and optional parked trailer cargo). */
function collectReferencedItemIds(
  buildings: Record<string, BuildingConfig> | undefined,
  parkedTrailers?: Record<string, ParkedTrailer>,
): Set<string> {
  const ids = new Set<string>();
  Object.values(buildings || {}).forEach(cfg => {
    collectItemIdsFromBuilding(cfg).forEach(id => ids.add(id));
  });
  Object.values(parkedTrailers || {}).forEach(t => {
    Object.keys(t?.cargo || {}).forEach(id => {
      if (id) ids.add(id);
    });
  });
  return ids;
}

/**
 * Ensure Logistics itemDefs includes every item referenced by buildings.
 * Existing defs keep name/emoji; new ones get a display name + guessed emoji.
 */
function mergeItemDefsWithBuildingReferences(
  itemDefs: ItemDef[] | undefined,
  buildings: Record<string, BuildingConfig> | undefined,
  parkedTrailers?: Record<string, ParkedTrailer>,
): ItemDef[] {
  const byId = new Map<string, ItemDef>();
  (itemDefs || []).forEach(d => {
    if (d?.id) byId.set(d.id, makeItemDef(d.id, d));
  });
  collectReferencedItemIds(buildings, parkedTrailers).forEach(id => {
    if (!byId.has(id)) byId.set(id, makeItemDef(id));
  });
  return Array.from(byId.values()).sort((a, b) =>
    (a.name || a.id).localeCompare(b.name || b.id, undefined, { sensitivity: 'base' }),
  );
}

/** Remove an item from a single building wherever it is referenced. */
function stripItemFromBuilding(cfg: BuildingConfig, itemId: string): BuildingConfig {
  const inventory = { ...(cfg.inventory || {}) };
  delete inventory[itemId];
  const inventoryCapacity = { ...(cfg.inventoryCapacity || {}) };
  delete inventoryCapacity[itemId];
  let consumptionRates = cfg.consumptionRates ? { ...cfg.consumptionRates } : undefined;
  if (consumptionRates) {
    delete consumptionRates[itemId];
    if (Object.keys(consumptionRates).length === 0 && cfg.role !== 'store') {
      consumptionRates = undefined;
    }
  }
  return {
    ...cfg,
    inventory,
    inventoryCapacity: Object.keys(inventoryCapacity).length > 0 ? inventoryCapacity : cfg.inventoryCapacity,
    consumptionRates,
    recipeInputs: cfg.recipeInputs
      ? cfg.recipeInputs.filter(r => r.item !== itemId)
      : cfg.recipeInputs,
    recipeOutputs: cfg.recipeOutputs
      ? cfg.recipeOutputs.filter(r => r.item !== itemId)
      : cfg.recipeOutputs,
    repairRecipes: cfg.repairRecipes
      ? cfg.repairRecipes.map(r => ({
          ...r,
          inputs: (r.inputs || []).filter(i => i.item !== itemId),
        }))
      : cfg.repairRecipes,
    illnessRecipes: cfg.illnessRecipes
      ? cfg.illnessRecipes.map(r => ({
          ...r,
          inputs: (r.inputs || []).filter(i => i.item !== itemId),
        }))
      : cfg.illnessRecipes,
  };
}

/** Delete an item from Logistics and strip it from all buildings / parked trailers. */
function removeItemFromEconomy(economy: EconomyState, itemId: string): EconomyState {
  const buildings: Record<string, BuildingConfig> = {};
  Object.entries(economy.buildings || {}).forEach(([k, b]) => {
    buildings[k] = stripItemFromBuilding(b, itemId);
  });
  const parkedTrailers: Record<string, ParkedTrailer> = { ...(economy.parkedTrailers || {}) };
  Object.keys(parkedTrailers).forEach(tid => {
    const t = parkedTrailers[tid];
    if (!t?.cargo || !(itemId in t.cargo)) return;
    const cargo = { ...t.cargo };
    delete cargo[itemId];
    parkedTrailers[tid] = { ...t, cargo };
  });
  return {
    ...economy,
    itemDefs: (economy.itemDefs || []).filter(d => d.id !== itemId),
    buildings,
    parkedTrailers,
  };
}

/** Strip an item from vehicle trailer/railcar cargos (not part of EconomyState). */
function stripItemFromVehicles(
  vehicles: Record<string, Vehicle>,
  itemId: string,
): Record<string, Vehicle> {
  const next: Record<string, Vehicle> = {};
  let changed = false;
  Object.entries(vehicles || {}).forEach(([vid, v]) => {
    let nv = v;
    if (v.trailerCargos?.some(c => c && itemId in c)) {
      nv = {
        ...nv,
        trailerCargos: v.trailerCargos!.map(c => {
          if (!c || !(itemId in c)) return c;
          const cargo = { ...c };
          delete cargo[itemId];
          return cargo;
        }),
      };
      changed = true;
    }
    if (v.railcarCargos?.some(c => c && itemId in c)) {
      nv = {
        ...nv,
        railcarCargos: (nv.railcarCargos || v.railcarCargos)!.map(c => {
          if (!c || !(itemId in c)) return c;
          const cargo = { ...c };
          delete cargo[itemId];
          return cargo;
        }),
      };
      changed = true;
    }
    next[vid] = nv;
  });
  return changed ? next : vehicles;
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
  if (type === 'fire-truck') return <Flame className={`${cls} text-red-500`} aria-hidden />;
  if (type === 'police') return <Shield className={`${cls} text-blue-700`} aria-hidden />;
  if (type === 'ambulance') return <Cross className={`${cls} text-red-400`} aria-hidden />;
  if (type === 'tow-truck') return <Wrench className={`${cls} text-amber-600`} aria-hidden />;
  if (type === 'taxi') return <CarTaxiFront className={`${cls} text-yellow-500`} aria-hidden />;
  if (type === 'bus') return <Bus className={`${cls} text-blue-600`} aria-hidden />;
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
  if (role === 'repair-shop') return 80;
  if (role === 'hospital') return 100;
  return DEFAULT_INVENTORY_CAPACITY;
}

function buildDefaultInventoryCapacities(cfg: BuildingConfig): Record<string, number> {
  const caps: Record<string, number> = { ...(cfg.inventoryCapacity || {}) };
  const seedItems = new Set<string>();
  Object.keys(cfg.inventory || {}).forEach(id => seedItems.add(id));
  (cfg.recipeInputs || []).forEach(i => i.item && seedItems.add(i.item));
  (cfg.recipeOutputs || []).forEach(o => o.item && seedItems.add(o.item));
  (cfg.repairRecipes || []).forEach(r => (r.inputs || []).forEach(i => i.item && seedItems.add(i.item)));
  (cfg.illnessRecipes || []).forEach(r => (r.inputs || []).forEach(i => i.item && seedItems.add(i.item)));
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
  staffCount = 0,
  requiredStaff = 0,
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
  staffCount?: number;
  requiredStaff?: number;
}) {
  const footprintW = buildingW * GRID_SIZE;
  const footprintH = buildingH * GRID_SIZE;
  const understaffed = requiredStaff > 0 && staffCount < requiredStaff;

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

        {requiredStaff > 0 && (
          <span
            className={`inline-flex items-center gap-px px-0.5 py-px rounded border text-[8px] font-bold leading-none shadow-sm ${
              understaffed
                ? 'bg-rose-100/95 border-rose-300 text-rose-900'
                : 'bg-emerald-100/95 border-emerald-300 text-emerald-900'
            }`}
            title={`${staffCount}/${requiredStaff} employees assigned`}
          >
            👷{staffCount}/{requiredStaff}
          </span>
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
            {cycleRemaining !== null && !understaffed ? (
              <CycleCountdownBadge remaining={cycleRemaining} className="text-[8px] px-0.5 py-px" />
            ) : understaffed ? (
              <span className="inline-flex items-center gap-px px-0.5 py-px rounded border text-[8px] font-bold leading-none shadow-sm bg-rose-100/95 border-rose-300 text-rose-900">
                Need staff
              </span>
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

export type VehiclePanelType = 'car' | 'semi' | 'train' | 'service';

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
  if (panelType === 'service') return isServiceVehicleType(v.type);
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

function isHouseTile(tile: GridTile | undefined | null): boolean {
  return !!tile && tile.type === 'building-home';
}

/** Badge overlay: people currently at home on a house tile. */
function HomeOccupancyBadge({
  atHomeCount,
  residentCount,
}: {
  atHomeCount: number;
  residentCount: number;
}) {
  if (residentCount === 0 && atHomeCount === 0) return null;
  return (
    <div
      className="absolute inset-0 pointer-events-none z-10 flex items-start justify-center pt-1"
      style={{ width: GRID_SIZE, height: GRID_SIZE }}
    >
      <span
        className={`inline-flex items-center gap-0.5 px-1 py-px rounded-full border text-[9px] font-bold leading-none shadow-sm ${
          atHomeCount > 0
            ? 'bg-violet-100/95 border-violet-300 text-violet-950'
            : 'bg-slate-100/95 border-slate-300 text-slate-600'
        }`}
        title={`${atHomeCount} at home · ${residentCount} resident${residentCount === 1 ? '' : 's'}`}
      >
        <span className="text-[10px]">🏠</span>
        <span>{atHomeCount}</span>
        {residentCount > 0 && residentCount !== atHomeCount && (
          <span className="text-[8px] font-semibold opacity-70">/{residentCount}</span>
        )}
      </span>
    </div>
  );
}

function HomeInspectorModal({
  homeKey,
  economy,
  vehicles,
  onClose,
  onSelectPerson,
}: {
  homeKey: string;
  economy: EconomyState;
  vehicles: Record<string, Vehicle>;
  onClose: () => void;
  onSelectPerson?: (personId: string) => void;
}) {
  const people = economy.people || {};
  const residents = peopleResidingAt(people, homeKey).sort((a, b) =>
    personDisplayName(a).localeCompare(personDisplayName(b)),
  );
  const atHome = peopleAtHome(people, homeKey);
  const atHomeIds = new Set(atHome.map(p => p.id));
  const families = familiesAtHome(economy.families, people, homeKey);
  const carsAtHome = Object.values(vehicles).filter(
    v => v.homeKey === homeKey || `${v.x},${v.y}` === homeKey,
  );

  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const [position, setPosition] = useState<Point | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const centerPanel = useCallback(() => {
    const overlay = overlayRef.current;
    const panel = panelRef.current;
    if (!overlay || !panel) return;
    const x = Math.max(0, (overlay.clientWidth - panel.offsetWidth) / 2);
    const y = Math.max(0, (overlay.clientHeight - panel.offsetHeight) / 2);
    setPosition({ x, y });
  }, []);

  useLayoutEffect(() => {
    centerPanel();
  }, [homeKey, centerPanel]);

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

  const activityLabel = (p: Person) => {
    if (atHomeIds.has(p.id)) return 'At home';
    return p.activity || locationLabel(p.location);
  };

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 z-[120] pointer-events-none"
      data-grid-control
      {...blockGridPointerEvents}
    >
      <div
        ref={panelRef}
        className="absolute pointer-events-auto bg-white rounded-2xl shadow-2xl border border-violet-200 w-[22rem] max-h-[min(80vh,560px)] flex flex-col overflow-hidden"
        style={
          position
            ? { left: position.x, top: position.y }
            : { left: '50%', top: '20%', transform: 'translateX(-50%)' }
        }
        onMouseDown={e => e.stopPropagation()}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="shrink-0 px-4 py-3 bg-violet-50 border-b border-violet-100 flex items-center justify-between cursor-move select-none"
          onMouseDown={handleHeaderMouseDown}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 bg-violet-100 text-violet-700 rounded-lg">
              <Home className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="font-bold text-slate-800 text-sm truncate">Home {homeKey}</div>
              <div className="text-[10px] text-violet-700">
                {atHome.length} at home · {residents.length} resident{residents.length === 1 ? '' : 's'} ·{' '}
                {families.length} famil{families.length === 1 ? 'y' : 'ies'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-violet-100 rounded-lg text-slate-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 space-y-3 text-xs">
          {families.length === 0 && residents.length === 0 && (
            <div className="text-center text-slate-400 py-6">
              No one lives here yet. Open People → Populate houses, or create a person with this home.
            </div>
          )}

          {families.map(fam => {
            const members = (fam.memberIds || [])
              .map(id => people[id])
              .filter(Boolean)
              .sort((a, b) => b.ageYears - a.ageYears);
            const homeMembers = members.filter(m => atHomeIds.has(m.id));
            return (
              <div key={fam.id} className="rounded-xl border border-violet-100 bg-violet-50/40 overflow-hidden">
                <div className="px-3 py-2 bg-violet-100/60 border-b border-violet-100 flex items-center justify-between">
                  <div className="font-semibold text-violet-900">
                    {fam.lastName} family
                  </div>
                  <div className="text-[10px] text-violet-700">
                    {homeMembers.length}/{members.length} home
                  </div>
                </div>
                <ul className="divide-y divide-violet-50">
                  {members.length === 0 && (
                    <li className="px-3 py-2 text-slate-400">No members listed</li>
                  )}
                  {members.map(p => {
                    const healthEmoji =
                      p.health === 'healthy' ? '💚' : p.health === 'sick' ? '🤒' : '🩹';
                    const isHome = atHomeIds.has(p.id);
                    return (
                      <li key={p.id} className="px-3 py-2 flex gap-2 items-start">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                            <span>{p.sex === 'm' ? '♂' : '♀'}</span>
                            <span className="truncate">{personDisplayName(p)}</span>
                            <span className="text-slate-400 font-normal">{formatAge(p.ageYears)}</span>
                            <span>{healthEmoji}</span>
                            {isHome && (
                              <span className="text-[9px] px-1 rounded bg-emerald-100 text-emerald-800 font-bold">
                                home
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500 truncate mt-0.5">
                            {activityLabel(p)}
                            {p.workplaceKey ? ` · 👷 ${p.workplaceKey}` : ''}
                            {typeof p.money === 'number' ? ` · $${p.money}` : ''}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">
                            {locationLabel(p.location)}
                          </div>
                        </div>
                        {onSelectPerson && (
                          <button
                            type="button"
                            className="shrink-0 text-[10px] text-violet-600 hover:underline"
                            onClick={() => onSelectPerson(p.id)}
                          >
                            Select
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}

          {/* Residents not in any listed family */}
          {(() => {
            const listed = new Set(families.flatMap(f => f.memberIds || []));
            const orphan = residents.filter(p => !listed.has(p.id));
            if (orphan.length === 0) return null;
            return (
              <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                <div className="px-3 py-2 font-semibold text-slate-700 border-b border-slate-100">
                  Other residents
                </div>
                <ul className="divide-y divide-slate-100">
                  {orphan.map(p => (
                    <li key={p.id} className="px-3 py-2">
                      <div className="font-semibold text-slate-800">
                        {p.sex === 'm' ? '♂' : '♀'} {personDisplayName(p)}{' '}
                        <span className="text-slate-400 font-normal">{formatAge(p.ageYears)}</span>
                        {atHomeIds.has(p.id) && (
                          <span className="ml-1 text-[9px] px-1 rounded bg-emerald-100 text-emerald-800 font-bold">
                            home
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {activityLabel(p)} · {locationLabel(p.location)}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })()}

          {carsAtHome.length > 0 && (
            <div className="rounded-xl border border-slate-200 p-2">
              <div className="font-semibold text-slate-700 mb-1">Vehicles</div>
              <ul className="space-y-0.5 text-[10px] text-slate-600">
                {carsAtHome.map(v => (
                  <li key={v.id} className="flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: v.color }}
                    />
                    <span className="font-mono truncate">{v.id.slice(0, 10)}</span>
                    <span className="text-slate-400">
                      {v.type || 'car'}
                      {v.homeKey === homeKey ? ' · owner home' : ' · parked here'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="shrink-0 p-2 border-t border-slate-100 bg-slate-50/80">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-1.5 rounded-lg bg-slate-800 text-white text-xs font-bold hover:bg-slate-900"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
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
  // Cars + service vehicles: roads, lots, service/hospital bays, and houses (driveways)
  return (
    tile.type.startsWith('road') ||
    tile.type.startsWith('parking-') ||
    isCrossing ||
    isBuildingParkingBay(tile) ||
    isHouseTile(tile)
  );
}

const HOME_PARK_MS = 10_000;
const HOME_TOUR_MIN_MS = 45_000;
const HOME_TOUR_MAX_MS = 150_000;
const TREE_FIRE_DURATION_MS = 30_000;

function isTreeTileType(type: string | undefined): boolean {
  return type === 'tree-pine' || type === 'tree-pine-seedling' || type === 'tree-oak';
}

function randomHomeTourDelayMs(): number {
  return HOME_TOUR_MIN_MS + Math.floor(Math.random() * (HOME_TOUR_MAX_MS - HOME_TOUR_MIN_MS));
}

function parseHomeKey(homeKey: string | undefined): Point | null {
  if (!homeKey) return null;
  const p = homeKey.split(',').map(Number);
  if (p.length !== 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
  return { x: p[0], y: p[1] };
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
    const key = `${tileX},${tileY}`;
    const isHomeArrival = !!vehicle.homeKey && vehicle.homeKey === key;
    if (isHomeArrival) {
      const now = Date.now();
      return {
        destination: null,
        isMoving: false,
        turnIntent: null,
        progress: 0.5,
        parkingStopUntil: now + HOME_PARK_MS,
        lastParkingKey: key,
        parkingStallIndex: 0,
        // Schedule next tour → home after this 10s stay + a random drive around town
        nextHomeReturnAt: now + HOME_PARK_MS + randomHomeTourDelayMs(),
      };
    }
    return { destination: null, isMoving: false, turnIntent: null, progress: 0.5 };
  }
  return {};
}

function clearStopSignSatisfactionIfNeeded(prev: Vehicle, next: Vehicle): Vehicle {
  const changedTile = next.x !== prev.x || next.y !== prev.y;
  const turnedAround =
    !changedTile &&
    next.progress === 0 &&
    prev.progress > 0.5 &&
    next.heading !== prev.heading;
  if (!next.satisfiedStopSignKey || (!changedTile && !turnedAround)) return next;
  const cleared = { ...next };
  delete cleared.satisfiedStopSignKey;
  return cleared;
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

const parseCoordKey = (key: string): Point | null => {
  const parts = key.split(',');
  if (parts.length !== 2) return null;
  const x = Number(parts[0]);
  const y = Number(parts[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
};

const coordKey = (x: number, y: number) => `${x},${y}`;

const cloneBuildingConfig = (cfg: BuildingConfig, anchorKey: string): BuildingConfig => {
  // Explicit deep copy so inventory/settings never share references with live economy
  const raw = JSON.parse(JSON.stringify(cfg ?? {})) as BuildingConfig;
  const inventory: Record<string, number> = {};
  Object.entries(raw.inventory || {}).forEach(([itemId, qty]) => {
    const n = Number(qty);
    // Keep zero-qty keys out, but never drop positive stock (including fractional)
    if (Number.isFinite(n) && n > 0) inventory[itemId] = n;
  });
  const inventoryCapacity: Record<string, number> = {};
  Object.entries(raw.inventoryCapacity || {}).forEach(([itemId, cap]) => {
    const n = Number(cap);
    if (Number.isFinite(n) && n > 0) inventoryCapacity[itemId] = n;
  });
  const cloned = normalizeBuildingConfig({
    ...raw,
    anchorKey,
    inventory,
    inventoryCapacity: Object.keys(inventoryCapacity).length > 0 ? inventoryCapacity : raw.inventoryCapacity,
    // Explicitly preserve factory/lumbermill run state
    productionEnabled: raw.productionEnabled,
    processAccum: typeof raw.processAccum === 'number' ? raw.processAccum : 0,
    recipeInputs: raw.recipeInputs,
    recipeOutputs: raw.recipeOutputs,
    cycleTimeSec: raw.cycleTimeSec,
    requiredEmployees: raw.requiredEmployees,
    consumptionRates: raw.consumptionRates,
    repairRecipes: raw.repairRecipes,
    activeRepairs: raw.activeRepairs,
    illnessRecipes: raw.illnessRecipes,
    activePatients: raw.activePatients,
    patientsHealed: raw.patientsHealed,
    name: raw.name,
    role: raw.role,
  });
  return cloned;
};

const inventoryQtyTotal = (cfg: BuildingConfig | undefined): number =>
  Object.values(cfg?.inventory || {}).reduce((sum, q) => sum + (Number(q) || 0), 0);

/** Prefer the config that still has stock / richer settings when merging two economy snapshots. */
const preferBuildingConfig = (a?: BuildingConfig, b?: BuildingConfig, anchorKey?: string): BuildingConfig | undefined => {
  if (!a && !b) return undefined;
  if (!a) return b ? cloneBuildingConfig(b, anchorKey || b.anchorKey) : undefined;
  if (!b) return cloneBuildingConfig(a, anchorKey || a.anchorKey);
  // Prefer the side with more total stock as the base, then take max qty per item
  const rich = inventoryQtyTotal(b) > inventoryQtyTotal(a) ? b : a;
  const other = rich === a ? b : a;
  const mergedInv: Record<string, number> = { ...(other.inventory || {}) };
  Object.entries(rich.inventory || {}).forEach(([id, qty]) => {
    mergedInv[id] = Math.max(mergedInv[id] || 0, Number(qty) || 0);
  });
  return cloneBuildingConfig({
    ...other,
    ...rich,
    inventory: mergedInv,
    inventoryCapacity: { ...(other.inventoryCapacity || {}), ...(rich.inventoryCapacity || {}) },
    name: rich.name || other.name,
  }, anchorKey || rich.anchorKey);
};

/** Normalize legacy GridData layouts and new LayoutSnapshot payloads. */
const normalizeLayoutSnapshot = (data: unknown): LayoutSnapshot => {
  if (!data || typeof data !== 'object') {
    return { version: 2, grid: {}, buildings: {}, itemDefs: [] };
  }
  const obj = data as Record<string, unknown>;

  // New format: explicit { grid, buildings } (version optional). Prefer this whenever `grid` is present.
  const looksLikeSnapshot =
    obj.grid &&
    typeof obj.grid === 'object' &&
    !Array.isArray(obj.grid) &&
    (obj.version === 2 || obj.buildings !== undefined || obj.itemDefs !== undefined ||
      !Object.keys(obj).some(k => parseCoordKey(k) !== null));

  if (looksLikeSnapshot) {
    const buildingsRaw =
      obj.buildings && typeof obj.buildings === 'object' && !Array.isArray(obj.buildings)
        ? (obj.buildings as Record<string, BuildingConfig>)
        : {};
    const buildings: Record<string, BuildingConfig> = {};
    Object.entries(buildingsRaw).forEach(([k, cfg]) => {
      if (parseCoordKey(k) && cfg && typeof cfg === 'object') {
        buildings[k] = cloneBuildingConfig(cfg, k);
      }
    });
    const itemDefs = Array.isArray(obj.itemDefs) ? (obj.itemDefs as ItemDef[]) : [];
    return {
      version: 2,
      grid: obj.grid as GridData,
      buildings,
      itemDefs,
    };
  }

  // Legacy format: bare GridData
  return { version: 2, grid: obj as GridData, buildings: {}, itemDefs: [] };
};

/** Remap tile.anchorKey by translating coordinates (and drop invalid keys). */
const remapTileAnchorKeys = (
  tiles: GridTile[],
  mapKey: (key: string) => string | null,
): GridTile[] =>
  tiles.map(tile => {
    if (!tile.anchorKey) return { ...tile };
    const next = mapKey(tile.anchorKey);
    return next ? { ...tile, anchorKey: next } : { ...tile };
  });

const inBounds = (
  x: number,
  y: number,
  bounds?: { x1: number; y1: number; x2: number; y2: number } | null,
) => {
  if (!bounds) return true;
  return x >= bounds.x1 && x <= bounds.x2 && y >= bounds.y1 && y <= bounds.y2;
};

/**
 * Capture tiles (and economy building state) for a selection or whole grid.
 * When bounds are provided, keys are normalized to origin (0,0).
 */
const captureLayoutSnapshot = (
  grid: GridData,
  economy: EconomyState,
  bounds?: { x1: number; y1: number; x2: number; y2: number } | null,
): LayoutSnapshot => {
  const outGrid: GridData = {};
  const buildings: Record<string, BuildingConfig> = {};
  const originX = bounds ? bounds.x1 : 0;
  const originY = bounds ? bounds.y1 : 0;

  const mapAbsoluteToRelative = (key: string): string | null => {
    const p = parseCoordKey(key);
    if (!p) return null;
    return coordKey(p.x - originX, p.y - originY);
  };

  const storeBuilding = (absAnchor: string, typeHint?: string) => {
    const ap = parseCoordKey(absAnchor);
    if (!ap || !inBounds(ap.x, ap.y, bounds)) return;
    const relAnchor = mapAbsoluteToRelative(absAnchor);
    if (!relAnchor) return;

    // Prefer live economy config at the absolute anchor (full inventory + run state)
    const existing =
      economy.buildings[absAnchor] ||
      economy.buildings[relAnchor];

    if (existing) {
      // Economy entry always wins over any default created earlier for this cell
      buildings[relAnchor] = cloneBuildingConfig(existing, relAnchor);
      return;
    }

    if (!typeHint) return;
    // No economy entry yet — seed a default only if we haven't stored one
    if (!buildings[relAnchor]) {
      buildings[relAnchor] = createBuildingConfig(relAnchor, typeHint);
    }
  };

  const considerCell = (x: number, y: number) => {
    const key = coordKey(x, y);
    const tiles = grid[key];
    if (!tiles?.length) return;
    const relKey = coordKey(x - originX, y - originY);
    outGrid[relKey] = remapTileAnchorKeys(tiles, mapAbsoluteToRelative);

    for (const t of tiles) {
      if (!isEconomyBuilding(t.type)) continue;
      // Only capture from anchor cells so multi-tile buildings are stored once
      if (t.part === 'member') continue;
      // Prefer live cell key; also try tile.anchorKey for older mis-keyed placements
      storeBuilding(key, t.type);
      if (t.anchorKey && t.anchorKey !== key) {
        storeBuilding(t.anchorKey, t.type);
      }
    }
  };

  if (bounds) {
    for (let x = bounds.x1; x <= bounds.x2; x++) {
      for (let y = bounds.y1; y <= bounds.y2; y++) {
        considerCell(x, y);
      }
    }
  } else {
    Object.keys(grid).forEach(key => {
      const p = parseCoordKey(key);
      if (p) considerCell(p.x, p.y);
    });
  }

  // Always pull economy buildings whose absolute anchors fall in the selection —
  // this is the authoritative source for inventory + productionEnabled + processAccum.
  Object.entries(economy.buildings || {}).forEach(([absKey, cfg]) => {
    const p = parseCoordKey(absKey);
    if (!p || !inBounds(p.x, p.y, bounds)) return;
    const rel = mapAbsoluteToRelative(absKey);
    if (!rel) return;
    // Require the anchor cell to exist on the grid (or whole-grid save)
    if (bounds && !outGrid[rel] && !grid[absKey]?.length) return;
    buildings[rel] = cloneBuildingConfig(cfg, rel);
  });

  return {
    version: 2,
    grid: outGrid,
    buildings,
    itemDefs: Array.isArray(economy.itemDefs) ? JSON.parse(JSON.stringify(economy.itemDefs)) : [],
  };
};

/** Place layout tiles at (baseX, baseY) offset; returns only in-canvas cells. */
const materializeLayoutGrid = (
  layout: LayoutSnapshot,
  baseX: number,
  baseY: number,
): GridData => {
  const result: GridData = {};
  const mapKey = (key: string): string | null => {
    const p = parseCoordKey(key);
    if (!p) return null;
    return coordKey(p.x + baseX, p.y + baseY);
  };

  (Object.entries(layout.grid) as [string, GridTile[]][]).forEach(([relKey, tiles]) => {
    const p = parseCoordKey(relKey);
    if (!p) return;
    const tx = p.x + baseX;
    const ty = p.y + baseY;
    if (!isWithinGridCanvas(tx, ty)) return;
    if (!tiles?.length) return;
    result[coordKey(tx, ty)] = remapTileAnchorKeys(tiles, mapKey);
  });
  return result;
};

/** Restart/apply saved building configs at the given offset into economy.buildings. */
const materializeLayoutBuildings = (
  layout: LayoutSnapshot,
  baseX: number,
  baseY: number,
): Record<string, BuildingConfig> => {
  const result: Record<string, BuildingConfig> = {};
  Object.entries(layout.buildings || {}).forEach(([relKey, cfg]) => {
    const p = parseCoordKey(relKey);
    if (!p) return;
    const ax = p.x + baseX;
    const ay = p.y + baseY;
    if (!isWithinGridCanvas(ax, ay)) return;
    const absKey = coordKey(ax, ay);
    // Full deep clone of settings, inventory, recipes, and process/run state
    const cloned = cloneBuildingConfig(cfg, absKey);
    if (!cloned.inventory) cloned.inventory = {};
    // Factories/lumbermills that were running stay running after paste
    if (
      (cloned.role === 'factory' || cloned.role === 'lumbermill') &&
      cfg.productionEnabled !== undefined
    ) {
      cloned.productionEnabled = !!cfg.productionEnabled;
    }
    if (typeof cfg.processAccum === 'number') {
      cloned.processAccum = cfg.processAccum;
    }
    result[absKey] = cloned;
  });
  return result;
};

const rotateLayoutSnapshot = (layout: LayoutSnapshot): LayoutSnapshot => {
  const entries = Object.entries(layout.grid) as [string, GridTile[]][];
  if (entries.length === 0) {
    return { grid: {}, buildings: {} };
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  entries.forEach(([key]) => {
    const p = parseCoordKey(key);
    if (!p) return;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  });

  const height = maxY - minY;

  const mapRotatedKey = (key: string): string | null => {
    const p = parseCoordKey(key);
    if (!p) return null;
    const relX = p.x - minX;
    const relY = p.y - minY;
    const newRelX = height - relY;
    const newRelY = relX;
    return coordKey(newRelX, newRelY);
  };

  const rotatedGrid: GridData = {};
  entries.forEach(([key, tiles]) => {
    const newKey = mapRotatedKey(key);
    if (!newKey) return;
    rotatedGrid[newKey] = remapTileAnchorKeys(tiles, mapRotatedKey).map(tile => ({
      ...tile,
      rotation: (tile.rotation + 90) % 360,
    }));
  });

  const rotatedBuildings: Record<string, BuildingConfig> = {};
  Object.entries(layout.buildings || {}).forEach(([key, cfg]) => {
    const newKey = mapRotatedKey(key);
    if (!newKey) return;
    rotatedBuildings[newKey] = cloneBuildingConfig(cfg, newKey);
  });

  return { grid: rotatedGrid, buildings: rotatedBuildings };
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
  { type: 'building-repair-shop', label: 'Vehicle Repair Shop (4×6, 4 bays)', category: 'building' },
  { type: 'building-hospital', label: 'Hospital (4×4, ambulance bays)', category: 'building' },
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

/** Default staff needed for recipe buildings (factories / lumbermills). */
function getDefaultRequiredEmployees(role: BuildingConfig['role'], typeHint?: string): number {
  if (role === 'lumbermill') return 2;
  if (role === 'factory') {
    if (typeHint === 'building-factory-large') return 6;
    return 3;
  }
  return 0;
}

function getRequiredEmployees(cfg: BuildingConfig): number {
  if (typeof cfg.requiredEmployees === 'number' && Number.isFinite(cfg.requiredEmployees)) {
    return Math.max(0, Math.floor(cfg.requiredEmployees));
  }
  return getDefaultRequiredEmployees(cfg.role);
}

function isStaffedForProduction(
  cfg: BuildingConfig,
  buildingKey: string,
  people?: Record<string, Person>,
): boolean {
  const need = getRequiredEmployees(cfg);
  if (need <= 0) return true;
  return countEmployeesAtBuilding(people, buildingKey) >= need;
}

function hasRecipeInputs(cfg: BuildingConfig): boolean {
  return (cfg.recipeInputs || []).every(
    inp => (cfg.inventory[inp.item] || 0) >= (inp.amount || 1)
  );
}

function getRecipeCycleRemaining(
  cfg: BuildingConfig,
  economyPaused: boolean,
  elapsedSinceSyncSec = 0,
  staffed = true,
): number | null {
  if (!isRecipeBuilding(cfg)) return null;
  const cycle = cfg.cycleTimeSec!;
  let accum = cfg.processAccum || 0;
  if (!economyPaused && staffed && hasRecipeInputs(cfg) && hasOutputCapacity(cfg)) {
    accum += elapsedSinceSyncSec;
  }
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
  onToggleEmergencyLights,
  showParkControls = true,
  showTurnControls = true,
  showLightsToggle = false,
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
  onToggleEmergencyLights?: () => void;
  showParkControls?: boolean;
  showTurnControls?: boolean;
  showLightsToggle?: boolean;
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
  // Lights default ON when undefined (emergency vehicles only)
  const lightsCapableIds = selectedList.filter(id => hasEmergencyLights(vehicles[id]?.type));
  const lightsOnCount = lightsCapableIds.filter(id => vehicles[id]?.emergencyLightsOn !== false).length;
  const serviceSelectedCount = lightsCapableIds.length;
  const isLightsActive = serviceSelectedCount > 0 && lightsOnCount >= serviceSelectedCount / 2;

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
        {showLightsToggle && onToggleEmergencyLights && (
          <div
            className={`flex items-center justify-between gap-3 px-2 py-1.5 rounded-lg border ${
              filteredSelection.size === 0 || serviceSelectedCount === 0
                ? 'opacity-40 border-slate-100 bg-slate-50'
                : isLightsActive
                  ? 'border-amber-300 bg-amber-50'
                  : 'border-slate-200 bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Siren className={`w-4 h-4 shrink-0 ${isLightsActive ? 'text-amber-600' : 'text-slate-400'}`} />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-700">Emergency lights</div>
                <div className="text-[10px] text-slate-500 truncate">
                  {serviceSelectedCount === 0
                    ? 'Select a service vehicle'
                    : isLightsActive
                      ? 'Flashing on'
                      : 'Lights off'}
                </div>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isLightsActive}
              title={isLightsActive ? 'Turn lights off' : 'Turn lights on'}
              disabled={filteredSelection.size === 0 || serviceSelectedCount === 0 || !roomCode}
              onClick={onToggleEmergencyLights}
              className={`relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-40 ${
                isLightsActive ? 'bg-amber-500' : 'bg-slate-300'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  isLightsActive ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        )}
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

type TrafficTool = 'stop-sign' | 'stoplight' | null;

function TrafficPanel({
  traffic,
  selectedIds,
  trafficTool,
  roomCode,
  onSelectIds,
  onSetTool,
  onUpdateTraffic,
  onDeleteByKind,
  onLinkSelected,
  onUnlinkSelected,
  onToggleManual,
}: {
  traffic: TrafficState;
  selectedIds: Set<string>;
  trafficTool: TrafficTool;
  roomCode: string | null;
  onSelectIds: (ids: Set<string>) => void;
  onSetTool: (tool: TrafficTool) => void;
  onUpdateTraffic: (next: TrafficState) => void;
  onDeleteByKind: (kind: 'stop-sign' | 'stoplight') => void;
  onLinkSelected: () => void;
  onUnlinkSelected: () => void;
  onToggleManual: (manual: boolean) => void;
}) {
  const signs = getAllTrafficControls(traffic)
    .filter(c => c.kind === 'stop-sign')
    .sort((a, b) => (a.kind === 'stop-sign' && b.kind === 'stop-sign' ? a.id - b.id : 0));
  const lights = getAllTrafficControls(traffic).filter(c => c.kind === 'stoplight');
  const selectedLights = lights.filter(l => selectedIds.has(trafficControlKey(l)));
  const selectedSigns = signs.filter(s => selectedIds.has(trafficControlKey(s)));
  const firstSelected = selectedLights[0];
  const canLink = selectedLights.length >= 2;
  const canUnlink = selectedLights.some(l => l.groupId);

  const patchSelectedLights = (patch: Partial<Extract<TrafficControl, { kind: 'stoplight' }>>) => {
    const nextControls = { ...traffic.controls };
    selectedIds.forEach(id => {
      const c = nextControls[id];
      if (c?.kind === 'stoplight') {
        nextControls[id] = { ...c, ...patch };
      }
    });
    onUpdateTraffic({ ...traffic, controls: nextControls });
  };

  const toggleLightPhase = (light: Extract<TrafficControl, { kind: 'stoplight' }>) => {
    if (!roomCode) return;
    const ctrlKey = trafficControlKey(light);
    onUpdateTraffic({
      ...traffic,
      controls: {
        ...traffic.controls,
        [ctrlKey]: {
          ...light,
          phase: cycleLightPhase(light.phase),
          phaseStartedAt: Date.now(),
        },
      },
    });
  };

  const phaseFields = [
    { key: 'redMs' as const, label: 'Red' },
    { key: 'yellowMs' as const, label: 'Yellow' },
    { key: 'greenMs' as const, label: 'Green' },
  ];

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-3 shrink-0">
        <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Placement Tools</div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!roomCode}
            onClick={() => onSetTool(trafficTool === 'stop-sign' ? null : 'stop-sign')}
            className={`flex-1 flex flex-col items-center gap-1 py-2 px-2 rounded-lg border text-xs font-medium transition-colors ${
              trafficTool === 'stop-sign' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <span className="text-lg">🛑</span>
            Stop Sign
          </button>
          <button
            type="button"
            disabled={!roomCode}
            onClick={() => onSetTool(trafficTool === 'stoplight' ? null : 'stoplight')}
            className={`flex-1 flex flex-col items-center gap-1 py-2 px-2 rounded-lg border text-xs font-medium transition-colors ${
              trafficTool === 'stoplight' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <span className="text-lg">🚦</span>
            Stoplight
          </button>
        </div>
        <p className="text-[10px] text-slate-400 leading-snug">
          Stop signs: click the road end corner or edge on straight roads. Stoplights: click lane end position. Click again to remove. Hover a tile to see IDs.
        </p>
        {(selectedSigns.length + selectedLights.length) === 1 && (
          <p className="text-[10px] text-red-500 font-medium leading-snug">
            One item selected — click a road edge or lane on the grid to move it.
          </p>
        )}
      </div>

      <div className="bg-white rounded-xl p-3 border border-slate-200 space-y-3 shrink-0">
        <label className="text-xs font-medium text-slate-600 flex items-center justify-between gap-2">
          Stop sign min wait
          <span className="font-bold text-slate-800">{traffic.stopSignMinDurationSec}s</span>
        </label>
        <input
          type="range"
          min={1}
          max={15}
          step={0.5}
          disabled={!roomCode}
          value={traffic.stopSignMinDurationSec}
          onChange={e => onUpdateTraffic({ ...traffic, stopSignMinDurationSec: parseFloat(e.target.value) })}
          className="w-full"
        />
      </div>

      <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
        <div className="flex flex-col min-h-0 shrink-0" style={{ maxHeight: '38%' }}>
          <div className="flex items-center justify-between px-1 mb-1">
            <span className="text-sm font-medium text-slate-700">Stop Signs ({signs.length})</span>
            <button
              type="button"
              disabled={selectedSigns.length === 0 || !roomCode}
              onClick={() => onDeleteByKind('stop-sign')}
              className="text-red-500 hover:text-red-600 disabled:opacity-30 p-1"
              title="Delete selected stop signs"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto border border-slate-100 rounded-xl bg-white">
            {signs.length === 0 ? (
              <div className="p-3 text-xs text-slate-400 text-center">No stop signs placed</div>
            ) : (
              signs.map(sign => {
                if (sign.kind !== 'stop-sign') return null;
                const key = trafficControlKey(sign);
                return (
                  <label key={key} className="flex items-center gap-3 p-2.5 hover:bg-slate-50 border-b border-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(key)}
                      disabled={!roomCode}
                      onChange={e => {
                        const next = new Set(selectedIds);
                        if (e.target.checked) next.add(key);
                        else next.delete(key);
                        onSelectIds(next);
                      }}
                      className="rounded border-slate-300 text-red-600"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-slate-700">Sign #{sign.id}</div>
                      <div className="text-[10px] text-slate-400 font-mono truncate">{sign.gridKey} · Stop {edgePortLabel(sign.edgePort)}</div>
                    </div>
                    <svg viewBox="0 0 20 20" className="w-4 h-4 shrink-0">
                      <polygon points={OCTAGON_POINTS_PANEL} fill="#dc2626" />
                    </svg>
                  </label>
                );
              })
            )}
          </div>
        </div>

        <div className="flex flex-col min-h-0 flex-1">
          <div className="flex items-center justify-between px-1 mb-1">
            <span className="text-sm font-medium text-slate-700">Stoplights ({lights.length})</span>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                disabled={!canLink || !roomCode}
                onClick={onLinkSelected}
                className="text-blue-600 hover:text-blue-700 disabled:opacity-30 p-1"
                title="Link & coordinate phases"
              >
                <Link2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={!canUnlink || !roomCode}
                onClick={onUnlinkSelected}
                className="text-slate-500 hover:text-slate-700 disabled:opacity-30 p-1"
                title="Unlink selected stoplights"
              >
                <Unlink className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={selectedLights.length === 0 || !roomCode}
                onClick={() => onDeleteByKind('stoplight')}
                className="text-red-500 hover:text-red-600 disabled:opacity-30 p-1"
                title="Delete selected stoplights"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto border border-slate-100 rounded-xl bg-white">
            {lights.length === 0 ? (
              <div className="p-3 text-xs text-slate-400 text-center">No stoplights placed</div>
            ) : (
              lights.map(light => {
                if (light.kind !== 'stoplight') return null;
                const key = trafficControlKey(light);
                return (
                  <label key={key} className="flex items-center gap-3 p-2.5 hover:bg-slate-50 border-b border-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(key)}
                      disabled={!roomCode}
                      onChange={e => {
                        const next = new Set(selectedIds);
                        if (e.target.checked) next.add(key);
                        else next.delete(key);
                        onSelectIds(next);
                      }}
                      className="rounded border-slate-300 text-emerald-600"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-700">Light #{light.id}</span>
                        {light.groupId && (
                          <span
                            className="inline-flex items-center gap-0.5 text-[10px] font-medium text-blue-600 bg-blue-50 px-1 py-0.5 rounded"
                            title={`Linked group (${getLightGroupSize(traffic, light.groupId)} lights)`}
                          >
                            <Link2 className="w-2.5 h-2.5" />
                            ×{getLightGroupSize(traffic, light.groupId)}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono truncate">{light.gridKey} · h{light.heading} · lane {light.lane}</div>
                    </div>
                    <button
                      type="button"
                      disabled={!roomCode}
                      onClick={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleLightPhase(light);
                      }}
                      className="w-3 h-3 rounded-full shrink-0 border border-white/60 disabled:opacity-30 hover:scale-125 transition-transform cursor-pointer"
                      style={{ backgroundColor: light.phase === 'red' ? '#ef4444' : light.phase === 'yellow' ? '#eab308' : '#22c55e' }}
                      title={`${light.phase} — click to toggle`}
                    />
                  </label>
                );
              })
            )}
          </div>
        </div>
      </div>

      {selectedLights.length > 0 && (
        <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-3 shrink-0">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Edit {selectedLights.length} light{selectedLights.length > 1 ? 's' : ''}
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={firstSelected?.manualOnly ?? false}
              disabled={!roomCode}
              onChange={e => onToggleManual(e.target.checked)}
            />
            Manual toggle only
          </label>
          {!firstSelected?.manualOnly && (
            <div className="space-y-2">
              {phaseFields.map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 text-xs text-slate-600">
                  <span className="w-12">{label}</span>
                  <input
                    type="number"
                    min={0.5}
                    max={120}
                    step={0.5}
                    disabled={!roomCode}
                    value={(firstSelected?.[key] ?? 5000) / 1000}
                    onChange={e => patchSelectedLights({ [key]: Math.round((parseFloat(e.target.value) || 5) * 1000) })}
                    className="flex-1 px-2 py-1 border border-slate-200 rounded text-xs"
                  />
                  <span className="text-slate-400 w-6">sec</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const OCTAGON_POINTS_PANEL = '6.5,1.5 13.5,1.5 18.5,6.5 18.5,13.5 13.5,18.5 6.5,18.5 1.5,13.5 1.5,6.5';

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
  const repairInventory =
    role === 'repair-shop'
      ? {
          'motor-oil': 20,
          'oil-filter': 15,
          tire: 12,
          'brake-pads': 10,
          'brake-fluid': 10,
          battery: 8,
          'engine-parts': 6,
          'body-panels': 4,
          paint: 8,
          'tow-supplies': 10,
        }
      : {};
  const hospitalInventory =
    role === 'hospital'
      ? {
          medicine: 30,
          bandages: 40,
          painkillers: 25,
          'blood-bags': 15,
          'iv-fluids': 30,
          antibiotics: 20,
          'defibrillator-pads': 10,
          epinephrine: 12,
          'medical-supplies': 20,
        }
      : {};
  const isRecipeRole = role === 'factory' || role === 'lumbermill';
  const base: BuildingConfig = {
    anchorKey,
    name: getDefaultBuildingName(type),
    role,
    inventory: { ...repairInventory, ...hospitalInventory },
    productionEnabled: isRecipeRole,
    cycleTimeSec: role === 'factory' ? 18 : role === 'lumbermill' ? 12 : undefined,
    recipeInputs: role === 'factory' ? [{ item: 'lumber', amount: 2 }] : role === 'lumbermill' ? [{ item: 'logs', amount: 1 }] : undefined,
    recipeOutputs: role === 'factory' ? [{ item: 'goods', amount: 1 }] : role === 'lumbermill' ? [{ item: 'lumber', amount: 3 }] : undefined,
    requiredEmployees: isRecipeRole ? getDefaultRequiredEmployees(role, type) : undefined,
    consumptionRates: role === 'store' ? { goods: 0.4 } : undefined,
    processAccum: 0,
    repairRecipes: role === 'repair-shop' ? DEFAULT_REPAIR_RECIPES.map(r => ({ ...r, inputs: r.inputs.map(i => ({ ...i })) })) : undefined,
    activeRepairs: role === 'repair-shop' ? [] : undefined,
    illnessRecipes: role === 'hospital' ? DEFAULT_ILLNESS_RECIPES.map(r => ({ ...r, inputs: r.inputs.map(i => ({ ...i })) })) : undefined,
    activePatients: role === 'hospital' ? [] : undefined,
    patientsHealed: role === 'hospital' ? 0 : undefined,
  };
  return normalizeBuildingConfig(base);
}

function canStartRepair(cfg: BuildingConfig, recipe: RepairRecipe, vehicle: Vehicle): string | null {
  if (cfg.role !== 'repair-shop') return 'Not a repair shop.';
  if (recipe.vehicleTypes && recipe.vehicleTypes.length > 0) {
    const vType = (vehicle.type || 'car') as VehicleType;
    if (!recipe.vehicleTypes.includes(vType)) {
      return `Recipe does not apply to ${vType}.`;
    }
  }
  for (const inp of recipe.inputs || []) {
    if ((cfg.inventory[inp.item] || 0) < (inp.amount || 1)) {
      return `Need ${inp.amount || 1}× ${inp.item}.`;
    }
  }
  if ((cfg.activeRepairs || []).some(r => r.vehicleId === vehicle.id)) {
    return 'Vehicle already being repaired.';
  }
  return null;
}

function canStartTreatment(cfg: BuildingConfig, illness: IllnessRecipe, vehicle: Vehicle): string | null {
  if (cfg.role !== 'hospital') return 'Not a hospital.';
  if (illness.vehicleTypes && illness.vehicleTypes.length > 0) {
    const vType = (vehicle.type || 'car') as VehicleType;
    if (!illness.vehicleTypes.includes(vType)) {
      return `Protocol prefers ${illness.vehicleTypes.join(', ')} (this is ${vType}).`;
    }
  }
  for (const inp of illness.inputs || []) {
    if ((cfg.inventory[inp.item] || 0) < (inp.amount || 1)) {
      return `Need ${inp.amount || 1}× ${inp.item}.`;
    }
  }
  if ((cfg.activePatients || []).some(p => p.vehicleId === vehicle.id)) {
    return 'Patient from this vehicle already in care.';
  }
  if ((cfg.activePatients || []).some(p => p.bayIndex === (vehicle.parkingStallIndex ?? 0))) {
    // Allow if different vehicle replaced bay — only block same bay if occupied by active patient without matching vehicle gone
  }
  return null;
}

function findVehiclesInBuildingBays(
  anchorKey: string,
  grid: GridData,
  vehicles: Record<string, Vehicle>,
  buildingType: 'building-repair-shop' | 'building-hospital',
): Array<{ vehicle: Vehicle; bayIndex: number; cellKey: string }> {
  const result: Array<{ vehicle: Vehicle; bayIndex: number; cellKey: string }> = [];
  const seen = new Set<string>();
  for (const [key, tiles] of Object.entries(grid)) {
    for (const t of tiles) {
      if (t.type !== buildingType) continue;
      const isAnchor = t.part !== 'member' && key === anchorKey;
      const isMember = t.part === 'member' && t.anchorKey === anchorKey;
      if (!isAnchor && !isMember) continue;
      if (!isBuildingParkingBay(t)) continue;
      const bayIndex = getBuildingParkingBayIndex(t);
      const [cx, cy] = key.split(',').map(Number);
      for (const v of Object.values(vehicles) as Vehicle[]) {
        if (v.x === cx && v.y === cy && !seen.has(v.id)) {
          seen.add(v.id);
          result.push({ vehicle: v, bayIndex, cellKey: key });
        }
      }
    }
  }
  return result.sort((a, b) => a.bayIndex - b.bayIndex || a.vehicle.id.localeCompare(b.vehicle.id));
}

function findVehiclesInRepairShopBays(
  anchorKey: string,
  grid: GridData,
  vehicles: Record<string, Vehicle>,
): Array<{ vehicle: Vehicle; bayIndex: number; cellKey: string }> {
  return findVehiclesInBuildingBays(anchorKey, grid, vehicles, 'building-repair-shop');
}

function findVehiclesInHospitalBays(
  anchorKey: string,
  grid: GridData,
  vehicles: Record<string, Vehicle>,
): Array<{ vehicle: Vehicle; bayIndex: number; cellKey: string }> {
  return findVehiclesInBuildingBays(anchorKey, grid, vehicles, 'building-hospital');
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
  const [localRequiredEmployees, setLocalRequiredEmployees] = useState(
    () => getRequiredEmployees(cfg)
  );
  const [localRepairRecipes, setLocalRepairRecipes] = useState<RepairRecipe[]>(
    () => (cfg.repairRecipes || []).map(r => ({ ...r, inputs: (r.inputs || []).map(i => ({ ...i })) }))
  );
  const [localIllnessRecipes, setLocalIllnessRecipes] = useState<IllnessRecipe[]>(
    () => (cfg.illnessRecipes || []).map(r => ({ ...r, inputs: (r.inputs || []).map(i => ({ ...i })) }))
  );
  const [editorTick, setEditorTick] = useState(0);
  const [addInvItem, setAddInvItem] = useState('');
  const [addCapItem, setAddCapItem] = useState('');
  const [addRateItem, setAddRateItem] = useState('');
  const [newRepairName, setNewRepairName] = useState('');
  const [newIllnessName, setNewIllnessName] = useState('');
  const cfgSyncRef = useRef(Date.now());
  const itemDefs = economy.itemDefs || [];
  const nearbyTrailers = findNearbyTrailersForBuilding(bkey, grid, economy, vehicles, 3);
  const vehiclesInBays = role === 'repair-shop' ? findVehiclesInRepairShopBays(bkey, grid, vehicles) : [];
  const ambulancesInBays = role === 'hospital' ? findVehiclesInHospitalBays(bkey, grid, vehicles) : [];
  const activeRepairs = cfg.activeRepairs || [];
  const activePatients = cfg.activePatients || [];

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
    setLocalRequiredEmployees(getRequiredEmployees(cfg));
    setLocalRepairRecipes((cfg.repairRecipes || []).map(r => ({ ...r, inputs: (r.inputs || []).map(i => ({ ...i })) })));
    setLocalIllnessRecipes((cfg.illnessRecipes || []).map(r => ({ ...r, inputs: (r.inputs || []).map(i => ({ ...i })) })));
    cfgSyncRef.current = Date.now();
    centerPanel();
  }, [bkey, centerPanel]);

  useEffect(() => {
    cfgSyncRef.current = Date.now();
  }, [cfg.processAccum, cfg.activeRepairs, cfg.activePatients]);

  useEffect(() => {
    if ((!isRecipeBuilding(cfg) && role !== 'repair-shop' && role !== 'hospital') || economy.economyPaused) return;
    const iv = setInterval(() => setEditorTick(t => t + 1), 100);
    return () => clearInterval(iv);
  }, [bkey, economy.economyPaused, role]);

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

  const saveConfig = (invOverride?: Record<string, number>) => {
    const invSource = invOverride ?? localInv;
    const cappedCfg = { ...cfg, inventoryCapacity: { ...localCaps } };
    const clampedInv = { ...invSource };
    Object.keys(clampedInv).forEach(itemId => {
      clampedInv[itemId] = Math.min(clampedInv[itemId], getItemCapacity(cappedCfg, itemId));
    });
    // Drop zero-qty entries for a clean snapshot, but keep the object
    Object.keys(clampedInv).forEach(itemId => {
      if (!clampedInv[itemId]) delete clampedInv[itemId];
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
      requiredEmployees: (role === 'factory' || role === 'lumbermill')
        ? Math.max(0, Math.floor(localRequiredEmployees) || 0)
        : cfg.requiredEmployees,
      repairRecipes: role === 'repair-shop'
        ? localRepairRecipes.map(r => ({
            ...r,
            name: r.name.trim() || 'Repair',
            inputs: (r.inputs || []).filter(i => i.item).map(i => ({ item: i.item, amount: Math.max(1, i.amount || 1) })),
            cycleTimeSec: Math.max(1, r.cycleTimeSec || 10),
          }))
        : cfg.repairRecipes,
      illnessRecipes: role === 'hospital'
        ? localIllnessRecipes.map(r => ({
            ...r,
            name: r.name.trim() || 'Illness',
            description: r.description,
            inputs: (r.inputs || []).filter(i => i.item).map(i => ({ item: i.item, amount: Math.max(1, i.amount || 1) })),
            stayDurationSec: Math.max(1, r.stayDurationSec || 15),
            vehicleTypes: r.vehicleTypes,
          }))
        : cfg.illnessRecipes,
    };
    const nextB = { ...economy.buildings, [bkey]: updated };
    const nextEco = { ...economy, buildings: nextB };
    setEconomy(nextEco);
    if (roomCode) socket.emit('update-economy', { roomCode, economy: nextEco });
  };

  /** Persist inventory immediately so layout save/copy always sees stock. */
  const updateInventory = (updater: (prev: Record<string, number>) => Record<string, number>) => {
    setLocalInv(prev => {
      const next = updater(prev);
      // Defer economy write so it uses the latest caps/name from this render
      queueMicrotask(() => saveConfig(next));
      return next;
    });
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
                    <button onClick={() => updateInventory(p => ({ ...p, [it]: Math.max(0, (p[it] || 0) - 1) }))} className="px-1.5">-</button>
                    <input
                      type="number"
                      value={qty}
                      onChange={e => updateInventory(p => ({ ...p, [it]: Math.min(cap, Math.max(0, parseInt(e.target.value) || 0)) }))}
                      className="w-14 text-right border px-1 text-xs"
                    />
                    <span className="text-[10px] text-slate-400">/{cap}</span>
                    <button onClick={() => updateInventory(p => ({ ...p, [it]: Math.min(cap, (p[it] || 0) + 1) }))} className="px-1.5">+</button>
                    <button onClick={() => updateInventory(p => { const n = { ...p }; delete n[it]; return n; })} className="text-red-500 text-[10px] ml-1">×</button>
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
                updateInventory(p => ({ ...p, [addInvItem]: Math.min(cap, (p[addInvItem] || 0) + 10) }));
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

        {role === 'repair-shop' && (
          <div className="mb-4 space-y-3">
            <div>
              <div className="font-semibold text-sm mb-1 flex items-center gap-1">
                <Wrench className="w-3.5 h-3.5 text-orange-600" />
                Service Bays ({vehiclesInBays.length}/4 occupied)
              </div>
              <div className="border rounded p-2 text-xs bg-orange-50/50 border-orange-100 space-y-2 max-h-48 overflow-auto">
                {vehiclesInBays.length === 0 && (
                  <div className="text-slate-400">Park any vehicle in a service bay to start repairs.</div>
                )}
                {vehiclesInBays.map(({ vehicle: v, bayIndex }) => {
                  const job = activeRepairs.find(r => r.vehicleId === v.id);
                  const recipe = job ? (cfg.repairRecipes || localRepairRecipes).find(r => r.id === job.recipeId) : null;
                  const cycle = recipe?.cycleTimeSec || 15;
                  const progress = job ? Math.min(1, (job.processAccum || 0) / cycle) : 0;
                  void editorTick;
                  return (
                    <div key={v.id} className="bg-white rounded-lg border border-orange-100 p-2">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: v.color }} />
                        <VehicleTypeIcon type={v.type} />
                        <span className="font-mono text-[10px] text-slate-500 truncate flex-1">{v.id}</span>
                        <span className="text-[10px] font-bold text-orange-700">Bay {bayIndex + 1}</span>
                      </div>
                      {job && recipe ? (
                        <div>
                          <div className="text-[10px] text-slate-600 mb-0.5">Repairing: {recipe.name}</div>
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-orange-500 transition-all" style={{ width: `${progress * 100}%` }} />
                          </div>
                          <div className="text-[9px] text-slate-400 mt-0.5">
                            {Math.max(0, Math.ceil(cycle - (job.processAccum || 0)))}s remaining
                          </div>
                          <button
                            type="button"
                            className="mt-1 text-[10px] text-red-600 hover:underline"
                            onClick={() => {
                              const nextRepairs = (cfg.activeRepairs || []).filter(r => r.id !== job.id);
                              // Refund parts
                              const refundInv = { ...(cfg.inventory || {}) };
                              (recipe.inputs || []).forEach(inp => {
                                refundInv[inp.item] = (refundInv[inp.item] || 0) + (inp.amount || 1);
                              });
                              const nextEco = {
                                ...economy,
                                buildings: {
                                  ...economy.buildings,
                                  [bkey]: { ...cfg, activeRepairs: nextRepairs, inventory: refundInv },
                                },
                              };
                              setEconomy(nextEco);
                              setLocalInv(refundInv);
                              if (roomCode) socket.emit('update-economy', { roomCode, economy: nextEco });
                            }}
                          >
                            Cancel &amp; refund parts
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className="text-[10px] text-slate-500">Start repair:</div>
                          <div className="flex flex-wrap gap-1">
                            {(cfg.repairRecipes || localRepairRecipes).map(recipe => {
                              const liveCfg = { ...cfg, inventory: localInv };
                              const err = canStartRepair(liveCfg, recipe, v);
                              return (
                                <button
                                  key={recipe.id}
                                  type="button"
                                  disabled={!!err || !roomCode}
                                  title={err || recipe.description || recipe.name}
                                  onClick={() => {
                                    // Consume parts immediately, then queue job
                                    const nextInv = { ...localInv };
                                    for (const inp of recipe.inputs || []) {
                                      nextInv[inp.item] = (nextInv[inp.item] || 0) - (inp.amount || 1);
                                      if (nextInv[inp.item] <= 0) delete nextInv[inp.item];
                                    }
                                    const job: ActiveRepair = {
                                      id: `repair-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                                      recipeId: recipe.id,
                                      vehicleId: v.id,
                                      bayIndex,
                                      processAccum: 0,
                                    };
                                    const nextEco = {
                                      ...economy,
                                      buildings: {
                                        ...economy.buildings,
                                        [bkey]: {
                                          ...cfg,
                                          inventory: nextInv,
                                          repairRecipes: localRepairRecipes,
                                          activeRepairs: [...(cfg.activeRepairs || []), job],
                                        },
                                      },
                                    };
                                    setLocalInv(nextInv);
                                    setEconomy(nextEco);
                                    if (roomCode) socket.emit('update-economy', { roomCode, economy: nextEco });
                                  }}
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-40"
                                >
                                  {recipe.name}
                                </button>
                              );
                            })}
                          </div>
                          {v.lastRepairId && (
                            <div className="text-[9px] text-emerald-600">
                              Last repair: {v.lastRepairId}
                              {v.lastRepairAt ? ` (${Math.round((Date.now() - v.lastRepairAt) / 1000)}s ago)` : ''}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="font-semibold text-sm mb-1">Repair Types &amp; Recipes</div>
              <p className="text-[10px] text-slate-400 mb-1">
                Define jobs and the parts they consume. Parts are taken from this shop&apos;s inventory when a repair starts.
              </p>
              <div className="border rounded p-2 text-xs bg-slate-50 space-y-2 max-h-56 overflow-auto">
                {localRepairRecipes.length === 0 && <div className="text-slate-400">No repair types yet</div>}
                {localRepairRecipes.map((recipe, rIdx) => (
                  <div key={recipe.id} className="bg-white border border-slate-100 rounded p-2 space-y-1">
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={recipe.name}
                        onChange={e => {
                          const n = [...localRepairRecipes];
                          n[rIdx] = { ...n[rIdx], name: e.target.value };
                          setLocalRepairRecipes(n);
                        }}
                        className="flex-1 border rounded px-1.5 py-0.5 text-xs font-medium"
                        placeholder="Repair name"
                      />
                      <input
                        type="number"
                        min={1}
                        value={recipe.cycleTimeSec}
                        onChange={e => {
                          const n = [...localRepairRecipes];
                          n[rIdx] = { ...n[rIdx], cycleTimeSec: Math.max(1, parseInt(e.target.value) || 1) };
                          setLocalRepairRecipes(n);
                        }}
                        className="w-14 border rounded px-1 py-0.5 text-xs text-right"
                        title="Seconds"
                      />
                      <span className="text-[9px] text-slate-400">sec</span>
                      <button
                        type="button"
                        className="text-red-500 text-[10px]"
                        onClick={() => setLocalRepairRecipes(localRepairRecipes.filter((_, i) => i !== rIdx))}
                      >×</button>
                    </div>
                    <input
                      type="text"
                      value={recipe.description || ''}
                      onChange={e => {
                        const n = [...localRepairRecipes];
                        n[rIdx] = { ...n[rIdx], description: e.target.value };
                        setLocalRepairRecipes(n);
                      }}
                      className="w-full border rounded px-1.5 py-0.5 text-[10px]"
                      placeholder="Description (optional)"
                    />
                    <div className="space-y-0.5">
                      <div className="text-[10px] text-slate-500">Parts required</div>
                      {(recipe.inputs || []).map((inp, iIdx) => (
                        <div key={iIdx} className="flex gap-1 items-center">
                          <input
                            type="text"
                            value={inp.item}
                            onChange={e => {
                              const n = [...localRepairRecipes];
                              const inputs = [...(n[rIdx].inputs || [])];
                              inputs[iIdx] = { ...inputs[iIdx], item: e.target.value };
                              n[rIdx] = { ...n[rIdx], inputs };
                              setLocalRepairRecipes(n);
                            }}
                            list={`repair-items-${bkey}`}
                            className="flex-1 border rounded px-1 py-0.5 text-[10px]"
                            placeholder="part id"
                          />
                          <input
                            type="number"
                            min={1}
                            value={inp.amount}
                            onChange={e => {
                              const n = [...localRepairRecipes];
                              const inputs = [...(n[rIdx].inputs || [])];
                              inputs[iIdx] = { ...inputs[iIdx], amount: Math.max(1, parseInt(e.target.value) || 1) };
                              n[rIdx] = { ...n[rIdx], inputs };
                              setLocalRepairRecipes(n);
                            }}
                            className="w-12 border rounded px-1 py-0.5 text-[10px] text-right"
                          />
                          <button
                            type="button"
                            className="text-red-500"
                            onClick={() => {
                              const n = [...localRepairRecipes];
                              n[rIdx] = {
                                ...n[rIdx],
                                inputs: (n[rIdx].inputs || []).filter((_, i) => i !== iIdx),
                              };
                              setLocalRepairRecipes(n);
                            }}
                          >×</button>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="text-[10px] text-emerald-600"
                        onClick={() => {
                          const n = [...localRepairRecipes];
                          n[rIdx] = {
                            ...n[rIdx],
                            inputs: [...(n[rIdx].inputs || []), { item: pickDefaultItem() || 'motor-oil', amount: 1 }],
                          };
                          setLocalRepairRecipes(n);
                        }}
                      >+ Add part</button>
                    </div>
                  </div>
                ))}
                <datalist id={`repair-items-${bkey}`}>
                  {itemDefs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  {Object.keys(ITEM_EMOJI_MAP).map(id => <option key={id} value={id} />)}
                </datalist>
                <div className="flex gap-1 pt-1">
                  <input
                    type="text"
                    value={newRepairName}
                    onChange={e => setNewRepairName(e.target.value)}
                    placeholder="New repair type name…"
                    className="flex-1 border rounded px-2 py-1 text-xs"
                  />
                  <button
                    type="button"
                    className="px-2 py-1 bg-orange-600 text-white rounded text-xs disabled:opacity-40"
                    disabled={!newRepairName.trim()}
                    onClick={() => {
                      const id = normalizeItemId(newRepairName) || `repair-${Date.now()}`;
                      setLocalRepairRecipes(prev => [
                        ...prev,
                        {
                          id: `${id}-${Date.now().toString(36).slice(-4)}`,
                          name: newRepairName.trim(),
                          inputs: [{ item: 'motor-oil', amount: 1 }],
                          cycleTimeSec: 15,
                        },
                      ]);
                      setNewRepairName('');
                    }}
                  >Add</button>
                </div>
              </div>
              <div className="text-[10px] text-slate-400 mt-1">Click Save Changes to store recipe edits.</div>
            </div>
          </div>
        )}

        {role === 'hospital' && (
          <div className="mb-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-rose-700 flex items-center gap-1">
                <Cross className="w-3.5 h-3.5" /> Hospital
              </span>
              <span className="text-slate-500">
                Healed: <strong className="text-emerald-600">{cfg.patientsHealed || 0}</strong>
                {' · '}
                In care: <strong>{activePatients.length}</strong>
              </span>
            </div>

            <div>
              <div className="font-semibold text-sm mb-1">Ambulance Bays ({ambulancesInBays.length}/4)</div>
              <div className="border rounded p-2 text-xs bg-rose-50/50 border-rose-100 space-y-2 max-h-52 overflow-auto">
                {ambulancesInBays.length === 0 && (
                  <div className="text-slate-400">Park an ambulance (or any vehicle) in a bay to admit a patient.</div>
                )}
                {ambulancesInBays.map(({ vehicle: v, bayIndex }) => {
                  const patient = activePatients.find(p => p.vehicleId === v.id || p.bayIndex === bayIndex);
                  const illness = patient
                    ? (cfg.illnessRecipes || localIllnessRecipes).find(r => r.id === patient.illnessId)
                    : null;
                  const stay = illness?.stayDurationSec || 20;
                  const progress = patient ? Math.min(1, (patient.processAccum || 0) / stay) : 0;
                  void editorTick;
                  return (
                    <div key={v.id} className="bg-white rounded-lg border border-rose-100 p-2">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: v.color }} />
                        <VehicleTypeIcon type={v.type} />
                        <span className="font-mono text-[10px] text-slate-500 truncate flex-1">{v.id}</span>
                        <span className="text-[10px] font-bold text-rose-700">Bay {bayIndex + 1}</span>
                      </div>
                      {patient && illness ? (
                        <div>
                          <div className="text-[10px] text-slate-600 mb-0.5">
                            Treating: <strong>{illness.name}</strong>
                            {patient.patientLabel ? ` (${patient.patientLabel})` : ''}
                          </div>
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-rose-500 transition-all" style={{ width: `${progress * 100}%` }} />
                          </div>
                          <div className="text-[9px] text-slate-400 mt-0.5">
                            {Math.max(0, Math.ceil(stay - (patient.processAccum || 0)))}s remaining of {stay}s stay
                          </div>
                          <button
                            type="button"
                            className="mt-1 text-[10px] text-red-600 hover:underline"
                            onClick={() => {
                              const nextPatients = (cfg.activePatients || []).filter(p => p.id !== patient.id);
                              const refundInv = { ...(cfg.inventory || {}) };
                              (illness.inputs || []).forEach(inp => {
                                refundInv[inp.item] = (refundInv[inp.item] || 0) + (inp.amount || 1);
                              });
                              const nextEco = {
                                ...economy,
                                buildings: {
                                  ...economy.buildings,
                                  [bkey]: { ...cfg, activePatients: nextPatients, inventory: refundInv },
                                },
                              };
                              setEconomy(nextEco);
                              setLocalInv(refundInv);
                              if (roomCode) socket.emit('update-economy', { roomCode, economy: nextEco });
                            }}
                          >
                            Discharge early &amp; refund supplies
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className="text-[10px] text-slate-500">Admit patient — choose illness:</div>
                          <div className="flex flex-wrap gap-1">
                            {(cfg.illnessRecipes || localIllnessRecipes).map(illness => {
                              const liveCfg = { ...cfg, inventory: localInv };
                              const err = canStartTreatment(liveCfg, illness, v);
                              return (
                                <button
                                  key={illness.id}
                                  type="button"
                                  disabled={!!err || !roomCode}
                                  title={err || illness.description || illness.name}
                                  onClick={() => {
                                    const nextInv = { ...localInv };
                                    for (const inp of illness.inputs || []) {
                                      nextInv[inp.item] = (nextInv[inp.item] || 0) - (inp.amount || 1);
                                      if (nextInv[inp.item] <= 0) delete nextInv[inp.item];
                                    }
                                    const patient: ActivePatient = {
                                      id: `patient-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                                      illnessId: illness.id,
                                      vehicleId: v.id,
                                      bayIndex,
                                      processAccum: 0,
                                      patientLabel: v.type === 'ambulance' ? 'Ambulance patient' : `From ${v.type || 'vehicle'}`,
                                    };
                                    const nextEco = {
                                      ...economy,
                                      buildings: {
                                        ...economy.buildings,
                                        [bkey]: {
                                          ...cfg,
                                          inventory: nextInv,
                                          illnessRecipes: localIllnessRecipes,
                                          activePatients: [...(cfg.activePatients || []), patient],
                                        },
                                      },
                                    };
                                    setLocalInv(nextInv);
                                    setEconomy(nextEco);
                                    if (roomCode) socket.emit('update-economy', { roomCode, economy: nextEco });
                                  }}
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-40"
                                >
                                  {illness.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="font-semibold text-sm mb-1">Illnesses &amp; Healing Recipes</div>
              <p className="text-[10px] text-slate-400 mb-1">
                Describe illnesses and the supplies + stay time required to heal them. Supplies are taken when treatment starts.
              </p>
              <div className="border rounded p-2 text-xs bg-slate-50 space-y-2 max-h-56 overflow-auto">
                {localIllnessRecipes.length === 0 && <div className="text-slate-400">No illness types yet</div>}
                {localIllnessRecipes.map((illness, rIdx) => (
                  <div key={illness.id} className="bg-white border border-slate-100 rounded p-2 space-y-1">
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={illness.name}
                        onChange={e => {
                          const n = [...localIllnessRecipes];
                          n[rIdx] = { ...n[rIdx], name: e.target.value };
                          setLocalIllnessRecipes(n);
                        }}
                        className="flex-1 border rounded px-1.5 py-0.5 text-xs font-medium"
                        placeholder="Illness name"
                      />
                      <input
                        type="number"
                        min={1}
                        value={illness.stayDurationSec}
                        onChange={e => {
                          const n = [...localIllnessRecipes];
                          n[rIdx] = { ...n[rIdx], stayDurationSec: Math.max(1, parseInt(e.target.value) || 1) };
                          setLocalIllnessRecipes(n);
                        }}
                        className="w-14 border rounded px-1 py-0.5 text-xs text-right"
                        title="Stay duration (seconds)"
                      />
                      <span className="text-[9px] text-slate-400">sec stay</span>
                      <button
                        type="button"
                        className="text-red-500 text-[10px]"
                        onClick={() => setLocalIllnessRecipes(localIllnessRecipes.filter((_, i) => i !== rIdx))}
                      >×</button>
                    </div>
                    <textarea
                      value={illness.description || ''}
                      onChange={e => {
                        const n = [...localIllnessRecipes];
                        n[rIdx] = { ...n[rIdx], description: e.target.value };
                        setLocalIllnessRecipes(n);
                      }}
                      className="w-full border rounded px-1.5 py-0.5 text-[10px] min-h-[2.2rem] resize-y"
                      placeholder="Describe the illness and healing protocol…"
                      rows={2}
                    />
                    <div className="space-y-0.5">
                      <div className="text-[10px] text-slate-500">Supplies required</div>
                      {(illness.inputs || []).map((inp, iIdx) => (
                        <div key={iIdx} className="flex gap-1 items-center">
                          <input
                            type="text"
                            value={inp.item}
                            onChange={e => {
                              const n = [...localIllnessRecipes];
                              const inputs = [...(n[rIdx].inputs || [])];
                              inputs[iIdx] = { ...inputs[iIdx], item: e.target.value };
                              n[rIdx] = { ...n[rIdx], inputs };
                              setLocalIllnessRecipes(n);
                            }}
                            list={`hospital-items-${bkey}`}
                            className="flex-1 border rounded px-1 py-0.5 text-[10px]"
                            placeholder="supply id"
                          />
                          <input
                            type="number"
                            min={1}
                            value={inp.amount}
                            onChange={e => {
                              const n = [...localIllnessRecipes];
                              const inputs = [...(n[rIdx].inputs || [])];
                              inputs[iIdx] = { ...inputs[iIdx], amount: Math.max(1, parseInt(e.target.value) || 1) };
                              n[rIdx] = { ...n[rIdx], inputs };
                              setLocalIllnessRecipes(n);
                            }}
                            className="w-12 border rounded px-1 py-0.5 text-[10px] text-right"
                          />
                          <button
                            type="button"
                            className="text-red-500"
                            onClick={() => {
                              const n = [...localIllnessRecipes];
                              n[rIdx] = {
                                ...n[rIdx],
                                inputs: (n[rIdx].inputs || []).filter((_, i) => i !== iIdx),
                              };
                              setLocalIllnessRecipes(n);
                            }}
                          >×</button>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="text-[10px] text-emerald-600"
                        onClick={() => {
                          const n = [...localIllnessRecipes];
                          n[rIdx] = {
                            ...n[rIdx],
                            inputs: [...(n[rIdx].inputs || []), { item: pickDefaultItem() || 'medicine', amount: 1 }],
                          };
                          setLocalIllnessRecipes(n);
                        }}
                      >+ Add supply</button>
                    </div>
                    <label className="flex items-center gap-1 text-[10px] text-slate-500">
                      <input
                        type="checkbox"
                        checked={(illness.vehicleTypes || []).includes('ambulance')}
                        onChange={e => {
                          const n = [...localIllnessRecipes];
                          n[rIdx] = {
                            ...n[rIdx],
                            vehicleTypes: e.target.checked ? ['ambulance'] : undefined,
                          };
                          setLocalIllnessRecipes(n);
                        }}
                      />
                      Prefer ambulance delivery
                    </label>
                  </div>
                ))}
                <datalist id={`hospital-items-${bkey}`}>
                  {itemDefs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  {['medicine', 'bandages', 'painkillers', 'blood-bags', 'iv-fluids', 'antibiotics', 'defibrillator-pads', 'epinephrine', 'medical-supplies'].map(id => (
                    <option key={id} value={id} />
                  ))}
                </datalist>
                <div className="flex gap-1 pt-1">
                  <input
                    type="text"
                    value={newIllnessName}
                    onChange={e => setNewIllnessName(e.target.value)}
                    placeholder="New illness name…"
                    className="flex-1 border rounded px-2 py-1 text-xs"
                  />
                  <button
                    type="button"
                    className="px-2 py-1 bg-rose-600 text-white rounded text-xs disabled:opacity-40"
                    disabled={!newIllnessName.trim()}
                    onClick={() => {
                      const id = normalizeItemId(newIllnessName) || `illness-${Date.now()}`;
                      setLocalIllnessRecipes(prev => [
                        ...prev,
                        {
                          id: `${id}-${Date.now().toString(36).slice(-4)}`,
                          name: newIllnessName.trim(),
                          description: '',
                          inputs: [{ item: 'medicine', amount: 1 }],
                          stayDurationSec: 25,
                          vehicleTypes: ['ambulance'],
                        },
                      ]);
                      setNewIllnessName('');
                    }}
                  >Add</button>
                </div>
              </div>
              <div className="text-[10px] text-slate-400 mt-1">Click Save Changes to store illness recipes.</div>
            </div>
          </div>
        )}

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

            <div className="flex items-center gap-2 text-xs">
              <span>Required employees:</span>
              <input
                type="number"
                min={0}
                value={localRequiredEmployees}
                onChange={e => setLocalRequiredEmployees(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-16 border px-1"
              />
            </div>

            {(() => {
              const staff = countEmployeesAtBuilding(economy.people, bkey);
              const need = localRequiredEmployees;
              const staffed = need <= 0 || staff >= need;
              const employees = Object.values(economy.people || {}).filter(p => p.workplaceKey === bkey);
              return (
                <div className={`p-2 rounded-lg border text-xs ${staffed ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                  <div className="flex items-center justify-between font-medium mb-1">
                    <span className={staffed ? 'text-emerald-800' : 'text-rose-800'}>
                      Staffing: {staff}/{need} employees
                    </span>
                    {!staffed && <span className="text-rose-600 text-[10px]">Production paused</span>}
                  </div>
                  {employees.length === 0 ? (
                    <p className="text-[10px] text-slate-500">
                      No employees assigned. Select people in the People panel, then click &quot;Assign workplace&quot; and choose this building.
                    </p>
                  ) : (
                    <ul className="text-[10px] text-slate-600 space-y-0.5 max-h-20 overflow-y-auto">
                      {employees.map(p => (
                        <li key={p.id}>{personDisplayName(p)} · {formatAge(p.ageYears)}</li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })()}

            {isRecipeBuilding(cfg) && (() => {
              void editorTick;
              const elapsed = economy.economyPaused ? 0 : (Date.now() - cfgSyncRef.current) / 1000;
              const staffed = isStaffedForProduction(cfg, bkey, economy.people);
              const remaining = getRecipeCycleRemaining(cfg, economy.economyPaused, elapsed, staffed);
              return remaining !== null ? (
                <div className="flex items-center justify-between p-2 rounded-lg bg-violet-50 border border-violet-200">
                  <span className="text-xs font-medium text-violet-800">
                    {staffed ? 'Next batch' : 'Waiting for staff'}
                  </span>
                  {staffed ? (
                    <CycleCountdownBadge remaining={remaining} className="text-[10px] px-1.5 py-0.5" />
                  ) : (
                    <span className="text-[10px] text-rose-600 font-bold">
                      👷{countEmployeesAtBuilding(economy.people, bkey)}/{getRequiredEmployees(cfg)}
                    </span>
                  )}
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
          <button onClick={() => saveConfig()} className="flex-1 bg-emerald-600 text-white rounded py-1 text-sm">Save Changes</button>
          <button onClick={() => {
            const nextB = { ...economy.buildings };
            delete nextB[bkey];
            const next = { ...economy, buildings: nextB };
            setEconomy(next);
            if (roomCode) socket.emit('update-economy', { roomCode, economy: next });
            onClose();
          }} className="text-red-600 text-xs px-3">Remove Config</button>
          <button onClick={() => { saveConfig(); onClose(); }} className="px-4 py-1 bg-slate-800 text-white rounded text-xs">Close</button>
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

  const normalizeEconomy = (eco: Partial<EconomyState> | undefined): EconomyState => {
    const buildings =
      eco?.buildings && typeof eco.buildings === 'object'
        ? Object.fromEntries(
            Object.entries(eco.buildings).map(([k, b]) => [k, normalizeBuildingConfig(b as BuildingConfig)])
          )
        : {};
    const parkedTrailers =
      eco?.parkedTrailers && typeof eco.parkedTrailers === 'object' ? { ...eco.parkedTrailers } : {};
    // Auto-add items required/produced/stored by buildings into the Logistics item list
    const itemDefs = mergeItemDefsWithBuildingReferences(
      Array.isArray(eco?.itemDefs) ? eco!.itemDefs : [],
      buildings,
      parkedTrailers,
    );
    return {
      itemDefs,
      buildings,
      parkedTrailers,
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
      people: eco?.people && typeof eco.people === 'object' ? { ...eco.people } : {},
      families: eco?.families && typeof eco.families === 'object' ? { ...eco.families } : {},
      peoplePaused: eco?.peoplePaused ?? false,
    };
  };

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
  const [clipboard, setClipboard] = useState<LayoutSnapshot | null>(null);
  const [isPasting, setIsPasting] = useState(false);

  const [activeCategory, setActiveCategory] = useState<'road' | 'rail' | 'building' | 'landscape'>('road');
  const [showInfo, setShowInfo] = useState(false);
  const [showGridLines, setShowGridLines] = useState(true);
  const [showSidebar, setShowSidebar] = useState(true);
  const [library, setLibrary] = useState<{ id: string; name: string; data: LayoutSnapshot | GridData }[]>([]);
  const [newLayoutName, setNewLayoutName] = useState('');
  const [lastSavedGrid, setLastSavedGrid] = useState<GridData>({});
  const [mousePos, setMousePos] = useState<Point>({ x: 0, y: 0 });
  const [densityModal, setDensityModal] = useState<{ type: 'road' | 'rail' | 'map' | null }>({ type: null });
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [showLoadConfirm, setShowLoadConfirm] = useState(false);
  const [showDeleteLayoutConfirm, setShowDeleteLayoutConfirm] = useState<{ id: string; name: string } | null>(null);
  const [pendingLayout, setPendingLayout] = useState<LayoutSnapshot | null>(null);
  const [pastePreviewPos, setPastePreviewPos] = useState<Point | null>(null);
  const [vehicles, _setVehicles] = useState<Record<string, Vehicle>>({});
  const vehiclesRef = useRef<Record<string, Vehicle>>({});
  const lastSyncedVehicles = useRef<Record<string, Vehicle>>({});
  const setVehicles = useCallback((next: Record<string, Vehicle> | ((prev: Record<string, Vehicle>) => Record<string, Vehicle>)) => {
    if (typeof next === 'function') {
      _setVehicles(prev => {
        const normalized = normalizeVehicles(next(prev));
        vehiclesRef.current = normalized;
        return normalized;
      });
    } else {
      const normalized = normalizeVehicles(next);
      vehiclesRef.current = normalized;
      _setVehicles(normalized);
    }
  }, []);
  const [selectedVehicles, setSelectedVehicles] = useState<Set<string>>(new Set());
  const [isPlacingVehicles, setIsPlacingVehicles] = useState(false);
  const [showCarsPanel, setShowCarsPanel] = useState(false);
  const [showSemiTrailerPanel, setShowSemiTrailerPanel] = useState(false);
  const [showTrainPanel, setShowTrainPanel] = useState(false);
  const [showServicePanel, setShowServicePanel] = useState(false);
  const addCarsCountRef = useRef<HTMLInputElement>(null);
  const [userColor, setUserColor] = useState<string>('#ef4444');
  const userRef = useRef<{ uid: string } | null>(null);
  const userColorRef = useRef<string>('#ef4444');
  const [remoteCursors, setRemoteCursors] = useState<RemoteCursor[]>([]);
  const remoteCursorsRef = useRef<Map<string, RemoteCursor>>(new Map());
  const bufferedKeysRef = useRef<Set<string>>(new Set());
  const [hasBufferedEdits, setHasBufferedEdits] = useState(false);
  const gridSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cursorEmitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localCursorGridRef = useRef<{ gridX: number; gridY: number }>({ gridX: 0, gridY: 0 });

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
    people: {},
    families: {},
    peoplePaused: false,
  });
  const localEconomyRef = useRef<EconomyState>({
    itemDefs: [],
    buildings: {},
    parkedTrailers: {},
    showInventoryLabels: true,
    showCargoLabels: true,
    economyPaused: false,
    people: {},
    families: {},
    peoplePaused: false,
  });
  const economyTimerSyncRef = useRef(Date.now());
  const [cycleUiTick, setCycleUiTick] = useState(0);
  const lastSyncedEconomy = useRef<EconomyState>({
    itemDefs: [],
    buildings: {},
    parkedTrailers: {},
    showInventoryLabels: true,
    showCargoLabels: true,
    economyPaused: false,
    people: {},
    families: {},
    peoplePaused: false,
  });
  const [showLogistics, setShowLogistics] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemEmoji, setNewItemEmoji] = useState('📦');
  const [editingItemEmoji, setEditingItemEmoji] = useState<string | null>(null);
  const [showPlantGrowth, setShowPlantGrowth] = useState(false);

  const getCycleRemainingForBuilding = useCallback((cfg: BuildingConfig, buildingKey?: string) => {
    void cycleUiTick;
    const elapsed = economy.economyPaused ? 0 : (Date.now() - economyTimerSyncRef.current) / 1000;
    const key = buildingKey || cfg.anchorKey;
    const staffed = isStaffedForProduction(cfg, key, economy.people);
    return getRecipeCycleRemaining(cfg, economy.economyPaused, elapsed, staffed);
  }, [cycleUiTick, economy.economyPaused, economy.people]);

  useEffect(() => {
    const hasActiveRecipe = Object.values(economy.buildings).some(b => isRecipeBuilding(b));
    if (!hasActiveRecipe || economy.economyPaused) return;
    const iv = setInterval(() => setCycleUiTick(t => t + 1), 100);
    return () => clearInterval(iv);
  }, [economy.buildings, economy.economyPaused]);
  const [inspectBuildingKey, setInspectBuildingKey] = useState<string | null>(null);
  /** When set, show home people/family inspector for this house grid key */
  const [inspectHomeKey, setInspectHomeKey] = useState<string | null>(null);
  const [inspectTrailerRef, setInspectTrailerRef] = useState<TrailerRef | null>(null);
  const [inspectRailcarRef, setInspectRailcarRef] = useState<RailcarRef | null>(null);
  const [pendingRouteVehicleId, setPendingRouteVehicleId] = useState<string | null>(null);
  /** When true, next house click assigns homeKey for selected cars */
  const [pendingHomeAssign, setPendingHomeAssign] = useState(false);
  /** When true, next tree click starts a fire on that tile */
  const [pendingFireStart, setPendingFireStart] = useState(false);
  /** When true, next building click assigns selected people as employees */
  const [pendingEmployeeAssign, setPendingEmployeeAssign] = useState(false);
  /** Tick for burning tree animation re-render */
  const [burnUiTick, setBurnUiTick] = useState(0);
  const [showPeoplePanel, setShowPeoplePanel] = useState(false);
  const [selectedPersonIds, setSelectedPersonIds] = useState<Set<string>>(new Set());
  const [peopleFilter, setPeopleFilter] = useState('');
  /** People panel create/edit form */
  const [peopleFormMode, setPeopleFormMode] = useState<'closed' | 'create' | 'edit'>('closed');
  const [peopleForm, setPeopleForm] = useState({
    firstName: '',
    lastName: '',
    sex: 'm' as 'm' | 'f',
    ageYears: 30,
    homeKey: '',
    workplaceKey: '',
    money: 50,
    health: 'healthy' as Person['health'],
  });
  const [traffic, setTraffic] = useState<TrafficState>(DEFAULT_TRAFFIC_STATE);
  const localTrafficRef = useRef<TrafficState>(DEFAULT_TRAFFIC_STATE);
  const [showTrafficPanel, setShowTrafficPanel] = useState(false);
  const [trafficTool, setTrafficTool] = useState<TrafficTool>(null);
  const [selectedTrafficIds, setSelectedTrafficIds] = useState<Set<string>>(new Set());
  const [hoveredGridKey, setHoveredGridKey] = useState<string | null>(null);
  const roomCodeRef = useRef<string | null>(null);
  const [isSimLeader, setIsSimLeader] = useState(false);
  const isSimLeaderRef = useRef(false);
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const didDragPointerRef = useRef(false);

  const selectPaletteTile = useCallback((type: TileType) => {
    setSelectedTile(type);
    setIsPlacingVehicles(false);
    setPendingRouteVehicleId(null);
    setIsPasting(false);
    setTrafficTool(null);
  }, []);

  const [roomCode, setRoomCode] = useState<string | null>(null);

  const emitTraffic = useCallback((next: TrafficState) => {
    const normalized = normalizeTraffic(next);
    setTraffic(normalized);
    localTrafficRef.current = normalized;
    const rc = roomCodeRef.current;
    if (rc) socket.emit('update-traffic', { roomCode: rc, traffic: normalized });
  }, []);
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
        socket.emit('leave-room', 'lobby');
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
    userRef.current = { uid };
    
    // Assign a random color
    const colors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    setUserColor(randomColor);
    userColorRef.current = randomColor;
  }, []);

  useEffect(() => {
    roomCodeRef.current = roomCode;
  }, [roomCode]);

  const resetTrafficState = useCallback(() => {
    setTraffic(DEFAULT_TRAFFIC_STATE);
    localTrafficRef.current = DEFAULT_TRAFFIC_STATE;
    setSelectedTrafficIds(new Set());
    setTrafficTool(null);
  }, []);

  const updateBufferedState = useCallback(() => {
    setHasBufferedEdits(bufferedKeysRef.current.size > 0);
  }, []);

  const flushGridSync = useCallback(() => {
    const rc = roomCodeRef.current;
    if (!rc) return;

    const updates = diffGrid(localGridRef.current, lastSyncedGrid.current);
    if (Object.keys(updates).length === 0) return;

    socket.emit('update-grid', { roomCode: rc, updates });
  }, []);

  const scheduleGridSync = useCallback(() => {
    if (gridSyncTimerRef.current) clearTimeout(gridSyncTimerRef.current);
    gridSyncTimerRef.current = setTimeout(() => {
      gridSyncTimerRef.current = null;
      flushGridSync();
    }, 32);
  }, [flushGridSync]);

  const emitCursorPosition = useCallback((gridX: number, gridY: number, isBuffered: boolean) => {
    const rc = roomCodeRef.current;
    const uid = userRef.current?.uid;
    if (!rc || !uid) return;

    socket.emit('cursor-move', {
      roomCode: rc,
      gridX,
      gridY,
      userId: uid,
      userColor: userColorRef.current,
      isBuffered,
    });
  }, []);

  const scheduleCursorEmit = useCallback((gridX: number, gridY: number, isBuffered: boolean) => {
    localCursorGridRef.current = { gridX, gridY };
    if (cursorEmitTimerRef.current) return;
    cursorEmitTimerRef.current = setTimeout(() => {
      cursorEmitTimerRef.current = null;
      const { gridX: gx, gridY: gy } = localCursorGridRef.current;
      emitCursorPosition(gx, gy, isBuffered);
    }, 50);
  }, [emitCursorPosition]);

  // Sync grid from Socket.io
  useEffect(() => {
    if (!roomCode) {
      resetTrafficState();
      return;
    }

    resetTrafficState();
    bufferedKeysRef.current.clear();
    updateBufferedState();
    remoteCursorsRef.current.clear();
    setRemoteCursors([]);
    socket.emit('join-room', roomCode);

    const uid = userRef.current?.uid;
    if (uid) {
      socket.emit('presence-hello', {
        roomCode,
        userId: uid,
        userColor: userColorRef.current,
      });
    }

    const handleWorldState = (data: any) => {
      if (data.roomCode && data.roomCode !== roomCodeRef.current) return;
      if (data.grid) {
        const clippedGrid = clipGridDataToCanvas(data.grid);
        lastSyncedGrid.current = clippedGrid;
        gridRef.current = clippedGrid;
        bufferedKeysRef.current.clear();
        updateBufferedState();
        setGrid(clippedGrid);
      }
      if (data.vehicles) {
        const normalizedVehicles = normalizeVehicles(data.vehicles);
        lastSyncedVehicles.current = normalizedVehicles;
        vehiclesRef.current = normalizedVehicles;
        setVehicles(normalizedVehicles);
      }
      if (data.economy) {
        const loaded = data.economy || {};
        const safeEconomy = normalizeEconomy(loaded);
        lastSyncedEconomy.current = safeEconomy;
        setEconomy(safeEconomy);
        localEconomyRef.current = safeEconomy;
      }
      const safeTraffic = normalizeTraffic(data.traffic ?? null);
      setTraffic(safeTraffic);
      localTrafficRef.current = safeTraffic;
    };

    const handleGridUpdated = (updates: Record<string, any>) => {
      const currentGrid = localGridRef.current;
      const newGrid = { ...currentGrid };
      let changed = false;

      Object.entries(updates).forEach(([key, val]) => {
        const pendingLocal =
          JSON.stringify(currentGrid[key]) !== JSON.stringify(lastSyncedGrid.current[key]);
        if (bufferedKeysRef.current.has(key) || pendingLocal) return;

        const [x, y] = key.split(',').map(Number);
        if (!isWithinGridCanvas(x, y)) {
          if (newGrid[key] !== undefined) {
            delete newGrid[key];
            changed = true;
          }
          return;
        }
        if (val === null || val === undefined) {
          if (newGrid[key] !== undefined) {
            delete newGrid[key];
            changed = true;
          }
        } else {
          newGrid[key] = val;
          changed = true;
        }
      });

      lastSyncedGrid.current = mergeAcceptedIntoBaseline(lastSyncedGrid.current, updates);
      if (changed) setGrid(newGrid);
    };

    const handleGridUpdateAck = ({ accepted, rejected }: { accepted: Record<string, any>; rejected: string[] }) => {
      lastSyncedGrid.current = mergeAcceptedIntoBaseline(lastSyncedGrid.current, accepted);

      for (const key of Object.keys(accepted)) {
        bufferedKeysRef.current.delete(key);
      }
      for (const key of rejected ?? []) {
        bufferedKeysRef.current.add(key);
      }
      updateBufferedState();

      if ((rejected?.length ?? 0) > 0) {
        setTimeout(() => scheduleGridSync(), CELL_LOCK_RETRY_MS);
      }
    };

    const handlePresenceJoined = ({ socketId, userId, userColor: color }: { socketId: string; userId: string; userColor: string }) => {
      if (socketId === socket.id) return;
      const existing = remoteCursorsRef.current.get(socketId);
      remoteCursorsRef.current.set(socketId, {
        socketId,
        userId,
        userColor: color,
        gridX: existing?.gridX ?? 0,
        gridY: existing?.gridY ?? 0,
        isBuffered: existing?.isBuffered ?? false,
        lastSeen: Date.now(),
      });
      setRemoteCursors(Array.from(remoteCursorsRef.current.values()));
    };

    const handlePresenceLeft = ({ socketId }: { socketId: string }) => {
      remoteCursorsRef.current.delete(socketId);
      setRemoteCursors(Array.from(remoteCursorsRef.current.values()));
    };

    const handleCursorMoved = (payload: {
      socketId: string;
      gridX: number;
      gridY: number;
      userId: string;
      userColor: string;
      isBuffered: boolean;
    }) => {
      if (payload.socketId === socket.id) return;
      remoteCursorsRef.current.set(payload.socketId, {
        ...payload,
        lastSeen: Date.now(),
      });
      setRemoteCursors(Array.from(remoteCursorsRef.current.values()));
    };

    const handleVehiclesUpdated = (payload: any) => {
      const eventRoom = typeof payload?.roomCode === 'string' ? payload.roomCode : null;
      const newVehicles = payload?.vehicles ?? payload;
      if (eventRoom && eventRoom !== roomCodeRef.current) return;
      const normalized = normalizeVehicles(newVehicles);
      lastSyncedVehicles.current = normalized;
      vehiclesRef.current = normalized;
      setVehicles(normalized);
    };

    const handleEconomyUpdated = (payload: any) => {
      const eventRoom = typeof payload?.roomCode === 'string' ? payload.roomCode : null;
      const newEconomy = payload?.economy ?? payload;
      if (eventRoom && eventRoom !== roomCodeRef.current) return;
      const safeEconomy = normalizeEconomy(newEconomy || {});
      setEconomy(safeEconomy);
      lastSyncedEconomy.current = safeEconomy;
      localEconomyRef.current = safeEconomy;
    };

    const handleRoomSimRole = ({ roomCode: eventRoom, simLeaderId }: { roomCode: string; simLeaderId: string }) => {
      if (eventRoom !== roomCodeRef.current) return;
      const leader = simLeaderId === socket.id;
      isSimLeaderRef.current = leader;
      setIsSimLeader(leader);
      if (leader) {
        lastTimeRef.current = 0;
        lastSyncedVehicles.current = vehiclesRef.current;
      }
    };

    const handleTrafficUpdated = (payload: any) => {
      const eventRoom = typeof payload?.roomCode === 'string' ? payload.roomCode : null;
      const newTraffic = payload?.traffic ?? payload;
      if (eventRoom && eventRoom !== roomCodeRef.current) return;
      const safe = normalizeTraffic(newTraffic);
      setTraffic(safe);
      localTrafficRef.current = safe;
    };

    socket.on('world-state', handleWorldState);
    socket.on('grid-updated', handleGridUpdated);
    socket.on('grid-update-ack', handleGridUpdateAck);
    socket.on('presence-joined', handlePresenceJoined);
    socket.on('presence-left', handlePresenceLeft);
    socket.on('cursor-moved', handleCursorMoved);
    socket.on('vehicles-updated', handleVehiclesUpdated);
    socket.on('economy-updated', handleEconomyUpdated);
    socket.on('traffic-updated', handleTrafficUpdated);
    socket.on('room-sim-role', handleRoomSimRole);

    const cursorStaleInterval = setInterval(() => {
      const now = Date.now();
      let pruned = false;
      for (const [id, cursor] of remoteCursorsRef.current) {
        if (now - cursor.lastSeen > 8000) {
          remoteCursorsRef.current.delete(id);
          pruned = true;
        }
      }
      if (pruned) setRemoteCursors(Array.from(remoteCursorsRef.current.values()));
    }, 4000);

    return () => {
      socket.emit('leave-room', roomCode);
      isSimLeaderRef.current = false;
      setIsSimLeader(false);
      clearInterval(cursorStaleInterval);
      socket.off('world-state', handleWorldState);
      socket.off('grid-updated', handleGridUpdated);
      socket.off('grid-update-ack', handleGridUpdateAck);
      socket.off('presence-joined', handlePresenceJoined);
      socket.off('presence-left', handlePresenceLeft);
      socket.off('cursor-moved', handleCursorMoved);
      socket.off('vehicles-updated', handleVehiclesUpdated);
      socket.off('economy-updated', handleEconomyUpdated);
      socket.off('traffic-updated', handleTrafficUpdated);
      socket.off('room-sim-role', handleRoomSimRole);
    };
  }, [roomCode, resetTrafficState, updateBufferedState, scheduleGridSync]);

  // Push local grid changes ASAP (debounced ~32ms)
  useEffect(() => {
    if (!roomCode) return;
    scheduleGridSync();
  }, [grid, roomCode, scheduleGridSync]);

  // Retry buffered edits while cell locks may still be held
  useEffect(() => {
    if (!roomCode || !hasBufferedEdits) return;
    const retryId = setInterval(() => scheduleGridSync(), 300);
    return () => clearInterval(retryId);
  }, [roomCode, hasBufferedEdits, scheduleGridSync]);

  // Broadcast buffered cursor state immediately when it changes
  useEffect(() => {
    if (!roomCode) return;
    const { gridX, gridY } = localCursorGridRef.current;
    emitCursorPosition(gridX, gridY, hasBufferedEdits);
  }, [roomCode, hasBufferedEdits, emitCursorPosition]);

  useEffect(() => {
    if (selectedVehicles.size === 0) {
      setIsPlacingVehicles(false);
      setPendingRouteVehicleId(null);
    }
  }, [selectedVehicles]);

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

  /** Merge React economy state with the live ref so inventory is never missed on save. */
  const getLiveEconomy = useCallback((): EconomyState => {
    const fromState = economy;
    const fromRef = localEconomyRef.current;
    const mergedBuildings: Record<string, BuildingConfig> = { ...(fromState.buildings || {}) };
    Object.entries(fromRef.buildings || {}).forEach(([k, cfg]) => {
      const preferred = preferBuildingConfig(mergedBuildings[k], cfg as BuildingConfig, k);
      if (preferred) mergedBuildings[k] = preferred;
    });
    const itemDefsById = new Map<string, ItemDef>();
    [...(fromState.itemDefs || []), ...(fromRef.itemDefs || [])].forEach(d => {
      if (d?.id) itemDefsById.set(d.id, d);
    });
    return {
      ...fromState,
      ...fromRef,
      buildings: mergedBuildings,
      itemDefs: Array.from(itemDefsById.values()),
    };
  }, [economy]);

  const saveToLibrary = async (forceWholeGrid = false) => {
    if (!newLayoutName.trim()) return;

    let dataToSave: LayoutSnapshot | null = null;
    const liveEconomy = getLiveEconomy();

    if (selectionStart && selectionEnd && !forceWholeGrid) {
      const x1 = Math.min(selectionStart.x, selectionEnd.x);
      const y1 = Math.min(selectionStart.y, selectionEnd.y);
      const x2 = Math.max(selectionStart.x, selectionEnd.x);
      const y2 = Math.max(selectionStart.y, selectionEnd.y);

      dataToSave = captureLayoutSnapshot(gridRef.current, liveEconomy, { x1, y1, x2, y2 });
    } else if (!forceWholeGrid && Object.keys(grid).length > 0) {
      setShowSaveConfirm(true);
      return;
    } else {
      dataToSave = captureLayoutSnapshot(gridRef.current, liveEconomy, null);
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
    const nextGrid = clipGridDataToCanvas(sim.data.grid || {});
    setGrid(nextGrid);
    setVehicles(sim.data.vehicles || {});
    setSelectedVehicles(new Set());
    bufferedKeysRef.current.clear();
    updateBufferedState();
    if (roomCode) {
      lastSyncedGrid.current = nextGrid;
      socket.emit('update-grid', { roomCode, updates: nextGrid });
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
            if (vType === 'semi') {
              return t.type.startsWith('road') || t.type === 'parking-2x4' || t.type === 'parking-4x4' || isBuildingParkingBay(t);
            }
            if (vType === 'train') return t.type.startsWith('rail') || t.type.includes('trestle') || isBuildingParkingBay(t);
            return t.type.startsWith('road') || t.type.startsWith('parking-') || isBuildingParkingBay(t);
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
        if (isBuildingParkingBay(targetTile)) {
          heading = (targetTile.rotation + 180) % 360;
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

  const addRandomCars = (type: VehicleType = 'car') => {
    const count = parseInt(addCarsCountRef.current?.value || '1', 10);
    if (isNaN(count) || count <= 0) return;

    const isService = isServiceVehicleType(type);
    const roadTiles = Object.entries(grid).filter(([key, tiles]) => 
      (tiles as GridTile[]).some(t => {
        if (t.type === 'rail-road-crossing') return true;
        if (type === 'train') return t.type.startsWith('rail') || t.type.includes('trestle');
        if (type === 'semi') return t.type.startsWith('road') || t.type === 'parking-2x4' || t.type === 'parking-4x4' || isBuildingParkingBay(t);
        // cars + service vehicles: roads, parking lots, repair/hospital bays
        return t.type.startsWith('road') || t.type.startsWith('parking-') || isBuildingParkingBay(t);
      })
    );

    if (roadTiles.length === 0) return;

    const updatedVehicles = { ...vehicles };
    const newIds = [];
    
    for(let i=0; i<count; i++) {
        const id = Math.random().toString(36).substring(2, 11);
        newIds.push(id);
        const serviceMeta = isService ? SERVICE_VEHICLE_META[type as ServiceVehicleType] : null;
        const randomColor = serviceMeta
          ? serviceMeta.color
          : '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
        
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
        if (isBuildingParkingBay(topTile)) {
          heading = (topTile.rotation + 180) % 360; // face into the building
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
           speed: isService ? 1.2 : 1,
           turnAroundAtDeadEnd: true,
           randomTurning: !isService,
           turnIntent: ['left', 'right', 'straight'][Math.floor(Math.random() * 3)] as any,
           trailers: type === 'semi' ? 1 : 0,
           maxPassengers: getMaxPassengers(type),
           passengerIds: [],
           ...(isService && hasEmergencyLights(type) ? { emergencyLightsOn: true } : {}),
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

  /** Toggle emergency light bars on selected emergency vehicles (majority → opposite). */
  const toggleSelectedEmergencyLights = (targetIds: Iterable<string> = selectedVehicles) => {
    const ids = Array.from(targetIds).filter(id => hasEmergencyLights(vehicles[id]?.type));
    if (ids.length === 0) return;
    const updatedVehicles = { ...vehicles };
    let onCount = 0;
    ids.forEach(id => {
      if (updatedVehicles[id]?.emergencyLightsOn !== false) onCount++;
    });
    // If majority are on, turn off; otherwise turn on
    const newState = onCount < ids.length / 2;
    ids.forEach(id => {
      if (updatedVehicles[id]) {
        updatedVehicles[id] = { ...updatedVehicles[id], emergencyLightsOn: newState };
      }
    });
    setVehicles(updatedVehicles);
    if (roomCode) {
      socket.emit('update-vehicles', { roomCode, vehicles: updatedVehicles });
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
    setPendingHomeAssign(false);
    setPendingEmployeeAssign(false);
    setPendingRouteVehicleId(ids[0]);
  };

  const toggleHomeAssignMode = (targetIds: Iterable<string> = selectedVehicles) => {
    const ids = Array.from(targetIds).filter(id => {
      const t = vehicles[id]?.type || 'car';
      return t !== 'train' && t !== 'semi';
    });
    if (ids.length === 0) return;
    // If already assigning, cancel
    if (pendingHomeAssign) {
      setPendingHomeAssign(false);
      return;
    }
    // If selection already has homes, allow re-assign; toggle mode on
    setPendingRouteVehicleId(null);
    setPendingEmployeeAssign(false);
    setIsPlacingVehicles(false);
    setSelectedTile(null);
    setPendingHomeAssign(true);
  };

  const clearSelectedHomes = (targetIds: Iterable<string> = selectedVehicles) => {
    const ids = Array.from(targetIds);
    if (ids.length === 0) return;
    const updatedVehicles = { ...vehicles };
    let any = false;
    ids.forEach(id => {
      if (updatedVehicles[id]?.homeKey) {
        const next = { ...updatedVehicles[id] };
        delete next.homeKey;
        delete next.nextHomeReturnAt;
        updatedVehicles[id] = next;
        any = true;
      }
    });
    if (any) {
      setVehicles(updatedVehicles);
      if (roomCode) socket.emit('update-vehicles', { roomCode, vehicles: updatedVehicles });
    }
    setPendingHomeAssign(false);
  };

  /** Assign each selected car to a random house on the map (unique when possible). */
  const assignSelectedCarsToRandomHomes = (targetIds: Iterable<string> = selectedVehicles) => {
    const ids = Array.from(targetIds).filter(id => {
      const t = vehicles[id]?.type || 'car';
      return t !== 'train' && t !== 'semi' && !!vehicles[id];
    });
    if (ids.length === 0) return;

    const homeKeys: string[] = [];
    const g = gridRef.current || grid;
    Object.entries(g).forEach(([key, tiles]) => {
      if (tiles?.some(t => t.type === 'building-home')) {
        homeKeys.push(key);
      }
    });
    if (homeKeys.length === 0) return;

    // Shuffle a pool of homes; reuse shuffled list if more cars than houses
    const shuffled = [...homeKeys];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const updatedVehicles = { ...vehicles };
    const now = Date.now();
    ids.forEach((id, index) => {
      const v = updatedVehicles[id];
      if (!v) return;
      const homeKey =
        index < shuffled.length
          ? shuffled[index]
          : homeKeys[Math.floor(Math.random() * homeKeys.length)];
      updatedVehicles[id] = {
        ...v,
        homeKey,
        nextHomeReturnAt: now + randomHomeTourDelayMs(),
      };
    });

    setVehicles(updatedVehicles);
    if (roomCode) {
      socket.emit('update-vehicles', { roomCode, vehicles: updatedVehicles });
    }
    setPendingHomeAssign(false);
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
    if (!roomCodeRef.current || !isSimLeaderRef.current) {
      lastTimeRef.current = 0;
      requestRef.current = requestAnimationFrame(updateVehicleLoop);
      return;
    }
    const currentGrid = gridRef.current || grid || {};
    if (lastTimeRef.current !== 0) {
      const deltaTime = time - lastTimeRef.current;
      
      setVehicles(prev => {
        let hasChanges = false;
        const nextVehicles = { ...prev };

        for (const [uid, v] of Object.entries(prev)) {
          const vehicle = v as Vehicle;
          const peopleMap = localEconomyRef.current.people || {};
          const hasPeopleSim = Object.keys(peopleMap).length > 0;
          // When people sim is active, vehicles need a driver to move
          if (hasPeopleSim) {
            const driverId = vehicle.driverId || getDriverId(peopleMap, vehicle.id);
            if (!driverId) {
              if (vehicle.isMoving) {
                nextVehicles[uid] = { ...vehicle, isMoving: false, driverId: undefined };
                hasChanges = true;
              }
              // Still allow parking timer / destination clear without moving
              if (vehicle.parkingStopUntil && Date.now() >= vehicle.parkingStopUntil) {
                const nv = { ...vehicle, isMoving: false };
                delete nv.parkingStopUntil;
                nextVehicles[uid] = nv;
                hasChanges = true;
              }
              continue;
            } else if (vehicle.driverId !== driverId) {
              nextVehicles[uid] = { ...vehicle, driverId };
              hasChanges = true;
            }
          }

          if (vehicle.destination && vehicle.x === vehicle.destination.x && vehicle.y === vehicle.destination.y) {
            const arrivalPatch = getDestinationArrivalPatch(vehicle, vehicle.x, vehicle.y);
            nextVehicles[uid] = { ...vehicle, ...arrivalPatch };
            hasChanges = true;
            continue;
          }

          if (vehicle.parkingStopUntil) {
            if (Date.now() >= vehicle.parkingStopUntil) {
              const newVehicle = { ...vehicle };
              delete newVehicle.parkingStopUntil;
              // Resume touring after home (or lot) parking
              newVehicle.isMoving = true;
              if (newVehicle.homeKey && !newVehicle.nextHomeReturnAt) {
                newVehicle.nextHomeReturnAt = Date.now() + randomHomeTourDelayMs();
              }
              nextVehicles[uid] = newVehicle;
              hasChanges = true;
            }
            continue;
          }

          // Cars with an assigned home occasionally set destination back home
          const vTypeForHome = vehicle.type || 'car';
          const isCarLike =
            vTypeForHome === 'car' || isServiceVehicleType(vTypeForHome);
          if (
            isCarLike &&
            vehicle.homeKey &&
            !vehicle.destination &&
            vehicle.isMoving !== false
          ) {
            const now = Date.now();
            if (!vehicle.nextHomeReturnAt) {
              nextVehicles[uid] = {
                ...vehicle,
                nextHomeReturnAt: now + randomHomeTourDelayMs(),
              };
              hasChanges = true;
              continue;
            }
            if (now >= vehicle.nextHomeReturnAt) {
              const home = parseHomeKey(vehicle.homeKey);
              if (home && currentGrid[vehicle.homeKey]) {
                // Already sitting on home tile → park immediately
                if (vehicle.x === home.x && vehicle.y === home.y) {
                  nextVehicles[uid] = {
                    ...vehicle,
                    destination: null,
                    isMoving: false,
                    progress: 0.5,
                    parkingStopUntil: now + HOME_PARK_MS,
                    lastParkingKey: vehicle.homeKey,
                    parkingStallIndex: 0,
                    nextHomeReturnAt: now + HOME_PARK_MS + randomHomeTourDelayMs(),
                  };
                } else {
                  nextVehicles[uid] = {
                    ...vehicle,
                    destination: home,
                    isMoving: true,
                    turnIntent: null,
                    // next return scheduled after this home visit completes
                    nextHomeReturnAt: now + HOME_TOUR_MAX_MS,
                  };
                }
                hasChanges = true;
                continue;
              } else {
                // Missing house — clear assignment schedule
                nextVehicles[uid] = {
                  ...vehicle,
                  nextHomeReturnAt: now + randomHomeTourDelayMs(),
                };
                hasChanges = true;
                continue;
              }
            }
          }

          const trafficState = localTrafficRef.current;
          const vType = vehicle.type || 'car';

          if (vehicle.trafficStopUntil && vType !== 'train') {
            const key = `${vehicle.x},${vehicle.y}`;
            const tiles = currentGrid[key];
            const roadTile = getGroundRoadTile(tiles, vehicle.zIndex);
            const conflict = roadTile
              ? hasConflictingTraffic(vehicle, key, nextVehicles, trafficState, currentGrid)
              : false;
            if (Date.now() < vehicle.trafficStopUntil || conflict) {
              if (vehicle.isMoving) {
                nextVehicles[uid] = { ...vehicle, isMoving: false };
                hasChanges = true;
              }
              continue;
            }
            const wasStopSign = vehicle.trafficStopReason === 'stop-sign';
            const cleared = { ...vehicle };
            delete cleared.trafficStopUntil;
            delete cleared.trafficStopReason;
            cleared.isMoving = true;
            if (wasStopSign && roadTile) {
              const sign = findStopSignForVehicle(
                key, vehicle.heading, vehicle.lane, roadTile, trafficState
              );
              if (sign?.kind === 'stop-sign') {
                cleared.satisfiedStopSignKey = `${key}:${sign.id}`;
              }
            }
            nextVehicles[uid] = cleared;
            hasChanges = true;
            continue;
          }

          if (!vehicle.isMoving && !vehicle.stepForward && !vehicle.stepBackward) {
            if (vehicle.trafficStopReason === 'stoplight' && vType !== 'train') {
              const tiles = currentGrid[`${vehicle.x},${vehicle.y}`];
              const roadTile = getGroundRoadTile(tiles, vehicle.zIndex);
              if (roadTile && !shouldStopForLight(vehicle, trafficState)) {
                const resumed = { ...vehicle, isMoving: true };
                delete resumed.trafficStopReason;
                nextVehicles[uid] = resumed;
                hasChanges = true;
              }
            } else if (vehicle.trafficStopReason === 'vehicle') {
              if (canResumeAfterVehicleStop(vehicle, nextVehicles, currentGrid)) {
                const resumed = { ...vehicle, isMoving: true };
                delete resumed.trafficStopReason;
                nextVehicles[uid] = resumed;
                hasChanges = true;
              }
            } else if (vehicle.trafficStopReason === 'stop-sign') {
              const tiles = currentGrid[`${vehicle.x},${vehicle.y}`];
              const roadTile = getGroundRoadTile(tiles, vehicle.zIndex);
              if (roadTile) {
                const signStop = shouldStopForSign(vehicle, roadTile, trafficState, nextVehicles, currentGrid);
                if (!signStop.stop) {
                  const resumed = { ...vehicle, isMoving: true };
                  delete resumed.trafficStopUntil;
                  delete resumed.trafficStopReason;
                  const sign = findStopSignForVehicle(
                    `${vehicle.x},${vehicle.y}`,
                    vehicle.heading,
                    vehicle.lane,
                    roadTile,
                    trafficState
                  );
                  if (sign?.kind === 'stop-sign') {
                    resumed.satisfiedStopSignKey = `${vehicle.x},${vehicle.y}:${sign.id}`;
                  }
                  nextVehicles[uid] = resumed;
                  hasChanges = true;
                }
              }
            }
            continue;
          }

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
          
          const onBuildingBay = isBuildingParkingBay(currentTile);
          const onHome = isHouseTile(currentTile);
          const isOwnerHome = onHome && vehicle.homeKey === currentTileKey;
          if (
            currentTile &&
            (currentTile.type.startsWith('parking-') ||
              onBuildingBay ||
              isOwnerHome ||
              (onHome && vehicle.parkOnNextLot))
          ) {
            const parkingLotId = currentTile.part === 'member' ? currentTile.anchorKey : currentTileKey;
            if (vehicle.lastParkingKey !== parkingLotId || vehicle.parkOnNextLot) {
              newParkingStopUntil = Date.now() + Math.floor(Math.random() * 4001) + 1000;
              newLastParkingKey = parkingLotId;
              newParkOnNextLot = false;
              if (onHome) {
                // Owner driveway (or explicit park-at-house): always 10s with timer badge
                newParkingStopUntil = Date.now() + HOME_PARK_MS;
                newStallIndex = 0;
                if (isOwnerHome) {
                  newParkOnNextLot = false;
                }
              } else if (onBuildingBay) {
                // One vehicle per bay (column); bay index = localX
                newStallIndex = getBuildingParkingBayIndex(currentTile);
                // Longer dwell so repairs/treatments can be started while parked
                const dwellBase = isHospitalAmbulanceBay(currentTile) ? 20000 : 15000;
                newParkingStopUntil = Date.now() + dwellBase + Math.floor(Math.random() * 10001);
              } else {
                let maxStalls = 2;
                if (currentTile.type === 'parking-4x4') {
                  const lx = currentTile.localX ?? 0;
                  if (lx >= 2) {
                    maxStalls = 4;
                  }
                }
                newStallIndex = Math.floor(Math.random() * maxStalls);
              }
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

          if (vType !== 'train' && currentTile && isRoadTile(currentTile.type)) {
            if (shouldStopForLight(vehicle, trafficState)) {
              nextVehicles[uid] = {
                ...vehicle,
                isMoving: false,
                trafficStopReason: 'stoplight',
              };
              hasChanges = true;
              continue;
            }
            const signStop = shouldStopForSign(vehicle, currentTile, trafficState, nextVehicles, currentGrid);
            if (signStop.stop) {
              nextVehicles[uid] = {
                ...vehicle,
                isMoving: false,
                trafficStopUntil: signStop.minUntil,
                trafficStopReason: 'stop-sign',
              };
              hasChanges = true;
              continue;
            }
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

          let newProgress = progress + step;
          if (step > 0 && (vehicle.isMoving || vehicle.stepForward)) {
            newProgress = findMaxSafeProgress(vehicle, newProgress, nextVehicles, currentGrid);
            if (vehicle.isMoving && newProgress <= progress + 1e-6) {
              nextVehicles[uid] = {
                ...vehicle,
                isMoving: false,
                trafficStopReason: 'vehicle',
                progress,
              };
              hasChanges = true;
              continue;
            }
          }

          progress = newProgress;

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
                  const leftPort = (entryPort + 1) % 4;
                  const rightPort = (entryPort + 3) % 4;

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
                const isBay = isBuildingParkingBay(t);
                const isHome = isHouseTile(t);
                if (vehicle.type === 'train') {
                  return t.type.startsWith('rail') || isCrossing || isBay;
                } else if (vehicle.type === 'semi') {
                  const isBigParking = t.type === 'parking-2x4' || t.type === 'parking-4x4';
                  return t.type.startsWith('road') || isBigParking || isCrossing || isBay;
                } else {
                  // Cars/service: roads, lots, bays, and houses (owner driveway)
                  return (
                    t.type.startsWith('road') ||
                    t.type.startsWith('parking-') ||
                    isCrossing ||
                    isBay ||
                    isHome
                  );
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

          nextVehicles[uid] = clearStopSignSatisfactionIfNeeded(vehicle, newVehicleState);
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

  // Sim leader broadcasts vehicle positions while they animate.
  useEffect(() => {
    if (!roomCode || !isSimLeader) return;
    const iv = setInterval(() => {
      const current = vehiclesRef.current;
      if (JSON.stringify(current) === JSON.stringify(lastSyncedVehicles.current)) return;
      lastSyncedVehicles.current = current;
      socket.emit('update-vehicles', { roomCode, vehicles: current });
    }, 150);
    return () => clearInterval(iv);
  }, [roomCode, isSimLeader]);

  // People life simulation (age, work, shop, care, commute)
  useEffect(() => {
    if (!roomCode || !isSimLeader) return;
    const iv = setInterval(() => {
      const eco = localEconomyRef.current;
      if (!eco || eco.peoplePaused) return;
      if (!eco.people || Object.keys(eco.people).length === 0) return;
      const { economy: nextEco, vehicles: nextVs } = tickPeopleSimulation(
        eco,
        vehiclesRef.current,
        gridRef.current,
        Date.now(),
      );
      setEconomy(nextEco);
      setVehicles(nextVs);
      if (roomCode) {
        socket.emit('update-economy', { roomCode, economy: nextEco });
        socket.emit('update-vehicles', { roomCode, vehicles: nextVs });
      }
    }, 2000);
    return () => clearInterval(iv);
  }, [roomCode, isSimLeader, setEconomy, setVehicles]);

  // Burning tree animation frame + removal after 30s
  useEffect(() => {
    const hasBurning = Object.values(gridRef.current).some(tiles =>
      tiles?.some(t => typeof t.burningUntil === 'number' && t.burningUntil > Date.now() - 1000)
    );
    if (!hasBurning) return;
    const iv = setInterval(() => {
      setBurnUiTick(t => t + 1);
      const now = Date.now();
      const currentGrid = gridRef.current;
      let changed = false;
      const newGrid: GridData = { ...currentGrid };
      Object.entries(currentGrid).forEach(([key, tiles]) => {
        if (!tiles?.length) return;
        let cellChanged = false;
        const nextTiles = tiles
          .map(tile => {
            if (typeof tile.burningUntil !== 'number') return tile;
            if (tile.burningUntil > now) return tile;
            // Burn finished — remove tree tile
            cellChanged = true;
            return null;
          })
          .filter((t): t is GridTile => t !== null);
        if (cellChanged) {
          if (nextTiles.length === 0) delete newGrid[key];
          else newGrid[key] = nextTiles;
          changed = true;
        }
      });
      if (changed) {
        setGrid(newGrid);
      }
    }, 100);
    return () => clearInterval(iv);
  }, [grid, setGrid]);

  // Economy simulation tick (simple rates + factory batches)
  useEffect(() => {
    if (!roomCode || !isSimLeader) return;
    const iv = setInterval(() => {
      const economy = localEconomyRef.current;
      if (!economy || economy.economyPaused) return;
      let changed = false;
      const nextB: Record<string, BuildingConfig> = { ...(economy.buildings || {}) };
      const completedRepairs: Array<{ vehicleId: string; recipeId: string }> = [];

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
          const staffed = isStaffedForProduction(cfg, ak, economy.people);
          if (staffed && hasRecipeInputs(cfg) && hasOutputCapacity(cfg)) {
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
        // Repair shop: advance in-progress repairs (parts already reserved at start)
        if (cfg.role === 'repair-shop' && (cfg.activeRepairs || []).length > 0) {
          const remaining: ActiveRepair[] = [];
          (cfg.activeRepairs || []).forEach(job => {
            const recipe = (cfg.repairRecipes || []).find(r => r.id === job.recipeId);
            const cycle = recipe?.cycleTimeSec || 15;
            const nextAccum = (job.processAccum || 0) + dt;
            if (nextAccum >= cycle) {
              completedRepairs.push({ vehicleId: job.vehicleId, recipeId: job.recipeId });
              changed = true;
            } else {
              remaining.push({ ...job, processAccum: nextAccum });
              if (nextAccum !== job.processAccum) changed = true;
            }
          });
          cfg.activeRepairs = remaining;
        }
        // Hospital: advance patient treatments (supplies reserved at admit)
        if (cfg.role === 'hospital' && (cfg.activePatients || []).length > 0) {
          const remaining: ActivePatient[] = [];
          let healed = 0;
          (cfg.activePatients || []).forEach(patient => {
            const illness = (cfg.illnessRecipes || []).find(r => r.id === patient.illnessId);
            const stay = illness?.stayDurationSec || 20;
            const nextAccum = (patient.processAccum || 0) + dt;
            if (nextAccum >= stay) {
              healed += 1;
              changed = true;
            } else {
              remaining.push({ ...patient, processAccum: nextAccum });
              if (nextAccum !== patient.processAccum) changed = true;
            }
          });
          if (healed > 0) {
            cfg.patientsHealed = (cfg.patientsHealed || 0) + healed;
          }
          cfg.activePatients = remaining;
        }
        nextB[ak] = cfg;
      });

      if (changed) {
        const nextEco = { ...economy, buildings: nextB };
        setEconomy(nextEco);
        if (roomCode) socket.emit('update-economy', { roomCode, economy: nextEco });
      }
      if (completedRepairs.length > 0) {
        setVehicles(prev => {
          const next = { ...prev };
          let vChanged = false;
          completedRepairs.forEach(({ vehicleId, recipeId }) => {
            const v = next[vehicleId];
            if (!v) return;
            next[vehicleId] = { ...v, lastRepairId: recipeId, lastRepairAt: Date.now() };
            vChanged = true;
          });
          if (vChanged && roomCode) {
            socket.emit('update-vehicles', { roomCode, vehicles: next });
          }
          return vChanged ? next : prev;
        });
      }
    }, 250);
    return () => clearInterval(iv);
  }, [roomCode, isSimLeader, setEconomy]);

  // Traffic light phase tick
  useEffect(() => {
    if (!roomCode || !isSimLeader) return;
    const iv = setInterval(() => {
      const current = localTrafficRef.current;
      let changed = false;
      const nextControls = { ...current.controls };
      const now = Date.now();
      for (const [id, ctrl] of Object.entries(nextControls)) {
        const advanced = advanceLightPhase(ctrl, now);
        if (advanced) {
          nextControls[id] = advanced;
          changed = true;
        }
      }
      if (changed) {
        const next = { ...current, controls: nextControls };
        setTraffic(next);
        localTrafficRef.current = next;
        socket.emit('update-traffic', { roomCode, traffic: next });
      }
    }, 250);
    return () => clearInterval(iv);
  }, [roomCode, isSimLeader]);

  // Plant growth tick
  useEffect(() => {
    if (!roomCode || !isSimLeader) return;
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
        if (tile.burningUntil && tile.burningUntil > Date.now()) return;

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
  }, [roomCode, isSimLeader, setGrid]);

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

  const loadFromLibrary = (data: LayoutSnapshot | GridData) => {
    setPendingLayout(normalizeLayoutSnapshot(data));
    setShowLoadConfirm(true);
  };

  /** Merge/restart layout buildings (and item defs) into economy and sync to room. */
  const applyLayoutBuildings = useCallback((
    buildings: Record<string, BuildingConfig>,
    mode: 'replace' | 'merge',
    itemDefs?: ItemDef[],
  ) => {
    if (Object.keys(buildings).length === 0 && mode === 'merge' && (!itemDefs || itemDefs.length === 0)) {
      return;
    }

    // Apply synchronously so inventory/productionEnabled are visible immediately
    // and not lost to a stale functional updater race with the economy tick.
    const prev = localEconomyRef.current;
    const nextBuildings: Record<string, BuildingConfig> =
      mode === 'replace'
        ? { ...buildings }
        : { ...prev.buildings, ...buildings };

    // Deep-clone each applied config so processAccum/inventory/production stay intact
    Object.keys(buildings).forEach(k => {
      nextBuildings[k] = cloneBuildingConfig(buildings[k], k);
    });

    let nextItemDefs = prev.itemDefs || [];
    if (itemDefs && itemDefs.length > 0) {
      const byId = new Map(nextItemDefs.map(d => [d.id, d]));
      itemDefs.forEach(d => {
        if (d?.id && !byId.has(d.id)) byId.set(d.id, d);
      });
      nextItemDefs = Array.from(byId.values());
    }

    const next = normalizeEconomy({
      ...prev,
      buildings: nextBuildings,
      itemDefs: nextItemDefs,
    });
    localEconomyRef.current = next;
    setEconomy(next);
    if (roomCode) {
      socket.emit('update-economy', { roomCode, economy: next });
    }
  }, [roomCode, setEconomy]);

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
    setClipboard(rotateLayoutSnapshot(clipboard));
  }, [clipboard]);

  const rotateSelection = useCallback(() => {
    if (!selectionStart || !selectionEnd) return;
    const x1 = Math.min(selectionStart.x, selectionEnd.x);
    const y1 = Math.min(selectionStart.y, selectionEnd.y);
    const x2 = Math.max(selectionStart.x, selectionEnd.x);
    const y2 = Math.max(selectionStart.y, selectionEnd.y);

    const snapshot = captureLayoutSnapshot(gridRef.current, getLiveEconomy(), { x1, y1, x2, y2 });
    if (Object.keys(snapshot.grid).length === 0) return;

    const newGrid = { ...grid };
    for (let x = x1; x <= x2; x++) {
      for (let y = y1; y <= y2; y++) {
        delete newGrid[`${x},${y}`];
      }
    }

    const rotated = rotateLayoutSnapshot(snapshot);
    const placed = materializeLayoutGrid(rotated, x1, y1);
    Object.assign(newGrid, placed);

    setGrid(newGrid);
    addToHistory(newGrid);

    // Move building configs to rotated anchor positions
    const oldBuildingKeys = Object.keys(snapshot.buildings).map(rel => {
      const p = parseCoordKey(rel)!;
      return coordKey(p.x + x1, p.y + y1);
    });
    const newBuildings = materializeLayoutBuildings(rotated, x1, y1);
    setEconomy(prev => {
      const nextBuildings = { ...prev.buildings };
      oldBuildingKeys.forEach(k => { delete nextBuildings[k]; });
      Object.assign(nextBuildings, newBuildings);
      const next = { ...prev, buildings: nextBuildings };
      if (roomCode) socket.emit('update-economy', { roomCode, economy: next });
      return next;
    });
    
    const width = x2 - x1;
    const height = y2 - y1;
    setSelectionEnd({ x: x1 + height, y: y1 + width });
  }, [grid, selectionStart, selectionEnd, roomCode, setEconomy, getLiveEconomy]);

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

    setClipboard(captureLayoutSnapshot(gridRef.current, getLiveEconomy(), { x1, y1, x2, y2 }));
    setSelectionStart(null);
    setSelectionEnd(null);
  }, [selectionStart, selectionEnd, getLiveEconomy]);

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

      // Vehicle controls (F/B step, L/R turn at intersections, arrows lane/speed)
      // R rotates the palette tile while a tile is selected for placement.
      const inTilePlacementMode = selectedTile !== null;
      if (selectedVehicles.size > 0) {
        const key = e.key.toLowerCase();
        const isArrowKey = e.key.startsWith('Arrow');
        const isVehicleControlKey =
          key === 'g' || key === 's' || key === 'f' || key === 'b' ||
          key === 'l' || (key === 'r' && !inTilePlacementMode) || isArrowKey;

        if (isVehicleControlKey) {
          if (isArrowKey) e.preventDefault();

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
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
              if ((newVehicle.type || 'car') === 'train') return;

              const currentTiles = gridRef.current[`${myVehicle.x},${myVehicle.y}`];
              const currentTile = currentTiles?.find(t => {
                const isBridge = t.type.includes('bridge') || t.type.includes('trestle');
                return (myVehicle.zIndex === 1 && isBridge) || (myVehicle.zIndex === 0 && !isBridge);
              });

              if (!currentTile?.type.startsWith('road')) return;

              const is4Lane = currentTile.type.includes('4lane');
              const nextLane = e.key === 'ArrowRight'
                ? shiftLaneRight(newVehicle.lane, is4Lane)
                : shiftLaneLeft(newVehicle.lane, is4Lane);
              if (nextLane !== null && nextLane !== newVehicle.lane) {
                newVehicle.lane = nextLane;
                updated = true;
              }
            } else if (key === 'l' || key === 'r') {
              if ((newVehicle.type || 'car') === 'train') return;

              const currentTiles = gridRef.current[`${myVehicle.x},${myVehicle.y}`];
              const currentTile = currentTiles?.find(t => {
                const isBridge = t.type.includes('bridge') || t.type.includes('trestle');
                return (myVehicle.zIndex === 1 && isBridge) || (myVehicle.zIndex === 0 && !isBridge);
              });

              if (!currentTile?.type.startsWith('road')) return;
              if (!isIntersectionTile(currentTile.type)) return;

              const intent = key === 'r' ? 'right' : 'left';
              if (newVehicle.turnIntent !== intent) {
                newVehicle.turnIntent = intent;
                updated = true;
              }
            }

            if (updated) {
              updatedVehicles[id] = newVehicle;
              anyUpdated = true;
            }
          });

          if (anyUpdated) setVehicles(updatedVehicles);
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
        setPendingHomeAssign(false);
        setPendingFireStart(false);
        setPendingEmployeeAssign(false);
        setPendingRouteVehicleId(null);
        setInspectHomeKey(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, copySelection, cutSelection, deleteSelection, clipboard, rotateClipboard, rotateSelection, isPasting, selectionStart, selectionEnd, selectedTile, selectedVehicles, vehicles, user]);

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

    if (e.button === 0) {
      pointerDownRef.current = { x: e.clientX, y: e.clientY };
      didDragPointerRef.current = false;
    }

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

    if (pointerDownRef.current) {
      const dx = e.clientX - pointerDownRef.current.x;
      const dy = e.clientY - pointerDownRef.current.y;
      if (dx * dx + dy * dy > 16) {
        didDragPointerRef.current = true;
      }
    }

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

    if (isWithinGridCanvas(worldX, worldY)) {
      setHoveredGridKey(`${worldX},${worldY}`);
    } else {
      setHoveredGridKey(null);
    }

    if (roomCodeRef.current) {
      scheduleCursorEmit(worldX, worldY, bufferedKeysRef.current.size > 0);
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setIsSelecting(false);
    pointerDownRef.current = null;
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
    const keys = Object.keys(clipboard.grid);
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
    if (isFromGridControl(e) || isPanning || isSelecting || didDragPointerRef.current) return;

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const worldX = (mouseX - offset.x) / zoom;
    const worldY = (mouseY - offset.y) / zoom;

    const gridX = Math.floor(worldX / GRID_SIZE);
    const gridY = Math.floor(worldY / GRID_SIZE);

    const key = `${gridX},${gridY}`;
    const localX = worldX - gridX * GRID_SIZE;
    const localY = worldY - gridY * GRID_SIZE;
    const relX = localX / GRID_SIZE;
    const relY = localY / GRID_SIZE;

    // Traffic control placement / interaction
    if (hasTile(gridX, gridY)) {
      const tiles = getTile(gridX, gridY)!;
      const roadTile = getTrafficRoadTile(tiles);
      if (roadTile && isRoadTile(roadTile.type) && !roadTile.type.startsWith('parking-')) {
        if (trafficTool === 'stop-sign' && canPlaceStopSignOnTile(roadTile.type)) {
          const exitPort = detectStopSignPlacementClick(relX, relY, roadTile);
          if (exitPort !== null) {
            const existing = findStopSignAt(key, exitPort, traffic);
            const nextControls = { ...traffic.controls };
            if (existing) {
              delete nextControls[trafficControlKey(existing)];
            } else {
              const newSign = createStopSign(key, exitPort, traffic.nextSignId);
              nextControls[trafficControlKey(newSign)] = newSign;
              emitTraffic({ ...traffic, controls: nextControls, nextSignId: traffic.nextSignId + 1 });
              return;
            }
            emitTraffic({ ...traffic, controls: nextControls });
          }
          return;
        }
        if (trafficTool === 'stoplight') {
          const slot = detectLightSlotClick(relX, relY, roadTile);
          if (slot) {
            const existing = getStoplightsAt(key, traffic).find(
              l => l.heading === slot.heading && Math.abs(l.lane - slot.lane) < 0.01
            );
            const nextControls = { ...traffic.controls };
            if (existing) {
              delete nextControls[String(existing.id)];
            } else {
              const slots = getAvailableLightSlots(roadTile);
              const occupied = getStoplightsAt(key, traffic).length;
              if (occupied < slots.length) {
                const newLight = createStoplight(key, slot.heading, slot.lane, traffic.nextLightId);
                nextControls[String(newLight.id)] = newLight;
                emitTraffic({ ...traffic, controls: nextControls, nextLightId: traffic.nextLightId + 1 });
                return;
              }
            }
            if (existing) emitTraffic({ ...traffic, controls: nextControls });
          }
          return;
        }
        if (!trafficTool && !selectedTile && selectedTrafficIds.size === 1) {
          const selKey = Array.from(selectedTrafficIds)[0];
          const sel = traffic.controls[selKey];
          if (sel) {
            if (sel.kind === 'stop-sign' && canPlaceStopSignOnTile(roadTile.type)) {
              const exitPort = detectStopSignPlacementClick(relX, relY, roadTile);
              if (exitPort !== null) {
                const conflict = findStopSignAt(key, exitPort, traffic);
                const samePlace = sel.gridKey === key && sel.edgePort === exitPort;
                if (!samePlace && !conflict) {
                  const nextControls = {
                    ...traffic.controls,
                    [selKey]: { ...sel, gridKey: key, edgePort: exitPort },
                  };
                  emitTraffic({ ...traffic, controls: nextControls });
                }
                return;
              }
            }
            if (sel.kind === 'stoplight') {
              const slot = detectLightSlotClick(relX, relY, roadTile);
              if (slot) {
                const conflict = getStoplightsAt(key, traffic).find(
                  l => l.id !== sel.id && l.heading === slot.heading && Math.abs(l.lane - slot.lane) < 0.01
                );
                const samePlace = sel.gridKey === key && sel.heading === slot.heading && Math.abs(sel.lane - slot.lane) < 0.01;
                if (!conflict && !samePlace) {
                  const nextControls = {
                    ...traffic.controls,
                    [selKey]: { ...sel, gridKey: key, heading: slot.heading, lane: slot.lane },
                  };
                  emitTraffic({ ...traffic, controls: nextControls });
                }
                return;
              }
            }
          }
        }
        if (!trafficTool && !selectedTile && selectedTrafficIds.size === 0) {
          const slot = detectLightSlotClick(relX, relY, roadTile);
          if (slot) {
            const light = getStoplightsAt(key, traffic).find(
              l => l.heading === slot.heading && Math.abs(l.lane - slot.lane) < 0.01
            );
            if (light && light.kind === 'stoplight') {
              const nextPhase = cycleLightPhase(light.phase);
              const nextControls = {
                ...traffic.controls,
                [String(light.id)]: { ...light, phase: nextPhase, phaseStartedAt: Date.now() },
              };
              emitTraffic({ ...traffic, controls: nextControls });
              return;
            }
          }
        }
      }
    }

    // Start fire on a tree tile
    if (pendingFireStart && hasTile(gridX, gridY)) {
      const tiles = getTile(gridX, gridY) || [];
      const treeIdx = tiles.findIndex(t => isTreeTileType(t.type) && !t.burningUntil);
      if (treeIdx >= 0) {
        const now = Date.now();
        const newTiles = [...tiles];
        newTiles[treeIdx] = {
          ...newTiles[treeIdx],
          burningUntil: now + TREE_FIRE_DURATION_MS,
        };
        const newGrid = { ...grid, [key]: newTiles };
        setGrid(newGrid);
        addToHistory(newGrid);
        // Stay in fire mode so user can light multiple trees; Escape cancels
        return;
      }
      // Non-tree click while in fire mode — keep mode active
      return;
    }

    // Assign selected people as employees of a building
    if (pendingEmployeeAssign && selectedPersonIds.size > 0 && hasTile(gridX, gridY)) {
      const tiles = getTile(gridX, gridY) || [];
      const building = tiles.find(t => t.type.startsWith('building-'));
      if (building) {
        const workplaceKey =
          building.part === 'member' ? (building.anchorKey || key) : key;
        // Ensure building config exists for economy buildings
        let nextEco = economy;
        if (isEconomyBuilding(building.type) && !economy.buildings[workplaceKey]) {
          const initCfg = createBuildingConfig(workplaceKey, building.type);
          nextEco = {
            ...economy,
            buildings: { ...economy.buildings, [workplaceKey]: initCfg },
          };
        }
        const people = assignPeopleWorkplace(
          nextEco.people || {},
          selectedPersonIds,
          workplaceKey,
        );
        nextEco = { ...nextEco, people };
        setEconomy(nextEco);
        if (roomCode) socket.emit('update-economy', { roomCode, economy: nextEco });
        setPendingEmployeeAssign(false);
        setShowPeoplePanel(true);
        return;
      }
      // Non-building click while assigning — keep mode active
      return;
    }

    // Assign selected cars to a house as their owner home
    if (pendingHomeAssign && selectedVehicles.size > 0 && hasTile(gridX, gridY)) {
      const tiles = getTile(gridX, gridY) || [];
      const house = tiles.find(t => t.type === 'building-home');
      if (house) {
        const homeKey = `${gridX},${gridY}`;
        const updatedVehicles = { ...vehicles };
        let anyAssigned = false;
        selectedVehicles.forEach(id => {
          const v = updatedVehicles[id];
          if (!v) return;
          const vType = v.type || 'car';
          // Homes are for cars (and service vehicles); not trains/semis
          if (vType === 'train' || vType === 'semi') return;
          updatedVehicles[id] = {
            ...v,
            homeKey,
            nextHomeReturnAt: Date.now() + randomHomeTourDelayMs(),
          };
          anyAssigned = true;
        });
        if (anyAssigned) {
          setVehicles(updatedVehicles);
          if (roomCode) {
            socket.emit('update-vehicles', { roomCode, vehicles: updatedVehicles });
          }
        }
        setPendingHomeAssign(false);
        return;
      }
      // Clicked non-house while assigning — ignore (keep mode active)
      return;
    }

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
      const baseX = gridX - pasteOffset.x;
      const baseY = gridY - pasteOffset.y;
      const placed = materializeLayoutGrid(clipboard, baseX, baseY);
      const newGrid = { ...grid, ...placed };
      setGrid(newGrid);
      addToHistory(newGrid);

      // Restart buildings from layout with saved settings/inventory/state
      const placedBuildings = materializeLayoutBuildings(clipboard, baseX, baseY);
      applyLayoutBuildings(placedBuildings, 'merge', clipboard.itemDefs);

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

      // Click house → open people / family details
      if (!selectedTile && hasTile(gridX, gridY)) {
        const tilesHere = getTile(gridX, gridY)!;
        const top = tilesHere[tilesHere.length - 1];
        if (top.type === 'building-home') {
          setInspectHomeKey(key);
          setInspectBuildingKey(null);
          return;
        }
        // Click economy building (no palette selected) → open inspector
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
            setInspectHomeKey(null);
            setShowLogistics(true);
            return;
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
          topTile.type === 'building-factory-large' || topTile.type === 'building-train-station-large' ||
          topTile.type === 'building-repair-shop' || topTile.type === 'building-hospital';
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
        selectedTile === 'building-factory-large' || selectedTile === 'building-train-station-large' ||
        selectedTile === 'building-repair-shop' || selectedTile === 'building-hospital';
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
            let nextEco = { ...economy, buildings: { ...economy.buildings, [ak]: initCfg } };
            // Seed common item defs when placing specialized economy buildings
            if (selectedTile === 'building-repair-shop' || selectedTile === 'building-hospital') {
              const existing = new Set((nextEco.itemDefs || []).map(d => d.id));
              const seedDefs: ItemDef[] = (
                selectedTile === 'building-repair-shop'
                  ? [
                      { id: 'motor-oil', name: 'Motor Oil', emoji: '🛢️' },
                      { id: 'oil-filter', name: 'Oil Filter', emoji: '🔧' },
                      { id: 'tire', name: 'Tire', emoji: '🛞' },
                      { id: 'brake-pads', name: 'Brake Pads', emoji: '🛑' },
                      { id: 'brake-fluid', name: 'Brake Fluid', emoji: '🧴' },
                      { id: 'battery', name: 'Battery', emoji: '🔋' },
                      { id: 'engine-parts', name: 'Engine Parts', emoji: '⚙️' },
                      { id: 'body-panels', name: 'Body Panels', emoji: '🪟' },
                      { id: 'paint', name: 'Paint', emoji: '🎨' },
                      { id: 'tow-supplies', name: 'Tow Supplies', emoji: '🪝' },
                    ]
                  : [
                      { id: 'medicine', name: 'Medicine', emoji: '💊' },
                      { id: 'bandages', name: 'Bandages', emoji: '🩹' },
                      { id: 'painkillers', name: 'Painkillers', emoji: '💉' },
                      { id: 'blood-bags', name: 'Blood Bags', emoji: '🩸' },
                      { id: 'iv-fluids', name: 'IV Fluids', emoji: '💧' },
                      { id: 'antibiotics', name: 'Antibiotics', emoji: '🧴' },
                      { id: 'defibrillator-pads', name: 'Defibrillator Pads', emoji: '⚡' },
                      { id: 'epinephrine', name: 'Epinephrine', emoji: '🧪' },
                      { id: 'medical-supplies', name: 'Medical Supplies', emoji: '🏥' },
                    ]
              ).filter(d => !existing.has(d.id));
              if (seedDefs.length) {
                nextEco = { ...nextEco, itemDefs: [...(nextEco.itemDefs || []), ...seedDefs] };
              }
            }
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

      setIsPlacingVehicles(false);
      setPendingRouteVehicleId(null);
      setGrid(newGrid);
      addToHistory(newGrid);
    }
  };

  const clearGrid = () => {
    setGrid({});
    addToHistory({});
  };

  const exportGrid = () => {
    const snapshot = captureLayoutSnapshot(gridRef.current, getLiveEconomy(), null);
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(snapshot));
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
        setClipboard(normalizeLayoutSnapshot(data));
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
  const serviceFilteredSelection = filterSelectionByPanelType(selectedVehicles, vehicles, 'service');

  const carsList = (Object.values(vehicles) as Vehicle[]).filter(v => vehicleMatchesPanelType(v, 'car'));
  const semisList = (Object.values(vehicles) as Vehicle[]).filter(v => vehicleMatchesPanelType(v, 'semi'));
  const trainsList = (Object.values(vehicles) as Vehicle[]).filter(v => vehicleMatchesPanelType(v, 'train'));
  const serviceList = (Object.values(vehicles) as Vehicle[]).filter(v => vehicleMatchesPanelType(v, 'service'));
  const parkedTrailersList = Object.values(economy.parkedTrailers || {});

  const closeOtherVehiclePanels = () => {
    setShowCarsPanel(false);
    setShowSemiTrailerPanel(false);
    setShowTrainPanel(false);
    setShowServicePanel(false);
    setShowTrafficPanel(false);
    setShowPeoplePanel(false);
  };

  const toggleCarsPanel = () => {
    const next = !showCarsPanel;
    closeOtherVehiclePanels();
    setShowCarsPanel(next);
  };
  const toggleSemiTrailerPanel = () => {
    const next = !showSemiTrailerPanel;
    closeOtherVehiclePanels();
    setShowSemiTrailerPanel(next);
  };
  const toggleTrainPanel = () => {
    const next = !showTrainPanel;
    closeOtherVehiclePanels();
    setShowTrainPanel(next);
  };
  const toggleServicePanel = () => {
    const next = !showServicePanel;
    closeOtherVehiclePanels();
    setShowServicePanel(next);
  };

  const toggleTrafficPanel = () => {
    const next = !showTrafficPanel;
    closeOtherVehiclePanels();
    setShowTrafficPanel(next);
  };

  const togglePeoplePanel = () => {
    const next = !showPeoplePanel;
    closeOtherVehiclePanels();
    setShowPeoplePanel(next);
  };

  const peopleList = Object.values(economy.people || {}).sort((a, b) =>
    personDisplayName(a).localeCompare(personDisplayName(b)),
  );
  const filteredPeople = peopleList.filter(p => {
    if (!peopleFilter.trim()) return true;
    const q = peopleFilter.toLowerCase();
    return (
      personDisplayName(p).toLowerCase().includes(q) ||
      p.homeKey.includes(q) ||
      (p.workplaceKey || '').includes(q) ||
      (p.activity || '').includes(q)
    );
  });

  const populatePeople = () => {
    const next = populateHomes(gridRef.current, economy, Date.now());
    setEconomy(next);
    if (roomCode) socket.emit('update-economy', { roomCode, economy: next });
  };

  const openCreatePersonForm = () => {
    const homes = listHomeKeys(gridRef.current);
    setPeopleForm({
      firstName: randomFirstName('m'),
      lastName: randomLastName(),
      sex: 'm',
      ageYears: 30,
      homeKey: homes[0] || '',
      workplaceKey: '',
      money: 50,
      health: 'healthy',
    });
    setPeopleFormMode('create');
  };

  const openEditPersonForm = (personId?: string) => {
    const id = personId || Array.from(selectedPersonIds)[0];
    const p = id ? economy.people?.[id] : undefined;
    if (!p) return;
    setSelectedPersonIds(new Set([p.id]));
    setPeopleForm({
      firstName: p.firstName,
      lastName: p.lastName,
      sex: p.sex,
      ageYears: Math.floor(p.ageYears),
      homeKey: p.homeKey,
      workplaceKey: p.workplaceKey || '',
      money: p.money ?? 0,
      health: p.health,
    });
    setPeopleFormMode('edit');
  };

  const savePersonForm = () => {
    if (!peopleForm.homeKey.trim()) return;
    const now = Date.now();
    const people = { ...(economy.people || {}) };
    const families = { ...(economy.families || {}) };

    if (peopleFormMode === 'create') {
      const person = createPerson({
        firstName: peopleForm.firstName,
        lastName: peopleForm.lastName,
        sex: peopleForm.sex,
        ageYears: peopleForm.ageYears,
        homeKey: peopleForm.homeKey.trim(),
        workplaceKey: peopleForm.workplaceKey.trim() || undefined,
        money: peopleForm.money,
        health: peopleForm.health,
        now,
      });
      // Attach to existing family at home if one shares last name, else new family
      const existingFam = Object.values(families).find(
        f => f.homeKey === person.homeKey && f.lastName === person.lastName,
      );
      if (existingFam) {
        person.familyId = existingFam.id;
        families[existingFam.id] = {
          ...existingFam,
          memberIds: [...existingFam.memberIds, person.id],
        };
      } else {
        families[person.familyId] = {
          id: person.familyId,
          lastName: person.lastName,
          homeKey: person.homeKey,
          memberIds: [person.id],
        };
      }
      people[person.id] = person;
      setSelectedPersonIds(new Set([person.id]));
    } else if (peopleFormMode === 'edit') {
      const id = Array.from(selectedPersonIds)[0];
      const prev = id ? people[id] : undefined;
      if (!prev) return;
      people[id] = {
        ...prev,
        firstName: peopleForm.firstName.trim() || prev.firstName,
        lastName: peopleForm.lastName.trim() || prev.lastName,
        sex: peopleForm.sex,
        ageYears: Math.max(0, Math.min(100, peopleForm.ageYears)),
        ageUpdatedAt: now,
        homeKey: peopleForm.homeKey.trim() || prev.homeKey,
        workplaceKey: peopleForm.workplaceKey.trim() || undefined,
        money: peopleForm.money,
        health: peopleForm.health,
        location:
          prev.location.kind === 'home'
            ? { kind: 'home', homeKey: peopleForm.homeKey.trim() || prev.homeKey }
            : prev.location,
      };
    }

    const nextEco = { ...economy, people, families };
    setEconomy(nextEco);
    if (roomCode) socket.emit('update-economy', { roomCode, economy: nextEco });
    setPeopleFormMode('closed');
  };

  const deleteSelectedPeople = () => {
    if (selectedPersonIds.size === 0) return;
    const people = { ...(economy.people || {}) };
    const families = { ...(economy.families || {}) };
    for (const id of selectedPersonIds) {
      const p = people[id];
      if (!p) continue;
      delete people[id];
      const fam = families[p.familyId];
      if (fam) {
        const memberIds = fam.memberIds.filter(mid => mid !== id);
        if (memberIds.length === 0) delete families[p.familyId];
        else families[p.familyId] = { ...fam, memberIds };
      }
    }
    // Clear vehicle occupancy for removed people
    let nextVehicles = { ...vehicles };
    Object.keys(nextVehicles).forEach(vid => {
      nextVehicles[vid] = syncVehicleOccupancy(nextVehicles[vid], people);
    });
    const nextEco = { ...economy, people, families };
    setEconomy(nextEco);
    setVehicles(nextVehicles);
    setSelectedPersonIds(new Set());
    setPeopleFormMode('closed');
    if (roomCode) {
      socket.emit('update-economy', { roomCode, economy: nextEco });
      socket.emit('update-vehicles', { roomCode, vehicles: nextVehicles });
    }
  };

  const clearSelectedWorkplaces = () => {
    if (selectedPersonIds.size === 0) return;
    const people = assignPeopleWorkplace(economy.people || {}, selectedPersonIds, undefined);
    const nextEco = { ...economy, people };
    setEconomy(nextEco);
    if (roomCode) socket.emit('update-economy', { roomCode, economy: nextEco });
  };

  const startAssignEmployees = () => {
    if (selectedPersonIds.size === 0) return;
    setPendingHomeAssign(false);
    setPendingFireStart(false);
    setPendingRouteVehicleId(null);
    setPendingEmployeeAssign(true);
  };

  const boardSelectedPeople = (seat: 'driver' | 'passenger') => {
    if (selectedPersonIds.size === 0 || selectedVehicles.size === 0) return;
    const vehicleId = Array.from(selectedVehicles)[0];
    const v = vehicles[vehicleId];
    if (!v) return;
    let people = { ...(economy.people || {}) };
    for (const pid of selectedPersonIds) {
      const person = people[pid];
      if (!person) continue;
      if (seat === 'driver') {
        if (canBoardAsDriver(person, v, people)) continue;
      } else {
        if (canBoardAsPassenger(person, v, people)) continue;
      }
      people = boardPerson(people, pid, vehicleId, seat);
    }
    let nextVehicles = { ...vehicles };
    nextVehicles[vehicleId] = syncVehicleOccupancy(v, people);
    const nextEco = { ...economy, people };
    setEconomy(nextEco);
    setVehicles(nextVehicles);
    if (roomCode) {
      socket.emit('update-economy', { roomCode, economy: nextEco });
      socket.emit('update-vehicles', { roomCode, vehicles: nextVehicles });
    }
  };

  const alightSelectedPeople = (dest: 'home' | 'here') => {
    if (selectedPersonIds.size === 0) return;
    let people = { ...(economy.people || {}) };
    const now = Date.now();
    for (const pid of selectedPersonIds) {
      const person = people[pid];
      if (!person) continue;
      if (dest === 'home') {
        people = alightPerson(people, pid, { kind: 'home', homeKey: person.homeKey }, 'home', now + 15_000);
      } else if (person.location.kind === 'vehicle') {
        const v = vehicles[person.location.vehicleId];
        if (v) {
          // Prefer building under vehicle, else tile
          const key = `${v.x},${v.y}`;
          const tiles = gridRef.current[key];
          const bld = tiles?.find(t => t.type.startsWith('building-'));
          if (bld) {
            const bkey = bld.part === 'member' ? bld.anchorKey || key : key;
            people = alightPerson(people, pid, { kind: 'building', buildingKey: bkey }, 'idle', now + 10_000);
          } else {
            people = alightPerson(people, pid, { kind: 'tile', x: v.x, y: v.y }, 'idle', now + 10_000);
          }
        }
      }
    }
    let nextVehicles = { ...vehicles };
    Object.keys(nextVehicles).forEach(vid => {
      nextVehicles[vid] = syncVehicleOccupancy(nextVehicles[vid], people);
    });
    const nextEco = { ...economy, people };
    setEconomy(nextEco);
    setVehicles(nextVehicles);
    if (roomCode) {
      socket.emit('update-economy', { roomCode, economy: nextEco });
      socket.emit('update-vehicles', { roomCode, vehicles: nextVehicles });
    }
  };

  const sendSelectedPeopleHome = () => {
    if (selectedPersonIds.size === 0) return;
    let people = { ...(economy.people || {}) };
    const now = Date.now();
    for (const pid of selectedPersonIds) {
      const person = people[pid];
      if (!person) continue;
      people = alightPerson(people, pid, { kind: 'home', homeKey: person.homeKey }, 'home', now + 20_000);
    }
    let nextVehicles = { ...vehicles };
    Object.keys(nextVehicles).forEach(vid => {
      nextVehicles[vid] = syncVehicleOccupancy(nextVehicles[vid], people);
    });
    const nextEco = { ...economy, people };
    setEconomy(nextEco);
    setVehicles(nextVehicles);
    if (roomCode) {
      socket.emit('update-economy', { roomCode, economy: nextEco });
      socket.emit('update-vehicles', { roomCode, vehicles: nextVehicles });
    }
  };

  const enterSelectedBuildingWithPeople = () => {
    // Use selected vehicle position building, or inspect building
    if (selectedPersonIds.size === 0) return;
    let buildingKey = inspectBuildingKey;
    if (!buildingKey && selectedVehicles.size > 0) {
      const v = vehicles[Array.from(selectedVehicles)[0]];
      if (v) {
        const key = `${v.x},${v.y}`;
        const tiles = gridRef.current[key];
        const bld = tiles?.find(t => t.type.startsWith('building-'));
        if (bld) buildingKey = bld.part === 'member' ? bld.anchorKey || key : key;
      }
    }
    if (!buildingKey) return;
    let people = { ...(economy.people || {}) };
    const now = Date.now();
    for (const pid of selectedPersonIds) {
      people = alightPerson(people, pid, { kind: 'building', buildingKey }, 'idle', now + 20_000);
    }
    let nextVehicles = { ...vehicles };
    Object.keys(nextVehicles).forEach(vid => {
      nextVehicles[vid] = syncVehicleOccupancy(nextVehicles[vid], people);
    });
    const nextEco = { ...economy, people };
    setEconomy(nextEco);
    setVehicles(nextVehicles);
    if (roomCode) {
      socket.emit('update-economy', { roomCode, economy: nextEco });
      socket.emit('update-vehicles', { roomCode, vehicles: nextVehicles });
    }
  };

  const renderVehicleListItem = (v: Vehicle) => {
    const cargoTotals = getVehicleCargoTotals(v);
    const peopleMap = economy.people || {};
    const driverId = v.driverId || getDriverId(peopleMap, v.id);
    const passengers = v.passengerIds || getPassengerIds(peopleMap, v.id);
    const maxPax = v.maxPassengers ?? getMaxPassengers(v.type);
    const driver = driverId ? peopleMap[driverId] : null;
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
            {v.homeKey && (
              <span className="text-[9px] text-rose-500 shrink-0" title={`Home ${v.homeKey}`}>🏠{v.homeKey}</span>
            )}
          </div>
          {Object.keys(peopleMap).length > 0 && (
            <div className="text-[9px] text-slate-400 pl-5 truncate">
              🚗 {driver ? personDisplayName(driver) : 'No driver'}
              {' · '}
              👥 {passengers.length}/{maxPax}
            </div>
          )}
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
                onClick={() => selectPaletteTile(tile.type)}
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
            <button onClick={() => { setSelectedTile(null); setIsPasting(false); setIsPlacingVehicles(false); setPendingRouteVehicleId(null); }} className={`flex items-center justify-center gap-2 py-2 px-3 border rounded-lg text-xs font-medium transition-colors ${!selectedTile && !isPasting ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'}`}>
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
        className={`flex-1 relative overflow-hidden cursor-${isPanning ? 'grabbing' : pendingRouteVehicleId || pendingHomeAssign || pendingFireStart || pendingEmployeeAssign || trafficTool ? 'crosshair' : selectedTile ? 'crosshair' : 'grab'}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleGridClick}
      >
        {!showSidebar && (
          <button
            type="button"
            className="absolute top-4 left-4 z-[60] p-3 bg-white rounded-xl shadow-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            title="Show tile palette"
            data-grid-control
            {...blockGridPointerEvents}
            onClick={(e) => {
              stopGridPropagation(e);
              setShowSidebar(true);
            }}
          >
            <PanelLeftOpen className="w-5 h-5" />
          </button>
        )}
        {pendingRouteVehicleId && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 pointer-events-none bg-red-600 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg">
            Click a road tile to set destination
          </div>
        )}
        {pendingHomeAssign && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 pointer-events-none bg-rose-600 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg">
            Click a Home tile to assign as owner house
          </div>
        )}
        {pendingFireStart && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 pointer-events-none bg-orange-600 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg">
            Click a tree to start a fire (burns 30s)
          </div>
        )}
        {pendingEmployeeAssign && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 pointer-events-none bg-violet-600 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg">
            Click a building to assign {selectedPersonIds.size} employee{selectedPersonIds.size === 1 ? '' : 's'} (Esc to cancel)
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
          {roomCode && remoteCursors.length > 0 && (
            <RemoteCursors cursors={remoteCursors} gridSize={GRID_SIZE} />
          )}
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
                      burningUntil={tile.burningUntil}
                      burnNow={(() => { void burnUiTick; return Date.now(); })()}
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
                {(() => {
                  const roadTile = getTrafficRoadTile(tiles);
                  if (!roadTile) return null;
                  const cellControls = getAllTrafficControls(traffic).filter(c => c.gridKey === key);
                  if (!cellControls.length) return null;
                  return (
                    <TrafficOverlay
                      gridKey={key}
                      tileRotation={roadTile.rotation}
                      controls={cellControls}
                      showIds={hoveredGridKey === key}
                      stopSignScale={traffic.stopSignSizeScale}
                      stoplightScale={traffic.stoplightSizeScale}
                      selectedIds={selectedTrafficIds}
                      onSignClick={!trafficTool ? (ctrl) => {
                        if (ctrl.kind !== 'stop-sign') return;
                        setSelectedTrafficIds(new Set([trafficControlKey(ctrl)]));
                        setShowTrafficPanel(true);
                      } : undefined}
                      onLightClick={!trafficTool ? (ctrl) => {
                        if (ctrl.kind !== 'stoplight') return;
                        const nextControls = {
                          ...traffic.controls,
                          [String(ctrl.id)]: {
                            ...ctrl,
                            phase: cycleLightPhase(ctrl.phase),
                            phaseStartedAt: Date.now(),
                          },
                        };
                        emitTraffic({ ...traffic, controls: nextControls });
                      } : undefined}
                    />
                  );
                })()}
              </div>
            );
          })}

          {/* Home occupancy badges */}
          {Object.entries(grid).map(([homeKey, homeTiles]) => {
            if (!homeTiles?.length) return null;
            const top = homeTiles[homeTiles.length - 1];
            if (top.type !== 'building-home') return null;
            const residents = peopleResidingAt(economy.people, homeKey);
            const atHome = peopleAtHome(economy.people || {}, homeKey);
            if (residents.length === 0 && atHome.length === 0) return null;
            const [hx, hy] = homeKey.split(',').map(Number);
            return (
              <div
                key={`home-badge-${homeKey}`}
                className="absolute"
                style={{ left: hx * GRID_SIZE, top: hy * GRID_SIZE }}
              >
                <HomeOccupancyBadge
                  atHomeCount={atHome.length}
                  residentCount={residents.length}
                />
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
                  cycleRemaining={getCycleRemainingForBuilding(cfg, anchorKey)}
                  economyPaused={economy.economyPaused}
                  canControlProduction={!!roomCode}
                  staffCount={countEmployeesAtBuilding(economy.people, anchorKey)}
                  requiredStaff={isProcessBuilding(cfg) ? getRequiredEmployees(cfg) : 0}
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
                    const leftPort = (entryPort + 1) % 4;
                    const rightPort = (entryPort + 3) % 4;

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
              {(Object.entries(clipboard.grid) as [string, GridTile[]][]).map(([relKey, tiles]) => {
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
            {(Object.entries(clipboard.grid) as [string, GridTile[]][]).map(([relKey, tiles]) => {
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

        {/* Floating Controls — two-column button grid */}
        <div 
          className="absolute bottom-8 right-8 flex flex-col gap-2"
          data-grid-control
          {...blockGridPointerEvents}
        >
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-2 grid grid-cols-2 gap-1">
            <button 
              onClick={() => setShowGridLines(!showGridLines)}
              className={`p-3 rounded-xl transition-colors ${showGridLines ? 'text-blue-600 bg-blue-50' : 'text-slate-400 hover:bg-slate-50'}`}
              title="Toggle Grid Lines"
            >
              <Grid className="w-5 h-5 mx-auto" />
            </button>
            <button 
              onClick={() => {
                pulseOverview();
                setZoom(INITIAL_ZOOM);
                setOffset(clampOffset({ x: 0, y: 0 }, INITIAL_ZOOM));
              }}
              className="p-3 hover:bg-slate-50 rounded-xl transition-colors text-slate-600"
              title="Reset View"
            >
              <Hand className="w-5 h-5 mx-auto" />
            </button>
            <button 
              onClick={() => { pulseOverview(); setZoom(z => Math.min(MAX_ZOOM, z * 1.2)); }}
              className="p-3 hover:bg-slate-50 rounded-xl transition-colors text-slate-600"
              title="Zoom In"
            >
              <ZoomIn className="w-5 h-5 mx-auto" />
            </button>
            <button 
              onClick={() => { pulseOverview(); setZoom(z => Math.max(MIN_ZOOM, z / 1.2)); }}
              className="p-3 hover:bg-slate-50 rounded-xl transition-colors text-slate-600"
              title="Zoom Out"
            >
              <ZoomOut className="w-5 h-5 mx-auto" />
            </button>
            <button
              onClick={toggleCarsPanel}
              className={`p-3 rounded-xl transition-colors ${showCarsPanel ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400 hover:bg-slate-50'}`}
              title="Cars"
            >
              <Car className="w-5 h-5 mx-auto" />
            </button>
            <button
              onClick={toggleSemiTrailerPanel}
              className={`p-3 rounded-xl transition-colors ${showSemiTrailerPanel ? 'text-amber-600 bg-amber-50' : 'text-slate-400 hover:bg-slate-50'}`}
              title="Semis & Trailers"
            >
              <Truck className="w-5 h-5 mx-auto" />
            </button>
            <button
              onClick={toggleTrainPanel}
              className={`p-3 rounded-xl transition-colors ${showTrainPanel ? 'text-emerald-600 bg-emerald-50' : 'text-slate-400 hover:bg-slate-50'}`}
              title="Trains & Railcars"
            >
              <Train className="w-5 h-5 mx-auto" />
            </button>
            <button
              onClick={toggleServicePanel}
              className={`p-3 rounded-xl transition-colors ${showServicePanel ? 'text-orange-600 bg-orange-50' : 'text-slate-400 hover:bg-slate-50'}`}
              title="Service Vehicles"
            >
              <Siren className="w-5 h-5 mx-auto" />
            </button>
            <button
              onClick={togglePeoplePanel}
              className={`p-3 rounded-xl transition-colors ${showPeoplePanel ? 'text-violet-600 bg-violet-50' : 'text-slate-400 hover:bg-slate-50'}`}
              title="People & Families"
            >
              <Users className="w-5 h-5 mx-auto" />
            </button>
            <button
              onClick={toggleTrafficPanel}
              className={`p-3 rounded-xl transition-colors ${showTrafficPanel ? 'text-red-600 bg-red-50' : 'text-slate-400 hover:bg-slate-50'}`}
              title="Traffic Control"
            >
              <Timer className="w-5 h-5 mx-auto" />
            </button>
            <button 
              onClick={() => setShowLogistics(!showLogistics)}
              className={`p-3 rounded-xl transition-colors ${showLogistics ? 'text-emerald-600 bg-emerald-50' : 'text-slate-400 hover:bg-slate-50'}`}
              title="Logistics & Economy"
            >
              <Database className="w-5 h-5 mx-auto" />
            </button>
            <button 
              onClick={() => setShowPlantGrowth(!showPlantGrowth)}
              className={`p-3 rounded-xl transition-colors ${showPlantGrowth ? 'text-lime-600 bg-lime-50' : 'text-slate-400 hover:bg-slate-50'}`}
              title="Plant Growth"
            >
              <Sprout className="w-5 h-5 mx-auto" />
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
                  <p className="text-[10px] text-slate-500 mb-1">
                    Items used by buildings (recipes, inventory, consumption) are added here automatically.
                    Deleting an item removes it from every building that references it.
                  </p>
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
                            title="Delete item from Logistics and remove from all buildings"
                            onClick={() => {
                              const next = removeItemFromEconomy(economy, def.id);
                              setEconomy(next);
                              // Also clear vehicle trailer/railcar cargo of this item
                              const nextVehicles = stripItemFromVehicles(vehicles, def.id);
                              if (nextVehicles !== vehicles) {
                                setVehicles(nextVehicles);
                                if (roomCode) {
                                  socket.emit('update-vehicles', { roomCode, vehicles: nextVehicles });
                                }
                              }
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
                        const cycleRemaining = getCycleRemainingForBuilding(bcfg, bkey);
                        const staff = countEmployeesAtBuilding(economy.people, bkey);
                        const need = isProcessBuilding(bcfg) ? getRequiredEmployees(bcfg) : 0;
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
                                {need > 0 ? ` • 👷${staff}/${need}` : ''}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {cycleRemaining !== null && staff >= need && <CycleCountdownBadge remaining={cycleRemaining} />}
                              {need > 0 && staff < need && (
                                <span className="text-[9px] font-bold text-rose-600">Need staff</span>
                              )}
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
                            <span>
                              Cycle: {bcfg.cycleTimeSec || 30}s
                              {' · '}👷{countEmployeesAtBuilding(economy.people, bkey)}/{getRequiredEmployees(bcfg)}
                            </span>
                            {(() => {
                              const remaining = getCycleRemainingForBuilding(bcfg, bkey);
                              const staffed = isStaffedForProduction(bcfg, bkey, economy.people);
                              if (!staffed) return <span className="text-rose-600 font-bold">Need staff</span>;
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

        {/* Traffic Control Panel */}
        <AnimatePresence>
          {showTrafficPanel && (
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
                  <div className="p-2 bg-red-50 text-red-600 rounded-xl">
                    <Timer className="w-5 h-5" />
                  </div>
                  <h2 className="font-bold text-slate-800">Traffic Control</h2>
                </div>
                <button onClick={() => { setShowTrafficPanel(false); setTrafficTool(null); }} className="p-2 hover:bg-slate-50 text-slate-400 rounded-xl transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4">
                <TrafficPanel
                  traffic={traffic}
                  selectedIds={selectedTrafficIds}
                  trafficTool={trafficTool}
                  roomCode={roomCode}
                  onSelectIds={setSelectedTrafficIds}
                  onSetTool={setTrafficTool}
                  onUpdateTraffic={emitTraffic}
                  onDeleteByKind={(kind) => {
                    const nextControls = { ...traffic.controls };
                    const nextSelected = new Set(selectedTrafficIds);
                    Object.values(traffic.controls).forEach(c => {
                      if (c.kind === kind && selectedTrafficIds.has(trafficControlKey(c))) {
                        delete nextControls[trafficControlKey(c)];
                        nextSelected.delete(trafficControlKey(c));
                      }
                    });
                    emitTraffic({ ...traffic, controls: nextControls });
                    setSelectedTrafficIds(nextSelected);
                  }}
                  onLinkSelected={() => {
                    const groupId = `grp-${Date.now()}`;
                    const nextControls = { ...traffic.controls };
                    selectedTrafficIds.forEach(id => {
                      const c = nextControls[id];
                      if (c?.kind === 'stoplight') nextControls[id] = { ...c, groupId };
                    });
                    const coordinated = coordinateLightGroup(Object.values(nextControls), groupId);
                    emitTraffic({
                      ...traffic,
                      controls: Object.fromEntries(coordinated.map(c => [trafficControlKey(c), c])),
                    });
                  }}
                  onUnlinkSelected={() => {
                    emitTraffic({
                      ...traffic,
                      controls: unlinkStoplights(traffic.controls, selectedTrafficIds),
                    });
                  }}
                  onToggleManual={(manual) => {
                    const nextControls = { ...traffic.controls };
                    selectedTrafficIds.forEach(id => {
                      const c = nextControls[id];
                      if (c?.kind === 'stoplight') {
                        nextControls[id] = { ...c, manualOnly: manual };
                      }
                    });
                    emitTraffic({ ...traffic, controls: nextControls });
                  }}
                />
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

                <div className="bg-white border border-rose-100 rounded-xl p-3 space-y-2 shrink-0">
                  <div className="text-xs font-semibold text-rose-800 flex items-center gap-1">
                    <span>🏠</span> Owner house
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Assign selected cars to a house. They tour town, then return home to park for 10s.
                  </p>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      disabled={carsFilteredSelection.size === 0 || !roomCode}
                      onClick={() => toggleHomeAssignMode(carsFilteredSelection)}
                      className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-colors disabled:opacity-40 ${
                        pendingHomeAssign
                          ? 'bg-rose-600 text-white animate-pulse'
                          : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                      }`}
                    >
                      {pendingHomeAssign ? 'Click a house…' : 'Assign home'}
                    </button>
                    <button
                      type="button"
                      disabled={carsFilteredSelection.size === 0 || !roomCode}
                      onClick={() => assignSelectedCarsToRandomHomes(carsFilteredSelection)}
                      className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 disabled:opacity-40"
                      title="Assign each selected car to a random house on the map"
                    >
                      Random homes
                    </button>
                    <button
                      type="button"
                      disabled={
                        carsFilteredSelection.size === 0 ||
                        !roomCode ||
                        !Array.from(carsFilteredSelection).some(id => vehicles[id]?.homeKey)
                      }
                      onClick={() => clearSelectedHomes(carsFilteredSelection)}
                      className="px-2 py-1.5 rounded-lg text-[11px] font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40"
                      title="Clear home assignment"
                    >
                      Clear
                    </button>
                  </div>
                  {pendingHomeAssign && (
                    <div className="text-[10px] text-rose-600 font-medium">
                      Click a Home tile on the map to set ownership.
                    </div>
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

        {/* Service Vehicles Panel */}
        <AnimatePresence>
          {showServicePanel && (
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
                  <div className="p-2 bg-orange-50 text-orange-600 rounded-xl">
                    <Siren className="w-5 h-5" />
                  </div>
                  <h2 className="font-bold text-slate-800">Service Vehicles</h2>
                </div>
                <button onClick={() => setShowServicePanel(false)} className="p-2 hover:bg-slate-50 text-slate-400 rounded-xl transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 flex flex-col gap-4">
                <div className="bg-slate-50 rounded-xl px-2 py-2 border border-slate-100 shrink-0 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      ref={addCarsCountRef}
                      defaultValue={1}
                      min={1}
                      max={50}
                      title="Spawn count"
                      aria-label="Spawn count"
                      className="w-11 shrink-0 px-1.5 py-1.5 text-xs text-center border border-slate-200 rounded-lg outline-none focus:border-orange-500 bg-white"
                    />
                    <span className="text-[10px] text-slate-500">spawn count</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(Object.keys(SERVICE_VEHICLE_META) as ServiceVehicleType[]).map(svcType => {
                      const meta = SERVICE_VEHICLE_META[svcType];
                      return (
                        <button
                          key={svcType}
                          type="button"
                          onClick={() => addRandomCars(svcType)}
                          disabled={!roomCode}
                          className="flex items-center justify-center gap-1 min-w-0 py-1.5 px-1 rounded-lg text-white text-[11px] font-semibold transition-colors disabled:opacity-50"
                          style={{ backgroundColor: meta.color === '#f8fafc' ? '#64748b' : meta.color }}
                          title={`Add ${meta.label}(s)`}
                        >
                          <Plus className="w-3 h-3 shrink-0" aria-hidden />
                          <span className="truncate">{meta.emoji} {meta.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-between px-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={serviceList.length > 0 && serviceFilteredSelection.size === serviceList.length}
                      onChange={() => toggleAllVehiclesOfType('service')}
                      className="rounded border-slate-300 text-orange-600 focus:ring-orange-600"
                    />
                    Select All ({serviceFilteredSelection.size}/{serviceList.length})
                  </label>
                  <button
                    onClick={() => removeSelectedCars(serviceFilteredSelection)}
                    disabled={serviceFilteredSelection.size === 0 || !roomCode}
                    className="text-red-500 hover:text-red-600 disabled:opacity-30 disabled:pointer-events-none p-1 bg-red-50 hover:bg-red-100 rounded-md transition-colors"
                    title="Remove Selected"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>

                <div className="bg-white border border-slate-100 rounded-2xl overflow-y-auto overscroll-contain shadow-inner flex flex-col min-h-[120px] max-h-[280px] shrink-0">
                  {serviceList.map(renderVehicleListItem)}
                  {serviceList.length === 0 && (
                    <div className="flex-1 flex items-center justify-center text-sm text-slate-400 p-4">
                      No service vehicles active
                    </div>
                  )}
                </div>

                <div className="text-[10px] text-slate-500 bg-orange-50 border border-orange-100 rounded-lg p-2 space-y-1">
                  <p>Park service vehicles in a <strong>Vehicle Repair Shop</strong> bay for repairs, or ambulances in a <strong>Hospital</strong> EMS bay to admit patients.</p>
                  <p>Open the building to run repair jobs or illness treatments from inventory recipes.</p>
                </div>

                <div className="bg-white border border-orange-200 rounded-xl p-3 space-y-2 shrink-0">
                  <div className="text-xs font-semibold text-orange-800 flex items-center gap-1">
                    <Flame className="w-3.5 h-3.5" /> Start fire
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Click a tree (pine, oak, or seedling) to set it on fire. It burns for 30 seconds, then is removed.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingFireStart(p => !p);
                      setPendingHomeAssign(false);
                      setPendingEmployeeAssign(false);
                      setPendingRouteVehicleId(null);
                      setSelectedTile(null);
                      setIsPlacingVehicles(false);
                    }}
                    className={`w-full py-2 rounded-lg text-xs font-bold transition-colors ${
                      pendingFireStart
                        ? 'bg-orange-600 text-white animate-pulse'
                        : 'bg-orange-50 text-orange-800 hover:bg-orange-100 border border-orange-200'
                    }`}
                  >
                    {pendingFireStart ? 'Click a tree… (Esc to cancel)' : 'Start fire on tree'}
                  </button>
                </div>
              </div>

              <div className="shrink-0 p-4 border-t border-slate-200 bg-slate-50/50 max-h-[45vh] overflow-y-auto overscroll-contain">
                <VehicleMotionControls
                  panelType="service"
                  filteredSelection={serviceFilteredSelection}
                  vehicles={vehicles}
                  roomCode={roomCode}
                  pendingRouteVehicleId={pendingRouteVehicleId}
                  isPlacingVehicles={isPlacingVehicles}
                  onSpeedChange={(s) => changeSelectedCarsSpeed(s, serviceFilteredSelection)}
                  onToggleAttribute={(a) => toggleSelectedCarsAttribute(a, serviceFilteredSelection)}
                  onDistribute={() => distributeSelectedCars(serviceFilteredSelection)}
                  onToggleDestination={() => toggleDestinationMode(serviceFilteredSelection)}
                  onPark={() => parkSelectedVehicles(serviceFilteredSelection)}
                  onUnpark={() => unparkSelectedVehicles(serviceFilteredSelection)}
                  onToggleEmergencyLights={() => toggleSelectedEmergencyLights(serviceFilteredSelection)}
                  showLightsToggle
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

        {/* People & Families Panel */}
        <AnimatePresence>
          {showPeoplePanel && (
            <motion.div
              initial={{ x: 400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 400, opacity: 0 }}
              className="absolute right-0 top-0 bottom-0 w-[26rem] bg-white/95 backdrop-blur-md shadow-2xl border-l border-slate-200 z-[100] flex flex-col min-h-0 overflow-hidden"
              data-grid-control
              {...blockGridPointerEvents}
            >
              <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-violet-50 text-violet-600 rounded-xl">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-bold text-slate-800">People</h2>
                    <p className="text-[10px] text-slate-400">
                      {peopleList.length} citizens · {Object.keys(economy.families || {}).length} families
                      {' · '}1yr = 1hr
                    </p>
                  </div>
                </div>
                <button onClick={() => setShowPeoplePanel(false)} className="p-2 hover:bg-slate-50 text-slate-400 rounded-xl">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 flex flex-col gap-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={!roomCode}
                    onClick={populatePeople}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 disabled:opacity-40"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Populate houses
                  </button>
                  <button
                    type="button"
                    disabled={!roomCode}
                    onClick={() => {
                      const next = { ...economy, peoplePaused: !economy.peoplePaused };
                      setEconomy(next);
                      if (roomCode) socket.emit('update-economy', { roomCode, economy: next });
                    }}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border ${
                      economy.peoplePaused
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-slate-50 text-slate-600 border-slate-200'
                    }`}
                  >
                    {economy.peoplePaused ? 'Paused' : 'Running'}
                  </button>
                </div>
                <p className="text-[10px] text-slate-500">
                  Create and manage citizens. Assign employees to recipe buildings (factories / lumbermills)
                  so production can run. 1 year of age = 1 hour real time.
                </p>

                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    disabled={!roomCode}
                    onClick={openCreatePersonForm}
                    className="flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-bold bg-violet-100 text-violet-800 border border-violet-200 hover:bg-violet-200 disabled:opacity-40"
                  >
                    <UserPlus className="w-3 h-3" />
                    New person
                  </button>
                  <button
                    type="button"
                    disabled={!roomCode || selectedPersonIds.size !== 1}
                    onClick={() => openEditPersonForm()}
                    className="flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 disabled:opacity-40"
                  >
                    <Pencil className="w-3 h-3" />
                    Edit selected
                  </button>
                  <button
                    type="button"
                    disabled={!roomCode || selectedPersonIds.size === 0}
                    onClick={deleteSelectedPeople}
                    className="flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 disabled:opacity-40"
                  >
                    <UserMinus className="w-3 h-3" />
                    Delete selected
                  </button>
                  <button
                    type="button"
                    disabled={!roomCode || selectedPersonIds.size === 0}
                    onClick={startAssignEmployees}
                    className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-bold border disabled:opacity-40 ${
                      pendingEmployeeAssign
                        ? 'bg-violet-600 text-white border-violet-700 animate-pulse'
                        : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                    }`}
                  >
                    <Briefcase className="w-3 h-3" />
                    {pendingEmployeeAssign ? 'Click building…' : 'Assign workplace'}
                  </button>
                </div>

                {peopleFormMode !== 'closed' && (
                  <div className="bg-white border border-violet-200 rounded-xl p-3 space-y-2 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold text-violet-900">
                        {peopleFormMode === 'create' ? 'Create person' : 'Edit person'}
                      </div>
                      <button
                        type="button"
                        onClick={() => setPeopleFormMode('closed')}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <label className="text-[10px] text-slate-500 col-span-1">
                        First name
                        <input
                          className="mt-0.5 w-full border border-slate-200 rounded px-2 py-1 text-xs"
                          value={peopleForm.firstName}
                          onChange={e => setPeopleForm(f => ({ ...f, firstName: e.target.value }))}
                        />
                      </label>
                      <label className="text-[10px] text-slate-500 col-span-1">
                        Last name
                        <input
                          className="mt-0.5 w-full border border-slate-200 rounded px-2 py-1 text-xs"
                          value={peopleForm.lastName}
                          onChange={e => setPeopleForm(f => ({ ...f, lastName: e.target.value }))}
                        />
                      </label>
                      <label className="text-[10px] text-slate-500">
                        Sex
                        <select
                          className="mt-0.5 w-full border border-slate-200 rounded px-2 py-1 text-xs"
                          value={peopleForm.sex}
                          onChange={e => setPeopleForm(f => ({ ...f, sex: e.target.value as 'm' | 'f' }))}
                        >
                          <option value="m">Male</option>
                          <option value="f">Female</option>
                        </select>
                      </label>
                      <label className="text-[10px] text-slate-500">
                        Age (years)
                        <input
                          type="number"
                          min={0}
                          max={100}
                          className="mt-0.5 w-full border border-slate-200 rounded px-2 py-1 text-xs"
                          value={peopleForm.ageYears}
                          onChange={e => setPeopleForm(f => ({ ...f, ageYears: Math.max(0, parseInt(e.target.value) || 0) }))}
                        />
                      </label>
                      <label className="text-[10px] text-slate-500 col-span-2">
                        Home key (tile)
                        <select
                          className="mt-0.5 w-full border border-slate-200 rounded px-2 py-1 text-xs"
                          value={peopleForm.homeKey}
                          onChange={e => setPeopleForm(f => ({ ...f, homeKey: e.target.value }))}
                        >
                          <option value="">Select home…</option>
                          {listHomeKeys(grid).map(hk => (
                            <option key={hk} value={hk}>{hk}</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-[10px] text-slate-500">
                        Workplace key
                        <input
                          className="mt-0.5 w-full border border-slate-200 rounded px-2 py-1 text-xs font-mono"
                          placeholder="e.g. 12,5 (optional)"
                          value={peopleForm.workplaceKey}
                          onChange={e => setPeopleForm(f => ({ ...f, workplaceKey: e.target.value }))}
                        />
                      </label>
                      <label className="text-[10px] text-slate-500">
                        Money
                        <input
                          type="number"
                          min={0}
                          className="mt-0.5 w-full border border-slate-200 rounded px-2 py-1 text-xs"
                          value={peopleForm.money}
                          onChange={e => setPeopleForm(f => ({ ...f, money: Math.max(0, parseInt(e.target.value) || 0) }))}
                        />
                      </label>
                      <label className="text-[10px] text-slate-500 col-span-2">
                        Health
                        <select
                          className="mt-0.5 w-full border border-slate-200 rounded px-2 py-1 text-xs"
                          value={peopleForm.health}
                          onChange={e => setPeopleForm(f => ({ ...f, health: e.target.value as Person['health'] }))}
                        >
                          <option value="healthy">Healthy</option>
                          <option value="sick">Sick</option>
                          <option value="injured">Injured</option>
                        </select>
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={!roomCode || !peopleForm.homeKey}
                        onClick={savePersonForm}
                        className="flex-1 py-1.5 rounded-lg text-[11px] font-bold bg-violet-600 text-white disabled:opacity-40"
                      >
                        {peopleFormMode === 'create' ? 'Create' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPeopleFormMode('closed')}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-bold border border-slate-200 text-slate-600"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                <input
                  type="text"
                  value={peopleFilter}
                  onChange={e => setPeopleFilter(e.target.value)}
                  placeholder="Filter by name, home, workplace, activity…"
                  className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs"
                />

                <div className="flex items-center justify-between text-[10px] text-slate-500 px-1">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filteredPeople.length > 0 && filteredPeople.every(p => selectedPersonIds.has(p.id))}
                      onChange={() => {
                        if (filteredPeople.every(p => selectedPersonIds.has(p.id))) {
                          setSelectedPersonIds(new Set());
                        } else {
                          setSelectedPersonIds(new Set(filteredPeople.map(p => p.id)));
                        }
                      }}
                    />
                    Select all shown ({selectedPersonIds.size})
                  </label>
                </div>

                <div className="bg-white border border-slate-100 rounded-2xl overflow-y-auto max-h-[32vh] shadow-inner">
                  {filteredPeople.length === 0 && (
                    <div className="p-6 text-center text-sm text-slate-400">
                      No people yet. Place homes, then Populate houses or create a person.
                    </div>
                  )}
                  {filteredPeople.map(p => {
                    const fam = economy.families?.[p.familyId];
                    const healthEmoji = p.health === 'healthy' ? '💚' : p.health === 'sick' ? '🤒' : '🩹';
                    return (
                      <div
                        key={p.id}
                        className={`flex gap-2 p-2.5 border-b border-slate-50 hover:bg-violet-50/50 ${
                          selectedPersonIds.has(p.id) ? 'bg-violet-50' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={selectedPersonIds.has(p.id)}
                          onChange={e => {
                            const next = new Set(selectedPersonIds);
                            if (e.target.checked) next.add(p.id);
                            else next.delete(p.id);
                            setSelectedPersonIds(next);
                          }}
                        />
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => {
                            setSelectedPersonIds(new Set([p.id]));
                            openEditPersonForm(p.id);
                          }}
                        >
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                            <span>{p.sex === 'm' ? '♂' : '♀'}</span>
                            <span className="truncate">{personDisplayName(p)}</span>
                            <span className="text-slate-400 font-normal">{formatAge(p.ageYears)}</span>
                            <span>{healthEmoji}</span>
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">
                            {fam ? `${fam.lastName} family` : p.familyId} · 🏠 {p.homeKey}
                            {p.workplaceKey ? ` · 👷 ${p.workplaceKey}` : ' · no job'}
                          </div>
                          <div className="text-[10px] text-violet-600 truncate">
                            {locationLabel(p.location)} · {p.activity || 'idle'}
                            {typeof p.money === 'number' ? ` · $${p.money}` : ''}
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div className="bg-violet-50 border border-violet-100 rounded-xl p-3 space-y-2">
                  <div className="text-xs font-semibold text-violet-900">Control selected people</div>
                  <p className="text-[10px] text-slate-500">
                    Assign workplace by clicking a building tile. Factories need enough employees to produce.
                    Board vehicles from Cars/Service selection.
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      disabled={selectedPersonIds.size === 0 || !roomCode}
                      onClick={startAssignEmployees}
                      className={`py-1.5 rounded-lg text-[11px] font-bold disabled:opacity-40 ${
                        pendingEmployeeAssign
                          ? 'bg-violet-700 text-white animate-pulse'
                          : 'bg-emerald-600 text-white'
                      }`}
                    >
                      <Briefcase className="w-3 h-3 inline mr-0.5" />
                      {pendingEmployeeAssign ? 'Click building…' : 'Assign workplace'}
                    </button>
                    <button
                      type="button"
                      disabled={selectedPersonIds.size === 0 || !roomCode}
                      onClick={clearSelectedWorkplaces}
                      className="py-1.5 rounded-lg text-[11px] font-bold bg-slate-200 text-slate-700 disabled:opacity-40"
                    >
                      Clear workplace
                    </button>
                    <button
                      type="button"
                      disabled={selectedPersonIds.size === 0 || selectedVehicles.size === 0 || !roomCode}
                      onClick={() => boardSelectedPeople('driver')}
                      className="py-1.5 rounded-lg text-[11px] font-bold bg-indigo-600 text-white disabled:opacity-40"
                    >
                      Board as driver
                    </button>
                    <button
                      type="button"
                      disabled={selectedPersonIds.size === 0 || selectedVehicles.size === 0 || !roomCode}
                      onClick={() => boardSelectedPeople('passenger')}
                      className="py-1.5 rounded-lg text-[11px] font-bold bg-sky-600 text-white disabled:opacity-40"
                    >
                      Board as passenger
                    </button>
                    <button
                      type="button"
                      disabled={selectedPersonIds.size === 0 || !roomCode}
                      onClick={() => alightSelectedPeople('here')}
                      className="py-1.5 rounded-lg text-[11px] font-bold bg-slate-700 text-white disabled:opacity-40"
                    >
                      Leave vehicle here
                    </button>
                    <button
                      type="button"
                      disabled={selectedPersonIds.size === 0 || !roomCode}
                      onClick={sendSelectedPeopleHome}
                      className="py-1.5 rounded-lg text-[11px] font-bold bg-rose-600 text-white disabled:opacity-40"
                    >
                      <Home className="w-3 h-3 inline mr-0.5" />
                      Send home
                    </button>
                    <button
                      type="button"
                      disabled={selectedPersonIds.size === 0 || !roomCode}
                      onClick={enterSelectedBuildingWithPeople}
                      className="col-span-2 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-700 text-white disabled:opacity-40"
                    >
                      Enter building (at vehicle / open inspector)
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

          {/* Home people / family inspector */}
          <AnimatePresence>
            {inspectHomeKey && (
              <HomeInspectorModal
                homeKey={inspectHomeKey}
                economy={economy}
                vehicles={vehicles}
                onClose={() => setInspectHomeKey(null)}
                onSelectPerson={(personId) => {
                  setSelectedPersonIds(new Set([personId]));
                  setShowPeoplePanel(true);
                  setInspectHomeKey(null);
                }}
              />
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
                        const layout = pendingLayout;
                        const nextGrid = layout.grid;
                        setGrid(nextGrid);
                        addToHistory(nextGrid);
                        // Restart all buildings from the layout snapshot (inventory + settings)
                        const buildings = materializeLayoutBuildings(layout, 0, 0);
                        applyLayoutBuildings(buildings, 'replace', layout.itemDefs);
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
