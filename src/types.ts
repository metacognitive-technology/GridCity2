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
  /** Horizontal mirror of road-roundabout (ring on the SW corner, spur from the east). */
  | 'road-roundabout-reverse'
  /** One tile: 2-lane arms on all four sides, one-lane counterclockwise circle. */
  | 'road-roundabout-4way'
  | 'road-end'
  | 'road-4lane-end'
  /** 2-lane dead-end bulb; one road connection (same port family as road-end) */
  | 'road-cul-de-sac'
  /** 2-lane road with curbside bus stop bay */
  | 'road-bus-stop'
  /** 4-lane road with curbside bus stop bay */
  | 'road-4lane-bus-stop'
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
  | 'building-taxi-station'
  /** 4×4 bus terminal with parking bays */
  | 'building-bus-station'
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
  turnIntent?: 'left' | 'right' | 'straight' | 'uturn' | null;
  stepForward?: boolean;
  stepBackward?: boolean;
  turnAroundAtDeadEnd?: boolean;
  randomTurning?: boolean;
  parkingStopUntil?: number;
  trafficStopUntil?: number;
  trafficStopReason?: 'stop-sign' | 'stoplight' | 'yield' | 'vehicle' | 'pedestrian';
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
  /** Bus passenger: grid key of the stop they want to alight at */
  // (stored on Person — see busDropoffStop)
  /**
   * When true, only the controlling user's direct actions may operate this vehicle.
   * Home AI, auto park/resume, stop signs, people routing, etc. are skipped.
   * Stoplights still apply (only emergency vehicles with lights on may run them).
   */
  manualOverride?: boolean;
  /** Anonymous user uid holding manual override (required when manualOverride is true). */
  manualOverrideByUid?: string;
  /**
   * Robotaxi ownership: unique taxi-station owner id that owns this taxi.
   * Only that station's fleet may dispatch it.
   */
  taxiOwnerId?: string;
  /**
   * Monotonic counter bumped on user place/teleport.
   * Sim leader adopts peer kinematics when peer placeSeq is higher.
   */
  placeSeq?: number;
  // ——— Bus route service ———
  /** Ordered bus-stop tile keys (e.g. "12,5") the bus cycles through */
  busRoute?: string[];
  /** Id of the station route (BuildingConfig.busRoutes) this bus is assigned to */
  busRouteId?: string;
  /** Index of the next stop in busRoute */
  busRouteIndex?: number;
  /** Completed full loops of the route (resets after refuel) */
  busRouteLoops?: number;
  /**
   * route — driving between stops
   * boarding — dwelling at a stop for pick-up/drop-off
   * to-station — heading home to bus station for fuel
   * refueling — parked at station for busRefuelTicks seconds
   */
  busPhase?: 'route' | 'boarding' | 'to-station' | 'refueling';
  /** Wall-clock ms when boarding dwell ends */
  busStopUntil?: number;
  /** Seconds of refuel remaining at station (counts down ~1/sec) */
  busRefuelTicks?: number;
  /** Accumulator ms toward next refuel tick */
  busRefuelAccumMs?: number;
  /** Anchor key of assigned building-bus-station */
  busStationKey?: string;
  /**
   * Tow truck: id of the vehicle currently hooked behind this truck.
   * Only valid when type === 'tow-truck'.
   */
  towedVehicleId?: string;
  /** Set on a vehicle that is hooked to a tow truck (that truck's id). */
  towedById?: string;
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
  | 'in_care'
  | 'waiting_taxi'
  | 'waiting_bus'
  | 'waiting_train'
  | 'walking';

export type TravelPurpose = 'work' | 'shop' | 'home' | 'care';

/** How a single trip is being carried (taxi is the robotaxi). */
export type TravelTransport = 'auto' | 'walk' | 'car' | 'taxi' | 'bus' | 'train';

/**
 * Lasting choice on the person. Mutually exclusive.
 * Unset keeps the older rule: drive the owned car when there is one, otherwise walk.
 */
export type TravelPreference = 'car' | 'bus' | 'robotaxi' | 'train' | 'walk';

/** Where a multi-leg trip is right now. destinationKey stays the final goal. */
export type TravelLeg =
  | 'to-bus-stop'
  | 'bus-ride'
  | 'from-bus'
  | 'to-train-station'
  | 'train-ride'
  | 'from-train';

/** Planned destination for vehicle-based travel (no teleport). */
export interface PersonTravelIntent {
  purpose: TravelPurpose;
  destinationKey: string;
  /** Mode for this trip. auto picks walk for short trips else car/taxi */
  transport?: TravelTransport;
  /**
   * Walk to this vehicle first, then drive to destinationKey.
   * Used when the person owns a car that is not next to them.
   */
  pickupVehicleId?: string;
  /**
   * Interim stop: bus stop to board, or train station to board.
   * The final goal remains destinationKey.
   */
  viaKey?: string;
  leg?: TravelLeg;
  /** Bus stop or train station where the current ride ends */
  alightKey?: string;
}

/**
 * One daily schedule slot. Times use wall-clock local time (minutes from midnight).
 * User-assigned or system-generated.
 */
export interface PersonScheduleEntry {
  id: string;
  /** Minutes from midnight 0–1439 */
  startMinute: number;
  purpose: TravelPurpose | 'idle';
  /** Destination building/home key (defaults by purpose: homeKey / workplaceKey) */
  destinationKey?: string;
  transport?: TravelTransport;
  label?: string;
}

/** Where a person currently is */
export type PersonLocation =
  | { kind: 'home'; homeKey: string }
  | { kind: 'building'; buildingKey: string }
  | { kind: 'vehicle'; vehicleId: string; seat: 'driver' | 'passenger' }
  | { kind: 'tile'; x: number; y: number }
  /** Standing outside a home, building, or bus-stop (next to a road when possible) */
  | { kind: 'outdoor'; atKey: string; /** continuous grid offset 0–1 within tile */ ox?: number; oy?: number }
  /**
   * Walking on sidewalks / crossing roads.
   * x,y are continuous grid coordinates (tile center = n+0.5).
   * path holds remaining integer tile waypoints including current.
   */
  | {
      kind: 'walking';
      x: number;
      y: number;
      path: Array<{ x: number; y: number }>;
      pathIndex: number;
      /** True while crossing the roadway (vehicles must yield) */
      crossing?: boolean;
      /** Destination key this walk is heading toward */
      destKey?: string;
    };

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
  /** Active trip target while commuting / waiting for taxi */
  travelIntent?: PersonTravelIntent;
  /** Active taxi ride id (on a taxi-station building) */
  taxiRideId?: string;
  /** When riding a bus: bus-stop tile key where they want to get off */
  busDropoffStop?: string;
  /**
   * Daily schedule (sorted by startMinute). When set, life AI follows it;
   * otherwise behavior is opportunistic. User may assign or system may generate.
   */
  schedule?: PersonScheduleEntry[];
  /**
   * How this person travels when a trip starts.
   * car: walk to their car, drive, park at the destination.
   * robotaxi: wait to be picked up and dropped off.
   * bus: walk to the nearest stop, ride, alight at the stop nearest the destination.
   * train: reach the nearest station by another mode, ride, alight at the station nearest the destination, then continue.
   * walk: sidewalks the whole way.
   */
  travelPreference?: TravelPreference;
  /** 'manual' = user-owned schedule (do not auto-regenerate); 'auto' = system may refresh */
  scheduleMode?: 'auto' | 'manual';
  /** Last schedule entry id applied this wall day (YYYY-MM-DD:entryId) */
  lastScheduleFireKey?: string;
}

/** In-progress taxi job tracked on a taxi station */
export interface ActiveTaxiRide {
  id: string;
  taxiId: string;
  passengerId: string;
  passengerLabel?: string;
  /** to_pickup: empty taxi → passenger; to_dropoff: passenger aboard → dest */
  phase: 'to_pickup' | 'to_dropoff';
  pickupKey: string;
  destinationKey: string;
  purpose: TravelPurpose;
  startedAt: number;
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

/** Named stop list defined at a bus station. Fleet buses are assigned by id. */
export interface BusRoute {
  id: string;
  name: string;
  /** Ordered bus-stop tile keys */
  stops: string[];
}

export interface BuildingConfig {
  anchorKey: string;
  name?: string;
  role: 'warehouse' | 'factory' | 'store' | 'lumbermill' | 'repair-shop' | 'hospital' | 'taxi-station' | 'bus-station' | 'none';
  inventory: Record<ItemId, number>;
  /** Max stored quantity per item type */
  inventoryCapacity?: Record<ItemId, number>;
  // Store
  /** Units per second per customer currently shopping in the store */
  consumptionRates?: Record<ItemId, number>;
  // Factory
  recipeInputs?: Array<{ item: ItemId; amount: number }>;
  recipeOutputs?: Array<{ item: ItemId; amount: number }>;
  cycleTimeSec?: number;
  productionEnabled?: boolean;
  /** Minimum on-site employees (present at this building) required for recipe production */
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
  // Taxi station
  /**
   * Unique owner id for this station's fleet (stable; not the map anchor key).
   * All taxis owned by this station carry the same taxiOwnerId.
   */
  taxiStationOwnerId?: string;
  /** Vehicle ids owned by this station (starts empty for new stations) */
  taxiFleetIds?: string[];
  /** Live rides currently served by this station */
  activeTaxiRides?: ActiveTaxiRide[];
  // Bus station
  /** Vehicle ids (buses) assigned to this station’s fleet */
  busFleetIds?: string[];
  /**
   * Named routes for this station. Each fleet bus is assigned to one route.
   */
  busRoutes?: BusRoute[];
  /**
   * Legacy single shared route. Migrated into busRoutes on load.
   * New writes mirror the first route's stops.
   */
  busRoute?: string[];
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
  /** When false, stop signs / stoplights are hidden on the map */
  showControls?: boolean;
}

export interface EconomyState {
  itemDefs: ItemDef[];
  buildings: Record<string, BuildingConfig>; // key = anchorKey
  parkedTrailers?: Record<string, ParkedTrailer>;
  /** Building inventory / production / staffing badges (Logistics) */
  showInventoryLabels: boolean;
  /** Legacy combined cargo labels; kept for older rooms */
  showCargoLabels: boolean;
  /** Trailer cargo badges on semis & parked trailers (Semis panel) */
  showTrailerCargoLabels?: boolean;
  /** Railcar cargo badges on trains (Trains panel) */
  showRailcarCargoLabels?: boolean;
  /** Home occupancy badges on houses (People panel) */
  showHomeBadges?: boolean;
  /** Restroom-style person icons on the map (People panel) */
  showPersonIcons?: boolean;
  /** Destination bullseye markers for routed vehicles (Cars / Service) */
  showDestinationMarkers?: boolean;
  /** Parking / traffic stop countdown badges on vehicles */
  showVehicleStopBadges?: boolean;
  /** Growth % badges on pine seedlings (Plant Growth panel) */
  showSeedlingBadges?: boolean;
  economyPaused: boolean;
  plantGrowth?: PlantGrowthSettings;
  /** Citizens simulation */
  people?: Record<string, Person>;
  families?: Record<string, Family>;
  peoplePaused?: boolean;
  /**
   * City / simulation clock offset from wall time.
   * simNow = Date.now() + cityTimeOffsetMs
   * Set when the user changes the top-of-grid clock; schedules and city AI use simNow.
   */
  cityTimeOffsetMs?: number;
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
