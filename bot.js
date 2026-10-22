// Autopilot used by tests: race-safe BFS. A tile is safe if we reach it clearly before any live predator could.
(function (root) {
const DD = [['up', 0, -1], ['left', -1, 0], ['down', 0, 1], ['right', 1, 0]];
function distMap(g, sx, sy, who) {
  const W = g.W, H = g.H, d = new Int16Array(W * H).fill(9999), q = [[sx, sy]]; d[sy * W + sx] = 0;
  for (let i = 0; i < q.length; i++) { const [x, y] = q[i]; for (const [, dx, dy] of DD) { const nx = (x + dx + W) % W, ny = y + dy; if (!g.open(nx, ny, who) || d[ny * W + nx] <= d[y * W + x] + 1) continue; d[ny * W + nx] = d[y * W + x] + 1; q.push([nx, ny]); } }
  return d;
}
function clone(g) {
  const c = Object.create(Object.getPrototypeOf(g));
  for (const k of Object.keys(g)) c[k] = g[k];
  c.player = { ...g.player }; c.ghosts = g.ghosts.map(h => ({ ...h })); c.grid = g.grid.map(r => r.slice()); c.events = [];
  let s = 99; c.rand = () => (s = (s * 16807) % 2147483647) / 2147483647; c._sim = true; c.fruit = g.fruit ? { ...g.fruit } : null; return c;
}
function simulate(g, d) {
  const c = clone(g), lives = c.lives, dots = c.dots; c.queue(d); let steps = 0, score0 = c.score;
  for (; steps < 150; steps++) {
    if (steps > 16 && steps % 8 === 0 && c.state === 'play') { const e = core(c); if (e) c.queue(e); }
    c.update(1 / 120); if (c.lives < lives) return -10000 + steps;
    if (c.state === 'clear') return 5000;
  }
  return (c.score - score0) + (dots - c.dots) * 5;
}
function botDir(g) {
  const p = g.player, W = g.W, OPPS = { up: 'down', down: 'up', left: 'right', right: 'left' };
  const cx = Math.round(p.x), cy = Math.round(p.y), key = cx + ',' + cy + ',' + g.level + ',' + g.lives;
  if (g._sim) return core(g);
  if (g._botKey === key && g._botD) return g._botD;
  g._botKey = key;
  const near = g.ghosts.some(h => (h.mode === 'active' || h.mode === 'leave') && !h.fright && Math.min(Math.abs(h.x - p.x), W - Math.abs(h.x - p.x)) + Math.abs(h.y - p.y) < 8);
  if (!near) return (g._botD = core(g));
  let best = null, bs = -Infinity;
  for (const d of ['up', 'left', 'down', 'right']) {
    const [dx, dy] = DD.find(e => e[0] === d).slice(1);
    if (d !== OPPS[p.dir] && !g.open(cx + dx, cy + dy, 'player')) continue;
    const v = simulate(g, d) + (d === p.dir ? 3 : 0); if (v > bs) { bs = v; best = d; }
  }
  return (g._botD = best);
}
function core(g) {
  const p = g.player, W = g.W, H = g.H, [ddx, ddy] = (DD.find(d => d[0] === p.dir) || DD[0]).slice(1), ax = ddx ? (ddx > 0 ? Math.ceil(p.x - 1e-6) : Math.floor(p.x + 1e-6)) : Math.round(p.x), ay = ddy ? (ddy > 0 ? Math.ceil(p.y - 1e-6) : Math.floor(p.y + 1e-6)) : Math.round(p.y), ok0 = p.moving && g.open(ax, ay, 'player'), sx = (((ok0 ? ax : Math.round(p.x)) % W) + W) % W, sy = ok0 ? ay : Math.round(p.y);
  const live = g.ghosts.filter(h => (h.mode === 'active' || h.mode === 'leave') && !h.fright);
  g._botDanger = false;
  const gd = new Int16Array(W * H).fill(9999);
  for (const h of live) { const m = distMap(g, ((Math.round(h.x) % W) + W) % W, Math.max(0, Math.min(H - 1, Math.round(h.y))), 'eyes'); for (let i = 0; i < m.length; i++) gd[i] = Math.min(gd[i], m[i]); }
  // BFS from player through safe tiles only
  const prev = new Int32Array(W * H).fill(-1), dist = new Int16Array(W * H).fill(9999), first = new Int8Array(W * H).fill(-1);
  const q = [sy * W + sx]; dist[q[0]] = 0; if (gd[q[0]] <= 3) g._botDanger = true; const order = [];
  for (let i = 0; i < q.length; i++) { const c = q[i], x = c % W, y = (c / W) | 0; order.push(c);
    for (let k = 0; k < 4; k++) { const [, dx, dy] = DD[k], nx = (x + dx + W) % W, ny = y + dy; if (!g.open(nx, ny, 'player')) continue; const n = ny * W + nx; if (dist[n] !== 9999) continue;
      const nd = dist[c] + 1; if (gd[n] <= nd * 0.9 + 1) continue; dist[n] = nd; first[n] = c === q[0] ? k : first[c]; q.push(n); } }
  const prey = g.ghosts.filter(h => h.mode === 'active' && h.fright && g.frightT > 1.5);
  const keep = g._botGoal; if (keep != null && first[keep] >= 0) { const kx = keep % W, ky = (keep / W) | 0, kc = g.grid[ky][kx]; if (kc === '.' || kc === 'o') return DD[first[keep]][0]; }
  let best = -1, bs = -1e9;
  for (const c of order) { if (c === q[0]) continue; const x = c % W, y = (c / W) | 0, ch = g.grid[y][x];
    let v = -dist[c];
    if (ch === '.') v += 40; else if (ch === 'o') v += live.some(h => gd[c] < 10) ? 80 : 25; else continue;
    if (v > bs) { bs = v; best = c; } }
  for (const h of prey) { const c = (((Math.round(h.x) % W) + W) % W) + Math.round(h.y) * W; if (c >= 0 && c < W * H && first[c] >= 0 && dist[c] < 10) { const v = 100 - dist[c]; if (v > bs) { bs = v; best = c; } } }
  if (g.fruit && first[11 * W + 9] >= 0) { const v = 90 - dist[11 * W + 9]; if (v > bs) { bs = v; best = 11 * W + 9; } }
  if (best >= 0) { const bx = best % W, by = (best / W) | 0; g._botGoal = (g.grid[by][bx] === '.' || g.grid[by][bx] === 'o') ? best : null; return DD[first[best]][0]; }
  g._botGoal = null;
  // no safe goal: go to the reachable tile with the largest safety margin, else flee
  let m = -1e9; for (const c of order) { if (c === q[0]) continue; const v = gd[c] - dist[c]; if (v > m) { m = v; best = c; } }
  if (best >= 0) return DD[first[best]][0];
  let bd = null, bm = -1; for (const [d, dx, dy] of DD) { const nx = (sx + dx + W) % W, ny = sy + dy; if (!g.open(nx, ny, 'player')) continue; const v = gd[ny * W + nx]; if (v > bm) { bm = v; bd = d; } }
  return bd;
}
if (typeof module !== 'undefined') module.exports = botDir; else root.botDir = botDir;
})(this);
