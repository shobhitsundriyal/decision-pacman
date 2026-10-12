// Headless smoke test: run game.js with a fake DOM and simulate gameplay,
// including toggling the heuristic checkbox in both directions.
const fs = require('fs');

const listeners = {};
function makeEl(id) {
  return {
    id,
    value: id === 'mazeSelect' ? 'classic' : '',
    textContent: '',
    className: '',
    checked: id === 'heuristicOnly' ? false : undefined,
    disabled: false,
    classList: { toggle() {}, add() {}, remove() {} },
    listeners: {},
    addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); },
    blur() {},
    click() { (this.listeners.click || []).forEach(f => f()); },
    fire(ev) { (this.listeners[ev] || []).forEach(f => f({ key: 'x', stopPropagation() {}, preventDefault() {} })); },
    getContext: () => stubCtx,
    width: 448, height: 496,
  };
}
const stubCtx = new Proxy({}, { get: () => () => {} });

const els = {};
global.document = {
  getElementById: (id) => (els[id] = els[id] || makeEl(id)),
  addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
};
const store = {};
const __ss = {};
global.sessionStorage = { getItem: k => __ss[k] ?? null, setItem: (k,v) => { __ss[k]=String(v); }, removeItem: k => { delete __ss[k]; } };
global.localStorage = {
  getItem: (k) => store[k] ?? null,
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
const rafQueue = [];
global.requestAnimationFrame = (fn) => { rafQueue.push(fn); return rafQueue.length; };
global.performance = { now: () => Date.now() };
global.fetch = async (url) => {
  if (url === '/api/key') return { ok: true, json: async () => ({ key: '' }) };
  throw new Error('network blocked in test');
};
global.console = { ...console, warn: () => {} };

// load game
const src = fs.readFileSync(__dirname + '/game.js', 'utf8');
eval(src + '\n;globalThis.G = { get ghosts(){ return ghosts; }, get gameState(){ return gameState; }, get pacman(){ return pacman; } };');

function key(k) {
  (listeners.keydown || []).forEach(f => f({
    key: k, code: k === ' ' ? 'Space' : k,
    preventDefault() {}, stopPropagation() {},
  }));
}
function frame(n = 1) {
  for (let i = 0; i < n; i++) {
    const q = rafQueue.splice(0);
    q.forEach(fn => fn());
  }
}

// silence the load-time key validation fetch failure path
frame(5);

console.log('--- start game, heuristic toggle test ---');
key('ArrowLeft'); // start game
frame(60);
const ghostDirs1 = G.ghosts.map(g => g.dir).join(',');
console.log('ghost dirs after 60 frames (API failing, checkbox OFF):', ghostDirs1);

// toggle heuristic ON
els.heuristicOnly.checked = true;
els.heuristicOnly.fire('change');
frame(60);
const ghostDirs2 = G.ghosts.map(g => g.dir).join(',');
const pix2 = G.ghosts.map(g => Math.round(g.pixelX) + ',' + Math.round(g.pixelY)).join(' | ');
console.log('after toggle ON + 60 frames:', ghostDirs2);
console.log('pixels:', pix2);

// ghosts should be MOVING in heuristic mode — verify positions change
const before = G.ghosts.map(g => g.pixelX + g.pixelY).join(',');
frame(120);
const after = G.ghosts.map(g => g.pixelX + g.pixelY).join(',');
console.log('moving in heuristic mode?', before !== after ? 'YES ✓' : 'NO ✗ — BUG');

// toggle back OFF (API mode, fetch throws → coast & stop)
els.heuristicOnly.checked = false;
els.heuristicOnly.fire('change');
frame(600); // let them run into walls
const stopped = G.ghosts.filter(g => g.dir === 'stop').length;
console.log('after toggle OFF + 600 frames: stopped ghosts:', stopped + '/4',
  '(expect some or all stopped since API fails)');
console.log('gameState:', G.gameState);
