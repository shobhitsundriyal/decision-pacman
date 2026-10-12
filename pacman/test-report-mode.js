// Test: 2-min test mode — verifies report capture, latency stats, locking.
const fs = require("fs");
const listeners = {};
function makeEl(id) {
  return {
    id, value: id === "mazeSelect" ? "classic" : "", textContent: "", className: "",
    checked: id === "heuristicOnly" ? true : undefined, disabled: false, open: true,
    classList: { toggle() {}, add() {}, remove() {} },
    listeners: {},
    addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); },
    blur() {}, fire(ev) { (this.listeners[ev] || []).forEach(f => f({ stopPropagation() {} })); },
    getContext: () => new Proxy({}, { get: () => () => {} }), width: 448, height: 496,
    innerHTML: "",
  };
}
const els = {};
global.document = {
  getElementById: (id) => (els[id] = els[id] || makeEl(id)),
  addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
  currentScript: { src: "?" },
};
const ls = {}, ss = {};
global.localStorage = { getItem: k => ls[k] ?? null, setItem: (k,v) => { ls[k]=String(v); }, removeItem: k => { delete ls[k]; } };
global.sessionStorage = { getItem: k => ss[k] ?? null, setItem: (k,v) => { ss[k]=String(v); }, removeItem: k => { delete ss[k]; } };
const rafQ = [];
global.requestAnimationFrame = fn => { rafQ.push(fn); };
global.performance = { now: () => Date.now() };
let pacCalls = 0;
global.fetch = async (url) => {
  if (String(url).includes("/v1/decisions")) {
    pacCalls++;
    for (let i = 0; i < 30; i++) await new Promise(r => setImmediate(r)); // ~sim latency
    return { ok: true, json: async () => ({ decisions: { pacman: "up" } }) };
  }
  throw new Error("unused");
};
global.console = { ...console, warn: () => {} };

eval(fs.readFileSync(__dirname + "/game.js", "utf8") +
  "\n;globalThis.G = { get ghosts(){return ghosts}, get pacman(){return pacman}, get gameState(){return gameState}, get score(){return score}, get testActive(){return testActive}, reports: () => JSON.parse(sessionStorage.getItem('pacman_test_reports')||'[]') };");

(async () => {
  // pre: pacman AI must be ON or test refuses
  els.runTestBtn.fire("click");
  const refused = !G.testActive && els.testHint.textContent.includes("Enable");
  console.log("refuses without pacman AI:", refused ? "YES ✓" : "NO ✗");

  // enable pacman AI (openai provider) and run
  els.apiKey.value = "sk-test";
  els.pacmanAI.checked = true;
  (els.pacmanAI.listeners.change || []).forEach(f => f({}));
  els.runTestBtn.fire("click");
  console.log("test started:", G.testActive ? "YES ✓" : "NO ✗");
  console.log("settings locked:", els.heuristicOnly.disabled && els.pacmanAI.disabled && els["gp-openai"].disabled ? "YES ✓" : "NO ✗");

  for (let i = 0; i < 600 && G.testActive; i++) {
    const q = rafQ.splice(0);
    q.forEach(fn => fn());
    await new Promise(r => setImmediate(r));
  }
  // stop early
  if (G.testActive) els.runTestBtn.fire("click"); // becomes Stop
  console.log("test ended:", !G.testActive ? "YES ✓" : "NO ✗");
  console.log("settings unlocked:", !els.heuristicOnly.disabled && !els.pacmanAI.disabled ? "YES ✓" : "NO ✗");

  const reps = G.reports();
  const r = reps[reps.length - 1];
  console.log("report saved:", r ? "YES ✓" : "NO ✗");
  if (r) {
    console.log("  matchup:", r.ghostBrain, "vs", r.pacBrain, "| maze:", r.maze,
      "| duration:", Math.round(r.durationMs/1000) + "s",
      "| pac:", r.pacScore, "| ghost:", r.ghostScore, "| result:", r.result);
    const lat = r.latency && r.latency.openai;
    console.log("  latency captured:", lat && lat.calls > 0 && lat.totalMs > 0 ? `YES ✓ (${lat.calls} calls, ${Math.round(lat.totalMs/lat.calls)}ms avg)` : "NO ✗ " + JSON.stringify(r.latency));
  }
  const okReport = r && r.ghostBrain === "heuristic" && r.pacBrain === "openai" &&
    Math.abs(r.latency.openai.calls - pacCalls) <= 1 && r.ghostScore === r.catches * 200;
  console.log(okReport ? "TEST MODE ✓ ALL GOOD" : "TEST MODE ✗ CHECK ABOVE");
  process.exit(okReport && refused ? 0 : 1);
})();
