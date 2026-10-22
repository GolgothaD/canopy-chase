// Canopy Chase engine: pure game logic (no DOM). Tile coords: integer = tile centre.
(function (root) {
const DIRS = { up: [0, -1], left: [-1, 0], down: [0, 1], right: [1, 0] };
const ORDER = ['up', 'left', 'down', 'right'];
const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
const FRUITS = [['Mango', 100], ['Papaya', 300], ['Coconut', 500], ['Dragon Fruit', 700], ['Pineapple', 1000], ['Starfruit', 2000], ['Golden Idol', 5000]];
const CHASERS = [
  { id: 'jaguar', name: 'Jaguar', style: 'Stalker', corner: [17, -2] },
  { id: 'snake', name: 'Viper', style: 'Ambusher', corner: [1, -2] },
  { id: 'croc', name: 'Croc', style: 'Flanker', corner: [18, 22] },
  { id: 'gorilla', name: 'Gorilla', style: 'Wildcard', corner: [0, 22] },
];
const SCHEDULE = [7, 20, 7, 20, 5, 20, 5, Infinity]; // scatter, chase, ...
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

function Game(mazes, opts) {
  opts = opts || {};
  this.mazes = mazes; this.rand = rng(opts.seed || 12345); this.events = [];
  this.high = opts.high || 0; this.newGame(opts.level || 1);
}
const G = Game.prototype;
G.emit = function (t, d) { this.events.push(Object.assign({ t }, d || {})); };
G.newGame = function (level) { this.score = 0; this.lives = 3; this.extraGiven = false; this.level = level || 1; this.state = 'ready'; this.loadLevel(); };
G.mazeIndex = function () { const l = this.level; return l <= 2 ? 0 : l <= 4 ? 1 : l <= 6 ? 2 : (l - 7) % 3; };
G.loadLevel = function () {
  const m = this.mazes[this.mazeIndex()]; this.maze = m; this.H = m.rows.length; this.W = m.rows[0].length;
  this.grid = m.rows.map(r => r.split('')); this.dots = 0;
  for (const r of this.grid) for (const c of r) if (c === '.' || c === 'o') this.dots++;
  this.homeDist = this.distFrom(9, 7, 'eyes'); this.totalDots = this.dots; this.eatenDots = 0; this.fruit = null; this.fruitsShown = 0; this.resetActors(); this.state = 'ready'; this.timer = 2.2;
};
G.distFrom = function (sx, sy, who) {
  const W = this.W, H = this.H, d = new Array(W * H).fill(1e9), q = [[sx, sy]]; d[sy * W + sx] = 0;
  for (let i = 0; i < q.length; i++) { const [x, y] = q[i]; for (const k of ORDER) { const nx = (x + DIRS[k][0] + W) % W, ny = y + DIRS[k][1]; if (ny < 0 || ny >= H || !this.open(nx, ny, who) || d[ny * W + nx] <= d[y * W + x] + 1) continue; d[ny * W + nx] = d[y * W + x] + 1; q.push([nx, ny]); } }
  return d;
};
G.speedMul = function () { return Math.min(1.36, 1 + 0.055 * (this.level - 1)); };
G.playerMul = function () { return Math.min(1.2, 1 + 0.035 * (this.level - 1)); };
G.frightTime = function () { return Math.max(1.5, 7 - 0.65 * (this.level - 1)); };
G.resetActors = function () {
  this.player = { x: 9, y: 15, dir: 'left', next: null, nextAge: 0, moving: true, mouth: 0 };
  const L = this.level;
  this.ghosts = CHASERS.map((c, i) => ({ ...c, i, x: i === 0 ? 9 : 8 + (i - 1), y: i === 0 ? 7 : 9, dir: i === 0 ? 'left' : 'up',
    mode: i === 0 ? 'active' : 'house', release: [0, 1.5, 4.5, 7.5][i] * Math.max(0.35, 1 - 0.12 * (L - 1)), fright: false, reverse: false }));
  this.phase = 0; this.phaseT = 0; this.frightT = 0; this.combo = 0; this.clock = 0;
};
G.globalMode = function () { return this.phase % 2 === 0 ? 'scatter' : 'chase'; };
G.cell = function (x, y) { if (y < 0 || y >= this.H) return '#'; x = ((x % this.W) + this.W) % this.W; return this.grid[y][x]; };
G.isTunnelRow = function (y) { return this.cell(0, y) !== '#'; };
G.open = function (x, y, who) { const c = this.cell(x, y); if (c === '#') return false; if (c === '-' || c === 'H') return who === 'eyes' || who === 'leave'; return true; };
G.queue = function (d) { if (DIRS[d]) { this.player.next = d; this.player.nextAge = 0; } };

// Generic tile-walker: moves dist along dir, calling decide() at each tile centre.
G.walk = function (a, dist, who, decide) {
  let guard = 0;
  while (dist > 1e-9 && guard++ < 50) {
    const [dx, dy] = DIRS[a.dir];
    const cx = Math.round(a.x), cy = Math.round(a.y);
    const atC = Math.abs(a.x - cx) < 1e-6 && Math.abs(a.y - cy) < 1e-6;
    if (atC) {
      a.x = cx; a.y = cy; if (decide && decide(cx, cy) === 'stop') return;
      const [ex, ey] = DIRS[a.dir];
      if (!this.open(cx + ex, cy + ey, who)) { if (who === 'player') a.moving = false; return; }
      const s = Math.min(dist, 1); a.x += ex * s; a.y += ey * s; dist -= s;
    } else {
      const along = dx ? (dx > 0 ? Math.ceil(a.x - 1e-9) - a.x : a.x - Math.floor(a.x + 1e-9)) : (dy > 0 ? Math.ceil(a.y - 1e-9) - a.y : a.y - Math.floor(a.y + 1e-9));
      const to = along < 1e-9 ? 1 : along; const s = Math.min(dist, to);
      a.x += dx * s; a.y += dy * s; dist -= s;
      if (Math.abs(a.x - Math.round(a.x)) < 1e-6) a.x = Math.round(a.x);
      if (Math.abs(a.y - Math.round(a.y)) < 1e-6) a.y = Math.round(a.y);
    }
    if (a.x < -0.5) a.x += this.W; if (a.x > this.W - 0.5) a.x -= this.W;
  }
};

G.targetFor = function (g) {
  const p = this.player, [pdx, pdy] = DIRS[p.dir];
  if (this.globalMode() === 'scatter') return g.corner;
  switch (g.id) {
    case 'jaguar': return [p.x, p.y];
    case 'snake': return [p.x + 4 * pdx, p.y + 4 * pdy];
    case 'croc': { const j = this.ghosts[0], ax = p.x + 2 * pdx, ay = p.y + 2 * pdy; return [2 * ax - j.x, 2 * ay - j.y]; }
    case 'gorilla': { const d = Math.hypot(g.x - p.x, g.y - p.y); return d > 8 ? [p.x, p.y] : g.corner; }
  }
};
G.choose = function (g, cx, cy, target, who, random) {
  const opts = ORDER.filter(d => d !== OPP[g.dir] && this.open(cx + DIRS[d][0], cy + DIRS[d][1], who));
  if (!opts.length) return OPP[g.dir];
  if (random) return opts[Math.floor(this.rand() * opts.length)];
  let best = opts[0], bd = Infinity;
  for (const d of opts) { const nx = cx + DIRS[d][0], ny = cy + DIRS[d][1], dd = (nx - target[0]) ** 2 + (ny - target[1]) ** 2; if (dd < bd - 1e-9) { bd = dd; best = d; } }
  return best;
};
G.homeStep = function (g, cx, cy) { // eyes take the true shortest path home (may not reverse unless dead end)
  let best = null, bd = 1e9; const W = this.W;
  for (const d of ORDER) { if (d === OPP[g.dir]) continue; const nx = (cx + DIRS[d][0] + W) % W, ny = cy + DIRS[d][1]; if (ny < 0 || ny >= this.H || !this.open(nx, ny, 'eyes')) continue; const v = this.homeDist[ny * W + nx]; if (v < bd) { bd = v; best = d; } }
  return best || OPP[g.dir];
};
G.ghostSpeed = function (g) {
  const m = this.speedMul();
  if (g.mode === 'eyes') return 15;
  if (g.mode === 'house' || g.mode === 'leave') return 4;
  if (this.isTunnelRow(Math.round(g.y)) && (g.x < 3.5 || g.x > this.W - 4.5)) return 3.6 * m;
  if (g.fright) return 4.6 * m;
  let s = 6.7 * m; if (g.id === 'jaguar' && this.dots < 20) s *= 1.08; return s;
};
G.updateGhost = function (g, dt) {
  const sp = this.ghostSpeed(g) * dt;
  if (g.mode === 'house') {
    g.release -= dt; g.bob = (g.bob || 0) + dt * 6; g.y = 9 + Math.sin(g.bob) * 0.25;
    if (g.release <= 0) { g.mode = 'leave'; g.y = 9; }
    return;
  }
  if (g.mode === 'leave') { // slide to centre column, then up through the gate
    if (Math.abs(g.x - 9) > 1e-6) { const s = Math.min(sp, Math.abs(9 - g.x)); g.x += Math.sign(9 - g.x) * s; g.dir = g.x < 9 ? 'right' : 'left'; return; }
    g.y -= sp; g.dir = 'up'; if (g.y <= 7) { g.y = 7; g.mode = 'active'; g.dir = this.rand() < 0.5 ? 'left' : 'right'; }
    return;
  }
  if (g.mode === 'eyes') {
    if (Math.round(g.x) === 9 && Math.abs(g.x - 9) < 1e-6 && g.y >= 7 - 1e-6 && g.y < 9.5 && (g.dir === 'down' || Math.abs(g.y - 7) < 1e-6)) {
      g.dir = 'down'; g.y += sp; if (g.y >= 9) { g.y = 9; g.mode = 'leave'; g.fright = false; this.emit('revive', { id: g.id }); }
      return;
    }
    this.walk(g, sp, 'eyes', (cx, cy) => { if (cx === 9 && cy === 7) { g.dir = 'down'; return 'stop'; } g.dir = this.homeStep(g, cx, cy); });
    return;
  }
  this.walk(g, sp, 'ghost', (cx, cy) => {
    if (g.reverse) { g.reverse = false; const o = OPP[g.dir]; if (this.open(cx + DIRS[o][0], cy + DIRS[o][1], 'ghost')) { g.dir = o; return; } }
    g.dir = this.choose(g, cx, cy, this.targetFor(g), 'ghost', g.fright);
  });
};
G.updatePlayer = function (dt) {
  const p = this.player, sp = (this.frightT > 0 ? 8.2 : 7.6) * this.playerMul() * dt;
  if (p.next) { p.nextAge += dt; if (p.nextAge > 0.9 && p.next !== p.dir) { /* keep buffered turn generously */ } }
  // instant reversal, mid-tile
  if (p.next === OPP[p.dir]) { p.dir = p.next; p.next = null; p.moving = true; }
  // pre-turn ("cornering"): if close to a centre and the queued turn is open, snap and turn
  if (p.next && p.next !== p.dir) {
    const cx = Math.round(p.x), cy = Math.round(p.y), [nx, ny] = DIRS[p.next];
    if (Math.abs(p.x - cx) + Math.abs(p.y - cy) < 0.28 && this.open(cx + nx, cy + ny, 'player')) { p.x = cx; p.y = cy; p.dir = p.next; p.next = null; p.moving = true; }
  }
  if (!p.moving && p.next) { const [nx, ny] = DIRS[p.next]; if (this.open(Math.round(p.x) + nx, Math.round(p.y) + ny, 'player')) { p.dir = p.next; p.next = null; p.moving = true; } }
  const bx = p.x, by = p.y;
  this.walk(p, sp, 'player', (cx, cy) => {
    this.eat(cx, cy);
    if (p.next) { const [nx, ny] = DIRS[p.next]; if (this.open(cx + nx, cy + ny, 'player')) { p.dir = p.next; p.next = null; } }
    p.moving = true;
  });
  const moved = Math.abs(p.x - bx) + Math.abs(p.y - by); if (moved > 0) p.mouth += moved;
  this.eat(Math.round(p.x), Math.round(p.y));
};
G.eat = function (x, y) {
  const p = this.player; if (Math.abs(p.x - x) > 0.45 || Math.abs(p.y - y) > 0.45) return;
  x = ((x % this.W) + this.W) % this.W; const c = this.grid[y] && this.grid[y][x];
  if (c === '.' || c === 'o') {
    this.grid[y][x] = ' '; this.dots--; this.eatenDots++;
    if (c === '.') { this.add(10); this.emit('seed', { x, y }); }
    else { this.add(50); this.frighten(); this.emit('power', { x, y }); }
    if (this.eatenDots === 60 || this.eatenDots === 130) { const f = FRUITS[Math.min(FRUITS.length - 1, this.level - 1)]; this.fruit = { name: f[0], value: f[1], kind: Math.min(FRUITS.length - 1, this.level - 1), x: 9, y: 11, t: 9.5 }; this.emit('fruitSpawn'); }
    if (this.dots === 0) { this.state = 'clear'; this.timer = 2.4; this.emit('clear'); }
  }
};
G.add = function (n) { this.score += n; if (!this.extraGiven && this.score >= 10000) { this.extraGiven = true; this.lives++; this.emit('extra'); } if (this.score > this.high) this.high = this.score; };
G.frighten = function () {
  this.frightT = this.frightTime(); this.combo = 0;
  for (const g of this.ghosts) if (g.mode !== 'eyes') { g.fright = true; if (g.mode === 'active') g.reverse = true; }
};
G.update = function (dt) {
  this.events.length = 0; this.clock += dt;
  if (this.state === 'ready') { this.timer -= dt; if (this.timer <= 0) { this.state = 'play'; this.emit('go'); } return; }
  if (this.state === 'dying') { this.timer -= dt; if (this.timer <= 0) { if (this.lives <= 0) { this.state = 'over'; this.emit('over'); } else { this.resetActors(); this.state = 'ready'; this.timer = 1.6; } } return; }
  if (this.state === 'clear') { this.timer -= dt; if (this.timer <= 0) { this.level++; this.loadLevel(); this.emit('level'); } return; }
  if (this.state === 'eatpause') { this.timer -= dt; if (this.timer <= 0) this.state = 'play'; return; }
  if (this.state !== 'play') return;
  // mode clock pauses during fright
  if (this.frightT > 0) { this.frightT -= dt; if (this.frightT <= 0) { this.frightT = 0; for (const g of this.ghosts) g.fright = false; this.emit('frightEnd'); } }
  else { this.phaseT += dt; if (this.phaseT >= SCHEDULE[this.phase]) { this.phaseT = 0; this.phase++; for (const g of this.ghosts) if (g.mode === 'active') g.reverse = true; } }
  this.updatePlayer(dt); if (this.state !== 'play') return;
  for (const g of this.ghosts) this.updateGhost(g, dt);
  if (this.fruit) { this.fruit.t -= dt; if (this.fruit.t <= 0) this.fruit = null; else if (Math.abs(this.player.x - 9) < 0.6 && Math.abs(this.player.y - 11) < 0.6) { this.add(this.fruit.value); this.emit('fruit', { value: this.fruit.value, x: 9, y: 11 }); this.fruit = null; } }
  this.collide();
};
G.collide = function () {
  const p = this.player;
  for (const g of this.ghosts) {
    if (g.mode === 'house' || g.mode === 'eyes') continue;
    let dx = Math.abs(g.x - p.x); dx = Math.min(dx, this.W - dx);
    if (dx + Math.abs(g.y - p.y) < 0.62) {
      if (g.fright) { g.fright = false; g.mode = 'eyes'; const pts = 200 * 2 ** this.combo; this.combo = Math.min(3, this.combo + 1); this.add(pts); this.emit('eatGhost', { id: g.id, pts, x: g.x, y: g.y }); this.state = 'eatpause'; this.timer = 0.45; }
      else if (!this.invincible) { this.lives--; this.state = 'dying'; this.timer = 1.8; this.emit('death'); return; }
    }
  }
};
const API = { Game, DIRS, OPP, ORDER, CHASERS, FRUITS, SCHEDULE };
if (typeof module !== 'undefined') module.exports = API; else root.CC = API;
})(this);
