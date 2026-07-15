# Build Brief: Sailing Passage Planner — Phase 1

## What this is
A tool for a specific boat (Beneteau Oceanis Clipper 393) that takes a
start point and an end point, looks at the wind forecast for the passage
window, and produces a leg-by-leg sailing plan: a series of headings and
the waypoints where the boat should change course, aimed at the fastest
achievable route given the boat's actual sailing performance.

This is Phase 1 only: a **pre-departure planning tool**, used ashore before
setting off. It does not track the boat live or use GPS while underway —
see "Phase 2" at the bottom for that, which is explicitly out of scope
right now but should shape a few structural decisions below so it isn't
a rebuild later.

## Status
Prototype software. The skipper is aware of this and is not relying on it
as a sole means of navigation — but the output should still be honest
about what it does and doesn't account for (see "What this does not do").

## Core inputs
1. **Start point and end point** — lat/long, entered manually (e.g. by
   tapping a map or typing coordinates).
2. **Departure time** — determines which forecast window the route is
   planned against.
3. **Boat polar data** — see below.

## Boat performance: polar data
The Oceanis 393 Clipper doesn't have a hull-specific polar on file, but
ORC-certified boats of the same model do, and their polars are close
enough to use as a stand-in — much better than a generic assumption.
`https://jieter.github.io/orc-data/` (data sourced from ORC.org) has
searchable per-boat polar diagrams; look for an Oceanis 393 with an ORC
certificate and pull its polar table (boat speed at each true wind angle
× true wind speed combination) as a static JSON file bundled with the app.
Structure it so a different polar file can be swapped in later without
code changes, in case a closer match turns up or the skipper eventually
gets the actual boat polar'd.

## Wind data
Open-Meteo Forecast API (`api.open-meteo.com/v1/forecast`), free, no key.
Request `wind_speed_10m` and `wind_direction_10m` hourly. Open-Meteo
supports comma-separated coordinate lists in a single request, so pull
wind at several points spanning the start/end area rather than one single
point — the routing algorithm needs wind across the whole area it might
route through, not just the endpoints.

## Land avoidance
The route must never cross land. Use a coastline dataset — OpenStreetMap
coastline extracts or Natural Earth coastline data both work — bundled as
a static file (this is Scottish coastal waters, so a UK/Scotland-clipped
extract keeps the file size sane) rather than queried live. Each candidate
routing step needs a simple point/line-vs-coastline collision check before
it's accepted.

## Tidal currents — explicitly simplified in Phase 1
There's no clean free API for tidal *stream* data (current direction and
rate, as opposed to tide times/heights, which are well covered separately
by UK Admiralty EasyTide). Real tidal stream data comes from Admiralty
tidal diamonds on charts, which isn't available as an open feed.

For Phase 1: **do not attempt to model tidal currents from a live feed.**
Either:
- Leave tidal current out of the routing calculation entirely, and label
  the output plan clearly with something like "Tidal stream not modelled
  — cross-check against chart before departure," or
- If the skipper knows the specific water they'll be routing through, let
  them optionally hand-enter a simplified current table (direction + rate
  by hour, sourced manually from a chart or pilot book) that the algorithm
  can factor in as a vector added to boat speed. This should be optional
  and clearly labelled as user-supplied, not modelled.

Do not quietly approximate tidal current from Open-Meteo's ocean current
data — it's a global-resolution model, not accurate enough for inshore
channels, and would be worse than not modelling it at all.

## Routing algorithm: isochrone method
1. Step forward in fixed time increments (e.g. every 15–30 minutes) from
   the departure time.
2. At each step, from every currently-reachable point, fan out across a
   range of possible headings.
3. For each candidate heading, look up boat speed from the polar table
   using the wind at that point in time and space, apply that speed (plus
   tidal drift vector if supplied) over the time increment to get a new
   candidate position.
4. Discard any candidate position that crosses land.
5. Keep only the outer boundary of reachable points at each time step
   (the "isochrone") — this is what keeps the search from exploding
   combinatorially.
6. Repeat until the destination is reached (or close enough), then trace
   the path backward from the destination through the isochrone history
   to recover the actual route taken.

## Turning the raw path into a usable plan
The raw isochrone path changes heading almost every time step as wind
shifts slightly — not usable as an actual instruction. Add a
simplification pass afterward: merge consecutive steps with similar
headings into single legs, and only emit a new leg when the heading
change is large enough to matter for a real tack/gybe decision (a
reasonable starting threshold is somewhere around 15–20°, but make this
an easily-adjustable constant, not a magic number buried in the routing
code — it'll need tuning against real output).

Output format: a numbered list of legs, each with a heading, the
lat/long of the waypoint where that leg ends, and roughly how long that
leg should take at the modelled speed. This is the actual deliverable the
skipper reads before leaving the dock.

## What this does not do (be explicit about this in the UI)
- Does not track the boat live or know its actual position underway.
- Does not model tidal streams unless the skipper manually supplies data
  for that specific stretch of water.
- Does not account for other traffic, hazards, or anything not in the
  coastline dataset (buoys, moorings, restricted areas).
- Is a planning aid based on a forecast, not a real-time instruction — the
  forecast can be wrong, and the plan should say so.

## Architecture note for Phase 2 readiness (do not build Phase 2 now)
Phase 2 will eventually take the boat's live GPS position and compare it
against the plan, replanning if the boat has drifted or the wind's
shifted from forecast. To avoid a rebuild when that happens, structure
Phase 1 so:
- The **routing engine** (polar lookup, isochrone stepping, land
  collision, leg simplification) is a self-contained module that takes a
  starting position, a start time, and a wind/tide dataset, and returns a
  route. It should not know or care whether that starting position came
  from manual entry or a live GPS fix — that distinction stays entirely
  in the UI layer, not the routing logic.
- The wind-fetching code should be written to accept an arbitrary
  start time and area, not hardcoded to "now" — Phase 2 will need to
  re-run this against a fresh forecast window mid-passage.
- Keep the leg-simplification output as structured data (an array of
  {heading, waypoint, duration} objects) rather than pre-formatted text,
  so a future live view can compare "planned leg" against "actual GPS
  track" programmatically.

That's the extent of Phase 2 prep for now — no GPS code, no background
location handling, no live replanning logic. Just keep the routing engine
decoupled from how a position gets into it.
