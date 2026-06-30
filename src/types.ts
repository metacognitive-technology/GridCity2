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
}

export type GridData = Record<string, GridTile[]>;

export interface Point {
  x: number;
  y: number;
}

export type RailcarType = 'passenger' | 'flatbed' | 'boxcar' | 'container' | 'closed-hopper' | 'open-hopper' | 'tank';

export interface Vehicle {
  id: string; // unique id (usually owner uid)
  x: number; // grid x
  y: number; // grid y
  heading: number; // 0, 90, 180, 270 (absolute)
  lane: number; // -1 (left lane), 1 (right lane) - relative to heading
  progress: number; // 0 to 1 within the tile
  color: string;
  zIndex: number; // 0 for ground, 1 for bridge
  type?: 'car' | 'train' | 'semi';
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
  lastParkingKey?: string;
  parkingStallIndex?: number;
  parkOnNextLot?: boolean;
  // New: destination routing + trailer cargo for semis
  destination?: Point | null;
  trailerCargos?: Cargo[];
  railcarCargos?: Cargo[];
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

export interface BuildingConfig {
  anchorKey: string;
  name?: string;
  role: 'warehouse' | 'factory' | 'store' | 'lumbermill' | 'none';
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
  // internal sim state
  processAccum?: number; // seconds accumulator for current cycle
}

export interface PlantGrowthSettings {
  growthDurationSec: number;
  germinationSec: number;
  paused: boolean;
}

export interface EconomyState {
  itemDefs: ItemDef[];
  buildings: Record<string, BuildingConfig>; // key = anchorKey
  parkedTrailers?: Record<string, ParkedTrailer>;
  showInventoryLabels: boolean;
  showCargoLabels: boolean;
  economyPaused: boolean;
  plantGrowth?: PlantGrowthSettings;
}
