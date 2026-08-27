/**
 * Restroom-style person icons on the map (standing / walking).
 * Matches classic solid black stick-figure pictograms (circle head, torso, arms, legs).
 * Kids use a smaller silhouette with slightly larger head proportions.
 */

import type { Person, PersonSex } from '../types';
import { personDisplayName, formatAge } from '../people';

const GRID = 64;

export type PersonAgeTier = 'toddler' | 'child' | 'teen' | 'adult';

export function personAgeTier(ageYears: number): PersonAgeTier {
  if (ageYears < 5) return 'toddler';
  if (ageYears < 13) return 'child';
  if (ageYears < 18) return 'teen';
  return 'adult';
}

/** Display size in px for map icons by age (half previous scale) */
export function personIconSize(ageYears: number): number {
  const tier = personAgeTier(ageYears);
  if (tier === 'toddler') return 4.5;
  if (tier === 'child') return 5.5;
  if (tier === 'teen') return 7;
  return 8.5;
}

/**
 * Classic restroom pictogram — solid silhouette like public restroom signs.
 * Male: circle head + rectangular body + outstretched arms + legs (reference style).
 * Female: circle head + triangular dress + legs (same solid weight).
 * Kids: same shapes, smaller + slightly larger head relative to body.
 */
export function PersonPictogram({
  sex,
  size = 18,
  className = '',
  crossing = false,
  ageYears = 30,
}: {
  sex: PersonSex;
  size?: number;
  className?: string;
  crossing?: boolean;
  /** Used for child proportions (bigger head) */
  ageYears?: number;
}) {
  const tier = personAgeTier(ageYears);
  const isKid = tier === 'toddler' || tier === 'child';
  // Solid black like the reference; red only while crossing
  const fill = crossing ? '#dc2626' : '#0f172a';

  // ViewBox 0 0 32 48 — room for head + body + legs
  // Kids: larger head radius relative to body
  if (sex === 'f') {
    // Female restroom: head + dress triangle + two legs
    const headR = isKid ? 6.2 : 5.4;
    const headCy = isKid ? 7.2 : 6.5;
    const neckY = headCy + headR - 0.4;
    return (
      <svg
        width={size}
        height={size * (48 / 32)}
        viewBox="0 0 32 48"
        className={className}
        aria-hidden
      >
        <circle cx="16" cy={headCy} r={headR} fill={fill} />
        {/* Dress */}
        <path
          d={
            isKid
              ? `M16 ${neckY} L6.5 28 H12.2 L10.5 42 H14.2 L16 32.5 L17.8 42 H21.5 L19.8 28 H25.5 Z`
              : `M16 ${neckY} L5 27 H12 L9.8 43 H13.5 L16 31.5 L18.5 43 H22.2 L20 27 H27 Z`
          }
          fill={fill}
        />
      </svg>
    );
  }

  // Male restroom stick figure matching reference image:
  // round head, short neck stub, wide arms, rectangular torso, two legs with gap
  const headR = isKid ? 6.4 : 5.6;
  const headCy = isKid ? 7.4 : 6.8;
  const bodyTop = headCy + headR + (isKid ? 0.6 : 0.8);
  const bodyW = isKid ? 9.5 : 10.5;
  const bodyH = isKid ? 11 : 13;
  const bodyX = 16 - bodyW / 2;
  const armY = bodyTop + (isKid ? 1.2 : 1.5);
  const armH = isKid ? 2.6 : 3.2;
  const armOut = isKid ? 5.5 : 6.5;
  const legTop = bodyTop + bodyH - 0.5;
  const legW = isKid ? 3.2 : 3.6;
  const legH = isKid ? 12 : 15;
  const legGap = isKid ? 1.4 : 1.8;

  return (
    <svg
      width={size}
      height={size * (48 / 32)}
      viewBox="0 0 32 48"
      className={className}
      aria-hidden
    >
      {/* Head */}
      <circle cx="16" cy={headCy} r={headR} fill={fill} />
      {/* Torso */}
      <rect x={bodyX} y={bodyTop} width={bodyW} height={bodyH} rx={1.2} fill={fill} />
      {/* Arms — horizontal bars from shoulders */}
      <rect
        x={bodyX - armOut}
        y={armY}
        width={armOut + 1}
        height={armH}
        rx={armH / 2}
        fill={fill}
      />
      <rect
        x={bodyX + bodyW - 1}
        y={armY}
        width={armOut + 1}
        height={armH}
        rx={armH / 2}
        fill={fill}
      />
      {/* Legs */}
      <rect
        x={16 - legGap / 2 - legW}
        y={legTop}
        width={legW}
        height={legH}
        rx={1}
        fill={fill}
      />
      <rect
        x={16 + legGap / 2}
        y={legTop}
        width={legW}
        height={legH}
        rx={1}
        fill={fill}
      />
    </svg>
  );
}

export interface PersonMapPlacement {
  person: Person;
  /** Continuous grid X (tile units) */
  gx: number;
  /** Continuous grid Y (tile units) */
  gy: number;
  crossing?: boolean;
  waiting?: boolean;
}

export function PersonMapIcon({
  placement,
  selected,
  onClick,
}: {
  placement: PersonMapPlacement;
  selected?: boolean;
  onClick?: () => void;
}) {
  const { person, gx, gy, crossing, waiting } = placement;
  const size = personIconSize(person.ageYears);
  const tier = personAgeTier(person.ageYears);
  const px = gx * GRID;
  const py = gy * GRID;
  const label = `${personDisplayName(person)} · ${formatAge(person.ageYears)}${
    crossing ? ' · crossing' : waiting ? ' · waiting' : person.activity ? ` · ${person.activity}` : ''
  }`;

  // Selection box padded around the pictogram (map pixels)
  const boxPad = 4;
  const boxW = size + boxPad * 2 + 4;
  const boxH = size * (48 / 32) + boxPad * 2 + 2;

  return (
    <button
      type="button"
      title={label}
      onClick={e => {
        e.stopPropagation();
        onClick?.();
      }}
      className={`absolute z-[25] flex flex-col items-center pointer-events-auto transition-transform hover:scale-110 ${
        selected ? 'scale-110 z-[30]' : ''
      }`}
      style={{
        left: px,
        top: py,
        transform: 'translate(-50%, -90%)',
        width: Math.max(boxW, size + 6),
      }}
    >
      {(waiting || crossing) && !selected && (
        <span
          className={`mb-0.5 px-1 py-px rounded text-[7px] font-bold leading-none border shadow-sm ${
            crossing
              ? 'bg-red-100 text-red-800 border-red-300'
              : 'bg-amber-100 text-amber-900 border-amber-300'
          }`}
        >
          {crossing ? 'CROSS' : 'WAIT'}
        </span>
      )}
      <div
        className={`relative flex items-end justify-center ${selected ? '' : 'drop-shadow-sm'}`}
        style={{
          // Soft white halo so black icons read on dark roads (not selected)
          filter: selected
            ? undefined
            : 'drop-shadow(0 0 1px rgba(255,255,255,0.95)) drop-shadow(0 1px 1px rgba(0,0,0,0.25))',
          width: boxW,
          height: boxH,
        }}
      >
        {/* Bright blue selection rectangle on the grid */}
        {selected && (
          <span
            className="absolute inset-0 rounded-sm pointer-events-none"
            style={{
              border: '2.5px solid #2563eb',
              backgroundColor: 'rgba(59, 130, 246, 0.22)',
              boxShadow:
                '0 0 0 1px rgba(255,255,255,0.95), 0 0 10px rgba(37, 99, 235, 0.85), 0 0 2px rgba(37, 99, 235, 1)',
            }}
            aria-hidden
          />
        )}
        <div className="relative z-[1] flex items-end justify-center w-full h-full pb-0.5">
          <PersonPictogram
            sex={person.sex}
            size={size}
            crossing={!!crossing}
            ageYears={person.ageYears}
          />
        </div>
      </div>
      {tier === 'toddler' || tier === 'child' ? (
        <span className="sr-only">child</span>
      ) : null}
    </button>
  );
}
