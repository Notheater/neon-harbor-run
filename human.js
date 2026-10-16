/* =====================================================================
   NHHuman — procedural, human-proportioned character rig for Three.js r149
   (classic script; exposes window.NHHuman = { create, animate })

   Skeleton (units ≈ metres, ~2.1 tall, feet on y = 0, facing -Z):
     root > model > hips > spine > head > pony
                    hips > hip(L/R) > knee > ankle
                    spine > shoulder(L/R) > elbow
   Every bone carries its body parts merged per material (≈ 30 meshes per
   character), so four characters cost about 120 draw calls.

   animate(h, {phase, run, air, slide, stumble, reach, lat}, dt) blends run /
   air / slide / stumble poses, plants feet on the ground with a tiny
   analytic IK (hips are lowered until the lowest foot touches y = 0) and
   adds secondary motion (ponytail spring, torso twist, head counter-pitch).
   ===================================================================== */
(function () {
'use strict';
const T = window.THREE;
if (!T) return;
const damp = T.MathUtils.damp, lerp = T.MathUtils.lerp;

/* ---- geometry baking: merge many primitives into one mesh per material ---- */
const P = (g, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => ({ g, m, p: [x, y, z], r: [rx, ry, rz], s: [sx, sy, sz] });
function bake(parts) {
  const by = new Map(), m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), pos = new T.Vector3(), sc = new T.Vector3(), nm = new T.Matrix3(), v = new T.Vector3();
  for (const p of parts) {
    e.set(p.r[0], p.r[1], p.r[2]); q.setFromEuler(e); pos.set(p.p[0], p.p[1], p.p[2]); sc.set(p.s[0], p.s[1], p.s[2]); m4.compose(pos, q, sc); nm.getNormalMatrix(m4);
    const g = p.g.index ? p.g.toNonIndexed() : p.g, pa = g.attributes.position, na = g.attributes.normal, ua = g.attributes.uv;
    let b = by.get(p.m); if (!b) { b = { pos: [], nor: [], uv: [] }; by.set(p.m, b); }
    for (let i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i).applyMatrix4(m4); b.pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(na, i).applyMatrix3(nm).normalize(); b.nor.push(v.x, v.y, v.z); b.uv.push(ua.getX(i), ua.getY(i));
    }
    if (g !== p.g) g.dispose(); p.g.dispose();
  }
  return [...by].map(([m, b]) => {
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(b.pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(b.nor, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(b.uv, 2));
    return new T.Mesh(g, m);
  });
}
const cap = (r, len) => new T.CapsuleGeometry(r, len, 4, 10), sph = r => new T.SphereGeometry(r, 14, 10), box = (w, h, d) => new T.BoxGeometry(w, h, d), cyl = (a, b, h, s = 12) => new T.CylinderGeometry(a, b, h, s);

/* ---- character factory ---- */
const DEFAULTS = { skin: 0xe0ac84, jacket: 0x14b8e0, trim: 0x64e6ff, pants: 0x1a2236, shoe: 0xe8f4ff, sole: 0xff3df2, hair: 0x1a1020, hairTip: 0xff3df2, tie: 0xff1a3c,
  style: 'pony',            // hair: 'pony' | 'slick' | 'spiky' | 'buzz'
  pack: true,               // backpack with LED strip + hood
  suit: false,              // collar, shirt front and tie instead of hood/pack
  glasses: false, build: 1  // build scales width/depth (not height)
};
function create(opts) {
  const o = Object.assign({}, DEFAULTS, opts), std = (c, r = .6, m = 0) => new T.MeshStandardMaterial({ color: c, roughness: r, metalness: m }), glow = (c, k = 2.2) => new T.MeshBasicMaterial({ color: new T.Color(c).multiplyScalar(k), toneMapped: false });
  const M = { skin: std(o.skin, .65), jacket: std(o.jacket, .5, .12), pants: std(o.pants, .7), shoe: std(o.shoe, .5), hair: std(o.hair, .45, .1), dark: std(0x08080c, .4), shirt: std(0xe9e9f2, .7),
    trim: glow(o.trim), sole: glow(o.sole), tip: glow(o.hairTip), tie: glow(o.tie), lens: glow(0xff2a3c, 1.6) };
  const root = new T.Group(), model = new T.Group(); model.scale.set(.95 * o.build, .95, .95 * o.build); root.add(model);
  const bone = (parent, x = 0, y = 0, z = 0) => { const b = new T.Group(); b.position.set(x, y, z); parent.add(b); return b; };
  const attach = (b, parts) => bake(parts).forEach(m => b.add(m));
  const hips = bone(model, 0, 1.125, 0), spine = bone(hips, 0, .1, 0), head = bone(spine, 0, .72, 0), pony = bone(head, 0, .2, .1);
  const sh = [-1, 1].map(s => bone(spine, s * .255, .56, 0)), el = sh.map(b => bone(b, 0, -.32, 0));
  const hp = [-1, 1].map(s => bone(hips, s * .1, -.04, 0)), kn = hp.map(b => bone(b, 0, -.5, 0)), an = kn.map(b => bone(b, 0, -.5, 0));

  // pelvis + belt
  attach(hips, [P(sph(.17), M.pants, 0, 0, 0, 0, 0, 0, 1.15, .75, .85), P(cyl(.172, .172, .04, 16), M.trim, 0, .09, 0, 0, 0, 0, 1.15, 1, .85)]);
  // torso: abdomen, chest, shoulder caps, neck + clothing details
  const sp = [P(cap(.14, .16), M.jacket, 0, .14, 0, 0, 0, 0, 1.1, 1, .85), P(cap(.17, .2), M.jacket, 0, .4, 0, 0, 0, 0, 1.3, 1, .9), P(cyl(.055, .065, .1, 10), M.skin, 0, .68, 0)];
  for (const s of [-1, 1]) sp.push(P(sph(.075), M.jacket, s * .255, .56, 0));
  if (o.suit) { sp.push(P(box(.13, .24, .02), M.shirt, 0, .5, -.155), P(box(.06, .3, .02), M.tie, 0, .4, -.162), P(box(.17, .03, .09), M.shirt, 0, .66, -.01), P(box(.34, .04, .02), M.dark, 0, .12, -.13)); }
  else { sp.push(P(box(.07, .34, .02), M.trim, -.075, .4, .165), P(box(.07, .34, .02), M.trim, .075, .4, .165), P(cyl(.14, .16, .07, 14), M.jacket, 0, .64, .02, 0, 0, 0, 1.2, 1, 1));   // glowing back stripes + collar
    if (o.pack) sp.push(P(box(.3, .36, .13), M.dark, 0, .4, .22), P(box(.04, .26, .02), M.tip, 0, .4, .295), P(sph(.1), M.jacket, 0, .66, .09, 0, 0, 0, 1.3, .8, 1)); }   // backpack, LED, hood
  attach(spine, sp);

  // head: skull, jaw, ears, nose, eyes, brows, hair (+ shades for thugs)
  const hd = [P(sph(.115), M.skin, 0, .15, 0, 0, 0, 0, .92, 1.12, 1), P(sph(.07), M.skin, 0, .075, -.045, 0, 0, 0, 1.1, .75, 1), P(box(.026, .045, .03), M.skin, 0, .14, -.115),
    P(sph(.03), M.skin, -.104, .15, 0), P(sph(.03), M.skin, .104, .15, 0), P(sph(.014), M.dark, -.04, .17, -.108), P(sph(.014), M.dark, .04, .17, -.108),
    P(box(.05, .01, .012), M.dark, -.04, .2, -.108), P(box(.05, .01, .012), M.dark, .04, .2, -.108), P(box(.05, .008, .01), M.dark, 0, .085, -.107)];
  const hairCap = () => P(new T.SphereGeometry(.125, 14, 8, 0, Math.PI * 2, 0, Math.PI * .56), M.hair, 0, .175, .005, 0, 0, 0, .96, 1, 1.04);
  if (o.style === 'pony') hd.push(hairCap(), P(sph(.1), M.hair, 0, .15, .045, 0, 0, 0, 1, 1.05, .9), P(box(.2, .05, .03), M.hair, 0, .245, -.1, .25, 0, 0));
  else if (o.style === 'slick') hd.push(hairCap(), P(sph(.1), M.hair, 0, .17, .05, 0, 0, 0, 1, 1, .9));
  else if (o.style === 'spiky') { hd.push(hairCap()); for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; hd.push(P(new T.ConeGeometry(.032, .12, 5), M.hair, Math.cos(a) * .07, .27, Math.sin(a) * .07, Math.sin(a) * .5, 0, -Math.cos(a) * .5)); } }
  else hd.push(P(new T.SphereGeometry(.12, 12, 8, 0, Math.PI * 2, 0, Math.PI * .5), M.hair, 0, .175, 0, 0, 0, 0, .95, 1, 1));
  if (o.glasses) hd.push(P(box(.21, .045, .03), M.lens, 0, .17, -.118));
  attach(head, hd);
  if (o.style === 'pony') attach(pony, [P(cap(.034, .17), M.hair, 0, -.1, .03), P(sph(.045), M.tip, 0, -.22, .04)]);

  // arms: sleeve, cuff, hand
  [-1, 1].forEach((s, i) => {
    attach(sh[i], [P(cap(.055, .2), M.jacket, 0, -.16, 0), P(sph(.062), M.jacket)]);
    attach(el[i], [P(sph(.05), M.jacket), P(cap(.046, .2), M.jacket, 0, -.15, 0), P(cyl(.052, .052, .035, 10), o.suit ? M.shirt : M.trim, 0, -.265, 0), P(sph(.052), M.skin, 0, -.34, 0, 0, 0, 0, 1, 1.15, 1)]);
    attach(hp[i], [P(cap(.078, .34), M.pants, 0, -.25, 0)]);
    attach(kn[i], [P(sph(.07), M.pants), P(cap(.062, .34), M.pants, 0, -.25, 0)]);
    attach(an[i], [P(box(.105, .07, .26), M.shoe, 0, -.04, -.055), P(box(.11, .022, .27), M.sole, 0, -.085, -.055), P(sph(.045), M.shoe, 0, -.01, 0)]);
  });

  return { g: root, model, bones: { hips, spine, head, pony, sh, el, hp, kn, an }, mats: M, opts: o,
    s: { run: 0, air: 0, slide: 0, stum: 0, reach: 0, pony: -.3, ponyZ: 0, t: 0 } };
}

/* ---- animation ---- */
function animate(h, a, dt) {
  dt = Math.max(dt || 0, 1 / 120); const s = h.s, B = h.bones; s.t += dt;
  s.run = damp(s.run, a.run || 0, 10, dt); s.air = damp(s.air, a.air ? 1 : 0, 18, dt); s.slide = damp(s.slide, a.slide ? 1 : 0, 16, dt);
  s.stum = damp(s.stum, a.stumble ? 1 : 0, 12, dt); s.reach = damp(s.reach, a.reach || 0, 8, dt);
  const run = s.run, wa = s.air * (1 - s.slide), ws = s.slide, st = s.stum, ph = a.phase || 0;
  const sn = [Math.sin(ph), Math.sin(ph + Math.PI)], cs = [Math.cos(ph), Math.cos(ph + Math.PI)], mix3 = (r, air, sl) => lerp(lerp(r, air, wa), sl, ws);
  const breathe = Math.sin(s.t * 2.2) * .012 * (1 - run);

  // legs: thigh swing, knee flexes while the leg swings forward, ankle keeps the foot level
  const th = [0, 1].map(i => mix3(.95 * sn[i] * run, i ? -.5 : .95, .55)), kne = [0, 1].map(i => mix3(-(.12 + 1.25 * Math.max(0, cs[i])) * run, i ? -1.3 : -.9, i ? -.3 : -.12));
  // trunk: forward lean, counter-rotating twist, head stays level
  const lean = -(.12 + .15 * run) * (1 - ws) - .14 * wa - .5 * st, hipsRx = .9 * ws;
  B.hips.rotation.set(hipsRx, -.1 * sn[0] * run * (1 - ws), .05 * cs[0] * run + Math.sin(ph * 2) * .14 * st);
  B.spine.rotation.set(lean + breathe + .1 * ws, .22 * sn[0] * run * (1 - ws), -.04 * cs[0] * run);
  B.head.rotation.set(-lean * .75 - hipsRx * .85 + .25 * st, -B.spine.rotation.y * .6, 0);
  let drop = 0.2;
  for (let i = 0; i < 2; i++) {
    B.hp[i].rotation.set(th[i], 0, i ? -.05 : .05); B.kn[i].rotation.x = kne[i];
    const a1 = hipsRx + th[i], a2 = a1 + kne[i]; B.an[i].rotation.x = -(a2) * .55 * (1 - ws) + (ws ? .25 : 0);
    drop = Math.max(drop, .04 + .5 * Math.cos(a1) + .5 * Math.cos(a2) + .085);                              // lowest sole touches y = 0
  }
  B.hips.position.y = drop + .045 * run * (1 - wa - ws) * (.5 + .5 * Math.cos(2 * ph)) + breathe;
  // arms: opposite to legs, elbows bent ~90° while running; reach forward when a chaser is close; flail when stumbling
  for (let i = 0; i < 2; i++) {
    const swing = -.95 * sn[i] * run, shx = mix3(swing, i ? -.8 : 1.8, i ? .5 : -.3) + s.reach * (1.5 - swing) + (Math.sin(ph * 1.7 + i * 2) * 1.0 + .3) * st;
    B.sh[i].rotation.set(shx, 0, (i ? -1 : 1) * (.08 + .22 * wa + .18 * ws + .15 * st)); B.el[i].rotation.x = mix3(.12 + .95 * run + .35 * Math.max(0, -sn[i]) * run, .6, .3) * (1 - s.reach * .85);
  }
  // secondary motion: ponytail streams back with speed and lags lane changes
  const sp = Math.min(1, run * (a.speed01 === undefined ? 1 : a.speed01)), tgt = -(.3 + .85 * sp) + Math.sin(ph * 2) * .12 * run - .5 * wa;
  s.pony = damp(s.pony, tgt, 9, dt); s.ponyZ = damp(s.ponyZ, -(a.lat || 0) * .35, 8, dt); B.pony.rotation.set(s.pony, 0, s.ponyZ);
  return h;
}

window.NHHuman = { create, animate };
})();
