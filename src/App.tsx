/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
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
  Bot,
  Bus,
  CarTaxiFront,
  Users,
  Home,
  UserPlus,
  UserMinus,
  Pencil,
  Briefcase,
  Building2,
  CircleOff,
  Joystick,
  GripHorizontal,
  ShipWheel,
  Clock,
  CircleHelp,
} from 'lucide-react';
import {
  BotPanel,
  type BotContext,
  type BotPickMode,
  type BotPickResult,
} from './components/BotPanel';
import {
  BOT_ACTION_LIMITS,
  expandActions,
  type BotAction,
  type BotAsk,
} from './botActions';
import { Tile } from './components/Tile';
import { Vehicle as VehicleComponent, ParkedTrailerVisual } from './components/Vehicle';
import { DriverView3D, PersonView3D } from './components/DriverView3D';
import { TrafficOverlay, getAllTrafficControls, trafficControlKey } from './components/TrafficOverlay';
import { diffGrid, mergeAcceptedIntoBaseline } from './gridSync';
import {
  TileType, GridData, Point, GridTile, Vehicle, VehicleType, RailcarType, EconomyState, BuildingConfig,
  ItemDef, Cargo, ItemId, PlantGrowthSettings, ParkedTrailer, TrafficState, TrafficControl, TrafficLightPhase,
  LayoutSnapshot, ServiceVehicleType, SERVICE_VEHICLE_TYPES, isServiceVehicleType,
  hasEmergencyLights,
  RepairRecipe, ActiveRepair, IllnessRecipe, ActivePatient,
  Person, Family, ActiveTaxiRide, TravelPreference, BusRoute,
} from './types';
import {
  addBusRoute,
  appendBusRouteStop,
  assignBusToRoute,
  busRoutesOf,
  clearVehicleRoute,
  deleteBusRoute,
  findBusRoute,
  makeBusRouteId,
  releaseBusesFromRoute,
  removeBusRouteStopAt,
  renameBusRoute,
  resolveBusRouteId,
  stampRouteIds,
  syncAssignedBuses,
  withBusRoutes,
  type PendingBusRouteEdit,
} from './busRoutes';
import { traceBusRouteCells } from './busRouteOverlay';
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
  peopleShoppingAt,
  syncVehicleOccupancy,
  exchangeBusPassengers,
  isAdult,
  MS_PER_AGE_YEAR,
  countEmployeesAtBuilding,
  countEmployeesAssignedToBuilding,
  assignPeopleWorkplace,
  createPerson,
  randomFirstName,
  randomLastName,
  listHomeKeys,
  isResidentialHomeType,
  resolveHomeKeyFromTile,
  assignHomesWithDrivers,
  getPersonMapPlacement,
  getPersonFacingHeading,
  shouldYieldToPedestrians,
  generatePersonSchedule,
  formatScheduleTime,
  listStoreKeys,
  advanceWalkingPerson,
  getSimNow,
  formatClock12h,
  cityTimeOffsetForLocalTime,
  parseClockInput,
  locationForMapPlacement,
  startPersonTravel,
  commuteIntentForPerson,
  applyPeopleSimPatch,
  personNearVehicle,
  toOutdoorLocation,
  TRAVEL_PREFERENCE_OPTIONS,
  travelPreferenceLabel,
  preferenceToTransport,
  releaseDeletedTaxis,
} from './people';
import { PersonMapIcon } from './components/PersonMarker';
import { formatAppVersion } from './version';
import {
  BUS_LOOPS_BEFORE_REFUEL,
  BUS_REFUEL_TICKS,
  applyBusRefuelParking,
  findBusBayCells,
  findBusStationRefuelPoint,
  findNearestBusStationKey,
  isBusRefuelStall,
} from './bus';
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
  clampProgressForRedLight,
  hasConflictingTraffic,
  getAvailableLightSlots,
  getStoplightsAt,
  edgePortLabel,
  isEmergencyMode,
  getEmergencyHomeLane,
  getEmergencyPassLane,
  isOneWayTileType,
  oneWayKeepLane,
  taxiLaneEnteringTile,
  getOneWayTravel,
  isRoundabout4Way,
  driveExitPorts,
  routeStepCost,
} from './traffic';
import {
  canResumeAfterVehicleStop,
  findMaxSafeProgress,
  hasVehicleBlockingAhead,
  isLaneClearForEmergency,
} from './vehicleCollision';
import { bindRouteExit, resolveVehicleExit, signalHoldContext } from './vehicleShapes';
import { roundaboutYieldLimit } from './roundaboutYield';
import { headingWhenEnteringTile, roundaboutTravelFactor } from './vehicleTrajectory';
import {
  connectTowHook,
  disconnectTowHook,
  findTowTargetBehind,
  isTowTruck,
  snapTowedVehicle,
} from './tow';
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
/** Gap between the overview minimap and the right dock / tool menu. */
const RIGHT_HUD_GAP_PX = 16;
/** Matches Tailwind w-80 / w-96 / w-[26rem] on the right dock panels. */
const RIGHT_DOCK_WIDTH_PX = {
  people: 416,
  wide: 384,
  narrow: 320,
} as const;

function openRightDockWidthPx(flags: {
  people: boolean;
  logistics: boolean;
  plant: boolean;
  traffic: boolean;
  cars: boolean;
  semi: boolean;
  train: boolean;
  service: boolean;
  bot: boolean;
}): number {
  return Math.max(
    flags.people ? RIGHT_DOCK_WIDTH_PX.people : 0,
    flags.logistics || flags.bot ? RIGHT_DOCK_WIDTH_PX.wide : 0,
    flags.semi || flags.train || flags.service ? RIGHT_DOCK_WIDTH_PX.wide : 0,
    flags.plant || flags.traffic || flags.cars ? RIGHT_DOCK_WIDTH_PX.narrow : 0,
  );
}

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
  'road-roundabout-reverse': [0, 1, 2, 3],
  'road-roundabout-4way': [0, 1, 2, 3],
  'road-end': [2],
  'road-4lane-end': [2],
  'road-cul-de-sac': [2],
  'road-bus-stop': [0, 2],
  'road-4lane-bus-stop': [0, 2],
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
  'building-taxi-station': [0, 1, 2, 3],
  'building-bus-station': [0, 1, 2, 3],
  // Houses / apartments are approachable driveway-style parking for assigned cars
  'building-home': [0, 1, 2, 3],
  'building-apartment': [0, 1, 2, 3],
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
  // 4×2 taxi station: office row + 4 taxi bays
  if (type === 'building-taxi-station') return { w: 4, h: 2 };
  // 2×2 bus station: terminal row + 2 bus bays
  if (type === 'building-bus-station') return { w: 2, h: 2 };
  return { w: 1, h: 1 };
}

// Economy / dock helpers (new buildings)
export function isEconomyBuilding(type: string): boolean {
  return type.startsWith('building-') && (
    type.includes('warehouse') || type.includes('factory') || type === 'building-store' ||
    type === 'building-strip-mall' || type === 'building-lumbermill' || type === 'building-station' ||
    type === 'building-train-station-large' || type === 'building-repair-shop' ||
    type === 'building-hospital' || type === 'building-taxi-station' ||
    type === 'building-bus-station'
  );
}

export function getBuildingRole(type: string): BuildingConfig['role'] {
  if (type === 'building-warehouse' || type === 'building-warehouse-large') return 'warehouse';
  if (type === 'building-factory' || type === 'building-factory-large') return 'factory';
  if (type === 'building-lumbermill') return 'lumbermill';
  if (type === 'building-store' || type === 'building-strip-mall') return 'store';
  if (type === 'building-repair-shop') return 'repair-shop';
  if (type === 'building-hospital') return 'hospital';
  if (type === 'building-taxi-station') return 'taxi-station';
  if (type === 'building-bus-station') return 'bus-station';
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

/** Taxi station: bottom row of the 4×2 building (4 bays). */
export function isTaxiStationBay(tile: GridTile | undefined | null): boolean {
  if (!tile || tile.type !== 'building-taxi-station') return false;
  return (tile.localY ?? 0) >= 1;
}

export function getTaxiStationBayIndex(tile: GridTile): number {
  return Math.max(0, Math.min(3, tile.localX ?? 0));
}

/** Bus station: bottom row of the 2×2 terminal (2 bays). */
export function isBusStationBay(tile: GridTile | undefined | null): boolean {
  if (!tile || tile.type !== 'building-bus-station') return false;
  return (tile.localY ?? 0) >= 1;
}

export function getBusStationBayIndex(tile: GridTile): number {
  return Math.max(0, Math.min(1, tile.localX ?? 0));
}

/** Any building cell that vehicles can park in (repair / hospital / taxi / bus bays). */
export function isBuildingParkingBay(tile: GridTile | undefined | null): boolean {
  return (
    isRepairShopServiceBay(tile) ||
    isHospitalAmbulanceBay(tile) ||
    isTaxiStationBay(tile) ||
    isBusStationBay(tile)
  );
}

export function getBuildingParkingBayIndex(tile: GridTile): number {
  if (isHospitalAmbulanceBay(tile)) return getHospitalBayIndex(tile);
  if (isTaxiStationBay(tile)) return getTaxiStationBayIndex(tile);
  if (isBusStationBay(tile)) return getBusStationBayIndex(tile);
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
  taxi: { label: 'Robotaxi', color: '#facc15', emoji: '🚕' },
  bus: { label: 'Bus', color: '#2563eb', emoji: '🚌' },
};

/**
 * Short type prefix for vehicle ids (service vehicles use recognizable names).
 * taxi → cab so lists read cab-…, bus → bus, etc.
 */
export function vehicleIdPrefix(type?: VehicleType | string): string {
  switch (type) {
    case 'taxi':
      return 'cab';
    case 'bus':
      return 'bus';
    case 'fire-truck':
      return 'fire';
    case 'police':
      return 'police';
    case 'ambulance':
      return 'amb';
    case 'tow-truck':
      return 'tow';
    case 'train':
      return 'train';
    case 'semi':
      return 'semi';
    case 'car':
    default:
      return 'car';
  }
}

/** Unique vehicle id always starting with the type prefix, e.g. bus-m5k2-ab12 */
export function makeVehicleId(type?: VehicleType | string): string {
  const prefix = vehicleIdPrefix(type);
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

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
  let next: BuildingConfig = { ...cfg, inventoryCapacity };
  // Ensure taxi stations always have a stable unique owner id; fleet defaults to empty
  if (next.role === 'taxi-station') {
    if (!next.taxiStationOwnerId) {
      next = {
        ...next,
        taxiStationOwnerId: `tso-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      };
    }
    if (!next.taxiFleetIds) next = { ...next, taxiFleetIds: [] };
    if (!next.activeTaxiRides) next = { ...next, activeTaxiRides: [] };
  }
  if (next.role === 'bus-station') {
    const routes = busRoutesOf({ ...next, busFleetIds: next.busFleetIds || [] });
    next = withBusRoutes({ ...next, busFleetIds: next.busFleetIds || [] }, routes);
  }
  const inventory = { ...(next.inventory || {}) };
  Object.keys(inventory).forEach(itemId => {
    inventory[itemId] = Math.min(inventory[itemId], getItemCapacity(next, itemId));
  });
  return { ...next, inventory };
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
            title={`${staffCount}/${requiredStaff} employees on-site (assigned people must arrive before production uses them)`}
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
  return !!tile && isResidentialHomeType(tile.type);
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

  const activityLabel = (p: Person) => {
    if (atHomeIds.has(p.id)) return 'At home';
    return p.activity || locationLabel(p.location);
  };

  return (
    <FloatingWindow
      title={
        <span className="flex items-center gap-1.5">
          <Home className="w-3.5 h-3.5" />
          Home {homeKey}
        </span>
      }
      subtitle={`${atHome.length} at home · ${residents.length} resident${residents.length === 1 ? '' : 's'} · ${families.length} famil${families.length === 1 ? 'y' : 'ies'}`}
      headerClassName="bg-violet-600 text-white"
      borderClassName="border-violet-300"
      widthClassName="w-[22rem]"
      onClose={onClose}
    >
        <div className="p-3 space-y-3 text-xs">
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
    </FloatingWindow>
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

/** Bus route service constants */
const BUS_BOARDING_MS = 3500;

export function isBusStopTileType(type: string | undefined): boolean {
  return type === 'road-bus-stop' || type === 'road-4lane-bus-stop';
}

export function isBusStationTileType(type: string | undefined): boolean {
  return type === 'building-bus-station';
}

/**
 * Bus-stop art is drawn N–S with the bay on the **local east** curb.
 * After rotation, preferred travel heading is local-north (tile.rotation):
 * then the bay sits on the vehicle's right — the curb lane for that stop.
 */
export function getBusStopApproachHeading(tile: GridTile): number {
  return (((tile.rotation % 360) + 360) % 360);
}

/**
 * Right-hand traffic lane for the current road (always positive / correct side).
 * Buses must never use the opposite (negative) lane.
 */
export function getLegalTrafficLane(is4Lane: boolean, preferOuter = false): number {
  if (is4Lane) return preferOuter ? FOUR_LANE_OUTER : FOUR_LANE_INNER;
  return FOUR_LANE_INNER;
}

/**
 * Lane that sits against the bus-stop bay when traveling the **approach** heading.
 * Always a legal right-hand (positive) lane — buses must approach with correct heading
 * rather than using the wrong-way curb.
 */
export function getBusStopBayLane(tile: GridTile, heading?: number): number {
  const is4 = tile.type.includes('4lane');
  const approach = getBusStopApproachHeading(tile);
  const h = heading !== undefined ? ((heading % 360) + 360) % 360 : approach;
  let diff = Math.abs(h - approach) % 360;
  if (diff > 180) diff = 360 - diff;
  // Only legal when traveling approach direction; callers should force approach heading first
  if (diff > 90) {
    // Wrong way: still return legal positive for *current* heading (right-hand traffic)
    return getLegalTrafficLane(is4, true);
  }
  // Outer curb lane on 4-lane roads sits next to the painted bay
  return getLegalTrafficLane(is4, true);
}

/** Look up bus-stop tile at a grid cell (if any). */
export function getBusStopTileAt(
  grid: GridData,
  x: number,
  y: number,
): GridTile | undefined {
  const tiles = grid[`${x},${y}`];
  if (!tiles?.length) return undefined;
  return tiles.find(t => isBusStopTileType(t.type));
}

/** Prefer ground road tile for routing on multi-layer cells. */
function getRoutingRoadTile(tiles: GridTile[] | undefined): GridTile | undefined {
  if (!tiles?.length) return undefined;
  return (
    tiles.find(
      t =>
        t.type.startsWith('road') ||
        t.type === 'rail-road-crossing' ||
        t.type.startsWith('parking-') ||
        isBuildingParkingBay(t),
    ) || tiles[tiles.length - 1]
  );
}

/** Heading difference 0–180 */
function headingDiffDeg(a: number, b: number): number {
  let d = Math.abs((((a - b) % 360) + 360) % 360);
  if (d > 180) d = 360 - d;
  return d;
}

function parseGridKey(key: string | undefined): Point | null {
  if (!key) return null;
  const [x, y] = key.split(',').map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function busStopKeyAt(x: number, y: number, grid: GridData): string | null {
  const tiles = grid[`${x},${y}`];
  const top = tiles?.[tiles.length - 1];
  if (top && isBusStopTileType(top.type)) return `${x},${y}`;
  return null;
}

/**
 * Advance bus service after arriving at destination (stop or station).
 * Mutates people for board/alight. Returns updated vehicle + people.
 */
function processBusArrival(
  vehicle: Vehicle,
  people: Record<string, Person>,
  grid: GridData,
  now: number,
): { vehicle: Vehicle; people: Record<string, Person> } {
  let nextPeople = { ...people };
  let v = { ...vehicle };
  const route = v.busRoute || [];
  const hereKey = `${v.x},${v.y}`;
  const phase = v.busPhase || 'route';

  // Arrived at station for fuel — park in a bay or the station's parking lot
  const onRefuelStall = isBusRefuelStall(v.x, v.y, v.busStationKey, grid);
  if (phase === 'to-station' && onRefuelStall) {
    v = applyBusRefuelParking(v, grid);
    // Riders stay aboard through the depot and step off at their stop later.
    v = syncVehicleOccupancy(v, nextPeople);
    return { vehicle: v, people: nextPeople };
  }

  // Arrived at a bus stop on the route
  const stopKey = busStopKeyAt(v.x, v.y, grid) || hereKey;
  const routeIdx = route.indexOf(stopKey);
  if (routeIdx < 0 && phase !== 'boarding') {
    // Not a route stop — generic arrival stop
    return {
      vehicle: {
        ...v,
        destination: null,
        isMoving: false,
        turnIntent: null,
        progress: 0.5,
      },
      people: nextPeople,
    };
  }

  // Alight at the route stop nearest each rider's destination, then board
  // people waiting here. Late arrivals are picked up again during the dwell.
  nextPeople = exchangeBusPassengers(nextPeople, v, grid, now);
  v = syncVehicleOccupancy(v, nextPeople);

  // Advance route index; count loop when wrapping
  let nextIndex = routeIdx >= 0 ? (routeIdx + 1) % Math.max(1, route.length) : (v.busRouteIndex || 0);
  let loops = v.busRouteLoops || 0;
  if (route.length > 0 && routeIdx >= 0 && nextIndex === 0) {
    loops += 1;
  }

  // After 5 loops → station for gas (park in the lot / bay, never the office)
  if (loops >= BUS_LOOPS_BEFORE_REFUEL) {
    const station =
      v.busStationKey ||
      findNearestBusStationKey({ x: v.x, y: v.y }, grid);
    const stallPt = findBusStationRefuelPoint(station, { x: v.x, y: v.y }, grid);
    v = {
      ...v,
      busRouteIndex: 0,
      busRouteLoops: loops,
      busPhase: 'to-station',
      busStationKey: station || v.busStationKey,
      busStopUntil: undefined,
      destination: stallPt,
      isMoving: !!stallPt,
      turnIntent: null,
      progress: 0.5,
      randomTurning: false,
    };
    return { vehicle: v, people: nextPeople };
  }

  // Dwell at stop, then continue to next stop — always on the bay curb
  const nextStopKey = route.length > 0 ? route[nextIndex] : null;
  const nextStopPt = parseGridKey(nextStopKey || undefined);
  const stopTile = getBusStopTileAt(grid, v.x, v.y);
  const approachH = stopTile ? getBusStopApproachHeading(stopTile) : v.heading;
  // Always board facing approach heading on the legal bay curb lane
  const bayLane = stopTile
    ? getBusStopBayLane(stopTile, approachH)
    : getLegalTrafficLane(false, false);
  v = {
    ...v,
    busRouteIndex: nextIndex,
    busRouteLoops: loops,
    busPhase: 'boarding',
    busStopUntil: now + BUS_BOARDING_MS,
    destination: null,
    isMoving: false,
    turnIntent: null,
    progress: 0.5,
    heading: approachH,
    lane: bayLane,
    randomTurning: false,
    // stash next dest for after boarding
    ...(nextStopPt ? {} : {}),
  };
  // Store next destination on a temporary field via busPhase boarding end
  // We'll set destination when boarding dwell ends
  return { vehicle: v, people: nextPeople };
}

function advanceBusService(
  vehicle: Vehicle,
  people: Record<string, Person>,
  grid: GridData,
  deltaTime: number,
  now: number,
): { vehicle: Vehicle; people: Record<string, Person>; handled: boolean } {
  if (vehicle.type !== 'bus' || vehicle.manualOverride) {
    return { vehicle, people, handled: false };
  }
  const route = vehicle.busRoute;
  if (!route || route.length === 0) {
    return { vehicle, people, handled: false };
  }

  let v = { ...vehicle };
  let nextPeople = people;

  // Refueling countdown (~1 tick per second)
  if (v.busPhase === 'refueling') {
    const acc = (v.busRefuelAccumMs || 0) + deltaTime;
    let ticks = v.busRefuelTicks ?? BUS_REFUEL_TICKS;
    let accum = acc;
    while (accum >= 1000 && ticks > 0) {
      accum -= 1000;
      ticks -= 1;
    }
    if (ticks <= 0) {
      // Resume route from first stop
      const first = parseGridKey(route[0]);
      v = {
        ...v,
        busPhase: 'route',
        busRouteLoops: 0,
        busRouteIndex: 0,
        busRefuelTicks: undefined,
        busRefuelAccumMs: undefined,
        destination: first,
        isMoving: !!first,
        turnIntent: null,
        randomTurning: false,
      };
      delete v.parkingStopUntil;
    } else {
      v = {
        ...v,
        busRefuelTicks: ticks,
        busRefuelAccumMs: accum,
        isMoving: false,
        destination: null,
      };
    }
    return { vehicle: v, people: nextPeople, handled: true };
  }

  // Boarding dwell at stop — keep picking up people who reach the stop while it sits
  if (v.busPhase === 'boarding') {
    const exchanged = exchangeBusPassengers(nextPeople, v, grid, now);
    if (exchanged !== nextPeople) {
      nextPeople = exchanged;
      v = syncVehicleOccupancy(v, nextPeople);
    }
    if (v.busStopUntil && now < v.busStopUntil) {
      return {
        vehicle: { ...v, isMoving: false, destination: null },
        people: nextPeople,
        handled: true,
      };
    }
    // Leave stop toward next index
    const idx = v.busRouteIndex ?? 0;
    const nextKey = route[idx] || route[0];
    const nextPt = parseGridKey(nextKey);
    v = {
      ...v,
      busPhase: 'route',
      busStopUntil: undefined,
      destination: nextPt,
      isMoving: !!nextPt,
      turnIntent: null,
      randomTurning: false,
    };
    return { vehicle: v, people: nextPeople, handled: true };
  }

  // Ensure destination while on route / to-station
  if (v.busPhase === 'to-station') {
    // Already sitting in the station lot / bay → start fueling even if dest was the office
    if (isBusRefuelStall(v.x, v.y, v.busStationKey, grid)) {
      const arrived = processBusArrival(v, nextPeople, grid, now);
      return { vehicle: arrived.vehicle, people: arrived.people, handled: true };
    }
    const destIsStall =
      !!v.destination &&
      isBusRefuelStall(v.destination.x, v.destination.y, v.busStationKey, grid);
    if (!v.destination || !destIsStall) {
      const station =
        v.busStationKey || findNearestBusStationKey({ x: v.x, y: v.y }, grid);
      const pt = findBusStationRefuelPoint(station, { x: v.x, y: v.y }, grid);
      if (pt) {
        v = {
          ...v,
          busStationKey: station || v.busStationKey,
          destination: pt,
          isMoving: true,
          randomTurning: false,
        };
      }
    }
    return { vehicle: v, people: nextPeople, handled: true };
  }

  // Default route phase: keep heading to current stop
  if (!v.busPhase || v.busPhase === 'route') {
    const idx = v.busRouteIndex ?? 0;
    const stopKey = route[idx] || route[0];
    const pt = parseGridKey(stopKey);
    if (pt && (!v.destination || v.destination.x !== pt.x || v.destination.y !== pt.y)) {
      v = {
        ...v,
        busPhase: 'route',
        destination: pt,
        isMoving: true,
        randomTurning: false,
        turnAroundAtDeadEnd: true,
      };
    } else if (pt && !v.isMoving && !v.busStopUntil && !v.trafficStopReason) {
      // Was stopped but should be en route. Do not clear a signal / yield hold.
      v = { ...v, isMoving: true, destination: pt, randomTurning: false };
    }
    return { vehicle: v, people: nextPeople, handled: true };
  }

  return { vehicle: v, people: nextPeople, handled: false };
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
    // Bus service handles its own stop/station arrival (processBusArrival)
    if (vehicle.type === 'bus' && vehicle.busRoute && vehicle.busRoute.length > 0 && !vehicle.manualOverride) {
      return {};
    }
    const isHomeArrival = !!vehicle.homeKey && vehicle.homeKey === key;
    // Manual override: stop on arrival only — no auto parking dwell or home-tour schedule
    if (vehicle.manualOverride) {
      return { destination: null, isMoving: false, turnIntent: null, progress: 0.5 };
    }
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
    // Non-home arrival: stop and defer home AI so it doesn't immediately re-route home
    const now = Date.now();
    return {
      destination: null,
      isMoving: false,
      turnIntent: null,
      progress: 0.5,
      ...(vehicle.homeKey
        ? { nextHomeReturnAt: now + randomHomeTourDelayMs() }
        : {}),
    };
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
  vType: 'car' | 'train' | 'semi' | 'bus' | string = 'car',
  grid: GridData
): number | null {
  if (!dest) return null;
  const g = grid || {};
  const key = (x: number, y: number, h: number) => `${x},${y},${h}`;
  const visited = new Set<string>();
  const queue: RouteNode[] = [];

  const startTile = getRoutingRoadTile(g[`${cx},${cy}`]);
  const startPorts = (TILE_CONNECTIONS[startTile?.type || ''] || []).map(
    p => (p + (startTile?.rotation || 0) / 90) % 4,
  );
  const entryPort = (entryHeading / 90 + 2) % 4;
  const startOneWay = getOneWayTravel(startTile);
  const possibleExits = driveExitPorts(
    startTile?.type || '',
    startPorts,
    entryPort,
    startOneWay ? startOneWay.exitPort : null,
  );

  if (possibleExits.length === 0) return null;

  const destBusStop = getBusStopTileAt(g, dest.x, dest.y);
  const busApproach = destBusStop ? getBusStopApproachHeading(destBusStop) : null;
  const isBus = vType === 'bus';

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
        x: nx, y: ny, heading: exitH,
        cost: routeStepCost(startTile?.type, entryPort, exitPort),
        firstExit: exitH,
        prev: { x: cx, y: cy, heading: entryHeading, exit: exitH },
      });
    }
  }

  const maxDepth = isBus && destBusStop ? 220 : 180;
  let best: RouteNode | null = null;
  let bestCost = Infinity;

  while (queue.length > 0) {
    const node = queue.shift()!;
    if (node.cost > maxDepth) continue;

    // Reached dest tile
    if (node.x === dest.x && node.y === dest.y) {
      let cost = node.cost;
      // Buses: must prefer arrival heading matching bay approach (legal traffic side)
      if (destBusStop && busApproach != null) {
        const hDiff = headingDiffDeg(node.heading, busApproach);
        if (hDiff <= 45) {
          cost -= 2; // prefer correct approach
        } else if (hDiff >= 135) {
          // Wrong-way on the stop — almost never take this path
          cost += isBus ? 80 : 8;
        } else {
          cost += isBus ? 25 : 2;
        }
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = node;
      }
      // Keep exploring for a better approach arrival when routing buses to stops
      if (isBus && destBusStop && busApproach != null) {
        if (headingDiffDeg(node.heading, busApproach) <= 45) {
          // Found a correct approach — can still look for shorter correct ones
        }
        continue;
      }
      continue;
    }

    // Explore next exits
    const curTiles = g[`${node.x},${node.y}`];
    if (!curTiles) continue;
    const curTile = getRoutingRoadTile(curTiles);
    if (!curTile) continue;

    const ports = (TILE_CONNECTIONS[curTile.type || ''] || []).map(
      (p: number) => (p + (curTile.rotation || 0) / 90) % 4,
    );
    const entP = (node.heading / 90 + 2) % 4;
    const curOneWay = getOneWayTravel(curTile);
    if (curOneWay && entP !== curOneWay.enterPort) continue;
    const nextExits = driveExitPorts(
      curTile.type,
      ports,
      entP,
      curOneWay ? curOneWay.exitPort : null,
    );

    // Type filters
    if (vType === 'train') {
      if (!curTile.type?.startsWith('rail') && curTile.type !== 'rail-road-crossing') continue;
    }

    for (const exP of nextExits) {
      const exH = exP * 90;
      const dx = exH === 90 ? 1 : exH === 270 ? -1 : 0;
      const dy = exH === 180 ? 1 : exH === 0 ? -1 : 0;
      const nx = node.x + dx;
      const ny = node.y + dy;
      const nkey = key(nx, ny, exH);
      if (visited.has(nkey)) continue;
      // Skip non-drivable for road vehicles
      const nextTiles = g[`${nx},${ny}`];
      if (!nextTiles?.length) continue;
      const nextRoad = getRoutingRoadTile(nextTiles);
      if (!nextRoad && vType !== 'train') continue;
      const nextOw = nextRoad ? getOneWayTravel(nextRoad) : null;
      if (nextOw && (exH / 90 + 2) % 4 !== nextOw.enterPort) continue;

      let stepCost = routeStepCost(curTile.type, entP, exP);
      // Soft bias: when bus destination has a known approach, prefer headings aligned
      // with that approach as we get close (helps set up the final approach leg)
      if (isBus && busApproach != null) {
        const dist = Math.abs(nx - dest.x) + Math.abs(ny - dest.y);
        if (dist <= 6) {
          const align = headingDiffDeg(exH, busApproach);
          if (align <= 45) stepCost -= 0.15;
          else if (align >= 135) stepCost += 0.35;
        }
      }

      visited.add(nkey);
      queue.push({
        x: nx,
        y: ny,
        heading: exH,
        cost: node.cost + stepCost,
        firstExit: node.firstExit,
        prev: { x: node.x, y: node.y, heading: node.heading, exit: exH },
      });
    }
  }

  if (best) return best.firstExit;

  // Fallback: pick the exit that points most toward dest
  // For bus stops, bias toward the approach corridor (enter from opposite of approach)
  const dx = dest.x - cx;
  const dy = dest.y - cy;
  let bestExit = possibleExits[0] * 90;
  let bestDot = -999;
  for (const p of possibleExits) {
    const h = p * 90;
    const ddx = h === 90 ? 1 : h === 270 ? -1 : 0;
    const ddy = h === 180 ? 1 : h === 0 ? -1 : 0;
    let dot = ddx * dx + ddy * dy;
    if (isBus && busApproach != null) {
      // Prefer turning toward the approach heading when near the stop
      if (headingDiffDeg(h, busApproach) <= 45) dot += 1.5;
    }
    if (dot > bestDot) {
      bestDot = dot;
      bestExit = h;
    }
  }
  return bestExit;
}

bindRouteExit(getRecommendedExit);

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

/** Stack order for floating inspectors / drive-style windows */
let floatingWindowZ = 160;
let floatingWindowSpawnN = 0;

type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const FLOAT_PANEL_MIN_W = 240;
const FLOAT_PANEL_MIN_H = 140;

type PanelSize = { w: number; h: number };

type ResizeSession = {
  pointerId: number;
  edge: ResizeEdge;
  startClientX: number;
  startClientY: number;
  originX: number;
  originY: number;
  originW: number;
  originH: number;
};

/** Compute new position + size while dragging a border/corner, clamped to viewport and mins. */
function computePanelResize(
  session: ResizeSession,
  clientX: number,
  clientY: number,
  minW = FLOAT_PANEL_MIN_W,
  minH = FLOAT_PANEL_MIN_H,
): { pos: Point; size: PanelSize } {
  const dx = clientX - session.startClientX;
  const dy = clientY - session.startClientY;
  const edge = session.edge;
  let left = session.originX;
  let top = session.originY;
  let right = session.originX + session.originW;
  let bottom = session.originY + session.originH;

  if (edge.includes('e')) right = session.originX + session.originW + dx;
  if (edge.includes('w')) left = session.originX + dx;
  if (edge.includes('s')) bottom = session.originY + session.originH + dy;
  if (edge.includes('n')) top = session.originY + dy;

  // Min size (anchor the non-dragged edge)
  if (right - left < minW) {
    if (edge.includes('w')) left = right - minW;
    else right = left + minW;
  }
  if (bottom - top < minH) {
    if (edge.includes('n')) top = bottom - minH;
    else bottom = top + minH;
  }

  // Viewport clamp
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (left < 0) {
    left = 0;
    if (right - left < minW) right = Math.min(vw, left + minW);
  }
  if (top < 0) {
    top = 0;
    if (bottom - top < minH) bottom = Math.min(vh, top + minH);
  }
  if (right > vw) {
    right = vw;
    if (right - left < minW) left = Math.max(0, right - minW);
  }
  if (bottom > vh) {
    bottom = vh;
    if (bottom - top < minH) top = Math.max(0, bottom - minH);
  }

  return {
    pos: { x: left, y: top },
    size: { w: Math.max(minW, right - left), h: Math.max(minH, bottom - top) },
  };
}

const RESIZE_HANDLE_DEFS: { edge: ResizeEdge; className: string; cursor: string }[] = [
  { edge: 'n', className: 'left-2 right-2 top-0 h-1.5', cursor: 'ns-resize' },
  { edge: 's', className: 'left-2 right-2 bottom-0 h-1.5', cursor: 'ns-resize' },
  { edge: 'e', className: 'top-2 bottom-2 right-0 w-1.5', cursor: 'ew-resize' },
  { edge: 'w', className: 'top-2 bottom-2 left-0 w-1.5', cursor: 'ew-resize' },
  { edge: 'ne', className: 'top-0 right-0 w-3 h-3', cursor: 'nesw-resize' },
  { edge: 'nw', className: 'top-0 left-0 w-3 h-3', cursor: 'nwse-resize' },
  { edge: 'se', className: 'bottom-0 right-0 w-3 h-3', cursor: 'nwse-resize' },
  { edge: 'sw', className: 'bottom-0 left-0 w-3 h-3', cursor: 'nesw-resize' },
];

/** Invisible edge/corner hit targets for resizing a floating panel. */
function PanelResizeHandles({
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onLostPointerCapture,
}: {
  onPointerDown: (edge: ResizeEdge, e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  onLostPointerCapture: (e: React.PointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <>
      {RESIZE_HANDLE_DEFS.map(({ edge, className, cursor }) => (
        <div
          key={edge}
          data-resize-handle={edge}
          className={`absolute z-30 touch-none ${className}`}
          style={{ cursor }}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            e.preventDefault();
            onPointerDown(edge, e);
          }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onLostPointerCapture={onLostPointerCapture}
        />
      ))}
    </>
  );
}

/**
 * Persistent floating window (same interaction model as vehicle drive panels):
 * fixed to the viewport, draggable title bar, resizable borders/corners, no modal backdrop.
 */
function FloatingWindow({
  title,
  subtitle,
  headerClassName = 'bg-slate-800 text-white',
  borderClassName = 'border-slate-200',
  widthClassName = 'w-[22rem]',
  maxHeightClassName = 'max-h-[min(80vh,560px)]',
  children,
  onClose,
  initialOffset,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  headerClassName?: string;
  borderClassName?: string;
  widthClassName?: string;
  maxHeightClassName?: string;
  children: React.ReactNode;
  onClose: () => void;
  /** Optional spawn cascade offset so multiple windows don't stack perfectly */
  initialOffset?: Point;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const spawn = useRef({
    x: 48 + (floatingWindowSpawnN % 6) * 28 + (initialOffset?.x ?? 0),
    y: 72 + (floatingWindowSpawnN % 6) * 24 + (initialOffset?.y ?? 0),
    z: ++floatingWindowZ,
  });
  floatingWindowSpawnN += 1;

  const [localPos, setLocalPos] = useState<Point>({ x: spawn.current.x, y: spawn.current.y });
  const localPosRef = useRef(localPos);
  const [size, setSize] = useState<PanelSize | null>(null);
  const sizeRef = useRef<PanelSize | null>(null);
  const [zIndex, setZIndex] = useState(spawn.current.z);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragSessionRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const resizeSessionRef = useRef<ResizeSession | null>(null);

  const clampPos = useCallback((x: number, y: number): Point => {
    const w = sizeRef.current?.w ?? panelRef.current?.offsetWidth ?? 320;
    const h = sizeRef.current?.h ?? panelRef.current?.offsetHeight ?? 240;
    const maxX = Math.max(0, window.innerWidth - w);
    const maxY = Math.max(0, window.innerHeight - h);
    return {
      x: Math.max(0, Math.min(maxX, x)),
      y: Math.max(0, Math.min(maxY, y)),
    };
  }, []);

  const endDragSession = useCallback((el?: HTMLElement | null, pointerId?: number) => {
    const session = dragSessionRef.current;
    if (!session) return;
    if (pointerId !== undefined && session.pointerId !== pointerId) return;
    dragSessionRef.current = null;
    setIsDragging(false);
    if (el && pointerId !== undefined) {
      try {
        if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
      } catch {
        // ignore
      }
    }
  }, []);

  const endResizeSession = useCallback((el?: HTMLElement | null, pointerId?: number) => {
    const session = resizeSessionRef.current;
    if (!session) return;
    if (pointerId !== undefined && session.pointerId !== pointerId) return;
    resizeSessionRef.current = null;
    setIsResizing(false);
    if (el && pointerId !== undefined) {
      try {
        if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
      } catch {
        // ignore
      }
    }
  }, []);

  const handleHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (resizeSessionRef.current) return;
    e.stopPropagation();
    e.preventDefault();
    setZIndex(++floatingWindowZ);
    dragSessionRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originX: localPosRef.current.x,
      originY: localPosRef.current.y,
      moved: false,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handleHeaderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const session = dragSessionRef.current;
    if (!session || e.pointerId !== session.pointerId) return;
    const dx = e.clientX - session.startClientX;
    const dy = e.clientY - session.startClientY;
    if (!session.moved && dx * dx + dy * dy < 16) return;
    if (!session.moved) {
      session.moved = true;
      setIsDragging(true);
    }
    e.preventDefault();
    e.stopPropagation();
    const next = clampPos(session.originX + dx, session.originY + dy);
    localPosRef.current = next;
    setLocalPos(next);
  };

  const handleHeaderPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragSessionRef.current || dragSessionRef.current.pointerId !== e.pointerId) return;
    e.stopPropagation();
    endDragSession(e.currentTarget, e.pointerId);
  };

  const handleResizePointerDown = (edge: ResizeEdge, e: React.PointerEvent<HTMLDivElement>) => {
    if (dragSessionRef.current) {
      endDragSession(headerRef.current, dragSessionRef.current.pointerId);
    }
    setZIndex(++floatingWindowZ);
    const el = panelRef.current;
    const w = sizeRef.current?.w ?? el?.offsetWidth ?? 320;
    const h = sizeRef.current?.h ?? el?.offsetHeight ?? 240;
    resizeSessionRef.current = {
      pointerId: e.pointerId,
      edge,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originX: localPosRef.current.x,
      originY: localPosRef.current.y,
      originW: w,
      originH: h,
    };
    setIsResizing(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handleResizePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const session = resizeSessionRef.current;
    if (!session || e.pointerId !== session.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    const next = computePanelResize(session, e.clientX, e.clientY);
    localPosRef.current = next.pos;
    sizeRef.current = next.size;
    setLocalPos(next.pos);
    setSize(next.size);
  };

  const handleResizePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeSessionRef.current || resizeSessionRef.current.pointerId !== e.pointerId) return;
    e.stopPropagation();
    endResizeSession(e.currentTarget, e.pointerId);
  };

  return (
    <div
      ref={panelRef}
      className={`fixed ${size ? '' : widthClassName} ${size ? '' : maxHeightClassName} bg-white/98 backdrop-blur-md rounded-2xl shadow-2xl border-2 ${borderClassName} flex flex-col overflow-hidden pointer-events-auto ${
        isResizing ? 'select-none' : ''
      }`}
      style={{
        left: localPos.x,
        top: localPos.y,
        zIndex,
        ...(size ? { width: size.w, height: size.h } : null),
      }}
      data-grid-control
      onWheel={stopGridWheel}
      onContextMenu={stopGridPropagation}
      onClick={stopGridPropagation}
      onDoubleClick={stopGridPropagation}
      onMouseDown={(e) => {
        stopGridPropagation(e);
        setZIndex(++floatingWindowZ);
      }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('[data-float-title]')) return;
        if ((e.target as HTMLElement).closest('[data-resize-handle]')) return;
        stopGridPropagation(e);
        setZIndex(++floatingWindowZ);
      }}
      onPointerUp={stopGridPropagation}
      onPointerMove={stopGridPropagation}
    >
      <PanelResizeHandles
        onPointerDown={handleResizePointerDown}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerUp}
        onLostPointerCapture={(e) => endResizeSession(null, e.pointerId)}
      />
      <div
        ref={headerRef}
        data-float-title
        className={`shrink-0 px-3 py-2 ${headerClassName} flex items-center gap-2 select-none touch-none ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        onPointerDown={handleHeaderPointerDown}
        onPointerMove={handleHeaderPointerMove}
        onPointerUp={handleHeaderPointerUp}
        onPointerCancel={handleHeaderPointerUp}
        onLostPointerCapture={(e) => endDragSession(null, e.pointerId)}
      >
        <GripHorizontal className="w-4 h-4 opacity-80 shrink-0 pointer-events-none" />
        <div className="min-w-0 flex-1 pointer-events-none">
          <div className="text-xs font-bold truncate">{title}</div>
          {subtitle != null && subtitle !== false && (
            <div className="text-[10px] opacity-80 truncate">{subtitle}</div>
          )}
        </div>
        <button
          type="button"
          title="Close"
          onPointerDown={e => {
            e.stopPropagation();
            if (dragSessionRef.current) {
              endDragSession(headerRef.current, dragSessionRef.current.pointerId);
            }
          }}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="p-1 rounded-lg hover:bg-white/20 transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        {children}
      </div>
    </div>
  );
}

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
  { type: 'road-roundabout-reverse', label: 'Roundabout Mirror', category: 'road' },
  { type: 'road-roundabout-4way', label: '4-Way Roundabout', category: 'road' },
  { type: 'road-cul-de-sac', label: 'Cul-de-sac', category: 'road' },
  { type: 'road-bus-stop', label: 'Bus Stop (2-Lane)', category: 'road' },
  { type: 'road-4lane-bus-stop', label: 'Bus Stop (4-Lane)', category: 'road' },
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
  { type: 'building-taxi-station', label: 'Taxi Station (4×2, 4 bays)', category: 'building' },
  { type: 'building-bus-station', label: 'Bus Station (2×2, 2 bays)', category: 'building' },
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
  // Random turns / U-turn / destination routing disabled under manual override
  const manualAiLocked =
    selectedList.length > 0 && selectedList.every(id => !!vehicles[id]?.manualOverride);
  const activeCountTurnAround = selectedList.filter(
    id => vehicles[id]?.turnAroundAtDeadEnd && !vehicles[id]?.manualOverride,
  ).length;
  const isTurnAroundActive =
    !manualAiLocked &&
    filteredSelection.size > 0 &&
    activeCountTurnAround >= filteredSelection.size / 2;
  const activeCountRandomTurn = selectedList.filter(
    id => vehicles[id]?.randomTurning && !vehicles[id]?.manualOverride,
  ).length;
  const isRandomTurnActive =
    !manualAiLocked &&
    filteredSelection.size > 0 &&
    activeCountRandomTurn >= filteredSelection.size / 2;
  // Under manual override destination routing is off — never show dest button as active
  const selectedHaveDestination =
    !manualAiLocked &&
    selectedList.some(id => vehicles[id]?.destination && !vehicles[id]?.manualOverride);
  const isThisPendingRoute =
    !manualAiLocked &&
    !!pendingRouteVehicleId &&
    selectedList.includes(pendingRouteVehicleId);
  const isDestinationToggleActive =
    !manualAiLocked && (isThisPendingRoute || selectedHaveDestination);
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
                title={
                  manualAiLocked
                    ? 'U-turn at dead end is off in manual override'
                    : 'Turn around at end'
                }
                disabled={filteredSelection.size === 0 || !roomCode || manualAiLocked}
                onClick={() => onToggleAttribute('turnAroundAtDeadEnd')}
                className={`flex-1 p-2 rounded-lg transition-colors flex items-center justify-center ${
                  isTurnAroundActive
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200 disabled:opacity-40'
                }`}
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                type="button"
                title={
                  manualAiLocked
                    ? 'Random turns are off in manual override'
                    : 'Random turns'
                }
                disabled={filteredSelection.size === 0 || !roomCode || manualAiLocked}
                onClick={() => onToggleAttribute('randomTurning')}
                className={`flex-1 p-2 rounded-lg transition-colors flex items-center justify-center ${
                  isRandomTurnActive
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200 disabled:opacity-40'
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
              manualAiLocked
                ? 'Destination routing is off in manual override'
                : isThisPendingRoute
                  ? 'Click a road tile to set destination (toggle off to clear)'
                  : selectedHaveDestination
                    ? 'Clear destinations for selected vehicles'
                    : 'Set destination for selected vehicles'
            }
            disabled={filteredSelection.size === 0 || !roomCode || manualAiLocked}
            onClick={onToggleDestination}
            className={`flex-1 p-2 rounded-lg transition-colors flex items-center justify-center ${
              isDestinationToggleActive
                ? isThisPendingRoute
                  ? 'bg-red-600 text-white shadow-sm animate-pulse'
                  : 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200 disabled:opacity-40'
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

export type FloatingDrivePanelState = {
  vehicleId: string;
  x: number;
  y: number;
  zIndex: number;
};

function formatControllerLabel(uid: string | undefined): string {
  if (!uid) return '???';
  return uid.length > 10 ? uid.slice(0, 10) : uid;
}

function PeopleIconBtn({
  title,
  disabled,
  onClick,
  active,
  className,
  testId,
  children,
}: {
  title: string;
  disabled?: boolean;
  onClick: () => void;
  active?: boolean;
  className: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      className={`w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-white disabled:opacity-35 disabled:pointer-events-none ${className} ${
        active ? 'animate-pulse ring-2 ring-white/70' : 'hover:brightness-110'
      }`}
    >
      {children}
    </button>
  );
}

function TowHookToggle({
  tow,
  vehicles,
  grid,
  roomCode,
  onToggle,
}: {
  tow: Vehicle;
  vehicles: Record<string, Vehicle>;
  grid: GridData;
  roomCode: string | null;
  onToggle: () => void;
}) {
  const hooked = tow.towedVehicleId ? vehicles[tow.towedVehicleId] : undefined;
  const connected = !!hooked;
  const target = connected ? hooked : findTowTargetBehind(tow, vehicles, grid);
  const targetLabel = target
    ? `${(target.type || 'car').replace(/-/g, ' ')} ${target.id.slice(0, 10)}`
    : null;

  return (
    <div
      className={`flex items-center justify-between gap-3 px-2 py-1.5 rounded-lg border ${
        connected
          ? 'border-amber-300 bg-amber-50'
          : target
            ? 'border-slate-200 bg-white'
            : 'border-slate-100 bg-slate-50'
      }`}
      data-testid="tow-hook-toggle"
    >
      <div className="flex items-center gap-2 min-w-0">
        {connected ? (
          <Unlink className="w-4 h-4 shrink-0 text-amber-700" />
        ) : (
          <Link2 className="w-4 h-4 shrink-0 text-slate-500" />
        )}
        <div className="min-w-0">
          <div className="text-xs font-semibold text-slate-700">Tow hook</div>
          <div className="text-[10px] text-slate-500 truncate">
            {connected
              ? `Towing ${targetLabel}`
              : target
                ? `Vehicle behind: ${targetLabel}`
                : 'No vehicle within ½ tile behind'}
          </div>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={connected}
        data-testid="tow-hook-switch"
        title={
          connected
            ? 'Disconnect hooked vehicle'
            : target
              ? 'Connect to vehicle behind'
              : 'Need a vehicle within ½ tile behind the tow truck'
        }
        disabled={!roomCode || (!connected && !target)}
        onClick={onToggle}
        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-40 ${
          connected ? 'bg-amber-500' : 'bg-slate-300'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            connected ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

function FloatingVehicleDrivePanel({
  vehicleId,
  vehicle,
  people,
  localUserUid,
  position,
  zIndex,
  isActive,
  roomCode,
  controlsLockedByOther,
  pendingRouteVehicleId,
  isPlacingVehicles,
  pendingHomeAssign,
  grid,
  vehiclesMap,
  traffic,
  onActivate,
  onClose,
  onMove,
  onSpeedChange,
  onToggleAttribute,
  onDistribute,
  onToggleDestination,
  onPark,
  onUnpark,
  onTogglePlacing,
  onToggleEmergencyLights,
  onToggleHomeAssign,
  onAssignRandomHomes,
  onClearHomes,
  onChangeTrailers,
  onToggleManualOverride,
  onToggleTowHook,
  onAssignDriver,
  onAssignPassenger,
  onAssignOwnerPerson,
  onClearOwner,
}: {
  vehicleId: string;
  vehicle: Vehicle | undefined;
  people?: Record<string, Person>;
  /** Local anonymous user uid — used to show who holds manual override */
  localUserUid?: string | null;
  position: Point;
  zIndex: number;
  isActive: boolean;
  roomCode: string | null;
  /** True when another multiplayer user holds manual override on this vehicle */
  controlsLockedByOther?: boolean;
  pendingRouteVehicleId: string | null;
  isPlacingVehicles: boolean;
  pendingHomeAssign: boolean;
  /** Full city grid + fleet for driver 3D view */
  grid: GridData;
  vehiclesMap: Record<string, Vehicle>;
  traffic?: TrafficState;
  onActivate: () => void;
  onClose: () => void;
  onMove: (pos: Point) => void;
  onSpeedChange: (speed: number) => void;
  onToggleAttribute: (attr: 'isMoving' | 'turnAroundAtDeadEnd' | 'randomTurning') => void;
  onDistribute: () => void;
  onToggleDestination: () => void;
  onPark: () => void;
  onUnpark: () => void;
  onTogglePlacing: () => void;
  onToggleEmergencyLights?: () => void;
  onToggleHomeAssign?: () => void;
  onAssignRandomHomes?: () => void;
  onClearHomes?: () => void;
  onChangeTrailers?: (delta: number) => void;
  onToggleManualOverride: (enabled: boolean) => void;
  onToggleTowHook?: () => void;
  /** Assign / clear person as driver (null clears) */
  onAssignDriver?: (personId: string | null) => void;
  /** Board or remove passenger */
  onAssignPassenger?: (personId: string, board: boolean) => void;
  /** Set owner house from a person's homeKey */
  onAssignOwnerPerson?: (personId: string) => void;
  onClearOwner?: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  /** Local window position — only committed to parent on drag/resize end (desktop-style). */
  const [localPos, setLocalPos] = useState<Point>(position);
  const localPosRef = useRef(position);
  const [size, setSize] = useState<PanelSize | null>(null);
  const sizeRef = useRef<PanelSize | null>(null);
  const onMoveRef = useRef(onMove);
  const onActivateRef = useRef(onActivate);
  const dragSessionRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const resizeSessionRef = useRef<ResizeSession | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  // Sync from parent only when not actively dragging/resizing (spawn / external layout).
  useEffect(() => {
    if (dragSessionRef.current || resizeSessionRef.current) return;
    localPosRef.current = position;
    setLocalPos(position);
  }, [position.x, position.y]);

  useEffect(() => {
    onMoveRef.current = onMove;
  }, [onMove]);
  useEffect(() => {
    onActivateRef.current = onActivate;
  }, [onActivate]);

  const vType = vehicle?.type || 'car';
  const panelType: VehiclePanelType =
    vType === 'train' ? 'train'
      : vType === 'semi' ? 'semi'
        : isServiceVehicleType(vType) ? 'service'
          : 'car';
  const isCarLike = panelType === 'car' || panelType === 'service';
  const showLights = panelType === 'service' && hasEmergencyLights(vType);
  const selection = React.useMemo(() => new Set([vehicleId]), [vehicleId]);

  const peopleMap = people || {};
  const hasPeople = Object.keys(peopleMap).length > 0;
  const driverId = vehicle
    ? vehicle.driverId || getDriverId(peopleMap, vehicleId)
    : null;
  const passengerIds = vehicle
    ? (vehicle.passengerIds && vehicle.passengerIds.length > 0
        ? vehicle.passengerIds
        : getPassengerIds(peopleMap, vehicleId))
    : [];
  const driver = driverId ? peopleMap[driverId] : undefined;
  const passengers = passengerIds
    .map(id => peopleMap[id])
    .filter((p): p is Person => !!p);
  const owners = vehicle?.homeKey
    ? peopleResidingAt(peopleMap, vehicle.homeKey).sort((a, b) =>
        personDisplayName(a).localeCompare(personDisplayName(b)),
      )
    : [];
  const maxPax = vehicle
    ? vehicle.maxPassengers ?? getMaxPassengers(vehicle.type)
    : 0;

  const [houseMenuOpen, setHouseMenuOpen] = useState(false);
  const houseMenuRef = useRef<HTMLDivElement>(null);
  /** Inline people assigner: driver | passenger | owner */
  const [peoplePick, setPeoplePick] = useState<null | 'driver' | 'passenger' | 'owner'>(null);
  const [peoplePickFilter, setPeoplePickFilter] = useState('');
  const peoplePickRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!houseMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (houseMenuRef.current && !houseMenuRef.current.contains(e.target as Node)) {
        setHouseMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [houseMenuOpen]);

  useEffect(() => {
    if (!peoplePick) return;
    const onDoc = (e: MouseEvent) => {
      if (peoplePickRef.current && !peoplePickRef.current.contains(e.target as Node)) {
        setPeoplePick(null);
        setPeoplePickFilter('');
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [peoplePick]);

  const allPeopleList = React.useMemo(() => {
    const list = Object.values(peopleMap);
    list.sort((a, b) => personDisplayName(a).localeCompare(personDisplayName(b)));
    return list;
  }, [peopleMap]);

  const filteredPeopleForPick = React.useMemo(() => {
    const q = peoplePickFilter.trim().toLowerCase();
    return allPeopleList.filter(p => {
      if (peoplePick === 'driver' && !isAdult(p)) return false;
      if (peoplePick === 'driver' && vehicle?.type === 'taxi') return false;
      if (!q) return true;
      return (
        personDisplayName(p).toLowerCase().includes(q) ||
        p.homeKey.toLowerCase().includes(q) ||
        (p.workplaceKey || '').toLowerCase().includes(q)
      );
    });
  }, [allPeopleList, peoplePickFilter, peoplePick, vehicle?.type]);

  const controllerUid = vehicle?.manualOverride
    ? vehicle.manualOverrideByUid
    : undefined;
  const isControlledByOther =
    !!controlsLockedByOther ||
    (!!vehicle?.manualOverride &&
      !!controllerUid &&
      !!localUserUid &&
      controllerUid !== localUserUid);
  const isControlledByMe =
    !!vehicle?.manualOverride &&
    !!controllerUid &&
    !!localUserUid &&
    controllerUid === localUserUid;
  const canToggleOverride =
    !!roomCode &&
    !isControlledByOther &&
    (!vehicle?.manualOverride || isControlledByMe || !controllerUid);
  // Disable motion / placement controls when another user holds override
  const effectiveRoomCode = isControlledByOther ? null : roomCode;

  const clampPos = useCallback((x: number, y: number): Point => {
    const w = sizeRef.current?.w ?? panelRef.current?.offsetWidth ?? 280;
    const h = sizeRef.current?.h ?? panelRef.current?.offsetHeight ?? 200;
    const maxX = Math.max(0, window.innerWidth - w);
    const maxY = Math.max(0, window.innerHeight - h);
    return {
      x: Math.max(0, Math.min(maxX, x)),
      y: Math.max(0, Math.min(maxY, y)),
    };
  }, []);

  const endDragSession = useCallback((el?: HTMLElement | null, pointerId?: number) => {
    const session = dragSessionRef.current;
    if (!session) return;
    if (pointerId !== undefined && session.pointerId !== pointerId) return;
    dragSessionRef.current = null;
    setIsDragging(false);
    if (el && pointerId !== undefined) {
      try {
        if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
      } catch {
        // ignore
      }
    }
    // Commit final position to parent once
    onMoveRef.current(localPosRef.current);
  }, []);

  const endResizeSession = useCallback((el?: HTMLElement | null, pointerId?: number) => {
    const session = resizeSessionRef.current;
    if (!session) return;
    if (pointerId !== undefined && session.pointerId !== pointerId) return;
    resizeSessionRef.current = null;
    setIsResizing(false);
    if (el && pointerId !== undefined) {
      try {
        if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
      } catch {
        // ignore
      }
    }
    // Position may change when resizing from n/w edges
    onMoveRef.current(localPosRef.current);
  }, []);

  /**
   * Drag is handled entirely on the title bar with setPointerCapture.
   * Window listeners are unreliable here because the panel uses stopPropagation
   * on pointer events (to block the grid), which prevents mouseup from reaching window.
   */
  const handleHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (resizeSessionRef.current) return;
    // Close button stops propagation before reaching here
    e.stopPropagation();
    e.preventDefault();
    onActivateRef.current();
    dragSessionRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originX: localPosRef.current.x,
      originY: localPosRef.current.y,
      moved: false,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // still handle move/up on this element
    }
  };

  const handleHeaderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const session = dragSessionRef.current;
    if (!session || e.pointerId !== session.pointerId) return;
    // Only drag while we own the pointer (or session is active)
    const dx = e.clientX - session.startClientX;
    const dy = e.clientY - session.startClientY;
    // Click threshold: select without moving until the pointer travels a few px
    if (!session.moved && dx * dx + dy * dy < 16) return;
    if (!session.moved) {
      session.moved = true;
      setIsDragging(true);
    }
    e.preventDefault();
    e.stopPropagation();
    const next = clampPos(session.originX + dx, session.originY + dy);
    localPosRef.current = next;
    setLocalPos(next);
  };

  const handleHeaderPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragSessionRef.current || dragSessionRef.current.pointerId !== e.pointerId) return;
    e.stopPropagation();
    endDragSession(e.currentTarget, e.pointerId);
  };

  const handleHeaderPointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragSessionRef.current || dragSessionRef.current.pointerId !== e.pointerId) return;
    e.stopPropagation();
    endDragSession(e.currentTarget, e.pointerId);
  };

  const handleHeaderLostPointerCapture = (e: React.PointerEvent<HTMLDivElement>) => {
    // Browser / OS can revoke capture; always end cleanly
    if (!dragSessionRef.current || dragSessionRef.current.pointerId !== e.pointerId) return;
    endDragSession(null, e.pointerId);
  };

  const handleResizePointerDown = (edge: ResizeEdge, e: React.PointerEvent<HTMLDivElement>) => {
    if (dragSessionRef.current) {
      endDragSession(headerRef.current, dragSessionRef.current.pointerId);
    }
    onActivateRef.current();
    const el = panelRef.current;
    const w = sizeRef.current?.w ?? el?.offsetWidth ?? 320;
    const h = sizeRef.current?.h ?? el?.offsetHeight ?? 240;
    resizeSessionRef.current = {
      pointerId: e.pointerId,
      edge,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originX: localPosRef.current.x,
      originY: localPosRef.current.y,
      originW: w,
      originH: h,
    };
    setIsResizing(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handleResizePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const session = resizeSessionRef.current;
    if (!session || e.pointerId !== session.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    const next = computePanelResize(session, e.clientX, e.clientY);
    localPosRef.current = next.pos;
    sizeRef.current = next.size;
    setLocalPos(next.pos);
    setSize(next.size);
  };

  const handleResizePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeSessionRef.current || resizeSessionRef.current.pointerId !== e.pointerId) return;
    e.stopPropagation();
    endResizeSession(e.currentTarget, e.pointerId);
  };

  const accent =
    panelType === 'train' ? 'emerald'
      : panelType === 'semi' ? 'amber'
        : panelType === 'service' ? 'orange'
          : 'indigo';

  const accentBorder = {
    indigo: 'border-indigo-400 ring-indigo-300',
    amber: 'border-amber-400 ring-amber-300',
    emerald: 'border-emerald-400 ring-emerald-300',
    orange: 'border-orange-400 ring-orange-300',
  }[accent];

  const accentHeader = {
    indigo: 'bg-indigo-600',
    amber: 'bg-amber-600',
    emerald: 'bg-emerald-600',
    orange: 'bg-orange-600',
  }[accent];

  if (!vehicle) return null;

  return (
    <div
      ref={panelRef}
      className={`fixed ${size ? '' : 'w-[20rem]'} bg-white/98 backdrop-blur-md rounded-2xl shadow-2xl border-2 flex flex-col overflow-hidden pointer-events-auto transition-shadow ${
        isActive
          ? `${accentBorder} ring-2 shadow-xl`
          : 'border-slate-200 opacity-95'
      } ${isResizing ? 'select-none' : ''}`}
      style={{
        left: localPos.x,
        top: localPos.y,
        zIndex: isActive ? Math.max(zIndex, 160) : zIndex,
        ...(size ? { width: size.w, height: size.h } : null),
      }}
      data-grid-control
      onWheel={stopGridWheel}
      onContextMenu={stopGridPropagation}
      onClick={stopGridPropagation}
      onDoubleClick={stopGridPropagation}
      onMouseDown={(e) => {
        stopGridPropagation(e);
        onActivateRef.current();
      }}
      onMouseUp={stopGridPropagation}
      onMouseMove={stopGridPropagation}
      onPointerDown={(e) => {
        // Title bar manages its own pointerdown + capture drag
        if ((e.target as HTMLElement).closest('[data-drive-panel-title]')) return;
        if ((e.target as HTMLElement).closest('[data-resize-handle]')) return;
        stopGridPropagation(e);
        if ((e.target as HTMLElement).closest('[data-camera-joystick]')) return;
        onActivateRef.current();
      }}
      // stop bubble to grid; title-bar handlers still run first (event target)
      onPointerUp={stopGridPropagation}
      onPointerMove={stopGridPropagation}
    >
      <PanelResizeHandles
        onPointerDown={handleResizePointerDown}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerUp}
        onLostPointerCapture={(e) => endResizeSession(null, e.pointerId)}
      />
      <div
        ref={headerRef}
        data-drive-panel-title
        className={`shrink-0 px-3 py-2 ${accentHeader} text-white flex items-center gap-2 select-none touch-none ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        onPointerDown={handleHeaderPointerDown}
        onPointerMove={handleHeaderPointerMove}
        onPointerUp={handleHeaderPointerUp}
        onPointerCancel={handleHeaderPointerCancel}
        onLostPointerCapture={handleHeaderLostPointerCapture}
      >
        <GripHorizontal className="w-4 h-4 opacity-80 shrink-0 pointer-events-none" />
        <div className="min-w-0 flex-1 pointer-events-none">
          <div className="flex items-start gap-1.5 min-w-0">
            <span
              className="w-2.5 h-2.5 rounded-full border border-white/70 shrink-0 mt-0.5"
              style={{ backgroundColor: vehicle.color }}
            />
            <span
              className="text-xs font-bold break-all leading-tight min-w-0"
              title={vehicleId}
              data-testid="drive-panel-title"
            >
              Drive · {vehicleId}
            </span>
          </div>
          <div className="text-[10px] text-white/80 capitalize truncate flex items-center gap-1">
            <VehicleTypeIcon type={vehicle.type} />
            {(vehicle.type || 'car').replace(/-/g, ' ')}
            {vehicle.destination ? ` · →${vehicle.destination.x},${vehicle.destination.y}` : ''}
          </div>
        </div>
        {vehicle.manualOverride && (
          <span
            className="text-[9px] font-bold uppercase tracking-wide bg-violet-900/50 text-violet-100 px-1.5 py-0.5 rounded shrink-0 pointer-events-none"
            title={
              controllerUid
                ? `Manual override — USER: ${formatControllerLabel(controllerUid)}`
                : 'Manual override on'
            }
          >
            Manual
          </span>
        )}
        {isActive && (
          <span className="text-[9px] font-bold uppercase tracking-wide bg-white/20 px-1.5 py-0.5 rounded shrink-0 pointer-events-none">
            Active
          </span>
        )}
        <button
          type="button"
          title="Close drive panel"
          onPointerDown={e => {
            e.stopPropagation();
            // Abort any pending drag if user hits close mid-gesture
            if (dragSessionRef.current) {
              endDragSession(headerRef.current, dragSessionRef.current.pointerId);
            }
          }}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="p-1 rounded-lg hover:bg-white/20 transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {vehicle.manualOverride && controllerUid && (
        <div
          className={`px-3 py-1.5 text-[10px] font-semibold border-b ${
            isControlledByOther
              ? 'bg-amber-500 text-amber-950 border-amber-600'
              : 'bg-violet-700 text-violet-50 border-violet-800'
          }`}
        >
          {isControlledByOther
            ? `USER: ${formatControllerLabel(controllerUid)} is controlling this vehicle`
            : isControlledByMe
              ? `You are controlling this vehicle (USER: ${formatControllerLabel(controllerUid)})`
              : `USER: ${formatControllerLabel(controllerUid)} is controlling this vehicle`}
        </div>
      )}

      {isActive && !isControlledByOther && (
        <div className="px-3 py-1 bg-slate-900/90 text-[9px] text-slate-200 font-medium tracking-wide border-b border-slate-700/50">
          Keys → this vehicle: G go · S stop · F/B step · L/R turn · U u-turn · ↑↓ speed · ←→ lane
        </div>
      )}
      {isActive && isControlledByOther && (
        <div className="px-3 py-1 bg-slate-800/90 text-[9px] text-amber-200 font-medium tracking-wide border-b border-slate-700/50">
          Keys disabled — another user has manual override
        </div>
      )}

      <div
        className={`p-3 flex flex-col gap-2 overflow-y-auto overscroll-contain ${
          size ? 'flex-1 min-h-0' : 'max-h-[min(75vh,560px)]'
        }`}
      >
        {/* Driver-perspective 3D city view (read-only; keys/buttons still control the vehicle) */}
        <DriverView3D
          vehicle={vehicle}
          vehicleId={vehicleId}
          grid={grid}
          vehicles={vehiclesMap}
          traffic={traffic}
          people={people}
          width={296}
          height={168}
        />

        {/* Occupancy & ownership — click rows to assign from existing people */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 space-y-1.5 relative" ref={peoplePickRef}>
          <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">
            People
          </div>
          <div className="grid grid-cols-[3.25rem_1fr] gap-x-1.5 gap-y-1 text-[10px] leading-snug">
            <span className="text-slate-500 font-semibold self-center">Driver</span>
            <button
              type="button"
              disabled={!hasPeople || !effectiveRoomCode || vehicle?.type === 'taxi'}
              onClick={() => {
                onActivate();
                setPeoplePick(p => (p === 'driver' ? null : 'driver'));
                setPeoplePickFilter('');
              }}
              title={
                vehicle?.type === 'taxi'
                  ? 'Robotaxis have no human driver'
                  : 'Click to assign driver from people'
              }
              className={`text-left truncate rounded-md px-1.5 py-0.5 border transition-colors disabled:opacity-50 ${
                peoplePick === 'driver'
                  ? 'bg-indigo-100 border-indigo-300 text-indigo-900'
                  : driver
                    ? 'bg-white border-slate-200 text-slate-800 font-medium hover:border-indigo-300'
                    : 'bg-white border-dashed border-slate-300 text-slate-400 italic hover:border-indigo-300'
              }`}
            >
              {hasPeople
                ? driver
                  ? `${personDisplayName(driver)}${driver.ageYears != null ? ` · ${formatAge(driver.ageYears)}` : ''}`
                  : 'Click to assign…'
                : vehicle?.driverId
                  ? vehicle.driverId.slice(0, 8)
                  : '—'}
            </button>

            <span className="text-slate-500 font-semibold self-center">Riding</span>
            <button
              type="button"
              disabled={!hasPeople || !effectiveRoomCode || maxPax <= 0}
              onClick={() => {
                onActivate();
                setPeoplePick(p => (p === 'passenger' ? null : 'passenger'));
                setPeoplePickFilter('');
              }}
              title="Click to add/remove riders from people"
              className={`text-left truncate rounded-md px-1.5 py-0.5 border transition-colors disabled:opacity-50 ${
                peoplePick === 'passenger'
                  ? 'bg-sky-100 border-sky-300 text-sky-900'
                  : passengers.length
                    ? 'bg-white border-slate-200 text-slate-800 hover:border-sky-300'
                    : 'bg-white border-dashed border-slate-300 text-slate-400 italic hover:border-sky-300'
              }`}
            >
              {hasPeople
                ? passengers.length > 0
                  ? `${passengers.map(p => personDisplayName(p)).join(', ')} (${passengers.length}/${maxPax})`
                  : `Click to assign… (0/${maxPax})`
                : (vehicle?.passengerIds?.length
                    ? `${vehicle.passengerIds.length} passenger(s)`
                    : '—')}
            </button>

            <span className="text-slate-500 font-semibold self-center">Owner</span>
            <button
              type="button"
              disabled={!hasPeople || !effectiveRoomCode || !isCarLike}
              onClick={() => {
                onActivate();
                setPeoplePick(p => (p === 'owner' ? null : 'owner'));
                setPeoplePickFilter('');
              }}
              title={
                isCarLike
                  ? 'Click to set owner house from a person\'s home'
                  : 'Owner home is for cars/service vehicles'
              }
              className={`text-left min-w-0 rounded-md px-1.5 py-0.5 border transition-colors disabled:opacity-50 ${
                peoplePick === 'owner'
                  ? 'bg-rose-100 border-rose-300 text-rose-900'
                  : vehicle?.homeKey
                    ? 'bg-white border-slate-200 text-slate-800 hover:border-rose-300'
                    : 'bg-white border-dashed border-slate-300 text-slate-400 italic hover:border-rose-300'
              }`}
            >
              {vehicle?.homeKey ? (
                <span className="flex flex-col gap-0.5">
                  <span className="font-mono text-rose-600 text-[9px]" title={vehicle.homeKey}>
                    🏠 {vehicle.homeKey}
                  </span>
                  {hasPeople && (
                    <span className="truncate" title={owners.map(p => personDisplayName(p)).join(', ')}>
                      {owners.length > 0
                        ? owners.map(p => personDisplayName(p)).join(', ')
                        : 'No residents at this house'}
                    </span>
                  )}
                </span>
              ) : (
                'Click to assign…'
              )}
            </button>
          </div>

          {peoplePick && hasPeople && (
            <div className="mt-1 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
              <div className="px-2 py-1.5 border-b border-slate-100 flex items-center gap-2">
                <input
                  type="search"
                  autoFocus
                  value={peoplePickFilter}
                  onChange={e => setPeoplePickFilter(e.target.value)}
                  placeholder={
                    peoplePick === 'driver'
                      ? 'Search adults…'
                      : peoplePick === 'passenger'
                        ? 'Search people…'
                        : 'Search people (use their home)…'
                  }
                  className="flex-1 min-w-0 text-[10px] px-1.5 py-1 rounded-md border border-slate-200 outline-none focus:border-indigo-400"
                  onClick={e => e.stopPropagation()}
                />
                <button
                  type="button"
                  className="text-[10px] font-semibold text-slate-500 hover:text-slate-800 shrink-0"
                  onClick={() => {
                    setPeoplePick(null);
                    setPeoplePickFilter('');
                  }}
                >
                  Close
                </button>
              </div>
              <div className="max-h-36 overflow-y-auto overscroll-contain">
                {peoplePick === 'driver' && onAssignDriver && driver && (
                  <button
                    type="button"
                    className="w-full px-2 py-1.5 text-left text-[10px] font-semibold text-rose-700 hover:bg-rose-50 border-b border-slate-50"
                    onClick={() => {
                      onAssignDriver(null);
                      setPeoplePick(null);
                      setPeoplePickFilter('');
                    }}
                  >
                    Clear driver (send home)
                  </button>
                )}
                {peoplePick === 'owner' && onClearOwner && vehicle?.homeKey && (
                  <button
                    type="button"
                    className="w-full px-2 py-1.5 text-left text-[10px] font-semibold text-rose-700 hover:bg-rose-50 border-b border-slate-50"
                    onClick={() => {
                      onClearOwner();
                      setPeoplePick(null);
                      setPeoplePickFilter('');
                    }}
                  >
                    Clear owner home
                  </button>
                )}
                {filteredPeopleForPick.length === 0 && (
                  <div className="px-2 py-3 text-[10px] text-slate-400 text-center">No matching people</div>
                )}
                {filteredPeopleForPick.map(p => {
                  const isDriver = driver?.id === p.id;
                  const isPassenger = passengers.some(x => x.id === p.id);
                  const isOwnerHome = !!vehicle?.homeKey && p.homeKey === vehicle.homeKey;
                  const aboardOther =
                    p.location.kind === 'vehicle' && p.location.vehicleId !== vehicleId;
                  let status = locationLabel(p.location);
                  if (isDriver) status = 'Current driver';
                  else if (isPassenger) status = 'Riding (click to remove)';
                  else if (isOwnerHome && peoplePick === 'owner') status = 'Resident of owner home';
                  else if (aboardOther) status = `In other vehicle`;

                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`w-full px-2 py-1.5 text-left hover:bg-slate-50 border-b border-slate-50 last:border-0 ${
                        isDriver || (peoplePick === 'owner' && isOwnerHome)
                          ? 'bg-indigo-50/60'
                          : isPassenger
                            ? 'bg-sky-50/50'
                            : ''
                      }`}
                      onClick={() => {
                        if (peoplePick === 'driver' && onAssignDriver) {
                          onAssignDriver(isDriver ? null : p.id);
                          setPeoplePick(null);
                          setPeoplePickFilter('');
                        } else if (peoplePick === 'passenger' && onAssignPassenger) {
                          onAssignPassenger(p.id, !isPassenger);
                          // keep open for multi-select passengers
                        } else if (peoplePick === 'owner' && onAssignOwnerPerson) {
                          onAssignOwnerPerson(p.id);
                          setPeoplePick(null);
                          setPeoplePickFilter('');
                        }
                      }}
                    >
                      <div className="text-[10px] font-semibold text-slate-800 truncate">
                        {personDisplayName(p)}
                        <span className="font-normal text-slate-400"> · {formatAge(p.ageYears)}</span>
                        {p.sex === 'm' ? ' ♂' : ' ♀'}
                      </div>
                      <div className="text-[9px] text-slate-500 truncate">
                        🏠 {p.homeKey}
                        {p.workplaceKey ? ` · 👷 ${p.workplaceKey}` : ''}
                        {' · '}
                        {status}
                      </div>
                    </button>
                  );
                })}
              </div>
              {peoplePick === 'passenger' && (
                <div className="px-2 py-1 border-t border-slate-100 text-[9px] text-slate-400">
                  Click a person to board/remove · {passengers.length}/{maxPax} seats
                </div>
              )}
            </div>
          )}

          {hasPeople && !driver && vehicle?.type !== 'taxi' && (
            <div className="text-[9px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-1.5 py-1">
              No driver — click <span className="font-semibold">Driver</span> to assign someone
            </div>
          )}
        </div>

        {/* Compact: manual override + owner house */}
        <div className="flex items-center gap-2">
          <label
            className={`flex items-center gap-1.5 rounded-xl border px-2 py-1.5 select-none transition-colors ${
              vehicle.manualOverride
                ? isControlledByOther
                  ? 'bg-amber-50 border-amber-300'
                  : 'bg-violet-50 border-violet-300'
                : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
            } ${!canToggleOverride ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
            title={
              isControlledByOther
                ? `USER: ${formatControllerLabel(controllerUid)} holds manual override`
                : isControlledByMe
                  ? 'Manual override on — you control this vehicle'
                  : 'Manual override — only your direct controls'
            }
          >
            <ShipWheel
              className={`w-4 h-4 shrink-0 ${
                vehicle.manualOverride
                  ? isControlledByOther
                    ? 'text-amber-700'
                    : 'text-violet-700'
                  : 'text-slate-500'
              }`}
            />
            <input
              type="checkbox"
              className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
              checked={!!vehicle.manualOverride}
              disabled={!canToggleOverride}
              onChange={(e) => {
                if (!canToggleOverride) return;
                onToggleManualOverride(e.target.checked);
              }}
            />
          </label>

          {isCarLike && onToggleHomeAssign && onClearHomes && (
            <div className="relative flex-1 min-w-0" ref={houseMenuRef}>
              <button
                type="button"
                disabled={!effectiveRoomCode}
                onClick={() => setHouseMenuOpen(o => !o)}
                className={`w-full flex items-center gap-1.5 rounded-xl border px-2 py-1.5 text-left transition-colors disabled:opacity-40 ${
                  pendingHomeAssign && isActive
                    ? 'bg-rose-600 border-rose-600 text-white animate-pulse'
                    : vehicle.homeKey
                      ? 'bg-rose-50 border-rose-200 text-rose-800 hover:bg-rose-100'
                      : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                }`}
                title={
                  pendingHomeAssign && isActive
                    ? 'Click a Home tile on the map…'
                    : vehicle.homeKey
                      ? `Owner house ${vehicle.homeKey}`
                      : 'No owner house assigned'
                }
              >
                <Home className="w-4 h-4 shrink-0" />
                <span className="font-mono text-[10px] font-semibold truncate">
                  {pendingHomeAssign && isActive
                    ? 'Click home…'
                    : vehicle.homeKey || '—'}
                </span>
              </button>
              {houseMenuOpen && (
                <div className="absolute left-0 right-0 top-full mt-1 z-20 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden py-0.5">
                  <button
                    type="button"
                    className="w-full px-3 py-1.5 text-left text-[11px] font-semibold text-rose-700 hover:bg-rose-50"
                    onClick={() => {
                      setHouseMenuOpen(false);
                      onToggleHomeAssign();
                    }}
                  >
                    {pendingHomeAssign && isActive ? 'Cancel assign' : 'Assign home…'}
                  </button>
                  {onAssignRandomHomes && (
                    <button
                      type="button"
                      className="w-full px-3 py-1.5 text-left text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50"
                      onClick={() => {
                        setHouseMenuOpen(false);
                        onAssignRandomHomes();
                      }}
                    >
                      Random home
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={!vehicle.homeKey}
                    className="w-full px-3 py-1.5 text-left text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                    onClick={() => {
                      setHouseMenuOpen(false);
                      onClearHomes();
                    }}
                  >
                    Clear home
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {panelType === 'service' && vehicle.type === 'tow-truck' && onToggleTowHook && (
          <TowHookToggle
            tow={vehicle}
            vehicles={vehiclesMap}
            grid={grid}
            roomCode={effectiveRoomCode}
            onToggle={() => {
              onActivate();
              onToggleTowHook();
            }}
          />
        )}

        {panelType === 'semi' && onChangeTrailers && (
          <div className="flex items-center justify-between gap-2 bg-amber-50 border border-amber-100 rounded-xl px-2 py-1.5">
            <span className="text-[10px] font-semibold text-amber-800">
              Trailers ({getSemiTrailerCount(vehicle)}/2)
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={!effectiveRoomCode}
                onClick={() => onChangeTrailers(-1)}
                className="w-7 h-7 flex justify-center items-center rounded-lg bg-white border border-amber-200 text-slate-700 font-bold hover:bg-amber-100 disabled:opacity-40"
              >
                −
              </button>
              <button
                type="button"
                disabled={!effectiveRoomCode}
                onClick={() => onChangeTrailers(1)}
                className="w-7 h-7 flex justify-center items-center rounded-lg bg-white border border-amber-200 text-slate-700 font-bold hover:bg-amber-100 disabled:opacity-40"
              >
                +
              </button>
            </div>
          </div>
        )}

        <VehicleMotionControls
          panelType={panelType}
          filteredSelection={selection}
          vehicles={vehicle ? { [vehicleId]: vehicle } : {}}
          roomCode={effectiveRoomCode}
          pendingRouteVehicleId={isActive ? pendingRouteVehicleId : null}
          isPlacingVehicles={isActive && isPlacingVehicles}
          onSpeedChange={onSpeedChange}
          onToggleAttribute={onToggleAttribute}
          onDistribute={onDistribute}
          onToggleDestination={onToggleDestination}
          onPark={onPark}
          onUnpark={onUnpark}
          onTogglePlacing={onTogglePlacing}
          onToggleEmergencyLights={showLights ? onToggleEmergencyLights : undefined}
          showLightsToggle={showLights}
          showParkControls={panelType !== 'train'}
          showTurnControls
        />
      </div>
    </div>
  );
}

function TravelPreferenceSwitch({
  value,
  disabled,
  name,
  onChange,
}: {
  value: TravelPreference | undefined;
  disabled?: boolean;
  name: string;
  onChange: (pref: TravelPreference) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Travel preference"
      className="flex flex-wrap gap-1"
      data-testid="travel-preference"
    >
      {TRAVEL_PREFERENCE_OPTIONS.map(opt => {
        const on = value === opt.id;
        return (
          <label
            key={opt.id}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-bold cursor-pointer ${
              on
                ? 'bg-violet-600 text-white border-violet-700'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-violet-50'
            } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            <input
              type="radio"
              name={name}
              className="sr-only"
              checked={on}
              disabled={disabled}
              data-testid={`travel-pref-${opt.id}`}
              onChange={() => {
                if (!disabled) onChange(opt.id);
              }}
            />
            {opt.label}
          </label>
        );
      })}
    </div>
  );
}

export type FloatingPersonPanelState = {
  personId: string;
  x: number;
  y: number;
  zIndex: number;
};

/**
 * Floating person control panel (like vehicle drive panels):
 * 3D eye-level view + info + travel / board / home actions.
 */
function FloatingPersonControlPanel({
  personId,
  person,
  people,
  position,
  zIndex,
  isActive,
  roomCode,
  grid,
  vehiclesMap,
  traffic,
  selectedVehicleId,
  onActivate,
  onClose,
  onMove,
  onSendHome,
  onGoToWork,
  onGoShop,
  onLeaveVehicle,
  onBoardDriver,
  onBoardPassenger,
  onEnterNearbyBuilding,
  onAssignWorkplace,
  onFocusOnMap,
  onTravelPreference,
}: {
  personId: string;
  person: Person | undefined;
  people?: Record<string, Person>;
  position: Point;
  zIndex: number;
  isActive: boolean;
  roomCode: string | null;
  grid: GridData;
  vehiclesMap: Record<string, Vehicle>;
  traffic?: TrafficState;
  selectedVehicleId?: string | null;
  onActivate: () => void;
  onClose: () => void;
  onMove: (pos: Point) => void;
  onSendHome: () => void;
  onGoToWork: () => void;
  onGoShop: () => void;
  onLeaveVehicle: () => void;
  onBoardDriver: () => void;
  onBoardPassenger: () => void;
  onEnterNearbyBuilding: () => void;
  onAssignWorkplace: () => void;
  onFocusOnMap: () => void;
  onTravelPreference: (pref: TravelPreference) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [localPos, setLocalPos] = useState<Point>(position);
  const localPosRef = useRef(position);
  const [size, setSize] = useState<PanelSize | null>(null);
  const sizeRef = useRef<PanelSize | null>(null);
  const onMoveRef = useRef(onMove);
  const onActivateRef = useRef(onActivate);
  const dragSessionRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const resizeSessionRef = useRef<ResizeSession | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    if (dragSessionRef.current || resizeSessionRef.current) return;
    localPosRef.current = position;
    setLocalPos(position);
  }, [position.x, position.y]);
  useEffect(() => {
    onMoveRef.current = onMove;
  }, [onMove]);
  useEffect(() => {
    onActivateRef.current = onActivate;
  }, [onActivate]);

  const clampPos = useCallback((x: number, y: number): Point => {
    const w = sizeRef.current?.w ?? panelRef.current?.offsetWidth ?? 280;
    const h = sizeRef.current?.h ?? panelRef.current?.offsetHeight ?? 200;
    const maxX = Math.max(0, window.innerWidth - w);
    const maxY = Math.max(0, window.innerHeight - h);
    return {
      x: Math.max(0, Math.min(maxX, x)),
      y: Math.max(0, Math.min(maxY, y)),
    };
  }, []);

  const endDragSession = useCallback((el?: HTMLElement | null, pointerId?: number) => {
    const session = dragSessionRef.current;
    if (!session) return;
    if (pointerId !== undefined && session.pointerId !== pointerId) return;
    dragSessionRef.current = null;
    setIsDragging(false);
    if (el && pointerId !== undefined) {
      try {
        if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
      } catch {
        /* ignore */
      }
    }
    onMoveRef.current(localPosRef.current);
  }, []);

  const endResizeSession = useCallback((el?: HTMLElement | null, pointerId?: number) => {
    const session = resizeSessionRef.current;
    if (!session) return;
    if (pointerId !== undefined && session.pointerId !== pointerId) return;
    resizeSessionRef.current = null;
    setIsResizing(false);
    if (el && pointerId !== undefined) {
      try {
        if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
      } catch {
        /* ignore */
      }
    }
    onMoveRef.current(localPosRef.current);
  }, []);

  const handleHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (resizeSessionRef.current) return;
    e.stopPropagation();
    e.preventDefault();
    onActivateRef.current();
    dragSessionRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originX: localPosRef.current.x,
      originY: localPosRef.current.y,
      moved: false,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const handleHeaderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const session = dragSessionRef.current;
    if (!session || e.pointerId !== session.pointerId) return;
    const dx = e.clientX - session.startClientX;
    const dy = e.clientY - session.startClientY;
    if (!session.moved && dx * dx + dy * dy < 16) return;
    if (!session.moved) {
      session.moved = true;
      setIsDragging(true);
    }
    e.preventDefault();
    e.stopPropagation();
    const next = clampPos(session.originX + dx, session.originY + dy);
    localPosRef.current = next;
    setLocalPos(next);
  };

  const handleHeaderPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragSessionRef.current || dragSessionRef.current.pointerId !== e.pointerId) return;
    e.stopPropagation();
    endDragSession(e.currentTarget, e.pointerId);
  };

  const handleResizePointerDown = (edge: ResizeEdge, e: React.PointerEvent<HTMLDivElement>) => {
    if (dragSessionRef.current) {
      endDragSession(headerRef.current, dragSessionRef.current.pointerId);
    }
    onActivateRef.current();
    const el = panelRef.current;
    const w = sizeRef.current?.w ?? el?.offsetWidth ?? 320;
    const h = sizeRef.current?.h ?? el?.offsetHeight ?? 360;
    resizeSessionRef.current = {
      pointerId: e.pointerId,
      edge,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originX: localPosRef.current.x,
      originY: localPosRef.current.y,
      originW: w,
      originH: h,
    };
    setIsResizing(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const handleResizePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const session = resizeSessionRef.current;
    if (!session || e.pointerId !== session.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    const next = computePanelResize(session, e.clientX, e.clientY);
    localPosRef.current = next.pos;
    sizeRef.current = next.size;
    setLocalPos(next.pos);
    setSize(next.size);
  };

  const handleResizePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeSessionRef.current || resizeSessionRef.current.pointerId !== e.pointerId) return;
    e.stopPropagation();
    endResizeSession(e.currentTarget, e.pointerId);
  };

  if (!person) return null;

  const placement = getPersonMapPlacement(person, grid, vehiclesMap, 0);
  // When in a vehicle, use vehicle pose for camera; placement may be hidden
  let viewGx = placement.x;
  let viewGy = placement.y;
  if (person.location.kind === 'vehicle') {
    const v = vehiclesMap[person.location.vehicleId];
    if (v) {
      viewGx = v.x + 0.5;
      viewGy = v.y + 0.5;
    }
  } else if (!placement.visible) {
    const tile = personTileFallback(person);
    viewGx = tile.x + 0.5;
    viewGy = tile.y + 0.72;
  }
  const heading = getPersonFacingHeading(person, grid, vehiclesMap);
  const healthEmoji =
    person.health === 'healthy' ? '💚' : person.health === 'sick' ? '🤒' : '🩹';
  const inVehicle = person.location.kind === 'vehicle';
  const hasWork = !!person.workplaceKey;
  const canBoard = !!selectedVehicleId && !!vehiclesMap[selectedVehicleId || ''];

  return (
    <div
      ref={panelRef}
      className={`fixed ${size ? '' : 'w-[20rem]'} bg-white/98 backdrop-blur-md rounded-2xl shadow-2xl border-2 flex flex-col overflow-hidden pointer-events-auto transition-shadow ${
        isActive
          ? 'border-blue-500 ring-2 ring-blue-300 shadow-xl'
          : 'border-slate-200 opacity-95'
      } ${isResizing ? 'select-none' : ''}`}
      style={{
        left: localPos.x,
        top: localPos.y,
        zIndex: isActive ? Math.max(zIndex, 160) : zIndex,
        ...(size ? { width: size.w, height: size.h } : null),
      }}
      data-grid-control
      onWheel={stopGridWheel}
      onContextMenu={stopGridPropagation}
      onClick={stopGridPropagation}
      onDoubleClick={stopGridPropagation}
      onMouseDown={e => {
        stopGridPropagation(e);
        onActivateRef.current();
      }}
      onMouseUp={stopGridPropagation}
      onMouseMove={stopGridPropagation}
      onPointerDown={e => {
        if ((e.target as HTMLElement).closest('[data-person-panel-title]')) return;
        if ((e.target as HTMLElement).closest('[data-resize-handle]')) return;
        stopGridPropagation(e);
        onActivateRef.current();
      }}
      onPointerUp={stopGridPropagation}
      onPointerMove={stopGridPropagation}
    >
      <PanelResizeHandles
        onPointerDown={handleResizePointerDown}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerUp}
        onLostPointerCapture={e => endResizeSession(null, e.pointerId)}
      />
      <div
        ref={headerRef}
        data-person-panel-title
        className={`shrink-0 px-3 py-2 bg-blue-600 text-white flex items-center gap-2 select-none touch-none ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        onPointerDown={handleHeaderPointerDown}
        onPointerMove={handleHeaderPointerMove}
        onPointerUp={handleHeaderPointerUp}
        onPointerCancel={e => {
          if (!dragSessionRef.current || dragSessionRef.current.pointerId !== e.pointerId) return;
          e.stopPropagation();
          endDragSession(e.currentTarget, e.pointerId);
        }}
        onLostPointerCapture={e => {
          if (!dragSessionRef.current || dragSessionRef.current.pointerId !== e.pointerId) return;
          endDragSession(null, e.pointerId);
        }}
      >
        <GripHorizontal className="w-4 h-4 opacity-80 shrink-0 pointer-events-none" />
        <div className="min-w-0 flex-1 pointer-events-none">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">{person.sex === 'm' ? '♂' : '♀'}</span>
            <span className="text-xs font-bold truncate">
              {personDisplayName(person)}
            </span>
          </div>
          <div className="text-[10px] text-white/80 truncate">
            {formatAge(person.ageYears)} · {person.activity || 'idle'} · {healthEmoji}
          </div>
        </div>
        {isActive && (
          <span className="text-[9px] font-bold uppercase tracking-wide bg-white/20 px-1.5 py-0.5 rounded shrink-0 pointer-events-none">
            Active
          </span>
        )}
        <button
          type="button"
          title="Close person panel"
          onPointerDown={e => {
            e.stopPropagation();
            if (dragSessionRef.current) {
              endDragSession(headerRef.current, dragSessionRef.current.pointerId);
            }
          }}
          onClick={e => {
            e.stopPropagation();
            onClose();
          }}
          className="p-1 rounded-lg hover:bg-white/20 transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div
        className={`p-3 flex flex-col gap-2 overflow-y-auto overscroll-contain ${
          size ? 'flex-1 min-h-0' : 'max-h-[min(75vh,560px)]'
        }`}
      >
        <PersonView3D
          person={person}
          grid={grid}
          vehicles={vehiclesMap}
          traffic={traffic}
          people={people}
          gx={viewGx}
          gy={viewGy}
          heading={heading}
          width={296}
          height={168}
        />

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 space-y-1 text-[10px]">
          <div className="flex justify-between gap-2">
            <span className="text-slate-500 font-semibold">Location</span>
            <span className="font-medium text-slate-800 truncate text-right">
              {locationLabel(person.location)}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-500 font-semibold">Home</span>
            <span className="font-mono text-slate-700">{person.homeKey}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-500 font-semibold">Workplace</span>
            <span className="font-mono text-slate-700">
              {person.workplaceKey || '—'}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-500 font-semibold">Money</span>
            <span className="text-slate-700">
              {typeof person.money === 'number' ? `$${person.money}` : '—'}
            </span>
          </div>
          {person.travelIntent && (
            <div className="flex justify-between gap-2">
              <span className="text-slate-500 font-semibold">Trip</span>
              <span className="text-blue-700 truncate text-right">
                {person.travelIntent.purpose} → {person.travelIntent.destinationKey}
              </span>
            </div>
          )}
          {person.schedule && person.schedule.length > 0 && (
            <div className="pt-1 border-t border-slate-200">
              <div className="text-slate-500 font-semibold mb-0.5">
                Schedule ({person.scheduleMode || 'auto'})
              </div>
              <ul className="space-y-0.5 max-h-16 overflow-y-auto">
                {person.schedule.slice(0, 6).map(e => (
                  <li key={e.id} className="font-mono text-slate-600">
                    {formatScheduleTime(e.startMinute)} {e.label || e.purpose}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">
          Travel
        </div>
        <TravelPreferenceSwitch
          name={`person-travel-${personId}`}
          value={person.travelPreference}
          disabled={!roomCode}
          onChange={pref => {
            onActivate();
            onTravelPreference(pref);
          }}
        />
        <p className="text-[9px] text-slate-400 leading-snug">
          {person.travelPreference
            ? `${travelPreferenceLabel(person.travelPreference)} is used for every trip.`
            : 'Not set — drives their car when they own one, otherwise walks.'}
        </p>
        <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">
          Actions
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            disabled={!roomCode}
            onClick={() => {
              onActivate();
              onSendHome();
            }}
            data-testid="person-go-home"
            className="py-1.5 rounded-lg text-[11px] font-bold bg-rose-600 text-white disabled:opacity-40 hover:bg-rose-700"
          >
            <Home className="w-3 h-3 inline mr-0.5" />
            Go home
          </button>
          <button
            type="button"
            disabled={!roomCode || !hasWork}
            onClick={() => {
              onActivate();
              onGoToWork();
            }}
            data-testid="person-go-to-work"
            className="py-1.5 rounded-lg text-[11px] font-bold bg-emerald-600 text-white disabled:opacity-40 hover:bg-emerald-700"
            title={hasWork ? 'Travel to workplace now' : 'No workplace assigned'}
          >
            <Briefcase className="w-3 h-3 inline mr-0.5" />
            Go to work
          </button>
          <button
            type="button"
            disabled={!roomCode}
            onClick={() => {
              onActivate();
              onGoShop();
            }}
            className="py-1.5 rounded-lg text-[11px] font-bold bg-amber-500 text-white disabled:opacity-40 hover:bg-amber-600"
          >
            Go shopping
          </button>
          <button
            type="button"
            disabled={!roomCode}
            onClick={() => {
              onActivate();
              onAssignWorkplace();
            }}
            className="py-1.5 rounded-lg text-[11px] font-bold bg-violet-600 text-white disabled:opacity-40 hover:bg-violet-700"
          >
            Assign work…
          </button>
          <button
            type="button"
            disabled={!roomCode || !canBoard || inVehicle}
            onClick={() => {
              onActivate();
              onBoardDriver();
            }}
            className="py-1.5 rounded-lg text-[11px] font-bold bg-indigo-600 text-white disabled:opacity-40 hover:bg-indigo-700"
            title="Board selected vehicle as driver"
          >
            Board driver
          </button>
          <button
            type="button"
            disabled={!roomCode || !canBoard || inVehicle}
            onClick={() => {
              onActivate();
              onBoardPassenger();
            }}
            className="py-1.5 rounded-lg text-[11px] font-bold bg-sky-600 text-white disabled:opacity-40 hover:bg-sky-700"
            title="Board selected vehicle as passenger"
          >
            Board rider
          </button>
          <button
            type="button"
            disabled={!roomCode || !inVehicle}
            onClick={() => {
              onActivate();
              onLeaveVehicle();
            }}
            className="py-1.5 rounded-lg text-[11px] font-bold bg-slate-700 text-white disabled:opacity-40 hover:bg-slate-800"
          >
            Leave vehicle
          </button>
          <button
            type="button"
            disabled={!roomCode}
            onClick={() => {
              onActivate();
              onEnterNearbyBuilding();
            }}
            className="py-1.5 rounded-lg text-[11px] font-bold bg-emerald-800 text-white disabled:opacity-40 hover:bg-emerald-900"
          >
            Enter building
          </button>
          <button
            type="button"
            onClick={() => {
              onActivate();
              onFocusOnMap();
            }}
            className="col-span-2 py-1.5 rounded-lg text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100"
          >
            Highlight on map
          </button>
        </div>
        {!canBoard && !inVehicle && (
          <p className="text-[9px] text-slate-400 leading-snug">
            Select a vehicle on the map to enable Board driver / rider.
          </p>
        )}
      </div>
    </div>
  );
}

function personTileFallback(person: Person): { x: number; y: number } {
  if (person.location.kind === 'tile') return { x: person.location.x, y: person.location.y };
  if (person.location.kind === 'walking') {
    return { x: Math.floor(person.location.x), y: Math.floor(person.location.y) };
  }
  const key =
    person.location.kind === 'home'
      ? person.location.homeKey
      : person.location.kind === 'building'
        ? person.location.buildingKey
        : person.location.kind === 'outdoor'
          ? person.location.atKey
          : person.homeKey;
  const [x, y] = key.split(',').map(Number);
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
  };
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
  onUpdateTraffic: (next: TrafficState | ((prev: TrafficState) => TrafficState)) => void;
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
    onUpdateTraffic(prev => {
      const nextControls = { ...prev.controls };
      selectedIds.forEach(id => {
        const c = nextControls[id];
        if (c?.kind === 'stoplight') {
          nextControls[id] = { ...c, ...patch };
        }
      });
      return { ...prev, controls: nextControls };
    });
  };

  const toggleLightPhase = (light: Extract<TrafficControl, { kind: 'stoplight' }>) => {
    if (!roomCode) return;
    const ctrlKey = trafficControlKey(light);
    onUpdateTraffic(prev => ({
      ...prev,
      controls: {
        ...prev.controls,
        [ctrlKey]: {
          ...light,
          phase: cycleLightPhase(light.phase),
          phaseStartedAt: Date.now(),
        },
      },
    }));
  };

  const phaseFields = [
    { key: 'redMs' as const, label: 'Red' },
    { key: 'yellowMs' as const, label: 'Yellow' },
    { key: 'greenMs' as const, label: 'Green' },
  ];

  const toggleAllOfKind = (kind: 'stop-sign' | 'stoplight') => {
    const items = kind === 'stop-sign' ? signs : lights;
    const keys = items.map(item => trafficControlKey(item));
    const selectedCount = keys.filter(key => selectedIds.has(key)).length;
    const next = new Set(selectedIds);
    if (keys.length > 0 && selectedCount === keys.length) {
      keys.forEach(key => next.delete(key));
    } else {
      keys.forEach(key => next.add(key));
    }
    onSelectIds(next);
  };

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
          onChange={e => {
            const v = parseFloat(e.target.value);
            onUpdateTraffic(prev => ({ ...prev, stopSignMinDurationSec: v }));
          }}
          className="w-full"
        />
      </div>

      <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
        <div className="flex flex-col min-h-0 shrink-0" style={{ maxHeight: '38%' }}>
          <div className="flex items-center justify-between px-1 mb-1 gap-2">
            <label className={`flex items-center gap-1.5 min-w-0 ${signs.length === 0 || !roomCode ? '' : 'cursor-pointer'}`}>
              <input
                type="checkbox"
                aria-label="Select all stop signs"
                title="Select all stop signs"
                checked={signs.length > 0 && selectedSigns.length === signs.length}
                disabled={signs.length === 0 || !roomCode}
                onChange={() => toggleAllOfKind('stop-sign')}
                className="rounded border-slate-300 text-red-600 focus:ring-red-600 disabled:opacity-40"
              />
              <span className="text-sm font-medium text-slate-700 truncate">
                Stop Signs ({selectedSigns.length}/{signs.length})
              </span>
            </label>
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
          <div className="flex items-center justify-between px-1 mb-1 gap-2">
            <label className={`flex items-center gap-1.5 min-w-0 ${lights.length === 0 || !roomCode ? '' : 'cursor-pointer'}`}>
              <input
                type="checkbox"
                aria-label="Select all stoplights"
                title="Select all stoplights"
                checked={lights.length > 0 && selectedLights.length === lights.length}
                disabled={lights.length === 0 || !roomCode}
                onChange={() => toggleAllOfKind('stoplight')}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600 disabled:opacity-40"
              />
              <span className="text-sm font-medium text-slate-700 truncate">
                Stoplights ({selectedLights.length}/{lights.length})
              </span>
            </label>
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

  useEffect(() => {
    setLocalCargo(getTrailerCargo(trailerRef, vehicles, economy));
  }, [trailerRef, vehicles, economy]);

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
    <FloatingWindow
      title={<>🚛 {title}</>}
      headerClassName="bg-slate-800 text-white"
      borderClassName="border-slate-300"
      widthClassName="w-[min(32rem,calc(100vw-2rem))]"
      maxHeightClassName="max-h-[min(85vh,640px)]"
      onClose={onClose}
    >
        <div className="p-4 space-y-3">
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
    </FloatingWindow>
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

  useEffect(() => {
    setLocalCargo(getRailcarCargo(railcarRef, vehicles));
  }, [railcarRef, vehicles]);

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
    <FloatingWindow
      title={<>🚂 {title}</>}
      headerClassName="bg-slate-800 text-white"
      borderClassName="border-slate-300"
      widthClassName="w-[min(32rem,calc(100vw-2rem))]"
      maxHeightClassName="max-h-[min(85vh,640px)]"
      onClose={onClose}
    >
        <div className="p-4 space-y-3">
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
    </FloatingWindow>
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
    // New taxi stations start with a unique owner id and an empty fleet
    taxiStationOwnerId:
      role === 'taxi-station'
        ? `tso-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
        : undefined,
    taxiFleetIds: role === 'taxi-station' ? [] : undefined,
    activeTaxiRides: role === 'taxi-station' ? [] : undefined,
    busFleetIds: role === 'bus-station' ? [] : undefined,
    busRoutes: role === 'bus-station' ? [] : undefined,
    busRoute: role === 'bus-station' ? [] : undefined,
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
  buildingType:
    | 'building-repair-shop'
    | 'building-hospital'
    | 'building-taxi-station'
    | 'building-bus-station',
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

function findVehiclesInTaxiStationBays(
  anchorKey: string,
  grid: GridData,
  vehicles: Record<string, Vehicle>,
): Array<{ vehicle: Vehicle; bayIndex: number; cellKey: string }> {
  return findVehiclesInBuildingBays(anchorKey, grid, vehicles, 'building-taxi-station');
}

function findVehiclesInBusStationBays(
  anchorKey: string,
  grid: GridData,
  vehicles: Record<string, Vehicle>,
): Array<{ vehicle: Vehicle; bayIndex: number; cellKey: string }> {
  return findVehiclesInBuildingBays(anchorKey, grid, vehicles, 'building-bus-station');
}

/** Thick blue preview of the route selected in the bus station window. */
function BusRouteMapOverlay({ stops, grid }: { stops: string[]; grid: GridData }) {
  const stopKey = stops.join('|');
  const cells = useMemo(() => traceBusRouteCells(grid, stops), [grid, stopKey]);
  const pixel = (p: Point) => ({
    x: (p.x + 0.5) * GRID_SIZE,
    y: (p.y + 0.5) * GRID_SIZE,
  });
  const line = cells.map(pixel);
  const markers = stops
    .map((key, index) => {
      const p = parseGridKey(key);
      return p ? { key, index, ...pixel(p) } : null;
    })
    .filter((m): m is { key: string; index: number; x: number; y: number } => !!m);
  if (line.length === 0 && markers.length === 0) return null;

  const xs = [...line.map(p => p.x), ...markers.map(m => m.x)];
  const ys = [...line.map(p => p.y), ...markers.map(m => m.y)];
  const pad = 28;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const width = Math.max(...xs) - minX + pad;
  const height = Math.max(...ys) - minY + pad;
  const rel = line.map(p => ({ x: p.x - minX, y: p.y - minY }));
  const segments: { key: number; left: number; top: number; len: number; ang: number }[] = [];
  for (let i = 0; i < rel.length - 1; i++) {
    const a = rel[i];
    const b = rel[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) continue;
    segments.push({
      key: i,
      left: (a.x + b.x) / 2,
      top: (a.y + b.y) / 2,
      len,
      ang: (Math.atan2(dy, dx) * 180) / Math.PI,
    });
  }
  const seen = new Map<string, number>();

  return (
    <div
      className="absolute pointer-events-none z-[58]"
      data-testid="bus-route-overlay"
      style={{ left: minX, top: minY, width, height }}
    >
      {segments.map((s, i) => (
        <div
          key={s.key}
          data-route-seg=""
          data-testid={i === 0 ? 'bus-route-overlay-line' : undefined}
          className="absolute"
          style={{
            left: s.left,
            top: s.top,
            width: s.len,
            height: 14,
            transform: `translate(-50%, -50%) rotate(${s.ang}deg)`,
            backgroundColor: '#2563eb',
            borderRadius: 7,
            boxShadow: '0 0 0 4px #ffffff',
          }}
        />
      ))}
      {markers.map(m => {
        const dup = seen.get(m.key) || 0;
        seen.set(m.key, dup + 1);
        return (
          <div
            key={`${m.key}-${m.index}`}
            data-testid={`bus-route-stop-num-${m.index}`}
            className="absolute z-10 flex items-center justify-center rounded-full bg-white border-[3px] border-blue-600 text-blue-800 font-bold shadow-md"
            style={{
              left: m.x - minX + dup * 16,
              top: m.y - minY - dup * 16,
              width: 26,
              height: 26,
              transform: 'translate(-50%, -50%)',
              fontSize: 13,
              lineHeight: 1,
            }}
          >
            {m.index + 1}
          </div>
        );
      })}
    </div>
  );
}

function BusStationInspectorModal({
  bkey,
  cfg,
  economy,
  grid,
  vehicles,
  setEconomy,
  setVehicles,
  roomCode,
  pendingBusRouteEdit,
  setPendingBusRouteEdit,
  onPreviewRoute,
  onClose,
}: {
  bkey: string;
  cfg: BuildingConfig;
  economy: EconomyState;
  grid: GridData;
  vehicles: Record<string, Vehicle>;
  setEconomy: (eco: EconomyState | ((prev: EconomyState) => EconomyState)) => void;
  setVehicles: (vs: Record<string, Vehicle> | ((prev: Record<string, Vehicle>) => Record<string, Vehicle>)) => void;
  roomCode: string | null;
  pendingBusRouteEdit: PendingBusRouteEdit | null;
  setPendingBusRouteEdit: (edit: PendingBusRouteEdit | null) => void;
  onPreviewRoute: (stops: string[] | null) => void;
  onClose: () => void;
}) {
  const routes = busRoutesOf(cfg);
  const fleetIds = cfg.busFleetIds || [];
  const bayVehicles = findVehiclesInBusStationBays(bkey, grid, vehicles);
  const unassignedBuses = Object.values(vehicles).filter(
    v =>
      v.type === 'bus' &&
      !fleetIds.includes(v.id) &&
      (!v.busStationKey || v.busStationKey === bkey),
  );
  const editingHere = pendingBusRouteEdit?.stationKey === bkey ? pendingBusRouteEdit : null;

  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const selected =
    routes.find(r => r.id === selectedRouteId) ||
    (editingHere ? routes.find(r => r.id === editingHere.routeId) : undefined) ||
    routes[0] ||
    null;
  const [draftName, setDraftName] = useState(selected?.name || '');
  const previewKey = selected?.stops.join('|') ?? '';

  useEffect(() => {
    setDraftName(selected?.name || '');
  }, [selected?.id, selected?.name]);

  useEffect(() => {
    onPreviewRoute(selected && selected.stops.length > 0 ? selected.stops : null);
  }, [selected?.id, previewKey, onPreviewRoute]);

  useEffect(() => {
    return () => onPreviewRoute(null);
  }, [onPreviewRoute]);

  useEffect(() => {
    if (!roomCode) return;
    const stamped = stampRouteIds(vehicles, fleetIds, routes, bkey);
    if (stamped === vehicles) return;
    setVehicles(stamped);
    socket.emit('update-vehicles', { roomCode, vehicles: stamped });
    // Stamp once when the station window opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bkey]);

  const saveCfg = (nextCfg: BuildingConfig, nextVehicles?: Record<string, Vehicle>) => {
    const routesNow = busRoutesOf(nextCfg);
    const withFleet = withBusRoutes(
      { ...nextCfg, busFleetIds: nextCfg.busFleetIds ?? [] },
      routesNow,
    );
    let vehiclesOut = nextVehicles;
    if (vehiclesOut) {
      vehiclesOut = stampRouteIds(vehiclesOut, withFleet.busFleetIds || [], routesNow, bkey);
    }
    const eco = {
      ...economy,
      buildings: { ...economy.buildings, [bkey]: withFleet },
    };
    setEconomy(eco);
    if (vehiclesOut) setVehicles(vehiclesOut);
    if (roomCode) {
      socket.emit('update-economy', { roomCode, economy: eco });
      if (vehiclesOut) socket.emit('update-vehicles', { roomCode, vehicles: vehiclesOut });
    }
  };

  const persistRouteStops = (routeId: string, stops: string[]) => {
    const stamped = stampRouteIds(vehicles, fleetIds, routes, bkey);
    const nextRoutes = routes.map(r => (r.id === routeId ? { ...r, stops } : r));
    const synced = syncAssignedBuses(stamped, bkey, routeId, stops);
    saveCfg(
      withBusRoutes({ ...cfg, busFleetIds: fleetIds }, nextRoutes),
      synced !== vehicles ? synced : undefined,
    );
  };

  const poseBusOnRoute = (v: Vehicle, route: BusRoute): Vehicle => {
    const first = parseGridKey(route.stops[0]);
    const firstStop = first ? getBusStopTileAt(grid, first.x, first.y) : undefined;
    const startHeading = firstStop ? getBusStopApproachHeading(firstStop) : v.heading;
    const startLane = firstStop
      ? getBusStopBayLane(firstStop, startHeading)
      : getLegalTrafficLane(false, false);
    return {
      ...v,
      busRouteId: route.id,
      busRoute: [...route.stops],
      busRouteIndex: 0,
      busRouteLoops: 0,
      busPhase: 'route',
      busStationKey: bkey,
      busStopUntil: undefined,
      busRefuelTicks: undefined,
      busRefuelAccumMs: undefined,
      destination: first,
      isMoving: !!first,
      lane: v.lane < 0 ? startLane : Math.abs(v.lane) || startLane,
      randomTurning: false,
      turnAroundAtDeadEnd: true,
      manualOverride: false,
    };
  };

  const addBusToFleet = () => {
    const bays = findBusBayCells(bkey, grid);
    const occupied = new Set(bayVehicles.map(b => b.bayIndex));
    const freeBay = bays.find(b => !occupied.has(b.bayIndex));
    const spawn = freeBay || bays[0];
    if (!spawn) return;
    const id = makeVehicleId('bus');
    const bus: Vehicle = {
      id,
      x: spawn.x,
      y: spawn.y,
      heading: 0,
      lane: 1,
      progress: 0.5,
      color: SERVICE_VEHICLE_META.bus.color,
      zIndex: 0,
      type: 'bus',
      isMoving: false,
      speed: 0.9,
      turnAroundAtDeadEnd: true,
      randomTurning: false,
      parkingStallIndex: spawn.bayIndex,
      lastParkingKey: bkey,
      busStationKey: bkey,
      maxPassengers: getMaxPassengers('bus'),
    };
    saveCfg(
      { ...cfg, busFleetIds: [...fleetIds, id] },
      { ...vehicles, [id]: bus },
    );
  };

  const assignBus = (busId: string) => {
    if (fleetIds.includes(busId)) return;
    const v = vehicles[busId];
    if (!v || v.type !== 'bus') return;
    if (v.busStationKey && v.busStationKey !== bkey) {
      const other = economy.buildings[v.busStationKey];
      if (other?.busFleetIds?.includes(busId)) return;
    }
    saveCfg(
      { ...cfg, busFleetIds: [...fleetIds, busId] },
      { ...vehicles, [busId]: { ...v, busStationKey: bkey } },
    );
  };

  const removeBusFromFleet = (busId: string, deleteVehicle: boolean) => {
    const nextCfg: BuildingConfig = {
      ...cfg,
      busFleetIds: fleetIds.filter(id => id !== busId),
    };
    if (deleteVehicle) {
      const nextVehicles = { ...vehicles };
      delete nextVehicles[busId];
      saveCfg(nextCfg, nextVehicles);
      return;
    }
    const v = vehicles[busId];
    if (v) {
      const cleared = clearVehicleRoute(v);
      saveCfg(nextCfg, { ...vehicles, [busId]: { ...cleared, busStationKey: bkey } });
    } else {
      saveCfg(nextCfg);
    }
  };

  const createRoute = () => {
    const added = addBusRoute(cfg);
    setSelectedRouteId(added.route.id);
    saveCfg(added.cfg);
  };

  const selectRoute = (routeId: string) => {
    setSelectedRouteId(routeId);
    if (editingHere) setPendingBusRouteEdit({ stationKey: bkey, routeId });
  };

  const commitName = () => {
    if (!selected) return;
    const name = draftName.trim();
    if (!name || name === selected.name) {
      setDraftName(selected.name);
      return;
    }
    saveCfg(renameBusRoute(cfg, selected.id, name));
  };

  const toggleAddStops = () => {
    if (!selected) return;
    if (editingHere?.routeId === selected.id) {
      setPendingBusRouteEdit(null);
      return;
    }
    setPendingBusRouteEdit({ stationKey: bkey, routeId: selected.id });
  };

  const clearSelectedStops = () => {
    if (!selected) return;
    persistRouteStops(selected.id, []);
  };

  const removeStop = (index: number) => {
    if (!selected) return;
    const next = removeBusRouteStopAt(cfg, selected.id, index);
    const route = findBusRoute(next, selected.id);
    const stamped = stampRouteIds(vehicles, fleetIds, routes, bkey);
    const synced = syncAssignedBuses(stamped, bkey, selected.id, route?.stops || []);
    saveCfg(next, synced !== vehicles ? synced : undefined);
  };

  const removeSelectedRoute = () => {
    if (!selected) return;
    const released = releaseBusesFromRoute(vehicles, selected.id);
    const next = deleteBusRoute(cfg, selected.id);
    if (editingHere?.routeId === selected.id) setPendingBusRouteEdit(null);
    const remaining = busRoutesOf(next);
    setSelectedRouteId(remaining[0]?.id ?? null);
    saveCfg(next, released !== vehicles ? released : undefined);
  };

  const startBus = (busId: string) => {
    if (!roomCode) return;
    const v = vehicles[busId];
    if (!v || v.type !== 'bus') return;
    const routeId = resolveBusRouteId(v, routes);
    const route = routes.find(r => r.id === routeId);
    if (!route || route.stops.length === 0) return;
    const nextFleet = fleetIds.includes(busId) ? fleetIds : [...fleetIds, busId];
    saveCfg(
      { ...cfg, busFleetIds: nextFleet },
      { ...vehicles, [busId]: poseBusOnRoute(v, route) },
    );
  };

  const stopBusRoute = (busId: string) => {
    const v = vehicles[busId];
    if (!v) return;
    const nextVehicles = {
      ...vehicles,
      [busId]: {
        ...v,
        busPhase: undefined,
        busStopUntil: undefined,
        busRefuelTicks: undefined,
        destination: null,
        isMoving: false,
      },
    };
    setVehicles(nextVehicles);
    if (roomCode) socket.emit('update-vehicles', { roomCode, vehicles: nextVehicles });
  };

  const pickRouteForBus = (busId: string, routeId: string) => {
    const v = vehicles[busId];
    if (!v || v.type !== 'bus') return;
    if (!routeId) {
      const cleared = clearVehicleRoute(v);
      saveCfg(cfg, { ...vehicles, [busId]: { ...cleared, busStationKey: v.busStationKey || bkey } });
      return;
    }
    const route = routes.find(r => r.id === routeId);
    if (!route) return;
    const running =
      v.busPhase === 'route' ||
      v.busPhase === 'boarding' ||
      v.busPhase === 'to-station' ||
      v.busPhase === 'refueling';
    const nextBus =
      running && route.stops.length > 0
        ? poseBusOnRoute(v, route)
        : assignBusToRoute(v, route, bkey);
    saveCfg(cfg, { ...vehicles, [busId]: nextBus });
  };

  const startBusesOnSelected = () => {
    if (!selected || selected.stops.length === 0 || !roomCode) return;
    let nextVehicles = { ...vehicles };
    let any = false;
    for (const busId of fleetIds) {
      const v = nextVehicles[busId];
      if (!v || v.type !== 'bus') continue;
      if (resolveBusRouteId(v, routes) !== selected.id) continue;
      nextVehicles[busId] = poseBusOnRoute(v, selected);
      any = true;
    }
    if (!any) return;
    saveCfg({ ...cfg, busFleetIds: fleetIds }, nextVehicles);
  };

  const editingSelected = !!(selected && editingHere?.routeId === selected.id);

  return (
    <FloatingWindow
      title={
        <span className="flex items-center gap-1.5">
          <Bus className="w-3.5 h-3.5" />
          {cfg.name || 'Bus Station'}
        </span>
      }
      subtitle={`${bkey} · 2×2 · ${routes.length} route${routes.length === 1 ? '' : 's'} · ${fleetIds.length} bus${fleetIds.length === 1 ? '' : 'es'}`}
      headerClassName="bg-blue-600 text-white"
      borderClassName="border-blue-300"
      widthClassName="w-[min(36rem,calc(100vw-2rem))]"
      maxHeightClassName="max-h-[min(85vh,720px)]"
      onClose={() => {
        if (editingHere) setPendingBusRouteEdit(null);
        onClose();
      }}
    >
      <div className="p-4 space-y-4 text-xs" data-testid="bus-station-panel">
        <div className="rounded-xl border border-blue-100 bg-blue-50/80 px-2.5 py-2 space-y-0.5">
          <div className="text-[10px] font-semibold text-blue-900 uppercase tracking-wide">
            Routes
          </div>
          <p className="text-[10px] text-slate-600 leading-snug">
            Define several routes by clicking <strong>bus-stop</strong> tiles in order. The selected route is drawn on the map. Then assign each bus to one route.
            After <strong>5 loops</strong> a bus returns here for gas ({BUS_REFUEL_TICKS}s) and resumes its route.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="font-semibold text-slate-800">
              Routes ({routes.length})
            </div>
            <button
              type="button"
              data-testid="bus-route-add"
              disabled={!roomCode}
              onClick={createRoute}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
            >
              + New route
            </button>
          </div>

          {routes.length === 0 ? (
            <div className="text-slate-400 text-center py-3 border border-dashed border-slate-200 rounded-xl">
              No routes yet. Add a route, then click bus stops on the map.
            </div>
          ) : (
            <div className="flex flex-col gap-1" data-testid="bus-route-list">
              {routes.map(route => {
                const active = selected?.id === route.id;
                const onMap = editingHere?.routeId === route.id;
                return (
                  <button
                    key={route.id}
                    type="button"
                    data-testid={`bus-route-${route.id}`}
                    onClick={() => selectRoute(route.id)}
                    className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-left ${
                      active
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-slate-700 border-blue-100 hover:bg-blue-50'
                    }`}
                  >
                    <span className="font-semibold truncate">{route.name}</span>
                    <span className={`text-[10px] shrink-0 ${active ? 'text-blue-100' : 'text-slate-500'}`}>
                      {onMap ? 'Adding stops · ' : ''}
                      {route.stops.length} stop{route.stops.length === 1 ? '' : 's'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {selected && (
            <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-2.5">
              <label className="block space-y-1">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Name</span>
                <input
                  data-testid="bus-route-name"
                  value={draftName}
                  disabled={!roomCode}
                  onChange={e => setDraftName(e.target.value)}
                  onBlur={commitName}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:border-blue-400"
                />
              </label>
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  data-testid="bus-route-add-stops"
                  disabled={!roomCode}
                  onClick={toggleAddStops}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold disabled:opacity-40 ${
                    editingSelected
                      ? 'bg-blue-700 text-white animate-pulse'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {editingSelected ? 'Clicking stops…' : 'Add stops on map'}
                </button>
                <button
                  type="button"
                  data-testid="bus-route-clear"
                  disabled={!roomCode || selected.stops.length === 0}
                  onClick={clearSelectedStops}
                  className="px-2 py-1.5 rounded-lg text-[11px] font-bold bg-white border border-blue-200 text-blue-800 disabled:opacity-40"
                >
                  Clear
                </button>
                <button
                  type="button"
                  data-testid="bus-route-delete"
                  disabled={!roomCode}
                  onClick={removeSelectedRoute}
                  className="px-2 py-1.5 rounded-lg text-[11px] font-bold bg-white border border-red-100 text-red-600 hover:bg-red-50 disabled:opacity-40"
                >
                  Delete route
                </button>
              </div>
              <div className="flex flex-wrap gap-1 min-h-[1.5rem]" data-testid="bus-route-stops">
                {selected.stops.length === 0 && (
                  <span className="text-[10px] text-slate-400 italic">
                    No stops yet — click “Add stops on map”, then bus-stop tiles
                  </span>
                )}
                {selected.stops.map((stop, i) => (
                  <span
                    key={`${stop}-${i}`}
                    className="inline-flex items-center gap-0.5 text-[10px] font-mono px-1.5 py-0.5 rounded border bg-white text-blue-800 border-blue-200"
                    title={`Stop ${i + 1}`}
                  >
                    {i + 1}. {stop}
                    <button
                      type="button"
                      className="ml-0.5 text-slate-400 hover:text-rose-600"
                      title="Remove stop"
                      data-testid={`bus-route-stop-remove-${i}`}
                      onClick={() => removeStop(i)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <button
                type="button"
                data-testid="bus-route-start-assigned"
                disabled={!roomCode || selected.stops.length === 0}
                onClick={startBusesOnSelected}
                className="w-full py-1.5 rounded-lg text-[11px] font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
              >
                Start buses assigned to {selected.name}
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold text-slate-800">Fleet ({fleetIds.length})</div>
          <button
            type="button"
            data-testid="bus-fleet-add"
            disabled={!roomCode}
            onClick={addBusToFleet}
            className="px-2.5 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-bold disabled:opacity-40"
          >
            + Add bus
          </button>
        </div>

        {fleetIds.length === 0 ? (
          <div className="text-slate-400 text-center py-3 border border-dashed border-slate-200 rounded-xl">
            No buses yet. Add a bus to this station, or assign an existing bus below.
          </div>
        ) : (
          <ul className="space-y-1.5" data-testid="bus-fleet-list">
            {fleetIds.map(bid => {
              const v = vehicles[bid];
              const assignedId = v ? resolveBusRouteId(v, routes) : null;
              const assigned = routes.find(r => r.id === assignedId);
              const onRoute = !!(v?.busPhase && assigned && assigned.stops.length > 0);
              return (
                <li
                  key={bid}
                  className="flex flex-col gap-1.5 p-2 rounded-xl border border-slate-100 bg-slate-50"
                  data-testid={`bus-fleet-${bid}`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: v?.color || SERVICE_VEHICLE_META.bus.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-[11px] text-slate-700 truncate">{bid}</div>
                      <div className="text-[10px] text-slate-500" data-testid={`bus-status-${bid}`}>
                        {v
                          ? `@ ${v.x},${v.y}${v.destination ? ` → ${v.destination.x},${v.destination.y}` : ''}`
                          : 'Missing vehicle'}
                        {assigned ? ` · ${assigned.name}` : ' · No route'}
                        {v?.busPhase ? ` · ${v.busPhase}` : ' · Idle'}
                        {typeof v?.busRouteLoops === 'number' && onRoute
                          ? ` · loops ${v.busRouteLoops}/${BUS_LOOPS_BEFORE_REFUEL}`
                          : ''}
                        {v?.busPhase === 'refueling' && typeof v.busRefuelTicks === 'number'
                          ? ` · fuel ${v.busRefuelTicks}s`
                          : ''}
                      </div>
                    </div>
                  </div>
                  <label className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500 shrink-0">Route</span>
                    <select
                      data-testid={`bus-route-select-${bid}`}
                      disabled={!roomCode || routes.length === 0}
                      value={assignedId || ''}
                      onChange={e => pickRouteForBus(bid, e.target.value)}
                      className="flex-1 min-w-0 border border-slate-200 rounded-lg px-2 py-1 text-[11px] bg-white disabled:opacity-40"
                    >
                      <option value="">{routes.length === 0 ? 'Add a route first' : 'No route'}</option>
                      {routes.map(route => (
                        <option key={route.id} value={route.id}>
                          {route.name} ({route.stops.length} stop{route.stops.length === 1 ? '' : 's'})
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      data-testid={`bus-start-${bid}`}
                      disabled={!roomCode || !assigned || assigned.stops.length === 0}
                      onClick={() => startBus(bid)}
                      className="px-2 py-1 rounded-lg text-[10px] font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
                    >
                      {onRoute ? 'Restart on route' : 'Start on route'}
                    </button>
                    {onRoute && (
                      <button
                        type="button"
                        data-testid={`bus-pause-${bid}`}
                        disabled={!roomCode}
                        onClick={() => stopBusRoute(bid)}
                        className="px-2 py-1 rounded-lg text-[10px] font-bold bg-white border border-slate-200 text-slate-700 disabled:opacity-40"
                      >
                        Stop
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={!roomCode}
                      title="Unassign from station"
                      onClick={() => removeBusFromFleet(bid, false)}
                      className="px-2 py-1 rounded-lg text-[10px] font-bold bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                    >
                      Unassign
                    </button>
                    <button
                      type="button"
                      disabled={!roomCode}
                      title="Remove bus from world"
                      onClick={() => removeBusFromFleet(bid, true)}
                      className="px-2 py-1 rounded-lg text-[10px] font-bold bg-red-50 border border-red-100 text-red-600 hover:bg-red-100 disabled:opacity-40"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {unassignedBuses.length > 0 && (
          <div>
            <div className="font-semibold text-slate-700 mb-1.5">Assign existing bus</div>
            <div className="flex flex-wrap gap-1.5">
              {unassignedBuses.map(b => (
                <button
                  key={b.id}
                  type="button"
                  disabled={!roomCode}
                  onClick={() => assignBus(b.id)}
                  className="px-2 py-1 rounded-lg bg-white border border-blue-200 text-[10px] font-mono text-slate-700 hover:bg-blue-50 disabled:opacity-40"
                >
                  {b.id.slice(0, 14)}
                </button>
              ))}
            </div>
          </div>
        )}

        {bayVehicles.length > 0 && (
          <div className="text-[10px] text-slate-500">
            Parked in bays:{' '}
            {bayVehicles.map(b => `Bay ${b.bayIndex + 1}: ${b.vehicle.id.slice(0, 8)}`).join(' · ')}
          </div>
        )}
      </div>
    </FloatingWindow>
  );
}


function findTaxiBayCells(
  anchorKey: string,
  grid: GridData,
): Array<{ key: string; bayIndex: number; x: number; y: number }> {
  const cells: Array<{ key: string; bayIndex: number; x: number; y: number }> = [];
  for (const [key, tiles] of Object.entries(grid)) {
    for (const t of tiles) {
      if (t.type !== 'building-taxi-station') continue;
      const isAnchor = t.part !== 'member' && key === anchorKey;
      const isMember = t.part === 'member' && t.anchorKey === anchorKey;
      if (!isAnchor && !isMember) continue;
      if (!isTaxiStationBay(t)) continue;
      const [x, y] = key.split(',').map(Number);
      cells.push({ key, bayIndex: getTaxiStationBayIndex(t), x, y });
    }
  }
  return cells.sort((a, b) => a.bayIndex - b.bayIndex);
}

function TaxiStationInspectorModal({
  bkey,
  cfg,
  economy,
  grid,
  vehicles,
  setEconomy,
  setVehicles,
  roomCode,
  onClose,
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
}) {
  // Ensure this station has a unique owner id (legacy configs)
  const ownerId =
    cfg.taxiStationOwnerId ||
    `tso-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const fleetIds = cfg.taxiFleetIds || [];
  const rides = cfg.activeTaxiRides || [];
  const bayVehicles = findVehiclesInTaxiStationBays(bkey, grid, vehicles);
  // Unowned robotaxis only (not in another station's fleet)
  const unassignedTaxis = Object.values(vehicles).filter(
    v => v.type === 'taxi' && !v.taxiOwnerId && !fleetIds.includes(v.id),
  );

  const saveCfg = (
    nextCfg: BuildingConfig,
    nextVehicles?: Record<string, Vehicle>,
    buildingsBase?: Record<string, BuildingConfig>,
  ) => {
    const withOwner: BuildingConfig = {
      ...nextCfg,
      taxiStationOwnerId: nextCfg.taxiStationOwnerId || ownerId,
      taxiFleetIds: nextCfg.taxiFleetIds ?? [],
    };
    const eco = {
      ...economy,
      buildings: { ...(buildingsBase || economy.buildings), [bkey]: withOwner },
    };
    setEconomy(eco);
    if (nextVehicles) setVehicles(nextVehicles);
    if (roomCode) {
      socket.emit('update-economy', { roomCode, economy: eco });
      if (nextVehicles) socket.emit('update-vehicles', { roomCode, vehicles: nextVehicles });
    }
  };

  // Persist owner id if missing on first open
  useEffect(() => {
    if (!cfg.taxiStationOwnerId && roomCode) {
      saveCfg({ ...cfg, taxiStationOwnerId: ownerId, taxiFleetIds: fleetIds });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bkey]);

  const addTaxiToFleet = () => {
    const bays = findTaxiBayCells(bkey, grid);
    const occupied = new Set(bayVehicles.map(b => b.bayIndex));
    const freeBay = bays.find(b => !occupied.has(b.bayIndex));
    const spawn = freeBay || bays[0];
    if (!spawn) return;
    const id = makeVehicleId('taxi');
    const taxi: Vehicle = {
      id,
      x: spawn.x,
      y: spawn.y,
      heading: 0,
      lane: 1,
      progress: 0.5,
      color: SERVICE_VEHICLE_META.taxi.color,
      zIndex: 0,
      type: 'taxi',
      isMoving: false,
      speed: 1.2,
      turnAroundAtDeadEnd: true,
      randomTurning: false,
      parkingStallIndex: spawn.bayIndex,
      lastParkingKey: bkey,
      taxiOwnerId: ownerId,
    };
    const nextVehicles = { ...vehicles, [id]: taxi };
    const nextCfg: BuildingConfig = {
      ...cfg,
      taxiStationOwnerId: ownerId,
      taxiFleetIds: [...fleetIds, id],
      activeTaxiRides: rides,
    };
    saveCfg(nextCfg, nextVehicles);
  };

  const assignTaxi = (taxiId: string) => {
    if (fleetIds.includes(taxiId)) return;
    const v = vehicles[taxiId];
    if (!v || v.type !== 'taxi') return;
    // Cannot steal a taxi already owned by another station
    if (v.taxiOwnerId && v.taxiOwnerId !== ownerId) return;
    const nextVehicles = {
      ...vehicles,
      [taxiId]: { ...v, taxiOwnerId: ownerId },
    };
    saveCfg(
      {
        ...cfg,
        taxiStationOwnerId: ownerId,
        taxiFleetIds: [...fleetIds, taxiId],
      },
      nextVehicles,
    );
  };

  const removeTaxiFromFleet = (taxiId: string, deleteVehicle: boolean) => {
    const nextFleet = fleetIds.filter(id => id !== taxiId);
    const nextRides = rides.filter(r => r.taxiId !== taxiId);
    const nextCfg: BuildingConfig = {
      ...cfg,
      taxiStationOwnerId: ownerId,
      taxiFleetIds: nextFleet,
      activeTaxiRides: nextRides,
    };
    if (deleteVehicle) {
      const nextVehicles = { ...vehicles };
      delete nextVehicles[taxiId];
      saveCfg(nextCfg, nextVehicles, releaseDeletedTaxis(economy.buildings, [taxiId]));
      return;
    }
    const v = vehicles[taxiId];
    if (v) {
      const cleared = { ...v };
      delete cleared.taxiOwnerId;
      saveCfg(nextCfg, { ...vehicles, [taxiId]: cleared });
    } else {
      saveCfg(nextCfg);
    }
  };

  const purposeLabel = (p: ActiveTaxiRide['purpose']) => {
    if (p === 'work') return 'Work';
    if (p === 'shop') return 'Shop';
    if (p === 'care') return 'Care';
    return 'Home';
  };

  return (
    <FloatingWindow
      title={
        <span className="flex items-center gap-1.5">
          <CarTaxiFront className="w-3.5 h-3.5" />
          {cfg.name || 'Taxi Station'}
        </span>
      }
      subtitle={`${bkey} · 4 bays · owner ${ownerId.slice(0, 14)}`}
      headerClassName="bg-yellow-500 text-yellow-950"
      borderClassName="border-yellow-300"
      widthClassName="w-[min(32rem,calc(100vw-2rem))]"
      maxHeightClassName="max-h-[min(85vh,640px)]"
      onClose={onClose}
    >
        <div className="p-4 space-y-4 text-xs" data-testid="taxi-station-panel">
          <div className="rounded-xl border border-yellow-100 bg-yellow-50/80 px-2.5 py-2 space-y-0.5">
            <div className="text-[10px] font-semibold text-yellow-900 uppercase tracking-wide">
              Station owner
            </div>
            <div className="font-mono text-[11px] text-slate-800 break-all" title={ownerId}>
              {ownerId}
            </div>
            <div className="text-[9px] text-slate-500">
              This station owns its fleet. New stations start with zero taxis.
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="font-semibold text-slate-800">Fleet ({fleetIds.length})</div>
            <button
              type="button"
              disabled={!roomCode}
              onClick={addTaxiToFleet}
              className="px-2.5 py-1.5 rounded-lg bg-yellow-500 hover:bg-yellow-600 text-yellow-950 font-bold disabled:opacity-40"
            >
              + Add taxi
            </button>
          </div>

          {fleetIds.length === 0 ? (
            <div className="text-slate-400 text-center py-3 border border-dashed border-slate-200 rounded-xl">
              No taxis yet. New stations start empty — add taxis to build the fleet.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {fleetIds.map(tid => {
                const v = vehicles[tid];
                const ride = rides.find(r => r.taxiId === tid);
                return (
                  <li
                    key={tid}
                    className="flex items-center gap-2 p-2 rounded-xl border border-slate-100 bg-slate-50"
                  >
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: v?.color || '#facc15' }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-[11px] text-slate-700 truncate">{tid}</div>
                      <div className="text-[10px] text-slate-500">
                        {v
                          ? `@ ${v.x},${v.y}${v.destination ? ` → ${v.destination.x},${v.destination.y}` : ''}`
                          : 'Missing vehicle'}
                        {ride
                          ? ` · ${ride.phase === 'to_pickup' ? 'Pickup' : 'Dropoff'} ${ride.passengerLabel || ride.passengerId.slice(0, 8)}`
                          : ' · Idle'}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={!roomCode}
                      title="Unassign from station"
                      onClick={() => removeTaxiFromFleet(tid, false)}
                      className="text-[10px] px-1.5 py-1 rounded bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                    >
                      Unassign
                    </button>
                    <button
                      type="button"
                      disabled={!roomCode}
                      title="Remove taxi from world"
                      onClick={() => removeTaxiFromFleet(tid, true)}
                      className="text-[10px] px-1.5 py-1 rounded bg-red-50 border border-red-100 text-red-600 hover:bg-red-100 disabled:opacity-40"
                    >
                      Delete
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {unassignedTaxis.length > 0 && (
            <div>
              <div className="font-semibold text-slate-700 mb-1.5">Assign existing taxi</div>
              <div className="flex flex-wrap gap-1.5">
                {unassignedTaxis.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    disabled={!roomCode}
                    onClick={() => assignTaxi(t.id)}
                    className="px-2 py-1 rounded-lg bg-white border border-yellow-200 text-[10px] font-mono text-slate-700 hover:bg-yellow-50 disabled:opacity-40"
                  >
                    {t.id.slice(0, 12)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="font-semibold text-slate-800 mb-1.5">
              Active rides ({rides.length})
            </div>
            {rides.length === 0 ? (
              <div className="text-slate-400 text-center py-3 border border-dashed border-slate-200 rounded-xl">
                No rides in progress
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-100 rounded-xl">
                <table className="w-full text-left text-[10px]">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-2 py-1.5 font-semibold">Passenger</th>
                      <th className="px-2 py-1.5 font-semibold">Taxi</th>
                      <th className="px-2 py-1.5 font-semibold">Phase</th>
                      <th className="px-2 py-1.5 font-semibold">Destination</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rides.map(r => (
                      <tr key={r.id} className="border-t border-slate-50">
                        <td className="px-2 py-1.5 font-medium text-slate-800">
                          {r.passengerLabel || r.passengerId.slice(0, 10)}
                          <div className="text-slate-400 font-normal">{purposeLabel(r.purpose)}</div>
                        </td>
                        <td className="px-2 py-1.5 font-mono text-slate-600">{r.taxiId.slice(0, 10)}</td>
                        <td className="px-2 py-1.5">
                          {r.phase === 'to_pickup' ? (
                            <span className="text-amber-700">→ Pickup {r.pickupKey}</span>
                          ) : (
                            <span className="text-emerald-700">→ Dropoff</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 font-mono text-slate-700">{r.destinationKey}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="text-[10px] text-slate-500 leading-snug bg-yellow-50 border border-yellow-100 rounded-xl p-2">
            Stations own their robotaxis (unique owner id). Taxis obey traffic lights and stop signs,
            leave bays onto adjacent roads, serve rides, then return here.
          </div>
        </div>
    </FloatingWindow>
  );
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
  const storeCustomerCount = role === 'store' ? peopleShoppingAt(economy.people, bkey).length : 0;
  const activeRepairs = cfg.activeRepairs || [];
  const activePatients = cfg.activePatients || [];

  const getItemLabel = (id: string) => getItemDisplayName(id, itemDefs);

  const pickDefaultItem = (used: string[] = []) =>
    itemDefs.find(d => !used.includes(d.id))?.id || itemDefs[0]?.id || '';

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
  }, [bkey]);

  useEffect(() => {
    cfgSyncRef.current = Date.now();
  }, [cfg.processAccum, cfg.activeRepairs, cfg.activePatients]);

  useEffect(() => {
    if ((!isRecipeBuilding(cfg) && role !== 'repair-shop' && role !== 'hospital') || economy.economyPaused) return;
    const iv = setInterval(() => setEditorTick(t => t + 1), 100);
    return () => clearInterval(iv);
  }, [bkey, economy.economyPaused, role]);

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
    <FloatingWindow
      title="Building Config"
      subtitle={`Role: ${role} • ${bkey}`}
      headerClassName="bg-slate-700 text-white"
      borderClassName="border-slate-300"
      widthClassName="w-[min(32rem,calc(100vw-2rem))]"
      maxHeightClassName="max-h-[min(85vh,720px)]"
      onClose={onClose}
    >
        <div className="p-5 space-y-3">
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
            <div className="font-semibold text-sm mb-1">Consumption (per customer)</div>
            <p className="text-[10px] text-slate-500 mb-1.5 leading-snug">
              Rate is units/sec for each shopper in the store. Empty stores do not consume.
              A shopper takes 1 unit of each item below, then leaves.
            </p>
            <div className="text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-100 rounded px-2 py-1 mb-2">
              {storeCustomerCount} customer{storeCustomerCount === 1 ? '' : 's'} in store
            </div>
            <div className="border rounded p-2 text-xs bg-slate-50">
              {(Object.keys(localRates).length === 0) && <div className="text-slate-400 text-[10px]">No rates set</div>}
              {Object.entries(localRates).map(([it, rate]) => (
                <div key={it} className="flex items-center justify-between py-0.5">
                  <span>{getItemLabel(it)}</span>
                  <div className="flex items-center gap-1">
                    <input type="number" step="0.1" value={rate} onChange={e => setLocalRates(p => ({ ...p, [it]: Math.max(0, parseFloat(e.target.value) || 0) }))} className="w-16 text-right border px-1 text-xs" />
                    <span className="text-[10px] text-slate-500">/cust·s</span>
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
              >+0.5/cust·s</button>
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
              const present = countEmployeesAtBuilding(economy.people, bkey);
              const assigned = countEmployeesAssignedToBuilding(economy.people, bkey);
              const need = localRequiredEmployees;
              const staffed = need <= 0 || present >= need;
              const employees = Object.values(economy.people || {}).filter(p => p.workplaceKey === bkey);
              return (
                <div className={`p-2 rounded-lg border text-xs ${staffed ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                  <div className="flex items-center justify-between font-medium mb-1">
                    <span className={staffed ? 'text-emerald-800' : 'text-rose-800'}>
                      On-site: {present}/{need} · Assigned: {assigned}
                    </span>
                    {!staffed && <span className="text-rose-600 text-[10px]">Production paused</span>}
                  </div>
                  {employees.length === 0 ? (
                    <p className="text-[10px] text-slate-500">
                      No employees assigned. Select people in the People panel, then click &quot;Assign workplace&quot; and choose this building. Assigned people must travel here before production uses them.
                    </p>
                  ) : (
                    <ul className="text-[10px] text-slate-600 space-y-0.5 max-h-20 overflow-y-auto">
                      {employees.map(p => {
                        const onSite =
                          p.location.kind === 'building' && p.location.buildingKey === bkey;
                        return (
                          <li key={p.id}>
                            {personDisplayName(p)} · {formatAge(p.ageYears)}
                            <span className={onSite ? ' text-emerald-600' : ' text-amber-600'}>
                              {onSite ? ' · on-site' : ' · commuting'}
                            </span>
                          </li>
                        );
                      })}
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
    </FloatingWindow>
  );
}

/**
 * City system clock at top of the map — HH:MM:SS AM/PM.
 * User can set time; people schedules and city AI follow sim time.
 */
function CityClockBar({
  economy,
  setEconomy,
  roomCode,
}: {
  economy: EconomyState;
  setEconomy: (eco: EconomyState | ((prev: EconomyState) => EconomyState)) => void;
  roomCode: string | null;
}) {
  const [tick, setTick] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [parseError, setParseError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 250);
    return () => clearInterval(iv);
  }, []);

  const simNow = getSimNow(economy, Date.now());
  void tick;
  const label = formatClock12h(simNow);

  const applyOffset = (offsetMs: number) => {
    const realNow = Date.now();
    const newSim = realNow + offsetMs;
    // Re-arm people AI for the new city time (schedules re-evaluate; activity timers reset)
    const people = { ...(economy.people || {}) };
    for (const id of Object.keys(people)) {
      const p = people[id];
      if (!p) continue;
      people[id] = {
        ...p,
        activityUntil: newSim,
        lastScheduleFireKey: undefined,
      };
    }
    const nextEco: EconomyState = {
      ...economy,
      cityTimeOffsetMs: offsetMs,
      people,
    };
    setEconomy(nextEco);
    if (roomCode) socket.emit('update-economy', { roomCode, economy: nextEco });
  };

  const applyDraft = () => {
    const parsed = parseClockInput(draft);
    if (!parsed) {
      setParseError(true);
      return;
    }
    setParseError(false);
    applyOffset(
      cityTimeOffsetForLocalTime(parsed.hours, parsed.minutes, parsed.seconds),
    );
    setEditing(false);
  };

  const nudgeHours = (delta: number) => {
    const d = new Date(getSimNow(economy, Date.now()));
    d.setHours(d.getHours() + delta);
    applyOffset(
      cityTimeOffsetForLocalTime(d.getHours(), d.getMinutes(), d.getSeconds()),
    );
  };

  const syncToWall = () => {
    applyOffset(0);
    setEditing(false);
  };

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  return (
    <div
      className="absolute top-2 left-1/2 -translate-x-1/2 z-[55] flex flex-col items-center gap-1"
      data-grid-control
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center gap-1.5 rounded-full border border-slate-300/90 bg-white/95 shadow-lg backdrop-blur-sm pl-2.5 pr-1.5 py-1">
        <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" aria-hidden />
        {editing ? (
          <form
            className="flex items-center gap-1"
            onSubmit={e => {
              e.preventDefault();
              applyDraft();
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={draft}
              onChange={e => {
                setDraft(e.target.value);
                setParseError(false);
              }}
              onKeyDown={e => {
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  setParseError(false);
                  setEditing(false);
                }
              }}
              placeholder="6am, 5:20p, noon…"
              className={`w-[8.5rem] px-1.5 py-0.5 text-xs font-mono font-bold text-slate-800 border rounded-md outline-none ${
                parseError
                  ? 'border-rose-400 bg-rose-50 focus:border-rose-500'
                  : 'border-slate-200 focus:border-indigo-400'
              }`}
              title="Examples: 6am, 5:20P, midnight, noon, 15:45, 930am"
              aria-invalid={parseError}
            />
            <button
              type="submit"
              className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-600 text-white hover:bg-indigo-700"
            >
              Set
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="px-1.5 py-0.5 rounded-md text-[10px] font-bold text-slate-500 hover:bg-slate-100"
            >
              Esc
            </button>
          </form>
        ) : (
          <>
            <button
              type="button"
              disabled={!roomCode}
              onClick={() => {
                setDraft(formatClock12h(getSimNow(economy, Date.now())));
                setEditing(true);
              }}
              className="font-mono text-sm font-bold tabular-nums text-slate-800 tracking-wide px-1 py-0.5 rounded-md hover:bg-slate-100 disabled:opacity-50"
              title="City clock — click to set time (schedules follow this clock)"
            >
              {label}
            </button>
            <button
              type="button"
              disabled={!roomCode}
              onClick={() => nudgeHours(-1)}
              className="w-6 h-6 rounded-full text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-40"
              title="−1 hour"
            >
              −1h
            </button>
            <button
              type="button"
              disabled={!roomCode}
              onClick={() => nudgeHours(1)}
              className="w-6 h-6 rounded-full text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-40"
              title="+1 hour"
            >
              +1h
            </button>
            <button
              type="button"
              disabled={!roomCode}
              onClick={syncToWall}
              className="px-1.5 h-6 rounded-full text-[9px] font-bold text-slate-500 hover:bg-slate-100 disabled:opacity-40"
              title="Sync to real wall clock"
            >
              Now
            </button>
          </>
        )}
      </div>
      {editing && (
        <div
          className={`text-[9px] px-2 py-0.5 rounded-full border shadow-sm max-w-xs text-center ${
            parseError
              ? 'text-rose-700 bg-rose-50 border-rose-200'
              : 'text-slate-500 bg-white/90 border-slate-200'
          }`}
        >
          {parseError
            ? 'Could not parse time — try 6am, 5:20p, midnight, noon…'
            : 'Try 6am · 5:20p · midnight · noon · 15:45 · 930am'}
        </div>
      )}
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
      showTrailerCargoLabels: eco?.showTrailerCargoLabels ?? eco?.showCargoLabels ?? true,
      showRailcarCargoLabels: eco?.showRailcarCargoLabels ?? eco?.showCargoLabels ?? true,
      showHomeBadges: eco?.showHomeBadges ?? true,
      showDestinationMarkers: eco?.showDestinationMarkers ?? true,
      showVehicleStopBadges: eco?.showVehicleStopBadges ?? true,
      showSeedlingBadges: eco?.showSeedlingBadges ?? true,
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
      cityTimeOffsetMs:
        typeof eco?.cityTimeOffsetMs === 'number' && Number.isFinite(eco.cityTimeOffsetMs)
          ? eco.cityTimeOffsetMs
          : 0,
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
  /**
   * Durable per-vehicle manual-override state (flag + controlling user).
   * Full vehicle map replaces (sim tick, socket sync, stale React snapshots) often omit these
   * fields and would otherwise flip the checkbox off — re-stamp from this ref on every write.
   */
  const manualOverrideByIdRef = useRef<
    Record<string, { enabled: boolean; byUid?: string }>
  >({});
  const stampManualOverrideFlags = useCallback((map: Record<string, Vehicle>): Record<string, Vehicle> => {
    const durable = manualOverrideByIdRef.current;
    const next: Record<string, Vehicle> = {};
    for (const [id, v] of Object.entries(map)) {
      // Learn explicit values from the incoming map (user toggle or multiplayer peer)
      if (v.manualOverride === true) {
        durable[id] = {
          enabled: true,
          byUid: v.manualOverrideByUid || durable[id]?.byUid,
        };
      } else if (v.manualOverride === false) {
        durable[id] = { enabled: false };
      } else if (v.manualOverrideByUid && durable[id]?.enabled) {
        // Peer sent controller uid while flag was only held durably
        durable[id] = { enabled: true, byUid: v.manualOverrideByUid };
      }

      if (id in durable) {
        const d = durable[id];
        let stamped = v;
        if (v.manualOverride !== d.enabled) {
          stamped = { ...stamped, manualOverride: d.enabled };
        }
        if (d.enabled) {
          if (d.byUid && stamped.manualOverrideByUid !== d.byUid) {
            stamped = { ...stamped, manualOverrideByUid: d.byUid };
          }
          // Manual override always clears autonomous turn AI + destination routing
          if (
            stamped.randomTurning ||
            stamped.turnAroundAtDeadEnd !== false ||
            stamped.destination
          ) {
            stamped = {
              ...stamped,
              randomTurning: false,
              turnAroundAtDeadEnd: false,
              destination: null,
              turnIntent: null,
            };
          }
        } else if (stamped.manualOverrideByUid) {
          const cleared = { ...stamped };
          delete cleared.manualOverrideByUid;
          stamped = cleared;
        }
        next[id] = stamped;
      } else {
        next[id] = v;
      }
    }
    // Drop flags for vehicles that no longer exist
    for (const id of Object.keys(durable)) {
      if (!(id in next)) delete durable[id];
    }
    return next;
  }, []);
  const setVehicles = useCallback((next: Record<string, Vehicle> | ((prev: Record<string, Vehicle>) => Record<string, Vehicle>)) => {
    if (typeof next === 'function') {
      _setVehicles(reactPrev => {
        // Prefer vehiclesRef: place/keyboard updates write the ref immediately, while
        // React prev can lag one frame and would otherwise snap teleports back.
        const base = vehiclesRef.current;
        const source =
          base && Object.keys(base).length > 0 ? base : reactPrev;
        const normalized = stampManualOverrideFlags(normalizeVehicles(next(source)));
        vehiclesRef.current = normalized;
        return normalized;
      });
    } else {
      const normalized = stampManualOverrideFlags(normalizeVehicles(next));
      vehiclesRef.current = normalized;
      _setVehicles(normalized);
    }
  }, [stampManualOverrideFlags]);
  const [selectedVehicles, setSelectedVehicles] = useState<Set<string>>(new Set());
  const [isPlacingVehicles, setIsPlacingVehicles] = useState(false);
  /** Map-click mode: place selected people (or drop a new person) on a tile */
  const [isPlacingPeople, setIsPlacingPeople] = useState(false);
  const [showCarsPanel, setShowCarsPanel] = useState(false);
  const [showSemiTrailerPanel, setShowSemiTrailerPanel] = useState(false);
  const [showTrainPanel, setShowTrainPanel] = useState(false);
  const [showServicePanel, setShowServicePanel] = useState(false);
  const addCarsCountRef = useRef<HTMLInputElement>(null);
  const userRef = useRef<{ uid: string } | null>(null);
  const bufferedKeysRef = useRef<Set<string>>(new Set());
  const [hasBufferedEdits, setHasBufferedEdits] = useState(false);
  const gridSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [drivePanels, setDrivePanels] = useState<FloatingDrivePanelState[]>([]);
  const [activeDrivePanelId, setActiveDrivePanelId] = useState<string | null>(null);
  const [personPanels, setPersonPanels] = useState<FloatingPersonPanelState[]>([]);
  const [activePersonPanelId, setActivePersonPanelId] = useState<string | null>(null);
  const personPanelZRef = useRef(140);
  const drivePanelZRef = useRef(140);
  /** Vehicle ids with an open floating drive panel (manual control — skip home AI). */
  const drivePanelIdsRef = useRef<Set<string>>(new Set());

  const [simulations, setSimulations] = useState<any[]>([]);
  const [libraryTab, setLibraryTab] = useState<'layouts' | 'simulations'>('layouts');
  const [showSaveSimulationConfirm, setShowSaveSimulationConfirm] = useState(false);
  const [newSimulationName, setNewSimulationName] = useState('');
  const [showDeleteSimulationConfirm, setShowDeleteSimulationConfirm] = useState<{ id: string; name: string } | null>(null);

  // Economy / Logistics system (new)
  const emptyEconomy = (): EconomyState => ({
    itemDefs: [],
    buildings: {},
    parkedTrailers: {},
    showInventoryLabels: true,
    showCargoLabels: true,
    showTrailerCargoLabels: true,
    showRailcarCargoLabels: true,
    showHomeBadges: true,
    showDestinationMarkers: true,
    showVehicleStopBadges: true,
    showSeedlingBadges: true,
    economyPaused: false,
    people: {},
    families: {},
    peoplePaused: false,
    cityTimeOffsetMs: 0,
  });
  const [economy, _setEconomy] = useState<EconomyState>(() => emptyEconomy());
  const localEconomyRef = useRef<EconomyState>(emptyEconomy());
  const economyTimerSyncRef = useRef(Date.now());
  const [cycleUiTick, setCycleUiTick] = useState(0);
  const lastSyncedEconomy = useRef<EconomyState>(emptyEconomy());
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
  /** Bus id whose route is being edited by clicking bus-stop tiles (legacy / service panel) */
  const [pendingBusRouteVehicleId, setPendingBusRouteVehicleId] = useState<string | null>(null);
  /** Station route whose stops are being added by clicking bus-stop tiles */
  const [pendingBusRouteEdit, setPendingBusRouteEdit] = useState<PendingBusRouteEdit | null>(null);
  /** Stop keys of the route highlighted on the map from the station window */
  const [previewBusStops, setPreviewBusStops] = useState<string[] | null>(null);
  const setPreviewBusRoute = useCallback((stops: string[] | null) => {
    setPreviewBusStops(prev => {
      const prevKey = prev?.join('|') ?? '';
      const nextKey = stops?.join('|') ?? '';
      if (prevKey === nextKey) return prev;
      return stops ? [...stops] : null;
    });
  }, []);
  /** When true, next house click assigns homeKey for selected cars */
  const [pendingHomeAssign, setPendingHomeAssign] = useState(false);
  /** When true, next tree click starts a fire on that tile */
  const [pendingFireStart, setPendingFireStart] = useState(false);
  /** When true, next building click assigns selected people as employees */
  const [pendingEmployeeAssign, setPendingEmployeeAssign] = useState(false);
  /** Tick for burning tree animation re-render */
  const [burnUiTick, setBurnUiTick] = useState(0);
  const [showPeoplePanel, setShowPeoplePanel] = useState(false);
  const [showBotPanel, setShowBotPanel] = useState(false);
  const [botPickMode, setBotPickMode] = useState<BotPickMode>(null);
  const [botPickAsk, setBotPickAsk] = useState<BotAsk | null>(null);
  const botPickResultRef = useRef<((result: BotPickResult) => void) | null>(null);
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
  /** When creating/editing a person: next map click sets home or workplace */
  const [pendingPersonFormPick, setPendingPersonFormPick] = useState<'home' | 'workplace' | null>(null);
  const [traffic, setTraffic] = useState<TrafficState>(DEFAULT_TRAFFIC_STATE);
  const localTrafficRef = useRef<TrafficState>(DEFAULT_TRAFFIC_STATE);
  const [showTrafficPanel, setShowTrafficPanel] = useState(false);
  const [trafficTool, setTrafficTool] = useState<TrafficTool>(null);
  const [selectedTrafficIds, setSelectedTrafficIds] = useState<Set<string>>(new Set());
  const [hoveredGridKey, setHoveredGridKey] = useState<string | null>(null);
  /** Tile key whose coordinates are shown after a 3s hover dwell */
  const [coordLabelKey, setCoordLabelKey] = useState<string | null>(null);
  const hoverKeyRef = useRef<string | null>(null);
  const hoverCoordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  /** Patch a display/badge flag on economy and sync to the room. */
  const setEconomyBadgeFlag = useCallback(
    <K extends keyof EconomyState>(key: K, value: EconomyState[K]) => {
      const next = normalizeEconomy({ ...localEconomyRef.current, [key]: value });
      setEconomy(next);
      const rc = roomCodeRef.current || roomCode;
      if (rc) socket.emit('update-economy', { roomCode: rc, economy: next });
    },
    [roomCode, setEconomy],
  );

  /**
   * Always apply traffic updates against localTrafficRef (not possibly-stale React
   * state). Accepts a full state or a functional updater. normalizeTraffic re-keys
   * controls as kind:id so stop-signs and stoplights never overwrite each other.
   */
  const emitTraffic = useCallback((next: TrafficState | ((prev: TrafficState) => TrafficState)) => {
    const prev = localTrafficRef.current;
    const resolved = typeof next === 'function' ? next(prev) : next;
    if (resolved === prev) return; // functional updaters may no-op
    const normalized = normalizeTraffic(resolved);
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
  const rightMenuRef = useRef<HTMLDivElement>(null);
  const minimapSize = 180;
  const [minimapDragging, setMinimapDragging] = useState(false);
  const [showOverview, setShowOverview] = useState(false);
  const overviewHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [rightMenuClearancePx, setRightMenuClearancePx] = useState(160);

  useLayoutEffect(() => {
    const el = rightMenuRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setRightMenuClearancePx(Math.max(0, window.innerWidth - rect.left));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

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

  // Sync grid from Socket.io
  useEffect(() => {
    if (!roomCode) {
      resetTrafficState();
      return;
    }

    resetTrafficState();
    bufferedKeysRef.current.clear();
    updateBufferedState();
    socket.emit('join-room', roomCode);

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

    const handleVehiclesUpdated = (payload: any) => {
      const eventRoom = typeof payload?.roomCode === 'string' ? payload.roomCode : null;
      const newVehicles = payload?.vehicles ?? payload;
      if (eventRoom && eventRoom !== roomCodeRef.current) return;
      // setVehicles re-stamps durable manualOverride flags so stale peer snapshots
      // (missing the field) cannot flip the checkbox off.
      const normalized = normalizeVehicles(newVehicles);
      if (isSimLeaderRef.current) {
        // Leader owns kinematics — adopt peer control flags, new vehicles, and
        // place/teleport poses (higher placeSeq). Never full-replace from peers.
        setVehicles(prev => {
          let changed = false;
          const next = { ...prev };
          for (const [id, rv] of Object.entries(normalized)) {
            if (!prev[id]) {
              next[id] = rv;
              changed = true;
              continue;
            }
            const local = next[id];
            let merged = local;
            let localChanged = false;

            const peerPlaceSeq = rv.placeSeq ?? 0;
            const localPlaceSeq = local.placeSeq ?? 0;
            if (peerPlaceSeq > localPlaceSeq) {
              // Peer placed/teleported this vehicle — adopt pose
              merged = {
                ...merged,
                x: rv.x,
                y: rv.y,
                heading: rv.heading,
                lane: rv.lane,
                progress: rv.progress,
                zIndex: rv.zIndex,
                placeSeq: peerPlaceSeq,
                destination: null,
                turnIntent: null,
                stepForward: false,
                stepBackward: false,
              };
              delete merged.parkingStopUntil;
              delete merged.trafficStopUntil;
              delete merged.trafficStopReason;
              if (merged.homeKey) {
                merged.nextHomeReturnAt = Date.now() + randomHomeTourDelayMs();
              }
              localChanged = true;
            }

            const overrideChanged =
              (rv.manualOverride === true || rv.manualOverride === false) &&
              (merged.manualOverride !== rv.manualOverride ||
                merged.manualOverrideByUid !== rv.manualOverrideByUid);
            if (overrideChanged) {
              merged = {
                ...merged,
                manualOverride: rv.manualOverride,
                manualOverrideByUid: rv.manualOverride
                  ? rv.manualOverrideByUid || merged.manualOverrideByUid
                  : undefined,
              };
              if (rv.manualOverride) {
                delete merged.trafficStopUntil;
                delete merged.trafficStopReason;
                delete merged.nextHomeReturnAt;
                delete merged.parkingStopUntil;
                merged.destination = null;
                merged.turnIntent = null;
                merged.randomTurning = false;
                merged.turnAroundAtDeadEnd = false;
              } else {
                delete merged.manualOverrideByUid;
              }
              localChanged = true;
            }

            // Peer holding manual override (or sending discrete drive inputs) owns
            // isMoving / F-B step / speed / lane / turnIntent — adopt so non-leader
            // keypresses actually drive the sim on the leader.
            const peerDrives =
              !!rv.manualOverride ||
              !!rv.stepForward ||
              !!rv.stepBackward ||
              (rv.isMoving === true && !!rv.manualOverrideByUid);
            if (peerDrives) {
              let driveMerged = merged;
              let driveChanged = false;
              if (rv.isMoving !== undefined && rv.isMoving !== driveMerged.isMoving) {
                driveMerged = { ...driveMerged, isMoving: rv.isMoving };
                driveChanged = true;
              }
              if (rv.stepForward) {
                driveMerged = {
                  ...driveMerged,
                  stepForward: true,
                  stepBackward: false,
                };
                driveChanged = true;
              } else if (rv.stepBackward) {
                driveMerged = {
                  ...driveMerged,
                  stepBackward: true,
                  stepForward: false,
                };
                driveChanged = true;
              }
              if (typeof rv.speed === 'number' && rv.speed !== driveMerged.speed) {
                driveMerged = { ...driveMerged, speed: rv.speed };
                driveChanged = true;
              }
              if (typeof rv.lane === 'number' && rv.lane !== driveMerged.lane) {
                driveMerged = { ...driveMerged, lane: rv.lane };
                driveChanged = true;
              }
              if (rv.turnIntent !== undefined && rv.turnIntent !== driveMerged.turnIntent) {
                driveMerged = { ...driveMerged, turnIntent: rv.turnIntent };
                driveChanged = true;
              }
              if (rv.parkingStopUntil == null && driveMerged.parkingStopUntil != null) {
                driveMerged = { ...driveMerged };
                delete driveMerged.parkingStopUntil;
                driveChanged = true;
              }
              if (driveChanged) {
                merged = driveMerged;
                localChanged = true;
              }
            }

            if (localChanged) {
              next[id] = merged;
              changed = true;
            }
          }
          return changed ? next : prev;
        });
        return;
      }
      lastSyncedVehicles.current = normalized;
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
    socket.on('vehicles-updated', handleVehiclesUpdated);
    socket.on('economy-updated', handleEconomyUpdated);
    socket.on('traffic-updated', handleTrafficUpdated);
    socket.on('room-sim-role', handleRoomSimRole);

    return () => {
      socket.emit('leave-room', roomCode);
      isSimLeaderRef.current = false;
      setIsSimLeader(false);
      socket.off('world-state', handleWorldState);
      socket.off('grid-updated', handleGridUpdated);
      socket.off('grid-update-ack', handleGridUpdateAck);
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

  useEffect(() => {
    if (selectedVehicles.size === 0) {
      setIsPlacingVehicles(false);
      setPendingRouteVehicleId(null);
    }
  }, [selectedVehicles]);

  // Drop drive panels for vehicles that no longer exist
  useEffect(() => {
    setDrivePanels(prev => {
      const next = prev.filter(p => !!vehicles[p.vehicleId]);
      return next.length === prev.length ? prev : next;
    });
    if (activeDrivePanelId && !vehicles[activeDrivePanelId]) {
      setActiveDrivePanelId(null);
    }
  }, [vehicles, activeDrivePanelId]);

  // Keep a ref of vehicles under manual drive-panel control (used by the sim loop)
  useEffect(() => {
    drivePanelIdsRef.current = new Set(drivePanels.map(p => p.vehicleId));
  }, [drivePanels]);

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
        const scatterOneWay = getOneWayTravel(targetTile);
        if (scatterOneWay) heading = scatterOneWay.heading;
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
        // Service (and all) vehicle ids start with type: bus-, cab-, fire-, police-, amb-, tow-, …
        const id = makeVehicleId(type);
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
        const spawnOneWay = getOneWayTravel(topTile);
        if (spawnOneWay) heading = spawnOneWay.heading;
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
    const removedTaxiIds: string[] = [];
    ids.forEach(id => {
      const v = updatedVehicles[id];
      if (v?.type === 'taxi') removedTaxiIds.push(id);
      if (v?.towedVehicleId && updatedVehicles[v.towedVehicleId]) {
        const hooked = { ...updatedVehicles[v.towedVehicleId] };
        delete hooked.towedById;
        updatedVehicles[v.towedVehicleId] = hooked;
      }
      if (v?.towedById && updatedVehicles[v.towedById]) {
        updatedVehicles[v.towedById] = {
          ...updatedVehicles[v.towedById],
          towedVehicleId: undefined,
        };
      }
      delete updatedVehicles[id];
    });
    setVehicles(updatedVehicles);
    if (removedTaxiIds.length > 0) {
      const buildings = releaseDeletedTaxis(economy.buildings, removedTaxiIds);
      if (buildings !== economy.buildings) {
        const nextEco = { ...economy, buildings };
        setEconomy(nextEco);
        if (roomCode) socket.emit('update-economy', { roomCode, economy: nextEco });
      }
    }
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
        const next = { ...updatedVehicles[id], [attr]: newState };
        // Manual Go from panel/keyboard: defer home-tour so it doesn't look like "set destination"
        if (attr === 'isMoving' && newState && next.homeKey) {
          next.nextHomeReturnAt = Date.now() + randomHomeTourDelayMs();
        }
        // Manual override: random turns / U-turn-at-dead-end stay off
        if (
          (attr === 'randomTurning' || attr === 'turnAroundAtDeadEnd') &&
          next.manualOverride
        ) {
          next[attr] = false;
        }
        updatedVehicles[id] = next;
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
    // Use live map so we don't clobber concurrent sim state
    const updatedVehicles = { ...vehiclesRef.current };
    let anyUpdates = false;
    const now = Date.now();
    ids.forEach(id => {
      const v = updatedVehicles[id];
      if (!v) return;
      if (v.destination || v.turnIntent) {
        const next: Vehicle = {
          ...v,
          destination: null,
          turnIntent: null,
        };
        // Destination may have blocked home AI while nextHomeReturnAt expired.
        // Defer home re-route so clearing dest never instantly assigns home.
        if (next.homeKey && !next.manualOverride) {
          next.nextHomeReturnAt = now + randomHomeTourDelayMs();
        } else if (next.manualOverride) {
          delete next.nextHomeReturnAt;
        }
        updatedVehicles[id] = next;
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

  const activateDrivePanel = useCallback((vehicleId: string, opts?: {
    keepHomeAssign?: boolean;
    /** When true, leave place-on-map mode alone (MapPin / place car) */
    keepPlacing?: boolean;
  }) => {
    drivePanelZRef.current += 1;
    const z = drivePanelZRef.current;
    setDrivePanels(prev =>
      prev.map(p => (p.vehicleId === vehicleId ? { ...p, zIndex: z } : p))
    );
    setActiveDrivePanelId(vehicleId);
    setSelectedVehicles(new Set([vehicleId]));
    setPendingRouteVehicleId(prev => (prev && prev !== vehicleId ? null : prev));
    // Do not cancel place-car mode unless explicitly leaving it
    if (!opts?.keepPlacing) {
      setIsPlacingVehicles(false);
    }
    // Keep house-assign mode when the Assign house button intentionally toggles it
    if (!opts?.keepHomeAssign) {
      setPendingHomeAssign(false);
    }
  }, []);

  const closeDrivePanel = useCallback((vehicleId: string) => {
    setDrivePanels(prev => prev.filter(p => p.vehicleId !== vehicleId));
    setActiveDrivePanelId(prev => {
      if (prev !== vehicleId) return prev;
      return null;
    });
    if (pendingRouteVehicleId === vehicleId) setPendingRouteVehicleId(null);
  }, [pendingRouteVehicleId]);

  const moveDrivePanel = useCallback((vehicleId: string, pos: Point) => {
    setDrivePanels(prev =>
      prev.map(p => (p.vehicleId === vehicleId ? { ...p, x: pos.x, y: pos.y } : p))
    );
  }, []);

  /** Spawn a floating drive panel for each selected vehicle (or a specific id list). */
  const spawnDrivePanels = useCallback((targetIds?: Iterable<string>) => {
    const ids = Array.from(targetIds ?? selectedVehicles).filter(id => !!vehiclesRef.current[id]);
    if (ids.length === 0) return;

    setDrivePanels(prev => {
      const existing = new Set(prev.map(p => p.vehicleId));
      const next = [...prev];
      let cascade = 0;
      for (const id of ids) {
        if (existing.has(id)) {
          // Bring existing to front
          drivePanelZRef.current += 1;
          const z = drivePanelZRef.current;
          const idx = next.findIndex(p => p.vehicleId === id);
          if (idx >= 0) next[idx] = { ...next[idx], zIndex: z };
          continue;
        }
        drivePanelZRef.current += 1;
        const z = drivePanelZRef.current;
        const baseX = 72 + (next.length + cascade) * 28;
        const baseY = 96 + (next.length + cascade) * 28;
        next.push({
          vehicleId: id,
          x: Math.min(baseX, Math.max(24, window.innerWidth - 300)),
          y: Math.min(baseY, Math.max(24, window.innerHeight - 360)),
          zIndex: z,
        });
        cascade += 1;
      }
      return next;
    });

    const focusId = ids[ids.length - 1];
    setActiveDrivePanelId(focusId);
    setSelectedVehicles(new Set([focusId]));
    setPendingRouteVehicleId(null);
    setIsPlacingVehicles(false);
    setPendingHomeAssign(false);
  }, [selectedVehicles]);

  /**
   * If the matching type's vehicle list panel is open, scroll that row into view.
   * Uses data-vehicle-list-id on list rows (see renderVehicleListItem).
   */
  const scrollVehicleListItemIntoView = useCallback((vehicleId: string) => {
    const v = vehiclesRef.current[vehicleId];
    if (!v) return;
    const panelType: VehiclePanelType = vehicleMatchesPanelType(v, 'train')
      ? 'train'
      : vehicleMatchesPanelType(v, 'semi')
        ? 'semi'
        : vehicleMatchesPanelType(v, 'service')
          ? 'service'
          : 'car';
    const listVisible =
      (panelType === 'car' && showCarsPanel) ||
      (panelType === 'semi' && showSemiTrailerPanel) ||
      (panelType === 'train' && showTrainPanel) ||
      (panelType === 'service' && showServicePanel);
    if (!listVisible) return;

    // Wait a frame so selection highlight paints, then scroll within the list
    requestAnimationFrame(() => {
      const safeId =
        typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
          ? CSS.escape(vehicleId)
          : vehicleId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const el = document.querySelector(
        `[data-vehicle-list-id="${safeId}"]`
      ) as HTMLElement | null;
      if (!el) return;
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth', inline: 'nearest' });
    });
  }, [showCarsPanel, showSemiTrailerPanel, showTrainPanel, showServicePanel]);

  const handleVehicleSelect = useCallback((vehicleId: string, e: React.MouseEvent) => {
    // While place-car mode is active, let the grid click handler place selected
    // vehicles on this tile instead of stealing the click for selection.
    if (isPlacingVehicles) return;
    e.stopPropagation();
    if (e.detail === 2) {
      // Double-click: open / focus drive panel for this vehicle
      setSelectedVehicles(new Set([vehicleId]));
      spawnDrivePanels([vehicleId]);
      scrollVehicleListItemIntoView(vehicleId);
      return;
    }
    if (e.shiftKey) {
      setSelectedVehicles(prev => {
        const next = new Set(prev);
        if (next.has(vehicleId)) next.delete(vehicleId);
        else next.add(vehicleId);
        return next;
      });
    } else {
      setSelectedVehicles(new Set([vehicleId]));
      // If a drive panel is already open for this vehicle, activate it
      setDrivePanels(prev => {
        if (prev.some(p => p.vehicleId === vehicleId)) {
          drivePanelZRef.current += 1;
          const z = drivePanelZRef.current;
          setActiveDrivePanelId(vehicleId);
          return prev.map(p => (p.vehicleId === vehicleId ? { ...p, zIndex: z } : p));
        }
        return prev;
      });
    }
  }, [spawnDrivePanels, scrollVehicleListItemIntoView, isPlacingVehicles]);

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
    const live = vehiclesRef.current;
    // Manual override: destination routing fully disabled (no set, clear is safe/no re-route)
    const routableIds = ids.filter(id => !live[id]?.manualOverride);
    const haveDestination = ids.some(id => live[id]?.destination);
    // Turning dest mode/button off: cancel pick mode and clear routes without instant home reassign
    if (pendingRouteVehicleId || haveDestination) {
      setPendingRouteVehicleId(null);
      clearSelectedDestinations(ids);
      return;
    }
    // All targets are under manual override — do not enter pick mode
    if (routableIds.length === 0) return;
    setIsPlacingVehicles(false);
    setPendingHomeAssign(false);
    setPendingEmployeeAssign(false);
    setPendingPersonFormPick(null);
    setPendingRouteVehicleId(routableIds[0]);
  };

  const toggleHomeAssignMode = (targetIds: Iterable<string> = selectedVehicles) => {
    const live = vehiclesRef.current;
    const ids = Array.from(targetIds).filter(id => {
      const t = live[id]?.type || 'car';
      return t !== 'train' && t !== 'semi' && !!live[id];
    });
    if (ids.length === 0) return;

    // Ensure the vehicles we intend to assign are selected (drive panel / multi-select)
    setSelectedVehicles(new Set(ids));
    setPendingRouteVehicleId(null);
    setPendingEmployeeAssign(false);
    setPendingPersonFormPick(null);
    setIsPlacingVehicles(false);
    setSelectedTile(null);

    // Toggle off only when already assigning the same set; otherwise switch targets and stay on
    if (pendingHomeAssign) {
      const sameSelection =
        ids.length === selectedVehicles.size && ids.every(id => selectedVehicles.has(id));
      if (sameSelection) {
        setPendingHomeAssign(false);
        return;
      }
      // Different targets while mode is on — keep mode, selection already updated
      return;
    }
    setPendingHomeAssign(true);
  };

  const clearSelectedHomes = (targetIds: Iterable<string> = selectedVehicles) => {
    const ids = Array.from(targetIds);
    if (ids.length === 0) return;
    const updatedVehicles = { ...vehiclesRef.current };
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
    const live = vehiclesRef.current;
    const ids = Array.from(targetIds).filter(id => {
      const t = live[id]?.type || 'car';
      return t !== 'train' && t !== 'semi' && !!live[id];
    });
    if (ids.length === 0) return;

    const g = gridRef.current || grid;
    const homeKeys = listHomeKeys(g);
    if (homeKeys.length === 0) return;

    // Shuffle a pool of homes; reuse shuffled list if more cars than houses
    const shuffled = [...homeKeys];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const now = Date.now();
    const assignments = ids.map((id, index) => ({
      vehicleId: id,
      homeKey:
        index < shuffled.length
          ? shuffled[index]
          : homeKeys[Math.floor(Math.random() * homeKeys.length)],
      nextHomeReturnAt: now + randomHomeTourDelayMs(),
    }));

    const eco = localEconomyRef.current || economy;
    const result = assignHomesWithDrivers(
      live,
      eco.people || {},
      eco.families || {},
      assignments,
      now,
    );

    setVehicles(result.vehicles);
    const nextEco = { ...eco, people: result.people, families: result.families };
    setEconomy(nextEco);
    if (roomCode) {
      socket.emit('update-vehicles', { roomCode, vehicles: result.vehicles });
      socket.emit('update-economy', { roomCode, economy: nextEco });
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

  const toggleTowHook = (towId: string) => {
    const live =
      vehiclesRef.current && Object.keys(vehiclesRef.current).length > 0
        ? vehiclesRef.current
        : vehicles;
    const tow = live[towId];
    if (!isTowTruck(tow)) return;
    const next = tow.towedVehicleId
      ? disconnectTowHook(live, towId)
      : (() => {
          const target = findTowTargetBehind(tow, live, gridRef.current);
          return target ? connectTowHook(live, towId, target.id) : live;
        })();
    if (next === live) return;
    setVehicles(next);
    if (roomCode) socket.emit('update-vehicles', { roomCode, vehicles: next });
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

  /**
   * Toggle manual override for a vehicle — bound to the local anonymous user.
   * Only the holding user may release; others cannot take over while active.
   */
  const setVehicleManualOverride = (vehicleId: string, enabled: boolean) => {
    const myUid = userRef.current?.uid;
    if (!myUid) return;

    const base = vehiclesRef.current;
    const v = base[vehicleId];
    if (!v) return;

    if (enabled) {
      // Another user already holds override — do not steal
      if (v.manualOverride && v.manualOverrideByUid && v.manualOverrideByUid !== myUid) {
        return;
      }
      manualOverrideByIdRef.current[vehicleId] = { enabled: true, byUid: myUid };
      const nextVeh: Vehicle = {
        ...v,
        manualOverride: true,
        manualOverrideByUid: myUid,
        // Manual drive: no autonomous turning AI or destination routing
        randomTurning: false,
        turnAroundAtDeadEnd: false,
        destination: null,
        turnIntent: null,
      };
      delete nextVeh.trafficStopUntil;
      delete nextVeh.trafficStopReason;
      delete nextVeh.nextHomeReturnAt;
      // Cancel parking dwell so F/B/G respond immediately
      delete nextVeh.parkingStopUntil;
      // Cancel in-progress "click to set destination" for this vehicle
      setPendingRouteVehicleId(prev => (prev === vehicleId ? null : prev));
      const updatedVehicles = stampManualOverrideFlags(
        normalizeVehicles({ ...base, [vehicleId]: nextVeh })
      );
      vehiclesRef.current = updatedVehicles;
      setVehicles(updatedVehicles);
      if (roomCode) {
        lastSyncedVehicles.current = updatedVehicles;
        socket.emit('update-vehicles', { roomCode, vehicles: updatedVehicles });
      }
      return;
    }

    // Disable: only the controller may release
    if (v.manualOverrideByUid && v.manualOverrideByUid !== myUid) {
      return;
    }
    manualOverrideByIdRef.current[vehicleId] = { enabled: false };
    const nextVeh: Vehicle = { ...v, manualOverride: false };
    delete nextVeh.manualOverrideByUid;
    if (nextVeh.homeKey) {
      nextVeh.nextHomeReturnAt = Date.now() + randomHomeTourDelayMs();
    }
    const updatedVehicles = stampManualOverrideFlags(
      normalizeVehicles({ ...base, [vehicleId]: nextVeh })
    );
    vehiclesRef.current = updatedVehicles;
    setVehicles(updatedVehicles);
    if (roomCode) {
      lastSyncedVehicles.current = updatedVehicles;
      socket.emit('update-vehicles', { roomCode, vehicles: updatedVehicles });
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
      // Cap the step so a long frame cannot jump a vehicle across a red light.
      const deltaTime = Math.min(100, Math.max(0, time - lastTimeRef.current));
      
      let pendingPeopleUpdate: Record<string, Person> | null = null;

      setVehicles(prev => {
        let hasChanges = false;
        const nextVehicles = { ...prev };

        for (const [uid, v] of Object.entries(prev)) {
          let vehicle = v as Vehicle;
          if (vehicle.towedById) continue;
          const manualOverride = !!vehicle.manualOverride;
          const underUserControl =
            manualOverride || drivePanelIdsRef.current.has(vehicle.id);
          const peopleMap = localEconomyRef.current.people || {};
          const hasPeopleSim = Object.keys(peopleMap).length > 0;
          // When people sim is active, autonomous vehicles need a driver to move.
          // Manual override OR an open drive panel: user may run Go without a person driver.
          // Robotaxis and buses on an active route: never require a person driver.
          if (hasPeopleSim && !underUserControl) {
            const isRobotaxi = vehicle.type === 'taxi';
            const isRoutedBus =
              vehicle.type === 'bus' && !!vehicle.busRoute && vehicle.busRoute.length > 0;
            const driverId =
              isRobotaxi || isRoutedBus
                ? undefined
                : vehicle.driverId || getDriverId(peopleMap, vehicle.id);
            if (!driverId && !isRobotaxi && !isRoutedBus) {
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
            } else if (!isRobotaxi && driverId && vehicle.driverId !== driverId) {
              nextVehicles[uid] = { ...vehicle, driverId };
              hasChanges = true;
            } else if (isRobotaxi && vehicle.driverId) {
              // Clear any stale human driver assignment on robotaxis
              nextVehicles[uid] = { ...vehicle, driverId: undefined };
              hasChanges = true;
            }
          }

          // Clear any stale destination under manual override; never route to it.
          // Do not continue — stepForward/stepBackward/isMoving must still process this frame.
          if (manualOverride && vehicle.destination) {
            vehicle = {
              ...vehicle,
              destination: null,
              turnIntent: null,
            };
            hasChanges = true;
          }

          const atDestination =
            !!vehicle.destination &&
            vehicle.x === vehicle.destination.x &&
            vehicle.y === vehicle.destination.y;
          const busAtRefuelStall =
            vehicle.type === 'bus' &&
            vehicle.busPhase === 'to-station' &&
            !!vehicle.busRoute &&
            vehicle.busRoute.length > 0 &&
            !manualOverride &&
            isBusRefuelStall(vehicle.x, vehicle.y, vehicle.busStationKey, currentGrid);
          if (atDestination || busAtRefuelStall) {
            // Bus route service: board/alight at stops, refuel at station after 5 loops
            if (
              vehicle.type === 'bus' &&
              vehicle.busRoute &&
              vehicle.busRoute.length > 0 &&
              !manualOverride
            ) {
              const peopleMapLive = pendingPeopleUpdate || localEconomyRef.current.people || {};
              const result = processBusArrival(vehicle, peopleMapLive, currentGrid, Date.now());
              nextVehicles[uid] = result.vehicle;
              pendingPeopleUpdate = result.people;
              localEconomyRef.current = {
                ...localEconomyRef.current,
                people: result.people,
              };
              hasChanges = true;
              continue;
            }
            if (atDestination) {
              const arrivalPatch = getDestinationArrivalPatch(vehicle, vehicle.x, vehicle.y);
              nextVehicles[uid] = { ...vehicle, ...arrivalPatch };
              hasChanges = true;
              continue;
            }
          }

          // Bus AI: route progression, boarding dwell, refuel countdown
          if (
            vehicle.type === 'bus' &&
            vehicle.busRoute &&
            vehicle.busRoute.length > 0 &&
            !manualOverride
          ) {
            const peopleMapLive = pendingPeopleUpdate || localEconomyRef.current.people || {};
            const adv = advanceBusService(
              vehicle,
              peopleMapLive,
              currentGrid,
              deltaTime,
              Date.now(),
            );
            if (adv.handled) {
              if (adv.people !== peopleMapLive) {
                pendingPeopleUpdate = adv.people;
                localEconomyRef.current = {
                  ...localEconomyRef.current,
                  people: adv.people,
                };
              }
              // Still need kinematics if moving toward destination
              vehicle = adv.vehicle;
              nextVehicles[uid] = vehicle;
              hasChanges = true;
              if (
                vehicle.busPhase === 'boarding' ||
                vehicle.busPhase === 'refueling' ||
                !vehicle.isMoving
              ) {
                continue;
              }
              // Fall through to movement with updated destination
            }
          }

          if (vehicle.parkingStopUntil) {
            // F/B step or user Go (manual / drive panel) cancels parking dwell immediately
            const userDriveIntent =
              !!vehicle.stepForward ||
              !!vehicle.stepBackward ||
              (!!underUserControl && !!vehicle.isMoving);
            if (userDriveIntent) {
              vehicle = { ...vehicle };
              delete vehicle.parkingStopUntil;
              hasChanges = true;
            } else if (Date.now() >= vehicle.parkingStopUntil) {
              const newVehicle = { ...vehicle };
              delete newVehicle.parkingStopUntil;
              if (underUserControl) {
                // Stay stopped — user must press Go
                newVehicle.isMoving = false;
              } else {
                // Resume touring after home (or lot) parking
                newVehicle.isMoving = true;
                if (newVehicle.homeKey && !newVehicle.nextHomeReturnAt) {
                  newVehicle.nextHomeReturnAt = Date.now() + randomHomeTourDelayMs();
                }
              }
              nextVehicles[uid] = newVehicle;
              hasChanges = true;
              continue;
            } else {
              continue;
            }
          }

          // Cars with an assigned home occasionally set destination back home.
          // Never under manual override, drive panel, or while a route destination is active.
          const vTypeForHome = vehicle.type || 'car';
          const isCarLike =
            vTypeForHome === 'car' || isServiceVehicleType(vTypeForHome);
          const underManualDrive = underUserControl;
          // Buses with a route manage their own destinations — skip home AI
          if (
            isCarLike &&
            vTypeForHome !== 'bus' &&
            vehicle.homeKey &&
            !vehicle.destination &&
            vehicle.isMoving !== false &&
            !underManualDrive &&
            !manualOverride
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

          // Traffic control automation is system operation — skip under manual override
          if (!manualOverride && vehicle.trafficStopUntil && vType !== 'train') {
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
            // Pedestrian yield: resume when roadway is clear (always, even with drive panel)
            if (vehicle.trafficStopReason === 'pedestrian' && vType !== 'train' && !manualOverride) {
              const peopleMap = localEconomyRef.current?.people;
              if (
                !peopleMap ||
                !shouldYieldToPedestrians(vehicle, peopleMap, currentGrid)
              ) {
                const resumed = { ...vehicle, isMoving: true };
                delete resumed.trafficStopReason;
                nextVehicles[uid] = resumed;
                hasChanges = true;
                continue;
              }
            }
            // Stoplight resume always applies (emergency+lights may proceed via shouldStopForLight)
            if (vehicle.trafficStopReason === 'stoplight' && vType !== 'train') {
              const tiles = currentGrid[`${vehicle.x},${vehicle.y}`];
              const roadTile = getGroundRoadTile(tiles, vehicle.zIndex);
              const signalCtx = roadTile
                ? signalHoldContext(vehicle, roadTile, currentGrid)
                : undefined;
              if (roadTile && !shouldStopForLight(vehicle, trafficState, signalCtx)) {
                const resumed = { ...vehicle, isMoving: true };
                delete resumed.trafficStopReason;
                nextVehicles[uid] = resumed;
                hasChanges = true;
              }
            } else if (vehicle.trafficStopReason === 'yield' && vType !== 'train') {
              const yieldCap = roundaboutYieldLimit(vehicle, nextVehicles, currentGrid);
              if (yieldCap == null || vehicle.progress < yieldCap - 1e-3) {
                const resumed = { ...vehicle, isMoving: true };
                delete resumed.trafficStopReason;
                nextVehicles[uid] = resumed;
                hasChanges = true;
              }
            } else if (!manualOverride) {
              if (vehicle.trafficStopReason === 'vehicle') {
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
            }
            continue;
          }

          let { x, y, heading, lane, progress, zIndex, turnIntent } = vehicle;
          const emergencyMode = isEmergencyMode(vehicle);
          // Manual override: no autonomous random turns, U-turn-at-dead-end, or destination routing
          const allowRandomTurning = !manualOverride && !!vehicle.randomTurning;
          const allowUTurnAtDeadEnd = !manualOverride && vehicle.turnAroundAtDeadEnd !== false;
          const activeDestination =
            !manualOverride && vehicle.destination ? vehicle.destination : null;
          
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

          if (!manualOverride && currentTile) {
            const owHere = getOneWayTravel(currentTile);
            if (owHere) {
              let d = Math.abs((((heading - owHere.heading) % 360) + 360) % 360);
              if (d > 180) d = 360 - d;
              if (d > 90) heading = owHere.heading;
            }
          }

          // Emergency mode: overtake on the wrong side when traffic is ahead; merge home when clear.
          // One-way: both lanes are legal — never auto-shift.
          if (
            emergencyMode &&
            vType !== 'train' &&
            currentTile &&
            isRoadTile(currentTile.type) &&
            !isOneWayTileType(currentTile.type) &&
            (vehicle.isMoving || vehicle.stepForward)
          ) {
            const is4Lane = currentTile.type.includes('4lane');
            const homeLane = getEmergencyHomeLane(lane, is4Lane);
            const passLane = getEmergencyPassLane(lane, is4Lane);
            const onWrongSide = lane < 0;
            if (!onWrongSide && hasVehicleBlockingAhead(vehicle, nextVehicles, currentGrid)) {
              lane = passLane;
            } else if (
              onWrongSide &&
              isLaneClearForEmergency({ ...vehicle, lane }, homeLane, nextVehicles)
            ) {
              lane = homeLane;
            }
          }
          // Buses: always legal right-hand traffic lanes; approach stops on bay curb.
          if (vehicle.type === 'bus' && currentTile && !manualOverride) {
            const destIsHere =
              !!activeDestination &&
              activeDestination.x === x &&
              activeDestination.y === y;
            const onStop = isBusStopTileType(currentTile.type);
            const destStop = activeDestination
              ? getBusStopTileAt(currentGrid, activeDestination.x, activeDestination.y)
              : onStop
                ? currentTile
                : undefined;
            const is4 = currentTile.type.includes('4lane');
            const onRoad =
              currentTile.type.startsWith('road') ||
              currentTile.type === 'rail-road-crossing';

            if (onStop) {
              const approachH = getBusStopApproachHeading(currentTile);
              const servicingHere =
                destIsHere ||
                vehicle.busPhase === 'boarding' ||
                (vehicle.busRoute || []).some(k => k === currentTileKey);

              if (servicingHere) {
                // Snap to approach heading so bay is on the right (legal traffic side)
                if (headingDiffDeg(heading, approachH) > 45) {
                  // Wrong way on stop: reverse to approach (legal direction for bay curb)
                  heading = approachH;
                }
                lane = getBusStopBayLane(currentTile, heading);
              } else if (onRoad) {
                // Passing through stop tile without servicing — still legal lane
                lane = getLegalTrafficLane(is4, false);
              }
            } else if (onRoad && !isOneWayTileType(currentTile.type)) {
              // En route: always positive (right-hand) lane; outer when heading to a stop
              const preferOuter =
                !!destStop &&
                headingDiffDeg(
                  heading,
                  getBusStopApproachHeading(destStop),
                ) <= 50;
              const legal = getLegalTrafficLane(is4, preferOuter);
              if (lane < 0 || Math.abs(lane - legal) > 0.01) {
                // Never stay wrong-way; snap to legal traffic side
                lane = legal;
              }
            }
          }

          // Working snapshot with any emergency / bus lane change applied
          const activeVehicle: Vehicle = lane !== vehicle.lane || heading !== vehicle.heading
            ? { ...vehicle, lane, heading }
            : vehicle;
          
          const onBuildingBay = isBuildingParkingBay(currentTile);
          const onHome = isHouseTile(currentTile);
          // Multi-tile apartments use the anchor as homeKey; match any cell of that building
          const homeLotId = onHome
            ? resolveHomeKeyFromTile(currentTile, currentTileKey)
            : null;
          const isOwnerHome = !!onHome && !!vehicle.homeKey && vehicle.homeKey === homeLotId;
          // Auto-park is system/AI behavior only. With a drive panel open or manual
          // override, only park when the user pressed Park (parkOnNextLot) — otherwise
          // Go would freeze after a second or two when rolling over a lot/home/bay.
          // Buses on a route never auto-park mid-service.
          const busOnService =
            vehicle.type === 'bus' && !!vehicle.busRoute && vehicle.busRoute.length > 0;
          const mayAutoPark =
            (!underUserControl && !busOnService) || !!vehicle.parkOnNextLot;
          if (
            mayAutoPark &&
            currentTile &&
            (currentTile.type.startsWith('parking-') ||
              onBuildingBay ||
              (!underUserControl && isOwnerHome) ||
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
          } else if (!manualOverride) {
            newLastParkingKey = undefined;
          }

          if (
            newParkingStopUntil !== vehicle.parkingStopUntil || 
            newLastParkingKey !== vehicle.lastParkingKey ||
            newStallIndex !== vehicle.parkingStallIndex ||
            newParkOnNextLot !== vehicle.parkOnNextLot
          ) {
            nextVehicles[uid] = {
              ...activeVehicle,
              parkingStopUntil: newParkingStopUntil,
              lastParkingKey: newLastParkingKey,
              parkingStallIndex: newStallIndex,
              parkOnNextLot: newParkOnNextLot
            };
            hasChanges = true;
            continue;
          }

          // Pedestrians always have right-of-way (including robotaxis / emergency).
          // User manual override can still force through if they choose to keep moving.
          if (
            !manualOverride &&
            vType !== 'train' &&
            (activeVehicle.isMoving || activeVehicle.stepForward)
          ) {
            const peopleMap = localEconomyRef.current?.people;
            if (peopleMap && shouldYieldToPedestrians(activeVehicle, peopleMap, currentGrid)) {
              nextVehicles[uid] = {
                ...activeVehicle,
                isMoving: false,
                trafficStopReason: 'pedestrian',
              };
              hasChanges = true;
              continue;
            }
          }

          // Stoplights apply to every road vehicle except trains and emergency vehicles
          // with lights on. Manual override and an open drive panel still stop.
          // Stop signs stay a system hold and are skipped while the user is driving.
          // Prefer the road on this layer even if another tile is stacked first.
          const signalTile = currentTiles?.find(t => {
            const bridge = t.type.includes('bridge') || t.type.includes('trestle');
            const onLayer = (zIndex === 1 && bridge) || (zIndex === 0 && !bridge);
            return onLayer && t.type.startsWith('road-');
          });
          if (
            vType !== 'train' &&
            signalTile &&
            !activeVehicle.stepForward &&
            !activeVehicle.stepBackward
          ) {
            if (shouldStopForLight(
              activeVehicle,
              trafficState,
              signalHoldContext(activeVehicle, signalTile, currentGrid),
            )) {
              nextVehicles[uid] = {
                ...activeVehicle,
                isMoving: false,
                trafficStopReason: 'stoplight',
              };
              hasChanges = true;
              continue;
            }
          }
          if (vType !== 'train' && !emergencyMode && !activeVehicle.stepBackward) {
            const yieldCap = roundaboutYieldLimit(activeVehicle, nextVehicles, currentGrid);
            if (yieldCap != null && activeVehicle.progress >= yieldCap - 1e-3) {
              nextVehicles[uid] = {
                ...activeVehicle,
                isMoving: false,
                trafficStopReason: 'yield',
              };
              hasChanges = true;
              continue;
            }
          }
          if (
            !underUserControl &&
            vType !== 'train' &&
            currentTile &&
            isRoadTile(currentTile.type)
          ) {
            const signStop = shouldStopForSign(activeVehicle, currentTile, trafficState, nextVehicles, currentGrid);
            if (signStop.stop) {
              nextVehicles[uid] = {
                ...activeVehicle,
                isMoving: false,
                trafficStopUntil: signStop.minUntil,
                trafficStopReason: 'stop-sign',
              };
              hasChanges = true;
              continue;
            }
          }

          hasChanges = true;

          const speed = activeVehicle.speed || 1;
          let step = 0;
          
          if (activeVehicle.isMoving) {
            step = (speed * deltaTime) / 1000;
          } else if (activeVehicle.stepForward) {
            step = 0.1; // One step forward
          } else if (activeVehicle.stepBackward) {
            step = -0.1; // One step backward
          }

          // Longer circle paths (left, U-turn) cover more pixels than one straight tile.
          if (step !== 0 && currentTile && isRoundabout4Way(currentTile.type) && vType !== 'train') {
            const exitH = resolveVehicleExit(
              { ...activeVehicle, x, y, heading, lane },
              currentTile,
              currentGrid,
            );
            step *= roundaboutTravelFactor(x, y, heading, exitH, lane);
          }

          let newProgress = progress + step;
          if (step > 0 && (activeVehicle.isMoving || activeVehicle.stepForward)) {
            newProgress = findMaxSafeProgress(activeVehicle, newProgress, nextVehicles, currentGrid);

            // Never jump a red/yellow signal. Applies while the user is driving too.
            // A single F/B step is the explicit creep-through and is not clamped.
            if (
              !activeVehicle.stepForward &&
              vType !== 'train' &&
              signalTile
            ) {
              const lightClamp = clampProgressForRedLight(
                { ...activeVehicle, progress },
                newProgress,
                trafficState,
                signalHoldContext({ ...activeVehicle, progress }, signalTile, currentGrid),
              );
              if (lightClamp.mustStop) {
                nextVehicles[uid] = {
                  ...activeVehicle,
                  progress: lightClamp.progress,
                  isMoving: false,
                  trafficStopReason: 'stoplight',
                };
                hasChanges = true;
                continue;
              }
              newProgress = lightClamp.progress;
            }

            // Do not cross into an occupied 4-way roundabout. F/B stops at the yield line.
            if (vType !== 'train' && !emergencyMode && !activeVehicle.stepBackward) {
              const yieldCap = roundaboutYieldLimit(
                { ...activeVehicle, progress },
                nextVehicles,
                currentGrid,
              );
              if (yieldCap != null && newProgress > yieldCap + 1e-6) {
                nextVehicles[uid] = {
                  ...activeVehicle,
                  progress: progress > yieldCap ? progress : yieldCap,
                  isMoving: false,
                  trafficStopReason: 'yield',
                };
                hasChanges = true;
                continue;
              }
            }

            // Stop-sign approach: do not skip past the hold line in one frame
            if (
              !underUserControl &&
              !emergencyMode &&
              vType !== 'train' &&
              currentTile &&
              isRoadTile(currentTile.type) &&
              newProgress > progress
            ) {
              const signStop = shouldStopForSign(
                { ...activeVehicle, progress: Math.max(progress, 0.72) },
                currentTile,
                trafficState,
                nextVehicles,
                currentGrid
              );
              if (signStop.stop && progress < 0.72 && newProgress >= 0.72) {
                nextVehicles[uid] = {
                  ...activeVehicle,
                  progress: 0.72,
                  isMoving: false,
                  trafficStopUntil: signStop.minUntil,
                  trafficStopReason: 'stop-sign',
                };
                hasChanges = true;
                continue;
              }
            }

            // Emergency mode never gets stuck behind traffic (collision free-pass)
            // Under user control: clamp progress only — don't flip isMoving (user keeps Go intent)
            if (activeVehicle.isMoving && newProgress <= progress + 1e-6) {
              if (emergencyMode || underUserControl) {
                nextVehicles[uid] = { ...activeVehicle, progress };
                hasChanges = true;
                continue;
              }
              nextVehicles[uid] = {
                ...activeVehicle,
                isMoving: false,
                trafficStopReason: 'vehicle',
                progress,
              };
              hasChanges = true;
              continue;
            }
          }

          progress = newProgress;

          let newVehicleState = { ...activeVehicle, progress, lane };
          
          if (activeVehicle.stepForward || activeVehicle.stepBackward) {
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
              exitHeading = resolveVehicleExit(
                { ...activeVehicle, x, y, heading },
                currentTile,
                currentGrid,
              );
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
                const nextOneWay = getOneWayTravel(nextTile);
                // Robotaxis may enter any adjacent road from a bay (driveway access),
                // even if the road tile does not list that edge as a normal port.
                const robotaxiOntoRoad =
                  vehicle.type === 'taxi' && nextTile.type.startsWith('road');
                const canEnterNext =
                  (nextOneWay
                    ? nextEntryPort === nextOneWay.enterPort
                    : nextPorts.includes(nextEntryPort)) ||
                  (!nextOneWay && robotaxiOntoRoad) ||
                  (vehicle.type === 'taxi' && isBuildingParkingBay(nextTile));

                if (canEnterNext) {
                  const isNext4Lane = nextTile.type.includes('4lane');
                  const isNextOneWay = isOneWayTileType(nextTile.type);
                  const nextIsBridge = nextTile.type.includes('bridge') || nextTile.type.includes('trestle');

                  // Keep the exit heading through the tile boundary. The quarter-circle
                  // (or stall curve) is drawn while heading and the exit still differ.
                  // Snapping a taxi onto the next road's axis here pivots it at the edge.
                  let enterHeading = headingWhenEnteringTile(exitHeading);
                  let enterLane =
                    vehicle.type === 'train'
                      ? 0
                      : vehicle.type === 'taxi'
                        ? taxiLaneEnteringTile(lane, underUserControl, isNextOneWay, isNext4Lane)
                        : isNextOneWay
                          ? oneWayKeepLane(lane)
                          : vehicle.type === 'bus'
                            ? getLegalTrafficLane(isNext4Lane, false)
                            : isNext4Lane
                              ? lane
                              : 1;

                  // The circle is one lane and feeds the right-hand lane of the exit road.
                  if (isRoundabout4Way(currentTile?.type) && vehicle.type !== 'train' && !isNextOneWay) {
                    enterLane = 1;
                  }

                  // Bus: legal traffic lane always; approach heading + bay curb at stops
                  if (vehicle.type === 'bus' && !manualOverride) {
                    const destIsNext =
                      !!activeDestination &&
                      activeDestination.x === nextX &&
                      activeDestination.y === nextY;
                    const stopOnRoute = (vehicle.busRoute || []).some(
                      k => k === `${nextX},${nextY}`,
                    );
                    if (isBusStopTileType(nextTile.type) && (destIsNext || stopOnRoute)) {
                      const approachH = getBusStopApproachHeading(nextTile);
                      const approachPort = ((approachH / 90) % 4 + 4) % 4;
                      // Enter traveling the approach heading when the road allows
                      // (entry from opposite side of approach port)
                      const entryNeeded = (approachPort + 2) % 4;
                      if (nextPorts.includes(approachPort)) {
                        if (nextEntryPort === entryNeeded || destIsNext) {
                          enterHeading = approachH;
                        } else if (headingDiffDeg(enterHeading, approachH) > 90) {
                          // Prefer approach if current enter is opposite
                          enterHeading = approachH;
                        }
                      }
                      enterLane = getBusStopBayLane(nextTile, enterHeading);
                    } else if (nextTile.type.startsWith('road') && !isNextOneWay) {
                      // Always right-hand traffic lane on normal roads
                      const destStop = activeDestination
                        ? getBusStopTileAt(
                            currentGrid,
                            activeDestination.x,
                            activeDestination.y,
                          )
                        : undefined;
                      const preferOuter =
                        !!destStop &&
                        headingDiffDeg(
                          enterHeading,
                          getBusStopApproachHeading(destStop),
                        ) <= 50;
                      enterLane = getLegalTrafficLane(isNext4Lane, preferOuter);
                    }
                  }
                  
                  // Force vehicles strictly forward on rail crossings without turning
                  if (nextTile.type === 'rail-road-crossing') {
                     const isEnteringRailAxis = (nextEntryPort % 2 === (nextTile.rotation / 90) % 2);
                     if (vehicle.type === 'train' && !isEnteringRailAxis) {
                         // Turn around if Train entering road axis
                         newVehicleState = allowUTurnAtDeadEnd ? { 
                           ...vehicle, heading: (exitHeading + 180) % 360, progress: 0, isMoving: true 
                         } : { ...vehicle, progress: 0.99, isMoving: false };
                     } else if (vehicle.type !== 'train' && isEnteringRailAxis) {
                         // Turn around if Car entering rail axis
                         newVehicleState = allowUTurnAtDeadEnd ? { 
                           ...vehicle, heading: (exitHeading + 180) % 360, progress: 0, isMoving: true 
                         } : { ...vehicle, progress: 0.99, isMoving: false };
                     } else {
                         // Must continue straight over the crossing without turning intent checking
                         newVehicleState = {
                           ...activeVehicle,
                           x: nextX,
                           y: nextY,
                           heading: enterHeading,
                           progress: progress - 1,
                           zIndex: 0,
                           turnIntent: null,
                           lane: enterLane,
                           ...getDestinationArrivalPatch(activeVehicle, nextX, nextY),
                         };

                     }
                  } else {
                    newVehicleState = {
                      ...activeVehicle,
                      x: nextX,
                      y: nextY,
                      heading: enterHeading,
                      progress: progress - 1,
                      zIndex: nextIsBridge ? 1 : 0,
                      turnIntent: activeDestination
                        ? null
                        : (allowRandomTurning
                            ? (['left', 'right', 'straight'][Math.floor(Math.random() * 3)] as any)
                            : null),
                      // Taxis keep the curved exit heading. A driven taxi also keeps its lane.
                      // Autonomous taxis and buses take the legal lane.
                      // One-way: keep the current lane (both lanes are legal).
                      lane:
                        isNextOneWay
                          ? enterLane
                          : vehicle.type === 'taxi' || vehicle.type === 'bus'
                            ? enterLane
                            : activeVehicle.type === 'train'
                              ? 0
                              : isNext4Lane
                                ? lane
                                : emergencyMode
                                  ? lane
                                  : 1,
                      ...getDestinationArrivalPatch(activeVehicle, nextX, nextY),
                    };
                  }
                  } else {
                    // Turn around at dead end (not connected port)
                    newVehicleState = allowUTurnAtDeadEnd ? { 
                      ...vehicle, 
                      heading: (exitHeading + 180) % 360, 
                      progress: 0, 
                      isMoving: true 
                    } : { ...vehicle, progress: 0.99, isMoving: false };
                  }
                } else {
                  // Turn around if no matching tile
                  newVehicleState = allowUTurnAtDeadEnd ? { 
                    ...vehicle, 
                    heading: (exitHeading + 180) % 360, 
                    progress: 0, 
                    isMoving: true 
                  } : { ...vehicle, progress: 0.99, isMoving: false };
                }
              } else {
              // Turn around if no next tile in grid
              newVehicleState = allowUTurnAtDeadEnd ? { 
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

        let working = nextVehicles;
        for (const id of Object.keys(working)) {
          const tv = working[id];
          if (tv.type !== 'tow-truck' || !tv.towedVehicleId) continue;
          const snapped = snapTowedVehicle(working, working[id]);
          if (snapped !== working) {
            working = snapped;
            hasChanges = true;
          }
        }

        return hasChanges ? working : prev;
      });

      if (pendingPeopleUpdate) {
        const nextEco = { ...localEconomyRef.current, people: pendingPeopleUpdate };
        localEconomyRef.current = nextEco;
        setEconomy(nextEco);
        if (roomCodeRef.current) {
          socket.emit('update-economy', {
            roomCode: roomCodeRef.current,
            economy: nextEco,
          });
        }
      }
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
      const realNow = Date.now();
      const simNow = getSimNow(eco, realNow);
      const { economy: nextEco, vehicles: nextVs } = tickPeopleSimulation(
        eco,
        vehiclesRef.current,
        gridRef.current,
        simNow,
        localTrafficRef.current,
        { realNow },
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

  // Smooth sidewalk walking (~4 steps/sec) so person icons animate between AI ticks
  useEffect(() => {
    if (!roomCode || !isSimLeader) return;
    const iv = setInterval(() => {
      const eco = localEconomyRef.current;
      if (!eco || eco.peoplePaused || !eco.people) return;
      const simNow = getSimNow(eco, Date.now());
      let changed = false;
      const peopleMap = eco.people as Record<string, Person>;
      let nextPeople: Record<string, Person> = { ...peopleMap };
      let nextVehicles = { ...vehiclesRef.current };
      for (const [id, p] of Object.entries(nextPeople)) {
        let cur = p;
        if (p.location.kind === 'walking' || p.activity === 'walking') {
          const walked = advanceWalkingPerson(
            p,
            gridRef.current,
            localTrafficRef.current,
            simNow,
            0.22,
            eco.buildings,
          );
          if (walked !== p) {
            nextPeople[id] = walked;
            cur = walked;
            changed = true;
          }
        }
        const pickupId = cur.travelIntent?.pickupVehicleId;
        if (!pickupId) continue;
        const car = nextVehicles[pickupId];
        if (!car || !personNearVehicle(cur, car, 2)) continue;
        const patch = startPersonTravel(cur, cur.travelIntent!, simNow, {
          grid: gridRef.current,
          buildings: eco.buildings || {},
          vehicles: nextVehicles,
          people: nextPeople,
          traffic: localTrafficRef.current,
        });
        const applied = applyPeopleSimPatch(patch, nextPeople, nextVehicles, simNow);
        nextPeople = applied.people;
        nextVehicles = applied.vehicles;
        changed = true;
      }
      if (!changed) return;
      const nextEco = { ...eco, people: nextPeople };
      setEconomy(nextEco);
      setVehicles(nextVehicles);
      if (roomCode) {
        socket.emit('update-economy', { roomCode, economy: nextEco });
        socket.emit('update-vehicles', { roomCode, vehicles: nextVehicles });
      }
    }, 250);
    return () => clearInterval(iv);
  }, [roomCode, isSimLeader, setEconomy]);

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
        // Stores consume only when shoppers check out (1 unit per customer per visit).
        // Rate is units/sec/customer and controls how long each shopper stays.
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
      emitTraffic(current => {
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
        return changed ? { ...current, controls: nextControls } : current;
      });
    }, 250);
    return () => clearInterval(iv);
  }, [roomCode, isSimLeader, emitTraffic]);

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
      // Don't trigger shortcuts if typing in an input / select
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.repeat) return;

      // Vehicle controls (F/B step, L/R turn at intersections, arrows lane/speed)
      // R rotates the palette tile while a tile is selected for placement.
      // When a floating drive panel is active, ALL vehicle keystrokes go to that vehicle only.
      const inTilePlacementMode = selectedTile !== null;
      const driveTargetId =
        activeDrivePanelId && vehicles[activeDrivePanelId] ? activeDrivePanelId : null;
      const myUid = userRef.current?.uid;
      const controlIds: string[] = (driveTargetId
        ? [driveTargetId]
        : Array.from(selectedVehicles)
      ).filter(id => {
        const v = vehicles[id];
        if (v?.towedById) return false;
        if (!v?.manualOverride || !v.manualOverrideByUid) return true;
        // Only the user who holds manual override may key-drive that vehicle
        return !!myUid && v.manualOverrideByUid === myUid;
      });

      if (controlIds.length > 0) {
        const key = e.key.toLowerCase();
        const isArrowKey = e.key.startsWith('Arrow');
        const isVehicleControlKey =
          key === 'g' || key === 's' || key === 'f' || key === 'b' ||
          key === 'l' || key === 'u' || (key === 'r' && !inTilePlacementMode) || isArrowKey;

        if (isVehicleControlKey) {
          // Prevent focused UI buttons (e.g. Destination 🎯) from also activating
          e.preventDefault();
          e.stopPropagation();
          if (document.activeElement instanceof HTMLElement) {
            const tag = document.activeElement.tagName;
            if (tag === 'BUTTON' || tag === 'A') {
              document.activeElement.blur();
            }
          }

          // Merge onto vehiclesRef so step flags aren't applied to a stale React snapshot
          // (sim loop writes the ref every frame; state can lag one render).
          setVehicles(prev => {
            const base =
              vehiclesRef.current && Object.keys(vehiclesRef.current).length > 0
                ? vehiclesRef.current
                : prev;
            let anyUpdated = false;
            const updatedVehicles = { ...base };

            for (const id of controlIds) {
              const myVehicle = updatedVehicles[id];
              if (!myVehicle) continue;
              let updated = false;
              let newVehicle = { ...myVehicle };

              if (key === 'g') {
                newVehicle.isMoving = !newVehicle.isMoving;
                // Manual Go: don't let home-tour AI instantly assign a destination
                if (newVehicle.isMoving && newVehicle.homeKey) {
                  newVehicle.nextHomeReturnAt = Date.now() + randomHomeTourDelayMs();
                }
                // Cancel parking so Go isn't swallowed by dwell timer
                if (newVehicle.isMoving && newVehicle.parkingStopUntil) {
                  delete newVehicle.parkingStopUntil;
                }
                updated = true;
              } else if (key === 's') {
                if (newVehicle.isMoving !== false || newVehicle.trafficStopReason) {
                  newVehicle.isMoving = false;
                  // A driver Stop stays stopped when the light turns green.
                  delete newVehicle.trafficStopReason;
                  delete newVehicle.trafficStopUntil;
                  updated = true;
                }
              } else if (key === 'f') {
                newVehicle.isMoving = false;
                newVehicle.stepForward = true;
                newVehicle.stepBackward = false;
                if (newVehicle.parkingStopUntil) delete newVehicle.parkingStopUntil;
                if (newVehicle.trafficStopReason === 'stoplight') {
                  delete newVehicle.trafficStopReason;
                }
                updated = true;
              } else if (key === 'b') {
                newVehicle.isMoving = false;
                newVehicle.stepBackward = true;
                newVehicle.stepForward = false;
                if (newVehicle.parkingStopUntil) delete newVehicle.parkingStopUntil;
                if (newVehicle.trafficStopReason === 'stoplight') {
                  delete newVehicle.trafficStopReason;
                }
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
                if ((newVehicle.type || 'car') === 'train') continue;

                const currentTiles = gridRef.current[`${myVehicle.x},${myVehicle.y}`];
                const currentTile = currentTiles?.find(t => {
                  const isBridge = t.type.includes('bridge') || t.type.includes('trestle');
                  return (myVehicle.zIndex === 1 && isBridge) || (myVehicle.zIndex === 0 && !isBridge);
                });

                if (!currentTile?.type.startsWith('road')) continue;

                const is4Lane = currentTile.type.includes('4lane');
                const nextLane = e.key === 'ArrowRight'
                  ? shiftLaneRight(newVehicle.lane, is4Lane)
                  : shiftLaneLeft(newVehicle.lane, is4Lane);
                if (nextLane !== null && nextLane !== newVehicle.lane) {
                  newVehicle.lane = nextLane;
                  updated = true;
                }
              } else if (key === 'l' || key === 'r') {
                if ((newVehicle.type || 'car') === 'train') continue;

                const currentTiles = gridRef.current[`${myVehicle.x},${myVehicle.y}`];
                const currentTile = currentTiles?.find(t => {
                  const isBridge = t.type.includes('bridge') || t.type.includes('trestle');
                  return (myVehicle.zIndex === 1 && isBridge) || (myVehicle.zIndex === 0 && !isBridge);
                });

                if (!currentTile?.type.startsWith('road')) continue;
                if (!isIntersectionTile(currentTile.type)) continue;

                const intent = key === 'r' ? 'right' : 'left';
                if (newVehicle.turnIntent !== intent) {
                  newVehicle.turnIntent = intent;
                  updated = true;
                }
              } else if (key === 'u') {
                if ((newVehicle.type || 'car') === 'train') continue;

                const currentTiles = gridRef.current[`${myVehicle.x},${myVehicle.y}`];
                const currentTile = currentTiles?.find(t => {
                  const isBridge = t.type.includes('bridge') || t.type.includes('trestle');
                  return (myVehicle.zIndex === 1 && isBridge) || (myVehicle.zIndex === 0 && !isBridge);
                });

                if (!currentTile?.type.startsWith('road')) continue;
                if (!isRoundabout4Way(currentTile.type)) continue;

                if (newVehicle.turnIntent !== 'uturn') {
                  newVehicle.turnIntent = 'uturn';
                  updated = true;
                }
              }

              if (updated) {
                updatedVehicles[id] = newVehicle;
                anyUpdated = true;
              }
            }

            if (!anyUpdated) return prev;

            if (roomCodeRef.current) {
              // Emit after commit; use updated map from this updater
              queueMicrotask(() => {
                const latest = vehiclesRef.current;
                socket.emit('update-vehicles', {
                  roomCode: roomCodeRef.current,
                  vehicles: latest,
                });
              });
            }
            return updatedVehicles;
          });
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
        setPendingPersonFormPick(null);
        setPendingRouteVehicleId(null);
        setPendingBusRouteVehicleId(null);
        setPendingBusRouteEdit(null);
        setIsPlacingVehicles(false);
        setIsPlacingPeople(false);
        setInspectHomeKey(null);
        setBotPickMode(null);
        setBotPickAsk(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    undo, redo, copySelection, cutSelection, deleteSelection, clipboard,
    rotateClipboard, rotateSelection, isPasting, selectionStart, selectionEnd,
    selectedTile, selectedVehicles, vehicles, user, activeDrivePanelId, roomCode,
  ]);

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

    const nextHoverKey = isWithinGridCanvas(worldX, worldY) ? `${worldX},${worldY}` : null;
    if (nextHoverKey !== hoverKeyRef.current) {
      hoverKeyRef.current = nextHoverKey;
      setHoveredGridKey(nextHoverKey);
      // Hide coordinates immediately when the pointer leaves a tile
      setCoordLabelKey(null);
      if (hoverCoordTimerRef.current) {
        clearTimeout(hoverCoordTimerRef.current);
        hoverCoordTimerRef.current = null;
      }
      // After 3s dwell on the same tile, show its coordinates until leave
      if (nextHoverKey) {
        hoverCoordTimerRef.current = setTimeout(() => {
          if (hoverKeyRef.current === nextHoverKey) {
            setCoordLabelKey(nextHoverKey);
          }
        }, 3000);
      }
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setIsSelecting(false);
    pointerDownRef.current = null;
  };

  const clearTileHover = useCallback(() => {
    hoverKeyRef.current = null;
    setHoveredGridKey(null);
    setCoordLabelKey(null);
    if (hoverCoordTimerRef.current) {
      clearTimeout(hoverCoordTimerRef.current);
      hoverCoordTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (hoverCoordTimerRef.current) clearTimeout(hoverCoordTimerRef.current);
    };
  }, []);

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

  /**
   * Place selected people on a map cell (or create a new person if none selected).
   * Roads → sidewalk curb nearest the click.
   */
  const placePeopleAt = useCallback(
    (gridX: number, gridY: number, worldX: number, worldY: number): boolean => {
      if (!isPlacingPeople || !roomCode) return false;
      const g = gridRef.current;
      const key = `${gridX},${gridY}`;
      // Allow empty grass cells by treating as outdoor even if no tile
      const hasCell = !!g[key]?.length;
      const localX = worldX - gridX * GRID_SIZE;
      const localY = worldY - gridY * GRID_SIZE;
      const relX = localX / GRID_SIZE;
      const relY = localY / GRID_SIZE;
      const now = getSimNow(localEconomyRef.current, Date.now());
      let people = { ...(localEconomyRef.current.people || {}) };
      let families = { ...(localEconomyRef.current.families || {}) };
      const ids =
        selectedPersonIds.size > 0
          ? Array.from(selectedPersonIds)
          : [];

      // No selection → create a new person at this spot
      if (ids.length === 0) {
        const top = g[key]?.[g[key].length - 1];
        let homeKey = listHomeKeys(g)[0] || '';
        if (top && isResidentialHomeType(top.type)) {
          homeKey = resolveHomeKeyFromTile(top, key);
        } else if (!homeKey) {
          // No homes yet — use this cell as a synthetic home address
          homeKey = key;
        }
        const sex = Math.random() < 0.5 ? 'm' : 'f';
        const person = createPerson({
          firstName: randomFirstName(sex as 'm' | 'f'),
          lastName: randomLastName(),
          sex: sex as 'm' | 'f',
          ageYears: 22 + Math.floor(Math.random() * 40),
          homeKey,
          money: 40 + Math.floor(Math.random() * 80),
          now,
          placeAtWorkplaceIfNew: false,
        });
        person.location = locationForMapPlacement(gridX, gridY, g, {
          relX,
          relY,
          stackIndex: 0,
        });
        person.activity =
          person.location.kind === 'home' ? 'home' : 'idle';
        person.activityUntil = now + 8000;
        // Family bookkeeping
        const existingFam = Object.values(families).find(
          f => f.homeKey === homeKey && f.lastName === person.lastName,
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
            homeKey,
            memberIds: [person.id],
          };
        }
        people[person.id] = person;
        const nextEco = { ...localEconomyRef.current, people, families };
        setEconomy(nextEco);
        setVehicles(vs => {
          const next = { ...vs };
          Object.keys(next).forEach(vid => {
            next[vid] = syncVehicleOccupancy(next[vid], people);
          });
          return next;
        });
        setSelectedPersonIds(new Set([person.id]));
        if (roomCode) {
          socket.emit('update-economy', { roomCode, economy: nextEco });
        }
        return true;
      }

      // Place each selected person, fanning out on the same curb
      let stack = 0;
      for (const pid of ids) {
        const p = people[pid];
        if (!p) continue;
        // Alight if currently in a vehicle
        if (p.location.kind === 'vehicle') {
          people = alightPerson(
            people,
            pid,
            { kind: 'tile', x: gridX, y: gridY },
            'idle',
            now + 5000,
          );
        }
        const cur = people[pid];
        if (!cur) continue;
        const loc = locationForMapPlacement(gridX, gridY, g, {
          relX,
          relY,
          stackIndex: stack,
        });
        people[pid] = {
          ...cur,
          location: loc,
          activity: loc.kind === 'home' ? 'home' : 'idle',
          activityUntil: now + 8000,
          travelIntent: undefined,
          taxiRideId: undefined,
          busDropoffStop: undefined,
        };
        stack += 1;
      }

      const nextEco = { ...localEconomyRef.current, people, families };
      setEconomy(nextEco);
      let nextVehicles = { ...vehiclesRef.current };
      Object.keys(nextVehicles).forEach(vid => {
        nextVehicles[vid] = syncVehicleOccupancy(nextVehicles[vid], people);
      });
      setVehicles(nextVehicles);
      if (roomCode) {
        socket.emit('update-economy', { roomCode, economy: nextEco });
        socket.emit('update-vehicles', { roomCode, vehicles: nextVehicles });
      }
      return true;
    },
    [isPlacingPeople, roomCode, selectedPersonIds, setEconomy, setVehicles],
  );

  /** Teleport selected vehicles onto a grid cell (place-car / MapPin mode). */
  const placeSelectedVehiclesAt = useCallback((
    gridX: number,
    gridY: number,
    worldX: number,
    worldY: number,
  ): boolean => {
    if (!isPlacingVehicles || selectedVehicles.size === 0) return false;
    if (!hasTile(gridX, gridY)) return false;

    const localX = worldX - gridX * GRID_SIZE;
    const localY = worldY - gridY * GRID_SIZE;
    const existingTiles = getTile(gridX, gridY)!;
    const targetTile = existingTiles[existingTiles.length - 1];
    if (!targetTile) return false;

    // Only place on roads / rails / parking / homes / bays that match vehicle class
    const tileType = targetTile.type;
    const isRoad = tileType.startsWith('road') || tileType === 'rail-road-crossing';
    const isRail = tileType.startsWith('rail');
    const isParking = tileType.startsWith('parking-');
    const isHome = isResidentialHomeType(tileType);
    const isBay = isBuildingParkingBay(targetTile);

    let zIndex = 0;
    if (tileType.includes('bridge') || tileType.includes('trestle')) {
      zIndex = 1;
    }

    let lane = 1;
    let heading = targetTile.rotation;
    const relX = localX / GRID_SIZE;
    const relY = localY / GRID_SIZE;
    const is4Lane = tileType.includes('4lane');
    const isOneWay = tileType.includes('oneway');

    if (isRail) {
      lane = 0;
      if (targetTile.rotation === 0 || targetTile.rotation === 180) {
        heading = relY > 0.5 ? 0 : 180;
      } else {
        heading = relX < 0.5 ? 90 : 270;
      }
    } else if (isOneWay) {
      const ow = getOneWayTravel(targetTile);
      heading = ow ? ow.heading : targetTile.rotation;
      if (heading === 0 || heading === 180) {
        lane = relX > 0.5 ? 1 : -1;
        if (heading === 180) lane = -lane;
      } else {
        lane = relY > 0.5 ? -1 : 1;
        if (heading === 270) lane = -lane;
      }
    } else if (isRoad) {
      if (targetTile.rotation === 0 || targetTile.rotation === 180 || tileType.includes('cross')) {
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
    } else {
      // Parking / home / bay: keep heading from vehicle or default northbound
      heading = 0;
      lane = 1;
    }

    const live = vehiclesRef.current;
    const updatedVehicles = { ...live };
    let anyPlaced = false;

    selectedVehicles.forEach(id => {
      const v = updatedVehicles[id];
      if (!v) return;
      const vType = v.type || 'car';
      // Validate tile class vs vehicle
      if (vType === 'train') {
        if (!isRail && tileType !== 'rail-road-crossing' && !isBay) return;
      } else if (vType === 'semi') {
        if (!isRoad && !isParking && !isBay && tileType !== 'rail-road-crossing') return;
      } else {
        // cars / service
        if (!isRoad && !isParking && !isHome && !isBay && tileType !== 'rail-road-crossing') return;
      }

      const placeLane = vType === 'train' ? 0 : lane;
      const placed: Vehicle = {
        ...v,
        x: gridX,
        y: gridY,
        heading: vType === 'train' && isRail ? heading : (isRoad || isRail ? heading : (v.heading || 0)),
        lane: placeLane,
        progress: 0.5,
        zIndex,
        placeSeq: (v.placeSeq || 0) + 1,
        // Stay put after place
        isMoving: false,
        destination: null,
        turnIntent: null,
        stepForward: false,
        stepBackward: false,
        parkOnNextLot: false,
      };
      delete placed.parkingStopUntil;
      delete placed.trafficStopUntil;
      delete placed.trafficStopReason;
      if (placed.homeKey && !placed.manualOverride) {
        placed.nextHomeReturnAt = Date.now() + randomHomeTourDelayMs();
      } else if (placed.manualOverride) {
        delete placed.nextHomeReturnAt;
      }
      updatedVehicles[id] = placed;
      anyPlaced = true;
    });

    if (!anyPlaced) return false;

    setVehicles(updatedVehicles);
    if (roomCode) {
      lastSyncedVehicles.current = updatedVehicles;
      socket.emit('update-vehicles', { roomCode, vehicles: updatedVehicles });
    }
    // Stay in place mode so multiple cars can be positioned; user toggles MapPin off
    return true;
  }, [isPlacingVehicles, selectedVehicles, roomCode, getTile, hasTile]);

  const getBotContext = useCallback((): BotContext => {
    if (selectionStart && selectionEnd) {
      const minX = Math.min(selectionStart.x, selectionEnd.x);
      const minY = Math.min(selectionStart.y, selectionEnd.y);
      const maxX = Math.max(selectionStart.x, selectionEnd.x);
      const maxY = Math.max(selectionStart.y, selectionEnd.y);
      return {
        aim: { x: minX, y: minY },
        selection: { minX, minY, maxX, maxY },
      };
    }
    const cw = containerRef.current?.clientWidth ?? 800;
    const ch = containerRef.current?.clientHeight ?? 600;
    const sidebar = showSidebar ? SIDEBAR_WIDTH : 0;
    const worldX = ((cw + sidebar) / 2 - offset.x) / zoom;
    // Use visual center of the map viewport (container already excludes sidebar layout-wise;
    // mouse math subtracts sidebar when sidebar overlays — prefer container center).
    const cx = (cw / 2 - offset.x) / zoom;
    const cy = (ch / 2 - offset.y) / zoom;
    const aim = {
      x: Math.floor(cx / GRID_SIZE),
      y: Math.floor(cy / GRID_SIZE),
    };
    void worldX;
    void sidebar;
    return { aim, selection: null };
  }, [selectionStart, selectionEnd, offset.x, offset.y, zoom, showSidebar]);

  const executeBotActions = useCallback(
    async (
      actions: BotAction[],
      onProgress?: (msg: string) => void,
    ): Promise<{ summary: string }> => {
      const ctxInfo = getBotContext();
      const defaultOrigin = ctxInfo.aim;
      const occupied = (x: number, y: number) => {
        const tiles = gridRef.current[`${x},${y}`];
        return !!(tiles && tiles.length);
      };
      const concrete = expandActions(actions, defaultOrigin, {
        occupied,
        inBounds: isWithinGridCanvas,
      });

      let placedTiles = 0;
      let placedBuildings = 0;
      let deleted = 0;
      let busesSpawned = 0;
      let skipped = 0;
      let busSetups = 0;

      let workingGrid: GridData = { ...gridRef.current };
      let workingEco: EconomyState = {
        ...(localEconomyRef.current || economy),
        buildings: { ...(localEconomyRef.current || economy).buildings },
      };
      let workingVehicles: Record<string, Vehicle> = { ...vehiclesRef.current };

      const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

      const applyPlaceTile = (x: number, y: number, tile: string, rotation: number) => {
        if (!isWithinGridCanvas(x, y)) {
          skipped += 1;
          return;
        }
        const key = `${x},${y}`;
        const isBuilding = tile.startsWith('building-');
        const isMulti =
          tile.startsWith('parking-') ||
          tile === 'building-strip-mall' ||
          tile === 'building-lumbermill' ||
          tile === 'building-apartment' ||
          tile === 'building-highschool' ||
          tile === 'building-college' ||
          tile === 'building-university' ||
          tile === 'building-large-park' ||
          tile === 'building-warehouse-large' ||
          tile === 'building-factory-large' ||
          tile === 'building-train-station-large' ||
          tile === 'building-repair-shop' ||
          tile === 'building-hospital' ||
          tile === 'building-taxi-station' ||
          tile === 'building-bus-station';

        if (isMulti || (isBuilding && getMultiTileDimensions(tile).w * getMultiTileDimensions(tile).h > 1)) {
          const { w, h } = getMultiTileDimensions(tile);
          const cells = getMultiTileCells(tile, rotation);
          if (!cells.every(c => isWithinGridCanvas(x + c.dx, y + c.dy))) {
            skipped += 1;
            return;
          }
          // Skip if any cell occupied
          if (cells.some(c => (workingGrid[`${x + c.dx},${y + c.dy}`] || []).length)) {
            skipped += 1;
            return;
          }
          cells.forEach(cell => {
            const targetKey = `${x + cell.dx},${y + cell.dy}`;
            const newTile: GridTile = {
              type: tile as TileType,
              rotation,
              part: cell.isAnchor ? 'anchor' : 'member',
              localX: cell.localX,
              localY: cell.localY,
              w,
              h,
              anchorKey: `${x},${y}`,
            };
            workingGrid[targetKey] = [newTile];
          });
          placedBuildings += 1;
          if (isEconomyBuilding(tile) && !workingEco.buildings[`${x},${y}`]) {
            workingEco = {
              ...workingEco,
              buildings: {
                ...workingEco.buildings,
                [`${x},${y}`]: createBuildingConfig(`${x},${y}`, tile),
              },
            };
          }
          return;
        }

        if ((workingGrid[key] || []).length && isBuilding) {
          skipped += 1;
          return;
        }
        const isTree = tile.startsWith('tree-');
        const finalRotation = isBuilding || isTree ? 0 : rotation;
        const newTile: GridTile = {
          type: tile as TileType,
          rotation: finalRotation,
        };
        workingGrid[key] = [newTile];
        if (isBuilding) {
          placedBuildings += 1;
          if (isEconomyBuilding(tile) && !workingEco.buildings[key]) {
            workingEco = {
              ...workingEco,
              buildings: {
                ...workingEco.buildings,
                [key]: createBuildingConfig(key, tile),
              },
            };
          }
        } else {
          placedTiles += 1;
        }
      };

      const flush = () => {
        setGrid(workingGrid);
        gridRef.current = workingGrid;
        setEconomy(workingEco);
        localEconomyRef.current = workingEco;
        setVehicles(workingVehicles);
        vehiclesRef.current = workingVehicles;
        if (roomCode) {
          socket.emit('update-economy', { roomCode, economy: workingEco });
          socket.emit('update-vehicles', { roomCode, vehicles: workingVehicles });
        }
      };

      for (let i = 0; i < concrete.length; i++) {
        const op = concrete[i];
        if (op.op === 'place_tile' || op.op === 'place_building') {
          applyPlaceTile(op.x, op.y, op.tile, op.rotation);
        } else if (op.op === 'delete_cells') {
          for (const c of op.cells) {
            const k = `${c.x},${c.y}`;
            if (workingGrid[k]) {
              delete workingGrid[k];
              deleted += 1;
            }
          }
        } else if (op.op === 'setup_bus_service') {
          const stationKey = `${op.station.x},${op.station.y}`;
          // Ensure station building exists
          const stTiles = workingGrid[stationKey];
          const top = stTiles?.[stTiles.length - 1];
          if (!top || top.type !== 'building-bus-station') {
            applyPlaceTile(op.station.x, op.station.y, 'building-bus-station', 0);
          }
          // Ensure stop road tiles
          const stopKeys: string[] = [];
          for (const s of op.stops.slice(0, BOT_ACTION_LIMITS.maxBusStops)) {
            const sk = `${s.x},${s.y}`;
            const tiles = workingGrid[sk];
            const t = tiles?.[tiles.length - 1];
            if (!t || !String(t.type).includes('bus-stop')) {
              applyPlaceTile(s.x, s.y, 'road-bus-stop', t?.rotation ?? 0);
            }
            stopKeys.push(sk);
          }
          let cfg = workingEco.buildings[stationKey];
          if (!cfg || cfg.role !== 'bus-station') {
            cfg = createBuildingConfig(stationKey, 'building-bus-station');
          }
          const existingRoutes = busRoutesOf(cfg);
          const routeId = makeBusRouteId();
          const addedRoute = {
            id: routeId,
            name: `Route ${existingRoutes.length + 1}`,
            stops: stopKeys,
          };
          cfg = withBusRoutes(
            { ...cfg, busFleetIds: [...(cfg.busFleetIds || [])] },
            stopKeys.length ? [...existingRoutes, addedRoute] : existingRoutes,
          );
          workingEco = {
            ...workingEco,
            buildings: { ...workingEco.buildings, [stationKey]: cfg },
          };

          const wantBuses = Math.min(op.buses, BOT_ACTION_LIMITS.maxBuses);
          // Need grid flushed-ish for bay finder — use workingGrid
          const bays = findBusBayCells(stationKey, workingGrid);
          let fleet = [...(cfg.busFleetIds || [])];
          for (let b = 0; b < wantBuses; b++) {
            const spawn = bays[b] || bays[0];
            if (!spawn) break;
            const id = makeVehicleId('bus');
            const first = stopKeys[0] ? stopKeys[0].split(',').map(Number) : null;
            const destination = first && first.length === 2 ? { x: first[0], y: first[1] } : null;
            workingVehicles[id] = {
              id,
              x: spawn.x,
              y: spawn.y,
              heading: 0,
              lane: 1,
              progress: 0.5,
              color: SERVICE_VEHICLE_META.bus.color,
              zIndex: 0,
              type: 'bus',
              isMoving: !!destination,
              speed: 0.9,
              turnAroundAtDeadEnd: true,
              randomTurning: false,
              parkingStallIndex: spawn.bayIndex,
              lastParkingKey: stationKey,
              busStationKey: stationKey,
              maxPassengers: getMaxPassengers('bus'),
              busRouteId: stopKeys.length ? routeId : undefined,
              busRoute: [...stopKeys],
              busRouteIndex: 0,
              busRouteLoops: 0,
              busPhase: stopKeys.length ? 'route' : undefined,
              destination,
              manualOverride: false,
            };
            fleet.push(id);
            busesSpawned += 1;
          }
          workingEco = {
            ...workingEco,
            buildings: {
              ...workingEco.buildings,
              [stationKey]: withBusRoutes({ ...cfg, busFleetIds: fleet }, busRoutesOf(cfg)),
            },
          };
          busSetups += 1;
        }

        if ((i + 1) % BOT_ACTION_LIMITS.batchSize === 0) {
          flush();
          onProgress?.(
            `Placing… ${i + 1}/${concrete.length} ops (${placedBuildings} buildings, ${placedTiles} tiles)`,
          );
          await sleep(BOT_ACTION_LIMITS.batchDelayMs);
          // Refresh working copies in case sync merged
          workingGrid = { ...gridRef.current };
          workingEco = {
            ...(localEconomyRef.current || workingEco),
            buildings: { ...(localEconomyRef.current || workingEco).buildings },
          };
          workingVehicles = { ...vehiclesRef.current };
        }
      }

      flush();
      addToHistory(workingGrid);

      const originLabel = `(${defaultOrigin.x}, ${defaultOrigin.y})`;
      const summary = [
        `Done near ${originLabel}:`,
        placedBuildings ? `${placedBuildings} buildings` : null,
        placedTiles ? `${placedTiles} tiles/roads` : null,
        deleted ? `${deleted} deleted` : null,
        busSetups ? `bus service×${busSetups}` : null,
        busesSpawned ? `${busesSpawned} buses` : null,
        skipped ? `${skipped} skipped` : null,
      ]
        .filter(Boolean)
        .join(' · ');
      return { summary: summary || 'No changes applied.' };
    },
    [getBotContext, economy, roomCode, addToHistory],
  );

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

    // GrokBot pick mode — resolve ask without placing palette tiles
    if (botPickMode) {
      if (botPickMode === 'pick_building') {
        if (!hasTile(gridX, gridY)) return;
        const tiles = getTile(gridX, gridY) || [];
        const building = tiles.find(t => t.type.startsWith('building-'));
        if (!building) return;
        const anchorKey =
          building.part === 'member' && building.anchorKey ? building.anchorKey : key;
        const [ax, ay] = anchorKey.split(',').map(Number);
        botPickResultRef.current?.({
          type: 'pick_building',
          x: ax,
          y: ay,
          key: anchorKey,
          buildingType: building.type,
        });
        setBotPickMode(null);
        setBotPickAsk(null);
        return;
      }
      // pick_location — any in-canvas cell
      if (!isWithinGridCanvas(gridX, gridY)) return;
      botPickResultRef.current?.({
        type: 'pick_location',
        x: gridX,
        y: gridY,
        key,
      });
      setBotPickMode(null);
      setBotPickAsk(null);
      return;
    }

    // Place people mode — sidewalk on roads, outdoor elsewhere
    if (isPlacingPeople) {
      if (placePeopleAt(gridX, gridY, worldX, worldY)) {
        return;
      }
      return;
    }

    // Place-car mode takes priority over traffic light taps / house inspectors
    if (isPlacingVehicles && selectedVehicles.size > 0) {
      if (placeSelectedVehiclesAt(gridX, gridY, worldX, worldY)) {
        return;
      }
      // Invalid tile for selected vehicles — keep place mode active
      return;
    }

    // Traffic control placement / interaction
    if (hasTile(gridX, gridY)) {
      const tiles = getTile(gridX, gridY)!;
      const roadTile = getTrafficRoadTile(tiles);
      if (roadTile && isRoadTile(roadTile.type) && !roadTile.type.startsWith('parking-')) {
        if (trafficTool === 'stop-sign' && canPlaceStopSignOnTile(roadTile.type)) {
          const exitPort = detectStopSignPlacementClick(relX, relY, roadTile);
          if (exitPort !== null) {
            emitTraffic(prev => {
              const existing = findStopSignAt(key, exitPort, prev);
              const nextControls = { ...prev.controls };
              if (existing) {
                delete nextControls[trafficControlKey(existing)];
                return { ...prev, controls: nextControls };
              }
              const newSign = createStopSign(key, exitPort, prev.nextSignId);
              nextControls[trafficControlKey(newSign)] = newSign;
              return { ...prev, controls: nextControls, nextSignId: prev.nextSignId + 1 };
            });
          }
          return;
        }
        if (trafficTool === 'stoplight') {
          const slot = detectLightSlotClick(relX, relY, roadTile);
          if (slot) {
            emitTraffic(prev => {
              const existing = getStoplightsAt(key, prev).find(
                l => l.kind === 'stoplight' && l.heading === slot.heading && Math.abs(l.lane - slot.lane) < 0.01
              );
              const nextControls = { ...prev.controls };
              if (existing) {
                delete nextControls[trafficControlKey(existing)];
                return { ...prev, controls: nextControls };
              }
              const slots = getAvailableLightSlots(roadTile);
              const occupied = getStoplightsAt(key, prev).length;
              if (occupied >= slots.length) return prev;
              const newLight = createStoplight(key, slot.heading, slot.lane, prev.nextLightId);
              nextControls[trafficControlKey(newLight)] = newLight;
              return { ...prev, controls: nextControls, nextLightId: prev.nextLightId + 1 };
            });
          }
          return;
        }
        if (!trafficTool && !selectedTile && selectedTrafficIds.size === 1) {
          const selKey = Array.from(selectedTrafficIds)[0];
          emitTraffic(prev => {
            const sel = prev.controls[selKey];
            if (!sel) return prev;
            if (sel.kind === 'stop-sign' && canPlaceStopSignOnTile(roadTile.type)) {
              const exitPort = detectStopSignPlacementClick(relX, relY, roadTile);
              if (exitPort === null) return prev;
              const conflict = findStopSignAt(key, exitPort, prev);
              const samePlace = sel.gridKey === key && sel.edgePort === exitPort;
              if (samePlace || conflict) return prev;
              return {
                ...prev,
                controls: {
                  ...prev.controls,
                  [selKey]: { ...sel, gridKey: key, edgePort: exitPort },
                },
              };
            }
            if (sel.kind === 'stoplight') {
              const slot = detectLightSlotClick(relX, relY, roadTile);
              if (!slot) return prev;
              const conflict = getStoplightsAt(key, prev).find(
                l => l.kind === 'stoplight' && l.id !== sel.id && l.heading === slot.heading && Math.abs(l.lane - slot.lane) < 0.01
              );
              const samePlace =
                sel.gridKey === key &&
                sel.heading === slot.heading &&
                Math.abs(sel.lane - slot.lane) < 0.01;
              if (conflict || samePlace) return prev;
              return {
                ...prev,
                controls: {
                  ...prev.controls,
                  [selKey]: { ...sel, gridKey: key, heading: slot.heading, lane: slot.lane },
                },
              };
            }
            return prev;
          });
          return;
        }
        if (!trafficTool && !selectedTile && selectedTrafficIds.size === 0) {
          const slot = detectLightSlotClick(relX, relY, roadTile);
          if (slot) {
            emitTraffic(prev => {
              const light = getStoplightsAt(key, prev).find(
                l => l.kind === 'stoplight' && l.heading === slot.heading && Math.abs(l.lane - slot.lane) < 0.01
              );
              if (!light || light.kind !== 'stoplight') return prev;
              const nextPhase = cycleLightPhase(light.phase);
              return {
                ...prev,
                controls: {
                  ...prev.controls,
                  [trafficControlKey(light)]: {
                    ...light,
                    phase: nextPhase,
                    phaseStartedAt: Date.now(),
                  },
                },
              };
            });
            return;
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

    // Person create/edit form: pick home (house/apartment) or workplace (building) by map click
    if (pendingPersonFormPick && peopleFormMode !== 'closed' && hasTile(gridX, gridY)) {
      const tiles = getTile(gridX, gridY) || [];
      if (pendingPersonFormPick === 'home') {
        const house = tiles.find(t => isResidentialHomeType(t.type));
        if (house) {
          const homeKey = resolveHomeKeyFromTile(house, key);
          setPeopleForm(f => ({ ...f, homeKey }));
          setPendingPersonFormPick(null);
          setShowPeoplePanel(true);
          return;
        }
        // Keep pick mode active until a house/apartment is clicked
        return;
      }
      if (pendingPersonFormPick === 'workplace') {
        const building = tiles.find(
          t => t.type.startsWith('building-') && !isResidentialHomeType(t.type),
        );
        if (building) {
          const workplaceKey =
            building.part === 'member' ? (building.anchorKey || key) : key;
          // Ensure economy config exists when picking a workplace building
          if (isEconomyBuilding(building.type) && !economy.buildings[workplaceKey]) {
            const initCfg = createBuildingConfig(workplaceKey, building.type);
            const nextEco = {
              ...economy,
              buildings: { ...economy.buildings, [workplaceKey]: initCfg },
            };
            setEconomy(nextEco);
            if (roomCode) socket.emit('update-economy', { roomCode, economy: nextEco });
          }
          setPeopleForm(f => ({ ...f, workplaceKey }));
          setPendingPersonFormPick(null);
          setShowPeoplePanel(true);
          return;
        }
        return;
      }
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
          { now: Date.now() },
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

    // Assign selected cars to a house/apartment as their owner home (+ adult driver)
    if (pendingHomeAssign && selectedVehicles.size > 0 && hasTile(gridX, gridY)) {
      const tiles = getTile(gridX, gridY) || [];
      const house = tiles.find(t => isResidentialHomeType(t.type));
      if (house) {
        const homeKey = resolveHomeKeyFromTile(house, key);
        const live = vehiclesRef.current;
        const now = Date.now();
        const assignments: Array<{ vehicleId: string; homeKey: string; nextHomeReturnAt: number }> = [];
        selectedVehicles.forEach(id => {
          const v = live[id];
          if (!v) return;
          const vType = v.type || 'car';
          // Homes are for cars (and service vehicles); not trains/semis
          if (vType === 'train' || vType === 'semi') return;
          assignments.push({
            vehicleId: id,
            homeKey,
            nextHomeReturnAt: now + randomHomeTourDelayMs(),
          });
        });
        if (assignments.length > 0) {
          const eco = localEconomyRef.current || economy;
          const result = assignHomesWithDrivers(
            live,
            eco.people || {},
            eco.families || {},
            assignments,
            now,
          );
          setVehicles(result.vehicles);
          const nextEco = { ...eco, people: result.people, families: result.families };
          setEconomy(nextEco);
          if (roomCode) {
            socket.emit('update-vehicles', { roomCode, vehicles: result.vehicles });
            socket.emit('update-economy', { roomCode, economy: nextEco });
          }
        }
        setPendingHomeAssign(false);
        return;
      }
      // Clicked non-house while assigning — ignore (keep mode active)
      return;
    }

    // Bus station route editing: click bus-stop tiles to append to the selected route
    if (pendingBusRouteEdit && hasTile(gridX, gridY)) {
      const tiles = getTile(gridX, gridY) || [];
      const top = tiles[tiles.length - 1];
      if (top && isBusStopTileType(top.type)) {
        const stopKey = key;
        const eco = localEconomyRef.current || economy;
        const { stationKey, routeId } = pendingBusRouteEdit;
        const bcfg = eco.buildings[stationKey];
        if (bcfg && bcfg.role === 'bus-station') {
          const before = busRoutesOf(bcfg);
          const live = vehiclesRef.current;
          const stamped = stampRouteIds(live, bcfg.busFleetIds || [], before, stationKey);
          const nextCfg = appendBusRouteStop(bcfg, routeId, stopKey);
          const route = findBusRoute(nextCfg, routeId);
          const nextVehicles = route
            ? syncAssignedBuses(stamped, stationKey, routeId, route.stops)
            : stamped;
          const nextEco = {
            ...eco,
            buildings: { ...eco.buildings, [stationKey]: nextCfg },
          };
          setEconomy(nextEco);
          localEconomyRef.current = nextEco;
          if (nextVehicles !== live) {
            setVehicles(nextVehicles);
            vehiclesRef.current = nextVehicles;
          }
          if (roomCode) {
            socket.emit('update-economy', { roomCode, economy: nextEco });
            if (nextVehicles !== live) {
              socket.emit('update-vehicles', { roomCode, vehicles: nextVehicles });
            }
          }
        }
        return;
      }
      // Ignore non-stop clicks while editing (keep mode active)
      return;
    }

    // Bus route editing (per-vehicle, service panel): click bus-stop tiles
    if (pendingBusRouteVehicleId && hasTile(gridX, gridY)) {
      const tiles = getTile(gridX, gridY) || [];
      const top = tiles[tiles.length - 1];
      if (top && isBusStopTileType(top.type)) {
        const stopKey = key;
        const live = vehiclesRef.current;
        const bus = live[pendingBusRouteVehicleId];
        if (bus && bus.type === 'bus') {
          const route = [...(bus.busRoute || [])];
          // Toggle: if last stop is this key, ignore duplicate consecutive; allow multi-visit otherwise
          if (route[route.length - 1] !== stopKey) {
            route.push(stopKey);
          }
          const station =
            bus.busStationKey ||
            findNearestBusStationKey({ x: bus.x, y: bus.y }, gridRef.current || grid);
          const first = parseGridKey(route[0]);
          const updated: Vehicle = {
            ...bus,
            busRoute: route,
            busRouteIndex: bus.busRouteIndex ?? 0,
            busRouteLoops: bus.busRouteLoops ?? 0,
            busPhase: bus.busPhase || 'route',
            busStationKey: station || bus.busStationKey,
            destination: bus.destination || first,
            isMoving: bus.isMoving || !!first,
            randomTurning: false,
          };
          const nextVs = { ...live, [pendingBusRouteVehicleId]: updated };
          setVehicles(nextVs);
          if (roomCode) {
            socket.emit('update-vehicles', { roomCode, vehicles: nextVs });
          }
        }
        return;
      }
      // Click non-stop while editing — keep mode active
      return;
    }

    // Destination assignment — highest priority (works even with palette tile selected)
    if (pendingRouteVehicleId && selectedVehicles.size > 0 && hasTile(gridX, gridY)) {
      const currentGrid = gridRef.current || grid;
      const updatedVehicles = { ...vehicles };
      let anyAssigned = false;

      const now = Date.now();
      selectedVehicles.forEach(id => {
        const v = updatedVehicles[id];
        if (!v) return;
        // Manual override: ignore destination assignment
        if (v.manualOverride) return;
        const vType = v.type || 'car';
        const dest = resolveDestinationPoint(gridX, gridY, currentGrid, vType);
        if (!dest) return;
        updatedVehicles[id] = {
          ...v,
          destination: dest,
          isMoving: true,
          turnIntent: null,
          randomTurning: false,
          // Keep home-tour timer fresh so it doesn't fire the moment dest is cleared
          ...(v.homeKey
            ? { nextHomeReturnAt: now + randomHomeTourDelayMs() }
            : {}),
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
      // Click house/apartment → open people / family details
      if (hasTile(gridX, gridY)) {
        const tilesHere = getTile(gridX, gridY)!;
        const top = tilesHere[tilesHere.length - 1];
        if (isResidentialHomeType(top.type)) {
          setInspectHomeKey(resolveHomeKeyFromTile(top, key));
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
          topTile.type === 'building-repair-shop' || topTile.type === 'building-hospital' ||
          topTile.type === 'building-taxi-station' || topTile.type === 'building-bus-station';
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
        selectedTile === 'building-repair-shop' || selectedTile === 'building-hospital' ||
        selectedTile === 'building-taxi-station' || selectedTile === 'building-bus-station';
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
  const rightDockWidthPx = openRightDockWidthPx({
    people: showPeoplePanel,
    logistics: showLogistics,
    plant: showPlantGrowth,
    traffic: showTrafficPanel,
    cars: showCarsPanel,
    semi: showSemiTrailerPanel,
    train: showTrainPanel,
    service: showServicePanel,
    bot: showBotPanel,
  });
  const overviewRightOffsetPx =
    (rightDockWidthPx > 0 ? rightDockWidthPx : rightMenuClearancePx) + RIGHT_HUD_GAP_PX;
  const effectiveSidebarWidth = showSidebar ? SIDEBAR_WIDTH : 0;
  const worldX = (mousePos.x - effectiveSidebarWidth - offset.x) / zoom;
  const worldY = (mousePos.y - offset.y) / zoom;
  const gridX = Math.floor(worldX / GRID_SIZE);
  const gridY = Math.floor(worldY / GRID_SIZE);

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
  const selectedTravelPreference = (() => {
    const ids = Array.from(selectedPersonIds);
    if (ids.length === 0) return undefined;
    const first = economy.people?.[ids[0]]?.travelPreference;
    return ids.every(id => economy.people?.[id]?.travelPreference === first) ? first : undefined;
  })();

  const filteredPeople = peopleList.filter(p => {
    if (!peopleFilter.trim()) return true;
    const q = peopleFilter.toLowerCase();
    return (
      personDisplayName(p).toLowerCase().includes(q) ||
      p.homeKey.includes(q) ||
      (p.workplaceKey || '').includes(q) ||
      (p.activity || '').includes(q) ||
      travelPreferenceLabel(p.travelPreference).toLowerCase().includes(q)
    );
  });

  const populatePeople = () => {
    const next = populateHomes(gridRef.current, economy, Date.now());
    setEconomy(next);
    if (roomCode) socket.emit('update-economy', { roomCode, economy: next });
  };

  const openCreatePersonForm = () => {
    setPendingPersonFormPick(null);
    setPeopleForm({
      firstName: randomFirstName('m'),
      lastName: randomLastName(),
      sex: 'm',
      ageYears: 30,
      homeKey: '',
      workplaceKey: '',
      money: 50,
      health: 'healthy',
    });
    setPeopleFormMode('create');
  };

  const spawnPersonPanel = useCallback((personId: string) => {
    if (!economy.people?.[personId] && !localEconomyRef.current.people?.[personId]) return;
    personPanelZRef.current += 1;
    const z = personPanelZRef.current;
    setPersonPanels(prev => {
      const existing = prev.find(p => p.personId === personId);
      if (existing) {
        return prev.map(p =>
          p.personId === personId ? { ...p, zIndex: z } : p,
        );
      }
      const n = prev.length;
      return [
        ...prev,
        {
          personId,
          x: 56 + (n % 5) * 32,
          y: 96 + (n % 5) * 28,
          zIndex: z,
        },
      ];
    });
    setActivePersonPanelId(personId);
  }, [economy.people]);

  const closePersonPanel = useCallback((personId: string) => {
    setPersonPanels(prev => prev.filter(p => p.personId !== personId));
    setActivePersonPanelId(prev => (prev === personId ? null : prev));
  }, []);

  const movePersonPanel = useCallback((personId: string, pos: Point) => {
    setPersonPanels(prev =>
      prev.map(p => (p.personId === personId ? { ...p, x: pos.x, y: pos.y } : p)),
    );
  }, []);

  const activatePersonPanel = useCallback((personId: string) => {
    personPanelZRef.current += 1;
    const z = personPanelZRef.current;
    setPersonPanels(prev =>
      prev.map(p => (p.personId === personId ? { ...p, zIndex: z } : p)),
    );
    setActivePersonPanelId(personId);
    setSelectedPersonIds(new Set([personId]));
  }, []);

  /** Select a person on the map + People panel (blue highlight / list row) + control panel. */
  const selectPerson = useCallback(
    (personId: string, opts?: { openEdit?: boolean; openPanel?: boolean; openControl?: boolean }) => {
      const p = economy.people?.[personId];
      if (!p) return;
      setSelectedPersonIds(new Set([personId]));
      if (opts?.openPanel !== false) setShowPeoplePanel(true);
      if (opts?.openControl !== false) spawnPersonPanel(personId);
      if (opts?.openEdit) {
        setPendingPersonFormPick(null);
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
      }
      // Scroll list row into view after panel paints
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-person-row="${personId}"]`);
        if (el && 'scrollIntoView' in el) {
          (el as HTMLElement).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      });
    },
    [economy.people, spawnPersonPanel],
  );

  // Drop person panels when person is deleted
  useEffect(() => {
    const people = economy.people || {};
    setPersonPanels(prev => {
      const next = prev.filter(p => !!people[p.personId]);
      return next.length === prev.length ? prev : next;
    });
    if (activePersonPanelId && !people[activePersonPanelId]) {
      setActivePersonPanelId(null);
    }
  }, [economy.people, activePersonPanelId]);

  const openEditPersonForm = (personId?: string) => {
    const id = personId || Array.from(selectedPersonIds)[0];
    if (!id) return;
    selectPerson(id, { openEdit: true, openPanel: true });
  };

  const startPersonFormMapPick = (field: 'home' | 'workplace') => {
    if (peopleFormMode === 'closed') return;
    setPendingEmployeeAssign(false);
    setPendingHomeAssign(false);
    setPendingFireStart(false);
    setPendingRouteVehicleId(null);
    setSelectedTile(null);
    setIsPlacingVehicles(false);
    setPendingPersonFormPick(prev => (prev === field ? null : field));
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
      // Auto schedule for new citizens (user can regenerate / override later)
      if (!person.schedule?.length) {
        person.schedule = generatePersonSchedule(person, {
          stores: listStoreKeys(gridRef.current, economy.buildings || {}),
        });
        person.scheduleMode = 'auto';
      }
      people[person.id] = person;
      setSelectedPersonIds(new Set([person.id]));
    } else if (peopleFormMode === 'edit') {
      const id = Array.from(selectedPersonIds)[0];
      const prev = id ? people[id] : undefined;
      if (!prev) return;
      const nextWorkplace = peopleForm.workplaceKey.trim() || undefined;
      const homeKey = peopleForm.homeKey.trim() || prev.homeKey;
      let nextPerson: Person = {
        ...prev,
        firstName: peopleForm.firstName.trim() || prev.firstName,
        lastName: peopleForm.lastName.trim() || prev.lastName,
        sex: peopleForm.sex,
        ageYears: Math.max(0, Math.min(100, peopleForm.ageYears)),
        ageUpdatedAt: now,
        homeKey,
        workplaceKey: nextWorkplace,
        money: peopleForm.money,
        health: peopleForm.health,
        // Never teleport an existing person when home/workplace fields change
        location:
          prev.location.kind === 'home'
            ? { kind: 'home', homeKey }
            : prev.location,
      };
      // New workplace assignment → queue commute from current location
      if (nextWorkplace && nextWorkplace !== prev.workplaceKey) {
        const alreadyThere =
          prev.location.kind === 'building' && prev.location.buildingKey === nextWorkplace;
        if (alreadyThere) {
          nextPerson = {
            ...nextPerson,
            activity: 'working',
            activityUntil: now + 45_000,
            travelIntent: undefined,
          };
        } else {
          nextPerson = {
            ...nextPerson,
            travelIntent: { purpose: 'work', destinationKey: nextWorkplace },
            activity:
              prev.location.kind === 'vehicle'
                ? 'commuting'
                : prev.activity === 'working'
                  ? 'idle'
                  : prev.activity || 'idle',
            activityUntil: now,
          };
        }
      }
      people[id] = nextPerson;
    }

    const nextEco = { ...economy, people, families };
    setEconomy(nextEco);
    if (roomCode) socket.emit('update-economy', { roomCode, economy: nextEco });
    setPendingPersonFormPick(null);
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
    setPendingPersonFormPick(null);
    setPendingEmployeeAssign(true);
  };

  const boardSelectedPeople = (seat: 'driver' | 'passenger') => {
    if (selectedPersonIds.size === 0) return;
    // Prefer active drive-panel vehicle, then first selected
    const vehicleId =
      (activeDrivePanelId && vehiclesRef.current[activeDrivePanelId]
        ? activeDrivePanelId
        : null) ||
      Array.from(selectedVehicles)[0] ||
      null;
    if (!vehicleId) return;
    const live = vehiclesRef.current;
    const v = live[vehicleId];
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
    let nextVehicles = { ...live };
    nextVehicles[vehicleId] = syncVehicleOccupancy(nextVehicles[vehicleId], people);
    // Sync occupancy on any other vehicles people left
    Object.keys(nextVehicles).forEach(vid => {
      if (vid !== vehicleId) {
        nextVehicles[vid] = syncVehicleOccupancy(nextVehicles[vid], people);
      }
    });
    const nextEco = { ...economy, people };
    setEconomy(nextEco);
    setVehicles(nextVehicles);
    if (roomCode) {
      socket.emit('update-economy', { roomCode, economy: nextEco });
      socket.emit('update-vehicles', { roomCode, vehicles: nextVehicles });
    }
  };

  /** Sync occupancy on all vehicles after people location changes. */
  const applyPeopleVehicleSync = (
    people: Record<string, Person>,
    baseVehicles?: Record<string, Vehicle>,
  ) => {
    const live = baseVehicles || vehiclesRef.current;
    const nextVehicles = { ...live };
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

  /** Drive panel: assign / clear driver from existing people. */
  const assignVehicleDriver = (vehicleId: string, personId: string | null) => {
    const live = vehiclesRef.current;
    const v = live[vehicleId];
    if (!v || v.type === 'taxi') return;
    let people = { ...(economy.people || {}) };
    const now = Date.now();
    const currentDriver = getDriverId(people, vehicleId);

    if (!personId) {
      if (!currentDriver) return;
      const d = people[currentDriver];
      if (d) {
        people = alightPerson(
          people,
          currentDriver,
          { kind: 'home', homeKey: d.homeKey },
          'home',
          now + 15_000,
        );
      }
      applyPeopleVehicleSync(people);
      return;
    }

    const person = people[personId];
    if (!person) return;
    // Free the seat if another driver is aboard
    if (currentDriver && currentDriver !== personId) {
      const d = people[currentDriver];
      if (d) {
        people = alightPerson(
          people,
          currentDriver,
          { kind: 'home', homeKey: d.homeKey },
          'home',
          now + 15_000,
        );
      }
    }
    if (canBoardAsDriver(person, v, people)) return;
    people = boardPerson(people, personId, vehicleId, 'driver');
    applyPeopleVehicleSync(people);
  };

  /** Drive panel: board or remove a passenger. */
  const assignVehiclePassenger = (vehicleId: string, personId: string, board: boolean) => {
    const live = vehiclesRef.current;
    const v = live[vehicleId];
    if (!v) return;
    let people = { ...(economy.people || {}) };
    const person = people[personId];
    if (!person) return;
    const now = Date.now();

    if (!board) {
      // Only alight if they are currently a passenger on this vehicle
      if (
        person.location.kind === 'vehicle' &&
        person.location.vehicleId === vehicleId &&
        person.location.seat === 'passenger'
      ) {
        people = alightPerson(
          people,
          personId,
          { kind: 'home', homeKey: person.homeKey },
          'home',
          now + 15_000,
        );
        applyPeopleVehicleSync(people);
      }
      return;
    }

    // If they are the driver of this vehicle, demote: alight then re-board as passenger
    if (
      person.location.kind === 'vehicle' &&
      person.location.vehicleId === vehicleId &&
      person.location.seat === 'driver'
    ) {
      people = alightPerson(
        people,
        personId,
        { kind: 'home', homeKey: person.homeKey },
        'idle',
        now,
      );
    }
    if (canBoardAsPassenger(person, v, people)) return;
    people = boardPerson(people, personId, vehicleId, 'passenger');
    applyPeopleVehicleSync(people);
  };

  /** Drive panel: set vehicle owner house from a person's homeKey. */
  const assignVehicleOwnerFromPerson = (vehicleId: string, personId: string) => {
    const live = vehiclesRef.current;
    const v = live[vehicleId];
    const person = economy.people?.[personId];
    if (!v || !person?.homeKey) return;
    const vType = v.type || 'car';
    if (vType === 'train' || vType === 'semi') return;

    const now = Date.now();
    const eco = localEconomyRef.current || economy;
    const result = assignHomesWithDrivers(
      live,
      eco.people || {},
      eco.families || {},
      [{ vehicleId, homeKey: person.homeKey, nextHomeReturnAt: now + randomHomeTourDelayMs() }],
      now,
    );
    setVehicles(result.vehicles);
    const nextEco = { ...eco, people: result.people, families: result.families };
    setEconomy(nextEco);
    if (roomCode) {
      socket.emit('update-vehicles', { roomCode, vehicles: result.vehicles });
      socket.emit('update-economy', { roomCode, economy: nextEco });
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

  /**
   * Immediately start walking or driving for the given people.
   * Work / home: owned car → drive, park, enter; otherwise walk in.
   */
  const startPeopleCommute = (
    personIds: Iterable<string>,
    purpose: 'work' | 'home' | 'shop' | 'care',
    destinationKeyFor?: (p: Person) => string | undefined,
  ) => {
    const eco = localEconomyRef.current || economy;
    let people = { ...(eco.people || {}) };
    let nextVehicles = { ...vehiclesRef.current };
    const now = getSimNow(eco, Date.now());
    const gridNow = gridRef.current;
    const trafficNow = localTrafficRef.current;
    let changed = false;
    for (const pid of personIds) {
      const person = people[pid];
      if (!person) continue;
      const dest =
        destinationKeyFor?.(person) ||
        (purpose === 'work'
          ? person.workplaceKey
          : purpose === 'home'
            ? person.homeKey
            : undefined);
      if (!dest) continue;
      const intent =
        purpose === 'work' || purpose === 'home'
          ? commuteIntentForPerson(person, purpose, nextVehicles, people)
          : { purpose, destinationKey: dest, transport: 'auto' as const };
      if (!intent) continue;
      const patch = startPersonTravel(person, intent, now, {
        grid: gridNow,
        buildings: eco.buildings || {},
        vehicles: nextVehicles,
        people,
        traffic: trafficNow,
      });
      const applied = applyPeopleSimPatch(patch, people, nextVehicles, now);
      people = applied.people;
      nextVehicles = applied.vehicles;
      changed = true;
    }
    if (!changed) return;
    applyPeopleVehicleSync(people, nextVehicles);
  };

  const sendSelectedPeopleHome = () => {
    if (selectedPersonIds.size === 0) return;
    startPeopleCommute(selectedPersonIds, 'home');
  };

  const sendSelectedPeopleToWork = () => {
    if (selectedPersonIds.size === 0) return;
    startPeopleCommute(selectedPersonIds, 'work');
  };

  const setPeopleTravelPreference = (ids: Iterable<string>, pref: TravelPreference) => {
    if (!roomCode) return;
    const people = { ...(economy.people || {}) };
    const gridNow = gridRef.current;
    let changed = false;
    for (const id of ids) {
      const p = people[id];
      if (!p) continue;
      let next: Person = { ...p, travelPreference: pref };
      if (p.travelIntent && p.location.kind !== 'vehicle') {
        const place =
          p.location.kind === 'walking'
            ? `${Math.floor(p.location.x)},${Math.floor(p.location.y)}`
            : p.location.kind === 'outdoor'
              ? p.location.atKey
              : p.location.kind === 'tile'
                ? `${p.location.x},${p.location.y}`
                : p.location.kind === 'building'
                  ? p.location.buildingKey
                  : p.homeKey;
        next = {
          ...next,
          location:
            p.location.kind === 'home' || p.location.kind === 'building'
              ? p.location.kind === 'home'
                ? { kind: 'home', homeKey: p.homeKey }
                : p.location
              : toOutdoorLocation(place, gridNow),
          travelIntent: {
            purpose: p.travelIntent.purpose,
            destinationKey: p.travelIntent.destinationKey,
            transport: preferenceToTransport(pref),
          },
          busDropoffStop: undefined,
          taxiRideId: undefined,
          activity: 'idle',
          activityUntil: Date.now(),
        };
      }
      people[id] = next;
      changed = true;
    }
    if (!changed) return;
    const nextEco = { ...economy, people };
    setEconomy(nextEco);
    socket.emit('update-economy', { roomCode, economy: nextEco });
  };

  /** Start a trip immediately (walk or drive — no teleport). */
  const queuePersonTravel = (
    personId: string,
    purpose: 'work' | 'shop' | 'home' | 'care',
    destinationKey: string,
  ) => {
    startPeopleCommute([personId], purpose, () => destinationKey);
  };

  const boardOnePerson = (personId: string, seat: 'driver' | 'passenger') => {
    const vehicleId =
      (activeDrivePanelId && vehiclesRef.current[activeDrivePanelId]
        ? activeDrivePanelId
        : null) ||
      Array.from(selectedVehicles)[0] ||
      null;
    if (!vehicleId) return;
    setSelectedPersonIds(new Set([personId]));
    const live = vehiclesRef.current;
    const v = live[vehicleId];
    if (!v) return;
    let people = { ...(economy.people || {}) };
    const person = people[personId];
    if (!person) return;
    if (seat === 'driver') {
      if (canBoardAsDriver(person, v, people)) return;
    } else {
      if (canBoardAsPassenger(person, v, people)) return;
    }
    people = boardPerson(people, personId, vehicleId, seat);
    let nextVehicles = { ...live };
    nextVehicles[vehicleId] = syncVehicleOccupancy(nextVehicles[vehicleId], people);
    Object.keys(nextVehicles).forEach(vid => {
      if (vid !== vehicleId) {
        nextVehicles[vid] = syncVehicleOccupancy(nextVehicles[vid], people);
      }
    });
    const nextEco = { ...economy, people };
    setEconomy(nextEco);
    setVehicles(nextVehicles);
    if (roomCode) {
      socket.emit('update-economy', { roomCode, economy: nextEco });
      socket.emit('update-vehicles', { roomCode, vehicles: nextVehicles });
    }
  };

  const alightOnePerson = (personId: string) => {
    const people = { ...(economy.people || {}) };
    const p = people[personId];
    if (!p || p.location.kind !== 'vehicle') return;
    const now = getSimNow(economy, Date.now());
    const v = vehiclesRef.current[p.location.vehicleId];
    const loc =
      v
        ? ({ kind: 'tile' as const, x: Math.floor(v.x), y: Math.floor(v.y) })
        : ({ kind: 'home' as const, homeKey: p.homeKey });
    const nextPeople = alightPerson(people, personId, loc, 'idle', now + 15_000);
    applyPeopleVehicleSync(nextPeople);
  };

  const enterBuildingOnePerson = (personId: string) => {
    setSelectedPersonIds(new Set([personId]));
    // Reuse batch helper after ensuring selection
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
    // Near person tile
    if (!buildingKey) {
      const p = economy.people?.[personId];
      if (p) {
        const place = getPersonMapPlacement(p, gridRef.current, vehiclesRef.current, 0);
        const tx = Math.floor(place.x);
        const ty = Math.floor(place.y);
        for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const key = `${tx + dx},${ty + dy}`;
          const tiles = gridRef.current[key];
          const bld = tiles?.find(t => t.type.startsWith('building-'));
          if (bld) {
            buildingKey = bld.part === 'member' ? bld.anchorKey || key : key;
            break;
          }
        }
      }
    }
    if (!buildingKey) return;
    const now = getSimNow(economy, Date.now());
    let people = { ...(economy.people || {}) };
    people = alightPerson(people, personId, { kind: 'building', buildingKey }, 'idle', now + 20_000);
    applyPeopleVehicleSync(people);
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
    const isSelected = selectedVehicles.has(v.id);
    return (
      <label
        key={v.id}
        data-vehicle-list-id={v.id}
        className={`flex items-center gap-3 p-3 border-b border-slate-50 cursor-pointer transition-colors ${
          isSelected
            ? 'bg-indigo-50 hover:bg-indigo-100 ring-1 ring-inset ring-indigo-200'
            : 'hover:bg-slate-50'
        }`}
      >
        <input
          type="checkbox"
          checked={isSelected}
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
            {v.towedVehicleId && (
              <span className="text-[9px] text-amber-600 shrink-0">🪝towing</span>
            )}
            {v.towedById && (
              <span className="text-[9px] text-amber-600 shrink-0">🪝hooked</span>
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
              data-testid="lobby-dialog"
            >
              <div className="bg-blue-600 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-lg shadow-blue-200">
                <MapIcon className="w-10 h-10 text-white" />
              </div>
              <div className="flex items-center justify-center gap-2 mb-3">
                <h2 className="text-3xl font-black text-slate-900 tracking-tight">Grid City Collaborative</h2>
                <span
                  className="text-xs font-semibold text-slate-400 tracking-wide shrink-0"
                  data-testid="lobby-version"
                >
                  {formatAppVersion()}
                </span>
                <a
                  href="/help"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="lobby-help-button"
                  title="Open documentation in a new tab"
                  aria-label="Open documentation in a new tab"
                  className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors shrink-0"
                >
                  <CircleHelp className="w-6 h-6" />
                </a>
              </div>
              <p className="text-slate-500 mb-10 text-lg leading-relaxed">
                Design cities together in real-time. Create a new room or join an existing one.
              </p>

              <div className="space-y-6">
                <div className="space-y-4">
                  <button 
                    onClick={createRoom}
                    className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-xl shadow-blue-200 flex items-center justify-center gap-3"
                    data-testid="create-room-button"
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
                      data-testid="join-room-input"
                    />
                    <button 
                      onClick={joinRoom}
                      disabled={!tempRoomCode.trim()}
                      className="bg-slate-900 text-white px-6 rounded-2xl font-bold hover:bg-slate-800 disabled:opacity-30 transition-all"
                      data-testid="join-room-button"
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
            <div className="flex items-center gap-1.5 min-w-0">
              <h1 className="text-2xl font-bold tracking-tight text-slate-800 flex items-center gap-2 min-w-0">
                <MapIcon className="w-6 h-6 text-blue-600 shrink-0" />
                <span className="truncate" data-testid="app-title">Grid City</span>
              </h1>
              <span
                className="text-[11px] font-bold text-slate-500 tracking-wide leading-none shrink-0 pt-1"
                data-testid="app-version"
                title={`Grid City ${formatAppVersion()}`}
              >
                {formatAppVersion()}
              </span>
              <a
                href="/help"
                target="_blank"
                rel="noopener noreferrer"
                data-testid="help-button"
                title="Open documentation in a new tab"
                aria-label="Open documentation in a new tab"
                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors shrink-0"
              >
                <CircleHelp className="w-5 h-5" />
              </a>
            </div>
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
            <div
              className="flex items-center justify-between bg-blue-50/50 p-2.5 rounded-xl border border-blue-100 mb-4 group transition-all hover:bg-blue-50"
              data-testid="active-room"
            >
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  <div className="absolute inset-0 w-2 h-2 rounded-full bg-blue-400 animate-ping opacity-75" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-blue-400 uppercase tracking-[0.2em] leading-none mb-1">Active Room</span>
                  <span
                    className="text-sm font-black text-blue-700 tracking-widest leading-none"
                    data-testid="active-room-code"
                  >{roomCode}</span>
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
        data-testid="map-viewport"
        className={`flex-1 relative overflow-hidden cursor-${
          isPanning
            ? 'grabbing'
            : isPlacingVehicles ||
                isPlacingPeople ||
                pendingRouteVehicleId ||
                pendingBusRouteVehicleId ||
                pendingBusRouteEdit ||
                pendingHomeAssign ||
                pendingFireStart ||
                pendingEmployeeAssign ||
                pendingPersonFormPick ||
                botPickMode ||
                trafficTool ||
                selectedTile
              ? 'crosshair'
              : 'grab'
        }`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          handleMouseUp();
          clearTileHover();
        }}
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

        {/* City system clock (HH:MM:SS AM/PM) — drives people schedules */}
        <CityClockBar economy={economy} setEconomy={setEconomy} roomCode={roomCode} />

        {pendingRouteVehicleId && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 pointer-events-none bg-red-600 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg">
            Click a road tile to set destination
          </div>
        )}
        {pendingHomeAssign && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 pointer-events-none bg-rose-600 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg">
            Click a house or apartment to assign as owner home
          </div>
        )}
        {pendingFireStart && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 pointer-events-none bg-orange-600 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg">
            Click a tree to start a fire (burns 30s)
          </div>
        )}
        {pendingPersonFormPick === 'home' && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 pointer-events-none bg-rose-600 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg">
            Click a house or apartment to set this person&apos;s home (Esc to cancel)
          </div>
        )}
        {pendingPersonFormPick === 'workplace' && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 pointer-events-none bg-emerald-600 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg">
            Click a building to set this person&apos;s workplace (Esc to cancel)
          </div>
        )}
        {pendingEmployeeAssign && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 pointer-events-none bg-violet-600 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg">
            Click a building to assign {selectedPersonIds.size} employee{selectedPersonIds.size === 1 ? '' : 's'} (Esc to cancel)
          </div>
        )}
        {isPlacingPeople && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 pointer-events-none bg-violet-600 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg">
            {selectedPersonIds.size > 0
              ? `Click map to place ${selectedPersonIds.size} person${selectedPersonIds.size === 1 ? '' : 's'} (roads → sidewalk) · Esc to cancel`
              : 'Click map to drop a new person (roads → sidewalk) · Esc to cancel'}
          </div>
        )}
        {pendingBusRouteEdit && (
          <div
            data-testid="bus-route-banner"
            className="absolute top-14 left-1/2 -translate-x-1/2 z-50 pointer-events-none bg-blue-600 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg"
          >
            {(() => {
              const stationCfg = economy.buildings[pendingBusRouteEdit.stationKey];
              const editingRoute = stationCfg
                ? findBusRoute(stationCfg, pendingBusRouteEdit.routeId)
                : undefined;
              const stopCount = editingRoute?.stops.length || 0;
              return `Click bus-stop tiles for ${editingRoute?.name || 'route'} (${stopCount} stop${stopCount === 1 ? '' : 's'}) · Esc to finish`;
            })()}
          </div>
        )}
        {pendingBusRouteVehicleId && !pendingBusRouteEdit && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 pointer-events-none bg-blue-600 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg">
            Click bus-stop tiles to build route ({vehicles[pendingBusRouteVehicleId]?.busRoute?.length || 0} stops) · Esc to finish
          </div>
        )}
        {botPickMode && (
          <div
            data-testid="bot-pick-map-banner"
            className="absolute top-14 left-1/2 -translate-x-1/2 z-50 pointer-events-none bg-violet-700 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg flex items-center gap-2"
          >
            <span className="inline-block w-2 h-2 rounded-full bg-white animate-pulse" />
            {botPickAsk?.prompt ||
              (botPickMode === 'pick_building'
                ? 'GrokBot: click a building'
                : 'GrokBot: click a map location')}{' '}
            · Esc to cancel
          </div>
        )}
        {botPickMode && (
          <div
            data-testid="bot-pick-crosshair"
            className="absolute inset-0 pointer-events-none z-40"
            style={{
              background:
                'radial-gradient(circle at center, transparent 0 28px, rgba(91,33,182,0.08) 29px)',
              boxShadow: 'inset 0 0 0 3px rgba(109,40,217,0.35)',
            }}
          />
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
                  if (traffic.showControls === false) return null;
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
                      onSignClick={
                        !trafficTool && !isPlacingVehicles
                          ? (ctrl) => {
                              if (ctrl.kind !== 'stop-sign') return;
                              setSelectedTrafficIds(new Set([trafficControlKey(ctrl)]));
                              setShowTrafficPanel(true);
                            }
                          : undefined
                      }
                      onLightClick={
                        !trafficTool && !isPlacingVehicles
                          ? (ctrl) => {
                              if (ctrl.kind !== 'stoplight') return;
                              emitTraffic(prev => ({
                                ...prev,
                                controls: {
                                  ...prev.controls,
                                  [trafficControlKey(ctrl)]: {
                                    ...ctrl,
                                    phase: cycleLightPhase(ctrl.phase),
                                    phaseStartedAt: Date.now(),
                                  },
                                },
                              }));
                            }
                          : undefined
                      }
                    />
                  );
                })()}
              </div>
            );
          })}

          {/* Tile coordinates after 3s hover dwell */}
          {coordLabelKey && (() => {
            const [cx, cy] = coordLabelKey.split(',').map(Number);
            if (Number.isNaN(cx) || Number.isNaN(cy)) return null;
            return (
              <div
                key={`coord-label-${coordLabelKey}`}
                className="absolute pointer-events-none z-[60] flex items-center justify-center"
                style={{
                  left: cx * GRID_SIZE,
                  top: cy * GRID_SIZE,
                  width: GRID_SIZE,
                  height: GRID_SIZE,
                }}
              >
                <span className="px-1.5 py-0.5 rounded-md bg-slate-900/90 text-white text-[10px] font-mono font-bold shadow-lg border border-white/25 whitespace-nowrap">
                  {cx},{cy}
                </span>
              </div>
            );
          })()}

          {/* Home occupancy badges (houses + apartment anchors) */}
          {economy.showHomeBadges !== false &&
            Object.entries(grid).map(([homeKey, homeTiles]) => {
              if (!homeTiles?.length) return null;
              const top = homeTiles[homeTiles.length - 1];
              if (!isResidentialHomeType(top.type)) return null;
              // Multi-tile apartments: badge only on the anchor cell
              if (top.part === 'member') return null;
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

          {/* Person icons at every location: inside, outside, walking, or riding */}
          {economy.showPersonIcons !== false &&
            economy.people &&
            (() => {
              // Stack index per anchor tile for fan-out
              const stackCounts: Record<string, number> = {};
              const placements: Array<{
                person: Person;
                gx: number;
                gy: number;
                crossing?: boolean;
                waiting?: boolean;
                inVehicle?: boolean;
              }> = [];
              const peopleMap = economy.people as Record<string, Person>;
              for (const p of Object.values(peopleMap)) {
                const tileKey =
                  p.location.kind === 'home'
                    ? p.location.homeKey
                    : p.location.kind === 'building'
                      ? p.location.buildingKey
                      : p.location.kind === 'outdoor'
                        ? p.location.atKey
                        : p.location.kind === 'walking'
                          ? `${Math.floor(p.location.x)},${Math.floor(p.location.y)}`
                          : p.location.kind === 'tile'
                            ? `${p.location.x},${p.location.y}`
                            : p.location.kind === 'vehicle'
                              ? `veh:${p.location.vehicleId}`
                              : p.id;
                const stack = stackCounts[tileKey] || 0;
                stackCounts[tileKey] = stack + 1;
                const place = getPersonMapPlacement(p, grid, vehicles, stack);
                if (!place.visible) continue;
                placements.push({
                  person: p,
                  gx: place.x,
                  gy: place.y,
                  crossing: place.crossing,
                  waiting: place.waiting,
                  inVehicle: place.inVehicle,
                });
              }
              return placements.map(pl => (
                <PersonMapIcon
                  key={`person-icon-${pl.person.id}`}
                  placement={pl}
                  selected={selectedPersonIds.has(pl.person.id)}
                  onClick={() => {
                    selectPerson(pl.person.id, { openEdit: true, openPanel: true });
                  }}
                />
              ));
            })()}

          {/* Seedling growth % badges */}
          {economy.showSeedlingBadges !== false &&
            Object.entries(grid).map(([key, tiles]) => {
              if (!tiles?.length) return null;
              const top = tiles[tiles.length - 1];
              if (top.type !== 'tree-pine-seedling') return null;
              const progress = Math.max(0, Math.min(1, top.growthProgress ?? 0));
              const [sx, sy] = key.split(',').map(Number);
              return (
                <div
                  key={`seedling-badge-${key}`}
                  className="absolute pointer-events-none z-10 flex items-start justify-center pt-0.5"
                  style={{ left: sx * GRID_SIZE, top: sy * GRID_SIZE, width: GRID_SIZE, height: GRID_SIZE }}
                >
                  <span className="inline-flex items-center gap-px px-1 py-px rounded-full border text-[8px] font-bold leading-none shadow-sm bg-lime-100/95 border-lime-300 text-lime-900">
                    🌱{Math.round(progress * 100)}%
                  </span>
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
              
              const exitHeading = currentTile
                ? resolveVehicleExit(v, currentTile, grid || {})
                : v.heading;
              
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
                    showCargoLabels={economy.showTrailerCargoLabels ?? economy.showCargoLabels}
                    showRailcarCargoLabels={economy.showRailcarCargoLabels ?? economy.showCargoLabels}
                    showStopTimerBadge={economy.showVehicleStopBadges !== false}
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
                  showCargoLabels={economy.showTrailerCargoLabels ?? economy.showCargoLabels}
                  itemEmojiResolver={(itemId) => getItemEmoji(itemId, economy.itemDefs)}
                  selected={isSelected}
                  onSelect={(e) => handleParkedTrailerSelect(pt.id, e)}
                />
              );
            })}
          </AnimatePresence>

          {/* Destination bullseyes (selected vehicles only) */}
          {economy.showDestinationMarkers !== false &&
            (Object.values(vehicles) as Vehicle[])
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
          {previewBusStops && previewBusStops.length > 0 && (
            <BusRouteMapOverlay stops={previewBusStops} grid={grid} />
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
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed bottom-4 z-[95] bg-white/95 border border-slate-200 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-sm"
              style={{
                right: overviewRightOffsetPx,
                width: minimapSize + 8,
                height: minimapSize + 24,
              }}
              data-grid-control
              data-testid="overview-minimap"
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

        {/* Floating Controls — two-column button grid, pinned to the viewport right edge */}
        <div 
          ref={rightMenuRef}
          className="fixed bottom-8 z-[90] flex flex-col gap-2 transition-[right] duration-150"
          style={{ right: (rightDockWidthPx > 0 ? rightDockWidthPx + 32 : 32) }}
          data-grid-control
          data-testid="right-tool-menu"
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
              onClick={() => spawnDrivePanels()}
              disabled={selectedVehicles.size === 0}
              className={`p-3 rounded-xl transition-colors disabled:opacity-30 disabled:pointer-events-none ${
                drivePanels.length > 0
                  ? 'text-sky-600 bg-sky-50 ring-2 ring-sky-200'
                  : 'text-slate-400 hover:bg-slate-50'
              }`}
              title={
                selectedVehicles.size === 0
                  ? 'Select vehicle(s), then open floating drive panel(s)'
                  : `Open drive panel for ${selectedVehicles.size} selected vehicle${selectedVehicles.size === 1 ? '' : 's'}`
              }
            >
              <Joystick className="w-5 h-5 mx-auto" />
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

            <button
              type="button"
              data-testid="bot-panel-toggle"
              onClick={() => setShowBotPanel(v => !v)}
              className={`p-3 rounded-xl transition-colors ${showBotPanel ? 'text-sky-600 bg-sky-50' : 'text-slate-400 hover:bg-slate-50'}`}
              title="GrokBot"
            >
              <Bot className="w-5 h-5 mx-auto" />
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

        <BotPanel
          open={showBotPanel}
          onClose={() => {
            setShowBotPanel(false);
            setBotPickMode(null);
            setBotPickAsk(null);
          }}
          getContext={getBotContext}
          executeActions={executeBotActions}
          pickMode={botPickMode}
          onEnterPickMode={(mode, ask) => {
            setBotPickMode(mode);
            setBotPickAsk(ask);
            setSelectedTile(null);
            setIsPasting(false);
            setIsPlacingVehicles(false);
            setPendingRouteVehicleId(null);
          }}
          onCancelPick={() => {
            setBotPickMode(null);
            setBotPickAsk(null);
          }}
          pickResultRef={botPickResultRef}
        />

        {/* Logistics & Economy Panel (new) */}
        <AnimatePresence>
          {showLogistics && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed top-0 right-0 bottom-0 w-96 bg-white/95 backdrop-blur-md shadow-2xl border-l border-slate-200 z-[110] flex flex-col overscroll-contain"
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

                <div className="border-t pt-3 space-y-1.5">
                  <div className="font-semibold mb-1">Map badges</div>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={economy.showInventoryLabels}
                      onChange={e => setEconomyBadgeFlag('showInventoryLabels', e.target.checked)}
                    />
                    Show building inventory / production badges
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={economy.showTrailerCargoLabels ?? economy.showCargoLabels}
                      onChange={e => {
                        setEconomyBadgeFlag('showTrailerCargoLabels', e.target.checked);
                        setEconomyBadgeFlag('showCargoLabels', e.target.checked);
                      }}
                    />
                    Show trailer cargo badges
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={economy.economyPaused}
                      onChange={e => setEconomyBadgeFlag('economyPaused', e.target.checked)}
                    />
                    Pause economy simulation
                  </label>
                </div>

                <div className="text-[10px] text-slate-500 pt-2 border-t">
                  Use the 🏭 floater (bottom-right) for Factories/Recipes, or open Cars / Semis / Trains / Service / drive panels for destinations and vehicle controls.
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Plant Growth Panel */}
        <AnimatePresence>
          {showPlantGrowth && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed top-0 right-0 bottom-0 w-80 bg-white/95 backdrop-blur-md shadow-2xl border-l border-slate-200 z-[105] flex flex-col overscroll-contain"
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

                <div className="border-t pt-3 space-y-1.5">
                  <div className="font-semibold text-xs mb-1">Map badges</div>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={economy.showSeedlingBadges !== false}
                      onChange={e => setEconomyBadgeFlag('showSeedlingBadges', e.target.checked)}
                    />
                    Show seedling growth % badges
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
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
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed top-0 right-0 bottom-0 w-80 bg-white/95 backdrop-blur-md shadow-2xl border-l border-slate-200 z-[100] flex flex-col min-h-0 overflow-hidden"
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
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-3">
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-1.5 shrink-0">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Map badges</div>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={traffic.showControls !== false}
                      onChange={e => {
                        const show = e.target.checked;
                        emitTraffic(prev => ({ ...prev, showControls: show }));
                      }}
                    />
                    Show stop signs &amp; stoplights on map
                  </label>
                </div>
                <TrafficPanel
                  traffic={traffic}
                  selectedIds={selectedTrafficIds}
                  trafficTool={trafficTool}
                  roomCode={roomCode}
                  onSelectIds={setSelectedTrafficIds}
                  onSetTool={setTrafficTool}
                  onUpdateTraffic={emitTraffic}
                  onDeleteByKind={(kind) => {
                    const nextSelected = new Set(selectedTrafficIds);
                    emitTraffic(prev => {
                      const nextControls = { ...prev.controls };
                      Object.values(prev.controls).forEach(c => {
                        if (c.kind === kind && selectedTrafficIds.has(trafficControlKey(c))) {
                          delete nextControls[trafficControlKey(c)];
                          nextSelected.delete(trafficControlKey(c));
                        }
                      });
                      return { ...prev, controls: nextControls };
                    });
                    setSelectedTrafficIds(nextSelected);
                  }}
                  onLinkSelected={() => {
                    const groupId = `grp-${Date.now()}`;
                    emitTraffic(prev => {
                      const nextControls = { ...prev.controls };
                      selectedTrafficIds.forEach(id => {
                        const c = nextControls[id];
                        if (c?.kind === 'stoplight') nextControls[id] = { ...c, groupId };
                      });
                      const coordinated = coordinateLightGroup(Object.values(nextControls), groupId);
                      return {
                        ...prev,
                        controls: Object.fromEntries(coordinated.map(c => [trafficControlKey(c), c])),
                      };
                    });
                  }}
                  onUnlinkSelected={() => {
                    emitTraffic(prev => ({
                      ...prev,
                      controls: unlinkStoplights(prev.controls, selectedTrafficIds),
                    }));
                  }}
                  onToggleManual={(manual) => {
                    emitTraffic(prev => {
                      const nextControls = { ...prev.controls };
                      selectedTrafficIds.forEach(id => {
                        const c = nextControls[id];
                        if (c?.kind === 'stoplight') {
                          nextControls[id] = { ...c, manualOnly: manual };
                        }
                      });
                      return { ...prev, controls: nextControls };
                    });
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
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed top-0 right-0 bottom-0 w-80 bg-white/95 backdrop-blur-md shadow-2xl border-l border-slate-200 z-[100] flex flex-col min-h-0 overflow-hidden"
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

                <div className="flex items-center justify-between px-2 gap-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer min-w-0">
                    <input
                      type="checkbox"
                      checked={carsList.length > 0 && carsFilteredSelection.size === carsList.length}
                      onChange={() => toggleAllVehiclesOfType('car')}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                    />
                    <span className="truncate">Select All ({carsFilteredSelection.size}/{carsList.length})</span>
                  </label>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => spawnDrivePanels(carsFilteredSelection)}
                      disabled={carsFilteredSelection.size === 0}
                      className="text-sky-600 hover:text-sky-700 disabled:opacity-30 disabled:pointer-events-none p-1 bg-sky-50 hover:bg-sky-100 rounded-md transition-colors"
                      title="Open floating drive panel(s) for selected"
                    >
                      <Joystick className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => removeSelectedCars(carsFilteredSelection)}
                      disabled={carsFilteredSelection.size === 0 || !roomCode}
                      className="text-red-500 hover:text-red-600 disabled:opacity-30 disabled:pointer-events-none p-1 bg-red-50 hover:bg-red-100 rounded-md transition-colors"
                      title="Remove Selected"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="bg-white border border-slate-100 rounded-2xl overflow-y-auto overscroll-contain shadow-inner flex flex-col min-h-[120px] max-h-[280px] shrink-0">
                  {carsList.map(renderVehicleListItem)}
                  {carsList.length === 0 && (
                    <div className="flex-1 flex items-center justify-center text-sm text-slate-400 p-4">No cars active</div>
                  )}
                </div>

                <div className="bg-white border border-rose-100 rounded-xl p-3 space-y-2 shrink-0">
                  <div className="text-xs font-semibold text-rose-800 flex items-center gap-1">
                    <span>🏠</span> Assign owner house
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Set which home (house or apartment) owns the selected cars. Residents of that home are shown as owners on the drive panel. Cars tour town, then return home to park for 10s.
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
                      {pendingHomeAssign ? 'Click a home…' : 'Assign home'}
                    </button>
                    <button
                      type="button"
                      disabled={carsFilteredSelection.size === 0 || !roomCode}
                      onClick={() => assignSelectedCarsToRandomHomes(carsFilteredSelection)}
                      className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 disabled:opacity-40"
                      title="Assign each selected car to a random house or apartment on the map"
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
                      Click a house or apartment tile on the map to set ownership.
                    </div>
                  )}
                </div>

                <div className="bg-white border border-slate-100 rounded-xl p-3 space-y-1.5 shrink-0">
                  <div className="text-xs font-semibold text-slate-700">Map badges</div>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={economy.showDestinationMarkers !== false}
                      onChange={e => setEconomyBadgeFlag('showDestinationMarkers', e.target.checked)}
                    />
                    Show destination markers
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={economy.showVehicleStopBadges !== false}
                      onChange={e => setEconomyBadgeFlag('showVehicleStopBadges', e.target.checked)}
                    />
                    Show stop / park timer badges
                  </label>
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
                    if (next) {
                      setPendingRouteVehicleId(null);
                      setPendingHomeAssign(false);
                      setSelectedTile(null);
                    }
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
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed top-0 right-0 bottom-0 w-96 bg-white/95 backdrop-blur-md shadow-2xl border-l border-slate-200 z-[100] flex flex-col min-h-0 overflow-hidden"
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

                <div className="flex items-center justify-between px-2 gap-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer min-w-0">
                    <input
                      type="checkbox"
                      checked={semisList.length > 0 && semiFilteredSelection.size === semisList.length}
                      onChange={() => toggleAllVehiclesOfType('semi')}
                      className="rounded border-slate-300 text-amber-600 focus:ring-amber-600"
                    />
                    <span className="truncate">Semis ({semiFilteredSelection.size}/{semisList.length})</span>
                  </label>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => spawnDrivePanels(semiFilteredSelection)}
                      disabled={semiFilteredSelection.size === 0}
                      className="text-sky-600 hover:text-sky-700 disabled:opacity-30 disabled:pointer-events-none p-1 bg-sky-50 hover:bg-sky-100 rounded-md transition-colors"
                      title="Open floating drive panel(s) for selected"
                    >
                      <Joystick className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => removeSelectedCars(semiFilteredSelection)}
                      disabled={semiFilteredSelection.size === 0 || !roomCode}
                      className="text-red-500 hover:text-red-600 disabled:opacity-30 disabled:pointer-events-none p-1 bg-red-50 hover:bg-red-100 rounded-md transition-colors"
                      title="Remove Selected"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
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

                <div className="bg-white border border-slate-100 rounded-xl p-3 space-y-1.5 shrink-0">
                  <div className="text-xs font-semibold text-slate-700">Map badges</div>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={economy.showTrailerCargoLabels ?? economy.showCargoLabels}
                      onChange={e => {
                        setEconomyBadgeFlag('showTrailerCargoLabels', e.target.checked);
                        setEconomyBadgeFlag('showCargoLabels', e.target.checked);
                      }}
                    />
                    Show trailer cargo badges
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={economy.showDestinationMarkers !== false}
                      onChange={e => setEconomyBadgeFlag('showDestinationMarkers', e.target.checked)}
                    />
                    Show destination markers
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={economy.showVehicleStopBadges !== false}
                      onChange={e => setEconomyBadgeFlag('showVehicleStopBadges', e.target.checked)}
                    />
                    Show stop / park timer badges
                  </label>
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
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed top-0 right-0 bottom-0 w-96 bg-white/95 backdrop-blur-md shadow-2xl border-l border-slate-200 z-[100] flex flex-col min-h-0 overflow-hidden"
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

                <div className="flex items-center justify-between px-2 gap-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer min-w-0">
                    <input
                      type="checkbox"
                      checked={trainsList.length > 0 && trainFilteredSelection.size === trainsList.length}
                      onChange={() => toggleAllVehiclesOfType('train')}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                    />
                    <span className="truncate">Trains ({trainFilteredSelection.size}/{trainsList.length})</span>
                  </label>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => spawnDrivePanels(trainFilteredSelection)}
                      disabled={trainFilteredSelection.size === 0}
                      className="text-sky-600 hover:text-sky-700 disabled:opacity-30 disabled:pointer-events-none p-1 bg-sky-50 hover:bg-sky-100 rounded-md transition-colors"
                      title="Open floating drive panel(s) for selected"
                    >
                      <Joystick className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => removeSelectedCars(trainFilteredSelection)}
                      disabled={trainFilteredSelection.size === 0 || !roomCode}
                      className="text-red-500 hover:text-red-600 disabled:opacity-30 disabled:pointer-events-none p-1 bg-red-50 hover:bg-red-100 rounded-md transition-colors"
                      title="Remove Selected"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
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

                <div className="bg-white border border-slate-100 rounded-xl p-3 space-y-1.5 shrink-0">
                  <div className="text-xs font-semibold text-slate-700">Map badges</div>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={economy.showRailcarCargoLabels ?? economy.showCargoLabels}
                      onChange={e => setEconomyBadgeFlag('showRailcarCargoLabels', e.target.checked)}
                    />
                    Show railcar cargo badges
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={economy.showDestinationMarkers !== false}
                      onChange={e => setEconomyBadgeFlag('showDestinationMarkers', e.target.checked)}
                    />
                    Show destination markers
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={economy.showVehicleStopBadges !== false}
                      onChange={e => setEconomyBadgeFlag('showVehicleStopBadges', e.target.checked)}
                    />
                    Show stop / park timer badges
                  </label>
                </div>
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
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed top-0 right-0 bottom-0 w-96 bg-white/95 backdrop-blur-md shadow-2xl border-l border-slate-200 z-[100] flex flex-col min-h-0 overflow-hidden"
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

                <div className="flex items-center justify-between px-2 gap-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer min-w-0">
                    <input
                      type="checkbox"
                      checked={serviceList.length > 0 && serviceFilteredSelection.size === serviceList.length}
                      onChange={() => toggleAllVehiclesOfType('service')}
                      className="rounded border-slate-300 text-orange-600 focus:ring-orange-600"
                    />
                    <span className="truncate">Select All ({serviceFilteredSelection.size}/{serviceList.length})</span>
                  </label>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        const busId =
                          Array.from(serviceFilteredSelection).find(
                            id => vehicles[id]?.type === 'bus',
                          ) || null;
                        const bus = busId ? vehicles[busId] : null;
                        const stationKey =
                          bus?.busStationKey ||
                          (bus
                            ? findNearestBusStationKey(
                                { x: bus.x, y: bus.y },
                                gridRef.current || grid,
                              )
                            : null) ||
                          Object.entries(economy.buildings || {}).find(
                            ([, b]) => b.role === 'bus-station',
                          )?.[0] ||
                          null;
                        if (!stationKey) return;
                        // Ensure config exists
                        if (!economy.buildings[stationKey]) {
                          const tiles = grid[stationKey];
                          const top = tiles?.[tiles.length - 1];
                          if (top?.type === 'building-bus-station') {
                            const initCfg = createBuildingConfig(stationKey, top.type);
                            const nextEco = {
                              ...economy,
                              buildings: { ...economy.buildings, [stationKey]: initCfg },
                            };
                            setEconomy(nextEco);
                            if (roomCode) {
                              socket.emit('update-economy', { roomCode, economy: nextEco });
                            }
                          }
                        }
                        setInspectBuildingKey(stationKey);
                        setPendingBusRouteVehicleId(null);
                        setPendingRouteVehicleId(null);
                        setIsPlacingVehicles(false);
                        setSelectedTile(null);
                      }}
                      disabled={
                        !Object.values(economy.buildings || {}).some(b => b.role === 'bus-station') &&
                        !Object.values(grid).some(tiles =>
                          tiles?.some(t => t.type === 'building-bus-station' && t.part !== 'member'),
                        )
                      }
                      className="disabled:opacity-30 disabled:pointer-events-none p-1 rounded-md transition-colors text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100"
                      title="Open bus station — edit routes & assign buses"
                    >
                      <Bus className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => spawnDrivePanels(serviceFilteredSelection)}
                      disabled={serviceFilteredSelection.size === 0}
                      className="text-sky-600 hover:text-sky-700 disabled:opacity-30 disabled:pointer-events-none p-1 bg-sky-50 hover:bg-sky-100 rounded-md transition-colors"
                      title="Open floating drive panel(s) for selected"
                    >
                      <Joystick className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => removeSelectedCars(serviceFilteredSelection)}
                      disabled={serviceFilteredSelection.size === 0 || !roomCode}
                      className="text-red-500 hover:text-red-600 disabled:opacity-30 disabled:pointer-events-none p-1 bg-red-50 hover:bg-red-100 rounded-md transition-colors"
                      title="Remove Selected"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="bg-white border border-slate-100 rounded-2xl overflow-y-auto overscroll-contain shadow-inner flex flex-col min-h-[120px] max-h-[280px] shrink-0">
                  {serviceList.map(renderVehicleListItem)}
                  {serviceList.length === 0 && (
                    <div className="flex-1 flex items-center justify-center text-sm text-slate-400 p-4">
                      No service vehicles active
                    </div>
                  )}
                </div>

                <div className="text-[10px] text-slate-500 bg-blue-50 border border-blue-100 rounded-lg p-2 space-y-1">
                  <p>
                    <strong>Buses:</strong> open a <strong>Bus Station</strong> on the map to define routes,
                    add buses to the fleet, and assign each bus to a route. After 5 loops they refuel at the station for{' '}
                    {BUS_REFUEL_TICKS}s.
                  </p>
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
                      setPendingPersonFormPick(null);
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

                <div className="bg-white border border-slate-100 rounded-xl p-3 space-y-1.5 shrink-0">
                  <div className="text-xs font-semibold text-slate-700">Map badges</div>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={economy.showDestinationMarkers !== false}
                      onChange={e => setEconomyBadgeFlag('showDestinationMarkers', e.target.checked)}
                    />
                    Show destination markers
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={economy.showVehicleStopBadges !== false}
                      onChange={e => setEconomyBadgeFlag('showVehicleStopBadges', e.target.checked)}
                    />
                    Show stop / park timer badges
                  </label>
                </div>
              </div>

              <div className="shrink-0 p-4 border-t border-slate-200 bg-slate-50/50 max-h-[45vh] overflow-y-auto overscroll-contain space-y-2">
                {serviceFilteredSelection.size === 1 && (() => {
                  const sid = Array.from(serviceFilteredSelection)[0];
                  const sv = vehicles[sid];
                  if (!sv || sv.type !== 'tow-truck') return null;
                  return (
                    <TowHookToggle
                      tow={sv}
                      vehicles={vehicles}
                      grid={grid}
                      roomCode={roomCode}
                      onToggle={() => toggleTowHook(sid)}
                    />
                  );
                })()}
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
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed top-0 right-0 bottom-0 w-[26rem] bg-white/95 backdrop-blur-md shadow-2xl border-l border-slate-200 z-[100] flex flex-col min-h-0 overflow-hidden"
              data-grid-control
              data-testid="people-panel"
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

              <div className="flex-1 min-h-0 overflow-hidden p-4 flex flex-col gap-2.5">
                <div className="flex gap-2 shrink-0">
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
                <p className="text-[10px] text-slate-500 shrink-0">
                  Assign workplaces from the Control row, then click a building. Staff must be on-site for production.
                </p>

                <div className="shrink-0 flex flex-wrap gap-x-3 gap-y-1 bg-violet-50/60 border border-violet-100 rounded-xl px-2.5 py-1.5">
                  <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={economy.showHomeBadges !== false}
                      onChange={e => setEconomyBadgeFlag('showHomeBadges', e.target.checked)}
                    />
                    Home badges
                  </label>
                  <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={economy.showPersonIcons !== false}
                      onChange={e => setEconomyBadgeFlag('showPersonIcons', e.target.checked)}
                    />
                    Person icons
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-1.5 shrink-0">
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
                    disabled={!roomCode}
                    onClick={() => {
                      const next = !isPlacingPeople;
                      setIsPlacingPeople(next);
                      if (next) {
                        setIsPlacingVehicles(false);
                        setPendingEmployeeAssign(false);
                        setPendingHomeAssign(false);
                        setPendingFireStart(false);
                        setPendingRouteVehicleId(null);
                        setPendingPersonFormPick(null);
                        setSelectedTile(null);
                        setTrafficTool(null);
                      }
                    }}
                    className={`flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-bold border disabled:opacity-40 ${
                      isPlacingPeople
                        ? 'bg-violet-600 text-white border-violet-700 animate-pulse'
                        : 'bg-sky-50 text-sky-800 border-sky-200 hover:bg-sky-100'
                    }`}
                    title={
                      selectedPersonIds.size > 0
                        ? 'Click the map to place selected people (roads → sidewalk)'
                        : 'Click the map to drop a new person (roads → sidewalk)'
                    }
                  >
                    <MapPin className="w-3 h-3" />
                    {isPlacingPeople ? 'Clicking map…' : 'Place on map'}
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
                </div>

                {peopleFormMode !== 'closed' && (
                  <div className="bg-white border border-violet-200 rounded-xl p-3 space-y-2 shadow-sm shrink-0 max-h-[38%] overflow-y-auto">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold text-violet-900">
                        {peopleFormMode === 'create' ? 'Create person' : 'Edit person'}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setPendingPersonFormPick(null);
                          setPeopleFormMode('closed');
                        }}
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
                      <div className="col-span-2 space-y-1">
                        <div className="text-[10px] text-slate-500">Home (click house or apartment on map)</div>
                        <div className="flex items-center gap-1.5">
                          <div
                            className={`flex-1 min-w-0 px-2 py-1 rounded border text-xs font-mono truncate ${
                              peopleForm.homeKey
                                ? 'bg-rose-50 border-rose-200 text-rose-800'
                                : 'bg-slate-50 border-slate-200 text-slate-400'
                            }`}
                            title={peopleForm.homeKey || 'No home selected'}
                          >
                            {peopleForm.homeKey ? `🏠 ${peopleForm.homeKey}` : 'No home selected'}
                          </div>
                          <button
                            type="button"
                            disabled={!roomCode}
                            onClick={() => startPersonFormMapPick('home')}
                            className={`shrink-0 px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors disabled:opacity-40 ${
                              pendingPersonFormPick === 'home'
                                ? 'bg-rose-600 text-white border-rose-700 animate-pulse'
                                : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                            }`}
                            title="Click a house or apartment on the map"
                          >
                            {pendingPersonFormPick === 'home' ? 'Click home…' : 'Pick home'}
                          </button>
                          {peopleForm.homeKey && (
                            <button
                              type="button"
                              onClick={() => setPeopleForm(f => ({ ...f, homeKey: '' }))}
                              className="shrink-0 px-1.5 py-1 rounded-lg text-[10px] text-slate-500 hover:bg-slate-100 border border-slate-200"
                              title="Clear home"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="col-span-2 space-y-1">
                        <div className="text-[10px] text-slate-500">Workplace (click building on map, optional)</div>
                        <div className="flex items-center gap-1.5">
                          <div
                            className={`flex-1 min-w-0 px-2 py-1 rounded border text-xs font-mono truncate ${
                              peopleForm.workplaceKey
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                : 'bg-slate-50 border-slate-200 text-slate-400'
                            }`}
                            title={peopleForm.workplaceKey || 'No workplace'}
                          >
                            {peopleForm.workplaceKey ? `👷 ${peopleForm.workplaceKey}` : 'No workplace'}
                          </div>
                          <button
                            type="button"
                            disabled={!roomCode}
                            onClick={() => startPersonFormMapPick('workplace')}
                            className={`shrink-0 px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors disabled:opacity-40 ${
                              pendingPersonFormPick === 'workplace'
                                ? 'bg-emerald-600 text-white border-emerald-700 animate-pulse'
                                : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                            }`}
                            title="Click a building on the map"
                          >
                            {pendingPersonFormPick === 'workplace' ? 'Click building…' : 'Pick building'}
                          </button>
                          {peopleForm.workplaceKey && (
                            <button
                              type="button"
                              onClick={() => setPeopleForm(f => ({ ...f, workplaceKey: '' }))}
                              className="shrink-0 px-1.5 py-1 rounded-lg text-[10px] text-slate-500 hover:bg-slate-100 border border-slate-200"
                              title="Clear workplace"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      </div>
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
                    {peopleFormMode === 'edit' && selectedPersonIds.size === 1 && (() => {
                      const pid = Array.from(selectedPersonIds)[0];
                      const sp = economy.people?.[pid];
                      if (!sp) return null;
                      const sched = sp.schedule || [];
                      return (
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <div className="text-[10px] font-semibold text-slate-700 uppercase tracking-wide">
                              Daily schedule
                              <span className="ml-1 font-normal text-slate-400 normal-case">
                                ({sp.scheduleMode === 'manual' ? 'user' : 'auto'})
                              </span>
                            </div>
                            <div className="flex gap-1">
                              <button
                                type="button"
                                disabled={!roomCode}
                                className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-violet-100 text-violet-800 border border-violet-200 hover:bg-violet-200 disabled:opacity-40"
                                title="System-generate a schedule from age / workplace"
                                onClick={() => {
                                  const stores = listStoreKeys(gridRef.current, economy.buildings || {});
                                  const next = {
                                    ...sp,
                                    schedule: generatePersonSchedule(
                                      { ...sp, workplaceKey: peopleForm.workplaceKey.trim() || sp.workplaceKey },
                                      { stores },
                                    ),
                                    scheduleMode: 'auto' as const,
                                    lastScheduleFireKey: undefined,
                                  };
                                  const people = { ...(economy.people || {}), [pid]: next };
                                  const nextEco = { ...economy, people };
                                  setEconomy(nextEco);
                                  if (roomCode) socket.emit('update-economy', { roomCode, economy: nextEco });
                                }}
                              >
                                Auto-generate
                              </button>
                              <button
                                type="button"
                                disabled={!roomCode || sched.length === 0}
                                className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 disabled:opacity-40"
                                onClick={() => {
                                  const next = {
                                    ...sp,
                                    schedule: [],
                                    scheduleMode: 'manual' as const,
                                    lastScheduleFireKey: undefined,
                                  };
                                  const people = { ...(economy.people || {}), [pid]: next };
                                  const nextEco = { ...economy, people };
                                  setEconomy(nextEco);
                                  if (roomCode) socket.emit('update-economy', { roomCode, economy: nextEco });
                                }}
                              >
                                Clear
                              </button>
                            </div>
                          </div>
                          {sched.length === 0 ? (
                            <p className="text-[9px] text-slate-400">No schedule — AI acts opportunistically.</p>
                          ) : (
                            <ul className="space-y-0.5 max-h-28 overflow-y-auto">
                              {sched.map(e => (
                                <li
                                  key={e.id}
                                  className="flex items-center gap-1.5 text-[10px] text-slate-700 font-mono"
                                >
                                  <span className="text-violet-700 font-bold w-10 shrink-0">
                                    {formatScheduleTime(e.startMinute)}
                                  </span>
                                  <span className="truncate">
                                    {e.label || e.purpose}
                                    {e.destinationKey ? ` → ${e.destinationKey}` : ''}
                                    {e.transport && e.transport !== 'auto' ? ` (${e.transport})` : ''}
                                  </span>
                                  <button
                                    type="button"
                                    className="ml-auto shrink-0 text-slate-400 hover:text-rose-600 px-1"
                                    title="Remove entry"
                                    onClick={() => {
                                      const nextSched = (sp.schedule || []).filter(x => x.id !== e.id);
                                      const next = {
                                        ...sp,
                                        schedule: nextSched,
                                        scheduleMode: 'manual' as const,
                                      };
                                      const people = { ...(economy.people || {}), [pid]: next };
                                      const nextEco = { ...economy, people };
                                      setEconomy(nextEco);
                                      if (roomCode) socket.emit('update-economy', { roomCode, economy: nextEco });
                                    }}
                                  >
                                    ×
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {(
                              [
                                { purpose: 'work' as const, label: '+ Work', hour: 8 },
                                { purpose: 'shop' as const, label: '+ Shop', hour: 12 },
                                { purpose: 'home' as const, label: '+ Home', hour: 17 },
                              ] as const
                            ).map(btn => (
                              <button
                                key={btn.purpose}
                                type="button"
                                disabled={!roomCode}
                                className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                                onClick={() => {
                                  const dest =
                                    btn.purpose === 'home'
                                      ? sp.homeKey
                                      : btn.purpose === 'work'
                                        ? peopleForm.workplaceKey.trim() || sp.workplaceKey
                                        : listStoreKeys(gridRef.current, economy.buildings || {})[0];
                                  if (!dest && btn.purpose !== 'home') return;
                                  const entry = {
                                    id: `sched-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
                                    startMinute: btn.hour * 60,
                                    purpose: btn.purpose,
                                    destinationKey: dest || sp.homeKey,
                                    transport: 'auto' as const,
                                    label: btn.label.replace('+ ', ''),
                                  };
                                  const nextSched = [...(sp.schedule || []), entry].sort(
                                    (a, b) => a.startMinute - b.startMinute,
                                  );
                                  const next = {
                                    ...sp,
                                    schedule: nextSched,
                                    scheduleMode: 'manual' as const,
                                  };
                                  const people = { ...(economy.people || {}), [pid]: next };
                                  const nextEco = { ...economy, people };
                                  setEconomy(nextEco);
                                  if (roomCode) socket.emit('update-economy', { roomCode, economy: nextEco });
                                }}
                              >
                                {btn.label}
                              </button>
                            ))}
                          </div>
                          <p className="text-[9px] text-slate-400 leading-snug">
                            Times use real wall-clock. Short trips walk; longer use car/taxi. Vehicles always yield to pedestrians.
                          </p>
                        </div>
                      );
                    })()}
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
                        onClick={() => {
                          setPendingPersonFormPick(null);
                          setPeopleFormMode('closed');
                        }}
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
                  className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs shrink-0"
                />

                <div className="flex items-center justify-between text-[10px] text-slate-500 px-1 shrink-0">
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

                <div
                  className="shrink-0 bg-violet-50/80 border border-violet-100 rounded-xl px-2 py-1.5 space-y-1"
                  data-testid="people-travel-preference"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[9px] font-bold uppercase tracking-wide text-violet-800">
                      Travel
                    </span>
                    <span className="text-[9px] text-slate-400 truncate">
                      {selectedPersonIds.size === 0
                        ? 'Select people'
                        : 'Applies to the selection'}
                    </span>
                  </div>
                  <TravelPreferenceSwitch
                    name="people-panel-travel"
                    value={selectedTravelPreference}
                    disabled={!roomCode || selectedPersonIds.size === 0}
                    onChange={pref => setPeopleTravelPreference(selectedPersonIds, pref)}
                  />
                </div>

                <div
                  className="shrink-0 flex flex-wrap items-center gap-1 bg-violet-50 border border-violet-100 rounded-xl px-2 py-1.5"
                  data-testid="people-control-bar"
                >
                  <span className="text-[9px] font-bold uppercase tracking-wide text-violet-800 mr-0.5 shrink-0">
                    Control
                  </span>
                  <PeopleIconBtn
                    title={pendingEmployeeAssign ? 'Click a building on the map…' : 'Assign workplace — then click a building'}
                    testId="people-control-assign-work"
                    disabled={selectedPersonIds.size === 0 || !roomCode}
                    active={pendingEmployeeAssign}
                    onClick={startAssignEmployees}
                    className="bg-emerald-600"
                  >
                    <Briefcase className="w-3.5 h-3.5" />
                  </PeopleIconBtn>
                  <PeopleIconBtn
                    title="Clear workplace"
                    testId="people-control-clear-work"
                    disabled={selectedPersonIds.size === 0 || !roomCode}
                    onClick={clearSelectedWorkplaces}
                    className="bg-slate-500"
                  >
                    <CircleOff className="w-3.5 h-3.5" />
                  </PeopleIconBtn>
                  <PeopleIconBtn
                    title="Board selected vehicle as driver"
                    testId="people-control-board-driver"
                    disabled={selectedPersonIds.size === 0 || selectedVehicles.size === 0 || !roomCode}
                    onClick={() => boardSelectedPeople('driver')}
                    className="bg-indigo-600"
                  >
                    <ShipWheel className="w-3.5 h-3.5" />
                  </PeopleIconBtn>
                  <PeopleIconBtn
                    title="Board selected vehicle as passenger"
                    testId="people-control-board-passenger"
                    disabled={selectedPersonIds.size === 0 || selectedVehicles.size === 0 || !roomCode}
                    onClick={() => boardSelectedPeople('passenger')}
                    className="bg-sky-600"
                  >
                    <Users className="w-3.5 h-3.5" />
                  </PeopleIconBtn>
                  <PeopleIconBtn
                    title="Leave vehicle here"
                    testId="people-control-alight"
                    disabled={selectedPersonIds.size === 0 || !roomCode}
                    onClick={() => alightSelectedPeople('here')}
                    className="bg-slate-700"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </PeopleIconBtn>
                  <PeopleIconBtn
                    title="Open floating person control panel(s)"
                    testId="people-control-panel"
                    disabled={selectedPersonIds.size === 0}
                    onClick={() => {
                      for (const id of selectedPersonIds) {
                        spawnPersonPanel(id);
                      }
                    }}
                    className="bg-blue-600"
                  >
                    <Joystick className="w-3.5 h-3.5" />
                  </PeopleIconBtn>
                  <PeopleIconBtn
                    title="Go to work now — uses each person's travel preference"
                    testId="people-control-go-work"
                    disabled={selectedPersonIds.size === 0 || !roomCode}
                    onClick={sendSelectedPeopleToWork}
                    className="bg-emerald-700"
                  >
                    <PlayCircle className="w-3.5 h-3.5" />
                  </PeopleIconBtn>
                  <PeopleIconBtn
                    title="Go home now — uses each person's travel preference"
                    testId="people-control-send-home"
                    disabled={selectedPersonIds.size === 0 || !roomCode}
                    onClick={sendSelectedPeopleHome}
                    className="bg-rose-600"
                  >
                    <Home className="w-3.5 h-3.5" />
                  </PeopleIconBtn>
                  <PeopleIconBtn
                    title="Enter building (at vehicle / open inspector)"
                    testId="people-control-enter-building"
                    disabled={selectedPersonIds.size === 0 || !roomCode}
                    onClick={enterSelectedBuildingWithPeople}
                    className="bg-emerald-700"
                  >
                    <Building2 className="w-3.5 h-3.5" />
                  </PeopleIconBtn>
                </div>

                <div
                  className="bg-white border border-slate-100 rounded-2xl overflow-y-auto min-h-0 flex-1 shadow-inner"
                  data-testid="people-list"
                >
                  {filteredPeople.length === 0 && (
                    <div className="p-6 text-center text-sm text-slate-400">
                      No people yet. Place homes, then Populate houses or create a person.
                    </div>
                  )}
                  {filteredPeople.map(p => {
                    const fam = economy.families?.[p.familyId];
                    const healthEmoji = p.health === 'healthy' ? '💚' : p.health === 'sick' ? '🤒' : '🩹';
                    const isSelected = selectedPersonIds.has(p.id);
                    return (
                      <div
                        key={p.id}
                        data-person-row={p.id}
                        className={`flex gap-2 p-2.5 border-b border-slate-50 hover:bg-sky-50/60 ${
                          isSelected
                            ? 'bg-blue-50 ring-2 ring-inset ring-blue-500 border-l-4 border-l-blue-500'
                            : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-1 accent-blue-600"
                          checked={isSelected}
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
                            selectPerson(p.id, { openEdit: true, openPanel: true });
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
                            {` · ${travelPreferenceLabel(p.travelPreference)}`}
                            {typeof p.money === 'number' ? ` · $${p.money}` : ''}
                            {p.schedule?.length
                              ? ` · 📅 ${p.schedule.length} slots`
                              : ''}
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

          {/* Floating per-person control panels */}
          {personPanels.map(panel => {
            const person = economy.people?.[panel.personId];
            if (!person) return null;
            return (
              <FloatingPersonControlPanel
                key={panel.personId}
                personId={panel.personId}
                person={person}
                people={economy.people}
                position={{ x: panel.x, y: panel.y }}
                zIndex={panel.zIndex}
                isActive={activePersonPanelId === panel.personId}
                roomCode={roomCode}
                grid={grid}
                vehiclesMap={vehicles}
                traffic={traffic}
                selectedVehicleId={
                  (activeDrivePanelId && vehicles[activeDrivePanelId]
                    ? activeDrivePanelId
                    : null) ||
                  Array.from(selectedVehicles)[0] ||
                  null
                }
                onActivate={() => activatePersonPanel(panel.personId)}
                onClose={() => closePersonPanel(panel.personId)}
                onMove={pos => movePersonPanel(panel.personId, pos)}
                onSendHome={() => {
                  setSelectedPersonIds(new Set([panel.personId]));
                  queuePersonTravel(panel.personId, 'home', person.homeKey);
                }}
                onGoToWork={() => {
                  if (!person.workplaceKey) return;
                  queuePersonTravel(panel.personId, 'work', person.workplaceKey);
                }}
                onGoShop={() => {
                  const stores = listStoreKeys(gridRef.current, economy.buildings || {});
                  if (!stores.length) return;
                  queuePersonTravel(
                    panel.personId,
                    'shop',
                    stores[Math.floor(Math.random() * stores.length)],
                  );
                }}
                onLeaveVehicle={() => alightOnePerson(panel.personId)}
                onBoardDriver={() => boardOnePerson(panel.personId, 'driver')}
                onBoardPassenger={() => boardOnePerson(panel.personId, 'passenger')}
                onEnterNearbyBuilding={() => enterBuildingOnePerson(panel.personId)}
                onAssignWorkplace={() => {
                  setSelectedPersonIds(new Set([panel.personId]));
                  startAssignEmployees();
                }}
                onTravelPreference={pref => setPeopleTravelPreference([panel.personId], pref)}
                onFocusOnMap={() => {
                  selectPerson(panel.personId, {
                    openEdit: false,
                    openPanel: true,
                    openControl: false,
                  });
                }}
              />
            );
          })}

          {/* Floating per-vehicle drive control panels */}
          {drivePanels.map(panel => (
            <FloatingVehicleDrivePanel
              key={panel.vehicleId}
              vehicleId={panel.vehicleId}
              vehicle={vehicles[panel.vehicleId]}
              people={economy.people}
              localUserUid={user?.uid}
              position={{ x: panel.x, y: panel.y }}
              zIndex={panel.zIndex}
              isActive={activeDrivePanelId === panel.vehicleId}
              roomCode={roomCode}
              controlsLockedByOther={
                !!(
                  vehicles[panel.vehicleId]?.manualOverride &&
                  vehicles[panel.vehicleId]?.manualOverrideByUid &&
                  user?.uid &&
                  vehicles[panel.vehicleId]?.manualOverrideByUid !== user.uid
                )
              }
              pendingRouteVehicleId={pendingRouteVehicleId}
              isPlacingVehicles={isPlacingVehicles}
              pendingHomeAssign={pendingHomeAssign}
              grid={grid}
              vehiclesMap={vehicles}
              traffic={traffic}
              onActivate={() => activateDrivePanel(panel.vehicleId)}
              onClose={() => closeDrivePanel(panel.vehicleId)}
              onMove={(pos) => moveDrivePanel(panel.vehicleId, pos)}
              onSpeedChange={(s) => {
                activateDrivePanel(panel.vehicleId);
                changeSelectedCarsSpeed(s, [panel.vehicleId]);
              }}
              onToggleAttribute={(a) => {
                activateDrivePanel(panel.vehicleId);
                toggleSelectedCarsAttribute(a, [panel.vehicleId]);
              }}
              onDistribute={() => {
                activateDrivePanel(panel.vehicleId);
                distributeSelectedCars([panel.vehicleId]);
              }}
              onToggleDestination={() => {
                activateDrivePanel(panel.vehicleId);
                toggleDestinationMode([panel.vehicleId]);
              }}
              onPark={() => {
                activateDrivePanel(panel.vehicleId);
                parkSelectedVehicles([panel.vehicleId]);
              }}
              onUnpark={() => {
                activateDrivePanel(panel.vehicleId);
                unparkSelectedVehicles([panel.vehicleId]);
              }}
              onTogglePlacing={() => {
                // keepPlacing so activate does not immediately cancel place mode
                activateDrivePanel(panel.vehicleId, { keepPlacing: true });
                const next = !isPlacingVehicles || activeDrivePanelId !== panel.vehicleId;
                setIsPlacingVehicles(next);
                if (next) {
                  setPendingRouteVehicleId(null);
                  setPendingHomeAssign(false);
                  setSelectedTile(null);
                }
              }}
              onToggleEmergencyLights={() => {
                activateDrivePanel(panel.vehicleId);
                toggleSelectedEmergencyLights([panel.vehicleId]);
              }}
              onToggleHomeAssign={() => {
                // Keep home-assign mode so the toggle can cancel or enable correctly
                activateDrivePanel(panel.vehicleId, { keepHomeAssign: true });
                toggleHomeAssignMode([panel.vehicleId]);
              }}
              onAssignRandomHomes={() => {
                activateDrivePanel(panel.vehicleId);
                assignSelectedCarsToRandomHomes([panel.vehicleId]);
              }}
              onClearHomes={() => {
                activateDrivePanel(panel.vehicleId);
                clearSelectedHomes([panel.vehicleId]);
              }}
              onChangeTrailers={(delta) => {
                activateDrivePanel(panel.vehicleId);
                changeSelectedTrailers(delta, [panel.vehicleId]);
              }}
              onToggleManualOverride={(enabled) => {
                activateDrivePanel(panel.vehicleId);
                setVehicleManualOverride(panel.vehicleId, enabled);
              }}
              onToggleTowHook={() => {
                activateDrivePanel(panel.vehicleId);
                toggleTowHook(panel.vehicleId);
              }}
              onAssignDriver={(personId) => {
                activateDrivePanel(panel.vehicleId);
                assignVehicleDriver(panel.vehicleId, personId);
              }}
              onAssignPassenger={(personId, board) => {
                activateDrivePanel(panel.vehicleId);
                assignVehiclePassenger(panel.vehicleId, personId, board);
              }}
              onAssignOwnerPerson={(personId) => {
                activateDrivePanel(panel.vehicleId);
                assignVehicleOwnerFromPerson(panel.vehicleId, personId);
              }}
              onClearOwner={() => {
                activateDrivePanel(panel.vehicleId);
                clearSelectedHomes([panel.vehicleId]);
              }}
            />
          ))}

          {/* Home people / family inspector */}
          <AnimatePresence>
            {inspectHomeKey && (
              <HomeInspectorModal
                homeKey={inspectHomeKey}
                economy={economy}
                vehicles={vehicles}
                onClose={() => setInspectHomeKey(null)}
                onSelectPerson={(personId) => {
                  selectPerson(personId, { openEdit: true, openPanel: true });
                  setInspectHomeKey(null);
                }}
              />
            )}
          </AnimatePresence>

          {/* Building Economy Inspector Modal (new) */}
          <AnimatePresence>
            {inspectBuildingKey && economy.buildings[inspectBuildingKey] && (
              economy.buildings[inspectBuildingKey].role === 'taxi-station' ? (
                <TaxiStationInspectorModal
                  bkey={inspectBuildingKey}
                  cfg={economy.buildings[inspectBuildingKey]}
                  economy={economy}
                  grid={grid}
                  vehicles={vehicles}
                  setEconomy={setEconomy}
                  setVehicles={setVehicles}
                  roomCode={roomCode}
                  onClose={() => setInspectBuildingKey(null)}
                />
              ) : economy.buildings[inspectBuildingKey].role === 'bus-station' ? (
                <BusStationInspectorModal
                  bkey={inspectBuildingKey}
                  cfg={economy.buildings[inspectBuildingKey]}
                  economy={economy}
                  grid={grid}
                  vehicles={vehicles}
                  setEconomy={setEconomy}
                  setVehicles={setVehicles}
                  roomCode={roomCode}
                  pendingBusRouteEdit={pendingBusRouteEdit}
                  setPendingBusRouteEdit={setPendingBusRouteEdit}
                  onPreviewRoute={setPreviewBusRoute}
                  onClose={() => setInspectBuildingKey(null)}
                />
              ) : (
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
              )
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
                <a
                  href="/help"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-8 w-full py-3 bg-white border-2 border-blue-100 text-blue-700 rounded-2xl font-bold hover:bg-blue-50 transition-all flex items-center justify-center gap-2"
                >
                  <CircleHelp className="w-4 h-4" />
                  Open full documentation
                </a>
                <button 
                  onClick={() => setShowInfo(false)}
                  className="mt-3 w-full py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 active:scale-95"
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
