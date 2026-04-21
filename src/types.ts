export type TileType = 
  | 'road-straight'
  | 'road-curve'
  | 'road-t'
  | 'road-cross'
  | 'road-bridge'
  | 'road-oneway-straight'
  | 'road-oneway-curve'
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
  | 'grass-plain'
  | 'grass-tall'
  | 'grass-flowers'
  | 'tree-pine'
  | 'tree-oak'
  | 'landscape-gravel'
  | 'landscape-sand';

export interface GridTile {
  type: TileType;
  rotation: number; // 0, 90, 180, 270
}

export type GridData = Record<string, GridTile[]>;

export interface Point {
  x: number;
  y: number;
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
  type?: 'car' | 'train' | 'semi';
  trailers?: number;
  isMoving?: boolean;
  speed?: number;
  turnIntent?: 'left' | 'right' | 'straight' | null;
  stepForward?: boolean;
  stepBackward?: boolean;
  turnAroundAtDeadEnd?: boolean;
  randomTurning?: boolean;
}
