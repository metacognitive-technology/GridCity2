/**
 * Road connection ports shared by the client road code and the server
 * in-game task checker. Ports: 0=N, 1=E, 2=S, 3=W.
 * worldPort = (localPort + rotation/90) % 4.
 * North is decreasing y, matching planNeighborhood's neighbor test.
 */

export const TILE_CONNECTIONS: Record<string, number[]> = {
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
  /** Mirror of road-roundabout. Same ports; the art is flipped. */
  'road-roundabout-reverse': [0, 1, 2, 3],
  /** 2-lane mouths on N/E/S/W. The entry port is also an exit (U-turn around the circle). */
  'road-roundabout-4way': [0, 1, 2, 3],
  'road-end': [2],
  'road-4lane-end': [2],
  /** Bulb end. Port 2 (south before rotation) is the only stem. */
  'road-cul-de-sac': [2],
  'road-bus-stop': [0, 2],
  'road-4lane-bus-stop': [0, 2],
  // Driveable bays / lots — full 4-way access (robotaxis exit onto any adjacent road)
  'parking-1x1': [0, 1, 2, 3],
  'parking-1x2': [0, 1, 2, 3],
  'parking-1x3': [0, 1, 2, 3],
  'parking-2x2': [0, 1, 2, 3],
  'parking-2x4': [0, 1, 2, 3],
  'parking-4x4': [0, 1, 2, 3],
  'building-repair-shop': [0, 1, 2, 3],
  'building-hospital': [0, 1, 2, 3],
  'building-taxi-station': [0, 1, 2, 3],
  'building-bus-station': [0, 1, 2, 3],
  'building-home': [0, 1, 2, 3],
  'building-apartment': [0, 1, 2, 3],
};

/** Step from a cell through a world port. N is -y. */
export const PORT_DELTA: ReadonlyArray<{ x: number; y: number }> = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/** World-space ports for a tile type and rotation. Same formula as getRoadWorldPorts. */
export function worldPorts(type: string, rotation: number): number[] {
  const ports = TILE_CONNECTIONS[type] || [];
  const rotSteps = (((rotation % 360) + 360) % 360) / 90;
  return ports.map((port) => (port + rotSteps) % 4);
}

export function oppositePort(port: number): number {
  return (port + 2) % 4;
}
