# Pac-Man · AI Arena

Pac-Man where every character can be driven by an LLM decisions API. Ghosts
and Pac-Man each get their own AI call, so neither side sees the other's
plan. Run heuristic ghosts against a Jev-driven Pac-Man, OpenAI against
OpenAI, or any other mix.

Vanilla JS on a canvas. Zero npm dependencies.

## Quick start

```bash
node pacman/server.js
# open http://localhost:3000
```

Use `PORT=8080 node pacman/server.js` for a different port.

## How to play

| Key | Action |
| --- | --- |
| Arrow keys / WASD | Steer Pac-Man (player mode) |
| Space | Pause / resume |
| R | Restart |

### Test mode

The **Run 2-min Test** button at the bottom starts a fresh game with the
current brain selections and runs it for up to two minutes. Each run logs a
report to the accordion table (kept in `sessionStorage`, so it survives
reloads within the session and clears in a new one):

- matchup (ghost brain vs pacman brain) and maze
- Pac-Man score vs ghost score (each catch of Pac-Man is worth 200)
- average API latency and failure count, per provider
- result: PACMAN / GHOSTS / TIE / STOPPED

Brain settings lock while a test runs. The test requires Pac-Man AI control
to be enabled.

## Brains

Each side is configured independently.

**Ghosts Brain card**

- *Heuristic ghosts only* (default): a local chase/flee brain, no API calls.
  When frightened, ghosts flee instead of hunt.
- *OpenAI*: every 2 tiles of ghost travel, one batched call to
  `POST https://api.openai.com/v1/decisions` (model `gpt-6-luna`) with the
  full maze, all positions, and one choice question per ghost.
- *Jev*: same decision content sent to TypeSafe's
  `POST https://api.typesafe.ai/v1/systemone` (model `jev-latest`), reshaped
  to their schema: `state` instead of `input`, and choice options as a
  `criteria` map. Called through a local proxy (`/api/jev`) because the
  browser can't reach the API directly (CORS).

**Jacman Brain card**

- *Player*: you steer.
- *AI control*: Pac-Man gets its own decisions call (separate provider
  choice, separate request, no shared context) every 2 tiles of its own
  movement.

### Failure behavior

When the AI checkbox is off for ghosts and an API call fails, there is no
heuristic fallback: ghosts coast in their current direction and stop at the
first wall, retrying every ~2 seconds until a valid decision arrives.
Decisions that arrive mid-flight don't expire when illegal at the current
tile; they queue and retry at each junction until one can be honored.
Frightened ghosts may reverse.

API keys live in `localStorage` (never on disk). On load each stored key is
health-checked; invalid keys are cleared automatically.

## Mazes

Three layouts, switchable before starting or while paused (switching
restarts the game):

- **Classic** — the traditional layout, 286 pellets
- **Plaza** — open arenas with pillar blocks, side tunnels on the house row
  plus vertical wrap tunnels at mid-top and mid-bottom, 314 pellets
- **Labyrinth** — narrow winding corridors with an asymmetric middle band,
  side tunnel on the start row, 350 pellets

All three are validated by `check-mazes.js`: exact 28×31 size, all pellets
reachable by flood fill (with wrap), Pac-Man start and ghost spawns
unblocked, exactly 4 power pellets each.

## Speed

A slider (0.25x to 2x) scales Pac-Man and ghost movement equally, useful
for slowing the game while decisions are in flight.

## Files

```
pacman/
  index.html          page shell, brain cards, stat bar, test accordion
  game.js             game engine, AI calls, providers, test mode
  server.js           zero-dep static server + /api/jev CORS proxy
  check-mazes.js      maze validator (28x31, connectivity, power pellets)
  test-headless.js    gameplay smoke test (DOM stub, mocked fetch)
  test-parser.js      response-parser torture test across API shapes
  test-pacman-ai.js   Pac-Man AI decision-following test with latency
  test-report-mode.js test-mode report capture verification
```

Run the tests:

```bash
node pacman/test-headless.js
node pacman/test-parser.js
node pacman/test-pacman-ai.js
node pacman/test-report-mode.js
```

## Notes

- The server stamps `game.js?v=<mtime>` into `index.html` on every request,
  so edits show up on reload without cache games.
- OpenAI calls go directly from the browser (their API allows it). Jev
  calls need the bundled server for the `/api/jev` proxy.
- The decisions response schema isn't reliably documented anywhere, so
  `extractDecisions` does a schema-agnostic deep scan: it finds each
  character's direction by name in any nesting, accepting key/value, named
  items, and compass aliases (`north` → `up`), case-insensitive.
