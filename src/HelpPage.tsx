/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Building2,
  Bus,
  Car,
  CircleHelp,
  Clock,
  Database,
  Grid,
  Keyboard,
  Layers,
  Map as MapIcon,
  Siren,
  Sprout,
  Timer,
  Train,
  Truck,
  Users,
} from 'lucide-react';

type TocItem = {
  id: string;
  title: string;
  icon: React.ReactNode;
};

const TOC: TocItem[] = [
  { id: 'getting-started', title: 'Getting started', icon: <BookOpen className="w-3.5 h-3.5" /> },
  { id: 'rooms', title: 'Rooms & collaboration', icon: <Users className="w-3.5 h-3.5" /> },
  { id: 'interface', title: 'Interface overview', icon: <Layers className="w-3.5 h-3.5" /> },
  { id: 'controls', title: 'Mouse, keys & tools', icon: <Keyboard className="w-3.5 h-3.5" /> },
  { id: 'tiles', title: 'Tiles & palette', icon: <Grid className="w-3.5 h-3.5" /> },
  { id: 'roads', title: 'Roads, parking & buses', icon: <Car className="w-3.5 h-3.5" /> },
  { id: 'rails', title: 'Rails & trains', icon: <Train className="w-3.5 h-3.5" /> },
  { id: 'buildings', title: 'Buildings', icon: <Building2 className="w-3.5 h-3.5" /> },
  { id: 'landscape', title: 'Landscape & plant growth', icon: <Sprout className="w-3.5 h-3.5" /> },
  { id: 'vehicles', title: 'Vehicles', icon: <Truck className="w-3.5 h-3.5" /> },
  { id: 'driving', title: 'Driving & 3D view', icon: <Car className="w-3.5 h-3.5" /> },
  { id: 'people', title: 'People & families', icon: <Users className="w-3.5 h-3.5" /> },
  { id: 'traffic', title: 'Traffic control', icon: <Timer className="w-3.5 h-3.5" /> },
  { id: 'economy', title: 'Logistics & economy', icon: <Database className="w-3.5 h-3.5" /> },
  { id: 'transit', title: 'Taxis & bus routes', icon: <Bus className="w-3.5 h-3.5" /> },
  { id: 'services', title: 'Emergency services', icon: <Siren className="w-3.5 h-3.5" /> },
  { id: 'clock', title: 'City clock', icon: <Clock className="w-3.5 h-3.5" /> },
  { id: 'library', title: 'Layouts, sims & export', icon: <MapIcon className="w-3.5 h-3.5" /> },
  { id: 'reference', title: 'Quick reference', icon: <CircleHelp className="w-3.5 h-3.5" /> },
];

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center px-1.5 py-0.5 rounded-md border border-slate-200 bg-slate-100 text-[11px] font-bold text-slate-700 font-sans tracking-wide whitespace-nowrap">
      {children}
    </kbd>
  );
}

function Callout({
  title,
  children,
  tone = 'blue',
}: {
  title: string;
  children: React.ReactNode;
  tone?: 'blue' | 'amber' | 'emerald' | 'rose';
}) {
  const tones = {
    blue: 'bg-blue-50 border-blue-100 text-blue-900',
    amber: 'bg-amber-50 border-amber-100 text-amber-950',
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-950',
    rose: 'bg-rose-50 border-rose-100 text-rose-950',
  };
  return (
    <aside className={`my-4 rounded-xl border px-4 py-3 text-sm leading-relaxed ${tones[tone]}`}>
      <div className="font-bold mb-1">{title}</div>
      <div className="opacity-90">{children}</div>
    </aside>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28 mb-16">
      <h2 className="text-2xl font-black tracking-tight text-slate-900 mb-4 pb-2 border-b border-slate-200">
        {title}
      </h2>
      <div className="space-y-3 text-slate-700 leading-relaxed text-[15px]">{children}</div>
    </section>
  );
}

function Sub({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-bold text-slate-800 mt-8 mb-2">{children}</h3>;
}

export default function HelpPage() {
  const [activeId, setActiveId] = useState(TOC[0].id);

  useEffect(() => {
    const previous = document.title;
    const previousScroll = document.documentElement.style.scrollBehavior;
    document.title = 'Grid City Documentation';
    document.documentElement.style.scrollBehavior = 'smooth';
    return () => {
      document.title = previous;
      document.documentElement.style.scrollBehavior = previousScroll;
    };
  }, []);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '');
    if (hash) {
      requestAnimationFrame(() => {
        document.getElementById(hash)?.scrollIntoView();
      });
    }
  }, []);

  useEffect(() => {
    const headings = TOC.map(item => document.getElementById(item.id)).filter(
      (el): el is HTMLElement => !!el,
    );
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]?.target.id) setActiveId(visible[0].target.id);
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: [0, 0.25, 0.5, 1] },
    );
    headings.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans select-text" data-testid="help-page">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <a
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-blue-700 transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to app
          </a>
          <div className="w-px h-5 bg-slate-200" />
          <div className="flex items-center gap-2 min-w-0">
            <div className="bg-blue-600 w-8 h-8 rounded-xl flex items-center justify-center shrink-0">
              <MapIcon className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-black tracking-tight text-slate-900 leading-tight">
                Grid City Documentation
              </h1>
              <p className="text-[11px] text-slate-500 truncate">Complete guide to building and simulating cities</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 lg:py-10 grid lg:grid-cols-[16rem_minmax(0,1fr)] gap-10">
        <nav
          aria-label="Documentation index"
          data-testid="help-index"
          className="lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto"
        >
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400 mb-2">
            Contents
          </div>
          <ol className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 -mx-1 px-1">
            {TOC.map((item, i) => {
              const active = activeId === item.id;
              return (
                <li key={item.id} className="shrink-0">
                  <a
                    href={`#${item.id}`}
                    className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
                      active
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-slate-600 hover:bg-white hover:text-slate-900'
                    }`}
                  >
                    <span className="hidden lg:inline-flex w-5 text-[10px] font-bold text-slate-400 tabular-nums">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className={`shrink-0 ${active ? 'text-blue-600' : 'text-slate-400'}`}>
                      {item.icon}
                    </span>
                    <span className="whitespace-nowrap">{item.title}</span>
                  </a>
                </li>
              );
            })}
          </ol>
        </nav>

        <article className="bg-white border border-slate-200 rounded-3xl shadow-sm p-6 sm:p-10 min-w-0">
          <p className="text-lg text-slate-600 leading-relaxed mb-10">
            Grid City is a collaborative city builder and traffic simulator. You paint roads, rails,
            buildings, and landscape on an infinite grid, then populate the world with people,
            vehicles, production recipes, and traffic controls. Everything in a room is shared in
            real time — no account or sign-in is required.
          </p>

          <Section id="getting-started" title="Getting started">
            <ol className="list-decimal pl-5 space-y-2">
              <li>
                Open Grid City. The lobby appears immediately. There is no Google Sign-In or other
                social login — anyone can play anonymously.
              </li>
              <li>
                Click <strong>Create New Room</strong> to start a fresh city, or type a six-character
                room code and click <strong>Join</strong>. Previous rooms you have used appear in a
                list so you can jump back in.
              </li>
              <li>
                Pick tiles from the left palette (Roads, Rails, Build, Land) and click the grid to
                place them. Drag to pan, scroll to zoom.
              </li>
              <li>
                Use the floating button grid at the bottom-right to open Cars, Semis, Trains, Service
                vehicles, People, Traffic, Logistics, and Plant Growth.
              </li>
              <li>
                Place homes, then open People and click <strong>Populate houses</strong> to generate
                families. Assign workplaces, spawn vehicles, and start the city clock.
              </li>
            </ol>
            <Callout title="Rooms persist">
              Each room is saved on the server (grid, vehicles, economy, traffic, people). Leave and
              rejoin later — the city is still there. Copy the room code from the Active Room badge
              to invite collaborators.
            </Callout>
          </Section>

          <Section id="rooms" title="Rooms & collaboration">
            <p>
              Grid City is built around shared rooms. Every connected client in the same room sees
              the same tiles, vehicles, people, economy, and traffic. Edits broadcast immediately
              over a live socket connection.
            </p>
            <Sub>Creating and joining</Sub>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong>Create New Room</strong> generates a unique code (three hyphenated words,
                e.g. <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">able-river-oak</code>
                ).
              </li>
              <li>
                <strong>Join</strong> needs a room code typed in the lobby field. The Join button
                stays disabled until you type something.
              </li>
              <li>
                <strong>Previous Rooms</strong> lists rooms this browser has seen. Click a row to
                rejoin; hover and click the trash icon to delete a room from the server.
              </li>
            </ul>
            <Sub>Inside a room</Sub>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                The <strong>Active Room</strong> badge shows the code with a live pulse. Copy it or
                leave the room with the logout icon.
              </li>
              <li>
                All users are anonymous. You can still take <strong>manual override</strong> on a
                vehicle so only your keystrokes drive it; other users see who holds the wheel.
              </li>
              <li>
                One connected client is elected <strong>simulation leader</strong> and runs vehicle,
                people, traffic, and economy ticks. If that client disconnects, another client takes
                over automatically. You do not need to do anything.
              </li>
            </ul>
            <Callout title="Anonymous by design" tone="emerald">
              Grid City never asks for an account. Collaborative rooms work for unauthenticated
              users. Do not add Google Sign-In or other social login providers.
            </Callout>
          </Section>

          <Section id="interface" title="Interface overview">
            <p>The editor is a three-part layout:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong>Left sidebar</strong> — title, room badge, tile palette (Roads / Rails / Build
                / Land), layout &amp; simulation library, undo/redo, copy/cut/paste, rotate, select,
                clear/export/import, and map generators.
              </li>
              <li>
                <strong>Infinite canvas</strong> — 500×500 cell world. Tiles, vehicles, people,
                traffic signs, cargo badges, and destination markers live here. Hover a cell for
                about three seconds to see its <code className="text-xs bg-slate-100 px-1 rounded">x,y</code>{' '}
                coordinates.
              </li>
              <li>
                <strong>Bottom-right control pad</strong> — grid lines, reset view, zoom, and every
                simulation panel (cars, semis, trains, service, people, traffic, drive panels,
                logistics, plant growth, factories).
              </li>
            </ul>
            <Sub>Top of the map</Sub>
            <p>
              The <strong>city clock</strong> sits at the top center. It drives people schedules.
              Click the time to type a new clock, use −1h / +1h, or <strong>Now</strong> to sync to
              the real wall clock. See <a href="#clock" className="text-blue-700 font-semibold hover:underline">City clock</a>.
            </p>
            <Sub>Hiding the palette</Sub>
            <p>
              The chevron next to the title collapses the sidebar. A floating button at the top-left
              of the canvas brings it back.
            </p>
            <Sub>Minimap</Sub>
            <p>
              While you zoom or pan, an overview minimap appears in the lower right. Click or drag
              it to jump the camera.
            </p>
          </Section>

          <Section id="controls" title="Mouse, keys & tools">
            <Sub>Mouse on the grid</Sub>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-slate-500 text-xs uppercase tracking-wider">
                    <th className="py-2 pr-3 font-bold">Action</th>
                    <th className="py-2 font-bold">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="py-2 pr-3"><Kbd>Click</Kbd></td>
                    <td className="py-2">Place the selected palette tile (or finish the current tool: destination, bus stop, home, fire, person, traffic).</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3"><Kbd>Shift</Kbd> + click</td>
                    <td className="py-2">Remove the top tile from that cell.</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3">Drag</td>
                    <td className="py-2">Pan the camera (grab cursor).</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3">Scroll wheel</td>
                    <td className="py-2">Zoom in and out around the pointer.</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3"><Kbd>Alt</Kbd> + drag</td>
                    <td className="py-2">Draw a rectangular selection of tiles.</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3">Click a vehicle</td>
                    <td className="py-2">Select it (Shift-click adds to the selection). Opens the matching vehicle panel.</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3">Click a person icon</td>
                    <td className="py-2">Select that citizen and open the People panel / person inspector.</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3">Click a house badge</td>
                    <td className="py-2">Inspect residents and families at that home.</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3">Click a building</td>
                    <td className="py-2">Open building config (inventory, recipes, taxi/bus fleets, hospital, repair shop).</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <Sub>Editing shortcuts</Sub>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-slate-500 text-xs uppercase tracking-wider">
                    <th className="py-2 pr-3 font-bold">Keys</th>
                    <th className="py-2 font-bold">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="py-2 pr-3"><Kbd>R</Kbd></td>
                    <td className="py-2">Rotate the selected tile 90°. With a region selected, rotates the selection. While pasting, rotates the clipboard.</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3"><Kbd>Ctrl</Kbd> <Kbd>Z</Kbd> / <Kbd>Ctrl</Kbd> <Kbd>Y</Kbd></td>
                    <td className="py-2">Undo / redo tile edits. <Kbd>Ctrl</Kbd> <Kbd>Shift</Kbd> <Kbd>Z</Kbd> also redoes.</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3"><Kbd>Ctrl</Kbd> <Kbd>C</Kbd> / <Kbd>X</Kbd> / <Kbd>V</Kbd></td>
                    <td className="py-2">Copy, cut, and paste a selected region (includes building configs in the snapshot).</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3"><Kbd>Delete</Kbd> or <Kbd>Backspace</Kbd></td>
                    <td className="py-2">Delete the selected region.</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3"><Kbd>Esc</Kbd></td>
                    <td className="py-2">Cancel placement, paste, destination, bus routing, home/fire/employee assign, people drop, and clear the tile selection.</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <Sub>Vehicle driving keys</Sub>
            <p>
              These apply to the selected vehicles — or, if a floating drive panel is <em>Active</em>,
              only to that one vehicle. Keys are ignored while typing in an input.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-slate-500 text-xs uppercase tracking-wider">
                    <th className="py-2 pr-3 font-bold">Keys</th>
                    <th className="py-2 font-bold">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="py-2 pr-3"><Kbd>G</Kbd></td>
                    <td className="py-2">Toggle continuous Go. Cancels a parking dwell so the vehicle can leave.</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3"><Kbd>S</Kbd></td>
                    <td className="py-2">Stop.</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3"><Kbd>F</Kbd> / <Kbd>B</Kbd></td>
                    <td className="py-2">Step one tile forward / backward. Also clears a stoplight hold so you can creep through.</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3"><Kbd>L</Kbd> / <Kbd>R</Kbd></td>
                    <td className="py-2">Set left / right turn intent at the next intersection. <Kbd>R</Kbd> rotates tiles instead if a palette tile is selected.</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3"><Kbd>U</Kbd></td>
                    <td className="py-2">U-turn on a 4-way roundabout (loop the circle and leave the way you entered).</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3"><Kbd>↑</Kbd> / <Kbd>↓</Kbd></td>
                    <td className="py-2">Speed up / slow down (0.5× to 5×).</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3"><Kbd>←</Kbd> / <Kbd>→</Kbd></td>
                    <td className="py-2">Change lane on 2-lane and 4-lane roads (not used by trains).</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <Callout title="Manual override" tone="amber">
              Enable Manual on a drive panel to lock out city AI (home tours, random turns, auto
              park). Only the user who holds override can key-drive that vehicle. Stoplights still
              apply, except emergency vehicles with lights on may run them.
            </Callout>
          </Section>

          <Section id="tiles" title="Tiles & palette">
            <p>
              The palette is grouped into four tabs. Click a tile to select it, then click the grid
              to stamp. The ghost preview follows the cursor. Press <Kbd>R</Kbd> to rotate before
              placing. The Select button (or <Kbd>Esc</Kbd>) leaves placement mode so clicks pan or
              inspect instead.
            </p>
            <Sub>Roads</Sub>
            <ul className="list-disc pl-5 space-y-1">
              <li>Straight, curve, T-junction, crossroad, bridge, road end, cul-de-sac (2-lane bulb).</li>
              <li>One-way straight, curve, reverse curve, and bridge.</li>
              <li>4-lane straight, curve, T, cross, bridge, and 2-to-4 transition.</li>
              <li>Roundabout quarter (and its mirror) for a multi-tile circle.</li>
              <li>4-way roundabout: 2-lane roads on all four sides, one circular lane. Straight, left, right, or U-turn.</li>
              <li>2-lane and 4-lane bus-stop bays (curbside pull-outs).</li>
              <li>Parking lots: 1×1, 1×2, 1×3, 2×2, 2×4, 4×4.</li>
            </ul>
            <Sub>Rails</Sub>
            <ul className="list-disc pl-5 space-y-1">
              <li>Straight, curve, T-junction, crossing, end, trestle (elevated).</li>
              <li>Rail-road crossing (grade crossing with a road).</li>
            </ul>
            <Sub>Build</Sub>
            <p>
              Homes, schools, stores, civic buildings, factories, warehouses, stations, parks, and
              large multi-tile structures (strip mall, lumbermill, apartment, campus, repair shop,
              hospital, taxi station, bus station). Multi-tile buildings stamp as an anchor plus
              member cells — rotate before placing so the footprint fits.
            </p>
            <Sub>Land</Sub>
            <p>
              Grass, tall grass, flowers, pine, pine seedling, oak, gravel, and sand. Seedlings grow
              into pines over time — see{' '}
              <a href="#landscape" className="text-blue-700 font-semibold hover:underline">Landscape &amp; plant growth</a>.
            </p>
            <Sub>Generators</Sub>
            <p>
              Bottom of the sidebar: generate a full map, random roads, random rails (each asks for
              density: dense → extremely sparse), or auto-landscape empty cells. Clear Grid wipes
              the world after confirm. Export / Import JSON snapshots the whole grid.
            </p>
          </Section>

          <Section id="roads" title="Roads, parking & buses">
            <p>
              Vehicles follow the painted network. Heading, lane, and elevation (ground vs bridge)
              are simulated per tile. One-way tiles reject traffic going the wrong direction;
              both lanes travel that way and vehicles keep their lane (no automatic shift).
              4-lane roads have inner and outer lanes; use arrow keys or AI lane choice to shift.
              On a 4-way roundabout, traffic circulates counterclockwise around the center island
              and leaves on the right-hand lane. A vehicle entering the circle yields to traffic
              already in it. <Kbd>L</Kbd>, <Kbd>R</Kbd>, and <Kbd>U</Kbd> choose
              the exit while the vehicle is on that tile.
            </p>
            <Sub>Parking</Sub>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                Use the parking-lot tiles. Cars, taxis, and service vehicles can park in stalls.
                Semis need larger lots to drop trailers.
              </li>
              <li>
                From a vehicle panel, <strong>Park at next parking lot</strong> sets a flag so the
                vehicle pulls into the next legal lot it reaches. <strong>Unpark</strong> releases
                them.
              </li>
              <li>
                Owner cars with a home assignment return home on a timer and park nearby.
              </li>
            </ul>
            <Sub>Bus-stop tiles</Sub>
            <p>
              Place <strong>Bus Stop (2-Lane)</strong> or <strong>Bus Stop (4-Lane)</strong> on the
              route. Buses dwell there to board and alight passengers. People wait outdoors at the
              stop; vehicles yield to pedestrians in the crosswalk. See{' '}
              <a href="#transit" className="text-blue-700 font-semibold hover:underline">Taxis &amp; bus routes</a>.
            </p>
            <Sub>Bridges</Sub>
            <p>
              Road bridges and rail trestles stack above ground tiles in the same cell. Vehicles
              carry a z-index so a car on the bridge does not collide with a car underneath.
            </p>
          </Section>

          <Section id="rails" title="Rails & trains">
            <p>
              Paint a connected rail network, then open <strong>Trains &amp; Railcars</strong> from
              the control pad. Spawn trains, add railcars (passenger, flatbed, boxcar, container,
              closed hopper, open hopper, tank), and place them on track.
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Trains ignore road turn/lane keys. They follow rail connectivity and heading.</li>
              <li>
                Cargo-capable railcars (everything except passenger) can be clicked to inspect and
                transfer goods with nearby economy buildings.
              </li>
              <li>
                Train stations (small and large) are economy buildings you can name and stock.
                Large stations occupy a 2×2 footprint.
              </li>
              <li>Rail-road crossings let road and rail share a cell; road traffic still uses the road layer.</li>
            </ul>
          </Section>

          <Section id="buildings" title="Buildings">
            <p>
              Click a placed building to open its config window. Roles are assigned from the tile
              type and can be refined:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-slate-500 text-xs uppercase tracking-wider">
                    <th className="py-2 pr-3 font-bold">Role</th>
                    <th className="py-2 font-bold">What it does</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="py-2 pr-3 font-semibold">Warehouse</td>
                    <td className="py-2">Stores inventory. Semis and trains transfer cargo when nearby.</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3 font-semibold">Factory / lumbermill</td>
                    <td className="py-2">Runs a recipe: consume inputs, wait <em>cycleTimeSec</em>, emit outputs. Requires on-site employees.</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3 font-semibold">Store</td>
                    <td className="py-2">People shop here. Inventory is consumed per customer using consumption rates.</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3 font-semibold">Repair shop</td>
                    <td className="py-2">4×6 with four bays. Define repair recipes (parts + duration + optional vehicle types). Park a vehicle in a bay to start a job.</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3 font-semibold">Hospital</td>
                    <td className="py-2">4×4 with ambulance bays. Illness recipes consume medical supplies and heal patients over a stay duration.</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3 font-semibold">Taxi station</td>
                    <td className="py-2">4×2 with four bays. Owns a robotaxi fleet and dispatches rides. See Transit.</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3 font-semibold">Bus station</td>
                    <td className="py-2">2×2 with two bays. Owns buses, shares a stop list, handles refuel loops.</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <Sub>Homes &amp; civic</Sub>
            <p>
              Houses and apartments are residences. Occupancy badges show how many people are home
              versus how many reside there. Schools, playgrounds, parks, police, and fire stations
              are places people can visit or work. Click a home badge to inspect families.
            </p>
            <Sub>Staffing</Sub>
            <p>
              Production does <em>not</em> start just because someone is assigned. Assigned
              employees must physically arrive (walk, drive, bus, or taxi) before the recipe clock
              runs. The building badge shows <strong>👷 on-site / required</strong>.
            </p>
          </Section>

          <Section id="landscape" title="Landscape & plant growth">
            <p>
              Fill empty ground with grass, trees, gravel, and sand from the Land tab, or use
              Auto-Landscape. Pine seedlings grow into mature pines.
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                Open <strong>Plant Growth</strong> (sprout icon) to set germination time, total
                growth duration, pause growth, and toggle seedling % badges.
              </li>
              <li>
                From the service / fire tools you can <strong>start a fire</strong> on a tree. It
                burns for about 30 seconds and then the tree is removed.
              </li>
              <li>Fire trucks can be routed to burning trees as part of emergency play.</li>
            </ul>
          </Section>

          <Section id="vehicles" title="Vehicles">
            <p>
              Four panels spawn and control vehicles. Each panel lists units, lets you multi-select,
              set speed, Go/Stop, distribute onto legal tiles, set a destination, park, and place
              by clicking the map.
            </p>
            <Sub>Cars</Sub>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Civilian cars. Need a driver (a person) before they will move under AI or keys.</li>
              <li>
                Assign a <strong>home</strong> (click a house/apartment, or random-assign). The car
                tours and returns home on a timer.
              </li>
              <li>Random turns and U-turn-at-dead-end are optional AI flags (disabled under manual override).</li>
            </ul>
            <Sub>Semis &amp; trailers</Sub>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>A semi can pull up to two trailers. Click a trailer to inspect cargo.</li>
              <li>
                <strong>Drop trailer</strong> only works in a legal parking stall. Parked trailers
                stay on the lot until another nearby semi picks them up.
              </li>
              <li>
                Transfer cargo to/from nearby warehouses and factories from the trailer inspector.
              </li>
            </ul>
            <Sub>Trains</Sub>
            <p>Covered in <a href="#rails" className="text-blue-700 font-semibold hover:underline">Rails &amp; trains</a>.</p>
            <Sub>Service vehicles</Sub>
            <p>
              Fire truck, police, ambulance, tow truck, taxi, and bus. Emergency types have a light
              bar (on by default) and may run red lights when lights are flashing. Taxis and buses
              are public service, not emergency. See{' '}
              <a href="#services" className="text-blue-700 font-semibold hover:underline">Emergency services</a> and{' '}
              <a href="#transit" className="text-blue-700 font-semibold hover:underline">Taxis &amp; bus routes</a>.
            </p>
            <Sub>Common vehicle actions</Sub>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong>Speed slider</strong> — 0.5× to 5×.</li>
              <li><strong>Go / Stop</strong> — continuous motion.</li>
              <li><strong>Distribute randomly</strong> — snap selected units onto legal tiles of the matching network.</li>
              <li><strong>Destination</strong> — click the target tool, then click a road tile. A red bullseye marks the goal for selected vehicles.</li>
              <li><strong>Place on grid</strong> — click the map to teleport the selection (updates a place sequence so the sim leader adopts it).</li>
              <li><strong>Joystick button</strong> — open a floating drive panel (and 3D view) per selected vehicle.</li>
            </ul>
            <Callout title="No driver, no go" tone="rose">
              Cars, semis, buses, and most service vehicles will not move without a person assigned
              as driver. Robotaxis are the exception — they have no human driver and are dispatched
              by their taxi station.
            </Callout>
          </Section>

          <Section id="driving" title="Driving & 3D view">
            <p>
              Select one or more vehicles and click the joystick icon (control pad or panel). Each
              vehicle gets a <strong>floating drive panel</strong> you can drag by the title bar and
              resize from the edges.
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                The panel marked <strong>Active</strong> receives all driving keys. Click a panel to
                make it active.
              </li>
              <li>
                The 3D view is a driver-perspective rendering of nearby tiles, vehicles, people, and
                traffic lights. It is visual only — keys and panel buttons still control motion. Drag
                the camera look-joystick to glance around.
              </li>
              <li>
                Assign driver and passengers from the People rows, or pick existing citizens. Click
                Riding to add/remove passengers up to the vehicle’s max seats.
              </li>
              <li>
                Toggle <strong>Manual override</strong> to claim exclusive control. Other users see
                your anonymous user id on the panel.
              </li>
              <li>
                Person control panels work the same way for a first-person walk view when a citizen
                is on foot.
              </li>
            </ul>
          </Section>

          <Section id="people" title="People & families">
            <p>
              Open <strong>People &amp; Families</strong>. Citizens live in homes, belong to
              families, age, work, shop, get sick, and travel.
            </p>
            <Sub>Populate and create</Sub>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong>Populate houses</strong> generates families for every unoccupied home and
                apartment.
              </li>
              <li>
                <strong>New person</strong> opens a form (name, age, sex, home, workplace, schedule).
                You can click the map to pick home or workplace.
              </li>
              <li>
                <strong>Place on map</strong> drops selected people (or a brand-new person) onto a
                sidewalk. Clicking a road places them on the adjacent sidewalk.
              </li>
            </ul>
            <Sub>Life simulation</Sub>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                Age advances at <strong>1 year per 1 hour</strong> of real (or city-clock) time.
              </li>
              <li>
                Daily <strong>schedules</strong> fire off the city clock. Auto mode generates slots
                from age and workplace; Manual mode keeps your edits.
              </li>
              <li>
                Each person has a travel preference: <strong>car</strong>, <strong>bus</strong>,{' '}
                <strong>robotaxi</strong>, <strong>train</strong>, or <strong>walk</strong>. Set it
                from the People panel (applies to everyone selected) or from that person’s control
                panel. Until one is chosen, they drive a car they own and walk otherwise.
              </li>
              <li>
                People walk on sidewalks and cross roads; vehicles yield to pedestrians in a
                crosswalk.
              </li>
              <li>
                Health is healthy, sick, or injured. Sick/injured people seek hospital care.
              </li>
            </ul>
            <Sub>Control bar</Sub>
            <p>With people selected:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Assign workplace (then click a building) or clear workplace.</li>
              <li>Board the selected vehicle as driver or passenger; alight here.</li>
              <li>Open floating person panels.</li>
              <li>Choose a travel preference (car, bus, robotaxi, train, or walk) for the selection.</li>
              <li>Go to work now / go home now, using each person’s travel preference.</li>
              <li>Enter the building they are standing at (or the inspector’s building).</li>
            </ul>
            <p>
              Pause the people sim with the Running / Paused toggle. Home badges and person icons
              can be hidden from the same panel.
            </p>
          </Section>

          <Section id="traffic" title="Traffic control">
            <p>
              Open <strong>Traffic Control</strong>. Two placement tools:
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong>Stop sign</strong> — click the road-end corner or edge on a straight road.
                Vehicles stop for at least the configured minimum wait (1–15 seconds). Click again
                to remove. Hover a tile to see sign IDs.
              </li>
              <li>
                <strong>Stoplight</strong> — click a lane-end position. Lights cycle red → green →
                yellow with per-phase durations, or <strong>Manual toggle only</strong>. Click the
                colored dot (or the light on the map) to cycle the phase.
              </li>
            </ul>
            <p>
              Select two or more lights and <strong>Link &amp; coordinate phases</strong> so they
              share a group. Unlink splits them. Each list has a select-all checkbox that selects
              only that list. You can also move a single selected control by clicking a new road
              edge or lane.
            </p>
            <p>
              Size sliders scale stop signs and lights on the map. Hide all controls without deleting
              them if you want a cleaner screenshot.
            </p>
            <Callout title="Yields">
              Vehicles also yield to other vehicles in conflict at intersections and to pedestrians
              who are crossing. A stop-timer badge on a vehicle shows why it is waiting (stop sign,
              light, yield, vehicle, pedestrian).
            </Callout>
          </Section>

          <Section id="economy" title="Logistics & economy">
            <p>
              Open <strong>Logistics &amp; Economy</strong> (database icon) or the factory button.
              The economy is items + building inventories + recipes.
            </p>
            <Sub>Items</Sub>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                Create items by name (an id is normalized for you) and pick an emoji. Items used by
                buildings are added automatically if missing.
              </li>
              <li>
                Deleting an item strips it from every building inventory, recipe, parked trailer, and
                vehicle cargo.
              </li>
              <li>
                <strong>Quick Stock</strong> adds +20 of an item to every building that will accept
                it (respecting per-item capacity).
              </li>
            </ul>
            <Sub>Factories &amp; recipes</Sub>
            <p>
              Factories and lumbermills need recipe inputs, outputs, a cycle time, required
              employees, and production enabled. The cycle only advances when:
            </p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Production is started on that building.</li>
              <li>Enough employees are <em>on-site</em> (not merely assigned).</li>
              <li>Inputs are in inventory and outputs have capacity.</li>
              <li>The global economy is not paused.</li>
            </ol>
            <Sub>Stores</Sub>
            <p>
              Set consumption rates per item. Shoppers inside the store drain inventory over time.
            </p>
            <Sub>Cargo movement</Sub>
            <p>
              Park a semi trailer or railcar next to a warehouse/factory and use the inspector’s
              transfer panel. Trailers can be dropped in parking stalls as buffer storage.
            </p>
            <p>
              Building badges show name, stock, cycle countdown, and staffing. Toggle inventory
              labels from Logistics.
            </p>
          </Section>

          <Section id="transit" title="Taxis & bus routes">
            <Sub>Robotaxis</Sub>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                Place a <strong>Taxi Station</strong>. It gets a stable owner id. Spawn taxis from
                the Service panel and assign them to that station (or spawn from the station window).
              </li>
              <li>
                Taxis have no human driver. A person whose preference is robotaxi waits where they are;
                the station dispatches an owned taxi to pick them up and drop them at the destination.
              </li>
              <li>
                A taxi only accepts jobs from its owning station. Unassign it from the station window,
                or delete it there or from Service Vehicles. Deleting a taxi removes it from every
                station that listed it.
              </li>
            </ul>
            <Sub>Buses</Sub>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                Place <strong>Bus Stop</strong> tiles along the road, and a <strong>Bus Station</strong>.
              </li>
              <li>
                In the station window, add as many routes as you need. Name each one, then click
                bus-stop tiles in order (Esc to finish). The selected route is drawn on the map
                as a blue line, with stops numbered in order.
              </li>
              <li>
                Add buses to the station fleet and assign each bus to one route. A bus cycles:{' '}
                <em>route → boarding dwell at each stop → after N loops, return to station → refuel → route</em>.
              </li>
              <li>
                People who prefer the bus walk to the nearest stop and board when the bus arrives.
                They get off at the stop nearest their destination, then walk the rest of the way.
                A train preference uses another mode to the nearest station, rides to the station
                nearest the destination, then continues by car, bus, taxi, or on foot. Capacity is
                limited by the vehicle’s seats.
              </li>
            </ul>
          </Section>

          <Section id="services" title="Emergency services">
            <p>Fire, police, ambulance, and tow trucks use the Service Vehicles panel.</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong>Emergency lights</strong> default on. Toggle per selection. With lights on,
                these vehicles may run red stoplights; they still honor other traffic rules unless
                you step with <Kbd>F</Kbd>.
              </li>
              <li>
                <strong>Fire</strong> — start a fire on a tree (30s burn), then route a fire truck.
              </li>
              <li>
                <strong>Ambulance / hospital</strong> — park in a hospital bay with a patient (or
                sick occupant) to begin an illness recipe. Supplies are consumed; stay duration
                ticks down; patients-healed increments.
              </li>
              <li>
                <strong>Repair shop</strong> — park in a bay to run a repair recipe (parts + time).
                Optional vehicle-type filters. The vehicle records lastRepairId / lastRepairAt.
              </li>
              <li>
                <strong>Tow truck</strong> — on the drive panel (or Service list when one truck is
                selected), use <strong>Tow hook</strong> to connect or disconnect. The target must
                sit behind the truck within half a tile. While hooked, that vehicle is dragged
                behind the truck and cannot be driven on its own.
              </li>
            </ul>
          </Section>

          <Section id="clock" title="City clock">
            <p>
              The clock at the top of the map is the simulation clock, not necessarily wall time.
              People schedules, activity timers, and “time of day” AI all read{' '}
              <code className="text-xs bg-slate-100 px-1 rounded">simNow = Date.now() + cityTimeOffsetMs</code>.
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Click the digital time to type a value. Accepted examples: 6am, 5:20p, midnight, noon, 15:45, 930am.</li>
              <li>−1h / +1h nudges the offset by one hour.</li>
              <li><strong>Now</strong> clears the offset (real wall clock).</li>
              <li>
                Changing the clock re-arms people AI so schedules re-evaluate immediately rather than
                waiting for stale activity timers.
              </li>
            </ul>
          </Section>

          <Section id="library" title="Layouts, sims & export">
            <Sub>Layouts</Sub>
            <p>
              Name a layout and save. A layout snapshot stores tiles plus the building configs and
              item defs used in that region (so factories keep their recipes). Click a saved layout
              to stamp it. Export / Import zip moves the whole library between browsers.
            </p>
            <Sub>Simulations</Sub>
            <p>
              A simulation save is the entire live world: grid, vehicles, economy (people, cargo,
              recipes), and traffic. Use this to checkpoint a running city. Load replaces the current
              room contents after confirm.
            </p>
            <Sub>JSON export</Sub>
            <p>
              Sidebar download/upload icons export or import the raw grid JSON. This is a lower-level
              backup than a named simulation.
            </p>
            <Sub>Copy &amp; paste regions</Sub>
            <p>
              Alt-drag a rectangle, then copy/cut. Paste mode follows the cursor; <Kbd>R</Kbd> rotates
              the clipboard. Building configs inside the selection travel with the snapshot.
            </p>
          </Section>

          <Section id="reference" title="Quick reference">
            <Sub>Control pad (bottom-right)</Sub>
            <ul className="list-disc pl-5 space-y-1">
              <li>Grid lines, reset view, zoom in, zoom out, zoom % badge.</li>
              <li>Cars · Semis &amp; trailers · Trains · Service vehicles.</li>
              <li>People &amp; families · Traffic control · Drive panels.</li>
              <li>Logistics &amp; economy · Plant growth · Factories &amp; recipes.</li>
            </ul>
            <Sub>Must-know rules</Sub>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Anonymous users only — rooms work without signing in.</li>
              <li>Vehicles (except robotaxis) need a driver person to move.</li>
              <li>Factory recipes need employees physically at the building.</li>
              <li>People schedules follow the city clock, not necessarily your laptop clock.</li>
              <li>
                <Kbd>Esc</Kbd> cancels almost every pending tool (tile, destination, bus route, fire,
                people place, traffic, paste).
              </li>
              <li>
                One drive panel is Active; its vehicle eats G/S/F/B/L/R and arrow keys.
              </li>
            </ul>
            <Sub>Need this page again?</Sub>
            <p>
              Click the <CircleHelp className="w-4 h-4 inline -mt-0.5 text-blue-600" /> icon next to
              the <strong>Grid City</strong> title (or on the lobby heading). It always opens this
              documentation in a new tab. In-app, the sidebar <strong>Help Guide</strong> is a short
              cheat sheet of the same core shortcuts.
            </p>
            <p className="text-sm text-slate-500 pt-6">
              Grid City Collaborative — anonymous real-time city simulation.
            </p>
          </Section>
        </article>
      </div>
    </div>
  );
}
