> Updated 2026-10-03: current assignments and isolated Git workflow are in [agent-workflow.md](agent-workflow.md) and [tasks manifest](workflow/tasks.json). T-01/T-02 are committed in 356ec1b. Earlier first-kickoff sections below are historical; task packets supersede their dispatch instructions. Human UI/map boundaries remain in force.

# DishDeals team integration boundaries

The authoritative specification is `StormHacks Project Plan Instagram Deal Saver.md`. The human's current scope adjustment is: agents build the functional core incrementally; human teammates own high-quality frontend and all map integration. Keep the source plan intact and document ticket splits here or in the ticket handoff.

| Owner | Lane | Boundary |
| --- | --- | --- |
| Northstar (Codex Maestro) | One-ticket scheduling, contracts, review, integration, status | Do not auto-start subsequent tickets |
| Loom (Claude Code) | Assigned functional code and checks | One writer per shared checkout; exact paths required |
| Prism (Gemini) | Assigned API research, fixtures, demo evidence | No frontend design/polish or map implementation |
| Human frontend teammate | Polished UI, typography, palette, animation, final components | Agents supply minimal functional scaffolding and stable props/contracts |
| Human map teammate | T-08, geocoding, DealMap/pin confirmation, map-related portions of T-09/T-10/T-21, geospatial wiring | Keep coordinates and planned API names stable; agree shared-file ownership before changes |

## First checkpoint

Only T-01's functional scaffold is authorized by the kickoff. Fonts/palette/polish are handed to the frontend teammate. Deployment and live Convex validation may require human configuration. Report these as pending rather than marking the original T-01 done. T-02 and later tickets wait for a separate instruction and resolved dependencies.

## Later functional lane, one ticket at a time

Use the plan's ticket IDs and Depends column: T-02 schemas; T-03 auth/profiles; T-04 time/distance logic; T-05 extraction; then functional portions of T-07/T-09/T-10/T-11/T-12 and other separately assigned work. This list is orientation, not permission to execute all of it.

Preserve `lat` and `lng`, coordinate arguments, and function contracts for teammate integration. Do not implement a substitute map or silently remove pin confirmation. T-07/T-10 end-to-end acceptance stays pending until the teammate's map work is integrated. Plan backend deals/geospatial shared files jointly before implementation. No invented coordinates or sample/live evidence confusion.

Use plain accessible controls only where needed to test functionality. Loading/error behavior needed for a working ticket is allowed; visual polish, reveal animations, and final styling are teammate-owned. Solana is outside the first kickoff and needs its own assignment.

## Handoff

Each ticket reports ID/status, branch/checkout, changed paths, checks actually run, external dependencies, phone-only tests, and next action. Keep credentials out of handoffs. Do not claim the live feed works offline; cached extraction fixtures do not make Convex work without internet.
