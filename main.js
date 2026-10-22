// Canopy Chase — rendering, input, UI
(function () {
'use strict';
const { Game, DIRS, CHASERS, FRUITS } = CC;
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const LS = { get: (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
const isTouch = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;
const S = { screen: 'title', ctrl: LS.get('cc_ctrl', 'stick'), csize: LS.get('cc_csize', 'L'), hand: LS.get('cc_hand', 'right'), vib: LS.get('cc_vib', true), sound: LS.get('cc_sound', true), best: LS.get('cc_high', 0), bestLevel: LS.get('cc_bestlvl', 1) };
let game = new Game(MAZES, { high: S.best, seed: (Date.now() & 0xffff) + 1 });
let VW = 0, VH = 0, DPR = 1, L = {}, mazeCache = null, bgCache = null, T0 = performance.now(), now = 0;
const parts = [], floats = []; let shake = 0, flash = 0, lastDir = null;
SND.setOn(S.sound);

// ---------- seeded helpers ----------
function hash(x, y, s) { let h = (x * 374761393 + y * 668265263 + (s || 0) * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
const THEMES = [
  { floor: '#15210f', floor2: '#1b2a14', stone: '#5d6a55', hi: '#8f9c7c', lo: '#38412f', moss: '#5c9e2e', vine: '#2f7a2a', accent: '#d9b64a' },
  { floor: '#1a160f', floor2: '#221d13', stone: '#6f5f48', hi: '#a48e66', lo: '#433829', moss: '#6a9a2c', vine: '#3c7f2a', accent: '#d07a3a' },
  { floor: '#0e1a20', floor2: '#12232a', stone: '#4f6670', hi: '#7f9aa3', lo: '#2c3d44', moss: '#3fa07a', vine: '#2b7f6a', accent: '#4fd0c0' },
];

// ---------- layout ----------
function layout() {
  DPR = Math.min(3, window.devicePixelRatio || 1); VW = window.innerWidth; VH = window.innerHeight;
  cv.width = Math.round(VW * DPR); cv.height = Math.round(VH * DPR); cv.style.width = VW + 'px'; cv.style.height = VH + 'px';
  const portrait = VH >= VW * 1.1, hud = 58, foot = 34, W = 19, H = 21;
  let T, mx, my, pad = null, zone = null;
  const ctl = S.ctrl !== 'swipe', D = { S: 140, M: 165, L: 190 }[S.csize] || 190;
  if (portrait) {
    const want = ctl ? D + 28 : 0; // dedicated control strip below the footer
    T = Math.floor(Math.min((VW - 10) / W, (VH - hud - foot - want - 6) / H));
    mx = Math.round((VW - T * W) / 2); my = hud;
    if (ctl) { const top = my + T * H + foot, hgt = VH - top, r = Math.min(D / 2, hgt / 2 - 8, VW * 0.3);
      const side = S.hand === 'left' ? -1 : 1, cx = S.ctrl === 'stick' ? VW / 2 + side * Math.min(VW * 0.22, VW / 2 - r - 18) : VW / 2 + side * Math.min(VW * 0.18, VW / 2 - r - 18);
      zone = { x: 0, y: top, w: VW, h: hgt }; pad = { x: cx, y: top + hgt / 2, r, hx: cx, hy: top + hgt / 2 }; }
  } else {
    T = Math.floor(Math.min((VH - hud - foot) / H, (VW - 20) / W)); mx = Math.round((VW - T * W) / 2); my = hud;
    if (ctl) { const space = (S.hand === 'left' ? mx : VW - mx - T * W) - 20, r = Math.min(D / 2, space / 2 - 6, VH * 0.3);
      if (r > 50) { const zx = S.hand === 'left' ? 0 : mx + T * W, zw = S.hand === 'left' ? mx : VW - zx; zone = { x: zx, y: hud, w: zw, h: VH - hud }; const cx = zx + zw / 2, cy = VH - r - 40; pad = { x: cx, y: cy, r, hx: cx, hy: cy }; } }
  }
  L = { T, mx, my, W, H, portrait, hud, foot, pad, zone, footY: my + T * H + 4 };
  mazeCache = null; bgCache = null;
}
window.addEventListener('resize', layout);

// ---------- static art: background + maze ----------
function leaf(c, x, y, len, ang, col, w) {
  c.save(); c.translate(x, y); c.rotate(ang); c.fillStyle = col; c.beginPath(); c.moveTo(0, 0);
  c.quadraticCurveTo(len * 0.5, -len * (w || 0.32), len, 0); c.quadraticCurveTo(len * 0.5, len * (w || 0.32), 0, 0); c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = Math.max(1, len / 40); c.beginPath(); c.moveTo(0, 0); c.lineTo(len * 0.95, 0); c.stroke(); c.restore();
}
function makeBg() {
  const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height; const g = c.getContext('2d'); g.scale(DPR, DPR);
  const gr = g.createLinearGradient(0, 0, 0, VH); gr.addColorStop(0, '#0a1a10'); gr.addColorStop(0.5, '#0e2414'); gr.addColorStop(1, '#07130a'); g.fillStyle = gr; g.fillRect(0, 0, VW, VH);
  // distant light shafts
  g.globalAlpha = 0.06; g.fillStyle = '#d8f0a0';
  for (let i = 0; i < 4; i++) { const x = VW * (0.15 + i * 0.25); g.beginPath(); g.moveTo(x - 20, 0); g.lineTo(x + 30, 0); g.lineTo(x + 120, VH); g.lineTo(x + 40, VH); g.fill(); }
  g.globalAlpha = 1;
  // foliage frame
  const cols = ['#123d1a', '#17501f', '#1d6326', '#0f3315'];
  for (let i = 0; i < 70; i++) {
    const side = i % 4, r = hash(i, 3, 9), r2 = hash(i, 7, 2);
    let x, y, a; const len = 40 + r2 * 70;
    if (side === 0) { x = r * VW; y = -5; a = Math.PI / 2 + (r2 - 0.5) * 1.6; }
    else if (side === 1) { x = r * VW; y = VH + 5; a = -Math.PI / 2 + (r2 - 0.5) * 1.6; }
    else if (side === 2) { x = -5; y = r * VH; a = (r2 - 0.5) * 1.6; }
    else { x = VW + 5; y = r * VH; a = Math.PI + (r2 - 0.5) * 1.6; }
    leaf(g, x, y, len, a, cols[i % 4], 0.3);
  }
  return c;
}
function makeMaze() {
  const T = L.T, W = L.W, H = L.H, th = THEMES[game.mazeIndex()], rows = game.maze.rows;
  const c = document.createElement('canvas'); c.width = Math.ceil(T * W * DPR); c.height = Math.ceil(T * H * DPR); const g = c.getContext('2d'); g.scale(DPR, DPR);
  const wall = (x, y) => y < 0 || y >= H || x < 0 || x >= W ? (y >= 0 && y < H && rows[y][0] !== '#' ? false : true) : rows[y][x] === '#';
  // floor
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    g.fillStyle = hash(x, y, 1) < 0.5 ? th.floor : th.floor2; g.fillRect(x * T, y * T, T + 0.5, T + 0.5);
    if (!wall(x, y) && hash(x, y, 4) < 0.3) { g.fillStyle = 'rgba(120,160,60,0.10)'; g.beginPath(); g.arc(x * T + hash(x, y, 5) * T, y * T + hash(x, y, 6) * T, T * 0.12, 0, 7); g.fill(); }
  }
  // den floor
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (rows[y][x] === 'H') { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x * T, y * T, T, T); }
  // walls: inset stone blocks that merge with neighbours
  const ins = Math.max(2, T * 0.21);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!wall(x, y)) continue;
    const l = wall(x - 1, y), r = wall(x + 1, y), u = wall(x, y - 1), d = wall(x, y + 1);
    const x0 = x * T + (l ? 0 : ins), x1 = (x + 1) * T - (r ? 0 : ins), y0 = y * T + (u ? 0 : ins), y1 = (y + 1) * T - (d ? 0 : ins);
    g.fillStyle = th.lo; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.fillStyle = th.stone; g.fillRect(x0, y0, x1 - x0, y1 - y0 - (d ? 0 : T * 0.14));
    // brick seams
    g.strokeStyle = 'rgba(0,0,0,0.28)'; g.lineWidth = 1; g.beginPath();
    const off = (y % 2) * T * 0.5; g.moveTo(x0, y * T + T * 0.5); g.lineTo(x1, y * T + T * 0.5);
    const sx = x * T + ((x + y) % 2 ? T * 0.25 : T * 0.75); g.moveTo(sx, y0 + 1); g.lineTo(sx, y * T + T * 0.5);
    g.stroke();
    // edge highlights
    g.fillStyle = th.hi; if (!u) g.fillRect(x0, y0, x1 - x0, Math.max(1, T * 0.1)); if (!l) g.fillRect(x0, y0, Math.max(1, T * 0.08), y1 - y0 - (d ? 0 : T * 0.14));
    // cracks & glyphs
    if (hash(x, y, 8) < 0.1 && T > 12) { g.strokeStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.moveTo(x * T + T * 0.3, y * T + T * 0.2); g.lineTo(x * T + T * 0.5, y * T + T * 0.45); g.lineTo(x * T + T * 0.4, y * T + T * 0.7); g.stroke(); }
    if (u && d && l && r && hash(x, y, 11) < 0.25) { g.strokeStyle = th.accent; g.globalAlpha = 0.35; g.lineWidth = Math.max(1, T * 0.07); g.beginPath(); const cx = x * T + T / 2, cy = y * T + T / 2; g.arc(cx, cy, T * 0.22, 0, 7); g.moveTo(cx - T * 0.1, cy); g.lineTo(cx + T * 0.1, cy); g.stroke(); g.globalAlpha = 1; }
  }
  // moss on exposed tops
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!wall(x, y) || wall(x, y - 1)) continue;
    g.fillStyle = th.moss; const y0 = y * T + ins;
    for (let k = 0; k < 4; k++) { const bx = x * T + (k + 0.5) * T / 4; g.beginPath(); g.arc(bx, y0 + 0.5, T * (0.08 + hash(x, k, y) * 0.07), 0, 7); g.fill(); }
  }
  // hanging vines + leaves
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!wall(x, y) || wall(x, y + 1) || y >= H - 1 || hash(x, y, 13) > 0.32) continue;
    const vx = x * T + T * (0.25 + hash(x, y, 14) * 0.5), vy = (y + 1) * T - ins, len = T * (0.35 + hash(x, y, 15) * 0.4);
    g.strokeStyle = th.vine; g.lineWidth = Math.max(1.2, T * 0.08); g.beginPath(); g.moveTo(vx, vy - T * 0.15); g.quadraticCurveTo(vx + T * 0.12, vy + len * 0.5, vx, vy + len); g.stroke();
    leaf(g, vx, vy + len, T * 0.28, Math.PI / 2 + 0.6, th.moss, 0.4); leaf(g, vx, vy + len * 0.5, T * 0.22, -0.4, th.vine, 0.4);
  }
  // leaf clusters on wall corners
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (wall(x, y) && hash(x, y, 21) < 0.12) for (let k = 0; k < 3; k++) leaf(g, x * T + T / 2, y * T + T / 2, T * 0.45, hash(x, y, k) * 6.3, k % 2 ? th.moss : th.vine, 0.35);
  // den gate: wooden bars + vines
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (rows[y][x] === '-') { g.fillStyle = '#7a5a32'; g.fillRect(x * T - T * 0.1, y * T + T * 0.38, T * 1.2, T * 0.24); g.fillStyle = '#a07a44'; g.fillRect(x * T - T * 0.1, y * T + T * 0.38, T * 1.2, T * 0.08); }
  return c;
}

// ---------- sprites ----------
const ANG = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
function drawMonkey(g, x, y, r, dir, open, t, dying) {
  g.save(); g.translate(x, y);
  const flip = dir === 'left'; const rot = dir === 'up' ? -Math.PI / 2 : dir === 'down' ? Math.PI / 2 : 0;
  if (flip) g.scale(-1, 1); g.rotate(rot);
  if (dying) { g.rotate(dying * 8); g.scale(1 - dying * 0.7, 1 - dying * 0.7); }
  // tail
  g.strokeStyle = '#6b3e1c'; g.lineWidth = r * 0.22; g.lineCap = 'round'; g.beginPath(); g.moveTo(-r * 0.7, r * 0.3); g.bezierCurveTo(-r * 1.5, r * 0.5, -r * 1.5, -r * 0.6, -r * 1.05, -r * 0.55 + Math.sin(t * 8) * r * 0.1); g.stroke();
  // ears
  for (const s of [-1, 1]) { g.fillStyle = '#7a4520'; g.beginPath(); g.arc(-r * 0.1, s * r * 0.9, r * 0.36, 0, 7); g.fill(); g.fillStyle = '#e8b98a'; g.beginPath(); g.arc(-r * 0.1, s * r * 0.9, r * 0.2, 0, 7); g.fill(); }
  // head with chomp wedge
  const m = Math.max(0.02, open) * 0.75;
  g.fillStyle = '#8b5226'; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, r, m, Math.PI * 2 - m); g.closePath(); g.fill();
  // face mask
  g.fillStyle = '#f0c896'; g.beginPath(); g.ellipse(r * 0.28, 0, r * 0.62, r * 0.72, 0, m * 0.6 + 0.05, Math.PI * 2 - m * 0.6 - 0.05); g.lineTo(r * 0.1, 0); g.closePath(); g.fill();
  // mouth interior
  g.fillStyle = '#5a1414'; g.beginPath(); g.moveTo(r * 0.05, 0); g.arc(0, 0, r * 0.9, -m * 0.85, m * 0.85); g.closePath(); g.fill();
  // eyes (above mouth)
  g.fillStyle = '#fff'; g.beginPath(); g.arc(r * 0.35, -r * 0.42, r * 0.2, 0, 7); g.fill();
  g.fillStyle = '#1a0e06'; g.beginPath(); g.arc(r * 0.42, -r * 0.42, r * 0.11, 0, 7); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(r * 0.45, -r * 0.46, r * 0.04, 0, 7); g.fill();
  // brow + tuft
  g.fillStyle = '#6b3e1c'; g.beginPath(); g.arc(-r * 0.35, -r * 0.85, r * 0.22, 0, 7); g.arc(-r * 0.05, -r * 0.95, r * 0.18, 0, 7); g.fill();
  g.restore();
}
const CH = {
  jaguar: { body: '#e3a33a', dark: '#8a5a1a', light: '#f8e2b0' },
  snake: { body: '#5cc24a', dark: '#2c6e24', light: '#d6f08a' },
  croc: { body: '#3d8a5a', dark: '#1f4f33', light: '#b9d98a' },
  gorilla: { body: '#5a5560', dark: '#2a272e', light: '#a39aa8' },
};
function eyes(g, r, dir, ex, ey, sz, scared) {
  const [dx, dy] = DIRS[dir] || [0, 0];
  for (const s of [-1, 1]) {
    g.fillStyle = scared ? '#f4e8ff' : '#fff'; g.beginPath(); g.ellipse(ex + s * r * 0.33, ey, r * sz, r * sz * 1.15, 0, 0, 7); g.fill();
    if (!scared) { g.fillStyle = '#120a1a'; g.beginPath(); g.arc(ex + s * r * 0.33 + dx * r * sz * 0.45, ey + dy * r * sz * 0.5, r * sz * 0.55, 0, 7); g.fill(); }
    else { g.fillStyle = '#3a2a6a'; g.beginPath(); g.arc(ex + s * r * 0.33, ey, r * sz * 0.3, 0, 7); g.fill(); }
  }
}
function drawChaser(g, h, x, y, r, t, fr, flashW) {
  g.save(); g.translate(x, y);
  const bob = Math.sin(t * 10 + h.i * 1.7) * r * 0.06; g.translate(0, bob);
  if (h.mode === 'eyes') {
    g.globalAlpha = 0.5; g.fillStyle = '#bfe8ff'; g.beginPath(); g.arc(0, r * 0.2, r * 0.6, 0, 7); g.fill(); g.globalAlpha = 1;
    eyes(g, r, h.dir, 0, -r * 0.05, 0.28); g.restore(); return;
  }
  // shadow
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(0, r * 0.85, r * 0.8, r * 0.22, 0, 0, 7); g.fill();
  if (fr) {
    const col = flashW ? '#f2f2ff' : '#5b4bd6', dk = flashW ? '#b8b8e8' : '#3a2c9a';
    g.fillStyle = col; g.beginPath(); g.arc(0, -r * 0.1, r * 0.9, Math.PI, 0); g.lineTo(r * 0.9, r * 0.7);
    for (let k = 0; k < 4; k++) g.quadraticCurveTo(r * 0.9 - (k + 0.5) * r * 0.45, r * (0.95 + Math.sin(t * 14 + k) * 0.08), r * 0.9 - (k + 1) * r * 0.45, r * 0.7);
    g.closePath(); g.fill();
    g.fillStyle = dk; g.beginPath(); g.arc(-r * 0.62, -r * 0.82, r * 0.22, 0, 7); g.arc(r * 0.62, -r * 0.82, r * 0.22, 0, 7); g.fill();
    eyes(g, r, h.dir, 0, -r * 0.25, 0.2, true);
    g.strokeStyle = flashW ? '#d03050' : '#f4e8ff'; g.lineWidth = r * 0.1; g.beginPath(); g.moveTo(-r * 0.45, r * 0.3);
    for (let k = 0; k < 6; k++) g.lineTo(-r * 0.45 + (k + 1) * r * 0.15, r * (k % 2 ? 0.3 : 0.18)); g.stroke();
    g.restore(); return;
  }
  const c = CH[h.id];
  if (h.id === 'jaguar') {
    g.fillStyle = c.body; for (const s of [-1, 1]) { g.beginPath(); g.arc(s * r * 0.62, -r * 0.7, r * 0.3, 0, 7); g.fill(); }
    g.fillStyle = c.dark; for (const s of [-1, 1]) { g.beginPath(); g.arc(s * r * 0.62, -r * 0.7, r * 0.15, 0, 7); g.fill(); }
    g.fillStyle = c.body; g.beginPath(); g.ellipse(0, 0, r * 0.95, r * 0.88, 0, 0, 7); g.fill();
    g.fillStyle = c.dark; for (const [sx, sy] of [[-0.55, -0.2], [0.55, -0.2], [-0.3, -0.6], [0.3, -0.6], [-0.7, 0.3], [0.7, 0.3], [0, -0.75]]) { g.beginPath(); g.arc(sx * r, sy * r, r * 0.1, 0, 7); g.fill(); }
    g.fillStyle = c.light; g.beginPath(); g.ellipse(0, r * 0.38, r * 0.45, r * 0.35, 0, 0, 7); g.fill();
    g.fillStyle = '#3a1c10'; g.beginPath(); g.moveTo(-r * 0.12, r * 0.18); g.lineTo(r * 0.12, r * 0.18); g.lineTo(0, r * 0.32); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(-r * 0.2, r * 0.5); g.lineTo(-r * 0.13, r * 0.68); g.lineTo(-r * 0.06, r * 0.5); g.moveTo(r * 0.2, r * 0.5); g.lineTo(r * 0.13, r * 0.68); g.lineTo(r * 0.06, r * 0.5); g.fill();
    eyes(g, r, h.dir, 0, -r * 0.2, 0.2);
    g.fillStyle = '#e8d040'; for (const s of [-1, 1]) { g.globalAlpha = 0.5; g.beginPath(); g.arc(s * r * 0.33, -r * 0.2, r * 0.22, 0, 7); g.fill(); } g.globalAlpha = 1; eyes(g, r, h.dir, 0, -r * 0.2, 0.17);
  } else if (h.id === 'snake') {
    g.fillStyle = c.dark; g.beginPath(); g.ellipse(0, r * 0.45, r * 0.95, r * 0.45, 0, 0, 7); g.fill();
    g.fillStyle = c.body; g.beginPath(); g.ellipse(0, r * 0.35, r * 0.8, r * 0.35, 0, 0, 7); g.fill();
    g.fillStyle = c.dark; g.beginPath(); g.ellipse(0, r * 0.05, r * 0.6, r * 0.3, 0, 0, 7); g.fill();
    g.fillStyle = c.body; g.beginPath(); g.ellipse(0, -0.02 * r, r * 0.5, r * 0.24, 0, 0, 7); g.fill();
    // head raised
    g.fillStyle = c.body; g.beginPath(); g.ellipse(0, -r * 0.45, r * 0.62, r * 0.5, 0, 0, 7); g.fill();
    g.fillStyle = c.light; g.beginPath(); g.ellipse(0, -r * 0.25, r * 0.35, r * 0.2, 0, 0, 7); g.fill();
    g.fillStyle = c.dark; for (const s of [-1, 1]) { g.beginPath(); g.arc(s * r * 0.2, -r * 0.75, r * 0.08, 0, 7); g.fill(); }
    if (Math.sin(t * 9 + h.i) > 0) { g.strokeStyle = '#e0304a'; g.lineWidth = r * 0.08; g.beginPath(); g.moveTo(0, -r * 0.05); g.lineTo(0, r * 0.18); g.lineTo(-r * 0.08, r * 0.28); g.moveTo(0, r * 0.18); g.lineTo(r * 0.08, r * 0.28); g.stroke(); }
    eyes(g, r, h.dir, 0, -r * 0.52, 0.18);
  } else if (h.id === 'croc') {
    g.fillStyle = c.dark; g.beginPath(); g.ellipse(0, -r * 0.1, r * 0.9, r * 0.75, 0, 0, 7); g.fill();
    g.fillStyle = c.body; g.beginPath(); g.roundRect ? g.roundRect(-r * 0.55, -r * 0.35, r * 1.1, r * 1.2, r * 0.4) : g.rect(-r * 0.55, -r * 0.35, r * 1.1, r * 1.2); g.fill();
    g.fillStyle = '#fff'; for (let k = 0; k < 5; k++) { const yy = -r * 0.15 + k * r * 0.22; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * r * 0.55, yy); g.lineTo(s * r * 0.7, yy + r * 0.08); g.lineTo(s * r * 0.55, yy + r * 0.16); g.fill(); } }
    g.fillStyle = c.dark; for (const s of [-1, 1]) { g.beginPath(); g.arc(s * r * 0.15, r * 0.7, r * 0.07, 0, 7); g.fill(); }
    g.fillStyle = c.body; for (const s of [-1, 1]) { g.beginPath(); g.arc(s * r * 0.4, -r * 0.55, r * 0.3, 0, 7); g.fill(); }
    g.fillStyle = c.dark; for (let k = -2; k <= 2; k++) { g.beginPath(); g.arc(k * r * 0.22, -r * 0.85, r * 0.08, 0, 7); g.fill(); }
    eyes(g, r, h.dir, 0, -r * 0.55, 0.19);
  } else {
    g.fillStyle = c.dark; g.beginPath(); g.ellipse(0, r * 0.05, r * 0.98, r * 0.9, 0, 0, 7); g.fill();
    for (const s of [-1, 1]) { g.beginPath(); g.arc(s * r * 0.85, -r * 0.05, r * 0.22, 0, 7); g.fill(); }
    g.fillStyle = c.light; g.beginPath(); g.ellipse(0, r * 0.12, r * 0.62, r * 0.6, 0, 0, 7); g.fill();
    g.fillStyle = c.dark; g.beginPath(); g.ellipse(0, -r * 0.32, r * 0.66, r * 0.16, 0, 0, 7); g.fill();
    g.fillStyle = c.body; g.beginPath(); g.ellipse(0, r * 0.4, r * 0.4, r * 0.25, 0, 0, 7); g.fill();
    g.fillStyle = '#1a1820'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * r * 0.12, r * 0.35, r * 0.07, r * 0.05, 0, 0, 7); g.fill(); }
    g.strokeStyle = '#1a1820'; g.lineWidth = r * 0.06; g.beginPath(); g.moveTo(-r * 0.2, r * 0.56); g.lineTo(r * 0.2, r * 0.56); g.stroke();
    eyes(g, r, h.dir, 0, -r * 0.12, 0.16);
  }
  g.restore();
}
function drawBanana(g, x, y, r, t) {
  g.save(); g.translate(x, y); g.rotate(Math.sin(t * 3) * 0.2); const s = 1 + Math.sin(t * 6) * 0.08; g.scale(s, s);
  const glow = g.createRadialGradient(0, 0, 0, 0, 0, r * 1.6); glow.addColorStop(0, 'rgba(255,220,80,0.55)'); glow.addColorStop(1, 'rgba(255,220,80,0)'); g.fillStyle = glow; g.beginPath(); g.arc(0, 0, r * 1.6, 0, 7); g.fill();
  g.fillStyle = '#ffd43a'; g.beginPath(); g.arc(-r * 0.25, -r * 0.25, r * 0.95, 0.15, 1.75); g.arc(-r * 0.55, -r * 0.55, r * 0.95, 1.55, 0.35, true); g.closePath(); g.fill();
  g.strokeStyle = '#a3701a'; g.lineWidth = r * 0.12; g.beginPath(); g.arc(-r * 0.25, -r * 0.25, r * 0.95, 0.3, 1.6); g.stroke();
  g.fillStyle = '#5a3a10'; g.fillRect(r * 0.55, -r * 0.2, r * 0.18, r * 0.22);
  g.fillStyle = '#fff'; g.globalAlpha = 0.7 + Math.sin(t * 9) * 0.3; g.beginPath(); g.arc(-r * 0.1, r * 0.2, r * 0.1, 0, 7); g.fill();
  g.restore();
}
function drawFruit(g, kind, x, y, r) {
  g.save(); g.translate(x, y);
  const col = ['#ff9a2e', '#ff7a3a', '#8a5a34', '#ff3c8a', '#f3c02a', '#f6e04a', '#e8b030'][kind];
  if (kind === 4) { // pineapple
    g.fillStyle = '#3c9a2a'; for (let k = -2; k <= 2; k++) leaf(g, 0, -r * 0.4, r * 0.7, -Math.PI / 2 + k * 0.35, '#3c9a2a', 0.3);
    g.fillStyle = col; g.beginPath(); g.ellipse(0, r * 0.2, r * 0.55, r * 0.72, 0, 0, 7); g.fill();
    g.strokeStyle = '#9a6a10'; g.lineWidth = 1; for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(-r * 0.55, r * 0.2 + k * r * 0.3); g.lineTo(r * 0.55, r * 0.2 + k * r * 0.3 + r * 0.3); g.stroke(); }
  } else if (kind === 5) { g.fillStyle = col; g.beginPath(); for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5 - Math.PI / 2, rr = k % 2 ? r * 0.42 : r * 0.95; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.fill(); }
  else if (kind === 6) { g.fillStyle = col; g.fillRect(-r * 0.5, -r * 0.2, r, r * 0.9); g.beginPath(); g.arc(0, -r * 0.2, r * 0.5, Math.PI, 0); g.fill(); g.fillStyle = '#7a4a10'; g.fillRect(-r * 0.25, -r * 0.2, r * 0.15, r * 0.15); g.fillRect(r * 0.1, -r * 0.2, r * 0.15, r * 0.15); g.fillRect(-r * 0.2, r * 0.25, r * 0.4, r * 0.08); }
  else {
    g.fillStyle = col; g.beginPath(); g.ellipse(0, r * 0.1, r * 0.75, r * 0.8, kind === 0 ? 0.5 : 0, 0, 7); g.fill();
    if (kind === 3) { g.fillStyle = '#7ad04a'; for (let k = 0; k < 5; k++) leaf(g, 0, r * 0.1, r * 0.55, k * 1.25, '#7ad04a', 0.25); g.fillStyle = col; g.beginPath(); g.ellipse(0, r * 0.1, r * 0.5, r * 0.55, 0, 0, 7); g.fill(); }
    if (kind === 2) { g.fillStyle = '#3a2410'; for (const [a, b] of [[-0.2, -0.2], [0.2, -0.2], [0, 0.1]]) { g.beginPath(); g.arc(a * r, b * r, r * 0.1, 0, 7); g.fill(); } }
    else { g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.arc(-r * 0.3, -r * 0.15, r * 0.15, 0, 7); g.fill(); leaf(g, 0, -r * 0.6, r * 0.6, -1.0, '#3c9a2a', 0.35); }
  }
  g.restore();
}

// ---------- particles ----------
function burst(x, y, n, cols, sp, life, sz) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, v = sp * (0.3 + Math.random()); parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.6 + Math.random() * 0.6), max: life, col: cols[i % cols.length], sz: sz * (0.6 + Math.random() * 0.8), leaf: Math.random() < 0.4, rot: Math.random() * 6 }); } }
const flies = Array.from({ length: 22 }, (_, i) => ({ x: Math.random(), y: Math.random(), p: Math.random() * 6 }));

// ---------- UI buttons ----------
let buttons = [];
function button(id, label, x, y, w, h, style) { buttons.push({ id, label, x, y, w, h, style }); }
function drawButtons() {
  for (const b of buttons) {
    ctx.save(); const r = Math.min(14, b.h / 2);
    ctx.fillStyle = b.style === 'primary' ? '#e8b030' : b.style === 'icon' ? 'rgba(10,30,14,0.75)' : 'rgba(26,60,30,0.92)';
    ctx.strokeStyle = b.style === 'primary' ? '#fff2b0' : '#6fae4a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, r); ctx.fill(); ctx.stroke();
    ctx.fillStyle = b.style === 'primary' ? '#2a1a04' : '#e9f6d6'; ctx.font = `800 ${Math.round(b.h * (b.style === 'icon' ? 0.5 : 0.42))}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1); ctx.restore();
  }
}
function txt(s, x, y, size, col, align, weight) { ctx.font = `${weight || 800} ${size}px system-ui,sans-serif`; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = Math.max(3, size / 5); ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); ctx.fillStyle = col; ctx.fillText(s, x, y); }

// ---------- main draw ----------
function draw() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (!bgCache) bgCache = makeBg(); ctx.drawImage(bgCache, 0, 0, VW, VH);
  // fireflies
  for (const f of flies) { const x = (f.x * VW + Math.sin(now * 0.4 + f.p) * 30) % VW, y = (f.y * VH + Math.cos(now * 0.3 + f.p) * 20); const a = 0.3 + 0.5 * Math.max(0, Math.sin(now * 2 + f.p * 3)); ctx.fillStyle = `rgba(220,255,120,${a})`; ctx.beginPath(); ctx.arc(x, y, 1.8, 0, 7); ctx.fill(); }
  buttons = [];
  if (S.screen === 'title') drawTitle();
  else drawPlay();
  if (S.screen === 'paused') drawPause();
  if (S.screen === 'over') drawOver();
  if (S.overlay === 'settings') drawSettings();
  if (PAD.on) drawPadHints();
}
// ---------- Xbox controller (standard mapping) ----------
const PAD = { on: false, prev: [], dir: null, navT: 0, focus: 0 };
function glyph(kind, x, y, r) {
  const C = { A: '#3cb44a', B: '#e0403a', X: '#3a7ae0', Y: '#e8c030' };
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = C[kind] || '#3a3f48'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1.2, r * 0.16);
  if (kind === 'Menu') { for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(x - r * 0.45, y + i * r * 0.32); ctx.lineTo(x + r * 0.45, y + i * r * 0.32); ctx.stroke(); } }
  else if (kind === 'View') { ctx.strokeRect(x - r * 0.45, y - r * 0.32, r * 0.55, r * 0.45); ctx.strokeRect(x - r * 0.1, y - r * 0.05, r * 0.55, r * 0.45); }
  else { ctx.font = `900 ${Math.round(r * 1.25)}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(kind, x, y + 1); }
  ctx.restore();
}
function hintsFor() {
  if (S.overlay === 'settings') return [['A', 'Toggle'], ['B', 'Back']];
  if (S.screen === 'title') return [['A', 'Select'], ['View', 'Settings']];
  if (S.screen === 'play') return [['Menu', 'Pause'], ['View', 'Settings']];
  if (S.screen === 'paused') return [['A', 'Select'], ['B', 'Resume'], ['View', 'Settings']];
  if (S.screen === 'over') return [['A', 'Select'], ['B', 'Main menu']];
  return [];
}
function drawPadHints() {
  if (S.screen === 'play' && !S.overlay) { glyph('Menu', VW - 64, 30, 9); return; }
  const hs = hintsFor(); ctx.font = '700 13px system-ui,sans-serif'; let w = 0; for (const [, t] of hs) w += 26 + ctx.measureText(t).width + 16;
  let x = (VW - w) / 2; const y = VH - 18;
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.roundRect(x - 10, y - 15, w + 12, 30, 15); ctx.fill();
  for (const [k, t] of hs) { glyph(k, x + 10, y, 10); x += 26; txt(t, x, y, 13, '#e9f6d6', 'left', 700); ctx.font = '700 13px system-ui,sans-serif'; x += ctx.measureText(t).width + 16; }
  // focus ring
  const list = navButtons(); const b = list[PAD.focus % Math.max(1, list.length)];
  if (b) { ctx.save(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.shadowColor = '#ffe27a'; ctx.shadowBlur = 10; ctx.beginPath(); ctx.roundRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8, 16); ctx.stroke(); ctx.restore(); if (b.style === 'primary' || list.length) glyph('A', b.x + b.w - 14, b.y + 14, 9); }
}
function navButtons() { return S.screen === 'play' && !S.overlay ? [] : buttons.filter(b => b.id !== 'pause'); }
function drawSettings() {
  buttons = []; const w = Math.min(330, VW - 30), bh = 44, gap = 9, rows = [
    ['ctrl', 'Controls: ' + { stick: 'Stick', dpad: 'D-pad', swipe: 'Swipe only' }[S.ctrl]],
    ['csize', 'Control size: ' + { S: 'Small', M: 'Medium', L: 'Large' }[S.csize]],
    ['hand', 'Handed: ' + (S.hand === 'left' ? 'Left' : 'Right')],
    ['vib', 'Vibration: ' + (S.vib ? 'ON' : 'OFF')],
    ['sound', 'Sound: ' + (S.sound ? 'ON' : 'OFF')]];
  const hgt = 70 + (rows.length + 1) * (bh + gap) + 14, [x, y] = panel(w, hgt); txt('SETTINGS', VW / 2, y + 36, 26, '#ffe27a');
  rows.forEach(([id, label], i) => button(id, label, x + 20, y + 64 + i * (bh + gap), w - 40, bh));
  button('done', 'Done', x + 20, y + 64 + rows.length * (bh + gap) + 4, w - 40, bh, 'primary'); drawButtons();
}
function openSettings() { if (S.screen === 'play') S.screen = 'paused'; S.overlay = 'settings'; PAD.focus = 0; }
function closeOverlay() { S.overlay = null; PAD.focus = 0; }
function pollPad(dt) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : []; let gp = null;
  for (const p of pads) if (p && p.connected) { if (p.mapping === 'standard') { gp = p; break; } if (!gp) gp = p; }
  if (!gp) { PAD.on = false; return; }
  const btn = i => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5));
  const cur = gp.buttons.map((_, i) => btn(i)), old = PAD.prev; const edge = i => cur[i] && !old[i]; PAD.prev = cur;
  const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0; let d = null;
  if (btn(12)) d = 'up'; else if (btn(13)) d = 'down'; else if (btn(14)) d = 'left'; else if (btn(15)) d = 'right';
  else if (Math.hypot(ax, ay) > 0.5) d = Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? 'right' : 'left') : (ay > 0 ? 'down' : 'up');
  if (!PAD.on && (d || cur.some(Boolean))) PAD.on = true;
  if (!PAD.on) return;
  if (S.screen === 'play' && !S.overlay) {
    if (d) { if (d !== PAD.dir || (game.player.next !== d && game.player.dir !== d)) steer(d); }
    if (edge(9)) { S.screen = 'paused'; PAD.focus = 0; SND.sfx('tap'); }
    else if (edge(8)) openSettings();
  } else {
    const list = navButtons(), n = list.length;
    PAD.navT -= dt;
    if (d && n && (d !== PAD.dir || PAD.navT <= 0)) { const f = PAD.focus % n, b = list[f];
      // spatial move: nearest button in that direction
      let best = -1, bd = 1e9; list.forEach((o, i) => { if (i === f) return; const dx = (o.x + o.w / 2) - (b.x + b.w / 2), dy = (o.y + o.h / 2) - (b.y + b.h / 2);
        const ok = d === 'up' ? dy < -4 : d === 'down' ? dy > 4 : d === 'left' ? dx < -4 : dx > 4; if (!ok) return; const v = (d === 'up' || d === 'down') ? Math.abs(dy) + Math.abs(dx) * 2 : Math.abs(dx) + Math.abs(dy) * 2; if (v < bd) { bd = v; best = i; } });
      if (best >= 0) { PAD.focus = best; SND.sfx('tap'); } PAD.navT = d !== PAD.dir ? 0.35 : 0.16; }
    if (edge(0) && n) onButton(list[PAD.focus % n].id);
    else if (edge(1)) { if (S.overlay) closeOverlay(); else if (S.screen === 'paused') S.screen = 'play'; else if (S.screen === 'over') onButton('quit'); }
    else if (edge(9)) { if (S.overlay) closeOverlay(); else if (S.screen === 'paused') S.screen = 'play'; else if (S.screen === 'title' || S.screen === 'over') startGame(); }
    else if (edge(8)) { if (S.overlay) closeOverlay(); else openSettings(); }
  }
  PAD.dir = d;
}
window.addEventListener('gamepadconnected', () => { PAD.on = true; PAD.focus = 0; });
window.addEventListener('gamepaddisconnected', () => { PAD.on = false; });
function drawPlay() {
  const { T, mx, my, W, H } = L, g = game;
  if (!mazeCache || mazeCache.lvl !== g.level) { mazeCache = makeMaze(); mazeCache.lvl = g.level; }
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(mx - 3, my - 3, T * W + 6, T * H + 6);
  ctx.drawImage(mazeCache, mx, my, T * W, T * H);
  if (g.state === 'clear' && Math.floor(now * 6) % 2) { ctx.fillStyle = 'rgba(255,240,180,0.25)'; ctx.fillRect(mx, my, T * W, T * H); }
  ctx.save(); ctx.beginPath(); ctx.rect(mx, my, T * W, T * H); ctx.clip();
  const P = (x, y) => [mx + (x + 0.5) * T, my + (y + 0.5) * T];
  // seeds
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = g.grid[y][x]; if (c === '.') { const [px, py] = P(x, y); ctx.fillStyle = '#f5d98a'; ctx.beginPath(); ctx.ellipse(px, py, T * 0.12, T * 0.15, 0.6, 0, 7); ctx.fill(); ctx.fillStyle = '#fff6d0'; ctx.beginPath(); ctx.arc(px - T * 0.03, py - T * 0.04, T * 0.04, 0, 7); ctx.fill(); }
    else if (c === 'o') { const [px, py] = P(x, y); drawBanana(ctx, px, py, T * 0.42, now + x); }
  }
  if (g.fruit) { const [px, py] = P(9, 11); const a = g.fruit.t < 2 ? (Math.floor(now * 8) % 2 ? 0.4 : 1) : 1; ctx.globalAlpha = a; drawFruit(ctx, g.fruit.kind, px, py, T * 0.45); ctx.globalAlpha = 1; }
  // actors (draw twice near tunnel edges for seamless wrap)
  const R = T * 0.47;
  const dup = (x, fn) => { fn(x); if (x < 0.6) fn(x + W); if (x > W - 1.6) fn(x - W); };
  if (g.state !== 'clear' || true) for (const h of g.ghosts) {
    if (g.state === 'dying' && g.timer < 1.3) continue;
    const fl = h.fright && g.frightT < 2 && Math.floor(now * 7) % 2 === 0;
    dup(h.x, xx => { const [px, py] = P(xx, h.y); drawChaser(ctx, h, px, py, R, now, h.fright, fl); });
  }
  const p = g.player, open = g.state === 'play' ? Math.abs(Math.sin(p.mouth * Math.PI * 1.15)) : 0.35;
  const dying = g.state === 'dying' ? Math.min(1, (1.8 - g.timer) / 1.4) : 0;
  if (!(g.state === 'dying' && dying >= 1)) dup(p.x, xx => { const [px, py] = P(xx, p.y); drawMonkey(ctx, px, py, R * 0.96, p.dir, open, now, dying); });
  // particles
  for (const q of parts) { const a = Math.max(0, q.life / q.max); ctx.globalAlpha = a; ctx.fillStyle = q.col; if (q.leaf) leaf(ctx, q.x, q.y, q.sz * 2.2, q.rot, q.col, 0.35); else { ctx.beginPath(); ctx.arc(q.x, q.y, q.sz, 0, 7); ctx.fill(); } }
  ctx.globalAlpha = 1;
  for (const f of floats) { ctx.globalAlpha = Math.min(1, f.life * 2); txt(f.s, f.x, f.y, Math.round(T * 0.75), f.col); } ctx.globalAlpha = 1;
  ctx.restore();
  // ready / level banner
  if (g.state === 'ready') {
    const cy = my + T * 12.6;
    txt('LEVEL ' + g.level, mx + T * W / 2, my + T * 5.5, Math.round(T * 1.05), '#ffe27a');
    txt(g.maze.name, mx + T * W / 2, my + T * 6.5, Math.round(T * 0.62), '#bfeaa0', 'center', 700);
    txt('READY!', mx + T * W / 2, cy, Math.round(T * 0.9), '#ffe27a');
  }
  if (g.state === 'clear') txt('RUINS CLEARED!', mx + T * W / 2, my + T * 12.6, Math.round(T * 0.85), '#fff2b0');
  ctx.restore();
  // HUD
  const hy = 30;
  txt('SCORE', 14, hy - 12, 11, '#9fd07a', 'left', 700); txt(String(g.score), 14, hy + 6, 20, '#fff', 'left');
  txt('BEST', VW / 2, hy - 12, 11, '#9fd07a', 'center', 700); txt(String(Math.max(g.high, S.best)), VW / 2, hy + 6, 20, '#ffe27a');
  txt('LV ' + g.level, VW - (PAD.on ? 80 : 66), hy - 3, 15, '#bfeaa0', 'right');
  button('pause', 'II', VW - 52, hy - 19, 40, 40, 'icon');
  // footer: lives + fruit history
  const fy = L.footY + 14;
  for (let i = 0; i < Math.min(6, g.lives - (g.state === 'dying' ? 0 : 1)); i++) drawMonkey(ctx, L.mx + 14 + i * 26, fy, 9, 'right', 0.3, 0);
  for (let k = 0, l = g.level; k < Math.min(5, l); k++) drawFruit(ctx, Math.min(6, l - 1 - k), L.mx + T * W - 14 - k * 24, fy, 9);
  if (g.frightT > 0) { const w = T * 5 * g.frightT / g.frightTime(); ctx.fillStyle = '#ffd43a'; ctx.fillRect(VW / 2 - w / 2, fy - 3, w, 6); }
  // d-pad
  if (L.pad && S.screen !== 'title') (S.ctrl === 'stick' ? drawStick : drawPad)();
  drawButtons();
}
function drawStick() {
  const p = L.pad, z = L.zone; ctx.save();
  if (z && L.portrait) { ctx.fillStyle = 'rgba(4,14,6,0.45)'; ctx.fillRect(z.x, z.y, z.w, z.h); ctx.strokeStyle = 'rgba(111,174,74,0.25)'; ctx.beginPath(); ctx.moveTo(0, z.y + 0.5); ctx.lineTo(VW, z.y + 0.5); ctx.stroke(); }
  const bx = p.x, by = p.y, r = p.r;
  ctx.fillStyle = 'rgba(8,24,10,0.7)'; ctx.strokeStyle = 'rgba(140,200,100,0.55)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(bx, by, r, 0, 7); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(140,200,100,0.18)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(bx, by, r * STICK.dead, 0, 7); ctx.stroke();
  for (const [d, a] of [['up', -Math.PI / 2], ['right', 0], ['down', Math.PI / 2], ['left', Math.PI]]) {
    const on = stick.dir === d; ctx.save(); ctx.translate(bx + Math.cos(a) * r * 0.78, by + Math.sin(a) * r * 0.78); ctx.rotate(a);
    if (on) { ctx.fillStyle = 'rgba(255,212,58,0.25)'; ctx.beginPath(); ctx.moveTo(-r * 0.6, 0); ctx.arc(-r * 0.78, 0, r, -0.6, 0.6); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = on ? '#ffd43a' : 'rgba(200,230,170,0.55)'; ctx.beginPath(); ctx.moveTo(r * 0.12, 0); ctx.lineTo(-r * 0.07, -r * 0.11); ctx.lineTo(-r * 0.07, r * 0.11); ctx.fill(); ctx.restore(); }
  const kx = bx + stick.kx, ky = by + stick.ky, kr = r * 0.42;
  const gr = ctx.createRadialGradient(kx - kr * 0.3, ky - kr * 0.3, kr * 0.1, kx, ky, kr); gr.addColorStop(0, stick.id != null ? '#ffe58a' : '#9ccf6a'); gr.addColorStop(1, stick.id != null ? '#c99a1a' : '#3f7a2e');
  ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(kx, ky, kr, 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; ctx.stroke();
  if (stick.id == null && game.state === 'ready' && L.portrait) txt('Drag anywhere here to steer', VW / 2, L.zone.y + 14, 12, '#9fb88a', 'center', 600);
  ctx.restore();
}
function drawPad() {
  if (L.zone && L.portrait) { ctx.fillStyle = 'rgba(4,14,6,0.45)'; ctx.fillRect(L.zone.x, L.zone.y, L.zone.w, L.zone.h); }
  const { x, y, r } = L.pad; ctx.save();
  ctx.fillStyle = 'rgba(8,24,10,0.55)'; ctx.strokeStyle = 'rgba(140,200,100,0.45)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.stroke();
  for (const [d, a] of [['up', -Math.PI / 2], ['right', 0], ['down', Math.PI / 2], ['left', Math.PI]]) {
    const on = padActive === d, cx = x + Math.cos(a) * r * 0.6, cy = y + Math.sin(a) * r * 0.6;
    ctx.fillStyle = on ? 'rgba(255,212,58,0.95)' : 'rgba(60,110,50,0.9)'; ctx.beginPath(); ctx.arc(cx, cy, r * 0.3, 0, 7); ctx.fill();
    ctx.fillStyle = on ? '#2a1a04' : '#e9f6d6'; ctx.save(); ctx.translate(cx, cy); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(r * 0.14, 0); ctx.lineTo(-r * 0.08, -r * 0.12); ctx.lineTo(-r * 0.08, r * 0.12); ctx.fill(); ctx.restore();
  }
  ctx.fillStyle = 'rgba(140,200,100,0.35)'; ctx.beginPath(); ctx.arc(x, y, r * 0.14, 0, 7); ctx.fill();
  ctx.restore();
}
function panel(w, h) { const x = (VW - w) / 2, y = (VH - h) / 2; ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, VW, VH); ctx.fillStyle = 'rgba(14,38,18,0.97)'; ctx.strokeStyle = '#6fae4a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(x, y, w, h, 18); ctx.fill(); ctx.stroke(); return [x, y]; }
function drawPause() { buttons = buttons.filter(b => b.id !== 'pause'); const w = Math.min(320, VW - 40), [x, y] = panel(w, 270); txt('PAUSED', VW / 2, y + 40, 30, '#ffe27a'); button('resume', 'Resume', x + 24, y + 75, w - 48, 50, 'primary'); button('restart', 'Restart', x + 24, y + 137, w - 48, 46); button('quit', 'Main menu', x + 24, y + 195, w - 48, 46); drawButtons(); }
function drawOver() { buttons = buttons.filter(b => b.id !== 'pause'); const w = Math.min(330, VW - 40), [x, y] = panel(w, 300); txt('GAME OVER', VW / 2, y + 42, 32, '#ff8a5a'); txt('Score ' + game.score, VW / 2, y + 88, 22, '#fff'); txt('Reached level ' + game.level, VW / 2, y + 118, 15, '#bfeaa0', 'center', 700);
  if (S.newBest) txt('NEW BEST!', VW / 2, y + 148, 18, '#ffe27a'); button('again', 'Play again', x + 24, y + 172, w - 48, 52, 'primary'); button('quit', 'Main menu', x + 24, y + 234, w - 48, 46); drawButtons(); }
function drawTitle() {
  const cx = VW / 2, sc = Math.min(1, VW / 400, VH / 760), top = Math.max(20, VH * 0.06);
  ctx.save();
  // title logo
  const ty = top + 60 * sc;
  txt('CANOPY', cx, ty, Math.round(56 * sc), '#ffd43a', 'center', 900); txt('CHASE', cx, ty + 54 * sc, Math.round(56 * sc), '#8be05a', 'center', 900);
  leaf(ctx, cx - 150 * sc, ty - 30 * sc, 60 * sc, 0.4, '#2f8a2a'); leaf(ctx, cx + 150 * sc, ty - 30 * sc, 60 * sc, Math.PI - 0.4, '#2f8a2a');
  txt('Jungle-ruins maze chase', cx, ty + 96 * sc, Math.round(16 * sc), '#bfeaa0', 'center', 700);
  // hero row
  const hy = ty + 160 * sc; drawMonkey(ctx, cx - 120 * sc + ((now * 40) % 40) * 0, hy, 22 * sc, 'right', Math.abs(Math.sin(now * 6)), now);
  for (let k = 0; k < 4; k++) { ctx.fillStyle = '#f5d98a'; ctx.beginPath(); ctx.arc(cx - 70 * sc + k * 28 * sc, hy, 4 * sc, 0, 7); ctx.fill(); }
  drawBanana(ctx, cx + 60 * sc, hy, 14 * sc, now); drawFruit(ctx, 0, cx + 115 * sc, hy, 14 * sc);
  // cast
  const cy0 = hy + 52 * sc, rowH = 44 * sc;
  CHASERS.forEach((c, i) => { const y = cy0 + i * rowH; drawChaser(ctx, { ...c, i, mode: 'active', dir: 'right' }, cx - 95 * sc, y, 17 * sc, now, false); txt(c.name, cx - 66 * sc, y - 7 * sc, Math.round(17 * sc), Object.values(CH)[i].light, 'left'); txt(c.style, cx - 66 * sc, y + 11 * sc, Math.round(12 * sc), '#9fb88a', 'left', 600); });
  const by = cy0 + 4 * rowH + 6 * sc, bw = Math.min(280, VW - 60);
  button('play', 'PLAY', cx - bw / 2, by, bw, 58 * Math.max(0.85, sc), 'primary');
  const sh = 44 * Math.max(0.85, sc), sy = by + 58 * Math.max(0.85, sc) + 12;
  button('settings', 'Settings', cx - bw / 2, sy, bw / 2 - 6, sh); button('sound', 'Sound: ' + (S.sound ? 'ON' : 'OFF'), cx + 6, sy, bw / 2 - 6, sh);
  txt('Best ' + S.best + '  ·  ' + (PAD.on ? 'Controller connected' : 'Stick, D-pad, swipe or controller'), cx, sy + sh + 22, 13, '#9fb88a', 'center', 600);
  ctx.restore(); drawButtons();
}

// ---------- flow ----------
function startGame() {
  SND.init(); SND.sfx('start'); SND.startMusic();
  game = new Game(MAZES, { high: S.best, seed: (Date.now() & 0xffff) + 1, level: 1 }); mazeCache = null; parts.length = 0; floats.length = 0; S.newBest = false; S.screen = 'play'; layout();
  if (isTouch && !matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches && document.documentElement.requestFullscreen && !window.__noFS) document.documentElement.requestFullscreen().catch(() => {});
}
function saveBest() { if (game.score > S.best) { S.best = game.score; S.newBest = true; LS.set('cc_high', S.best); } if (game.level > S.bestLevel) { S.bestLevel = game.level; LS.set('cc_bestlvl', S.bestLevel); } }
function onButton(id) {
  SND.init(); SND.sfx('tap'); if (!['ctrl', 'csize', 'hand', 'vib', 'sound'].includes(id)) PAD.focus = 0;
  if (id === 'play' || id === 'again' || id === 'restart') startGame();
  else if (id === 'settings') openSettings();
  else if (id === 'ctrl') { S.ctrl = { stick: 'dpad', dpad: 'swipe', swipe: 'stick' }[S.ctrl]; LS.set('cc_ctrl', S.ctrl); layout(); }
  else if (id === 'csize') { S.csize = { L: 'S', S: 'M', M: 'L' }[S.csize]; LS.set('cc_csize', S.csize); layout(); }
  else if (id === 'hand') { S.hand = S.hand === 'left' ? 'right' : 'left'; LS.set('cc_hand', S.hand); layout(); }
  else if (id === 'vib') { S.vib = !S.vib; LS.set('cc_vib', S.vib); if (S.vib) buzz(20); }
  else if (id === 'sound') { S.sound = !S.sound; LS.set('cc_sound', S.sound); SND.setOn(S.sound); }
  else if (id === 'pause') { if (S.screen === 'play') S.screen = 'paused'; }
  else if (id === 'resume') S.screen = 'play';
  else if (id === 'done') closeOverlay();
  else if (id === 'quit') { saveBest(); S.screen = 'title'; SND.stopMusic(); layout(); }
}
function handleEvents() {
  const T = L.T, P = (x, y) => [L.mx + (x + 0.5) * T, L.my + (y + 0.5) * T];
  for (const e of game.events) {
    if (e.t === 'seed') SND.sfx('seed');
    else if (e.t === 'power') { SND.sfx('power'); const [x, y] = P(e.x, e.y); burst(x, y, 18, ['#ffd43a', '#fff2b0', '#7ad04a'], T * 6, 0.7, T * 0.12); flash = 0.25; }
    else if (e.t === 'eatGhost') { SND.sfx('eatGhost'); const [x, y] = P(e.x, e.y); burst(x, y, 24, ['#5b4bd6', '#bfe8ff', '#fff'], T * 8, 0.8, T * 0.12); floats.push({ s: String(e.pts), x, y, life: 1, col: '#bfe8ff' }); shake = 5; }
    else if (e.t === 'fruit') { SND.sfx('fruit'); const [x, y] = P(9, 11); burst(x, y, 16, ['#ff9a2e', '#7ad04a'], T * 5, 0.7, T * 0.12); floats.push({ s: String(e.value), x, y, life: 1.2, col: '#ffe27a' }); }
    else if (e.t === 'death') { SND.sfx('death'); shake = 8; }
    else if (e.t === 'clear') { SND.sfx('clear'); const [x, y] = P(9, 10); burst(x, y, 40, ['#7ad04a', '#2f8a2a', '#ffd43a'], T * 10, 1.4, T * 0.16); }
    else if (e.t === 'extra') SND.sfx('extra');
    else if (e.t === 'level') { mazeCache = null; saveBest(); }
    else if (e.t === 'over') { saveBest(); S.screen = 'over'; SND.stopMusic(); }
  }
  SND.setMode(game.frightT > 0 ? 'fright' : 'chase');
}
let acc = 0, last = performance.now();
function frame(t) {
  const dt = Math.min(0.1, (t - last) / 1000); last = t; now = (t - T0) / 1000;
  pollPad(dt); holdSteer();
  if (S.screen === 'play' && !S.overlay && !window.__manual) {
    acc += dt; const STEP = 1 / 120; while (acc >= STEP) { acc -= STEP; if (window.__autopilot && game.state === 'play') { const d = botDir(game); if (d) game.queue(d); } game.update(STEP); handleEvents(); if (S.screen !== 'play') break; }
  } else acc = 0;
  for (let i = parts.length - 1; i >= 0; i--) { const q = parts[i]; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.94; q.vy *= 0.94; q.vy += 30 * dt; q.rot += dt * 3; q.life -= dt; if (q.life <= 0) parts.splice(i, 1); }
  for (let i = floats.length - 1; i >= 0; i--) { const f = floats[i]; f.y -= 22 * dt; f.life -= dt; if (f.life <= 0) floats.splice(i, 1); }
  shake = Math.max(0, shake - dt * 25); flash = Math.max(0, flash - dt);
  draw(); if (flash > 0) { ctx.fillStyle = `rgba(255,230,140,${flash})`; ctx.fillRect(0, 0, VW, VH); }
  requestAnimationFrame(frame);
}

// ---------- input ----------
let padActive = null; const swipes = new Map(), padTouches = new Set();
const STICK = { dead: 0.24, hyst: 1.35 }; const stick = { id: null, dir: null, kx: 0, ky: 0 };
function buzz(ms) { if (S.vib && navigator.vibrate) try { navigator.vibrate(ms); } catch (e) {} }
function steer(d) { if (S.screen !== 'play' || S.overlay || !d) return; game.queue(d); lastDir = d; }
function hitButton(x, y) { for (const b of buttons) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b; return null; }
function inZone(x, y) { const z = L.zone; return z && x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h; }
function padDir(x, y) { const p = L.pad; if (!p || S.screen !== 'play') return undefined; const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy); if (d > p.r * 1.35 && !inZone(x, y)) return undefined; if (d < p.r * 0.16) return null; return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'); }
// stick: dead zone + dominant axis with hysteresis (sticky axis so diagonals don't flicker)
function stickDir(dx, dy, r, cur) {
  const ax = Math.abs(dx), ay = Math.abs(dy); if (Math.hypot(dx, dy) < r * STICK.dead) return null;
  const horiz = d => d === 'left' || d === 'right';
  let useX = ax > ay; if (cur) { if (horiz(cur) && ay < ax * STICK.hyst) useX = true; else if (!horiz(cur) && ax < ay * STICK.hyst) useX = false; }
  return useX ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
}
function stickMove(x, y) {
  const p = L.pad, dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy), k = d > p.r ? p.r / d : 1;
  stick.kx = dx * k; stick.ky = dy * k;
  const nd = stickDir(dx, dy, p.r, stick.dir);
  if (nd && nd !== stick.dir) { buzz(10); steer(nd); }
  stick.dir = nd;
}
const SW = 16;
function down(id, x, y) {
  const b = hitButton(x, y); if (b) { onButton(b.id); return; }
  if (S.screen === 'play' && !S.overlay && S.ctrl === 'stick' && L.pad && (inZone(x, y) || Math.hypot(x - L.pad.x, y - L.pad.y) < L.pad.r * 1.2)) {
    if (stick.id != null) return; stick.id = id; const p = L.pad, z = L.zone;
    // floating: the stick base jumps to where the thumb lands (kept inside the zone)
    if (z) { p.x = Math.max(z.x + p.r + 6, Math.min(z.x + z.w - p.r - 6, x)); p.y = Math.max(z.y + p.r + 6, Math.min(z.y + z.h - p.r - 6, y)); if (Math.hypot(x - p.x, y - p.y) > p.r * 0.5) { p.x = x; p.y = y; } }
    stick.dir = null; stickMove(x, y); return;
  }
  if (S.ctrl === 'dpad') { const pd = padDir(x, y); if (pd !== undefined) { padTouches.add(id); if (pd && pd !== padActive) buzz(10); padActive = pd; steer(pd); return; } }
  if (inZone(x, y)) return;
  swipes.set(id, { x, y });
}
function move(id, x, y) {
  if (id === stick.id) { stickMove(x, y); return; }
  if (padTouches.has(id)) { const pd = padDir(x, y); if (pd) { if (pd !== padActive) { padActive = pd; buzz(10); steer(pd); } } return; }
  const s = swipes.get(id); if (!s) return; const dx = x - s.x, dy = y - s.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) >= SW) { steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')); s.x = x; s.y = y; }
}
function up(id) {
  if (id === stick.id) { stick.id = null; stick.dir = null; stick.kx = stick.ky = 0; if (L.pad) { L.pad.x = L.pad.hx; L.pad.y = L.pad.hy; } }
  if (padTouches.delete(id) && !padTouches.size) padActive = null; swipes.delete(id);
}
function holdSteer() { // a held stick/D-pad keeps its direction buffered, like holding a real joystick
  const d = stick.id != null ? stick.dir : padTouches.size ? padActive : null;
  if (d && S.screen === 'play' && game.player.dir !== d && game.player.next !== d) steer(d);
}
cv.addEventListener('touchstart', e => { e.preventDefault(); for (const t of e.changedTouches) down(t.identifier, t.clientX, t.clientY); }, { passive: false });
cv.addEventListener('touchmove', e => { e.preventDefault(); for (const t of e.changedTouches) move(t.identifier, t.clientX, t.clientY); }, { passive: false });
cv.addEventListener('touchend', e => { e.preventDefault(); for (const t of e.changedTouches) up(t.identifier); }, { passive: false });
cv.addEventListener('touchcancel', e => { for (const t of e.changedTouches) up(t.identifier); });
let mouseDown = false;
cv.addEventListener('mousedown', e => { mouseDown = true; down('m', e.clientX, e.clientY); });
window.addEventListener('mousemove', e => { if (mouseDown) move('m', e.clientX, e.clientY); });
window.addEventListener('mouseup', () => { mouseDown = false; up('m'); });
const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right' };
window.addEventListener('keydown', e => {
  if (KEYS[e.key]) { e.preventDefault(); steer(KEYS[e.key]); }
  else if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') { if (S.screen === 'play') S.screen = 'paused'; else if (S.screen === 'paused') S.screen = 'play'; }
  else if ((e.key === 'Enter' || e.key === ' ') && (S.screen === 'title' || S.screen === 'over')) startGame();
});
document.addEventListener('visibilitychange', () => { if (document.hidden && S.screen === 'play') S.screen = 'paused'; });

// ---------- test hooks ----------
window.JG = { PAD, stick, stickDir, STICK, art: { drawMonkey, drawBanana, drawChaser, leaf }, get game() { return game; }, S, buttons: () => buttons, layout: () => L, start: startGame, press: onButton,
  step(n) { for (let i = 0; i < n; i++) { game.update(1 / 120); handleEvents(); } } };
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
layout(); requestAnimationFrame(frame);
})();
