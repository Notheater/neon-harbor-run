/* =====================================================================
   NEON HARBOR RUN v0.4 — Temple-Run-style endless runner in neon Tokyo
   Classic browser script (Three.js r149 bundled) => works from file://.
   Design: the course is a PATH of 40 m chunks. Gameplay (lanes, obstacles,
   shards, corners) is computed in path space (s = distance, x = lateral);
   world geometry is only a visual layer placed from the path layout.
   ===================================================================== */
(function () {
'use strict';
const $ = id => document.getElementById(id);
const TEST = !!window.NH_TEST;
const show = (id, on) => { const e = $(id); if (e) e.classList.toggle('hidden', !on); };
if (typeof THREE === 'undefined') { show('title', false); $('fatal').textContent = 'Three.js did not load. Keep the "vendor" folder next to index.html and reload.'; show('fatal', true); return; }

/* ---------- tunables ---------- */
const LANE = 2.6, CH = 40, BASE = 20, MAXS = 44, ACC = .55, AHEAD = 7, BEHIND = 1;     // 7 chunks ahead = 280 m, beyond the 240 m fog
const GAP0 = 14, GAP_MIN = 2.2, STAND_H = 2.2, SLIDE_H = 1.1, JUMP_V = 11, GRAV = 30;
const TURN_WINDOW = 26, INV = 1.1;
let level = 1, xp = 0, lastStage = 0, stageHits = 0, xpPopT = 0;
const xpNeed = lv => Math.round(220 * Math.pow(1.4, lv - 1));

/* ---------- utils ---------- */
const mulberry = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const rnd = mulberry(1013);                                   // static art (identical every launch)
const rr = (a, b) => a + rnd() * (b - a), pick = a => a[(rnd() * a.length) | 0];
const clamp = THREE.MathUtils.clamp, damp = THREE.MathUtils.damp, SRGB = THREE.sRGBEncoding;
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const NULLCTX = new Proxy({}, { get: () => () => NULLCTX, set: () => true });
const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d') || NULLCTX]; };

/* ---------- renderer / scene ---------- */
const FOG = 0x0a0618;
const scene = new THREE.Scene(); scene.background = new THREE.Color(FOG); scene.fog = new THREE.FogExp2(FOG, 0.0085);
const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, .1, 800);
let renderer = null;
if (!TEST) {
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.4));
    renderer.outputEncoding = SRGB; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
    document.body.prepend(renderer.domElement);
  } catch (e) { show('title', false); $('fatal').textContent = 'WebGL is not available in this browser, so the game cannot start.'; show('fatal', true); return; }
}
scene.add(new THREE.HemisphereLight(0x3a5a88, 0x080614, .55));
const moon = new THREE.DirectionalLight(0xa8c4ff, .42); moon.position.set(-30, 60, 40); scene.add(moon);
const runLights = [0x21e6ff, 0xffc078, 0xff2d55].map(c => { const l = new THREE.PointLight(c, 2.6, 30, 1.6); scene.add(l); return l; });

const sky = (() => {                                          // gradient night sky with magenta horizon glow
  const g = new THREE.SphereGeometry(520, 24, 12), p = g.attributes.position, col = [], top = new THREE.Color(0x04020c), hor = new THREE.Color(0x45185f), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) { c.copy(hor).lerp(top, Math.pow(Math.max(0, p.getY(i) / 520), .5)); col.push(c.r, c.g, c.b); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })); m.renderOrder = -3; scene.add(m); return m;
})();
const skyline = (() => {                                      // painted city silhouette ring that follows the camera
  const [c, x] = cv(1024, 256); x.clearRect(0, 0, 1024, 256);
  for (let i = 0, px = 0; px < 1024; i++) {
    const w = 18 + rnd() * 46, h = 40 + rnd() * 170; x.fillStyle = '#0a0a1c'; x.fillRect(px, 256 - h, w, h);
    for (let k = 0; k < w * h / 260; k++) { x.fillStyle = pick(['#59e6ff', '#ff4fd8', '#ffc46b', '#ff5468']); x.globalAlpha = .75; x.fillRect(px + 3 + rnd() * (w - 6), 256 - h + 6 + rnd() * (h - 8), 2, 3); }
    x.globalAlpha = 1; if (h > 150) { x.fillStyle = '#ff2a2a'; x.fillRect(px + w / 2, 256 - h - 5, 3, 5); } px += w + rnd() * 6;
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.set(3, 1); t.encoding = SRGB;
  const m = new THREE.Mesh(new THREE.CylinderGeometry(330, 330, 150, 48, 1, true), new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  m.renderOrder = -2; m.position.y = 55; scene.add(m); return m;
})();

function makeEnv() {                                          // procedural neon environment for road reflections
  if (!renderer) return null;
  try {
    const s = new THREE.Scene(); s.background = new THREE.Color(0x0a0618); const cols = [0x21e6ff, 0xff3df2, 0xff2d55, 0xffd166, 0x9b6bff];
    for (let i = 0; i < 16; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(rr(2, 6), rr(1, 9), .5), new THREE.MeshBasicMaterial({ color: new THREE.Color(cols[i % 5]).multiplyScalar(4) })); const a = rnd() * 6.28; m.position.set(Math.cos(a) * 30, rr(-2, 12), Math.sin(a) * 30); m.lookAt(0, 0, 0); s.add(m); }
    const pm = new THREE.PMREMGenerator(renderer), t = pm.fromScene(s, .04).texture; pm.dispose(); return t;
  } catch (e) { return null; }
}
const ENV = makeEnv();

/* ---------- shared art assets ---------- */
const mat = (color, r = .85, m = 0) => new THREE.MeshStandardMaterial({ color, roughness: r, metalness: m });
const basic = (color, o = {}) => new THREE.MeshBasicMaterial(Object.assign({ color }, o));
const SHARED = new Set(), sh = g => { SHARED.add(g); return g; };      // geometries that must survive chunk recycling
const NEON = [0x21e6ff, 0xff3df2, 0xff2d55, 0x9b6bff, 0xffd166];
const neonMats = NEON.map(c => basic(new THREE.Color(c).multiplyScalar(1.55), { toneMapped: false }));
const shopMats = [0xffa95a, 0xff7ab8, 0x7fe8ff, 0xffd98a].map(c => basic(new THREE.Color(c).multiplyScalar(1.35), { toneMapped: false }));
const awnMats = [0x7a1022, 0x2b1a5c, 0x0e4a5a, 0x5a1450].map(c => mat(c, .7));
const redGlow = basic(0xff2a2a, { toneMapped: false }), toriiRed = mat(0xc41e2a, .5), darkMat = mat(0x14141c, .5, .2);
toriiRed.emissive = new THREE.Color(0x330306);
const gLantern = sh(new THREE.SphereGeometry(.28, 10, 8).scale(1, 1.25, 1));

function winTex() {
  const [c, x] = cv(256, 256); x.fillStyle = '#000'; x.fillRect(0, 0, 256, 256); const pal = ['#59e6ff', '#ff4fd8', '#ffc46b', '#ff5468', '#9b7bff'];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { if (rnd() < .28) continue; x.fillStyle = pick(pal); x.fillRect(i * 64 + 14, j * 64 + 16, 36, 30); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = SRGB; t.anisotropy = 4; return t;
}
const winMats = [0, 1, 2, 3].map(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8, metalness: .1, emissive: 0xffffff, emissiveMap: winTex(), emissiveIntensity: 1.7 }));
const BCOL = [0x1b2040, 0x2a1c4a, 0x14172c, 0x3a1c3e, 0x1c2c44, 0x2b1a30];
function bGeo(w, h, d, color) {                               // box whose UVs tile the window texture; roof/floor sample the dark margin
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; if (f === 2 || f === 3) uv.setXY(i, .004, .004); else uv.setXY(i, uv.getX(i) * (f < 2 ? d : w) / 14, uv.getY(i) * h / 14); }
  const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}
const FONT = '"Yu Gothic","Meiryo","MS Gothic","Hiragino Sans","Noto Sans CJK JP",sans-serif';
const TEXTS = ['ラーメン', '居酒屋', 'カラオケ', '薬局', 'ネオン', '港', '酒場', '電脳', '寿司', '夜', '焼肉', '麻雀', '危険', '走れ'];
const SCOL = ['#21e6ff', '#ff3df2', '#ff2d55', '#ffd166', '#9b6bff'], signCache = {};
function signMat(t, ci) {
  const k = t + ci; if (signCache[k]) return signCache[k];
  const [c, x] = cv(128, 256), col = SCOL[ci]; x.fillStyle = '#07040f'; x.fillRect(0, 0, 128, 256); x.strokeStyle = col; x.lineWidth = 5; x.shadowColor = col; x.shadowBlur = 12; x.strokeRect(8, 8, 112, 240);
  const ch = [...t], fs = Math.min(72, Math.floor(210 / ch.length)); x.font = 'bold ' + fs + 'px ' + FONT; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = col; x.shadowBlur = 16;
  ch.forEach((s, i) => x.fillText(s, 64, 128 + (i - (ch.length - 1) / 2) * fs * 1.05));
  const tx = new THREE.CanvasTexture(c); tx.encoding = SRGB; return signCache[k] = new THREE.MeshBasicMaterial({ map: tx, color: new THREE.Color(1.35, 1.35, 1.35), side: THREE.DoubleSide, toneMapped: false });
}
function radialTex(inner, outer) { const [c, x] = cv(128, 128), g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, inner); g.addColorStop(1, outer); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); }
const glowT = radialTex('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
const decalMats = NEON.map(c => basic(c, { map: glowT, transparent: true, opacity: .5, blending: THREE.AdditiveBlending, depthWrite: false }));
const roadM = new THREE.MeshPhysicalMaterial({ color: 0x080a14, roughness: .16, metalness: .48, clearcoat: .85, clearcoatRoughness: .1 });
if (ENV) { roadM.envMap = ENV; roadM.envMapIntensity = 1.45; }
const groundM = mat(0x12101c, .72, .08);
const walkM = mat(0x1a1826, .78, .05);
const glowSpr = new THREE.SpriteMaterial({ map: glowT, color: 0xffc078, transparent: true, opacity: .45, blending: THREE.AdditiveBlending, depthWrite: false, fog: true });
const laneM = (() => {                                        // lane dashes + edge lines (one texture, repeated along the road)
  const [c, x] = cv(64, 128); x.fillStyle = 'rgba(110,225,255,.85)'; x.fillRect(23, 14, 2, 70); x.fillRect(39, 14, 2, 70); x.fillStyle = 'rgba(255,61,242,.9)'; x.fillRect(2, 0, 2, 128); x.fillRect(60, 0, 2, 128);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 6.25); t.encoding = SRGB; return basic(0xffffff, { map: t, transparent: true, depthWrite: false, toneMapped: false });
})();

/* ---------- obstacle / pickup prefabs (shared geometry) ---------- */
const gBar = sh(new THREE.BoxGeometry(2.3, .9, .45)), gBarTop = sh(new THREE.BoxGeometry(2.3, .1, .5)), gPost = sh(new THREE.CylinderGeometry(.1, .1, 2.6, 8)), gBeam = sh(new THREE.BoxGeometry(2.4, .4, .5));
const gWall = sh(new THREE.BoxGeometry(2.3, 3.2, 1)), gFace = sh(new THREE.PlaneGeometry(1.3, 2.4)), gShard = sh(new THREE.OctahedronGeometry(.42, 0));
const barMat = mat(0x20203a, .5, .3), wallMat = mat(0x1a1530, .6, .2), shardMat = basic(0x70ffe3, { toneMapped: false });
function makeObstacle(type, i) {
  const g = new THREE.Group(), add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
  if (type === 'barrier') { add(gBar, barMat, 0, .45, 0); add(gBarTop, neonMats[1], 0, .95, 0); }
  else if (type === 'gate') { add(gPost, darkMat, -1.15, 1.3, 0); add(gPost, darkMat, 1.15, 1.3, 0); add(gBeam, redGlow, 0, 1.6, 0); }
  else { add(gWall, wallMat, 0, 1.6, 0); add(gFace, signMat(TEXTS[(i * 7) % TEXTS.length], i % 5), 0, 1.7, .52); }
  return g;
}

/* ---------- characters: articulated human rig from human.js ---------- */
const H = window.NHHuman;
if (!H) { show('title', false); if ($('fatal')) { $('fatal').textContent = 'human.js did not load. Keep it next to index.html and reload.'; show('fatal', true); } throw new Error('NHHuman missing'); }
const player = H.create({ style: 'pony', pack: true });
scene.add(player.g);
const THUGS = [
  { style: 'slick', glasses: true, build: 1.0, skin: 0xd9a77c },
  { style: 'spiky', glasses: true, build: 1.1, skin: 0xc68863 },
  { style: 'buzz', glasses: false, build: .95, skin: 0xe6b996 },
  { style: 'slick', glasses: true, build: 1.08, skin: 0xb57a58 }
];
const chasers = [[0, 0], [1.4, -1.7], [2.6, 1.7], [3.6, -2.4]].map(([off, lx], i) => {
  const m = H.create(Object.assign({ suit: true, pack: false, jacket: 0x15151d, pants: 0x0e0e14, shoe: 0x050508, trim: 0xff2a3c, sole: 0xff2a3c, tie: 0xff1a3c, hair: 0x07070a, hairTip: 0x07070a }, THUGS[i]));
  scene.add(m.g); return { m, off, lx };
});
chasers[3].m.g.visible = false;
const sparks = [];
if (!TEST) {
  for (let i = 0; i < 14; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(.12, .12, .12), basic(0x88f0ff, { toneMapped: false })); m.visible = false; scene.add(m); sparks.push({ m, vx: 0, vy: 0, vz: 0, life: 0 }); }
}
function burst(x, y, z) {
  let n = 7; for (const s of sparks) { if (n <= 0) break; if (s.life > 0) continue; s.life = .35; s.m.visible = true; s.m.position.set(x, y, z); s.vx = rr(-5, 5); s.vy = rr(2, 7); s.vz = rr(-5, 5); n--; }
}
function updSparks(dt) { for (const s of sparks) if (s.life > 0) { s.life -= dt; s.vy -= 18 * dt; s.m.position.x += s.vx * dt; s.m.position.y += s.vy * dt; s.m.position.z += s.vz * dt; if (s.life <= 0) s.m.visible = false; } }
const hazeTex = (() => { const [c, x] = cv(256, 64); const g = x.createLinearGradient(0, 0, 0, 64); g.addColorStop(0, 'rgba(40,80,140,0)'); g.addColorStop(.5, 'rgba(60,120,180,.18)'); g.addColorStop(1, 'rgba(40,80,140,0)'); x.fillStyle = g; x.fillRect(0, 0, 256, 64); return new THREE.CanvasTexture(c); })();
const haze = new THREE.Mesh(new THREE.PlaneGeometry(48, 10), new THREE.MeshBasicMaterial({ map: hazeTex, transparent: true, opacity: .35, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
haze.position.y = 1.2; if (!TEST) scene.add(haze);
const blob = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshBasicMaterial({ map: radialTex('rgba(0,0,0,.8)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false })); blob.rotation.x = -Math.PI / 2; scene.add(blob);

/* ---------- rain (CPU-animated line segments that follow the camera) ---------- */
const RAIN_N = 1800, rainG = new THREE.BufferGeometry(), rainP = new Float32Array(RAIN_N * 6), rainD = [];
for (let i = 0; i < RAIN_N; i++) rainD.push([rr(-22, 22), rr(0, 24), rr(-22, 22)]);
rainG.setAttribute('position', new THREE.BufferAttribute(rainP, 3));
const rain = new THREE.LineSegments(rainG, new THREE.LineBasicMaterial({ color: 0x9fd0ff, transparent: true, opacity: .35, fog: false })); rain.frustumCulled = false; scene.add(rain);
function updRain(dt) {
  for (let i = 0; i < RAIN_N; i++) { const d = rainD[i]; d[1] -= 38 * dt; if (d[1] < 0) { d[1] = 24; d[0] = rr(-22, 22); d[2] = rr(-22, 22); } rainP.set([d[0], d[1], d[2], d[0] - .12, d[1] + .9, d[2]], i * 6); }
  rainG.attributes.position.needsUpdate = true; rain.position.set(camera.position.x, 0, camera.position.z);
}

/* ---------- path layout (pure data: testable without rendering) ---------- */
let runSeed = 20261015, lastCorner = -9, noObstacles = false;     // noObstacles: test-only switch
const layout = [], chunkRand = k => mulberry(runSeed * 7919 + k * 104729 + 13);
const TYPES = ['barrier', 'gate', 'wall'];
function ensureLayout(i) {
  while (layout.length <= i) {
    const k = layout.length, prev = layout[k - 1], r = chunkRand(k);
    const L = prev ? { ox: prev.ox - Math.sin(prev.th) * CH, oz: prev.oz - Math.cos(prev.th) * CH, th: prev.th + prev.turn * Math.PI / 2 } : { ox: 0, oz: 0, th: 0 };
    L.k = k; L.turn = 0; L.group = null; L.rows = []; L.shards = []; L.bld = [];
    if (k >= 6 && k - lastCorner >= 5 && r() < .4) { L.turn = r() < .5 ? 1 : -1; lastCorner = k; }       // +1 = left corner, -1 = right corner
    // obstacle rows: every row keeps one completely free lane, and consecutive free lanes are at most one lane apart (always dodgeable)
    let safe = prev ? prev.safeEnd : 0; L.safeStart = safe;
    const dense = level >= 8 ? [10, 22, 34] : level >= 5 ? [12, 26, 36] : [14, 30];
    const rowsAt = k < 3 || noObstacles ? [] : L.turn ? [14] : dense;
    rowsAt.forEach(sl => { safe = clamp(safe + Math.floor(r() * 3) - 1, -1, 1); if (sl === 14) L.safeRow1 = safe;
      for (const lane of [-1, 0, 1]) { if (lane === safe) continue; const t = r();
        let type = t < .3 ? null : t < .55 ? 'barrier' : t < .78 ? 'gate' : 'wall';
        if (level >= 3 && type === 'barrier' && r() < .35) type = 'gate';
        if (level >= 8 && type && r() < .25) type = 'wall';
        if (type) L.rows.push({ s: k * CH + sl, lane, type, hit: false, mesh: null }); } });
    L.safeEnd = safe;
    if (k >= 2 && r() < .85) { const lane = L.safeRow1 !== undefined ? L.safeRow1 : Math.floor(r() * 3) - 1; for (let j = 0; j < 5; j++) L.shards.push({ s: k * CH + 18 + j * 2, lane, got: false, mesh: null }); }
    // buildings (local frame: forward = -z, road half-width 5). Slots are skipped near corners so streets never collide.
    const prevTurn = prev && prev.turn;
    for (const side of [-1, 1]) for (let j = 0; j < 3; j++) {
      if (prevTurn && j === 0) continue; if (L.turn && j >= 1 && side === -L.turn) continue;
      const w = 6 + r() * 3, zc = -(7 + 13 * j); L.bld.push({ x0: side > 0 ? 7.5 : -7.5 - w, x1: side > 0 ? 7.5 + w : -7.5, z0: zc - 6, z1: zc + 6, h: 10 + r() * 26, side, zc, col: (r() * 6) | 0, win: (r() * 4) | 0 });
    }
    if (L.turn) L.bld.push({ x0: -12, x1: 12, z0: -58, z1: -46, h: 24 + r() * 10, side: 0, zc: -52, col: (r() * 6) | 0, win: (r() * 4) | 0 });   // dead-end block facing the player at the junction
    layout.push(L);
  }
}
function posAt(s, x, k) {                                    // path (distance, lateral) -> world
  const idx = k === undefined ? Math.max(0, Math.floor(s / CH)) : k; ensureLayout(idx); const L = layout[idx], loc = s - idx * CH, sn = Math.sin(L.th), cs = Math.cos(L.th);
  return { x: L.ox - sn * loc + cs * x, z: L.oz - cs * loc - sn * x, th: L.th };
}

/* ---------- chunk visuals ---------- */
function mergeGroup(g) {                                      // bake flagged static meshes into one mesh per material
  const groups = new Map(); g.children.forEach(o => { if (o.isMesh && o.userData.merge) { if (!groups.has(o.material)) groups.set(o.material, []); groups.get(o.material).push(o); } });
  const v = new THREE.Vector3(), nm = new THREE.Matrix3();
  for (const [material, items] of groups) {
    const pos = [], nor = [], uv = [];
    for (const o of items) {
      o.updateMatrix(); const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry, p = geo.attributes.position, n = geo.attributes.normal, u = geo.attributes.uv; nm.getNormalMatrix(o.matrix);
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrix); pos.push(v.x, v.y, v.z); v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z); uv.push(u.getX(i), u.getY(i)); }
      g.remove(o); if (!SHARED.has(o.geometry)) o.geometry.dispose();
    }
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bg.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); bg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.add(new THREE.Mesh(bg, material));
  }
}
function buildChunk(k) {
  const L = layout[k], g = new THREE.Group(), r = chunkRand(k + 99991), R = (a, b) => a + r() * (b - a), P_ = a => a[(r() * a.length) | 0];
  g.position.set(L.ox, 0, L.oz); g.rotation.y = L.th; scene.add(g); L.group = g;
  const put = (geo, m, x, y, z, ry = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.y = ry; o.userData.merge = true; g.add(o); return o; };
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(70, 60), groundM); ground.rotation.x = -Math.PI / 2; ground.position.set(0, -.02, -20); g.add(ground);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(10, 50), roadM); road.rotation.x = -Math.PI / 2; road.position.set(0, .02, -20); g.add(road);
  const lines = new THREE.Mesh(new THREE.PlaneGeometry(10, 50), laneM); lines.rotation.x = -Math.PI / 2; lines.position.set(0, .04, -20); g.add(lines);
  for (const sx of [-6.35, 6.35]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 50), walkM); w.rotation.x = -Math.PI / 2; w.position.set(sx, .025, -20); g.add(w); }
  for (let i = 0; i < 4; i++) { const d = put(new THREE.PlaneGeometry(R(4, 9), R(2, 5)), P_(decalMats), R(-3, 3), .05, -R(2, 42)); d.rotation.x = -Math.PI / 2; d.rotation.z = R(0, 3); }
  for (const b of L.bld) {                                    // buildings + street-facing decoration
    const w = b.x1 - b.x0, d = b.z1 - b.z0, m = new THREE.Mesh(bGeo(w, b.h, d, BCOL[b.col]), winMats[b.win]); m.position.set((b.x0 + b.x1) / 2, b.h / 2, b.zc); g.add(m);
    if (!b.side) { put(new THREE.PlaneGeometry(4, 8), signMat('港', 1), 0, 13, b.z1 + .05, 0); continue; }
    const s = b.side, fx = s * 7.5, ry = -s * Math.PI / 2;
    put(new THREE.PlaneGeometry(4.2, 1.6), P_(shopMats), fx - s * .04, 1.5, b.zc, ry);
    put(new THREE.BoxGeometry(5, .2, 1.2), P_(awnMats), fx - s * .6, 3.2, b.zc, ry);
    for (const u of [-2.6, 2.6]) put(gLantern, redGlow, fx - s * .45, 2.55, b.zc + u);
    put(new THREE.PlaneGeometry(1.1, 2.2), signMat(P_(TEXTS), (r() * 5) | 0), fx - s * .7, Math.min(b.h - 2.5, R(5, 10)), b.zc + P_([-2.5, 2.5]), 0);
    put(new THREE.PlaneGeometry(1.0, 2.0), signMat(P_(TEXTS), (r() * 5) | 0), fx - s * .06, Math.min(b.h - 2, R(6, 12)), b.zc + P_([-1.2, 1.2]), ry);
    put(new THREE.BoxGeometry(.16, .16, 7.2), P_(neonMats), fx - s * .1, b.h + .1, b.zc); put(new THREE.BoxGeometry(.14, b.h * .5, .14), P_(neonMats), fx - s * .1, b.h * .45, b.zc + P_([-3.3, 3.3]));
    if (b.zc > -12) {
      put(new THREE.CylinderGeometry(.05, .06, 1.4, 6), darkMat, fx - s * .35, 3.9, b.zc + 1.8);
      put(new THREE.BoxGeometry(.28, .16, .38), darkMat, fx - s * .35, 4.65, b.zc + 1.8);
      put(new THREE.SphereGeometry(.08, 6, 5), neonMats[0], fx - s * .48, 4.65, b.zc + 1.8);
      put(new THREE.BoxGeometry(.7, 1.5, .55), darkMat, fx - s * 1.15, .75, b.zc - 2.2);
      put(new THREE.PlaneGeometry(.5, .9), neonMats[2], fx - s * 1.42, .85, b.zc - 2.2, ry);
      if (!TEST) { const spr = new THREE.Sprite(glowSpr); spr.position.set(fx - s * .45, 2.55, b.zc); spr.scale.set(2.8, 3.4, 1); g.add(spr); }
    }
  }
  if (k % 3 === 0) {                                          // torii arch over the road
    for (const x of [-6.2, 6.2]) put(new THREE.CylinderGeometry(.32, .38, 7, 10), toriiRed, x, 3.5, -2);
    put(new THREE.BoxGeometry(15, .5, .8), darkMat, 0, 7.2, -2); put(new THREE.BoxGeometry(12, .32, .45), toriiRed, 0, 6.0, -2);
  }
  mergeGroup(g);
  L.rows.forEach((o, i) => { const m = makeObstacle(o.type, k * 3 + i); m.position.set(o.lane * LANE, 0, -(o.s - k * CH)); g.add(m); o.mesh = m; });
  L.shards.forEach(o => { const m = new THREE.Mesh(gShard, shardMat); m.position.set(o.lane * LANE, 1.2, -(o.s - k * CH)); g.add(m); o.mesh = m; });
}
function freeChunk(k) { const L = layout[k]; if (!L || !L.group) return; scene.remove(L.group); L.group.traverse(o => { if (o.isMesh && !SHARED.has(o.geometry)) o.geometry.dispose(); }); L.group = null; L.rows.forEach(o => o.mesh = null); L.shards.forEach(o => o.mesh = null); }
function ensureWindow() { const k0 = Math.max(0, P.k - BEHIND), k1 = P.k + AHEAD; ensureLayout(k1); for (let k = k0; k <= k1; k++) if (!layout[k].group) buildChunk(k); for (let k = 0; k < k0; k++) freeChunk(k); }

/* ---------- state ---------- */
let state = 'title', time = 0, shake = 0, toastT = 0, best = 0; const log = { stumbles: [], toasts: [], turns: [] };
const P = { s: 0, k: 0, x: 0, lane: 0, y: 0, vy: 0, jump: false, slide: 0, queueSlide: false, speed: BASE, inv: 0, stumble: 0, sinceHit: 9, gap: GAP0, yaw: 0, camYaw: 0, pend: 0, ox: 0, oz: 0, shards: 0, walk: 0 };
try { best = +localStorage.getItem('nhr_best') || 0; } catch (e) { /* storage may be blocked */ }
const score = () => Math.floor(P.s) + P.shards * 10;
let ac = null;
function beep(f, d = .08, type = 'square', v = .04) { try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = f; g.gain.value = v; o.connect(g); g.connect(ac.destination); o.start(); g.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + d); o.stop(ac.currentTime + d); } catch (e) { /* audio optional */ } }
function toast(msg, ms = 1600) { log.toasts.push(msg); const t = $('toast'); t.textContent = msg; t.style.opacity = 1; clearTimeout(toastT); toastT = setTimeout(() => t.style.opacity = 0, ms); }
function flash() { const el = $('dmg'); if (!el) return; el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
function fx(id) { const el = $(id); if (!el) return; el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
function popXp(n, label) {
  const el = $('xpPop'); if (!el) return;
  el.textContent = '+' + n + ' XP' + (label ? '  ' + label : '');
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
}
function addXp(n, label) {
  if (n <= 0 || state !== 'playing') return;
  xp += n | 0; popXp(n | 0, label);
  while (xp >= xpNeed(level)) { xp -= xpNeed(level); level++; fx('lvlFx'); toast('LEVEL UP · ' + level, 1800); beep(920, .16, 'sine', .06); }
}

function resetRun() {
  for (let k = 0; k < layout.length; k++) freeChunk(k); layout.length = 0; lastCorner = -9; if (!TEST) runSeed = (Date.now() % 100000) + 1;
  Object.assign(P, { s: 0, k: 0, x: 0, lane: 0, y: 0, vy: 0, jump: false, slide: 0, queueSlide: false, speed: BASE, inv: 0, stumble: 0, sinceHit: 9, gap: GAP0, yaw: 0, camYaw: 0, pend: 0, ox: 0, oz: 0, shards: 0, walk: 0 });
  level = 1; xp = 0; lastStage = 0; stageHits = 0; if (chasers[3]) chasers[3].m.g.visible = false;
  log.stumbles.length = 0; log.turns.length = 0; ensureLayout(AHEAD + 1); ensureWindow(); placeActors(0);
}

/* ---------- gameplay ---------- */
function stumble(why) {
  if (P.inv > 0 || state !== 'playing') return;
  P.inv = INV; P.stumble = .5; stageHits++;
  P.gap -= 6 * (1 + 0.08 * Math.floor((level - 1) / 3));
  P.speed = Math.max(BASE, P.speed * .78); P.sinceHit = 0; shake = .35; flash(); beep(110, .18, 'sawtooth', .06);
  burst(player.g.position.x, 1.2, player.g.position.z);
  log.stumbles.push({ s: P.s, why, gap: P.gap }); if (P.gap <= GAP_MIN) caught(); else toast(why === 'turn' ? 'Missed the corner!' : 'Stumble! They are closing in');
}
function press(act) {                                         // single entry point for input (keyboard and tests)
  if (state !== 'playing') return;
  if (act === 'left' || act === 'right') {
    const dir = act === 'left' ? 1 : -1, L = layout[P.k];
    if (L && L.turn === dir && P.s > (P.k + 1) * CH - TURN_WINDOW) { P.pend = dir; beep(520, .05, 'triangle'); return; }   // corner ahead in this direction -> turn
    P.lane = clamp(P.lane + (act === 'left' ? -1 : 1), -1, 1); beep(380, .04, 'triangle', .02);
  } else if (act === 'jump') { if (!P.jump) { P.jump = true; P.vy = JUMP_V; P.slide = 0; beep(600, .08, 'sine', .04); } }
  else if (act === 'slide') { if (P.jump) { P.vy = -22; P.queueSlide = true; } else P.slide = .75; }
}
function updRun(dt) {
  P.speed = Math.min(MAXS, P.speed + ACC * dt); const s0 = P.s; P.s += P.speed * dt; P.x = damp(P.x, P.lane * LANE, 22, dt);
  P.sinceHit += dt; P.inv = Math.max(0, P.inv - dt); P.stumble = Math.max(0, P.stumble - dt); P.slide = Math.max(0, P.slide - dt);
  if (P.jump) { P.y += P.vy * dt; P.vy -= GRAV * dt; if (P.y <= 0) { P.y = 0; P.jump = false; P.vy = 0; if (P.queueSlide) { P.queueSlide = false; P.slide = .6; } } }
  const recover = level <= 2 ? .5 : Math.max(.35, .5 * (1 - 0.06 * (level - 2)));
  if (P.sinceHit > 3 && P.gap < GAP0) P.gap = Math.min(GAP0, P.gap + recover * dt);
  // junctions
  while (P.s >= (P.k + 1) * CH) {
    const old = posAt(P.s, P.x, P.k), prevL = layout[P.k]; P.k++; ensureLayout(P.k + AHEAD);
    if (prevL.turn) { const ok = P.pend === prevL.turn; log.turns.push({ k: P.k, ok }); P.pend = 0; if (!ok) stumble('turn'); else { beep(700, .1, 'sine', .05); toast('Nice turn!', 900); addXp(15, 'turn'); }
      const nw = posAt(P.s, P.x, P.k); P.ox = old.x - nw.x; P.oz = old.z - nw.z; }                // hide the corner pop-in; decays below
    ensureWindow();
  }
  P.ox = damp(P.ox, 0, 12, dt); P.oz = damp(P.oz, 0, 12, dt);
  // obstacles (path-space collision) in this and neighbouring chunks
  const h = P.slide > 0 ? SLIDE_H : STAND_H;
  for (let k = Math.max(0, P.k - 1); k <= P.k + 1; k++) { const L = layout[k]; if (!L) continue;
    for (const o of L.rows) { if (o.hit || o.s < s0 - .85 || o.s > P.s + .85 || Math.abs(P.x - o.lane * LANE) > 1.05) continue;   // swept test: slow frames cannot tunnel through
      const hitIt = o.type === 'barrier' ? P.y < .95 : o.type === 'gate' ? P.y + h > 1.4 : true;
      if (hitIt) { o.hit = true; if (o.mesh) o.mesh.visible = false; stumble(o.type); } }
    for (const o of L.shards) { if (o.got || o.s < s0 - 1.1 || o.s > P.s + 1.1 || Math.abs(P.x - o.lane * LANE) > 1.3 || P.y > 1.6 || h < 1.3) continue; o.got = true; if (o.mesh) o.mesh.visible = false; P.shards++; beep(880 + P.shards % 5 * 80, .07, 'sine', .05); fx('hackFx'); addXp(12, 'shard'); } }
  const st = Math.floor(P.s / 200);
  if (st > lastStage) {
    const clean = stageHits === 0; lastStage = st;
    addXp(60, 'stage'); if (clean) addXp(25, 'clean');
    stageHits = 0; toast(clean ? 'Clean stage' : 'Stage ' + st, 1100);
  }
  if (P.gap <= GAP_MIN && state === 'playing') caught();
}
function caught() { if (state !== 'playing') return; state = 'over'; P.gap = Math.min(P.gap, 2); const sc = score(); if (sc > best) { best = sc; try { localStorage.setItem('nhr_best', String(best)); } catch (e) { /* ignore */ } }
  $('overStats').textContent = 'Score ' + sc + ' • Lv ' + level + ' • Distance ' + Math.floor(P.s) + ' m • Shards ' + P.shards + ' • Best ' + best; show('over', true); setTouch(false); beep(70, .6, 'sawtooth', .07); }

/* ---------- actors, camera, HUD ---------- */
const V = new THREE.Vector3();
function placeActors(dt) {
  const p = posAt(P.s, P.x); P.yaw += angDiff(P.yaw, p.th) * (1 - Math.exp(-10 * Math.max(dt, .016)));
  const g = player.g; g.position.set(p.x + P.ox, P.y, p.z + P.oz); g.rotation.y = P.yaw; g.rotation.z = -(P.lane * LANE - P.x) * .06;
  const sl = P.slide > 0 && !P.jump, wk = state === 'playing' ? 1 : 0; P.walk += dt * (12 + P.speed * .4);
  H.animate(player, { phase: P.walk, run: wk, air: P.jump || P.queueSlide, slide: sl, stumble: P.stumble > 0, speed01: (P.speed - BASE) / (MAXS - BASE) * .6 + .4, lat: P.lane * LANE - P.x }, dt);
  g.visible = P.inv <= 0 || Math.floor(time * 16) % 2 === 0; blob.position.set(g.position.x, .06, g.position.z); blob.rotation.z = P.yaw; blob.scale.setScalar(Math.max(.4, 1 - P.y * .25));
  chasers.forEach((c, i) => {
    const show = i < 3 || level >= 5; c.m.g.visible = show; if (!show) return;
    const q = posAt(P.s - P.gap - c.off, c.lx), m = c.m;
    m.g.position.set(q.x, 0, q.z); m.g.rotation.y = q.th;
    H.animate(m, { phase: P.walk * .95 + i * 1.3, run: wk, reach: P.gap < 7 ? 1 : 0, speed01: .8 }, dt);
  });
  if (haze.parent) { haze.position.x = g.position.x; haze.position.z = g.position.z; haze.rotation.y = P.yaw; }
  const px = g.position.x, pz = g.position.z, hx = -Math.sin(P.camYaw), hz = -Math.cos(P.camYaw), rx = Math.cos(P.camYaw), rz = -Math.sin(P.camYaw);
  runLights[0].position.set(px - rx * 3 + hx * 3, 4, pz - rz * 3 + hz * 3); runLights[1].position.set(px + rx * 3 + hx * 6, 4, pz + rz * 3 + hz * 6); runLights[2].position.set(px + hx * 14, 5, pz + hz * 14);
}
function updCam(dt) {
  const g = player.g.position; P.camYaw += angDiff(P.camYaw, layout[Math.max(0, Math.floor(P.s / CH))].th) * (1 - Math.exp(-4.5 * dt));
  const sn = Math.sin(P.camYaw), cs = Math.cos(P.camYaw), bounce = shake > 0 ? 1 : 0;
  camera.position.set(g.x + sn * 7.4 + rr(-1, 1) * shake * .25 * bounce, 4.3 + P.y * .35 + rr(-1, 1) * shake * .25 * bounce, g.z + cs * 7.4);
  camera.lookAt(g.x - sn * 9, 1.3 + P.y * .4, g.z - cs * 9);
  const fov = 68 + (P.speed - BASE) / (MAXS - BASE) * 18; if (Math.abs(camera.fov - fov) > .05) { camera.fov = damp(camera.fov, fov, 5, dt); camera.updateProjectionMatrix(); }
  sky.position.copy(camera.position); skyline.position.x = camera.position.x; skyline.position.z = camera.position.z;
}
const last = {}; const setT = (id, v) => { if (last[id] !== v) { last[id] = v; $(id).textContent = v; } };
const setW = (id, v) => { const k = Math.round(v); if (last[id] !== k) { last[id] = k; $(id).style.width = k + '%'; } };
function hud() {
  setT('scoreTxt', String(score())); setT('distTxt', Math.floor(P.s) + ' m'); setT('shardsTxt', String(P.shards)); setT('bestTxt', String(Math.max(best, score())));
  setW('hpFill', (P.gap - GAP_MIN) / (GAP0 - GAP_MIN) * 100); setW('stFill', (P.speed - BASE) / (MAXS - BASE) * 100);
  const need = xpNeed(level); setT('lvlTxt', String(level)); setT('xpNum', xp + ' / ' + need + ' XP'); setW('xpFill', Math.min(100, xp / need * 100));
  const nxt = (lastStage + 1) * 200;
  setT('objTxt', P.s < 80 ? 'Learn the street — jump, slide, switch lanes' : 'Reach ' + nxt + ' m · grab shards · stay clean for a bonus');
  const hudEl = $('hud'); if (hudEl) hudEl.classList.toggle('alert-hot', P.gap < 6);
  const L = layout[P.k], on = !!(L && L.turn && P.s > (P.k + 1) * CH - TURN_WINDOW && !P.pend), pr = $('prompt');
  pr.classList.toggle('on', on); if (on) setT('prompt', L.turn > 0 ? '◄  TURN LEFT' : 'TURN RIGHT  ►');
}
function step(dt) {
  time += dt; shake = Math.max(0, shake - dt); if (!TEST) { updRain(dt); updSparks(dt); }
  if (state === 'playing') { updRun(dt); }
  if (state === 'playing' || state === 'title') { placeActors(dt); updCam(dt); }
  for (let k = Math.max(0, P.k - 1); k <= P.k + 4 && k < layout.length; k++) for (const o of layout[k].shards) if (o.mesh && !o.got) o.mesh.rotation.y += dt * 3;
  if (state === 'playing') hud();
}

/* ---------- flow & input ---------- */
function setTouch(on) { show('touch', on); }
function begin() { for (const id of ['title', 'pause', 'over']) show(id, false); show('hud', true); setTouch(true); resetRun(); state = 'playing'; toast('Run! First gates after a short stretch', 1800); }
function pause() { if (state === 'playing') { state = 'paused'; show('pause', true); setTouch(false); } }
function resume() { if (state === 'paused') { show('pause', false); setTouch(true); state = 'playing'; } }
if (!TEST) {
  const MAP = { KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', KeyW: 'jump', ArrowUp: 'jump', Space: 'jump', KeyS: 'slide', ArrowDown: 'slide', ShiftLeft: 'slide', ShiftRight: 'slide' };
  document.addEventListener('keydown', e => {
    if (MAP[e.code] || e.code === 'Escape') e.preventDefault();
    if (e.code === 'Escape' || e.code === 'KeyP') { if (!e.repeat) { if (state === 'playing') pause(); else if (state === 'paused') resume(); } return; }
    if (!e.repeat && MAP[e.code]) press(MAP[e.code]);
  });
  const coarse = matchMedia('(pointer: coarse)').matches;
  if (!coarse) addEventListener('blur', pause);
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); if (renderer) renderer.setSize(innerWidth, innerHeight); });
  document.querySelectorAll('#touch [data-act]').forEach(b => {
    const fire = e => { e.preventDefault(); e.stopPropagation(); press(b.getAttribute('data-act')); };
    b.addEventListener('pointerdown', fire);
  });
  if ($('pauseTouch')) $('pauseTouch').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); pause(); });
  let sx = 0, sy = 0, sAt = 0;
  addEventListener('pointerdown', e => {
    if (state !== 'playing' || e.target.closest('#touch, button, .card')) return;
    sx = e.clientX; sy = e.clientY; sAt = performance.now();
  });
  addEventListener('pointerup', e => {
    if (state !== 'playing' || !sAt || e.target.closest('#touch, button, .card')) { sAt = 0; return; }
    const dx = e.clientX - sx, dy = e.clientY - sy, adx = Math.abs(dx), ady = Math.abs(dy);
    sAt = 0;
    if (adx < 36 && ady < 36) return;
    if (adx > ady) press(dx < 0 ? 'left' : 'right'); else press(dy < 0 ? 'jump' : 'slide');
  });
  const padHeld = {};
  addEventListener('gamepadconnected', () => toast('Controller connected', 1400));
  const pollPad = () => {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const g = pads && (pads[0] || pads[1] || pads[2] || pads[3]);
    if (!g || state !== 'playing') return;
    const hit = (i, act) => { const on = !!(g.buttons[i] && g.buttons[i].pressed); if (on && !padHeld[i]) press(act); padHeld[i] = on; };
    hit(14, 'left'); hit(15, 'right'); hit(12, 'jump'); hit(13, 'slide'); hit(0, 'jump'); hit(1, 'slide');
    const ax = g.axes[0] || 0, ay = g.axes[1] || 0;
    if (ax < -0.55 && !padHeld.axL) { press('left'); padHeld.axL = true; } else if (ax >= -0.4) padHeld.axL = false;
    if (ax > 0.55 && !padHeld.axR) { press('right'); padHeld.axR = true; } else if (ax <= 0.4) padHeld.axR = false;
    if (ay < -0.55 && !padHeld.axU) { press('jump'); padHeld.axU = true; } else if (ay >= -0.4) padHeld.axU = false;
    if (ay > 0.55 && !padHeld.axD) { press('slide'); padHeld.axD = true; } else if (ay <= 0.4) padHeld.axD = false;
    if (g.buttons[9] && g.buttons[9].pressed && !padHeld.start) { pause(); padHeld.start = true; } else if (!g.buttons[9] || !g.buttons[9].pressed) padHeld.start = false;
  };
  const _loopPad = () => { pollPad(); requestAnimationFrame(_loopPad); };
  requestAnimationFrame(_loopPad);
}
$('startBtn').addEventListener('click', begin); $('resumeBtn').addEventListener('click', resume); ['rs1', 'rs2'].forEach(id => $(id).addEventListener('click', begin));

/* ---------- init ---------- */
resetRun(); show('hud', false);
if (TEST) window.NH = { THREE, scene, camera, setNoObstacles: v => noObstacles = v, step, begin, pause, resume, press, P, layout, posAt, player, chasers, log, CH, LANE, BASE, MAXS, GAP0, GAP_MIN, STAND_H, SLIDE_H, ensureWindow, setSeed: s => runSeed = s,
  get state() { return state; }, get score() { return score(); }, get level() { return level; }, get xp() { return xp; } };
else { const clock = new THREE.Clock(); (function loop() { requestAnimationFrame(loop); step(Math.min(clock.getDelta(), .05)); renderer.render(scene, camera); })(); }
})();
