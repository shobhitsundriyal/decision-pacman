// Test: mock the decisions API, enable pacman AI, verify movement is applied.
const fs = require("fs");
const listeners = {};
function makeEl(id) {
  return {
    id,
    value: id === "mazeSelect" ? "classic" : "",
    textContent: "",
    className: "",
    checked: id === "heuristicOnly" || id === "pacmanAI" ? false : undefined,
    disabled: false,
    classList: { toggle() {}, add() {}, remove() {} },
    listeners: {},
    addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); },
    blur() {},
    fire(ev) { (this.listeners[ev] || []).forEach(f => f({ stopPropagation() {} })); },
    getContext: () => stubCtx,
    width: 448, height: 496,
  };
}
const stubCtx = new Proxy({}, { get: () => () => {} });
const els = {};
global.document = {
  getElementById: (id) => (els[id] = els[id] || makeEl(id)),
  addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
  currentScript: { src: "game.js?v=test" },
};
const store = {};
global.localStorage = {
  getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; },
};
const rafQueue = [];
global.requestAnimationFrame = fn => { rafQueue.push(fn); };
global.performance = { now: () => Date.now() };

// MOCK: always tell pacman to go UP; ghosts go LEFT
let pacmanCalls = 0, ghostCalls = 0;
global.fetch = async (url) => {
  if (String(url).includes("/v1/decisions")) {
    // need to inspect body — fetch mock receives init as 2nd arg; capture it
  }
  throw new Error("unused");
};
// wrap: game calls fetch(url, init) — rebind with init capture
global.fetch = async (url, init) => {
  const body = init && init.body ? JSON.parse(init.body) : null;
  const q = body && body.questions && body.questions[0];
  if (q && q.name === "pacman") {
    pacmanCalls++;
    // simulate ~0.75s API latency: pacman travels ~5 tiles meanwhile
    for (let i = 0; i < 45; i++) await new Promise(r => setImmediate(r));
    return { ok: true, json: async () => ({ decisions: { pacman: "up" } }) };
  }
  ghostCalls++;
  for (let i = 0; i < 45; i++) await new Promise(r => setImmediate(r)); // latency
  return { ok: true, json: async () => ({ decisions: { blinky: "up", pinky: "up", inky: "up", clyde: "up" } }) };
};
global.console = { ...console, warn: () => {} };

(async () => {
eval(fs.readFileSync(__dirname + "/game.js", "utf8") +
  "\n;globalThis.G = { get pacman(){return pacman}, get ghosts(){return ghosts}, get gameState(){return gameState}, get MAP(){return MAP} };");

function key(k) {
  (listeners.keydown || []).forEach(f => f({ key: k, code: k === " " ? "Space" : k, preventDefault() {}, stopPropagation() {} }));
}
async function frame(n = 1) {
  for (let i = 0; i < n; i++) {
    const q = rafQueue.splice(0);
    q.forEach(fn => fn());
    await new Promise(r => setImmediate(r)); // let microtasks/awaited fetches resolve
  }
}

await frame(3);
// enable pacman AI, set a key so calls can be made
els.apiKey.value = "sk-test";
els.pacmanAI.checked = true;
els.pacmanAI.fire("change");

key("ArrowLeft"); // starts the game
console.log("pacman start:", Math.round(G.pacman.x), Math.round(G.pacman.y), "dir:", G.pacman.dir);

await frame(300); // ~5 seconds: pacman travels left along row 23, calls every 2 tiles

console.log("pacman calls:", pacmanCalls, "| ghost calls:", ghostCalls);
console.log("pacman now:", Math.round(G.pacman.x), Math.round(G.pacman.y), "dir:", G.pacman.dir, "next:", G.pacman.next);
// Did pacman ever turn UP? (row 23 -> row 22 area is walls at cols 10-17, but
// cols 6-9 are open upward; over 300 frames pacman should reach col ~6-8)
const turnedUp = G.pacman.dir === "up" || G.pacman.y < 23 * 16 + 8 - 4;
console.log("pacman applied AI movement (turned up or y moved)?", turnedUp ? "YES ✓" : "NO ✗ — BUG");
// ghosts: any ghost that got out of the house should eventually go up
const ghostUp = G.ghosts.filter(g => !g.inHouse && (g.dir === "up" || g.tile.y < 11));
console.log("ghosts following AI 'up' decisions?", ghostUp.length > 0 ? "YES ✓ (" + ghostUp.length + ")" : "NO ✗ — BUG",
  "| dirs:", G.ghosts.map(g => g.inHouse ? "house" : g.dir).join(","));
})();
