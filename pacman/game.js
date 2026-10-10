// Classic Pac-Man — canvas, vanilla JS.
// Ghost movement is tile-based. Every 2 tiles a ghost travels, the game asks
// an OpenAI chat-completions endpoint for the direction each ghost should go
// (chase when normal, flee when frightened). Falls back to a local heuristic
// whenever the API is unavailable or no key is set.

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");
const msgEl = document.getElementById("msg");
const apiKeyInput = document.getElementById("apiKey");
const saveKeyBtn = document.getElementById("saveKey");
const healthCheckBtn = document.getElementById("healthCheck");
const aiStatusEl = document.getElementById("aiStatus");
const heuristicOnlyEl = document.getElementById("heuristicOnly");
const buildInfoEl = document.getElementById("buildInfo");
const SCRIPT_VERSION =
  (document.currentScript && document.currentScript.src.split("v=")[1]) || "?";

// On-screen proof of what's running: maze name, its wall count (changes with
// every maze edit), and the build stamp injected by the server.
function updateBuildInfo() {
  const walls = MAP.join("").split("#").length - 1;
  buildInfoEl.textContent =
    "maze: " +
    mazeSelect.value +
    " · walls: " +
    walls +
    " · build: " +
    SCRIPT_VERSION;
}

const TILE = 16;
const COLS = 28,
  ROWS = 31;
const DECISION_EVERY_TILES = 2;

const mazeSelect = document.getElementById("mazeSelect");
const pacmanAIEl = document.getElementById("pacmanAI");
const ghostModeEl = document.getElementById("ghostMode");
const pacModeEl = document.getElementById("pacMode");
const ghostCardEl = document.getElementById("ghostCard");
const pacBrainEl = document.getElementById("pacBrain");

// ---------------- Brain cards ----------------
const ARROW_GLYPHS = { up: "↑", down: "↓", left: "←", right: "→", stop: "■" };
function setArrow(name, dir) {
  const el = document.getElementById("ar-" + name);
  if (el) el.textContent = dir ? ARROW_GLYPHS[dir] || dir : "·";
}
function updateBrainCards() {
  const ghostHeur = heuristicOnlyEl.checked;
  ghostCardEl.classList.toggle("disabled", ghostHeur);
  ghostModeEl.textContent = ghostHeur
    ? "HEURISTIC"
    : "AI · " + cardProvider("gp").toUpperCase();
  ghostModeEl.classList.toggle("off", ghostHeur);
  const pacAI = pacmanAIEl.checked;
  pacBrainEl.classList.toggle("disabled", !pacAI);
  pacModeEl.textContent = pacAI ? "AI · " + cardProvider("pp").toUpperCase() : "PLAYER";
  pacModeEl.classList.toggle("off", !pacAI);
  // Provider radios: locked when the brain in question isn't AI-driven.
  const gpO = document.getElementById("gp-openai"),
    gpJ = document.getElementById("gp-jev"),
    ppO = document.getElementById("pp-openai"),
    ppJ = document.getElementById("pp-jev");
  if (gpO) gpO.disabled = gpJ.disabled = ghostHeur;
  if (ppO) ppO.disabled = ppJ.disabled = !pacAI;
}

// # = wall, . = pellet, o = power pellet, ' ' = empty, '-' = ghost door
const MAZES = {
  classic: [
    "############################",
    "#............##............#",
    "#.####.#####.##.#####.####.#",
    "#o####.#####.##.#####.####o#",
    "#.####.#####.##.#####.####.#",
    "#..........................#",
    "#.####.##.########.##.####.#",
    "#.####.##.########.##.####.#",
    "#......##....##....##......#",
    "######.#####.##.#####.######",
    "######.#####.##.#####.######",
    "######.##..........##.######",
    "######.##.###--###.##.######",
    "######.##.#      #.##.######",
    "######....#      #....######",
    "######.##.#      #.##.######",
    "######.##.########.##.######",
    "######.##..........##.######",
    "######.##.########.##.######",
    "######.##.########.##.######",
    "#............##............#",
    "#.####.#####.##.#####.####.#",
    "#.####.#####.##.#####.####.#",
    "#o..##.......  .......##..o#",
    "###.##.##.########.##.##.###",
    "###.##.##.########.##.##.###",
    "#......##....##....##......#",
    "#.##########.##.##########.#",
    "#.##########.##.##########.#",
    "#..........................#",
    "############################",
  ],
  plaza: [
    "#############  #############",
    "#..........................#",
    "#.####.######..######.####.#",
    "#o####.######..######.####o#",
    "#.####.######..######.####.#",
    "#..........................#",
    "#..........................#",
    "#.####.####..##..####.####.#",
    "#.####.####..##..####.####.#",
    "######.#####.##.#####.######",
    "######.#####.##.#####.######",
    "######.##..........##.######",
    "######.##.###--###.##.######",
    "######.##.#      #.##.######",
    "      ....#      #....      ",
    "######.##.#      #.##.######",
    "######.##.########.##.######",
    "######.##..........##.######",
    "######.##.########.##.######",
    "######....########....######",
    "#..........................#",
    "#.####.##.########.##.####.#",
    "#.####.##.########.##.####.#",
    "#o..##.......  .......##..o#",
    "#.####.##.########.##.####.#",
    "#.####.##.########.##.####.#",
    "#..........................#",
    "#.#####.####.##.####.#####.#",
    "#.#####.####.##.####.#####.#",
    "#..........................#",
    "#############  #############",
  ],
  labyrinth: [
    "############################",
    "#............##............#",
    "#.###.#.####.##.####.###.#.#",
    "#o....#.####.##.####.#. .#o#",
    "#.#.###.####.##.####.##.##.#",
    "#..........................#",
    "#.##..####.######.####..##.#",
    "#.##..####.######.####..##.#",
    "#....##..............# ....#",
    "#####..##..####....##..#####",
    "####..###..####....###..####",
    "#####..##..........##.....##",
    "#####..##.###--###.##.....##",
    "######.##.#      #.##.#..###",
    "######....o#     #....#..###",
    "######.##.#      #.##.##.###",
    "######.##.########.##.....##",
    "######.##..........##.....##",
    "######.##.########.##.....##",
    "######.##.########.##......#",
    "#............##............#",
    "#.####.##..........##.####.#",
    "#.####.##.##....##.##.####.#",
    " o..##....##....##....##..o ",
    "###.##.##.########.##.##.###",
    "###.##.##.########.##.##.###",
    "#....##.####.##.####..#....#",
    "#.####..####.##.####..####.#",
    "#.####..####.##.####..####.#",
    "#..........................#",
    "############################",
  ],
};

// Active maze — "classic" is the default.
let MAP = MAZES[mazeSelect.value] || MAZES.classic;

let grid, pellets, score, lives, gameState, scaredTimer;
let pacman, ghosts;

const DIRS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
const DIR_NAMES = ["up", "down", "left", "right"];

const GHOST_COLORS = ["red", "pink", "cyan", "orange"];
const GHOST_NAMES = ["blinky", "pinky", "inky", "clyde"];

// ---------------- API key ----------------
// Key lives in localStorage only. On load it is health-checked; if the check
// fails the key is cleared from storage.
const storage = (() => {
  try {
    const t = "__pac_test__";
    localStorage.setItem(t, "1");
    localStorage.removeItem(t);
    return localStorage;
  } catch (e) {
    console.warn("localStorage unavailable, key will not persist:", e);
    return {
      _m: {},
      getItem(k) {
        return this._m[k] ?? null;
      },
      setItem(k, v) {
        this._m[k] = String(v);
      },
      removeItem(k) {
        delete this._m[k];
      },
    };
  }
})();

// In-memory copies of the API keys (input boxes + localStorage are the sources).
let API_KEY = "";
let JEV_KEY = "";

const jevKeyInput = document.getElementById("jevKey");
const healthCheckJevBtn = document.getElementById("healthCheckJev");

function getApiKey() {
  return apiKeyInput.value.trim() || API_KEY;
}
function getJevKey() {
  return (jevKeyInput && jevKeyInput.value.trim()) || JEV_KEY;
}

function saveApiKey() {
  API_KEY = apiKeyInput.value.trim();
  JEV_KEY = jevKeyInput ? jevKeyInput.value.trim() : "";
  try {
    storage.setItem("openai_api_key", API_KEY);
    storage.setItem("jev_api_key", JEV_KEY);
  } catch (e) {
    /* ignore */
  }
  setAIStatus("keys saved");
  console.log(
    "[pacman] keys updated — openai:",
    API_KEY ? API_KEY.slice(0, 7) + "..." : "(none)",
    "jev:",
    JEV_KEY ? JEV_KEY.slice(0, 7) + "..." : "(none)",
  );
}

function clearStoredKey(which) {
  try {
    storage.removeItem(which === "jev" ? "jev_api_key" : "openai_api_key");
  } catch (e) {
    /* ignore */
  }
}

// ---------------- Providers ----------------
const PROVIDERS = {
  openai: {
    url: "https://api.openai.com/v1/decisions",
    model: "gpt-6-luna",
    key: () => getApiKey(),
    keyLabel: "OpenAI key",
  },
  jev: {
    url: "/api/jev", // local proxy → https://api.typesafe.ai/v1/systemone (CORS)
    model: "jev-latest",
    key: () => getJevKey(),
    keyLabel: "Jev key",
  },
};

// Which AI provider each brain card uses ("openai" | "jev").
function cardProvider(prefix) {
  const jev = document.getElementById(prefix + "-jev");
  return jev && jev.checked ? "jev" : "openai";
}

// Unified decision call. questionsArr: [{type, name, instructions, choices}].
// OpenAI: { model, input, questions: [ ... ] }
// Jev:    { model, state: input, questions: { name: {...} } }
async function callDecisions(providerName, input, questionsArr) {
  const p = PROVIDERS[providerName] || PROVIDERS.openai;
  const key = p.key();
  if (!key) throw new Error("no " + p.keyLabel + " entered");
  const body =
    providerName === "jev"
      ? {
          state: input,
          model: p.model,
          questions: Object.fromEntries(
            questionsArr.map((q) => [
              q.name,
              {
                type: q.type,
                instructions: q.instructions,
                // Jev Choice format: criteria is a map of option → description
                // (OpenAI uses an array of {value, description} instead).
                criteria: Object.fromEntries(
                  (q.choices || []).map((c) => [c.value, c.description]),
                ),
              },
            ]),
          ),
        }
      : { model: p.model, input, questions: questionsArr };
  const res = await fetch(p.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + key,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(
      "HTTP " + res.status + (errBody.error ? ": " + errBody.error.message : ""),
    );
  }
  return res.json();
}

// On load: take stored keys, health-check them, clear any that fail.
(async function loadAndValidateKeys() {
  const jobs = [
    {
      name: "openai",
      input: apiKeyInput,
      storeKey: "openai_api_key",
      set: (v) => (API_KEY = v),
      check: healthCheck,
    },
    {
      name: "jev",
      input: jevKeyInput,
      storeKey: "jev_api_key",
      set: (v) => (JEV_KEY = v),
      check: healthCheckJev,
    },
  ];
  for (const job of jobs) {
    if (!job.input) continue;
    let k = "";
    try {
      k = storage.getItem(job.storeKey) || "";
    } catch (e) {
      /* ignore */
    }
    if (!k) continue;
    job.input.value = k;
    job.set(k);
    setAIStatus(job.name + " key found — checking health...");
    const result = await job.check(k);
    if (result.ok) {
      setAIStatus(job.name + " key healthy ✓ " + result.message);
    } else {
      job.input.value = "";
      job.set("");
      clearStoredKey(job.name);
      setAIStatus(job.name + " key invalid (" + result.message + ") — cleared", true);
    }
  }
})();

// Health check (OpenAI): dummy /v1/decisions call — validates key, endpoint,
// and model in one shot. Returns {ok, message}.
async function healthCheck(key) {
  const t0 = performance.now();
  try {
    const res = await fetch("https://api.openai.com/v1/decisions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + key,
      },
      body: JSON.stringify({
        model: "gpt-6-luna",
        input: "I was charged twice for my order.",
        questions: [
          {
            type: "choice",
            name: "department",
            instructions: "Which department should handle this complaint?",
            choices: [
              {
                value: "billing",
                description: "Payments, invoices, and refunds.",
              },
              {
                value: "technical",
                description: "Problems using the product.",
              },
              { value: "shipping", description: "Delivery and tracking." },
            ],
          },
        ],
      }),
    });
    const ms = Math.round(performance.now() - t0);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return {
        ok: false,
        message: body.error ? body.error.message : "HTTP " + res.status,
      };
    }
    return { ok: true, message: ms + "ms" };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

// Health check (Jev): dummy /v1/systemone call per the documented example.
async function healthCheckJev(key) {
  const t0 = performance.now();
  try {
    const res = await fetch("/api/jev", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + key,
      },
      body: JSON.stringify({
        state:
          "Hi, I've been trying to connect my Stripe account for 3 days and the integration keeps failing. I'm losing sales. Please help ASAP.",
        model: "jev-latest",
        questions: {
          urgency: {
            type: "noul",
            instructions: "Does this message express urgency?",
          },
        },
      }),
    });
    const ms = Math.round(performance.now() - t0);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return {
        ok: false,
        message: body.error ? body.error.message : "HTTP " + res.status,
      };
    }
    return { ok: true, message: ms + "ms" };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

healthCheckBtn.addEventListener("click", async () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    setAIStatus("enter an OpenAI key first", true);
    return;
  }
  healthCheckBtn.disabled = true;
  setAIStatus("checking OpenAI...");
  const result = await healthCheck(key);
  if (result.ok) setAIStatus("OpenAI healthy ✓ " + result.message);
  else setAIStatus("OpenAI unhealthy ✗ " + result.message, true);
  healthCheckBtn.disabled = false;
});

healthCheckJevBtn.addEventListener("click", async () => {
  const key = jevKeyInput.value.trim();
  if (!key) {
    setAIStatus("enter a Jev key first", true);
    return;
  }
  healthCheckJevBtn.disabled = true;
  setAIStatus("checking Jev...");
  const result = await healthCheckJev(key);
  if (result.ok) setAIStatus("Jev healthy ✓ " + result.message);
  else setAIStatus("Jev unhealthy ✗ " + result.message, true);
  healthCheckJevBtn.disabled = false;
});

saveKeyBtn.addEventListener("click", saveApiKey);
apiKeyInput.addEventListener("change", saveApiKey); // auto-save on blur/paste
apiKeyInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") saveApiKey();
  e.stopPropagation(); // don't steer pacman while typing
});
if (jevKeyInput) {
  jevKeyInput.addEventListener("change", saveApiKey);
  jevKeyInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveApiKey();
    e.stopPropagation();
  });
}

function setAIStatus(text, isErr) {
  aiStatusEl.textContent = text;
  aiStatusEl.className = isErr ? "err" : "";
}

heuristicOnlyEl.addEventListener("change", () => {
  heuristicOnlyEl.blur(); // keep arrow keys steering pacman
  if (heuristicOnlyEl.checked) {
    // switch to local brain immediately: clear queued AI decisions and
    // un-stop any ghost parked at a wall
    for (const g of ghosts) {
      g.pendingDecision = null;
      if (!g.inHouse && g.dir === "stop") g.dir = heuristicDir(g);
    }
    setAIStatus("heuristic mode: local brain, no API calls");
  } else {
    setAIStatus("AI mode: API drives ghosts; on failure they coast & stop");
  }
});

// ---------------- Game state ----------------
function resetGrid() {
  grid = [];
  pellets = 0;
  for (let y = 0; y < ROWS; y++) {
    grid.push([]);
    for (let x = 0; x < COLS; x++) {
      const c = MAP[y][x];
      grid[y][x] = c === "." || c === "o" ? c : " ";
      if (c === "." || c === "o") pellets++;
    }
  }
}

function makeGhost(name, color, tx, ty, scatter, releaseTimer) {
  return {
    name,
    color,
    scatter,
    inHouse: true,
    releaseTimer,
    tile: { x: tx, y: ty }, // current tile
    from: { x: tx, y: ty }, // tile moving from
    dir: "left", // direction of current step
    progress: 0, // 0..1 between "from" and "tile"
    pendingDecision: null, // last API decision for this ghost
    pixelX: 0,
    pixelY: 0,
  };
}

function resetActors() {
  pacman = {
    x: 14 * TILE + TILE / 2,
    y: 23 * TILE + TILE / 2,
    dir: "left",
    next: null,
    speed: 1.8,
  };
  ghosts = [
    makeGhost("blinky", "red", 13, 11, { x: 26, y: 0 }, 0),
    makeGhost("pinky", "pink", 13, 14, { x: 1, y: 0 }, 90),
    makeGhost("inky", "cyan", 11, 14, { x: 26, y: 30 }, 240),
    makeGhost("clyde", "orange", 15, 14, { x: 1, y: 30 }, 420),
  ];
  ghostTilesMoved = 0;
  decisionInFlight = false;
}

function resetGame(full) {
  if (full) {
    score = 0;
    lives = 3;
  }
  resetGrid();
  resetActors();
  scaredTimer = 0;
  gameState = "ready";
  msgEl.textContent = "Press an arrow key to start";
  scoreEl.textContent = score;
  renderLives();
}

// Render the stat-bar life dots (plus the hidden numeric fallback).
function renderLives() {
  livesEl.textContent = lives;
  const row = document.getElementById("livesRow");
  if (row)
    row.innerHTML = "<span class=\"lifeDot\"></span>".repeat(
      Math.max(0, Math.min(5, lives)),
    );
}

// ---------------- Movement helpers ----------------
function isWall(tx, ty) {
  tx = (tx + COLS) % COLS;
  ty = (ty + ROWS) % ROWS; // vertical wrap (plaza top/bottom tunnels)
  const c = MAP[ty][tx];
  return c === "#" || c === "-";
}

function canMoveFromTile(tx, ty, dir) {
  const d = DIRS[dir];
  return !isWall(tx + d.x, ty + d.y);
}

function opposite(dir) {
  return { up: "down", down: "up", left: "right", right: "left" }[dir];
}

function wrapTile(t) {
  t.x = (t.x + COLS) % COLS;
  t.y = (t.y + ROWS) % ROWS; // vertical wrap (plaza top/bottom tunnels)
}

// ---------------- Pacman ----------------
function nearCenter(v) {
  return Math.abs((v % TILE) - TILE / 2) < 2;
}

function updatePacman() {
  if (
    pacman.next &&
    nearCenter(pacman.x) &&
    nearCenter(pacman.y) &&
    canMove(pacman, pacman.next)
  ) {
    pacman.x = Math.floor(pacman.x / TILE) * TILE + TILE / 2;
    pacman.y = Math.floor(pacman.y / TILE) * TILE + TILE / 2;
    pacman.dir = pacman.next;
    pacman.next = null;
  }
  const d = DIRS[pacman.dir];
  pacman.x += d.x * pacman.speed * gameSpeed;
  pacman.y += d.y * pacman.speed * gameSpeed;

  if (pacman.x < -TILE / 2) pacman.x = COLS * TILE + TILE / 2 - 1;
  if (pacman.x > COLS * TILE + TILE / 2) pacman.x = -TILE / 2 + 1;
  if (pacman.y < -TILE / 2) pacman.y = ROWS * TILE + TILE / 2 - 1; // vertical wrap
  if (pacman.y > ROWS * TILE + TILE / 2) pacman.y = -TILE / 2 + 1;

  if (
    !canMove(pacman, pacman.dir) &&
    nearCenter(pacman.x) &&
    nearCenter(pacman.y)
  ) {
    pacman.x = Math.floor(pacman.x / TILE) * TILE + TILE / 2;
    pacman.y = Math.floor(pacman.y / TILE) * TILE + TILE / 2;
    // Pac-Man is parked at a wall (AI coast-stop). No tile crossings means
    // no new decisions would ever trigger — so request one periodically.
    if (pacmanAIEl.checked) {
      pacmanStallFrames++;
      if (pacmanStallFrames % 60 === 0) requestPacmanDecision();
    }
  } else {
    pacmanStallFrames = 0;
  }

  const tx = Math.floor(pacman.x / TILE),
    ty = Math.floor(pacman.y / TILE);

  // Pac-Man AI: count its own tile crossings and request a decision every
  // 2 tiles — a SEPARATE call from the ghosts' (no shared context).
  if (tx !== lastPacTile.x || ty !== lastPacTile.y) {
    lastPacTile = { x: tx, y: ty };
    pacmanTilesMoved++;
    if (pacmanTilesMoved % DECISION_EVERY_TILES === 0) requestPacmanDecision();
  }

  if (ty >= 0 && ty < ROWS && tx >= 0 && tx < COLS) {
    const cell = grid[ty][tx];
    if (cell === ".") {
      grid[ty][tx] = " ";
      score += 10;
      pellets--;
    } else if (cell === "o") {
      grid[ty][tx] = " ";
      score += 50;
      pellets--;
      scaredTimer = 480;
    }
    scoreEl.textContent = score;
    if (pellets <= 0) {
      gameState = "won";
      msgEl.textContent = "You win! Press R to restart";
    }
  }
}

function canMove(actor, dir) {
  const d = DIRS[dir];
  const tx = Math.floor(actor.x / TILE) + d.x;
  const ty = Math.floor(actor.y / TILE) + d.y;
  return !isWall(tx, ty);
}

// ---------------- Ghost decisions API ----------------
let ghostTilesMoved = 0; // total tile boundaries crossed since reset
let decisionInFlight = false; // one request at a time
let apiCallCount = 0;
let warnedNoKey = false;
let apiHealthy = true; // flipped false on API failure, true again on success

// Structured positions of every character, shared by BOTH prompts:
// { pacman: {x,y,dir}, ghosts: [{name,x,y,dir,state}] }
function positionsState() {
  return {
    pacman: {
      x: Math.floor(pacman.x / TILE),
      y: Math.floor(pacman.y / TILE),
      dir: pacman.dir,
    },
    ghosts: ghosts.map((g) => ({
      name: g.name,
      x: g.tile.x,
      y: g.tile.y,
      dir: g.dir,
      state: g.inHouse ? "in_house" : scaredTimer > 0 ? "frightened" : "hunting",
    })),
  };
}

function buildGameStatePayload() {
  return {
    maze: MAP, // 31 rows x 28 cols: '#' wall, '.' pellet, 'o' power pellet, '-' ghost door, ' ' path
    frightened: scaredTimer > 0,
    frightenedTicksLeft: scaredTimer,
    ...positionsState(),
  };
}

function buildPrompt(state) {
  const instructions = state.frightened
    ? "The ghosts are FRIGHTENED (blue). Each ghost must FLEE: pick the legal direction that maximizes distance from pacman and avoids being eaten."
    : "Each ghost must COOPERATE TO TRAP PACMAN: pick legal directions that cut off pacman's escape routes (pinky may aim ahead of pacman). No ghost may reverse into the direction it came from unless it is a dead end.";
  return (
    "You are controlling the ghosts in a Pac-Man game.\n" +
    'Map legend: # wall (impassable), . pellet, o power pellet, - ghost door, " " open path. ' +
    "Positions are tile coordinates {x: column, y: row}. The left and right edges wrap around (tunnel).\n" +
    instructions +
    "\n\n" +
    "Game state:\n" +
    JSON.stringify(state)
  );
}

// Build the /v1/decisions payload: one choice question per ghost.
// Each direction choice is annotated with the tile it leads to and whether
// it is legal, so the model can reason about walls without parsing the maze.
function buildDecisionsPayload(state) {
  const questions = ghosts.map((g) => {
    const choices = DIR_NAMES.map((dir) => {
      const nx = (g.tile.x + DIRS[dir].x + COLS) % COLS;
      const ny = g.tile.y + DIRS[dir].y;
      const legal =
        canMoveFromTile(g.tile.x, g.tile.y, dir) && dir !== opposite(g.dir);
      const px = Math.floor(pacman.x / TILE),
        py = Math.floor(pacman.y / TILE);
      const dist = Math.hypot(nx - px, ny - py).toFixed(1);
      const desc =
        (legal ? "Legal. " : "BLOCKED (wall or reversal). Do not pick. ") +
        "Leads to tile (" +
        nx +
        "," +
        ny +
        "), distance " +
        dist +
        " to pacman" +
        (state.frightened
          ? " — larger distance is better (flee)."
          : " — smaller distance is better (hunt).");
      return { value: dir, description: desc };
    });
    return {
      type: "choice",
      name: g.name,
      instructions:
        'Direction ghost "' +
        g.name +
        '" (currently at tile ' +
        g.tile.x +
        "," +
        g.tile.y +
        " heading " +
        g.dir +
        ", state: " +
        (g.inHouse
          ? "in house"
          : state.frightened
            ? "frightened — flee pacman"
            : "chasing") +
        ") should move next. Avoid blocked directions.",
      choices,
    };
  });
  return {
    input: buildPrompt(state),
    questions,
  };
}

// Defensively pull {ghostName: direction} out of a /v1/decisions response.
// Direction parser: schema-agnostic deep scan. The /v1/decisions response
// shape is not reliably documented, so instead of guessing one schema we
// recursively search the entire response for each character's decision.
const DIR_ALIASES = {
  up: "up", down: "down", left: "left", right: "right",
  north: "up", south: "down", west: "left", east: "right",
};

function normDir(v) {
  if (typeof v !== "string") return null;
  const first = v.trim().toLowerCase().split(/[\s,._-]+/)[0];
  return DIR_ALIASES[first] || null;
}

function findDirFor(name, node, depth) {
  if (node == null || depth > 10) return null;
  if (typeof node !== "object") return null;
  const entries = Array.isArray(node)
    ? node.map((v, i) => [String(i), v])
    : Object.entries(node);
  // direct property: { blinky: "up" } or { blinky: { decision: "up" } }
  for (const [k, v] of entries) {
    if (k.trim().toLowerCase() === name) {
      if (typeof v === "string") {
        const d = normDir(v);
        if (d) return d;
      } else if (v && typeof v === "object") {
        const d = anyDirIn(v, 0);
        if (d) return d;
      }
    }
  }
  // named item: any field carrying the character's name, e.g.
  // { question_name: "blinky", selected: "left" } or { q: "blinky", a: "east" }
  const isNamed = entries.some(
    ([, v]) => typeof v === "string" && v.trim().toLowerCase() === name,
  );
  if (isNamed) {
    for (const [, v] of entries) {
      const d = normDir(v);
      if (d) return d;
    }
  }
  // recurse into children
  for (const [, v] of entries) {
    const d = findDirFor(name, v, depth + 1);
    if (d) return d;
  }
  return null;
}

// find any direction-looking string value inside an object (depth-limited)
function anyDirIn(node, depth) {
  if (node == null || depth > 4 || typeof node !== "object") return null;
  const vals = Array.isArray(node) ? node : Object.values(node);
  for (const v of vals) {
    const d = normDir(v);
    if (d) return d;
  }
  for (const v of vals) {
    const d = anyDirIn(v, depth + 1);
    if (d) return d;
  }
  return null;
}

function extractDecisions(data) {
  const out = {};
  if (!data) return out;
  for (const name of [...GHOST_NAMES, "pacman"]) {
    const d = findDirFor(name, data, 0);
    if (d) out[name] = d;
  }
  return out;
}

// ---------------- Decision debug (console only) ----------------
// On-screen panel removed; unusual response shapes still log to the console.
async function requestGhostDecisions() {
  if (heuristicOnlyEl.checked) return; // heuristic mode: no API calls at all
  const provider = cardProvider("gp");
  const key = PROVIDERS[provider].key();
  if (!key) {
    if (!warnedNoKey) {
      setAIStatus(
        "no " + PROVIDERS[provider].keyLabel + " — ghosts will coast & stop",
        true,
      );
      warnedNoKey = true;
    }
    apiHealthy = false;
    return;
  }
  if (decisionInFlight) return;
  decisionInFlight = true;
  apiCallCount++;
  setAIStatus("ghosts AI [" + provider + "] thinking #" + apiCallCount + "...");
  try {
    const state = buildGameStatePayload();
    const payload = buildDecisionsPayload(state);
    const data = await callDecisions(provider, payload.input, payload.questions);
    const parsed = extractDecisions(data);
    let applied = 0;
    for (const g of ghosts) {
      const dir = parsed[g.name];
      if (DIR_NAMES.includes(dir)) {
        g.pendingDecision = dir;
        setArrow(g.name, dir); // brain card: AI's proposal
        applied++;
      }
    }
    apiHealthy = true;
    setAIStatus("ghosts AI [" + provider + "] move ✓ (" + applied + "/4)");
    if (applied === 0)
      console.warn("[pacman] unexpected decisions response shape:", data);
  } catch (err) {
    apiHealthy = false;
    setAIStatus("ghosts AI failed: " + err.message + " — coast & stop", true);
  } finally {
    decisionInFlight = false;
  }
}

// ---------------- Pac-Man AI (separate /v1/decisions call) ----------------
// Deliberately independent from the ghosts' request: each side sees the board
// and positions but NOT the other side's planned moves.
let pacmanTilesMoved = 0;
let lastPacTile = { x: 14, y: 23 };
let pacmanDecisionInFlight = false;
let pacmanStallFrames = 0; // frames parked at a wall (drives retry cadence)

function buildPacmanDecisionBody() {
  const px = Math.floor(pacman.x / TILE),
    py = Math.floor(pacman.y / TILE);
  const choices = DIR_NAMES.map((dir) => {
    const d = DIRS[dir];
    const nx = (px + d.x + COLS) % COLS;
    const ny = (py + d.y + ROWS) % ROWS;
    const legal = canMove(pacman, dir);
    const cell = legal ? MAP[ny][nx] : "#";
    const ghostDist = ghosts.length
      ? Math.min(
          ...ghosts
            .filter((g) => !g.inHouse)
            .map((g) => Math.hypot(g.tile.x - nx, g.tile.y - ny)),
        )
      : 99;
    const desc =
      (legal
        ? "Legal. Leads to (" + nx + "," + ny + "), cell: '" + cell +
          "' (. = pellet, o = power pellet), nearest ghost distance: " +
          ghostDist.toFixed(1)
        : "BLOCKED — wall. Do not pick.") +
      (scaredTimer > 0
        ? " — frightened ghosts can be eaten!"
        : " — avoid ghosts, keep distance > 2.");
    return { value: dir, description: desc };
  });
  return {
    input:
      "You ARE Pac-Man in this game. Goal: eat all pellets, survive. " +
      "Map legend: # wall, . pellet, o power pellet, - ghost door, \" \" empty. " +
      "Positions are tile coordinates {x,y}; edges wrap on rows/cols with openings. " +
      (scaredTimer > 0
        ? "Ghosts are FRIGHTENED — hunt them for bonus points if close."
        : "Ghosts are DANGEROUS — keep distance, prefer power pellets when hunted.") +
      "\n\nGame state:\n" +
      JSON.stringify({
        maze: MAP,
        ...positionsState(),
        frightenedTicksLeft: scaredTimer,
      }),
    questions: [
      {
        type: "choice",
        name: "pacman",
        instructions:
          "Direction Pac-Man should move next. Survive first, then maximize pellets eaten.",
        choices,
      },
    ],
  };
}

async function requestPacmanDecision() {
  if (!pacmanAIEl.checked || pacmanDecisionInFlight) return;
  const provider = cardProvider("pp");
  const key = PROVIDERS[provider].key();
  if (!key) {
    setAIStatus(
      "pacman AI: no " + PROVIDERS[provider].keyLabel + " — coasting",
      true,
    );
    return;
  }
  pacmanDecisionInFlight = true;
  try {
    const payload = buildPacmanDecisionBody();
    const data = await callDecisions(provider, payload.input, payload.questions);
    const parsed = extractDecisions(data);
    const dir = parsed.pacman;
    setArrow("pacman", dir); // brain card: AI's proposal
    // Queue the decision WITHOUT a receive-time legality check: the decision
    // was made up to a second ago and pacman has moved since. Legality is
    // re-checked at tile centers in updatePacman, so an illegal "turn up"
    // simply waits until the next junction where up is open.
    if (DIR_NAMES.includes(dir)) {
      pacman.next = dir; // applied at the next legal tile center
    }
  } catch (err) {
    setAIStatus(
      "pacman AI [" + provider + "] failed: " + err.message + " — coasting",
      true,
    );
  } finally {
    pacmanDecisionInFlight = false;
  }
}

pacmanAIEl.addEventListener("change", () => {
  pacmanAIEl.blur(); // keep game keys active
  pacman.next = null;
  if (!pacmanAIEl.checked) setArrow("pacman", null);
  setAIStatus(
    pacmanAIEl.checked
      ? "pacman: AI control ON (separate decisions call)"
      : "pacman: player control",
  );
});

// Local brain: chase (or flee when frightened), never reverse.
function heuristicDir(g) {
  const frightened = scaredTimer > 0;
  const options = DIR_NAMES.filter(
    (d) => d !== opposite(g.dir) && canMoveFromTile(g.tile.x, g.tile.y, d),
  );
  if (options.length === 0) return opposite(g.dir);
  const px = Math.floor(pacman.x / TILE),
    py = Math.floor(pacman.y / TILE);
  let best = options[0],
    bestScore = -Infinity;
  for (const d of options) {
    const nx = (g.tile.x + DIRS[d].x + COLS) % COLS;
    const ny = g.tile.y + DIRS[d].y;
    const dist = Math.hypot(nx - px, ny - py);
    const score = frightened ? dist : -dist + Math.random() * 0.5;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

function nextGhostDir(g) {
  // Heuristic-only mode: local brain, never the API.
  if (heuristicOnlyEl.checked) {
    const h = heuristicDir(g);
    setArrow(g.name, h); // greyed card still shows the local brain's pick
    return h;
  }
  // API mode: apply the queued decision at the first tile where it is legal.
  // The decision was made up to a second ago (latency), so it is NOT
  // discarded when illegal here — it stays queued and is retried at every
  // tile until a junction can honor it or a newer decision replaces it.
  const dec = g.pendingDecision;
  const revOk = scaredTimer > 0; // fleeing ghosts may reverse
  if (
    dec &&
    canMoveFromTile(g.tile.x, g.tile.y, dec) &&
    (dec !== opposite(g.dir) || revOk)
  ) {
    g.pendingDecision = null; // consumed
    return dec;
  }
  // else: keep dec queued — retried at the next tile
  // no consumable decision: coast in the current direction,
  // stopping when a wall is reached (resumes on the next AI decision).
  if (canMoveFromTile(g.tile.x, g.tile.y, g.dir)) return g.dir;
  return "stop";
}

// ---------------- Tile-based ghost movement ----------------
let frameCount = 0;

function updateGhosts() {
  frameCount++;
  // In API mode, if the API is failing or no ghost can move, retry
  // periodically so the ghosts resume once decisions flow again.
  const allStopped = ghosts.every((g) => g.inHouse || g.dir === "stop");
  if (!heuristicOnlyEl.checked && (!apiHealthy || allStopped)) {
    if (frameCount % 120 === 0) requestGhostDecisions();
  }
  for (const g of ghosts) {
    if (g.inHouse) {
      g.releaseTimer--;
      if (g.releaseTimer <= 0) {
        g.inHouse = false;
        g.tile = { x: 13, y: 11 }; // just above the ghost door
        g.from = { x: 13, y: 11 };
        g.dir = "left";
        g.progress = 0;
      }
      updateGhostPixels(g);
      continue;
    }

    // Stopped (API mode, hit a wall with no valid decision): wait for the
    // next AI decision or for heuristic mode to be switched on.
    if (g.dir === "stop") {
      if (heuristicOnlyEl.checked) {
        g.dir = heuristicDir(g);
      } else if (g.pendingDecision) {
        const dec = g.pendingDecision;
        if (canMoveFromTile(g.tile.x, g.tile.y, dec)) {
          g.dir = dec;
          g.pendingDecision = null; // consumed
        }
        // else: keep queued — invalid at this tile, retried next frame
      }
      updateGhostPixels(g);
    } else {
      g.progress += (1.5 / TILE) * gameSpeed; // base 1.5 px/frame, scaled by speed slider
      if (g.progress >= 1) {
        // arrived at next tile
        g.tile = { x: g.from.x + DIRS[g.dir].x, y: g.from.y + DIRS[g.dir].y };
        wrapTile(g.tile);
        g.progress -= 1;
        ghostTilesMoved++;

        if (ghostTilesMoved % DECISION_EVERY_TILES === 0) {
          requestGhostDecisions(); // async, non-blocking
        }
        g.dir = nextGhostDir(g);
        g.from = { x: g.tile.x, y: g.tile.y };
      }
      updateGhostPixels(g);
    }

    // collision with pacman
    const dist = Math.hypot(g.pixelX - pacman.x, g.pixelY - pacman.y);
    if (dist < TILE / 2) {
      if (scaredTimer > 0) {
        score += 200;
        scoreEl.textContent = score;
        g.inHouse = true;
        g.releaseTimer = 180;
        g.tile = { x: 13, y: 14 };
        g.from = { x: 13, y: 14 };
        g.dir = "left";
        g.progress = 0;
      } else {
        lives--;
        renderLives();
        if (lives <= 0) {
          gameState = "over";
          msgEl.textContent = "Game over! Press R to restart";
        } else {
          resetActors();
          scaredTimer = 0;
          msgEl.textContent = "Press an arrow key to continue";
        }
        return;
      }
    }
  }
}

function updateGhostPixels(g) {
  const d = DIRS[g.dir] || { x: 0, y: 0 }; // 'stop' has no direction
  const fx = g.from.x + d.x * g.progress;
  const fy = g.from.y + d.y * g.progress;
  g.pixelX = fx * TILE + TILE / 2;
  g.pixelY = fy * TILE + TILE / 2;
}

// ---------------- Drawing ----------------
function drawMap() {
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const c = MAP[y][x];
      if (c === "#") {
        ctx.fillStyle = "#2121de";
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
        ctx.fillStyle = "#000";
        ctx.fillRect(x * TILE + 2, y * TILE + 2, TILE - 4, TILE - 4);
        ctx.strokeStyle = "#2121de";
        ctx.lineWidth = 2;
        ctx.strokeRect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2);
      } else if (c === "-") {
        ctx.fillStyle = "#ffb8de";
        ctx.fillRect(x * TILE + 2, y * TILE + TILE / 2 - 1, TILE - 4, 2);
      } else if (grid[y][x] === ".") {
        ctx.fillStyle = "#ffb897";
        ctx.beginPath();
        ctx.arc(x * TILE + TILE / 2, y * TILE + TILE / 2, 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (grid[y][x] === "o") {
        if (Math.floor(Date.now() / 250) % 2 === 0) {
          ctx.fillStyle = "#ffb897";
          ctx.beginPath();
          ctx.arc(x * TILE + TILE / 2, y * TILE + TILE / 2, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
}

function drawPacman() {
  const angles = {
    right: 0,
    down: Math.PI / 2,
    left: Math.PI,
    up: -Math.PI / 2,
  };
  const mouth = (Math.abs(Math.sin(Date.now() / 60)) * Math.PI) / 3.5;
  ctx.fillStyle = "#ffe600";
  ctx.beginPath();
  ctx.moveTo(pacman.x, pacman.y);
  ctx.arc(
    pacman.x,
    pacman.y,
    TILE / 2 - 1,
    angles[pacman.dir] + mouth,
    angles[pacman.dir] - mouth + Math.PI * 2,
  );
  ctx.closePath();
  ctx.fill();
}

function drawGhost(g) {
  const x = g.pixelX,
    y = g.pixelY;
  const frightened = scaredTimer > 0;
  const flashing =
    frightened && scaredTimer < 120 && Math.floor(Date.now() / 150) % 2 === 0;
  ctx.fillStyle = frightened ? (flashing ? "#fff" : "#2121ff") : g.color;
  ctx.beginPath();
  ctx.arc(x, y - 2, TILE / 2 - 1, Math.PI, 0);
  ctx.lineTo(x + TILE / 2 - 1, y + TILE / 2);
  const waves = 3,
    w = (TILE - 2) / waves;
  for (let i = 0; i < waves; i++) {
    const x0 = x + TILE / 2 - 1 - i * w;
    ctx.quadraticCurveTo(x0 - w / 2, y + TILE / 2 - 5, x0 - w, y + TILE / 2);
  }
  ctx.closePath();
  ctx.fill();
  // eyes
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(x - 4, y - 3, 3, 0, Math.PI * 2);
  ctx.arc(x + 4, y - 3, 3, 0, Math.PI * 2);
  ctx.fill();
  const d = DIRS[frightened ? "left" : g.dir] || { x: 0, y: 0 }; // 'stop' eyes look straight ahead
  ctx.fillStyle = "#2121de";
  ctx.beginPath();
  ctx.arc(x - 4 + d.x * 1.5, y - 3 + d.y * 1.5, 1.7, 0, Math.PI * 2);
  ctx.arc(x + 4 + d.x * 1.5, y - 3 + d.y * 1.5, 1.7, 0, Math.PI * 2);
  ctx.fill();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawMap();
  if (gameState !== "over") drawPacman();
  for (const g of ghosts) drawGhost(g);
}

// ---------------- Loop ----------------
let started = false;
let paused = false;

function togglePause() {
  if (!started || gameState === "over" || gameState === "won") return;
  paused = !paused;
  msgEl.textContent = paused ? "Paused — press Space to resume" : "";
}

function loop() {
  updateMazeSelectEnabled(); // re-evaluate as game state changes
  updateBrainCards(); // grey/un-grey brain cards per control mode
  if (started && !paused && gameState !== "over" && gameState !== "won") {
    if (gameState === "ready") {
      gameState = "playing";
      msgEl.textContent = "";
    }
    if (scaredTimer > 0) scaredTimer--;
    updatePacman();
    if (gameState === "playing") updateGhosts();
  }
  draw();
  requestAnimationFrame(loop);
}

document.addEventListener("keydown", (e) => {
  const keyMap = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    w: "up",
    s: "down",
    a: "left",
    d: "right",
  };
  if (keyMap[e.key]) {
    e.preventDefault();
    started = true;
    if (gameState === "ready") {
      gameState = "playing";
      msgEl.textContent = "";
    }
    if (pacmanAIEl.checked) {
      // AI is driving pacman; direction keys are ignored (uncheck AI control
      // in the Jacman Brain card to take over).
      return;
    }
    pacman.next = keyMap[e.key];
  } else if (e.key === " " || e.code === "Space") {
    e.preventDefault();
    togglePause();
  } else if (e.key === "r" || e.key === "R") {
    started = false;
    paused = false;
    resetGame(true);
  }
});

// New Game button: same as pressing R — full reset on the current maze.
const newGameBtn = document.getElementById("newGameBtn");

// Game speed multiplier (slider): scales pacman + ghost movement so the game
// can be slowed down while waiting on decisions API calls.
let gameSpeed = 1;
const speedSlider = document.getElementById("speedSlider");
const speedVal = document.getElementById("speedVal");
speedSlider.addEventListener("input", () => {
  gameSpeed = parseFloat(speedSlider.value);
  speedVal.textContent = gameSpeed + "x";
});
speedSlider.addEventListener("change", () => speedSlider.blur());
newGameBtn.addEventListener("click", () => {
  started = false;
  paused = false;
  resetGame(true);
  newGameBtn.blur(); // keep arrow keys steering pacman
});

// Maze can only be switched before the game starts, while paused, or after
// game over — otherwise the dropdown is disabled.
function mazeChangeAllowed() {
  return !started || paused || gameState === "over" || gameState === "won";
}

function updateMazeSelectEnabled() {
  mazeSelect.disabled = !mazeChangeAllowed();
}

// Switching maze restarts the game on the new layout.
mazeSelect.addEventListener("change", () => {
  if (!mazeChangeAllowed()) return;
  MAP = MAZES[mazeSelect.value] || MAZES.classic;
  started = false;
  paused = false;
  resetGame(true);
  updateMazeSelectEnabled();
  updateBuildInfo();
  mazeSelect.blur(); // so arrow keys keep steering pacman, not the dropdown
});

resetGame(true);
updateMazeSelectEnabled();
updateBuildInfo();
loop();
