// Kasica prasica kao tehnički crtež, sklopljena u kodu (bez .glb fajla).
// Površine dobijaju boju podloge u wallet.js; obris tela crta "ljuska" (malo veća kopija, okrenuta naopako),
// a detalji su linije na površini. Novčić povremeno upadne u prorez.
import { Group, Mesh, SphereGeometry, CylinderGeometry, ConeGeometry, MeshBasicMaterial, BackSide, Color, BufferGeometry, Float32BufferAttribute, LineSegments, Vector3 } from "three";

const A = 1.3, B = 1.0, C = 1.0;           // poluose tela: dužina, visina, širina
const W = 0.022;                            // debljina obrisa

// tačka na površini tela u pravcu v (od centra)
const onBody = (v, out = 1.004) => { const k = 1 / Math.sqrt((v.x / A) ** 2 + (v.y / B) ** 2 + (v.z / C) ** 2); return v.clone().multiplyScalar(k * out); };

function line(points, closed, name = "linija") {
  const arr = [];
  const n = closed ? points.length : points.length - 1;
  for (let i = 0; i < n; i++) { const a = points[i], b = points[(i + 1) % points.length]; arr.push(a.x, a.y, a.z, b.x, b.y, b.z); }
  const g = new BufferGeometry(); g.setAttribute("position", new Float32BufferAttribute(arr, 3));
  const l = new LineSegments(g); l.name = name; return l;
}

// kružić na površini tela (oko, dugme)
function surfaceCircle(dir, r, steps = 28) {
  const P = onBody(dir, 1);
  const n = new Vector3(P.x / A / A, P.y / B / B, P.z / C / C).normalize();
  const t1 = new Vector3().crossVectors(n, new Vector3(0, 1, 0)); if (t1.lengthSq() < 1e-6) t1.set(1, 0, 0); t1.normalize();
  const t2 = new Vector3().crossVectors(n, t1).normalize();
  const pts = [];
  for (let i = 0; i < steps; i++) { const a = i / steps * Math.PI * 2; pts.push(onBody(P.clone().addScaledVector(t1, Math.cos(a) * r).addScaledVector(t2, Math.sin(a) * r), 1.006)); }
  return line(pts, true);
}

export function buildPiggy({ line: ink = "#2d120d" } = {}) {
  const root = new Group();
  const solids = [];
  const solid = (geo, pos, rot, scaleHull) => {
    const m = new Mesh(geo); m.position.copy(pos); if (rot) m.rotation.set(...rot);
    root.add(m); solids.push([m, scaleHull]); return m;
  };

  // telo
  const body = new SphereGeometry(1, 72, 48); body.scale(A, B, C);
  solid(body, new Vector3(0, 0, 0), null, [1 + W / A, 1 + W / B, 1 + W / C]);
  // njuška
  solid(new CylinderGeometry(0.34, 0.37, 0.3, 48), new Vector3(1.36, -0.06, 0), [0, 0, -Math.PI / 2], [1 + W / 0.15, 1 + W / 0.35, 1 + W / 0.35]);
  // uši: četvorostrane piramide, nagnute napred i u stranu
  for (const s of [1, -1]) solid(new ConeGeometry(0.24, 0.42, 4), new Vector3(0.62, 0.86, 0.44 * s), [0.42 * s, 0.6 * s, -0.42], [1 + W / 0.24, 1 + W / 0.21, 1 + W / 0.24]);
  // noge
  for (const x of [0.66, -0.66]) for (const z of [0.46, -0.46]) solid(new CylinderGeometry(0.2, 0.18, 0.5, 40), new Vector3(x, -0.86, z), null, [1 + W / 0.2, 1 + W / 0.25, 1 + W / 0.2]);

  // obris: malo veća kopija svakog dela, iscrtana bojom linije, vide se samo njene ivice
  const inkMat = new MeshBasicMaterial({ color: new Color(ink), side: BackSide });
  for (const [m, sc] of solids) {
    const h = new Mesh(m.geometry, inkMat); h.userData.keep = true;
    h.position.copy(m.position); h.rotation.copy(m.rotation); h.scale.set(...sc);
    root.add(h);
  }

  // nozdrve na prednjoj strani njuške
  const fx = 1.36 + 0.151;
  for (const z of [0.11, -0.11]) {
    const pts = []; for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; pts.push(new Vector3(fx, -0.06 + Math.sin(a) * 0.085, z + Math.cos(a) * 0.05)); }
    root.add(line(pts, true));
  }
  // oči
  for (const s of [1, -1]) root.add(surfaceCircle(new Vector3(0.95, 0.4, 0.42 * s), 0.055));
  // prorez za novčiće, uzduž leđa
  const slot = [];
  const top = (x, z) => new Vector3(x, B * Math.sqrt(Math.max(0, 1 - (x / A) ** 2 - (z / C) ** 2)) * 1.004, z);
  for (let i = 0; i <= 12; i++) slot.push(top(-0.26 + i / 12 * 0.52, 0.05));
  for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + i / 8 * Math.PI; slot.push(top(0.26 + Math.cos(a) * 0.05, -Math.sin(a) * 0.05)); }
  for (let i = 0; i <= 12; i++) slot.push(top(0.26 - i / 12 * 0.52, -0.05));
  for (let i = 0; i <= 8; i++) { const a = Math.PI / 2 + i / 8 * Math.PI; slot.push(top(-0.26 + Math.cos(a) * 0.05, -Math.sin(a) * 0.05)); }
  root.add(line(slot, true));
  // šav oko stomaka, isprekidan (kao kod kalupa za keramiku)
  const band = []; const bx = -0.2, rr = Math.sqrt(1 - (bx / A) ** 2);
  for (let i = 0; i < 96; i++) { const a = i / 96 * Math.PI * 2; band.push(new Vector3(bx, Math.sin(a) * B * rr * 1.005, Math.cos(a) * C * rr * 1.005)); }
  root.add(line(band, true, "sav-stomak"));
  // repić: spirala pozadi
  const tail = [];
  for (let i = 0; i <= 60; i++) { const t = i / 60 * Math.PI * 3.2; tail.push(new Vector3(-A + 0.02 - i / 60 * 0.26, 0.18 + Math.sin(t) * 0.075, Math.cos(t) * 0.075 - 0.075)); }
  root.add(line(tail, false));

  // novčić koji upada u prorez
  const coin = new Group();
  const cm = new Mesh(new CylinderGeometry(0.27, 0.27, 0.06, 48)); cm.rotation.x = Math.PI / 2; coin.add(cm);
  const ch = new Mesh(cm.geometry, inkMat); ch.userData.keep = true; ch.rotation.x = Math.PI / 2; ch.scale.set(1 + W / 0.27, 1 + W / 0.03, 1 + W / 0.27); coin.add(ch);
  const ring = []; for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; ring.push(new Vector3(Math.cos(a) * 0.19, Math.sin(a) * 0.19, 0.0315)); }
  coin.add(line(ring, true)); const ring2 = line(ring.map(p => new Vector3(p.x, p.y, -0.0315)), true); coin.add(ring2);
  root.add(coin);
  const yIn = B - 0.35, yHigh = B + 0.75;
  coin.position.set(0, yHigh, 0);
  // s: sekunde od početka; svake 4 s novčić padne i nestane u kasici
  root.userData.tick = s => {
    const ph = (s % 4) / 4;
    if (ph < 0.12) { coin.visible = true; coin.position.y = yHigh; }
    else if (ph < 0.5) { const t = (ph - 0.12) / 0.38; coin.visible = true; coin.position.y = yHigh - (yHigh - yIn) * t * t; }
    else coin.visible = false;
  };
  root.userData.still = () => { coin.visible = true; coin.position.y = B + 0.12; };
  return root;
}
