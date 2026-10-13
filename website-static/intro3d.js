import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* Intro 3D muette : fuite → court-circuit → coup de balai qui révèle l'accueil */
window.__altioIntroStarted = true;
const root = document.documentElement;
const finish = () => window.__altioIntroDone && window.__altioIntroDone();
if (root.classList.contains('intro-on')) {
  try { run(); } catch (e) { console.warn('[altio intro]', e); finish(); }
}

function run() {
  const gsap = window.gsap;
  if (!gsap) return finish();
  const el = document.getElementById('intro');
  const canvas = document.getElementById('introCanvas');
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const mobile = innerWidth < 700;

  /* ---------- Rendu ---------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 1.75));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#04070d');
  scene.fog = new THREE.Fog('#04070d', 3.5, 10);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.05, 40);
  const fitFov = () => {
    const a = innerWidth / innerHeight, hfov = 64 * Math.PI / 180;
    camera.fov = Math.min(80, Math.max(38, 2 * Math.atan(Math.tan(hfov / 2) / a) * 180 / Math.PI));
    camera.aspect = a; camera.updateProjectionMatrix();
  };
  fitFov();

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.95, 0.6, 2.4);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  /* ---------- Textures procédurales ---------- */
  const tex = (draw, rx, ry) => {
    const c = document.createElement('canvas'); c.width = c.height = 1024;
    draw(c.getContext('2d'));
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry); t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  };
  // Mur : planches de chalet
  const wood = tex(g => {
    const n = 7, w = 1024 / n;
    for (let i = 0; i < n; i++) {
      const b = 46 + rnd(-8, 8);
      g.fillStyle = `rgb(${b + 18},${b + 4},${b - 8})`; g.fillRect(i * w, 0, w, 1024);
      for (let k = 0; k < 90; k++) {
        g.strokeStyle = Math.random() < .5 ? `rgba(20,12,6,${rnd(.06, .2)})` : `rgba(140,100,70,${rnd(.04, .12)})`;
        g.lineWidth = rnd(.6, 2.4); g.beginPath();
        const x = i * w + Math.random() * w, ph = Math.random() * 9;
        for (let y = 0; y <= 1024; y += 32) g.lineTo(x + Math.sin(y / 120 + ph) * 4 + Math.sin(y / 31 + ph) * 1.2, y);
        g.stroke();
      }
      if (Math.random() < .7) { const ky = rnd(80, 940), kx = i * w + rnd(20, w - 20);
        const gr = g.createRadialGradient(kx, ky, 1, kx, ky, rnd(8, 16)); gr.addColorStop(0, 'rgba(25,14,8,.9)'); gr.addColorStop(1, 'rgba(25,14,8,0)');
        g.fillStyle = gr; g.beginPath(); g.ellipse(kx, ky, 10, 18, 0, 0, 7); g.fill(); }
      g.fillStyle = 'rgba(8,4,2,.95)'; g.fillRect(i * w, 0, 4, 1024);
      g.fillStyle = 'rgba(255,220,180,.06)'; g.fillRect(i * w + 4, 0, 2, 1024);
    }
  }, 3, 1);
  // Sol : dalles de pierre
  const stone = tex(g => {
    g.fillStyle = '#2a2d33'; g.fillRect(0, 0, 1024, 1024);
    const n = 4, s = 1024 / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const v = 58 + rnd(-10, 10); g.fillStyle = `rgb(${v},${v + 2},${v + 6})`;
      g.fillRect(i * s + 4, j * s + 4, s - 8, s - 8);
      for (let k = 0; k < 900; k++) { g.fillStyle = `rgba(${Math.random() < .5 ? '0,0,0' : '255,255,255'},${rnd(.02, .07)})`; g.fillRect(i * s + rnd(4, s - 4), j * s + rnd(4, s - 4), rnd(1, 4), rnd(1, 4)); }
    }
  }, 6, 4);

  /* ---------- Décor ---------- */
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 7),
    new THREE.MeshStandardMaterial({ map: wood, roughness: .78, metalness: 0, envMapIntensity: .12 }));
  wall.position.set(0, 3.5, -1.2); scene.add(wall);
  const floorMat = new THREE.MeshStandardMaterial({ map: stone, roughness: .34, metalness: 0, envMapIntensity: .3 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 10), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, 3.6); scene.add(floor);
  // plinthe
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(14, .09, .03), new THREE.MeshStandardMaterial({ color: '#1c130d', roughness: .6, envMapIntensity: .1 }));
  skirt.position.set(0, .045, -1.185); scene.add(skirt);

  /* ---------- Lumières ---------- */
  const hemi = new THREE.HemisphereLight('#7f9fe0', '#120d09', .32); scene.add(hemi);
  const moon = new THREE.DirectionalLight('#a9c4ff', .55); moon.position.set(-3, 4, 3); scene.add(moon);
  const day = new THREE.DirectionalLight('#fff1de', 0); day.position.set(3, 5, 4); scene.add(day);
  const BX = .62, BY = 1.72, BZ = -.55;
  const bulbLight = new THREE.PointLight('#ffb866', 0, 7, 2); bulbLight.position.set(BX, BY, BZ); scene.add(bulbLight);
  const boomLight = new THREE.PointLight('#ffd27a', 0, 6, 2); boomLight.position.set(BX, BY, BZ + .1); scene.add(boomLight);

  /* ---------- Robinet chromé ---------- */
  const chrome = new THREE.MeshStandardMaterial({ color: '#e9edf4', metalness: 1, roughness: .2, envMapIntensity: .55 });
  const FX = -.72, NOZ = V(FX, .815, -.775);
  const curve = new THREE.CatmullRomCurve3([V(FX, 1.0, -1.2), V(FX, 1.0, -.98), V(FX, 1.012, -.865), V(FX, .955, -.79), V(FX, .86, -.776)]);
  const faucet = new THREE.Group(); scene.add(faucet);
  faucet.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 80, .032, 24, false), chrome));
  const flange = new THREE.Mesh(new THREE.CylinderGeometry(.078, .078, .03, 40), chrome);
  flange.rotation.x = Math.PI / 2; flange.position.set(FX, 1.0, -1.185); faucet.add(flange);
  const noz = new THREE.Mesh(new THREE.CylinderGeometry(.04, .035, .055, 32), chrome); noz.position.set(FX, .845, -.776); faucet.add(noz);
  const handle = new THREE.Group(); handle.position.set(FX, 1.035, -1.03); faucet.add(handle);
  handle.add(new THREE.Mesh(new THREE.CylinderGeometry(.016, .02, .06, 24), chrome));
  const lever = new THREE.Group(); lever.position.y = .035; handle.add(lever);
  const leverBar = new THREE.Mesh(new THREE.BoxGeometry(.2, .018, .03), chrome); leverBar.position.x = .085; lever.add(leverBar);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(.017, 24, 16), new THREE.MeshStandardMaterial({ color: '#E3374B', roughness: .3, metalness: .2 }));
  dot.position.x = .19; lever.add(dot);
  lever.rotation.y = .9;

  /* ---------- Eau ---------- */
  const streamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; uniform float uTime;
      void main(){ vUv=uv; vec3 p=position; p.x+=sin(uv.y*40.+uTime*30.)*.0018; vec4 mv=modelViewMatrix*vec4(p,1.);
      vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; uniform float uTime; uniform float uOpacity;
      void main(){ float f=pow(1.-abs(dot(vN,vV)),2.2);
      float s=.5+.5*sin(vUv.y*90.+uTime*28.); float s2=.5+.5*sin(vUv.y*37.-uTime*19.+vUv.x*6.);
      vec3 c=mix(vec3(.45,.68,1.),vec3(1.),f*.8+s*.25);
      gl_FragColor=vec4(c*1.55,(.28+f*.6+s*s2*.2)*uOpacity); }`
  });
  const streamGeo = new THREE.CylinderGeometry(.011, .016, 1, 18, 24, true); streamGeo.translate(0, -.5, 0);
  const stream = new THREE.Mesh(streamGeo, streamMat); stream.position.copy(NOZ); stream.scale.y = .0001; stream.visible = false; scene.add(stream);
  const waterMat = new THREE.MeshPhysicalMaterial({ color: '#cfe6ff', roughness: 0, metalness: 0, transmission: .9, thickness: .02, ior: 1.33, transparent: true });
  const drop = new THREE.Mesh(new THREE.SphereGeometry(.013, 24, 16), waterMat); drop.visible = false; scene.add(drop);
  // flaque irrégulière
  const sh = new THREE.Shape();
  for (let i = 0; i <= 96; i++) { const a = i / 96 * Math.PI * 2, r = 1 + .13 * Math.sin(a * 3 + 1) + .08 * Math.sin(a * 5 + 2) + .05 * Math.sin(a * 11);
    const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? sh.lineTo(x, y) : sh.moveTo(x, y); }
  const puddle = new THREE.Mesh(new THREE.ShapeGeometry(sh, 96), new THREE.MeshPhysicalMaterial({ color: '#050d1c', roughness: 0, metalness: 0, clearcoat: 1, clearcoatRoughness: 0, transparent: true, opacity: .86, envMapIntensity: .7 }));
  puddle.rotation.x = -Math.PI / 2; puddle.position.set(FX + .18, .003, -.62); puddle.scale.set(.0001, .0001, 1); scene.add(puddle);
  // ondes
  const rings = Array.from({ length: 6 }, () => {
    const m = new THREE.Mesh(new THREE.RingGeometry(.96, 1, 72), new THREE.MeshBasicMaterial({ color: new THREE.Color(.75, .88, 1), transparent: true, opacity: 0, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(NOZ.x, .006, NOZ.z); scene.add(m); return m;
  });
  let ringI = 0;
  const ripple = (big = .3) => { const m = rings[ringI++ % rings.length]; gsap.killTweensOf([m.scale, m.material]);
    m.scale.setScalar(.01); m.material.opacity = .45;
    gsap.to(m.scale, { x: big, y: big, duration: 1.1, ease: 'power2.out' }); gsap.to(m.material, { opacity: 0, duration: 1.1, ease: 'power1.in' }); };

  /* ---------- Particules (éclaboussures + étincelles) ---------- */
  const dotTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.35, 'rgba(255,255,255,.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const makePoints = (n, color, size, additive) => {
    const geo = new THREE.BufferGeometry(); const pos = new Float32Array(n * 3).fill(-99);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size, map: dotTex, alphaTest: .01, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true }));
    pts.frustumCulled = false; scene.add(pts);
    return { pts, pos, vel: new Float32Array(n * 3), life: new Float32Array(n), n, i: 0 };
  };
  const splash = makePoints(140, new THREE.Color(.8, .9, 1), .014, false);
  const sparks = makePoints(160, new THREE.Color(9, 5.5, 2), .028, true);
  const emit = (P, p, v, life) => { const k = P.i++ % P.n; P.pos.set([p.x, p.y, p.z], k * 3); P.vel.set([v.x, v.y, v.z], k * 3); P.life[k] = life; };
  const stepPoints = (P, dt, g, floorBounce) => {
    for (let k = 0; k < P.n; k++) { if (P.life[k] <= 0) { P.pos[k * 3 + 1] = -99; continue; }
      P.life[k] -= dt; P.vel[k * 3 + 1] -= g * dt;
      P.pos[k * 3] += P.vel[k * 3] * dt; P.pos[k * 3 + 1] += P.vel[k * 3 + 1] * dt; P.pos[k * 3 + 2] += P.vel[k * 3 + 2] * dt;
      if (P.pos[k * 3 + 1] < .004) { P.pos[k * 3 + 1] = .004; if (floorBounce) { P.vel[k * 3 + 1] *= -.35; P.vel[k * 3] *= .6; P.vel[k * 3 + 2] *= .6; } else P.life[k] = 0; } }
    P.pts.geometry.attributes.position.needsUpdate = true;
  };

  /* ---------- Suspension + ampoule ---------- */
  const lamp = new THREE.Group(); lamp.position.set(BX, BY + .2, BZ); scene.add(lamp);
  const darkMetal = new THREE.MeshStandardMaterial({ color: '#2a2f38', metalness: .8, roughness: .35, envMapIntensity: .8 });
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(.006, .006, 3.2, 8), new THREE.MeshStandardMaterial({ color: '#111', roughness: .6 }));
  cable.position.y = 1.6; lamp.add(cable);
  const socket = new THREE.Mesh(new THREE.CylinderGeometry(.03, .036, .1, 32), darkMetal); socket.position.y = -.03; lamp.add(socket);
  const glassMat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: .02, metalness: 0, transmission: 1, thickness: .015, ior: 1.5, transparent: true, emissive: new THREE.Color('#ffcf85'), emissiveIntensity: 0, envMapIntensity: 1.4 });
  const glass = new THREE.Mesh(new THREE.SphereGeometry(.105, 64, 48), glassMat); glass.scale.set(1, 1.2, 1); glass.position.y = -.2; lamp.add(glass);
  const filMat = new THREE.MeshStandardMaterial({ color: '#3a2a10', emissive: new THREE.Color('#ffae45'), emissiveIntensity: 0 });
  const fil = new THREE.Group(); fil.position.y = -.2; lamp.add(fil);
  const zig = []; for (let i = 0; i <= 8; i++) zig.push(V(-.035 + i * .00875, (i % 2 ? .012 : -.004), 0));
  fil.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(zig), 40, .0025, 6), filMat));
  [-.035, .035].forEach(x => { const w = new THREE.Mesh(new THREE.CylinderGeometry(.0018, .0018, .17, 6), darkMetal); w.position.set(x, .08, 0); fil.add(w); });

  /* ---------- Éclair ---------- */
  const arcMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 10, 14), transparent: true, opacity: 1, depthWrite: false });
  const arcGroup = new THREE.Group(); scene.add(arcGroup);
  const buildArc = () => {
    arcGroup.children.forEach(c => c.geometry.dispose()); arcGroup.clear();
    const path = (a, b, segs, amp) => { const pts = [a]; for (let i = 1; i < segs; i++) { const t = i / segs; pts.push(new THREE.Vector3().lerpVectors(a, b, t).add(V(rnd(-amp, amp), rnd(-amp * .3, amp * .3), rnd(-amp, amp) * .4))); } pts.push(b); return pts; };
    const top = V(BX - .55, 3.6, BZ + .1), hit = V(BX, BY + .02, BZ);
    const main = path(top, hit, 14, .14);
    const tube = (pts, r) => { const cp = new THREE.CurvePath(); for (let i = 0; i < pts.length - 1; i++) cp.add(new THREE.LineCurve3(pts[i], pts[i + 1])); arcGroup.add(new THREE.Mesh(new THREE.TubeGeometry(cp, pts.length * 3, r, 5, false), arcMat)); };
    tube(main, .007);
    for (let b = 0; b < 3; b++) { const from = main[3 + Math.floor(Math.random() * 8)]; tube(path(from, from.clone().add(V(rnd(-.4, .4), rnd(-.5, -.15), rnd(-.2, .2))), 6, .06), .0035); }
  };

  /* ---------- Éclats de verre (physique) ---------- */
  const NS = mobile ? 60 : 90;
  const shardGeo = new THREE.TetrahedronGeometry(1, 0);
  const shardMat = new THREE.MeshPhysicalMaterial({ color: '#e6eefb', roughness: .05, metalness: .25, clearcoat: 1, transparent: true, opacity: .92, envMapIntensity: 1.5, side: THREE.DoubleSide });
  const shards = new THREE.InstancedMesh(shardGeo, shardMat, NS); shards.frustumCulled = false; scene.add(shards);
  const S = Array.from({ length: NS }, () => ({ p: V(0, -9, 0), v: V(), q: new THREE.Quaternion(), w: V(), s: V(), live: false, rest: false, pushed: false }));
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler();
  const writeShards = () => { S.forEach((o, i) => { tmpM.compose(o.p, o.q, o.live ? o.s : V(0, 0, 0)); shards.setMatrixAt(i, tmpM); }); shards.instanceMatrix.needsUpdate = true; };
  writeShards();
  const explode = () => {
    const c = V(BX, BY, BZ);
    S.forEach(o => { const d = V(rnd(-1, 1), rnd(-.6, 1), rnd(-.6, 1)).normalize();
      o.p.copy(c).addScaledVector(d, rnd(0, .07)); o.v.copy(d).multiplyScalar(rnd(1.4, 4.4)); o.v.y += rnd(.3, 1.4);
      o.q.setFromEuler(tmpE.set(rnd(0, 6), rnd(0, 6), rnd(0, 6))); o.w.set(rnd(-25, 25), rnd(-25, 25), rnd(-25, 25));
      const k = rnd(.022, .06); o.s.set(k, k * rnd(.1, .22), k * rnd(.5, 1.1)); o.live = true; });
    for (let i = 0; i < sparks.n; i++) { const d = V(rnd(-1, 1), rnd(-.4, 1), rnd(-1, 1)).normalize(); emit(sparks, c, d.multiplyScalar(rnd(1.5, 6)), rnd(.18, .6)); }
  };
  const stepShards = dt => {
    S.forEach(o => { if (!o.live) return;
      o.v.y -= 9.8 * dt; o.p.addScaledVector(o.v, dt);
      const fl = o.s.y * .6 + .002;
      if (o.p.y < fl) { o.p.y = fl; if (o.v.y < 0) { o.v.y *= -.26; o.v.x *= .55; o.v.z *= .55; o.w.multiplyScalar(.45);
          if (Math.abs(o.v.y) < .15) { o.v.y = 0; tmpQ.setFromEuler(tmpE.set(0, rnd(0, 6), 0)); o.q.slerp(tmpQ, .35); } } o.v.x *= 1 - 3 * dt; o.v.z *= 1 - 3 * dt; }
      if (o.p.z < -1.17) { o.p.z = -1.17; o.v.z *= -.4; }
      const wl = o.w.length(); if (wl > .01) { tmpQ.setFromAxisAngle(o.w.clone().normalize(), wl * dt); o.q.premultiply(tmpQ); }
      if (o.p.y <= o.s.y * .6 + .003) o.w.multiplyScalar(1 - 6 * dt);
    });
    writeShards();
  };

  /* ---------- Balai ---------- */
  const BROOMZ = .02;
  const broom = new THREE.Group(); broom.position.set(-3.2, 0, BROOMZ); broom.scale.setScalar(1.75); scene.add(broom);
  const woodMat = new THREE.MeshStandardMaterial({ color: '#b9773e', roughness: .55, metalness: 0, envMapIntensity: .6 });
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(.017, .017, 1.4, 20), woodMat); stick.position.y = .26 + .7; broom.add(stick);
  const head = new THREE.Mesh(new THREE.BoxGeometry(.075, .06, .36), new THREE.MeshStandardMaterial({ color: '#111827', roughness: .4, metalness: .2 })); head.position.y = .23; broom.add(head);
  const band = new THREE.Mesh(new THREE.BoxGeometry(.078, .014, .365), new THREE.MeshStandardMaterial({ color: '#E3374B', roughness: .35 })); band.position.y = .248; broom.add(band);
  const NB = 190, bristles = new THREE.InstancedMesh(new THREE.CylinderGeometry(.0032, .0042, .21, 5), new THREE.MeshStandardMaterial({ color: '#dba646', roughness: .75, envMapIntensity: .5 }), NB);
  for (let i = 0; i < NB; i++) { const z = rnd(-.17, .17), x = rnd(-.03, .03);
    tmpM.compose(V(x + z * 0, .105, z * 1.08), tmpQ.setFromEuler(tmpE.set(z * .7 + rnd(-.05, .05), 0, rnd(-.08, .08))), V(1, rnd(.92, 1.06), 1)); bristles.setMatrixAt(i, tmpM); }
  broom.add(bristles);
  broom.rotation.z = .5;

  /* ---------- Caméra ---------- */
  const cam = { x: -.42, y: 1.02, z: .32, tx: -.74, ty: .84, tz: -.85 };
  let shake = 0;

  /* ---------- État piloté par la timeline ---------- */
  const st = { stream: 0, bulb: 0, arc: 0, dark: 0, dayl: 0, sweep: 0, flow: 0 };
  let exploded = false, swept = false;

  const tl = gsap.timeline({ defaults: { ease: 'power2.inOut' }, onComplete: end, paused: true });
  // 1 · Fuite
  tl.to('#inFade', { opacity: 0, duration: .7, ease: 'power1.out' }, 0)
    .to(cam, { x: -.34, y: .97, z: .1, duration: 1.0, ease: 'power2.out' }, 0)
    .to(lever.rotation, { y: -.2, duration: .5, ease: 'power3.inOut' }, .25)
    .call(() => dropFall(), null, .55)
    .call(() => dropFall(), null, .92)
    .call(() => { stream.visible = true; st.flow = 1; }, null, 1.22)
    .to(stream.scale, { y: .815, duration: .22, ease: 'power2.in' }, 1.22)
    .to(puddle.scale, { x: .95, y: .72, duration: 2.6, ease: 'power2.out' }, 1.42)
    .to(cam, { x: -.2, y: .62, z: .72, tx: -.62, ty: .18, tz: -.62, duration: 1.25 }, .95)
  // 2 · Vacillement, ampoule
    .to(st, { dark: .55, duration: .05, yoyo: true, repeat: 3, ease: 'none' }, 2.15)
    .to(cam, { x: .28, y: 1.34, z: .98, tx: .6, ty: 1.58, tz: -.55, duration: .9, ease: 'power3.inOut' }, 2.2)
    .to(st, { keyframes: [{ bulb: .9, duration: .06 }, { bulb: .1, duration: .05 }, { bulb: 1, duration: .08 }, { bulb: .2, duration: .04 }, { bulb: .95, duration: .2 }, { bulb: .05, duration: .05 }, { bulb: 1, duration: .25 }, { bulb: .3, duration: .04 }, { bulb: 1.15, duration: .2 }], ease: 'none' }, 2.62)
    .to(lamp.rotation, { keyframes: [{ z: .06, duration: .35 }, { z: -.04, duration: .35 }, { z: .02, duration: .3 }], ease: 'sine.inOut' }, 2.6)
  // 3 · Éclair + explosion
    .set(st, { arc: 1 }, 3.6)
    .to('#inFlash', { keyframes: [{ opacity: .9, duration: .04 }, { opacity: .15, duration: .05 }, { opacity: .75, duration: .04 }, { opacity: 0, duration: .3 }] }, 3.66)
    .call(() => { explode(); exploded = true; shake = .055; glass.visible = false; st.bulb = 0; gsap.fromTo(boomLight, { intensity: 16 }, { intensity: 0, duration: .45, ease: 'power2.out' }); }, null, 3.74)
    .set(st, { arc: 0 }, 3.9)
    .to(st, { dark: .78, duration: .12 }, 3.78)
    .to(lamp.rotation, { keyframes: [{ z: .35, duration: .25 }, { z: -.22, duration: .4 }, { z: .12, duration: .4 }, { z: -.05, duration: .4 }], ease: 'sine.inOut' }, 3.76)
    .to(cam, { x: .05, y: .78, z: 1.45, tx: .2, ty: .16, tz: -.4, duration: 1.0, ease: 'power3.inOut' }, 3.95)
    .call(() => { st.flow = 0; }, null, 4.4)
    .to(streamMat.uniforms.uOpacity, { value: 0, duration: .3 }, 4.4)
  // 4 · Lumière du jour + balai
    .to(st, { keyframes: [{ dayl: .5, dark: .4, duration: .06 }, { dayl: 0, dark: .92, duration: .08 }, { dayl: 1, dark: 0, duration: .45 }], ease: 'none' }, 4.62)
    .to(st, { sweep: 1, duration: 1.9, ease: 'none' }, 4.95)
    .call(() => window.__altioHeroPlay && window.__altioHeroPlay(), null, 5.25);

  function dropFall() {
    drop.visible = true; drop.position.copy(NOZ); drop.scale.set(.3, .3, .3);
    gsap.timeline()
      .to(drop.scale, { x: 1, y: 1.15, z: 1, duration: .16, ease: 'power1.in' })
      .to(drop.position, { y: .01, duration: .36, ease: 'power2.in' })
      .to(drop.scale, { y: 1.6, x: .85, z: .85, duration: .36, ease: 'power2.in' }, '<')
      .call(() => { drop.visible = false; ripple(.22); for (let i = 0; i < 10; i++) emit(splash, V(NOZ.x, .01, NOZ.z), V(rnd(-.5, .5), rnd(.8, 1.8), rnd(-.5, .5)), rnd(.3, .6)); });
  }

  /* ---------- Boucle de rendu ---------- */
  const clock = new THREE.Clock();
  let rippleT = 0, last = 0;
  const bar = document.getElementById('iBar');
  const loop = () => {
    const dt = Math.min(clock.getDelta(), 1 / 30), t = clock.elapsedTime;
    streamMat.uniforms.uTime.value = t;
    // eau
    if (st.flow) { for (let i = 0; i < 4; i++) emit(splash, V(NOZ.x + rnd(-.01, .01), .01, NOZ.z + rnd(-.01, .01)), V(rnd(-.7, .7), rnd(.6, 2.1), rnd(-.7, .7)), rnd(.25, .55));
      rippleT -= dt; if (rippleT <= 0) { ripple(rnd(.25, .42)); rippleT = .22; } }
    stepPoints(splash, dt, 9.8, false);
    stepPoints(sparks, dt, 6, false);
    sparks.pts.material.opacity = 1;
    // ampoule
    const b = Math.max(0, st.bulb);
    bulbLight.intensity = b * (mobile ? 9 : 11) * (.92 + Math.random() * .08);
    filMat.emissiveIntensity = b * 30; glassMat.emissiveIntensity = b * .35;
    // éclair
    if (st.arc) { buildArc(); arcGroup.visible = Math.random() > .15; arcMat.opacity = rnd(.6, 1); } else arcGroup.visible = false;
    // ambiance
    const dk = 1 - st.dark;
    hemi.intensity = (.32 * dk) * (1 - st.dayl) + st.dayl * 1.7;
    hemi.color.set(st.dayl > .5 ? '#fff7ec' : '#7f9fe0');
    moon.intensity = .55 * dk * (1 - st.dayl);
    day.intensity = st.dayl * 3.4;
    renderer.toneMappingExposure = 1 + st.dayl * .25;
    floorMat.envMapIntensity = .3 + st.dayl * .35; wall.material.envMapIntensity = .12 + st.dayl * .3;
    bloom.strength = .9 - st.dayl * .4;
    scene.background.set(st.dayl > .5 ? '#1a1612' : '#04070d');
    // physique des éclats
    if (exploded) stepShards(dt);
    // balai
    if (st.sweep > 0) {
      const p = st.sweep, ph = p * Math.PI * 2 * 3.2;
      const x = -1.45 + p * 3.3 + Math.sin(ph) * .11;
      broom.position.set(x, Math.max(0, -Math.cos(ph)) * .025, BROOMZ);
      broom.rotation.z = .5 + Math.sin(ph + 1.2) * .14;
      broom.rotation.y = Math.sin(ph * .5) * .08;
      const front = x + .09;
      S.forEach(o => { if (o.live && !o.pushed && o.p.x < front && o.p.x > front - .35 && Math.abs(o.p.z - BROOMZ) < 1.2) {
        o.pushed = true; o.v.set(rnd(2.2, 4.2), rnd(.3, 1.1), rnd(-.4, .4)); o.w.set(rnd(-15, 15), rnd(-15, 15), rnd(-15, 15)); } });
      if (o_frame++ % 2 === 0 && Math.random() < .5) emit(splash, V(front, .01, BROOMZ + rnd(-.25, .25)), V(rnd(.5, 1.5), rnd(.2, .6), rnd(-.3, .3)), .4);
      // révélation de l'accueil derrière le balai
      const sp = V(x - .08, .2, BROOMZ).project(camera);
      const sx = (sp.x + 1) / 2 * 100;
      el.style.clipPath = `inset(0 0 0 ${Math.min(100, Math.max(0, sx - 4)).toFixed(2)}%)`;
    }
    // caméra (+ caméra à l'épaule, + secousse)
    shake *= Math.pow(.02, dt);
    camera.position.set(cam.x + Math.sin(t * 1.7) * .006 + rnd(-shake, shake), cam.y + Math.sin(t * 2.3) * .005 + rnd(-shake, shake), cam.z);
    camera.lookAt(cam.tx, cam.ty, cam.tz);
    composer.render();
    if (window.__altioCapture) window.__altioCapture(renderer.domElement, tl.time(), el.style.clipPath);
    bar.style.transform = `scaleX(${tl.progress()})`;
  };
  let o_frame = 0;
  // pré-compilation : on prépare les shaders et on rend une image avant de lancer le film
  gsap.ticker.lagSmoothing(250, 33);
  camera.position.set(cam.x, cam.y, cam.z); camera.lookAt(cam.tx, cam.ty, cam.tz);
  explode(); stepShards(0); exploded = false; S.forEach(o => { o.live = false; }); writeShards(); buildArc(); arcGroup.visible = true; glass.visible = true; stream.visible = true;
  renderer.compile(scene, camera); composer.render();
  arcGroup.visible = false; stream.visible = false; sparks.life.fill(0);
  window.__altioIntroTl = tl;
  requestAnimationFrame(() => requestAnimationFrame(() => { clock.getDelta(); gsap.ticker.add(loop); tl.play(0); }));

  const onResize = () => { renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); fitFov(); };
  addEventListener('resize', onResize);

  let ended = false;
  function end() {
    if (ended) return; ended = true;
    gsap.ticker.remove(loop); removeEventListener('resize', onResize); gsap.ticker.lagSmoothing(0);
    renderer.dispose(); pmrem.dispose();
    try { renderer.forceContextLoss(); } catch (e) {}
    finish();
  }
  const skip = () => { tl.kill(); window.__altioHeroPlay && window.__altioHeroPlay(); gsap.to(el, { autoAlpha: 0, duration: .35, onComplete: end }); };
  document.getElementById('iSkip').addEventListener('click', skip);
  addEventListener('keydown', e => { if (!ended && (e.key === 'Escape' || e.key === 'Enter')) skip(); });
}
