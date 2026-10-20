/**
 * GrokBot structured actions + pure planners.
 * Client executes these through the same placement paths as the palette UI.
 *
 * Limits (soft): max 150 buildings, 30 bus stops, 8 buses, 2000 road cells per command.
 * Large plans should be batched by the App executor (~32ms between chunks).
 */

export const BOT_ACTION_LIMITS = {
  maxBuildings: 150,
  maxBusStops: 30,
  maxBuses: 8,
  maxRoadCells: 2000,
  batchSize: 32,
  batchDelayMs: 32,
} as const;

export type BotPoint = { x: number; y: number };

export type BotAsk =
  | { type: 'pick_location'; prompt: string; pendingActions?: BotAction[] }
  | { type: 'pick_building'; prompt: string; pendingActions?: BotAction[] }
  | { type: 'choice'; prompt: string; options: string[]; pendingActions?: BotAction[] };

export type BotAction =
  | { op: 'place_tile'; x: number; y: number; tile: string; rotation?: number }
  | { op: 'place_building'; x: number; y: number; tile: string; rotation?: number }
  | { op: 'delete_cells'; cells: BotPoint[] }
  | { op: 'place_road_line'; from: BotPoint; to: BotPoint; lane?: '2' | '4' }
  | {
      op: 'setup_bus_service';
      station: BotPoint;
      stops: BotPoint[];
      buses?: number;
    }
  | {
      op: 'build_neighborhood';
      homes: number;
      school?: boolean;
      origin?: BotPoint;
    }
  | {
      op: 'build_city';
      homes: number;
      factories: number;
      stores: number;
      busService?: boolean;
      origin?: BotPoint;
    };

export type BotChatResponse = {
  reply: string;
  actions?: BotAction[];
  ask?: BotAsk;
};

export type ConcreteOp =
  | { op: 'place_tile'; x: number; y: number; tile: string; rotation: number }
  | { op: 'place_building'; x: number; y: number; tile: string; rotation: number }
  | { op: 'delete_cells'; cells: BotPoint[] }
  | {
      op: 'setup_bus_service';
      station: BotPoint;
      stops: BotPoint[];
      buses: number;
    };

const MULTI_TILE_TYPES = new Set([
  'parking-1x1',
  'parking-1x2',
  'parking-1x3',
  'parking-2x2',
  'parking-2x4',
  'parking-4x4',
  'building-strip-mall',
  'building-lumbermill',
  'building-apartment',
  'building-highschool',
  'building-college',
  'building-university',
  'building-large-park',
  'building-warehouse-large',
  'building-factory-large',
  'building-train-station-large',
  'building-repair-shop',
  'building-hospital',
  'building-taxi-station',
  'building-bus-station',
]);

export function isMultiTileType(tile: string): boolean {
  return MULTI_TILE_TYPES.has(tile) || tile.startsWith('parking-');
}

function asInt(n: unknown, fallback = 0): number {
  const v = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(v) ? Math.trunc(v) : fallback;
}

function asPoint(p: any): BotPoint | null {
  if (!p || typeof p !== 'object') return null;
  if (!Number.isFinite(Number(p.x)) || !Number.isFinite(Number(p.y))) return null;
  return { x: asInt(p.x), y: asInt(p.y) };
}

function parseOneAction(raw: any): BotAction | null {
  if (!raw || typeof raw !== 'object' || typeof raw.op !== 'string') return null;
  switch (raw.op) {
    case 'place_tile':
    case 'place_building': {
      if (typeof raw.tile !== 'string' || !raw.tile.trim()) return null;
      const x = asInt(raw.x, NaN);
      const y = asInt(raw.y, NaN);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      const rotation = raw.rotation !== undefined ? asInt(raw.rotation, 0) : undefined;
      return { op: raw.op, x, y, tile: raw.tile.trim(), rotation };
    }
    case 'delete_cells': {
      if (!Array.isArray(raw.cells)) return null;
      const cells = raw.cells.map(asPoint).filter(Boolean) as BotPoint[];
      return { op: 'delete_cells', cells };
    }
    case 'place_road_line': {
      const from = asPoint(raw.from);
      const to = asPoint(raw.to);
      if (!from || !to) return null;
      const lane = raw.lane === '4' ? '4' : '2';
      return { op: 'place_road_line', from, to, lane };
    }
    case 'setup_bus_service': {
      const station = asPoint(raw.station);
      if (!station || !Array.isArray(raw.stops)) return null;
      const stops = raw.stops.map(asPoint).filter(Boolean) as BotPoint[];
      const buses = raw.buses !== undefined ? Math.max(0, asInt(raw.buses, 2)) : undefined;
      return { op: 'setup_bus_service', station, stops, buses };
    }
    case 'build_neighborhood': {
      const homes = Math.max(0, asInt(raw.homes, 0));
      const origin = raw.origin ? asPoint(raw.origin) || undefined : undefined;
      return {
        op: 'build_neighborhood',
        homes,
        school: raw.school !== false,
        origin,
      };
    }
    case 'build_city': {
      const origin = raw.origin ? asPoint(raw.origin) || undefined : undefined;
      return {
        op: 'build_city',
        homes: Math.max(0, asInt(raw.homes, 0)),
        factories: Math.max(0, asInt(raw.factories, 0)),
        stores: Math.max(0, asInt(raw.stores, 0)),
        busService: !!raw.busService,
        origin,
      };
    }
    default:
      return null;
  }
}

export function parseBotAsk(raw: any): BotAsk | undefined {
  if (!raw || typeof raw !== 'object' || typeof raw.prompt !== 'string') return undefined;
  const prompt = raw.prompt.trim();
  if (!prompt) return undefined;
  const pending = Array.isArray(raw.pendingActions)
    ? (raw.pendingActions.map(parseOneAction).filter(Boolean) as BotAction[])
    : undefined;
  if (raw.type === 'pick_location' || raw.type === 'pick_building') {
    return { type: raw.type, prompt, pendingActions: pending };
  }
  if (raw.type === 'choice') {
    const options = Array.isArray(raw.options)
      ? raw.options.filter((o: any) => typeof o === 'string' && o.trim()).map((o: string) => o.trim())
      : [];
    if (!options.length) return undefined;
    return { type: 'choice', prompt, options, pendingActions: pending };
  }
  return undefined;
}

/** Extract JSON object from model content (raw or fenced). */
export function parseBotChatPayload(content: string): BotChatResponse {
  const trimmed = (content || '').trim();
  if (!trimmed) return { reply: '' };

  const tryParse = (s: string): BotChatResponse | null => {
    try {
      const obj = JSON.parse(s);
      if (!obj || typeof obj !== 'object') return null;
      const reply = typeof obj.reply === 'string' ? obj.reply.trim() : '';
      const actions = Array.isArray(obj.actions)
        ? (obj.actions.map(parseOneAction).filter(Boolean) as BotAction[])
        : undefined;
      const ask = parseBotAsk(obj.ask);
      if (!reply && !actions?.length && !ask) return null;
      return { reply: reply || (ask ? ask.prompt : 'OK'), actions, ask };
    } catch {
      return null;
    }
  };

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    const parsed = tryParse(fence[1].trim());
    if (parsed) return parsed;
  }
  if (trimmed.startsWith('{')) {
    const parsed = tryParse(trimmed);
    if (parsed) return parsed;
  }
  const brace = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (brace >= 0 && last > brace) {
    const parsed = tryParse(trimmed.slice(brace, last + 1));
    if (parsed) return parsed;
  }
  return { reply: trimmed };
}

export function injectOrigin(actions: BotAction[], origin: BotPoint): BotAction[] {
  return actions.map(a => {
    if (a.op === 'build_neighborhood' || a.op === 'build_city') {
      return { ...a, origin: a.origin || origin };
    }
    return a;
  });
}

export type OccupancyFn = (x: number, y: number) => boolean;
export type InBoundsFn = (x: number, y: number) => boolean;

type PlanCtx = {
  occupied: OccupancyFn;
  inBounds: InBoundsFn;
};

function keyOf(x: number, y: number) {
  return `${x},${y}`;
}

function manhattanLine(from: BotPoint, to: BotPoint): BotPoint[] {
  const pts: BotPoint[] = [];
  let x = from.x;
  let y = from.y;
  pts.push({ x, y });
  while (x !== to.x) {
    x += Math.sign(to.x - x);
    pts.push({ x, y });
  }
  while (y !== to.y) {
    y += Math.sign(to.y - y);
    pts.push({ x, y });
  }
  return pts;
}

// Corner rule: count===2 adjacent neighbors → road-curve (never road-end/cul-de-sac).
// Ends/cul-de-sacs only for count===1 stubs. Loop corners must be 2-neighbor curves.
function resolveRoad2(
  x: number,
  y: number,
  skeleton: Set<string>,
): { tile: string; rotation: number } {
  const n = skeleton.has(keyOf(x, y - 1));
  const e = skeleton.has(keyOf(x + 1, y));
  const s = skeleton.has(keyOf(x, y + 1));
  const w = skeleton.has(keyOf(x - 1, y));
  const count = [n, e, s, w].filter(Boolean).length;
  if (count === 4) return { tile: 'road-cross', rotation: 0 };
  if (count === 3) {
    // TILE_CONNECTIONS: road-t local ports [0,2,3] = N+S+W (!E at rot 0).
    // Craft recipe (NOT randomRoads resolveTile): !E->0, !S->90, !W->180, !N->270
    if (!e) return { tile: 'road-t', rotation: 0 };
    if (!s) return { tile: 'road-t', rotation: 90 };
    if (!w) return { tile: 'road-t', rotation: 180 };
    return { tile: 'road-t', rotation: 270 }; // !n
  }
  if (count === 2) {
    if (n && s) return { tile: 'road-straight', rotation: 0 };
    if (e && w) return { tile: 'road-straight', rotation: 90 };
    if (n && e) return { tile: 'road-curve', rotation: 90 };
    if (e && s) return { tile: 'road-curve', rotation: 180 };
    if (s && w) return { tile: 'road-curve', rotation: 270 };
    if (w && n) return { tile: 'road-curve', rotation: 0 };
  }
  if (count === 1) {
    if (n) return { tile: 'road-cul-de-sac', rotation: 180 };
    if (e) return { tile: 'road-cul-de-sac', rotation: 270 };
    if (s) return { tile: 'road-cul-de-sac', rotation: 0 };
    if (w) return { tile: 'road-cul-de-sac', rotation: 90 };
  }
  return { tile: 'road-straight', rotation: 0 };
}

function addRoadSkeleton(skel: Set<string>, pts: BotPoint[], ctx: PlanCtx, limit: { n: number }) {
  for (const p of pts) {
    if (limit.n >= BOT_ACTION_LIMITS.maxRoadCells) break;
    if (!ctx.inBounds(p.x, p.y)) continue;
    const k = keyOf(p.x, p.y);
    if (skel.has(k)) continue;
    skel.add(k);
    limit.n += 1;
  }
}

function emitRoadsFromSkeleton(skel: Set<string>, busStopKeys: Set<string>): ConcreteOp[] {
  const ops: ConcreteOp[] = [];
  for (const k of skel) {
    const [xs, ys] = k.split(',');
    const x = Number(xs);
    const y = Number(ys);
    if (busStopKeys.has(k)) {
      ops.push({
        op: 'place_tile',
        x,
        y,
        tile: 'road-bus-stop',
        rotation: resolveRoad2(x, y, skel).rotation,
      });
    } else {
      const { tile, rotation } = resolveRoad2(x, y, skel);
      ops.push({ op: 'place_tile', x, y, tile, rotation });
    }
  }
  return ops;
}

function tryPlaceBuilding(
  ops: ConcreteOp[],
  reserved: Set<string>,
  ctx: PlanCtx,
  x: number,
  y: number,
  tile: string,
  footprint: { w: number; h: number },
  buildingCount: { n: number },
): boolean {
  if (buildingCount.n >= BOT_ACTION_LIMITS.maxBuildings) return false;
  for (let dy = 0; dy < footprint.h; dy++) {
    for (let dx = 0; dx < footprint.w; dx++) {
      const cx = x + dx;
      const cy = y + dy;
      if (!ctx.inBounds(cx, cy)) return false;
      const k = keyOf(cx, cy);
      if (reserved.has(k) || ctx.occupied(cx, cy)) return false;
    }
  }
  for (let dy = 0; dy < footprint.h; dy++) {
    for (let dx = 0; dx < footprint.w; dx++) {
      reserved.add(keyOf(x + dx, y + dy));
    }
  }
  ops.push({
    op: 'place_building',
    x,
    y,
    tile,
    rotation: 0,
  });
  buildingCount.n += 1;
  return true;
}

export function planNeighborhood(
  origin: BotPoint,
  homes: number,
  school: boolean,
  ctx: PlanCtx,
): ConcreteOp[] {
  const wantHomes = Math.min(Math.max(0, homes), BOT_ACTION_LIMITS.maxBuildings - (school ? 1 : 0));
  const ops: ConcreteOp[] = [];
  const reserved = new Set<string>();
  const skel = new Set<string>();
  const roadLimit = { n: 0 };
  const buildingCount = { n: 0 };

  const cols = Math.max(2, Math.ceil(Math.sqrt(wantHomes || 1)));
  const rows = Math.max(2, Math.ceil((wantHomes || 1) / cols));
  const lotW = 2;
  const lotH = 2;
  const ox = origin.x;
  const oy = origin.y;

  for (let r = 0; r <= rows; r++) {
    const y = oy + r * lotH;
    for (let x = ox; x <= ox + cols * lotW; x++) {
      addRoadSkeleton(skel, [{ x, y }], ctx, roadLimit);
    }
  }
  for (let c = 0; c <= cols; c++) {
    const x = ox + c * lotW;
    for (let y = oy; y <= oy + rows * lotH; y++) {
      addRoadSkeleton(skel, [{ x, y }], ctx, roadLimit);
    }
  }

  for (const k of skel) reserved.add(k);

  let placed = 0;
  for (let r = 0; r < rows && placed < wantHomes; r++) {
    for (let c = 0; c < cols && placed < wantHomes; c++) {
      const hx = ox + c * lotW + 1;
      const hy = oy + r * lotH + 1;
      if (tryPlaceBuilding(ops, reserved, ctx, hx, hy, 'building-home', { w: 1, h: 1 }, buildingCount)) {
        placed += 1;
      }
    }
  }

  if (school) {
    const sx = ox + cols * lotW + 2;
    const sy = oy + 1;
    addRoadSkeleton(skel, manhattanLine({ x: ox + cols * lotW, y: sy }, { x: sx - 1, y: sy }), ctx, roadLimit);
    for (const k of skel) reserved.add(k);
    tryPlaceBuilding(ops, reserved, ctx, sx, sy, 'building-school', { w: 1, h: 1 }, buildingCount);
  }

  const roadOps = emitRoadsFromSkeleton(skel, new Set());
  return [...roadOps, ...ops];
}

export function planCity(
  origin: BotPoint,
  homes: number,
  factories: number,
  stores: number,
  busService: boolean,
  ctx: PlanCtx,
): ConcreteOp[] {
  const h = Math.min(Math.max(0, homes), BOT_ACTION_LIMITS.maxBuildings);
  const f = Math.min(Math.max(0, factories), BOT_ACTION_LIMITS.maxBuildings);
  const s = Math.min(Math.max(0, stores), BOT_ACTION_LIMITS.maxBuildings);

  const ops = planNeighborhood(origin, h, false, ctx);

  const reserved = new Set<string>();
  for (const op of ops) {
    if (op.op === 'place_tile' || op.op === 'place_building') {
      reserved.add(keyOf(op.x, op.y));
    }
  }
  const buildingCount = { n: ops.filter(o => o.op === 'place_building').length };
  const skel = new Set<string>();
  const roadLimit = { n: ops.filter(o => o.op === 'place_tile' && o.tile.startsWith('road-')).length };
  for (const op of ops) {
    if (op.op === 'place_tile' && op.tile.startsWith('road-')) skel.add(keyOf(op.x, op.y));
  }

  const cols = Math.max(2, Math.ceil(Math.sqrt(h || 1)));
  const lotW = 2;
  const lotH = 2;
  const blockW = cols * lotW;
  const blockH = Math.max(2, Math.ceil((h || 1) / cols)) * lotH;

  const storeY = origin.y + blockH + 3;
  addRoadSkeleton(
    skel,
    manhattanLine({ x: origin.x, y: origin.y + blockH }, { x: origin.x, y: storeY }),
    ctx,
    roadLimit,
  );
  addRoadSkeleton(
    skel,
    manhattanLine({ x: origin.x, y: storeY }, { x: origin.x + Math.max(blockW, stores * 2), y: storeY }),
    ctx,
    roadLimit,
  );
  for (const k of skel) reserved.add(k);

  let storesPlaced = 0;
  for (let i = 0; i < s && storesPlaced < s; i++) {
    const sx = origin.x + 1 + i * 2;
    const sy = storeY + 1;
    if (tryPlaceBuilding(ops, reserved, ctx, sx, sy, 'building-store', { w: 1, h: 1 }, buildingCount)) {
      storesPlaced += 1;
    }
  }

  const factX = origin.x + blockW + 4;
  addRoadSkeleton(
    skel,
    manhattanLine({ x: origin.x + blockW, y: origin.y + 2 }, { x: factX, y: origin.y + 2 }),
    ctx,
    roadLimit,
  );
  for (const k of skel) reserved.add(k);

  let factsPlaced = 0;
  for (let i = 0; i < f && factsPlaced < f; i++) {
    const fx = factX + 1;
    const fy = origin.y + 1 + i * 2;
    addRoadSkeleton(skel, [{ x: factX, y: fy }], ctx, roadLimit);
    reserved.add(keyOf(factX, fy));
    if (tryPlaceBuilding(ops, reserved, ctx, fx, fy, 'building-factory', { w: 1, h: 1 }, buildingCount)) {
      factsPlaced += 1;
    }
  }

  const busStopKeys = new Set<string>();
  if (busService) {
    const station: BotPoint = { x: origin.x + Math.floor(blockW / 2), y: storeY - 2 };
    addRoadSkeleton(
      skel,
      manhattanLine({ x: origin.x, y: station.y }, { x: station.x + 3, y: station.y }),
      ctx,
      roadLimit,
    );
    for (const k of skel) reserved.add(k);

    let placedStation: BotPoint | null = null;
    const stationCandidates: BotPoint[] = [
      { x: origin.x + Math.floor(blockW / 2), y: storeY + 3 },
      { x: origin.x + 2, y: storeY + 3 },
      { x: factX - 3, y: storeY + 3 },
      station,
      { x: station.x + 1, y: station.y },
      { x: origin.x + 2, y: storeY - 2 },
    ];
    for (const cand of stationCandidates) {
      // Clear road reservation under 2x2 footprint so the terminal can sit beside the network
      let blocked = false;
      for (let dy = 0; dy < 2 && !blocked; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const cx = cand.x + dx;
          const cy = cand.y + dy;
          if (!ctx.inBounds(cx, cy) || ctx.occupied(cx, cy)) {
            blocked = true;
            break;
          }
        }
      }
      if (blocked) continue;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const k = keyOf(cand.x + dx, cand.y + dy);
          reserved.delete(k);
          skel.delete(k);
        }
      }
      // Connect approach road to station edge
      addRoadSkeleton(
        skel,
        manhattanLine({ x: origin.x, y: storeY }, { x: cand.x, y: cand.y - 1 }),
        ctx,
        roadLimit,
      );
      for (const k of skel) reserved.add(k);
      if (tryPlaceBuilding(ops, reserved, ctx, cand.x, cand.y, 'building-bus-station', { w: 2, h: 2 }, buildingCount)) {
        placedStation = cand;
        break;
      }
    }

    const stops: BotPoint[] = [];
    const stopCandidates: BotPoint[] = [
      { x: origin.x, y: origin.y + Math.floor(blockH / 2) },
      { x: origin.x + blockW, y: origin.y + 2 },
      { x: origin.x + Math.floor(blockW / 2), y: origin.y },
      { x: origin.x + 2, y: storeY },
      { x: factX, y: origin.y + 2 },
      { x: origin.x + Math.max(4, Math.floor(blockW / 3)), y: storeY },
    ];
    for (const sc of stopCandidates) {
      if (stops.length >= Math.min(8, BOT_ACTION_LIMITS.maxBusStops)) break;
      if (!ctx.inBounds(sc.x, sc.y)) continue;
      const k = keyOf(sc.x, sc.y);
      if (!skel.has(k)) {
        addRoadSkeleton(skel, [sc], ctx, roadLimit);
      }
      busStopKeys.add(k);
      reserved.add(k);
      stops.push(sc);
    }

    const nonRoad = ops.filter(o => !(o.op === 'place_tile' && String(o.tile).startsWith('road-')));
    const roadOps = emitRoadsFromSkeleton(skel, busStopKeys);
    const rebuilt = [...roadOps, ...nonRoad];

    if (placedStation && stops.length) {
      rebuilt.push({
        op: 'setup_bus_service',
        station: placedStation,
        stops,
        buses: Math.min(2, BOT_ACTION_LIMITS.maxBuses),
      });
    }
    return rebuilt;
  }

  const nonRoad = ops.filter(o => !(o.op === 'place_tile' && String(o.tile).startsWith('road-')));
  const roadOps = emitRoadsFromSkeleton(skel, busStopKeys);
  return [...roadOps, ...nonRoad];
}

export function expandActions(
  actions: BotAction[],
  defaultOrigin: BotPoint,
  ctx: PlanCtx,
): ConcreteOp[] {
  const out: ConcreteOp[] = [];
  for (const a of actions) {
    if (a.op === 'place_tile') {
      out.push({
        op: 'place_tile',
        x: a.x,
        y: a.y,
        tile: a.tile,
        rotation: a.rotation ?? 0,
      });
    } else if (a.op === 'place_building') {
      out.push({
        op: 'place_building',
        x: a.x,
        y: a.y,
        tile: a.tile,
        rotation: a.rotation ?? 0,
      });
    } else if (a.op === 'delete_cells') {
      out.push({ op: 'delete_cells', cells: a.cells.slice(0, 500) });
    } else if (a.op === 'place_road_line') {
      const skel = new Set<string>();
      const limit = { n: 0 };
      addRoadSkeleton(skel, manhattanLine(a.from, a.to), ctx, limit);
      out.push(...emitRoadsFromSkeleton(skel, new Set()));
    } else if (a.op === 'setup_bus_service') {
      out.push({
        op: 'setup_bus_service',
        station: a.station,
        stops: a.stops.slice(0, BOT_ACTION_LIMITS.maxBusStops),
        buses: Math.min(a.buses ?? 2, BOT_ACTION_LIMITS.maxBuses),
      });
    } else if (a.op === 'build_neighborhood') {
      const origin = a.origin || defaultOrigin;
      out.push(...planNeighborhood(origin, a.homes, a.school !== false, ctx));
    } else if (a.op === 'build_city') {
      const origin = a.origin || defaultOrigin;
      out.push(...planCity(origin, a.homes, a.factories, a.stores, !!a.busService, ctx));
    }
  }
  return out;
}
