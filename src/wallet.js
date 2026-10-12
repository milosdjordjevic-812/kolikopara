// Novčanik iz Blendera (public/models/novcanik.glb) kao tehnički crtež koji se okreće.
// Površine su obojene bojom podloge, a ivice se crtaju linijom, kao laptop na portfoliju.
import { WebGLRenderer, Scene, PerspectiveCamera, Group, Box3, Vector3, Color, MeshBasicMaterial, EdgesGeometry } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

const cache = {};
const loadModel = url => (cache[url] ||= new GLTFLoader().loadAsync(url));

export const mountWallet = (el, o = {}) => mountModel(el, { url: "/models/novcanik.glb", ...o });
export const mountCard = (el, o = {}) => mountModel(el, { url: "/models/kartica.glb", period: 22, ...o });
export const mountNamed = (el, name, o = {}) => mountModel(el, { url: `/models/${name}.glb`, period: 24, ...o });

// still: ugao u radijanima za mirnu sliku bez okretanja (koristi se i za ikonicu appa)
export function mountModel(el, { url, line = "#1b1813", fill = "#dfddcd", width = 1.15, period = 18, still = null, zoom = 0.9, mask = false } = {}) {
  // mask: površine ne crtaju boju, samo sakrivaju linije iza sebe, pa se vidi pozadina strane
  const reduce = still !== null || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: still !== null });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  el.appendChild(renderer.domElement);
  renderer.domElement.setAttribute("aria-hidden", "true");

  const scene = new Scene();
  const camera = new PerspectiveCamera(26, 1, 0.1, 200);
  const spin = new Group(); scene.add(spin);
  const mats = [];
  let disposed = false, raf = 0, visible = true, t0 = performance.now();

  loadModel(url).then(gltf => {
    if (disposed) return;
    const root = gltf.scene.clone(true);
    const toAdd = [];
    root.traverse(o => {
      if (o.isMesh) {
        o.material = new MeshBasicMaterial({ color: new Color(fill), colorWrite: !mask, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
        if (mask) o.renderOrder = -1;
        const g = new LineSegmentsGeometry().fromEdgesGeometry(new EdgesGeometry(o.geometry, 28));
        const m = new LineMaterial({ color: new Color(line), linewidth: width });
        mats.push(m);
        toAdd.push([o, new LineSegments2(g, m)]);
      } else if (o.isLineSegments || o.isLine) {
        // šavovi i crteži na novčanici: isprekidana linija
        const pos = o.geometry.getAttribute("position"), idx = o.geometry.index;
        const arr = [];
        const push = i => arr.push(pos.getX(i), pos.getY(i), pos.getZ(i));
        if (idx) for (let k = 0; k < idx.count; k++) push(idx.getX(k)); else for (let k = 0; k < pos.count; k++) push(k);
        const g = new LineSegmentsGeometry().setPositions(arr);
        const dashed = /^sav/.test(o.name);
        const m = new LineMaterial({ color: new Color(line), linewidth: width * (dashed ? 0.85 : 0.9), dashed, dashSize: 0.32, gapSize: 0.22 });
        mats.push(m);
        const seg = new LineSegments2(g, m); if (dashed) seg.computeLineDistances();
        seg.position.copy(o.position); seg.quaternion.copy(o.quaternion); seg.scale.copy(o.scale);
        toAdd.push([o.parent, seg, o]);
      }
    });
    for (const [parent, seg, replace] of toAdd) { parent.add(seg); if (replace) parent.remove(replace); }
    const box = new Box3().setFromObject(root), c = box.getCenter(new Vector3()), size = box.getSize(new Vector3());
    root.position.sub(c);
    spin.add(root);
    const r = size.length() / 2;
    const dist = r / Math.sin((camera.fov * Math.PI / 180) / 2) * zoom;
    camera.position.set(0, r * 0.55, dist);
    camera.lookAt(0, 0, 0);
    resize(); frame(performance.now()); el.dataset.ready = "1";
  }).catch(() => { el.classList.add("wallet-failed"); });

  function resize() {
    const w = el.clientWidth || 1, h = el.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    for (const m of mats) m.resolution.set(w, h);
  }
  function frame(t) {
    if (disposed) return;
    const s = (t - t0) / 1000;
    spin.rotation.y = still !== null ? still : reduce ? 0.6 : s * (Math.PI * 2 / period);   // jedan krug za period sekundi
    spin.rotation.x = reduce ? 0 : Math.sin(s * 0.5) * 0.05;
    renderer.render(scene, camera);
    if (!reduce && visible && !document.hidden) raf = requestAnimationFrame(frame);
  }
  const ro = new ResizeObserver(() => { resize(); if (reduce || !raf) renderer.render(scene, camera); });
  ro.observe(el);
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    cancelAnimationFrame(raf); raf = 0;
    if (visible && !reduce) raf = requestAnimationFrame(frame);
  });
  io.observe(el);
  const onVis = () => { cancelAnimationFrame(raf); raf = 0; if (!document.hidden && visible && !reduce) raf = requestAnimationFrame(frame); };
  document.addEventListener("visibilitychange", onVis);

  return () => {
    disposed = true; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
    document.removeEventListener("visibilitychange", onVis);
    renderer.dispose(); renderer.domElement.remove();
  };
}
