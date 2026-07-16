# Rewrite Brief: Comfort-Based Sailing Decision Module

## Scope — read this first
This brief covers a **targeted rewrite of the sailing-decision logic
only** — the code that decides sail configuration and heading. It does
**not** cover the coastline/land-avoidance/tiling system, which is
working well and should be left alone. If this is handed to Claude Code
as a fresh start, treat it as: same repo, same coastline/routing-shell
infrastructure, new sailing-decision module built from scratch against
this spec rather than patched from the existing one.

## Why a rewrite, not a patch
The existing sailing logic optimizes heading, continuously, for maximum
VMG — correct for racing, wrong for this boat's actual use. Real skipper
feedback (direct quotes below) makes clear the tool needs to reason about
whether a sail change is *worth the hassle* given how long a wind window
will realistically last — a fundamentally different kind of decision than
"what's the fastest heading right now," not a tuning knob on top of it.
Combined with several recurring correctness bugs in the existing tack/
gybe logic (inverted no-go threshold, wind-direction averaging bug,
`describeWind()` bucket inversion, light-air dithering), the sailing
module has earned a clean rewrite rather than another patch.

## The core insight, from the skipper directly
> "It needs to think things like: don't bother putting the main out
> because you're only going to have it up 30 minutes, so the juice isn't
> worth the squeeze — versus it's worth putting the main up solo because
> you're going to have it up on a good beam reach for six hours."

And:
> "If I was doing 100 miles, I would have the sails up and I would be
> tacking to get to my destination, but because I've got less than an
> hour to go, it's just not worth it... If it was like this all the way
> to the Scillies [it would be worth it], and there's also only 1.9 knots
> of breeze, so I can't sail in it anyway. If it was 15 knots and I had a
> few hours to go, I'd probably have the headsail out."

And on solo sailing specifically:
> "Getting the main up, particularly heading downwind, is difficult.
> Upwind I can put the main up much more easily. Downwind I also have to
> turn into the wind to get the main up if it's breezy."

The tool has no judgement and no experience — it can only act on hard
parameters it's given. The job isn't to make the tool "smarter," it's to
give it the right parameters and the right decision structure so a
sensible-looking cruising plan falls out of straightforward comparisons,
the same way a skipper's own reasoning above is really just weighing
duration and hassle against benefit, over and over.

## Architecture: two decision tiers, not one

**Tier 1 (new): Configuration planner.** Given the full wind forecast
across the whole remaining passage — not just the current instant — this
decides which *sail configuration* to use for each stretch of the route:
motor-only, headsail-only, full sail (main + headsail), or reefed
variants. It should look ahead, estimate how long a given wind regime
will realistically hold, and only recommend a configuration change if the
expected benefit over that duration clears the hassle cost of making the
change. This runs first, and its output — a small number of configuration
blocks covering the passage — is what Tier 2 operates within.

**Tier 2 (rebuilt): Heading/VMG optimization within a configuration
block.** Once a stretch is confirmed as, say, "headsail-only reach for
the next three hours," run heading optimization within that block using
that configuration's own polar — same isochrone-and-polar approach
already built, just scoped inside a configuration block instead of
running unconstrained for the whole passage. Apply the light-air
hysteresis/no-go-zone fixes here too — a cruising tool shouldn't dither
between headings for marginal VMG gains even within a sailing block, the
same reasoning that applies to configuration changes applies at the
heading level too, just at a finer grain.

## Configuration types needed
Each needs its own polar (or polar-equivalent):
- **Motor-only** — constant speed regardless of wind direction (a flat
  "polar," effectively a single cruising RPM speed), used below the
  minimum sailable wind speed, during final approach, or whenever the
  configuration planner decides it's not worth deploying sail.
- **Headsail-only** — low hassle to deploy and stow (roller furling),
  should have a low "worth it" duration threshold.
- **Full sail (main + headsail)** — higher hassle to deploy and stow,
  especially solo, especially downwind — should have a materially higher
  "worth it" duration threshold, and that threshold should itself depend
  on the boat's heading/point of sail at the moment of hoisting (see
  below).
- **Reefed variants** — triggered by a configurable upper wind threshold,
  same hassle-cost logic as full sail for the purposes of "is it worth
  changing."

## Comfort parameters — all must be configurable, none hardcoded
This is the direct answer to "the tool can't make judgement calls, only
follow parameters" — so the parameters need to cover everything a real
skipper would actually weigh:

- `minSailableWindKn` — below this, motor regardless (the skipper's 1.9kn
  example: no judgement call needed, there's simply not enough wind).
- `engineOnWindKn` / `engineOffWindKn` — thresholds for switching to/from
  motor, potentially with hysteresis built in (different thresholds for
  turning on vs off) so it doesn't flip back and forth right at the
  boundary.
- `reefWindKn` / `maxComfortWindKn` — when to reef, and an upper comfort
  ceiling.
- `minWorthwhileDurationMin` — **separate values per configuration type**,
  since headsail and full main have very different hassle costs. A short
  wind window might justify unfurling the headsail but not hoisting the
  main.
- `soloSailing: boolean` — when true, increase the hassle cost (and
  therefore the duration threshold) for full-sail changes, particularly
  ones that would happen on a downwind heading.
- `mainHoistDifficultyByPointOfSail` — the hassle cost of hoisting the
  main should vary by the boat's heading at the time: easy upwind, harder
  downwind (requires rounding up into the wind first, an extra manoeuvre,
  worse in breeze). This should be a real input into the "worth it"
  calculation, not a flat constant.
- `finalApproachBufferMin` — within this much time of the destination,
  always default to the lowest-hassle configuration (motor), regardless
  of what wind-based logic would otherwise suggest — mirrors dropping
  sail before arrival/anchoring as standard practice, independent of any
  performance calculation.

## Explainability: extend the existing decision-panel work
The between-leg decision panels from the earlier UI brief need a new
category alongside tack/gybe/bearing-shift/land-avoidance: **configuration
change**. Each needs its own grounded narration, e.g.:
> "Wind forecast to hold above 12kn for the next 4 hours on a beam
> reach — worth hoisting the main."

> "Wind window of ~20 minutes at 8kn expected before dropping again — not
> worth unfurling the headsail for that short a stretch."

> "Within 45 minutes of destination — sails down, motoring in for
> arrival."

This reuses the same explanation-generator pattern already specced
elsewhere — one generator, fed structured decision data, used everywhere
output is needed (UI panel, console log, and eventually the ChatGPT tool
response).

## Why this matters for the ChatGPT/tool delivery model specifically
This is the piece that makes the "hey ChatGPT, plan me a day trip" vision
from earlier actually work safely. Asked to plan a route directly,
ChatGPT would be guessing — it has no way to know this boat, this
skipper's comfort limits, or that a 30-minute wind window isn't worth
raising the main. But if the comfort parameters above are the tool's
actual input schema, ChatGPT's job becomes something it's well-suited to:
translating a client's plain-language intent ("day-tripper style, not too
fussy, I'm sailing solo") into the right parameter values, using memory
of this specific client's boat and preferences, then calling the tool
with them. The tool still does no guessing of its own — it's the same
deterministic, parameter-driven logic either way, just fed by a
conversation instead of a form.

## Not in scope for this rewrite, but worth flagging
Once motoring is a real, planned part of routes rather than an
afterthought, fuel range and consumption becomes a legitimate constraint
eventually — not needed now, but worth keeping in mind as a natural
next parameter set once this configuration-planner model is working.

## Interface priority has changed — the web UI is now a debug tool, not the product
Worth being explicit about this since it changes what "done" means for
several pieces above. The primary consumer of this system is no longer a
person clicking through a web page — it's an AI agent (ChatGPT, or
whatever the client uses) calling this as a tool, with the client talking
to it in plain language. The web UI that's been built throughout this
project — the map, the leg cards, the decision panels, the tile-state
overlay — doesn't go away, but its purpose narrows to **your own
debugging and verification surface**, not something the end client uses
directly. This has concrete consequences:

**1. The real "output" of this system is now an API/tool response, not a
rendered page.** Everything specced in this brief — configuration blocks,
decision records, the human-readable explanation generator — needs to be
designed first as clean, structured data returned from a function call,
with the UI as one renderer of that data (a debug renderer, specifically)
rather than the thing the data was designed for. This was already the
right direction from the data/engine/UI separation established early on;
this just makes explicit that the UI is now the least important of the
three, not an equal partner.

**2. The tool's input/output schema is the actual product surface, and
deserves the same care a public API would get.** Inputs: start, end,
departure time, boat/polar reference, and every comfort parameter from
this brief, all with sensible defaults so an AI agent can omit anything
it doesn't have an opinion about. Outputs: the leg-by-leg route, the full
structured decision log (every configuration change and heading change,
with its reason and the numbers behind it), and the narrated text version
of that log — an AI agent needs the narration to relay back to the client
in conversation, and needs the structured version to reason about or
double-check if asked a follow-up question.

**3. The visual debug tool (tile-state overlay, coarse-vs-precise route
comparison, TWA labels, decision panels) stays exactly as specced
earlier — it's just now clearly framed as instrumentation for you to
verify the underlying tool is producing correct, sensible output, the
same way you'd inspect logs or run a debugger, not a feature being built
for the client to ever see.

**4. This reframes priority, not scope.** Nothing already specced in this
document gets cut — the configuration planner, the comfort parameters,
the explanation generator all still need building exactly as described.
What changes is that the API contract these all feed into should be
treated as the thing to get right first, with the UI's job being to
prove that contract is producing correct answers, not the other way
round.
