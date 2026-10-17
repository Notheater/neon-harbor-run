const { JSDOM, VirtualConsole } = require('jsdom');
const path = require('path');
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => { if (!/getContext|Not implemented/.test(String(e.message))) errors.push('jsdomError: ' + e.message); });
vc.on('error', e => errors.push('console.error: ' + e));
JSDOM.fromFile(path.resolve(__dirname, '..', 'index.html'), { runScripts: 'dangerously', resources: 'usable', virtualConsole: vc, pretendToBeVisual: true,
  beforeParse(w) { w.NH_TEST = true; } }).then(dom => new Promise(res => dom.window.addEventListener('load', () => res(dom)))).then(dom => {
  const w = dom.window, NH = w.NH, P = NH.P; let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
  const frames = (n, dt = 1 / 60, fn) => { for (let i = 0; i < n; i++) { if (fn) fn(i); NH.step(dt); } };
  const DT = 1 / 60;
  const tele = (k, local = 0) => { P.k = k; P.s = k * NH.CH + local; NH.ensureWindow(); };         // teleport on the path
  const addRow = (k, local, lane, type) => { const o = { s: k * NH.CH + local, lane, type, hit: false, mesh: null }; NH.layout[k].rows.push(o); return o; };
  const fresh = () => { NH.setNoObstacles(true); NH.begin(); NH.layout.forEach(L => { L.rows.length = 0; L.shards.length = 0; }); };   // clean course with no random obstacles
  const dom_ = id => w.document.getElementById(id);

  ok(NH && typeof NH.step === 'function', 'NH test API present'); ok(NH.state === 'title', 'starts on title'); frames(30); ok(isFinite(NH.player.g.position.x), 'title scene steps');
  NH.begin(); ok(NH.state === 'playing', 'begin -> playing'); ok(!dom_('title').classList.contains('hidden') === false, 'title hidden');
  ok(NH.layout.length >= 8, 'layout generated ahead (' + NH.layout.length + ')');

  // ---- speed & distance
  const autoTurn = () => { const L = NH.layout[P.k]; if (L && L.turn && P.s > (P.k + 1) * NH.CH - 26 && !P.pend) NH.press(L.turn > 0 ? 'left' : 'right'); };
  fresh(); frames(120); ok(P.s > 30, 'auto-runs forward: ' + P.s.toFixed(1)); ok(P.speed > NH.BASE, 'speed ramps up'); frames(60 * 70, DT, autoTurn); ok(Math.abs(P.speed - NH.MAXS) < .01, 'speed caps at max: ' + P.speed.toFixed(1));
  ok(NH.state === 'playing', 'no random death on empty course');

  // ---- lanes
  fresh(); NH.press('left'); ok(P.lane === -1, 'left -> lane -1'); NH.press('left'); ok(P.lane === -1, 'lane clamps at left edge'); frames(40); ok(Math.abs(P.x + NH.LANE) < .05, 'x eases to lane center (' + P.x.toFixed(2) + ')');
  NH.press('right'); NH.press('right'); NH.press('right'); ok(P.lane === 1, 'right x2 -> lane +1 (clamped)');

  // ---- jump physics
  fresh(); NH.press('jump'); let apex = 0, air = 0; while (P.jump && air < 200) { NH.step(DT); apex = Math.max(apex, P.y); air++; } ok(apex > 1.8 && apex < 2.3, 'jump apex ~2 m: ' + apex.toFixed(2)); ok(air / 60 > .6 && air / 60 < .85, 'airtime ~0.73s: ' + (air / 60).toFixed(2)); ok(P.y === 0, 'lands on ground');

  // ---- obstacles: barrier (jump), gate (slide), wall (switch lane)
  const trial = (type, action) => { fresh(); tele(3, 0); const o = addRow(3, 30, 0, type); let acted = false;
    for (let i = 0; i < 600 && NH.state === 'playing' && P.s < o.s + 4; i++) { const d = o.s - P.s; if (!acted && action && d < (action === 'jump' ? P.speed * .28 : action === 'slide' ? P.speed * .14 : P.speed * .4)) { acted = true; NH.press(action); } NH.step(DT); }
    return NH.P.sinceHit < 9 || NH.log.stumbles.length; };
  ok(trial('barrier', null) > 0, 'barrier: running into it = stumble'); ok(!trial('barrier', 'jump'), 'barrier: jump clears it');
  ok(trial('gate', null) > 0, 'gate: running into it = stumble'); ok(!trial('gate', 'slide'), 'gate: slide passes under it'); ok(trial('gate', 'jump') > 0, 'gate: jumping into it = stumble');
  ok(trial('wall', null) > 0, 'wall: running into it = stumble'); ok(trial('wall', 'jump') > 0, 'wall: cannot be jumped'); ok(!trial('wall', 'left'), 'wall: switching lane avoids it');
  ok(trial('barrier', 'slide') > 0, 'barrier: sliding does not avoid it');

  // ---- wall-bounce perk: one lateral save off a wall, then spent
  fresh(); NH.setRebound(1); tele(3, 0); addRow(3, 12, 0, 'wall'); P.lane = 0; P.x = 0;
  frames(90); ok(NH.log.stumbles.length === 0, 'armed rebound: wall clip does not stumble'); ok(NH.state === 'playing', 'armed rebound: run continues');
  ok(NH.rebound === 0, 'one bounce consumes rebound'); ok(P.lane !== 0, 'bounce kicks to another lane (lane ' + P.lane + ')');
  P.inv = 0; addRow(P.k, Math.floor(P.s - P.k * NH.CH) + 8, P.lane, 'wall'); frames(80);
  ok(NH.log.stumbles.length >= 1, 'second wall after rebound spent = stumble');
  fresh(); P.x = NH.PATH_HALF + .2; P.lane = 1; NH.setRebound(1); const xRail = P.x; frames(2);
  ok(NH.state === 'playing', 'rebound keeps the run alive at the rail'); ok(NH.rebound === 0, 'edge bounce spends the perk');
  ok(Math.abs(P.x) > Math.abs(xRail), 'bounce carries the runner toward the building (x ' + P.x.toFixed(2) + ')');
  let railPeak = Math.abs(P.x); frames(50, DT, () => { railPeak = Math.max(railPeak, Math.abs(P.x)); });
  ok(railPeak > 6.5, 'rail save reaches the building face (' + railPeak.toFixed(2) + ')');
  ok(Math.abs(P.x) < NH.PATH_HALF - .2, 'runner returns to the street after the building (x ' + P.x.toFixed(2) + ')');
  fresh(); P.x = NH.PATH_HALF + .2; P.lane = 1; frames(2);
  ok(NH.state === 'over', 'path-edge clip without rebound = caught');
  // extra TAP at a settled outer lane still clamps; HOLD into that rail is the fail/save
  fresh(); NH.press('left'); frames(40); NH.press('left'); frames(20);
  ok(NH.state === 'playing' && P.lane === -1 && Math.abs(P.x + NH.LANE) < .15, 'extra tap at settled left edge still clamps (no rail death)');
  fresh(); NH.press('left'); frames(40); NH.hold('left', true); frames(50);
  ok(NH.state === 'over', 'holding into the left rail without rebound = caught');
  NH.hold('left', false);
  fresh(); NH.press('left'); frames(40); NH.setRebound(1); frames(1);
  ok(dom_('perkChip') && !dom_('perkChip').classList.contains('hidden') && /REBOUND/.test(dom_('perkChip').textContent), 'HUD shows Rebound armed');
  ok(/WALL BOUNCE/.test(dom_('powerTxt').textContent), 'vitals line lists WALL BOUNCE while armed');
  NH.hold('left', true); frames(50);
  ok(NH.state === 'playing', 'holding into the rail with Rebound = bounce save'); ok(NH.rebound === 0, 'rail slam spends Rebound');
  ok(P.lane !== -1 || Math.abs(P.x) < NH.PATH_HALF - .2, 'bounce kicks back onto the street (lane ' + P.lane + ', x ' + P.x.toFixed(2) + ')');
  ok(dom_('perkChip').classList.contains('hidden'), 'HUD hides Rebound after the save');
  NH.hold('left', false);
  fresh(); const lane0 = P.lane; NH.press('wall');
  ok(NH.rebound === 0, 'wall jump does not need the perk'); ok(P.lane !== lane0, 'wall jump picks a landing lane (lane ' + P.lane + ')');
  ok(NH.state === 'playing', 'wall jump keeps the run going');
  let jumpPeak = Math.abs(P.x); frames(70, DT, () => { jumpPeak = Math.max(jumpPeak, Math.abs(P.x)); });
  ok(jumpPeak > 6.5, 'E/Enter reaches the building face (' + jumpPeak.toFixed(2) + ')');
  ok(Math.abs(P.x) < 3.2, 'wall jump returns to the street (x ' + P.x.toFixed(2) + ')');
  NH.press('wall'); ok(NH.state === 'playing', 'E/Enter wall jump works again immediately');

  // ---- stumble consequences & game over
  fresh(); tele(3, 0); addRow(3, 12, 0, 'wall'); addRow(3, 16, 0, 'wall'); const sp0 = P.speed; frames(60);
  ok(NH.log.stumbles.length === 1, 'first wall = one stumble; second wall inside invulnerability ignored (stumbles ' + NH.log.stumbles.length + ')');
  ok(Math.abs(P.gap - (NH.GAP0 - 6)) < 1, 'gang closes in by 6 m (gap ' + P.gap.toFixed(1) + ')'); ok(P.speed <= sp0 + .5, 'speed penalty applied'); ok(NH.state === 'playing', 'survives first stumble');
  P.inv = 0; P.k = P.k; const o2 = addRow(P.k, Math.floor(P.s - P.k * NH.CH) + 6, 0, 'wall'); P.lane = 0; frames(60); ok(NH.state === 'over', 'second stumble while gang is close -> caught / game over');
  ok(!dom_('over').classList.contains('hidden'), 'game-over screen shown'); ok(/Score/.test(dom_('overStats').textContent), 'game-over stats shown'); const sOver = P.s; frames(60); ok(P.s === sOver, 'run frozen after game over');
  // gap recovery when running clean
  fresh(); P.gap = 8; P.sinceHit = 0; frames(60 * 4); ok(P.gap > 8 && P.gap <= NH.GAP0, 'gap recovers while running clean (' + P.gap.toFixed(1) + ')');

  // ---- shards
  fresh(); tele(3, 0); NH.layout[3].shards.push({ s: 3 * NH.CH + 10, lane: 0, got: false, mesh: null }); NH.layout[3].shards.push({ s: 3 * NH.CH + 14, lane: 1, got: false, mesh: null }); frames(90);
  ok(P.shards === 1, 'collects shard in own lane only (shards ' + P.shards + ')'); ok(NH.score >= P.shards * 10, 'score includes shard bonus');

  // ---- corners
  fresh(); const kc = NH.layout.findIndex(L => L.turn); ok(kc >= 6, 'a corner exists within the first chunks (chunk ' + kc + ')');
  const dir = NH.layout[kc].turn, key = dir > 0 ? 'left' : 'right';
  tele(kc, 2); frames(5); ok(!dom_('prompt').classList.contains('on'), 'no turn prompt far from corner'); NH.press(key); ok(P.pend === 0 && P.lane === (dir > 0 ? -1 : 1), 'early press = lane change, not a turn');
  fresh(); tele(kc, 18); P.lane = 0; P.x = 0; frames(2); ok(dom_('prompt').classList.contains('on'), 'turn prompt appears in the window'); ok(/TURN/.test(dom_('prompt').textContent), 'prompt text set');
  NH.press(key); ok(P.pend === dir && P.lane === 0, 'press in window queues the turn (no lane change)'); frames(140); ok(P.k === kc + 1, 'crossed the junction'); ok(NH.log.stumbles.length === 0, 'correct turn = no stumble');
  ok(NH.log.turns.length === 1 && NH.log.turns[0].ok, 'turn logged ok'); frames(90); ok(Math.abs(Math.atan2(Math.sin(P.yaw - NH.layout[kc + 1].th), Math.cos(P.yaw - NH.layout[kc + 1].th))) < .05, 'player yaw follows new heading');
  const wrong = dir > 0 ? 'right' : 'left'; fresh(); tele(kc, 18); NH.press(wrong); ok(P.pend === 0, 'wrong-direction press does not queue turn'); frames(140);
  ok(NH.log.stumbles.length === 1 && NH.log.stumbles[0].why === 'turn', 'missing the corner = stumble but run continues'); ok(P.k === kc + 1 && NH.state === 'playing', 'auto-turned after miss');
  // world continuity through the corner
  fresh(); tele(kc, 10); P.lane = 1; P.x = NH.LANE; NH.press(key); frames(1); let prev = NH.player.g.position.clone(), maxStep = 0;
  for (let i = 0; i < 120; i++) { NH.step(DT); const c = NH.player.g.position; maxStep = Math.max(maxStep, c.distanceTo(prev)); prev = c.clone(); } ok(maxStep < 1.4, 'player motion is continuous through the corner (max step ' + maxStep.toFixed(2) + ')');

  // ---- street geometry: no building overlaps a road or another building (first 150 chunks)
  const rect = (L, x0, x1, z0, z1) => { const sn = Math.sin(L.th), cs = Math.cos(L.th), pts = [[x0, z0], [x1, z0], [x0, z1], [x1, z1]].map(([lx, lz]) => [L.ox + sn * lz + cs * lx, L.oz + cs * lz - sn * lx]);
    return { x0: Math.min(...pts.map(p => p[0])), x1: Math.max(...pts.map(p => p[0])), z0: Math.min(...pts.map(p => p[1])), z1: Math.max(...pts.map(p => p[1])) }; };
  const hit = (a, b) => a.x0 < b.x1 - .05 && a.x1 > b.x0 + .05 && a.z0 < b.z1 - .05 && a.z1 > b.z0 + .05;
  NH.begin(); for (let k = 0; k < 150; k++) NH.posAt(0, 0, k);
  const roads = NH.layout.map(L => rect(L, -5, 5, -45, 5)), blds = NH.layout.map(L => L.bld.map(b => ({ r: rect(L, b.x0, b.x1, b.z0, b.z1), k: L.k })));
  let bad = 0, corners = 0; for (let k = 0; k < 150; k++) { if (NH.layout[k].turn) corners++; for (const b of blds[k]) for (let j = Math.max(0, k - 14); j <= Math.min(149, k + 14); j++) { if (hit(b.r, roads[j])) bad++; for (const c of blds[j]) if ((j > k || (j === k && c !== b)) && hit(b.r, c.r)) bad++; } }
  ok(bad === 0, 'no building overlaps a street or another building across 150 chunks (' + bad + ' overlaps)'); ok(corners > 8, 'corners occur regularly (' + corners + ' in 150 chunks)');
  const gaps = []; let lastC = -99; NH.layout.forEach((L, k) => { if (L.turn) { gaps.push(k - lastC); lastC = k; } }); ok(Math.min(...gaps.slice(1)) >= 5, 'corners at least 5 chunks apart');
  // fairness invariants: every row has a free lane; consecutive free lanes at most 1 apart
  NH.setNoObstacles(false); NH.begin(); for (let k = 0; k < 150; k++) NH.posAt(0, 0, k);
  let unfair = 0, reach = [-1, 0, 1]; for (let k = 3; k < 150; k++) for (const sl of NH.layout[k].turn ? [14] : [14, 30]) { const taken = new Set(NH.layout[k].rows.filter(o => o.s === k * NH.CH + sl).map(o => o.lane)); const free = [-1, 0, 1].filter(l => !taken.has(l)); const nr = free.filter(l => reach.some(r => Math.abs(r - l) <= 1)); if (!nr.length) unfair++; reach = nr.length ? nr : free; }
  ok(unfair === 0, 'every obstacle row is dodgeable from the previous free lane (' + unfair + ' violations)');

  // ---- perfect-play bot soak (also proves the generated course is always survivable)
  NH.setNoObstacles(false); NH.setSeed(777); NH.begin(); let frameN = 0, maxS = 0, nan = 0, camBad = 0, prevPos = NH.player.g.position.clone();
  const freeOf = (rows, s0) => { const taken = new Set(rows.filter(o => Math.abs(o.s - s0) < .1).map(o => o.lane)); return [-1, 0, 1].filter(l => !taken.has(l)); };
  const bot = () => { const rows = []; for (let k = Math.max(0, P.k - 1); k <= P.k + 3; k++) for (const o of NH.layout[k].rows) if (o.s > P.s - 1.3) rows.push(o); rows.sort((a, b) => a.s - b.s);
    if (rows.length) { const s0 = rows[0].s, free = freeOf(rows, s0), nxt = rows.find(o => o.s > s0 + .5), f2 = nxt ? freeOf(rows, nxt.s) : [-1, 0, 1];
      const good = free.filter(l => f2.some(m => Math.abs(m - l) <= 1)); const t = (good.length ? good : free).sort((a, b) => Math.abs(a - P.lane) - Math.abs(b - P.lane))[0];
      for (let n = 0; n < 2 && P.lane !== t; n++) NH.press(t < P.lane ? 'left' : 'right'); }                       // lookahead: pick a lane that still has an exit on the following row
    const L = NH.layout[P.k]; if (L.turn && P.s > (P.k + 1) * NH.CH - 26 && !P.pend) NH.press(L.turn > 0 ? 'left' : 'right'); };
  for (let i = 0; i < 60 * 60 * 6 && NH.state === 'playing'; i++) { bot(); NH.step(DT); frameN++; const c = NH.camera.position; if (![c.x, c.y, c.z, NH.player.g.position.x].every(isFinite)) nan++; if (NH.player.g.position.distanceTo(prevPos) > 2.5) camBad++; prevPos = NH.player.g.position.clone(); }
  ok(NH.state === 'playing', 'bot survives 6 simulated minutes (state ' + NH.state + ', stumbles ' + NH.log.stumbles.length + ')'); ok(NH.log.stumbles.length === 0, 'perfect play never stumbles'); ok(NH.log.turns.length > 10 && NH.log.turns.every(t => t.ok), 'bot took ' + NH.log.turns.length + ' corners, all successful');
  ok(P.s > 8000, 'distance reached: ' + Math.round(P.s) + ' m'); ok(P.shards > 40, 'bot collected shards: ' + P.shards); ok(nan === 0, 'no NaN positions'); ok(camBad === 0, 'no player teleports / jumps >2.5 units per frame (' + camBad + ')');
  const built = NH.layout.filter(L => L.group).length; ok(built <= 12, 'only the window of chunks stays built (' + built + ' of ' + NH.layout.length + ' generated)');
  ok(NH.layout.slice(0, Math.max(0, P.k - 3)).every(L => !L.group), 'chunks behind the runner are freed');
  let meshes = 0; NH.scene.traverse(o => { if (o.isMesh) meshes++; }); console.log('   scene meshes (≈ draw calls):', meshes, '| chunks generated:', NH.layout.length, '| distance:', Math.round(P.s), 'm');
  ok(meshes < 500, 'draw-call budget < 500 (' + meshes + ')');

  // ---- pause / resume / restart
  NH.begin(); frames(20); const s1 = P.s; NH.pause(); ok(NH.state === 'paused', 'pause'); ok(!dom_('pause').classList.contains('hidden'), 'pause menu shown'); frames(60); ok(P.s === s1, 'world frozen while paused'); NH.press('left'); ok(P.lane === 0, 'input ignored while paused');
  NH.resume(); ok(NH.state === 'playing', 'resume'); frames(20); ok(P.s > s1, 'runs again after resume'); NH.begin(); ok(P.s === 0 && P.shards === 0 && P.gap === NH.GAP0 && NH.state === 'playing', 'restart resets the run');
  ok(errors.length === 0, 'no JS errors: ' + errors.join(' | '));
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
}).catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
