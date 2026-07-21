export type TileType = 
  | 'road-straight'
  | 'road-curve'
  | 'road-t'
  | 'road-cross'
  | 'road-bridge'
  | 'road-oneway-straight'
  | 'road-oneway-bridge'
  | 'road-oneway-curve'
  | 'road-oneway-curve-reverse'
  | 'road-4lane-straight'
  | 'road-4lane-curve'
  | 'road-4lane-t'
  | 'road-4lane-cross'
  | 'road-4lane-bridge'
  | 'road-transition-2to4'
  | 'road-roundabout'
  | 'road-end'
  | 'road-4lane-end'
  | 'rail-straight'
  | 'rail-curve'
  | 'rail-t'
  | 'rail-cross'
  | 'rail-end'
  | 'rail-trestle'
  | 'rail-road-crossing'
  | 'building-factory'
  | 'building-warehouse'
  | 'building-station'
  | 'building-home'
  | 'building-school'
  | 'building-store'
  | 'building-playground'
  | 'building-police'
  | 'building-fire'
  | 'building-strip-mall'
  | 'building-lumbermill'
  | 'building-apartment'
  | 'building-highschool'
  | 'building-college'
  | 'building-university'
  | 'building-large-park'
  | 'building-warehouse-large'
  | 'building-factory-large'
  | 'building-train-station-large'
  | 'building-repair-shop'
  | 'building-hospital'
  | 'grass-plain'
  | 'grass-tall'
  | 'grass-flowers'
  | 'tree-pine'
  | 'tree-pine-seedling'
  | 'tree-oak'
  | 'landscape-gravel'
  | 'landscape-sand'
  | 'parking-1x1'
  | 'parking-1x2'
  | 'parking-1x3'
  | 'parking-2x2'
  | 'parking-2x4'
  | 'parking-4x4';

export interface GridTile {
  type: TileType;
  rotation: number; // 0, 90, 180, 270
  part?: 'anchor' | 'member';
  localX?: number;
  localY?: number;
  w?: number;
  h?: number;
  anchorKey?: string;
  growthProgress?: number; // 0–1 for tree-pine-seedling
  /** Timestamp (ms) when a burning tree finishes and is removed */
  burningUntil?: number;
}

export type GridData = Record<string, GridTile[]>;

export interface Point {
  x: number;
  y: number;
}

export interface RemoteCursor {
  socketId: string;
  userId: string;
  userColor: string;
  gridX: number;
  gridY: number;
  isBuffered: boolean;
  lastSeen: number;
}

export type RailcarType = 'passenger' | 'flatbed' | 'boxcar' | 'container' | 'closed-hopper' | 'open-hopper' | 'tank';

/** Road vehicles used for emergency / roadside / public service */
export type ServiceVehicleType =
  | 'fire-truck'
  | 'police'
  | 'ambulance'
  | 'tow-truck'
  | 'taxi'
  | 'bus';

export type VehicleType = 'car' | 'train' | 'semi' | ServiceVehicleType;

export const SERVICE_VEHICLE_TYPES: ServiceVehicleType[] = [
  'fire-truck',
  'police',
  'ambulance',
  'tow-truck',
  'taxi',
  'bus',
];

/** Vehicles that have emergency light bars (not taxi/bus). */
export const EMERGENCY_LIGHT_VEHICLE_TYPES: ServiceVehicleType[] = [
  'fire-truck',
  'police',
  'ambulance',
  'tow-truck',
];

export function isServiceVehicleType(type: string | undefined): type is ServiceVehicleType {
  return !!type && (SERVICE_VEHICLE_TYPES as string[]).includes(type);
}

export function hasEmergencyLights(type: string | undefined): boolean {
  return !!type && (EMERGENCY_LIGHT_VEHICLE_TYPES as string[]).includes(type);
}

export interface Vehicle {
  id: string; // unique id (usually owner uid)
  x: number; // grid x
  y: number; // grid y
  heading: number; // 0, 90, 180, 270 (absolute)
  lane: number; // -1 (left lane), 1 (right lane) - relative to heading
  progress: number; // 0 to 1 within the tile
  color: string;
  zIndex: number; // 0 for ground, 1 for bridge
  type?: VehicleType;
  trailers?: number;
  railcars?: RailcarType[];
  isMoving?: boolean;
  speed?: number;
  turnIntent?: 'left' | 'right' | 'straight' | null;
  stepForward?: boolean;
  stepBackward?: boolean;
  turnAroundAtDeadEnd?: boolean;
  randomTurning?: boolean;
  parkingStopUntil?: number;
  trafficStopUntil?: number;
  trafficStopReason?: 'stop-sign' | 'stoplight' | 'yield' | 'vehicle';
  /** `${gridKey}:${signId}` — stop sign already satisfied on current tile traversal */
  satisfiedStopSignKey?: string;
  lastParkingKey?: string;
  parkingStallIndex?: number;
  parkOnNextLot?: boolean;
  // New: destination routing + trailer cargo for semis
  destination?: Point | null;
  trailerCargos?: Cargo[];
  railcarCargos?: Cargo[];
  /** Last completed repair recipe name/id (display) */
  lastRepairId?: string;
  lastRepairAt?: number;
  /**
   * Emergency light bar for service vehicles.
   * Undefined defaults to ON for fire/police/ambulance/tow.
   */
  emergencyLightsOn?: boolean;
  /** Grid key of the owner's house (e.g. "12,5") — car returns here to park */
  homeKey?: string;
  /** Timestamp when the car should next set destination to homeKey */
  nextHomeReturnAt?: number;
  /** Person id of the driver (required for the vehicle to move) */
  driverId?: string;
  /** Person ids of passengers (excluding driver) */
  passengerIds?: string[];
  /** Max passengers excluding driver (defaults by vehicle type) */
  maxPassengers?: number;
}

export type PersonSex = 'm' | 'f';

export type PersonHealth = 'healthy' | 'sick' | 'injured';

export type PersonActivity =
  | 'home'
  | 'idle'
  | 'commuting'
  | 'working'
  | 'shopping'
  | 'seeking_care'
  | 'in_care';

/** Where a person currently is */
export type PersonLocation =
  | { kind: 'home'; homeKey: string }
  | { kind: 'building'; buildingKey: string }
  | { kind: 'vehicle'; vehicleId: string; seat: 'driver' | 'passenger' }
  | { kind: 'tile'; x: number; y: number };

export interface Person {
  id: string;
  firstName: string;
  lastName: string;
  /** Fractional age in years (0–100). 1 year = 1 hour wall time. */
  ageYears: number;
  /** Wall-clock ms when ageYears was last advanced */
  ageUpdatedAt: number;
  sex: PersonSex;
  familyId: string;
  spouseId?: string;
  parentIds?: string[];
  homeKey: string;
  workplaceKey?: string;
  location: PersonLocation;
  health: PersonHealth;
  illnessId?: string;
  money?: number;
  activity?: PersonActivity;
  activityUntil?: number;
}

export interface Family {
  id: string;
  lastName: string;
  homeKey: string;
  memberIds: string[];
}

export type ItemId = string;

export interface ItemDef {
  id: ItemId;
  name: string;
  emoji?: string;
}

export interface Cargo {
  [itemId: string]: number;
}

/** Trailer detached from a semi and left in a parking stall */
export interface ParkedTrailer {
  id: string;
  parkingLotKey: string;
  stallIndex: number;
  gridX: number;
  gridY: number;
  heading: number;
  cargo: Cargo;
}

/** User-defined repair job performed at a vehicle repair shop */
export interface RepairRecipe {
  id: string;
  name: string;
  description?: string;
  /** Parts / supplies consumed when the repair starts */
  inputs: Array<{ item: ItemId; amount: number }>;
  cycleTimeSec: number;
  /** Empty / omitted = any vehicle type */
  vehicleTypes?: VehicleType[];
}

/** In-progress repair job in a service bay */
export interface ActiveRepair {
  id: string;
  recipeId: string;
  vehicleId: string;
  bayIndex: number;
  processAccum: number;
}

/** User-defined illness / healing protocol at a hospital */
export interface IllnessRecipe {
  id: string;
  name: string;
  description?: string;
  /** Medical supplies consumed when treatment starts */
  inputs: Array<{ item: ItemId; amount: number }>;
  /** How long the patient stays in care (seconds) */
  stayDurationSec: number;
  /** Empty / omitted = ambulances (and any parked vehicle at bay) */
  vehicleTypes?: VehicleType[];
}

/** Patient currently being treated in a hospital ward/bay */
export interface ActivePatient {
  id: string;
  illnessId: string;
  /** Ambulance (or other vehicle) that delivered the patient, if still associated */
  vehicleId?: string;
  bayIndex: number;
  processAccum: number;
  patientLabel?: string;
}

export interface BuildingConfig {
  anchorKey: string;
  name?: string;
  role: 'warehouse' | 'factory' | 'store' | 'lumbermill' | 'repair-shop' | 'hospital' | 'none';
  inventory: Record<ItemId, number>;
  /** Max stored quantity per item type */
  inventoryCapacity?: Record<ItemId, number>;
  // Store
  consumptionRates?: Record<ItemId, number>; // units per second
  // Factory
  recipeInputs?: Array<{ item: ItemId; amount: number }>;
  recipeOutputs?: Array<{ item: ItemId; amount: number }>;
  cycleTimeSec?: number;
  productionEnabled?: boolean;
  /** Minimum assigned employees (people with workplaceKey = this building) required for recipe production */
  requiredEmployees?: number;
  // internal sim state
  processAccum?: number; // seconds accumulator for current cycle
  // Repair shop
  repairRecipes?: RepairRecipe[];
  activeRepairs?: ActiveRepair[];
  // Hospital
  illnessRecipes?: IllnessRecipe[];
  activePatients?: ActivePatient[];
  /** Running total of patients successfully treated */
  patientsHealed?: number;
}

export interface PlantGrowthSettings {
  growthDurationSec: number;
  germinationSec: number;
  paused: boolean;
}

export type TrafficLightPhase = 'red' | 'yellow' | 'green';

export interface StopSignControl {
  kind: 'stop-sign';
  id: number;
  gridKey: string;
  /** Tile-local edge port (0=N, 1=E, 2=S, 3=W) before rotation */
  edgePort: number;
  /** Optional lane filter (-1 or 1 for 2-lane) */
  lane?: number;
}

export interface StoplightControl {
  kind: 'stoplight';
  id: number;
  gridKey: string;
  heading: number;
  lane: number;
  phase: TrafficLightPhase;
  manualOnly: boolean;
  redMs: number;
  yellowMs: number;
  greenMs: number;
  phaseStartedAt: number;
  groupId?: string;
}

export type TrafficControl = StopSignControl | StoplightControl;

export interface TrafficState {
  stopSignMinDurationSec: number;
  stopSignSizeScale: number;
  stoplightSizeScale: number;
  nextLightId: number;
  nextSignId: number;
  controls: Record<string, TrafficControl>;
}

export interface EconomyState {
  itemDefs: ItemDef[];
  buildings: Record<string, BuildingConfig>; // key = anchorKey
  parkedTrailers?: Record<string, ParkedTrailer>;
  showInventoryLabels: boolean;
  showCargoLabels: boolean;
  economyPaused: boolean;
  plantGrowth?: PlantGrowthSettings;
  /** Citizens simulation */
  people?: Record<string, Person>;
  families?: Record<string, Family>;
  peoplePaused?: boolean;
}

/** Saved layout: tiles plus economy state for buildings in the selection */
export interface LayoutSnapshot {
  /** Discriminator for the snapshot format (legacy layouts are bare GridData) */
  version?: 2;
  grid: GridData;
  /** Building configs keyed by relative anchor position within the layout */
  buildings: Record<string, BuildingConfig>;
  /** Item definitions referenced by building inventories/recipes */
  itemDefs?: ItemDef[];
}
