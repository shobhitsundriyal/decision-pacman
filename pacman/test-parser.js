// Parser torture test: extractDecisions must find directions in ANY shape.
const listeners = {};
function makeEl(id) {
  return {
    id, value: "", textContent: "", className: "", checked: false, disabled: false,
    classList: { toggle() {}, add() {}, remove() {} },
    listeners: {},
    addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); },
    blur() {}, getContext: () => stubCtx, width: 448, height: 496,
  };
}
const stubCtx = new Proxy({}, { get: () => () => {} });
const els = {};
global.document = {
  getElementById: (id) => (els[id] = els[id] || makeEl(id)),
  addEventListener: () => {},
  currentScript: { src: "?" },
};
const __ss = {};
global.sessionStorage = { getItem: k => __ss[k] ?? null, setItem: (k,v) => { __ss[k]=String(v); }, removeItem: k => { delete __ss[k]; } };
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.requestAnimationFrame = () => {};
global.performance = { now: () => 0 };
global.fetch = async () => { throw new Error("unused"); };
global.console = { ...console, warn: () => {} };

const fs = require("fs");
eval(fs.readFileSync(__dirname + "/game.js", "utf8") + "\n;globalThis.P = { extractDecisions };");

const shapes = [
  ["my mock shape", { decisions: { blinky: "up", pinky: "left", inky: "down", clyde: "right", pacman: "up" } }],
  ["array of name/value", { output: [
    { name: "blinky", value: "up" }, { name: "pinky", value: "left" },
    { name: "inky", value: "down" }, { name: "clyde", value: "right" },
    { name: "pacman", value: "up" },
  ] }],
  ["question_name + selected", { results: [
    { question_name: "blinky", selected: "LEFT" },
    { question_name: "pacman", selected: " up " },
  ] }],
  ["nested deep", { data: { answers: [{ q: "blinky", a: "east" }] } }],
  ["choices wrapper", { choices: { blinky: { decision: "north" } } }],
  ["flat named objects", { blinky_dir: "up" }], // should FAIL (no exact name key) — expect missing
];

let pass = 0, fail = 0;
for (const [label, shape] of shapes) {
  const r = P.extractDecisions(shape);
  const got = [r.blinky, r.pinky, r.inky, r.clyde, r.pacman].join(",");
  console.log(label.padEnd(24), "→", got);
}
// assertions
const a = P.extractDecisions(shapes[0][1]);
const b = P.extractDecisions(shapes[1][1]);
const c = P.extractDecisions(shapes[2][1]);
const d = P.extractDecisions(shapes[3][1]);
const e = P.extractDecisions(shapes[4][1]);
const ok =
  a.blinky === "up" && a.pacman === "up" &&
  b.clyde === "right" && b.pinky === "left" &&
  c.blinky === "left" && c.pacman === "up" &&
  d.blinky === "right" &&
  e.blinky === "up";
console.log(ok ? "PARSER ✓ all shapes extracted" : "PARSER ✗ some shapes failed");
process.exit(ok ? 0 : 1);
