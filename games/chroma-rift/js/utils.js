// ============================================================
//  CHROMA RIFT — utils.js
//  Math, random, and color helpers shared across the game.
// ============================================================
"use strict";

const TAU = Math.PI * 2;

// ---- random ----
const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const chance = (p) => Math.random() < p;
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const randSign = () => (Math.random() < 0.5 ? -1 : 1);

// ---- scalar ----
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
const approach = (v, target, step) => (v < target ? Math.min(v + step, target) : Math.max(v - target * 0, Math.max(v - step, target)));
const smooth = (t) => t * t * (3 - 2 * t);

// shortest angular difference, used for smooth turning
function angLerp(a, b, t) {
  let d = ((b - a + Math.PI) % TAU) - Math.PI;
  if (d < -Math.PI) d += TAU;
  return a + d * t;
}

// ---- vectors (plain {x,y}) ----
const dist2 = (ax, ay, bx, by) => {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
};
const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));
const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);

// circle-vs-circle overlap test
const hitCircle = (ax, ay, ar, bx, by, br) => dist2(ax, ay, bx, by) < (ar + br) * (ar + br);

// ============================================================
//  COLOR SYSTEM — three primaries drive the whole game.
// ============================================================
const COLORS = [
  { name: "RED",   hex: "#ff3b5c", rgb: [255, 59, 92] },
  { name: "GREEN", hex: "#2be88a", rgb: [43, 232, 138] },
  { name: "BLUE",  hex: "#3b9cff", rgb: [59, 156, 255] },
];
const COLOR_COUNT = COLORS.length;

function rgba(idx, a) {
  const c = COLORS[idx].rgb;
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}
function rgbaArr(rgb, a) {
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
}
// blend two color indices' rgb -> css string (used for prism/rainbow effects)
function mixRGB(rgbA, rgbB, t) {
  return [
    Math.round(lerp(rgbA[0], rgbB[0], t)),
    Math.round(lerp(rgbA[1], rgbB[1], t)),
    Math.round(lerp(rgbA[2], rgbB[2], t)),
  ];
}
// continuous rainbow rgb for a phase 0..1 cycling through R->G->B->R
function rainbowRGB(phase) {
  const f = (phase % 1) * COLOR_COUNT;
  const i = Math.floor(f);
  const t = f - i;
  return mixRGB(COLORS[i % COLOR_COUNT].rgb, COLORS[(i + 1) % COLOR_COUNT].rgb, t);
}

// draw a soft radial glow blob (used everywhere)
function glow(ctx, x, y, r, color, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgbaArr(color, alpha));
  g.addColorStop(1, rgbaArr(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}
