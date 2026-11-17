import { useState } from 'react';
import { criteriaTemplate, parseCriteria, type Criteria } from '../../shared/taskCriteria';

const TYPES = ['homes_in_region', 'tile_count', 'road_connected', 'bus_line_serves', 'count'] as const;

/** Builder for the main criterion types. The JSON field stays the saved value. */
export function CriteriaFields({
  value,
  onChange,
}: {
  value: string;
  onChange: (json: string) => void;
}) {
  const [type, setType] = useState<(typeof TYPES)[number]>('homes_in_region');
  const [min, setMin] = useState('3');
  const [tiles, setTiles] = useState('building-home');
  const [metric, setMetric] = useState<'buildings' | 'homes' | 'population' | 'buses'>('homes');
  const [minX, setMinX] = useState('0');
  const [minY, setMinY] = useState('0');
  const [maxX, setMaxX] = useState('10');
  const [maxY, setMaxY] = useState('10');
  const [fromX, setFromX] = useState('0');
  const [fromY, setFromY] = useState('0');
  const [toX, setToX] = useState('2');
  const [toY, setToY] = useState('0');
  const [stops, setStops] = useState('0,0 2,0');
  const [minBuses, setMinBuses] = useState('1');

  const parsed = value.trim() ? parseCriteria(tryJson(value)) : null;
  const invalid = !!value.trim() && parsed != null && !parsed.ok;

  const apply = () => {
    const region = {
      minX: num(minX),
      minY: num(minY),
      maxX: num(maxX),
      maxY: num(maxY),
    };
    let next: Criteria = criteriaTemplate(type);
    if (type === 'homes_in_region') next = { type, min: num(min), region };
    else if (type === 'tile_count') {
      next = {
        type,
        tiles: tiles.split(',').map((part) => part.trim()).filter(Boolean),
        min: num(min),
        region,
      };
    } else if (type === 'count') next = { type, metric, min: num(min), region };
    else if (type === 'road_connected') {
      next = { type, from: { x: num(fromX), y: num(fromY) }, to: { x: num(toX), y: num(toY) } };
    } else if (type === 'bus_line_serves') {
      const parsedStops = stops.split(/[\s;]+/).map((part) => part.trim()).filter(Boolean).map((part) => {
        const [x, y] = part.split(',');
        return { x: num(x), y: num(y) };
      });
      next = { type, stops: parsedStops.length ? parsedStops : [{ x: 0, y: 0 }], minBuses: num(minBuses) };
    }
    onChange(JSON.stringify(next, null, 2));
  };

  return (
    <div className="space-y-2" data-testid="task-criteria-builder">
      <label className="block text-xs font-bold text-slate-500">Criteria</label>
      <select
        data-testid="task-criteria-type"
        value={type}
        onChange={(e) => setType(e.target.value as (typeof TYPES)[number])}
        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
      >
        <option value="homes_in_region">Homes in a region</option>
        <option value="tile_count">Tile count</option>
        <option value="road_connected">Road connected</option>
        <option value="bus_line_serves">Bus line serves stops</option>
        <option value="count">Count</option>
      </select>
      {(type === 'homes_in_region' || type === 'tile_count' || type === 'count') && (
        <input
          data-testid="task-criteria-min"
          value={min}
          onChange={(e) => setMin(e.target.value)}
          placeholder="Minimum"
          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
        />
      )}
      {type === 'tile_count' && (
        <input
          data-testid="task-criteria-tiles"
          value={tiles}
          onChange={(e) => setTiles(e.target.value)}
          placeholder="Tile ids, comma separated (prefix* ok)"
          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
        />
      )}
      {type === 'count' && (
        <select
          data-testid="task-criteria-metric"
          value={metric}
          onChange={(e) => setMetric(e.target.value as typeof metric)}
          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
        >
          <option value="buildings">Buildings</option>
          <option value="homes">Homes</option>
          <option value="population">Population</option>
          <option value="buses">Buses</option>
        </select>
      )}
      {(type === 'homes_in_region' || type === 'tile_count' || type === 'count') && (
        <div className="grid grid-cols-4 gap-1">
          <input data-testid="task-criteria-min-x" value={minX} onChange={(e) => setMinX(e.target.value)} placeholder="minX" className="px-2 py-1 rounded-lg border border-slate-200 text-xs" />
          <input data-testid="task-criteria-min-y" value={minY} onChange={(e) => setMinY(e.target.value)} placeholder="minY" className="px-2 py-1 rounded-lg border border-slate-200 text-xs" />
          <input data-testid="task-criteria-max-x" value={maxX} onChange={(e) => setMaxX(e.target.value)} placeholder="maxX" className="px-2 py-1 rounded-lg border border-slate-200 text-xs" />
          <input data-testid="task-criteria-max-y" value={maxY} onChange={(e) => setMaxY(e.target.value)} placeholder="maxY" className="px-2 py-1 rounded-lg border border-slate-200 text-xs" />
        </div>
      )}
      {type === 'road_connected' && (
        <div className="grid grid-cols-4 gap-1">
          <input value={fromX} onChange={(e) => setFromX(e.target.value)} placeholder="fromX" className="px-2 py-1 rounded-lg border border-slate-200 text-xs" />
          <input value={fromY} onChange={(e) => setFromY(e.target.value)} placeholder="fromY" className="px-2 py-1 rounded-lg border border-slate-200 text-xs" />
          <input value={toX} onChange={(e) => setToX(e.target.value)} placeholder="toX" className="px-2 py-1 rounded-lg border border-slate-200 text-xs" />
          <input value={toY} onChange={(e) => setToY(e.target.value)} placeholder="toY" className="px-2 py-1 rounded-lg border border-slate-200 text-xs" />
        </div>
      )}
      {type === 'bus_line_serves' && (
        <>
          <input
            data-testid="task-criteria-stops"
            value={stops}
            onChange={(e) => setStops(e.target.value)}
            placeholder="Stops as x,y x,y"
            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
          />
          <input
            data-testid="task-criteria-buses"
            value={minBuses}
            onChange={(e) => setMinBuses(e.target.value)}
            placeholder="Minimum buses"
            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
          />
        </>
      )}
      <button
        type="button"
        data-testid="task-criteria-apply"
        className="text-xs font-bold text-blue-600"
        onClick={apply}
      >
        Use this criteria
      </button>
      {invalid && <p data-testid="task-criteria-error" className="text-xs text-red-600">Criteria must be a known JSON type.</p>}
    </div>
  );
}

function num(raw: string): number {
  const value = Number(raw);
  return Number.isFinite(value) ? Math.trunc(value) : 0;
}

function tryJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
