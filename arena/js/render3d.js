/* Shonen Legends: 3D renderer (Three.js). Cel-shaded fighters built from the same
   silhouettes and pose rig as the 2D renderer, 3D stages with a painted backdrop,
   real lighting and shadows, 3D effects and bloom. The engine stays 2D-logical:
   world x/y map onto the fighting plane (z = 0). */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const SL = window.SL, R = SL.render, U = SL.util;
const { W, H, GROUND, WORLD } = SL.C;
const K = 0.01;                                  // world units per engine pixel
const toX = x => (x - WORLD / 2) * K, toY = y => (GROUND - y) * K;
const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const tmpV = new THREE.Vector3(), tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();

// ---------- shared resources ----------
const gradientMap = (() => {
  const d = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(d, 3, 1); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
})();
const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x0b0a14, side: THREE.BackSide });
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const toon = (color, extra = {}) => new THREE.MeshToonMaterial({ color: new THREE.Color(color), gradientMap, ...extra });
const basic = (color, extra = {}) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color), ...extra });
const additive = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });

function outlined(geo, mat, thick = 1.07) {
  const m = new THREE.Mesh(geo, mat); m.castShadow = true;
  const o = new THREE.Mesh(geo, OUTLINE); o.scale.setScalar(thick); m.add(o);
  return m;
}
function shapeFrom(points) { const s = new THREE.Shape(); s.moveTo(points[0][0], -points[0][1]); for (const [x, y] of points.slice(1)) s.lineTo(x, -y); s.closePath(); return s; }
function extrude(shape, depth, bevel = 2.5) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 3, curveSegments: 10 });
  geo.translate(0, 0, -depth / 2);
  geo.computeVertexNormals();
  return geo;
}
function centered(geo) { geo.computeBoundingBox(); const c = new THREE.Vector3(); geo.boundingBox.getCenter(c); geo.translate(-c.x, -c.y, -c.z); return c; }

// torso outline (2D path in body frame, y down) -> shape
function torsoShape() {
  const s = new THREE.Shape();
  const p = (x, y) => [x, -y];
  s.moveTo(...p(-12, 3));
  s.quadraticCurveTo(...p(-14, -12), ...p(-13, -21));
  s.quadraticCurveTo(...p(-18, -29), ...p(-16, -36));
  s.quadraticCurveTo(...p(-8, -43), ...p(4, -42));
  s.quadraticCurveTo(...p(15, -41), ...p(16, -34));
  s.quadraticCurveTo(...p(15, -24), ...p(11, -18));
  s.quadraticCurveTo(...p(9, -8), ...p(12, 3));
  s.closePath(); return s;
}
function headShape() {
  const s = new THREE.Shape(), p = (x, y) => [x, -y];
  s.moveTo(...p(-12, 3));
  s.bezierCurveTo(...p(-15, -12), ...p(-2, -18), ...p(7, -14));
  s.bezierCurveTo(...p(14, -10), ...p(14, -2), ...p(13.5, 3));
  s.quadraticCurveTo(...p(12.5, 9), ...p(8, 12.5));
  s.quadraticCurveTo(...p(3, 14), ...p(-2, 10));
  s.quadraticCurveTo(...p(-9, 9), ...p(-12, 3));
  s.closePath(); return s;
}
const SHOE = shapeFrom([[-5, -5], [2, -7], [9, -3], [13, -1], [12, 2], [-6, 2]]);
const BLADE = shapeFrom([[0, -2.6], [58, -2.2], [70, 0], [58, 2.6], [0, 2.6]]);
const GEO = {
  torso: extrude(torsoShape(), 18, 3),
  head: extrude(headShape(), 20, 3.5),
  shoe: extrude(SHOE, 8, 1.5),
  blade: extrude(BLADE, 0.8, 0.4),
  limb: new THREE.CylinderGeometry(0.5, 0.42, 1, 14, 1),
  ball: new THREE.SphereGeometry(1, 18, 14),
  hair: {},
};
for (const [k, pts] of Object.entries(R.HAIR)) GEO.hair[k] = extrude(shapeFrom(pts), 26, 3);

// ---------- fighter model ----------
class FighterModel {
  constructor(def) {
    this.def = def;
    const c = def.colors, L = def.look;
    this.root = new THREE.Group();
    this.rig = new THREE.Group(); this.root.add(this.rig);
    const bare = L.outfit === 'vest' || L.outfit === 'gi';
    this.mats = {
      skin: toon(c.skin), hair: toon(c.hair), top: toon(c.top), legs: toon(c.legs), accent: toon(c.accent),
      shoe: toon(L.outfit === 'suit' ? c.accent : '#26212c'), dark: toon('#1f1f2a'), steel: toon('#dfe6f4'),
      glove: toon(L.outfit === 'suit' ? c.accent : c.skin),
    };
    this.mats.sleeve = bare ? this.mats.skin : this.mats.top;
    // face: a live canvas texture on the head's front cap
    this.faceCanvas = document.createElement('canvas'); this.faceCanvas.width = this.faceCanvas.height = 256;
    this.faceTex = new THREE.CanvasTexture(this.faceCanvas); this.faceTex.colorSpace = THREE.SRGBColorSpace;
    this.faceTex.repeat.set(1 / 40, 1 / 40); this.faceTex.offset.set(0.5, 0.5);
    this.faceMat = toon('#ffffff', { map: this.faceTex });
    this.faceKey = '';

    const add = (geo, mat, thick) => { const m = outlined(geo, mat, thick); this.rig.add(m); return m; };
    this.parts = {
      armB1: add(GEO.limb, this.mats.sleeve), armB2: add(GEO.limb, this.mats.sleeve),
      legB1: add(GEO.limb, this.mats.legs), legB2: add(GEO.limb, this.mats.legs),
      legF1: add(GEO.limb, this.mats.legs), legF2: add(GEO.limb, this.mats.legs),
      armF1: add(GEO.limb, this.mats.sleeve), armF2: add(GEO.limb, this.mats.sleeve),
      kneeB: add(GEO.ball, this.mats.legs), kneeF: add(GEO.ball, this.mats.legs),
      elbowB: add(GEO.ball, this.mats.sleeve), elbowF: add(GEO.ball, this.mats.sleeve),
      fistB: add(GEO.ball, this.mats.glove), fistF: add(GEO.ball, this.mats.glove),
      shoeB: add(GEO.shoe, this.mats.shoe), shoeF: add(GEO.shoe, this.mats.shoe),
      pelvis: add(GEO.ball, this.mats.legs),
    };
    if (bare) { this.parts.armB2.material = this.parts.armF2.material = this.mats.skin; }
    // body group: torso + outfit details
    this.body = new THREE.Group(); this.rig.add(this.body);
    const torso = outlined(GEO.torso, this.mats.top, 1.05); this.body.add(torso);
    this.torso = torso;
    this.addOutfit(L, c);
    // head group
    this.head = new THREE.Group(); this.rig.add(this.head);
    const head = new THREE.Mesh(GEO.head, [this.faceMat, this.mats.skin]); head.castShadow = true;
    const ho = new THREE.Mesh(GEO.head, OUTLINE); ho.scale.setScalar(1.06); head.add(ho);
    this.head.add(head);
    const hair = outlined(GEO.hair[L.hair] || GEO.hair.spiky, this.mats.hair, 1.05); this.head.add(hair);
    this.addHeadwear(L, c);
    // weapon
    if (L.extra === 'sword' || L.extra === 'swords3') this.sword = this.makeSword();
    if (L.extra === 'swords3') {
      const mouth = outlined(new THREE.BoxGeometry(34, 1.6, 1.2), this.mats.steel, 1.2); mouth.position.set(27, -7, 8); this.head.add(mouth);
      const hip = outlined(new THREE.CylinderGeometry(2, 2, 40, 8), this.mats.dark); hip.rotation.z = 1.05; hip.position.set(-18, 8, -12); this.body.add(hip);
    }
    // aura sprite
    this.aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(c.aura), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
    this.aura.scale.set(1.6, 2.4, 1); this.root.add(this.aura);
    this.root.traverse(o => { if (o.isMesh && o.material !== OUTLINE) o.castShadow = true; });
  }
  addOutfit(L, c) {
    const b = this.body, M = this.mats;
    const put = (geo, mat, x, y, z, thick = 1.08) => { const m = outlined(geo, mat, thick); m.position.set(x, -y, z); b.add(m); return m; };
    const belt = new THREE.BoxGeometry(28, 5, 24);
    switch (L.outfit) {
      case 'vest': put(new THREE.BoxGeometry(10, 36, 2), M.skin, 5, -20, 10.5, 1.02); put(belt, M.accent, 0, -4, 0); break;
      case 'robe': put(belt, M.accent, 0, -4, 0); put(new THREE.BoxGeometry(3, 18, 2), M.accent, 1, -33, 10.8, 1.02).rotation.z = -0.45; put(new THREE.BoxGeometry(3, 18, 2), M.accent, 8, -33, 10.8, 1.02).rotation.z = 0.45; break;
      case 'jacket': put(new THREE.BoxGeometry(32, 9, 23), M.accent, 0, -33, 0, 1.03); put(belt, M.dark, 0, 0, 0); put(new THREE.BoxGeometry(1.6, 26, 1), M.dark, 5, -14, 10.8, 1); break;
      case 'gi': put(belt, M.accent, 0, -5, 0); put(new THREE.BoxGeometry(4, 10, 3), M.accent, 8, 0, 11); put(new THREE.BoxGeometry(8, 14, 2), M.accent, 5, -34, 10.6, 1.02).rotation.z = 0.35; break;
      case 'suit': { const plate = put(new THREE.BoxGeometry(30, 22, 21), toon('#f2f3f7'), 0, -28, 0, 1.03); plate.scale.set(1, 1, 1.05); put(new THREE.BoxGeometry(28, 3, 23), toon('#d8b24a'), 0, -3, 0); break; }
      case 'uniform': put(new THREE.BoxGeometry(32, 6, 22), toon(U.shade(c.top, -0.2)), 0, -41, 0, 1.03); [-31, -22, -13, -4].forEach(y => put(GEO.ball, toon('#e1b64a'), 7, y, 10.6, 1.0).scale.setScalar(1.7)); break;
      case 'haori': {
        if (L.pattern === 'checker' || L.pattern === 'triangles') {
          const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d');
          g.fillStyle = c.top; g.fillRect(0, 0, 64, 64); g.fillStyle = c.accent;
          if (L.pattern === 'checker') { g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32); }
          else { for (const [x, y] of [[0, 32], [32, 32], [16, 0], [48, 0]]) { g.beginPath(); g.moveTo(x, y + 30); g.lineTo(x + 16, y + 2); g.lineTo(x + 32, y + 30); g.closePath(); g.fill(); } }
          const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 12, 1 / 12); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
          this.torso.material = toon('#ffffff', { map: t });
        }
        put(new THREE.BoxGeometry(7, 42, 2), toon('#15151c'), 3, -20, 10.4, 1.01);
        put(new THREE.BoxGeometry(28, 3.5, 23), toon('#e9e4d6'), 0, -5, 0);
        break;
      }
    }
    if (L.outfit === 'haori' || L.outfit === 'robe') {
      const tg = new THREE.BoxGeometry(24, 46, 2); tg.translate(0, -23, 0);
      const tail = outlined(tg, L.outfit === 'haori' ? this.torso.material : M.top, 1.03);
      tail.position.set(-8, 34, -11); b.add(tail); this.tail = tail;
    }
    if (L.extra === 'hood') { const hood = outlined(new THREE.TorusGeometry(12, 5, 8, 16), M.accent); hood.position.set(-6, 40, -6); hood.rotation.x = 1.2; b.add(hood); }
  }
  addHeadwear(L, c) {
    const h = this.head, M = this.mats;
    if (L.extra === 'headband') {
      const band = outlined(new THREE.BoxGeometry(29, 5.5, 26), M.accent, 1.04); band.position.set(0, 8, 0); h.add(band);
      const plate = outlined(new THREE.BoxGeometry(11, 8, 2), toon('#cfd6e4', {}), 1.06); plate.position.set(6, 8, 13.5); h.add(plate);
      const bg = new THREE.BoxGeometry(16, 3, 1); bg.translate(-8, 0, 0);
      const tail = outlined(bg, M.accent); tail.position.set(-14, 7, -6); h.add(tail); this.bandTail = tail;
    } else if (L.extra === 'hat') {
      const straw = toon('#e9c25c');
      const brim = outlined(new THREE.CylinderGeometry(26, 26, 1.8, 28), straw, 1.03); brim.position.set(-1, 12, 0); brim.rotation.z = 0.06; h.add(brim);
      const dome = outlined(new THREE.SphereGeometry(14, 20, 12, 0, TAU, 0, Math.PI / 2), straw, 1.04); dome.position.set(-1, 13, 0); dome.scale.set(1, 0.8, 1); h.add(dome);
      const ribbon = new THREE.Mesh(new THREE.CylinderGeometry(14.3, 14.3, 4, 24, 1, true), toon('#c8202a')); ribbon.position.set(-1, 15, 0); h.add(ribbon);
    } else if (L.extra === 'blindfold') {
      this.blindfold = outlined(new THREE.BoxGeometry(29, 7, 25), toon('#101018'), 1.03); this.blindfold.position.set(1, 3.5, 0); h.add(this.blindfold);
    }
    if (L.hair === 'crown') {
      const crown = outlined(extrude(shapeFrom([[-12, -12], [-10, -31], [-4, -17], [1, -38], [6, -17], [12, -31], [13, -12]]), 20, 1.5), toon(c.accent, { emissive: new THREE.Color(c.accent), emissiveIntensity: 0.4 }));
      h.add(crown);
    }
  }
  makeSword() {
    const g = new THREE.Group();
    const blade = new THREE.Mesh(GEO.blade, toon('#e8eef8', { emissive: new THREE.Color('#000000') })); blade.castShadow = true;
    const bo = new THREE.Mesh(GEO.blade, OUTLINE); bo.scale.set(1.02, 1.3, 3); blade.add(bo);
    blade.position.x = 5; g.add(blade); this.blade = blade;
    const handle = outlined(new THREE.CylinderGeometry(2.2, 2.2, 13, 8), toon('#2b1f3a')); handle.rotation.z = Math.PI / 2; handle.position.x = -5; g.add(handle);
    const guard = outlined(new THREE.CylinderGeometry(5, 5, 1.6, 12), toon('#c9a24a')); guard.rotation.z = Math.PI / 2; guard.position.x = 2; g.add(guard);
    this.rig.add(g);
    return g;
  }
  setLimb(mesh, ax, ay, az, bx, by, bz, w) {
    tmpA.set(ax, -ay, az); tmpB.set(bx, -by, bz);
    tmpV.subVectors(tmpB, tmpA); const len = tmpV.length() || 0.001;
    mesh.position.addVectors(tmpA, tmpB).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(UP, tmpV.divideScalar(len));
    mesh.scale.set(w, len, w);
  }
  setBall(mesh, x, y, z, r) { mesh.position.set(x, -y, z); mesh.scale.setScalar(r); }
  update(f, T, game) {
    const d = this.def, c = d.colors, L = d.look, gy = GROUND;
    const air = f.y < gy - 1;
    const P = R.pose(f, T, air);
    const S = 1.12 * (d.scale || 1);
    this.root.position.set(toX(f.x), toY(f.y), 0);
    this.root.rotation.set(0, -f.facing * 0.5, 0);
    this.root.scale.set(f.facing * K * S, K * S, K * S);
    this.rig.rotation.z = f.state === 'ko' ? Math.min(1, f.t / 16) * 1.45 : 0;
    const hidden = (f.state === 'special' && d.special.kind === 'teleport' && f.t >= 6 && f.t < 14) || (f.invuln > 0 && f.invuln % 6 < 2);
    this.rig.visible = !hidden;

    // rig in 2D local coordinates (identical to the 2D renderer)
    const hipY = -52 + P.crouch + P.bob, TH = 27, SH = 27, UA = 19, FA = 18;
    const leg = front => {
      const hx = front ? 4 : -4, mode = P.legs === 'fkF' ? (front ? 'fk' : 'ik') : P.legs;
      if (mode === 'ik') return R.ik(hx, hipY, front ? P.fF : P.fB, -(front ? P.lF : P.lB), TH, SH);
      const th = front ? P.thF : P.thB, kn = front ? P.knF : P.knB;
      const [kx, ky] = R.fk(hx, hipY, th, TH), [fx, fy] = R.fk(kx, ky, th - kn, SH); return [kx, ky, fx, fy];
    };
    const cl = Math.cos(P.lean), sl = Math.sin(P.lean);
    const body = (x, y) => [x * cl - y * sl, hipY + x * sl + y * cl];
    const arm = front => {
      const [sx, sy] = body(front ? 3 : -5, front ? -36 : -35), sh = (front ? P.shF : P.shB) - P.lean, el = front ? P.elF : P.elB;
      const [ex, ey] = R.fk(sx, sy, sh, UA), [hx, hy] = R.fk(ex, ey, sh + el, FA + (front ? P.extF : 0));
      return { sx, sy, ex, ey, hx, hy, fa: sh + el };
    };
    const lf = leg(true), lb = leg(false), af = arm(true), ab = arm(false), p = this.parts;
    this.setLimb(p.legB1, -4, hipY, -5, lb[0], lb[1], -5, 12); this.setLimb(p.legB2, lb[0], lb[1], -5, lb[2], lb[3], -5, 10);
    this.setLimb(p.legF1, 4, hipY, 5, lf[0], lf[1], 5, 12.5); this.setLimb(p.legF2, lf[0], lf[1], 5, lf[2], lf[3], 5, 10);
    this.setBall(p.kneeB, lb[0], lb[1], -5, 5.2); this.setBall(p.kneeF, lf[0], lf[1], 5, 5.4);
    this.setLimb(p.armB1, ab.sx, ab.sy, -10, ab.ex, ab.ey, -10, 9); this.setLimb(p.armB2, ab.ex, ab.ey, -10, ab.hx, ab.hy, -10, 8);
    this.setLimb(p.armF1, af.sx, af.sy, 10, af.ex, af.ey, 10, 9.5); this.setLimb(p.armF2, af.ex, af.ey, 10, af.hx, af.hy, 10, 8.5);
    this.setBall(p.elbowB, ab.ex, ab.ey, -10, 4.2); this.setBall(p.elbowF, af.ex, af.ey, 10, 4.4);
    const stretching = f.state === 'special' && d.special.kind === 'stretch';
    this.setBall(p.fistB, ab.hx, ab.hy, -10, 5.4); this.setBall(p.fistF, af.hx, af.hy, 10, stretching ? 12 : 6);
    p.fistF.material = stretching ? this.mats.dark : this.mats.glove;
    p.armF2.material = stretching ? this.mats.skin : (L.outfit === 'vest' || L.outfit === 'gi' ? this.mats.skin : this.mats.sleeve);
    const shoe = (m, k, z) => {
      let dx = k[3] - k[1], dy = -(k[2] - k[0]); const n = Math.hypot(dx, dy) || 1; dx /= n; dy /= n;
      if (!air && P.legs !== 'fk') { dx = 1; dy = 0; }
      m.position.set(k[2], -k[3], z); m.rotation.set(0, 0, -Math.atan2(dy, dx));
    };
    shoe(p.shoeB, lb, -5); shoe(p.shoeF, lf, 5);
    this.setBall(p.pelvis, 0, hipY, 0, 1); p.pelvis.scale.set(13.5, 8, 12);
    this.body.position.set(0, -hipY, 0); this.body.rotation.set(0, 0, -P.lean);
    if (this.tail) this.tail.rotation.set(0, 0, -0.05 + Math.sin(T * 0.12) * 0.08 + U.clamp(f.vx, -6, 6) * 0.03 * f.facing);
    const [hcx, hcy] = body(3, -57);
    this.head.position.set(hcx, -hcy, 0); this.head.rotation.set(0, 0, -(P.lean + P.tilt));
    if (this.bandTail) this.bandTail.rotation.z = Math.sin(T * 0.2) * 0.25 - 0.2;
    if (this.blindfold) this.blindfold.visible = !f.awakened;
    if (this.sword) {
      this.sword.position.set(af.hx, -af.hy, 11);
      const a = af.fa + 0.5; this.sword.rotation.set(0, 0, Math.atan2(-Math.cos(a), Math.sin(a)));
      this.blade.material.color.set(f.awakened ? '#1a0e16' : '#e8eef8');
      this.blade.material.emissive.set(f.awakened ? c.awaken : '#000000');
      this.blade.material.emissiveIntensity = f.awakened ? 0.5 : 0;
    }
    // face texture
    const blink = P.expr === 'neutral' && T % 200 < 5;
    const key = `${P.expr}|${f.awakened}|${f.corrupted}|${blink}|${Math.abs(f.vx) > 1}`;
    if (key !== this.faceKey) { this.faceKey = key; R.paintFace(this.faceCanvas, f, P, T, 256 / 40); this.faceTex.needsUpdate = true; }
    // colors: flash, awakened hair
    this.mats.hair.color.set(f.awakened && d.awakenHair ? d.awakenHair : c.hair);
    this.mats.hair.emissive.set(f.awakened && d.awakenHair ? d.awakenHair : '#000000');
    this.mats.hair.emissiveIntensity = f.awakened && d.awakenHair ? 0.35 + 0.15 * Math.sin(T * 0.3) : 0;
    const flash = f.flash > 0;
    for (const k of ['skin', 'top', 'legs', 'accent', 'shoe', 'sleeve', 'glove']) { const m = this.mats[k]; m.emissive.set(flash ? '#ffffff' : '#000000'); m.emissiveIntensity = flash ? 1 : 0; }
    this.faceMat.emissive.set(flash ? '#ffffff' : '#000000'); this.faceMat.emissiveIntensity = flash ? 1 : 0;
    if (this.torso.material !== this.mats.top) { this.torso.material.emissive.set(flash ? '#ffffff' : '#000000'); this.torso.material.emissiveIntensity = flash ? 1 : 0; }
    // aura
    const focus = game.cine && game.cine.f === f;
    const auraOn = f.awakened || f.state === 'charge' || focus || f.corrupted;
    const col = f.corrupted && !f.awakened ? '#8a5cff' : f.awakened ? c.awaken : c.aura;
    this.aura.material.color.set(col);
    this.aura.material.opacity = auraOn ? (0.55 + 0.15 * Math.sin(T * 0.3)) * (f.state === 'charge' || focus ? 1.3 : 1) : 0;
    this.aura.position.set(0, 62, -14);
    this.aura.scale.set(140, 230 + Math.sin(T * 0.25) * 12, 1);
  }
  dispose() { this.root.traverse(o => { if (o.geometry && !Object.values(GEO).includes(o.geometry) && !Object.values(GEO.hair).includes(o.geometry)) o.geometry.dispose(); }); this.faceTex.dispose(); }
}

// ---------- stage ----------
const FLOOR = {
  village: ['#57303f', '#3a1f2e', 'road'], soul: ['#1d2244', '#2a3160', 'tiles'], sea: ['#91602f', '#7c4f27', 'planks'],
  tournament: ['#e8dfcc', '#bfb49c', 'tiles'], city: ['#1a1826', '#e8e8f0', 'crosswalk'], forest: ['#1b1630', '#3a2a5a', 'petals'], rift: ['#120a22', '#8a5cff', 'cracks'],
};
const LIGHTS = {
  village: { sky: '#ffb88a', ground: '#3a1f2e', key: '#ffd0a0', rim: '#ff8a5a', fog: '#b8416c', exp: 1.05 },
  soul: { sky: '#8fa8ff', ground: '#10142a', key: '#cfd8ff', rim: '#8fb4ff', fog: '#17214d', exp: 1.0 },
  sea: { sky: '#bfe8ff', ground: '#8a5a2b', key: '#fff4dc', rim: '#ffffff', fog: '#a8dcff', exp: 1.0 },
  tournament: { sky: '#d6ecff', ground: '#c9b999', key: '#fff8e8', rim: '#fff0c0', fog: '#9fd6f5', exp: 0.95 },
  city: { sky: '#6a4a9a', ground: '#1a1826', key: '#ffc6e6', rim: '#ff5fa2', fog: '#1a1036', exp: 1.1 },
  forest: { sky: '#9a82d6', ground: '#1b1630', key: '#e8d8ff', rim: '#d9a8ff', fog: '#27204f', exp: 1.05 },
  rift: { sky: '#8a5cff', ground: '#120a22', key: '#d6c4ff', rim: '#e04bff', fog: '#1c0a33', exp: 1.1 },
};
function floorTexture(stage) {
  const [a, b, kind] = FLOOR[stage] || FLOOR.village;
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = a; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = b; g.fillStyle = b;
  if (kind === 'planks') { for (let y = 0; y < 256; y += 32) { g.fillStyle = (y / 32) % 2 ? b : a; g.fillRect(0, y, 256, 32); g.fillStyle = '#5b3818'; g.fillRect((y * 3) % 256, y, 3, 32); g.fillRect(0, y, 256, 2); } }
  else if (kind === 'tiles') { g.lineWidth = 3; for (let i = 0; i <= 256; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); } }
  else if (kind === 'crosswalk') { for (let x = 0; x < 256; x += 64) g.fillRect(x + 8, 96, 36, 64); }
  else if (kind === 'road') { g.globalAlpha = 0.25; for (let i = 0; i < 60; i++) g.fillRect(Math.random() * 256, Math.random() * 256, 12, 3); }
  else if (kind === 'petals') { for (let i = 0; i < 70; i++) { g.fillStyle = i % 2 ? '#b98cff' : '#d9a8ff'; g.globalAlpha = 0.5; g.beginPath(); g.ellipse(Math.random() * 256, Math.random() * 256, 4, 2, Math.random() * 3, 0, TAU); g.fill(); } }
  else if (kind === 'cracks') { g.lineWidth = 2; g.globalAlpha = 0.6; for (let i = 0; i < 8; i++) { let x = Math.random() * 256, y = Math.random() * 256; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 60; y += (Math.random() - 0.5) * 60; g.lineTo(x, y); } g.stroke(); } }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 5); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function buildProps(stage, group) {
  const add = (m, x, y, z) => { m.position.set(x, y, z); group.add(m); return m; };
  const rnd = SL.util.rnd;
  if (stage === 'village') {
    for (let i = -3; i <= 3; i++) {
      const post = outlined(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 8), toon('#3a1f2e')); add(post, i * 2.6, 0.8, -3.2);
      const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), basic('#ffb45a')); lantern.scale.y = 1.3; add(lantern, i * 2.6, 1.65, -3.2);
      const l = new THREE.PointLight('#ffaa55', 0.8, 3.5); add(l, i * 2.6, 1.6, -3);
    }
  } else if (stage === 'soul') {
    const wall = outlined(new THREE.BoxGeometry(30, 1.4, 0.6), toon('#c9cde6')); add(wall, 0, 0.7, -4.5);
    const roof = outlined(new THREE.BoxGeometry(30.4, 0.25, 1.1), toon('#161a38')); add(roof, 0, 1.5, -4.5);
  } else if (stage === 'sea') {
    const rail = outlined(new THREE.BoxGeometry(30, 0.12, 0.12), toon('#5a3718')); add(rail, 0, 0.9, -2.6);
    for (let i = -14; i <= 14; i += 1.2) add(outlined(new THREE.BoxGeometry(0.1, 0.9, 0.1), toon('#5a3718')), i, 0.45, -2.6);
    const mast = outlined(new THREE.CylinderGeometry(0.14, 0.18, 7, 10), toon('#6b4424')); add(mast, -6.5, 3.5, -3.4);
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(3, 2.6), toon('#f4efe2', { side: THREE.DoubleSide })); add(sail, -6.5, 4.4, -3.3);
  } else if (stage === 'tournament') {
    const ring = outlined(new THREE.BoxGeometry(18, 0.35, 5), toon('#e8dfcc')); add(ring, 0, -0.17, 0);
    for (const x of [-8.6, 8.6]) for (const z of [-2.3, 2.3]) add(outlined(new THREE.CylinderGeometry(0.18, 0.2, 1.8, 10), toon('#bfb49c')), x, 0.9, z);
  } else if (stage === 'city') {
    for (let i = -3; i <= 3; i++) {
      add(outlined(new THREE.CylinderGeometry(0.05, 0.06, 2.8, 8), toon('#2a2838')), i * 3.1 + 1, 1.4, -3);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), basic('#ffe6f2')); add(lamp, i * 3.1 + 1, 2.85, -3);
      add(new THREE.PointLight(i % 2 ? '#ff5fa2' : '#3de0ff', 1.2, 4.5), i * 3.1 + 1, 2.7, -2.6);
    }
  } else if (stage === 'forest') {
    for (let i = 0; i < 9; i++) {
      const x = -12 + i * 3 + rnd(i) * 1.2, z = -3 - rnd(i * 3) * 2;
      add(outlined(new THREE.CylinderGeometry(0.16, 0.24, 4, 8), toon('#1f1636')), x, 2, z);
      for (let k = 0; k < 5; k++) { const w = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.9, 8), toon(k % 2 ? '#b98cff' : '#d9a8ff', { emissive: new THREE.Color('#6a3aa0'), emissiveIntensity: 0.3 })); w.rotation.x = Math.PI; add(w, x + (k - 2) * 0.28, 3.4 - (k % 2) * 0.3, z + 0.2); }
    }
  } else if (stage === 'rift') {
    for (let i = 0; i < 12; i++) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.2 + rnd(i) * 0.35), toon(['#4aa8ff', '#ffd23f', '#ff6a3d', '#3ddc97', '#ff4f6d', '#a07bff'][i % 6], { emissive: new THREE.Color('#301060'), emissiveIntensity: 0.5 }));
      s.userData.spin = 0.005 + rnd(i * 2) * 0.02; s.userData.bob = rnd(i * 4) * TAU;
      add(s, -10 + rnd(i * 7) * 20, 1.2 + rnd(i * 5) * 3, -2 - rnd(i * 9) * 4);
    }
  }
}

// ---------- renderer ----------
const R3 = {
  ok: false, canvas: null, renderer: null, scene: null, camera: null, composer: null, bloom: null,
  models: new Map(), stage: null, fx: new Map(),
};

function init(canvas) {
  try {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 80);
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.55, 0.5, 0.82);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    Object.assign(R3, { ok: true, canvas, renderer, scene, camera, composer, bloom });
    // lights
    R3.hemi = new THREE.HemisphereLight('#ffffff', '#444444', 1.6); scene.add(R3.hemi);
    R3.key = new THREE.DirectionalLight('#ffffff', 2.2); R3.key.position.set(3, 8, 7); R3.key.castShadow = true;
    R3.key.shadow.mapSize.set(1024, 1024); Object.assign(R3.key.shadow.camera, { left: -9, right: 9, top: 6, bottom: -2, near: 1, far: 30 }); R3.key.shadow.bias = -0.0008;
    scene.add(R3.key); scene.add(R3.key.target);
    R3.rim = new THREE.DirectionalLight('#ffffff', 1.4); R3.rim.position.set(-4, 4, -6); scene.add(R3.rim);
    R3.spot = new THREE.PointLight('#ffffff', 0, 6); scene.add(R3.spot);
    // backdrop (painted by the 2D stage renderer, animated)
    // The painted 2D stage becomes the sky/background layer, repainted with the live camera
    // (so its parallax layers still move) and shifted so its floor line meets the 3D ground's horizon.
    R3.bdCanvas = document.createElement('canvas'); R3.bdCanvas.width = 768; R3.bdCanvas.height = 432;
    R3.bdTex = new THREE.CanvasTexture(R3.bdCanvas); R3.bdTex.colorSpace = THREE.SRGBColorSpace;
    scene.background = R3.bdTex;
    // ground
    R3.ground = new THREE.Mesh(new THREE.PlaneGeometry(44, 15), toon('#ffffff'));
    R3.ground.rotation.x = -Math.PI / 2; R3.ground.position.set(0, 0, 1.5); R3.ground.receiveShadow = true; scene.add(R3.ground);
    R3.groundFar = -6;
    R3.props = new THREE.Group(); scene.add(R3.props);
    // particles
    const N = 1000;
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    pg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    R3.particles = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.16, map: glowTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
    R3.particles.frustumCulled = false; scene.add(R3.particles);
    // domain starfield
    const sg = new THREE.BufferGeometry(), sp = new Float32Array(600 * 3);
    for (let i = 0; i < 600; i++) { sp[i * 3] = (Math.random() - 0.5) * 40; sp[i * 3 + 1] = Math.random() * 14; sp[i * 3 + 2] = -2 - Math.random() * 12; }
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    R3.stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.08, color: '#bfe4ff', map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    R3.stars.visible = false; scene.add(R3.stars);
    R3.tmpColor = new THREE.Color();
  } catch (e) {
    console.warn('3D renderer unavailable:', e);
    R3.ok = false;
  }
  return R3.ok;
}

function setStage(stage) {
  if (R3.stage === stage) return;
  R3.stage = stage;
  const L = LIGHTS[stage] || LIGHTS.village;
  R3.hemi.color.set(L.sky); R3.hemi.groundColor.set(L.ground);
  R3.key.color.set(L.key); R3.rim.color.set(L.rim);
  R3.scene.fog = null;
  R3.renderer.toneMappingExposure = L.exp;
  if (R3.ground.material.map) R3.ground.material.map.dispose();
  R3.ground.material.map = floorTexture(stage); R3.ground.material.needsUpdate = true;
  R3.props.clear(); buildProps(stage, R3.props);
}

function paintBackdrop(game) {
  const g = R3.bdCanvas.getContext('2d'), s = R3.bdCanvas.width / W;
  // where does the far edge of the 3D ground land on screen?
  tmpV.set(R3.camera.position.x, 0, R3.groundFar).project(R3.camera);
  const horizon = (1 - tmpV.y) / 2 * H;
  const shift = 438 - horizon;
  const prev = R.ctx; R.ctx = g;
  g.setTransform(s, 0, 0, s, 0, 0);
  g.fillStyle = (FLOOR[game.stage] || FLOOR.village)[0]; g.fillRect(0, 0, W, H);
  g.setTransform(s, 0, 0, s, 0, -shift * s);
  R.drawStage(game.stage, { x: game.cam.x, z: 1 }, game.frame);
  R.ctx = prev;
  R3.bdTex.needsUpdate = true;
}

function syncFighters(game, T) {
  const live = new Set();
  for (const f of game.fighters) {
    let m = R3.models.get(f);
    if (!m) {
      // reuse a model built for the same def (fighters are re-created every round)
      for (const [k, v] of R3.models) if (v.def === f.def && !game.fighters.includes(k)) { R3.models.delete(k); m = v; break; }
      if (!m) { m = new FighterModel(f.def); R3.scene.add(m.root); }
      R3.models.set(f, m);
    }
    m.update(f, T, game);
    live.add(m);
  }
  for (const [k, m] of R3.models) if (!live.has(m)) { R3.scene.remove(m.root); m.dispose(); R3.models.delete(k); }
}

// ---------- effects ----------
function fxMesh(key, make) { let m = R3.fx.get(key); if (!m) { m = make(); R3.scene.add(m); R3.fx.set(key, m); } m.userData.seen = R3.frameId; return m; }
function glowSprite(color, s) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(color), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); sp.scale.set(s, s, 1); return sp; }
function syncProjectiles(game) {
  for (const p of game.projectiles) {
    const m = fxMesh(p, () => {
      const g = new THREE.Group(), r = p.r * K;
      if (p.kind === 'crescent' || p.kind === 'eclipse') {
        const ecl = p.kind === 'eclipse';
        const arc = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.2, 10, 28, Math.PI), ecl ? basic('#0a0206') : basic(p.color, { toneMapped: false }));
        arc.rotation.z = -Math.PI / 2; g.add(arc);
        const edge = new THREE.Mesh(new THREE.TorusGeometry(r * 1.02, r * 0.07, 8, 28, Math.PI), basic(ecl ? '#ff2640' : '#ffffff', { toneMapped: false }));
        edge.rotation.z = -Math.PI / 2; edge.position.x = r * 0.05; g.add(edge);
        g.add(glowSprite(ecl ? '#ff2640' : p.color, r * 3.2));
      } else if (p.kind === 'shuriken') {
        g.add(new THREE.Mesh(new THREE.SphereGeometry(r * 0.3, 16, 12), basic('#ffffff', { toneMapped: false })));
        const blades = new THREE.Group();
        for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.ConeGeometry(r * 0.28, r * 1.3, 4), additive('#bfeaff', 0.9)); b.position.x = r * 0.7; b.rotation.z = -Math.PI / 2; const h = new THREE.Group(); h.rotation.z = i * Math.PI / 2; h.add(b); blades.add(h); }
        blades.name = 'spin'; g.add(blades); g.add(glowSprite('#7fd4ff', r * 3.6));
      } else if (p.kind === 'blackhole') {
        g.add(new THREE.Mesh(new THREE.SphereGeometry(r * 0.7, 20, 16), basic('#000000')));
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.3, r * 0.08, 8, 40), basic(p.color, { toneMapped: false })); ring.rotation.x = 1.2; ring.name = 'spin'; g.add(ring);
        g.add(glowSprite('#e04bff', r * 4));
      } else {
        g.add(new THREE.Mesh(new THREE.SphereGeometry(r * 0.6, 14, 10), basic('#ffffff', { toneMapped: false })));
        g.add(glowSprite(p.color, r * 3.4));
      }
      return g;
    });
    m.position.set(toX(p.x), toY(p.y), 0.2);
    m.scale.x = Math.sign(p.vx) || 1;
    const spin = m.getObjectByName('spin'); if (spin) spin.rotation.z = p.t * 0.4 * (p.kind === 'blackhole' ? 0.3 : 1);
  }
}
function syncHazards(game, T) {
  let domain = false;
  for (const h of game.hazards) {
    if (h.t < 0) continue;
    const warn = h.t < h.warn, active = h.t >= h.warn && h.t < h.warn + h.act;
    if (h.kind === 'pillar') {
      const m = fxMesh(h, () => {
        const g = new THREE.Group();
        const dark = h.color === '#b02cff';
        const outer = new THREE.Mesh(new THREE.CylinderGeometry(h.w * K * 0.45, h.w * K * 0.55, 1, 18, 1, true), additive(h.color, 0.75)); outer.name = 'outer'; g.add(outer);
        const inner = new THREE.Mesh(new THREE.CylinderGeometry(h.w * K * 0.25, h.w * K * 0.35, 1, 14, 1, true), dark ? basic('#0b0614') : additive('#ffffff', 0.8)); inner.name = 'inner'; g.add(inner);
        const ring = new THREE.Mesh(new THREE.RingGeometry(h.w * K * 0.2, h.w * K * 0.55, 24), additive(h.color, 0.6)); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; ring.name = 'ring'; g.add(ring);
        return g;
      });
      m.position.set(toX(h.x), 0, 0);
      const k = active ? (h.t - h.warn) / h.act : 0;
      const height = active ? 3.8 * Math.sin(Math.min(1, k * 1.6) * Math.PI / 2) * (1 - Math.max(0, k - 0.75) * 4) : 0.001;
      for (const n of ['outer', 'inner']) { const o = m.getObjectByName(n); o.visible = active; o.scale.y = Math.max(0.001, height); o.position.y = height / 2; o.rotation.y = T * 0.2; }
      m.getObjectByName('ring').material.opacity = warn ? 0.3 + (h.t / h.warn) * 0.5 : active ? 0.7 : 0;
    } else if (h.kind === 'fist') {
      const m = fxMesh(h, () => {
        const g = new THREE.Group();
        const fist = outlined(new THREE.BoxGeometry(1.64, 1.26, 1.2), toon('#17171f', { emissive: new THREE.Color('#300010'), emissiveIntensity: 0.6 }), 1.04); fist.name = 'fist'; g.add(fist);
        const armM = outlined(new THREE.CylinderGeometry(0.34, 0.4, 5.4, 12), toon('#17171f'), 1.04); armM.position.y = 3.2; fist.add(armM);
        fist.add(glowSprite('#ff3c5a', 3));
        const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.85, 24), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.4, depthWrite: false })); shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02; shadow.name = 'shadow'; g.add(shadow);
        return g;
      });
      const k = Math.min(1, h.t / h.warn);
      m.position.set(toX(h.x), 0, 0);
      const fist = m.getObjectByName('fist'); fist.visible = h.t < h.warn + h.act; fist.position.y = U.lerp(7, 0.7, k * k);
      const sh = m.getObjectByName('shadow'); sh.scale.setScalar(0.4 + k * 0.6); sh.material.opacity = h.t < h.warn + h.act ? 0.25 + k * 0.35 : 0;
    } else if (h.kind === 'beam') {
      const m = fxMesh(h, () => {
        const g = new THREE.Group();
        const outer = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 20, 1, true), additive(h.color, 0.55)); outer.rotation.z = Math.PI / 2; outer.name = 'outer'; g.add(outer);
        const core = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1, 16, 1, true), basic('#ffffff', { toneMapped: false })); core.rotation.z = Math.PI / 2; core.name = 'core'; g.add(core);
        const orb = glowSprite(h.color, 1); orb.name = 'orb'; g.add(orb);
        return g;
      });
      const o = h.owner, x0 = toX(o.x + h.dir * 46), y = toY(o.y - 84);
      m.position.set(0, y, 0.15);
      const orb = m.getObjectByName('orb'); orb.position.x = x0; orb.scale.setScalar(warn ? 0.3 + h.t * 0.06 : active ? 1.6 : 0.01);
      const k = active ? (h.t - h.warn) / h.act : 0;
      const wdt = active ? 0.46 * Math.sin(Math.min(1, k * 3) * Math.PI / 2) * (k > 0.8 ? (1 - k) * 5 : 1) : 0;
      const len = 30, cx = x0 + h.dir * len / 2;
      for (const n of ['outer', 'core']) { const b = m.getObjectByName(n); b.visible = active; b.position.x = cx; b.scale.set(Math.max(0.001, wdt), len, Math.max(0.001, wdt)); }
    } else if (h.kind === 'slashes') {
      const m = fxMesh(h, () => { const g = new THREE.Group(); for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.05), basic(h.color, { toneMapped: false, side: THREE.DoubleSide, transparent: true })); g.add(s); } return g; });
      m.visible = active; m.position.set(toX(h.target.x), toY(h.target.y - 60), 0.4);
      m.children.forEach((s, i) => { s.rotation.z = U.rnd(h.t * 3 + i) * TAU; });
    } else if (h.kind === 'domain' && h.t < h.warn + h.act) {
      domain = true;
    }
  }
  R3.stars.visible = domain;
  R3.props.visible = !domain;
  R3.scene.background = domain ? R3.void || (R3.void = new THREE.Color('#04020c')) : R3.bdTex;
}
function syncParticles(game) {
  const pos = R3.particles.geometry.attributes.position.array, col = R3.particles.geometry.attributes.color.array;
  let n = 0;
  for (const p of game.particles) {
    if (n >= 1000) break;
    if (p.kind === 'ring') continue;
    const a = p.life / p.max;
    pos[n * 3] = toX(p.x); pos[n * 3 + 1] = toY(p.y); pos[n * 3 + 2] = p.kind === 'leaf' || p.kind === 'petal' ? -1 + (n % 7) * 0.4 : 0.3;
    R3.tmpColor.set(p.color && p.color.startsWith('#') ? p.color : '#ffffff');
    col[n * 3] = R3.tmpColor.r * a; col[n * 3 + 1] = R3.tmpColor.g * a; col[n * 3 + 2] = R3.tmpColor.b * a;
    n++;
  }
  R3.particles.geometry.setDrawRange(0, n);
  R3.particles.geometry.attributes.position.needsUpdate = true; R3.particles.geometry.attributes.color.needsUpdate = true;
}

const project = (x, y) => {
  tmpV.set(toX(x), toY(y), 0).project(R3.camera);
  return [(tmpV.x + 1) / 2 * W, (1 - tmpV.y) / 2 * H];
};

function render(game, cssW, cssH) {
  R3.frameId = (R3.frameId || 0) + 1;
  const T = game.frame;
  setStage(game.stage);
  syncFighters(game, T);
  syncProjectiles(game);
  syncHazards(game, T);
  syncParticles(game);
  for (const [k, m] of R3.fx) if (m.userData.seen !== R3.frameId) { R3.scene.remove(m); m.traverse(o => { if (o.geometry) o.geometry.dispose(); }); R3.fx.delete(k); }
  for (const s of R3.props.children) if (s.userData.spin) { s.rotation.y += s.userData.spin; s.position.y += Math.sin(T * 0.02 + s.userData.bob) * 0.002; }

  // camera
  const cam = game.cam, cx = toX(cam.x);
  let px = cx, py = 1.45, pz = 7.4 / cam.z, lx = cx, ly = 0.95;
  const cn = game.cine;
  if (cn) {
    const e = Math.min(1, cn.t / 12) * (cn.t > cn.dur - 10 ? (cn.dur - cn.t) / 10 : 1);
    const fx = toX(cn.f.x);
    px = U.lerp(px, fx + cn.f.facing * 1.2, e); py = U.lerp(py, 1.2, e); pz = U.lerp(pz, 3.6, e); lx = U.lerp(lx, fx, e); ly = U.lerp(ly, 0.95, e);
    R3.spot.position.set(fx + cn.f.facing, 1.6, 1.4); R3.spot.intensity = 6 * e; R3.spot.color.set(cn.type === 'awaken' ? cn.f.def.colors.awaken : cn.f.def.colors.aura);
    R3.hemi.intensity = 1.6 - 0.9 * e;
  } else { R3.spot.intensity = 0; R3.hemi.intensity = 1.6; }
  if (game.shake > 0) { px += (Math.random() - 0.5) * game.shake * 0.006; py += (Math.random() - 0.5) * game.shake * 0.006; }
  R3.camera.position.set(px, py, pz); R3.camera.lookAt(lx, ly, 0);
  R3.key.position.set(cx + 3, 8, 7); R3.key.target.position.set(cx, 0, 0);
  R3.camera.updateMatrixWorld();
  if (T % 2 === 0 || R3.paintedStage !== game.stage) { paintBackdrop(game); R3.paintedStage = game.stage; }

  // size
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  if (R3.w !== cssW || R3.h !== cssH) {
    R3.w = cssW; R3.h = cssH;
    R3.renderer.setSize(cssW, cssH, false); R3.composer.setSize(cssW, cssH); R3.renderer.setPixelRatio(dpr); R3.composer.setPixelRatio(dpr);
    R3.camera.aspect = cssW / cssH; R3.camera.updateProjectionMatrix();
  }
  if (SL.settings.hq) { R3.renderer.shadowMap.enabled = true; R3.composer.render(); }
  else { R3.renderer.shadowMap.enabled = false; R3.renderer.render(R3.scene, R3.camera); }
}

function clear() {
  for (const [, m] of R3.models) { R3.scene.remove(m.root); m.dispose(); }
  R3.models.clear();
  for (const [, m] of R3.fx) R3.scene.remove(m);
  R3.fx.clear();
}

SL.render3d = { init, render, project, clear, get ok() { return R3.ok; } };
window.dispatchEvent(new Event('sl-3d-ready'));
