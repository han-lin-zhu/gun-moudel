import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { createFiringExperience } from './firing.js';
import { createM1913 } from './m1913.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { catalog, setupCatalog } from './catalog.js';
import { createAgedSurface } from './surface.js';
import { createFirstPerson } from './first-person.js';
import './style.css';
import './first-person.css';

const viewport = document.querySelector('#viewport');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#eeece6');
const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
} catch (error) {
  document.querySelector('#loading').style.display = 'none';
  document.querySelector('#error').hidden = false;
  throw error;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.4;
viewport.appendChild(renderer.domElement);
const environmentGenerator = new THREE.PMREMGenerator(renderer);
const environmentRoom = new RoomEnvironment();
const environmentMap = environmentGenerator.fromScene(environmentRoom, 0.04);
scene.environment = environmentMap.texture;
scene.environmentIntensity = 0.55;
environmentRoom.dispose(); environmentGenerator.dispose();
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.minDistance = 2;
controls.maxDistance = 72;
controls.maxPolarAngle = Math.PI * 0.88;
controls.autoRotateSpeed = 0.65;
controls.enablePan = true;
controls.target.set(0, -0.2, 0);

scene.add(new THREE.HemisphereLight(0xf6f5ed, 0x777c6c, 3.0));
const key = new THREE.DirectionalLight(0xfff1dd, 4.5);
key.position.set(-3, 7, 6);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -7, right: 7, top: 5, bottom: -5, near: 0.5, far: 25 });
key.shadow.normalBias = 0.035;
key.shadow.bias = -0.0002;
key.shadow.radius = 4;
scene.add(key);
const fill = new THREE.DirectionalLight(0xdde7f0, 2.4);
fill.position.set(3, 2, -5);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xffffff, 2);
rim.position.set(2, 4, 1);
scene.add(rim);

// The model represents exterior surfaces only; all proportions are artistic.
const rifle = new THREE.Group();
rifle.name = 'AK-47 — exterior study';
scene.add(rifle);
const metal = new THREE.MeshStandardMaterial({ color: 0x555d60, ...createAgedSurface('steel', 47), metalness: 0.8, roughness: 0.7 });
const edgeMetal = new THREE.MeshStandardMaterial({ color: 0x4a4d44, metalness: 0.78, roughness: 0.32 });
const darkMetal = new THREE.MeshStandardMaterial({ color: 0x171c19, metalness: 0.7, roughness: 0.4 });
const recess = new THREE.MeshStandardMaterial({ color: 0x101612, metalness: 0.3, roughness: 0.65 });
const woodMaterials = [];

function randomGenerator(seed) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}

function woodTexture(base, seed = 91) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const rand = randomGenerator(seed);
  ctx.fillStyle = base; ctx.fillRect(0, 0, 1024, 256);
  for (let i = 0; i < 950; i++) {
    const y = rand() * 256;
    ctx.beginPath(); ctx.moveTo(-10, y);
    ctx.bezierCurveTo(220, y + (rand() - 0.5) * 22, 670, y + (rand() - 0.5) * 32, 1034, y + (rand() - 0.5) * 16);
    ctx.strokeStyle = rand() > 0.35 ? `rgba(41,18,7,${0.025 + rand() * 0.15})` : `rgba(246,190,114,${rand() * 0.13})`;
    ctx.lineWidth = 0.3 + rand() * 2.1; ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}
const textures = { classic: woodTexture('#99522c'), dark: woodTexture('#503322'), amber: woodTexture('#bb7d37') };
function woodMaterial() {
  const material = new THREE.MeshStandardMaterial({ map: textures.classic, bumpMap: textures.classic, bumpScale: 0.014, roughness: 0.48, metalness: 0.02 });
  woodMaterials.push(material);
  return material;
}
const wood = woodMaterial();
const gripWood = woodMaterial();

function mesh(geometry, material, x = 0, y = 0, z = 0, parent = rifle) {
  const part = new THREE.Mesh(geometry, material);
  part.position.set(x, y, z); part.castShadow = true; part.receiveShadow = true;
  parent.add(part); return part;
}
function box(w, h, d, x, y, z, material = metal) {
  return mesh(new THREE.BoxGeometry(w, h, d), material, x, y, z);
}
function cylinder(radius, length, x, y, z, material = metal, axis = 'x', radiusEnd = radius, openEnded = false) {
  const part = mesh(new THREE.CylinderGeometry(radius, radiusEnd, length, 32, 1, openEnded), material, x, y, z);
  if (axis === 'x') part.rotation.z = Math.PI / 2;
  if (axis === 'z') part.rotation.x = Math.PI / 2;
  return part;
}
function profile(points, depth, material, bevel = 0.025) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y));
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelSegments: 3, steps: 1, bevelSize: bevel, bevelThickness: bevel, curveSegments: 24 });
  geometry.translate(0, 0, -depth / 2);
  // Map long faces along the grain instead of wrapping the texture per triangle.
  const positions = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, positions.getX(i) * 0.44 + 0.5, positions.getY(i) * 0.8 + 0.5);
  return mesh(geometry, material);
}
function lineTube(points, radius, material = metal) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  return mesh(new THREE.TubeGeometry(curve, 40, radius, 8, false), material);
}
function screw(x, y, z, radius = 0.037) {
  cylinder(radius, 0.018, x, y, z, edgeMetal, 'z');
  box(radius * 1.1, 0.009, 0.004, x, y, z + Math.sign(z) * 0.011, recess).rotation.z = -0.45;
}

// Walnut buttstock, stamped steel heel and neck collar.
const stockStart = rifle.children.length;
profile([[-4.16, 0.16], [-3.83, 0.22], [-2.23, 0.24], [-1.85, 0.15], [-1.85, -0.18], [-2.25, -0.3], [-3.88, -0.77], [-4.16, -0.7]], 0.38, wood, 0.065).name = 'Walnut stock';
profile([[-4.23, 0.17], [-4.13, 0.17], [-4.13, -0.72], [-4.23, -0.72]], 0.43, darkMetal, 0.035);
box(0.17, 0.37, 0.43, -1.91, 0.005, 0, metal);
for (const z of [-0.215, 0.215]) { screw(-2.23, 0.02, z, 0.043); screw(-3.97, -0.3, z, 0.027); }
lineTube([[-3.68, -0.66, 0], [-3.72, -0.78, 0], [-3.49, -0.77, 0], [-3.45, -0.65, 0]], 0.026, edgeMetal);
const shoulderStock = new THREE.Group(); shoulderStock.name = 'Shoulder stock';
shoulderStock.userData.hideInFirstPerson = true;
for (const part of rifle.children.slice(stockStart)) shoulderStock.add(part);
rifle.add(shoulderStock);

// Receiver and rounded dust cover.
profile([[-1.86, 0.22], [-1.57, 0.31], [0.66, 0.31], [0.88, 0.17], [0.88, -0.23], [0.45, -0.29], [-1.86, -0.25]], 0.43, metal, 0.025).name = 'Exterior receiver';
box(2.42, 0.07, 0.46, -0.57, -0.225, 0, darkMetal);
const coverShape = new THREE.Shape();
coverShape.moveTo(-0.245, 0); coverShape.lineTo(-0.245, 0.12);
coverShape.quadraticCurveTo(0, 0.43, 0.245, 0.12); coverShape.lineTo(0.245, 0); coverShape.closePath();
const coverGeo = new THREE.ExtrudeGeometry(coverShape, { depth: 2.17, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.015, bevelSegments: 3, steps: 1 });
const cover = mesh(coverGeo, metal, -1.66, 0.225, 0);
cover.rotation.y = Math.PI / 2;
box(0.09, 0.15, 0.29, -1.69, 0.35, 0, edgeMetal);
for (const z of [-0.23, 0.23]) {
  for (const [x, y] of [[-1.55, 0.07], [-1.55, -0.12], [0.35, 0.06], [0.62, -0.1], [-0.95, -0.12]]) screw(x, y, z, 0.031);
  // Broad shallow stamping and ribs on the receiver skin.
  const dimple = mesh(new THREE.SphereGeometry(1, 24, 16), darkMetal, -0.28, -0.05, z);
  dimple.scale.set(0.26, 0.075, 0.012);
  box(1.17, 0.018, 0.016, -0.85, -0.18, z, edgeMetal);
}
box(0.91, 0.12, 0.019, -0.04, 0.21, 0.246, recess);
box(0.34, 0.085, 0.027, 0.24, 0.21, 0.258, edgeMetal);
cylinder(0.042, 0.25, 0.3, 0.22, 0.36, metal, 'z');
cylinder(0.064, 0.09, 0.3, 0.22, 0.5, darkMetal, 'z');
const selector = profile([[-0.87, 0.14], [-0.79, 0.19], [0.25, -0.05], [0.29, -0.13], [0.16, -0.16], [-0.82, 0.075]], 0.025, edgeMetal, 0.01);
selector.position.z = 0.258;
screw(-0.8, 0.13, 0.29, 0.048);

// Sloped wooden pistol grip and visible outer trigger guard.
profile([[-1.34, -0.25], [-0.94, -0.26], [-0.9, -0.46], [-1.12, -1.25], [-1.5, -1.13], [-1.49, -0.98]], 0.32, gripWood, 0.043).name = 'Walnut grip';
for (const z of [-0.177, 0.177]) {
  screw(-1.24, -0.69, z, 0.041);
  for (let i = 0; i < 7; i++) {
    const groove = box(0.19, 0.008, 0.005, -1.26 + i * 0.014, -0.98 + i * 0.065, z, darkMetal);
    groove.rotation.z = -0.16;
  }
}
lineTube([[-1.05, -0.28, 0], [-0.97, -0.65, 0], [-0.67, -0.71, 0], [-0.37, -0.67, 0], [-0.28, -0.27, 0]], 0.039, metal);
lineTube([[-0.59, -0.28, 0], [-0.65, -0.43, 0], [-0.56, -0.54, 0]], 0.043, darkMetal);

// Curved magazine silhouette with pressed ribs and a rolled floor plate.
const magazineShape = new THREE.Shape();
magazineShape.moveTo(-0.12, -0.26); magazineShape.lineTo(0.52, -0.26);
magazineShape.bezierCurveTo(0.53, -0.96, 0.83, -1.63, 1.26, -2.06);
magazineShape.lineTo(0.68, -2.36);
magazineShape.bezierCurveTo(0.11, -1.88, -0.13, -1.08, -0.12, -0.26);
const magazineGeo = new THREE.ExtrudeGeometry(magazineShape, { depth: 0.34, bevelEnabled: true, bevelSegments: 3, bevelSize: 0.035, bevelThickness: 0.025, steps: 1, curveSegments: 40 });
magazineGeo.translate(0, 0, -0.17);
mesh(magazineGeo, metal).name = 'Curved exterior magazine';
for (const z of [-0.204, 0.204]) {
  for (let i = 0; i < 4; i++) {
    const k = i * 0.126;
    lineTube([[0.003 + k, -0.49, z], [0.025 + k, -0.98, z], [0.19 + k, -1.49, z], [0.51 + k, -1.98, z]], 0.022, edgeMetal);
    lineTube([[-0.029 + k, -0.51, z], [-0.007 + k, -0.99, z], [0.158 + k, -1.5, z], [0.478 + k, -1.99, z]], 0.009, darkMetal);
  }
  lineTube([[0.12, -1.46, z], [0.3, -1.55, z], [0.72, -1.58, z]], 0.018, darkMetal);
}
profile([[0.61, -2.32], [1.25, -2.01], [1.33, -2.1], [0.69, -2.43]], 0.4, darkMetal, 0.025);
box(0.71, 0.12, 0.39, 0.2, -0.34, 0, darkMetal);

// Lower handguard and raised wooden gas-tube cover.
profile([[0.77, 0.04], [1.94, 0.04], [2.07, -0.05], [2.02, -0.34], [1.79, -0.42], [0.88, -0.34]], 0.49, wood, 0.055).name = 'Lower walnut handguard';
profile([[0.92, 0.18], [1.91, 0.18], [1.94, 0.39], [1.79, 0.47], [1.05, 0.47], [0.92, 0.39]], 0.35, wood, 0.04);
box(0.12, 0.48, 0.54, 0.83, -0.02, 0, darkMetal);
box(0.12, 0.47, 0.49, 2.01, -0.04, 0, metal);
for (const z of [-0.263, 0.263]) {
  for (let i = 0; i < 3; i++) {
    const vent = box(0.17, 0.038, 0.013, 1.12 + i * 0.26, 0.077, z * 0.78, recess);
    vent.rotation.z = -0.02;
  }
  screw(1.96, -0.15, z, 0.031);
}

// Barrel, gas tube, collars, front sight hood and muzzle surface.
cylinder(0.105, 2.34, 3.13, -0.025, 0, metal);
cylinder(0.071, 1.49, 2.13, 0.31, 0, darkMetal);
cylinder(0.135, 0.2, 2.15, -0.02, 0, edgeMetal);
profile([[2.56, -0.03], [2.8, -0.03], [2.8, 0.31], [2.69, 0.42], [2.56, 0.37]], 0.21, metal, 0.02);
cylinder(0.105, 0.2, 2.66, 0.31, 0, metal);
cylinder(0.145, 0.2, 3.67, -0.025, 0, darkMetal);
profile([[3.57, 0.01], [3.78, 0.01], [3.76, 0.48], [3.68, 0.52], [3.57, 0.4]], 0.19, metal, 0.018);
const sight = mesh(new THREE.TorusGeometry(0.135, 0.028, 12, 40), metal, 3.66, 0.53, 0);
sight.rotation.y = Math.PI / 2;
box(0.045, 0.15, 0.028, 3.66, 0.49, 0, edgeMetal);
cylinder(0.032, 3.36, 2.2, -0.18, 0, edgeMetal);
cylinder(0.138, 0.3, 4.27, -0.025, 0, metal, 'x', 0.138, true);
cylinder(0.143, 0.038, 4.41, -0.025, 0, edgeMetal, 'x', 0.143, true);
const muzzleFace = mesh(new THREE.RingGeometry(0.057, 0.132, 32), darkMetal, 4.432, -0.025, 0);
muzzleFace.rotation.y = Math.PI / 2;
const muzzleInteriorMaterial = new THREE.MeshStandardMaterial({ color: 0x101612, roughness: 0.85, side: THREE.BackSide });
cylinder(0.057, 0.10, 4.38, -0.025, 0, muzzleInteriorMaterial, 'x', 0.057, true);
const muzzleHole = mesh(new THREE.CircleGeometry(0.057, 32), recess, 4.325, -0.025, 0);
muzzleHole.rotation.y = Math.PI / 2;
box(0.52, 0.14, 0.33, 0.63, 0.43, 0, darkMetal);
box(0.37, 0.065, 0.19, 0.6, 0.535, 0, edgeMetal).rotation.z = 0.06;
for (let i = 0; i < 7; i++) box(0.014, 0.006, 0.13, 0.44 + i * 0.041, 0.575 + i * 0.0025, 0, darkMetal);
for (const z of [-0.13, 0.13]) box(0.08, 0.12, 0.045, 0.39, 0.58, z, metal);
lineTube([[2.05, -0.12, -0.23], [2.13, -0.19, -0.34], [2.14, -0.35, -0.34], [2.02, -0.36, -0.24]], 0.026, edgeMetal);

const pistol = createM1913();
pistol.group.visible = false; scene.add(pistol.group);
const archives = {
  ak47: { group: rifle, muzzle: new THREE.Vector3(4.46, -0.025, 0), title: 'AK—47', year: '1947', number: '001', subtitle: '经典轮廓，换一个角度。', description: '木与钢的鲜明对比，极具辨识度的弧线。\n在三维空间中，重新观察这件经典设计。', targetY: -0.55, distance: 1, floor: -2.76 },
  m1913: { group: pistol.group, muzzle: pistol.muzzle, title: 'M1913', year: '1913', number: '002', subtitle: '旧日钢色，凝于掌间。', description: '圆润的套筒，纵向纹理握把与岁月钢色。\n依据你提供的侧面照片，重建外观与细节。', targetY: -0.95, distance: 0.9, floor: -3.22 },
};
let activeArchive = 'ak47';
let currentFinish = 'classic';
let firstPerson;

// Ground receives soft shadows while remaining part of the neutral backdrop.
const floor = mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ color: 0x4e5741, opacity: 0.18 }), 0, -2.76, 0, scene);
floor.rotation.x = -Math.PI / 2;
floor.castShadow = false;

const firing = createFiringExperience({ scene, rifle });

let transition = null;
let currentView = 'perspective';
const viewDirections = { perspective: new THREE.Vector3(3.4, 2, 12), side: new THREE.Vector3(0, 0.12, 12), top: new THREE.Vector3(0, 12, 0.1), muzzle: new THREE.Vector3(9, 1.8, 7) };
function homeDistance() {
  const { width, height } = viewport.getBoundingClientRect();
  return Math.max(14.7, 17.2 * height / width) * archives[activeArchive].distance;
}
function selectView(name, animate = true) {
  if (firstPerson?.active) return;
  controls.autoRotate = false;
  document.querySelector('#rotate').setAttribute('aria-pressed', 'false');
  currentView = name;
  // Allow close inspection of small details in every view.
  controls.minDistance = 2;
  const direction = viewDirections[name].clone().normalize().multiplyScalar(name === 'muzzle' ? (window.innerWidth < 560 ? 5.2 : 3.5) : homeDistance());
  const target = name === 'muzzle' ? archives[activeArchive].muzzle.clone() : new THREE.Vector3(0, archives[activeArchive].targetY, 0);
  const position = direction.add(target);
  if (animate) transition = { from: camera.position.clone(), to: position, fromTarget: controls.target.clone(), toTarget: target, start: performance.now() };
  else { transition = null; camera.position.copy(position); controls.target.copy(target); controls.update(); }
  document.querySelectorAll('[data-view]').forEach(button => { const selected = button.dataset.view === name; button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected)); });
}
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => selectView(button.dataset.view)));
const rotateButton = document.querySelector('#rotate');
rotateButton.addEventListener('click', () => { controls.autoRotate = !controls.autoRotate; rotateButton.setAttribute('aria-pressed', String(controls.autoRotate)); });
document.querySelector('#reset').addEventListener('click', () => { controls.autoRotate = false; rotateButton.setAttribute('aria-pressed', 'false'); selectView('perspective'); });
controls.addEventListener('start', () => { transition = null; });
const finishNames = { classic: '经典胡桃木', dark: '深色胡桃木', amber: '琥珀色木材' };
function updateModelLabel() {
  document.querySelector('#model-label').textContent = activeArchive === 'm1913' ? 'M1913 / AGED STEEL' : `AK–47 / ${currentFinish === 'classic' ? 'CLASSIC WOOD' : currentFinish === 'dark' ? 'DARK WALNUT' : 'AMBER WOOD'}`;
}
document.querySelectorAll('[data-finish]').forEach(button => button.addEventListener('click', () => {
  woodMaterials.forEach(material => { material.map = textures[button.dataset.finish]; material.bumpMap = material.map; material.needsUpdate = true; });
  document.querySelector('#finish-name').textContent = finishNames[button.dataset.finish];
  currentFinish = button.dataset.finish; updateModelLabel();
  document.querySelectorAll('[data-finish]').forEach(swatch => { const selected = swatch === button; swatch.classList.toggle('selected', selected); swatch.setAttribute('aria-pressed', String(selected)); });
}));

function selectArchive(id) {
  if (!archives[id]) return;
  activeArchive = id;
  const archive = archives[id];
  firing.setModel(archive.group, archive.muzzle);
  firstPerson?.setModel(id);
  for (const [key, item] of Object.entries(archives)) item.group.visible = key === id;
  floor.position.y = archive.floor;
  document.querySelector('#model-title').innerHTML = `${archive.title}<span class="title-dot">.</span>`;
  document.querySelector('.subtitle').textContent = archive.subtitle;
  document.querySelector('.description').textContent = archive.description;
  document.querySelector('.intro-meta').innerHTML = `<span>${archive.year}</span><span>外观研究</span><span>NO. ${archive.number}</span>`;
  document.querySelector('.scene-caption').textContent = `三维外观研究 · ${archive.number}`;
  document.querySelector('.material-section').hidden = id !== 'ak47';
  document.querySelector('#pistol-material').hidden = id !== 'm1913';
  document.querySelector('#viewport').setAttribute('aria-label', firstPerson?.active ? `${archive.title} 第一人称持枪画面，移动鼠标转头，左键射击，Esc 退出视角控制` : `可拖拽旋转、滚轮缩放的 ${archive.title} 三维外观模型`);
  modelCatalog.setActive(id);
  document.title = `${archive.title} · 形态档案`;
  document.querySelector('#app').dataset.model = id;
  updateModelLabel(); if (!firstPerson?.active) selectView('perspective', false);
}
// Model metadata and all searchable fields have one shared registry.
for (const item of catalog) Object.assign(archives[item.id], { title: item.title, number: item.number, year: item.year });
const modelCatalog = setupCatalog({ onSelect: id => { selectArchive(id); history.replaceState(null, '', `#${id}`); } });
window.addEventListener('hashchange', () => selectArchive(location.hash.slice(1)));

firstPerson = createFirstPerson({ scene, camera, controls, canvas: renderer.domElement, archives, firing,
  getActiveArchive: () => activeArchive,
  onModeChange: (enabled, reframe = false) => {
    transition = null; floor.visible = !enabled;
    viewport.setAttribute('aria-label', enabled ? '第一人称持枪画面，移动鼠标转头，左键射击，Esc 退出视角控制' : `可拖拽旋转、滚轮缩放的 ${archives[activeArchive].title} 三维外观模型`);
    resize();
    if (reframe) selectView(currentView, false);
  },
});

function resize() {
  const { width, height } = viewport.getBoundingClientRect();
  camera.aspect = width / height;
  // Leave visual space for the title above and controls at the right.
  if (firstPerson?.active) camera.clearViewOffset();
  else camera.setViewOffset(width, height, width < 560 ? 0 : width * 0.055, -height * (width < 560 ? 0.08 : 0.035), width, height);
  camera.updateProjectionMatrix(); renderer.setSize(width, height);
}
window.addEventListener('resize', () => { resize(); if (!firstPerson?.active) selectView(currentView, false); });
resize(); selectView('perspective', false);
selectArchive(archives[location.hash.slice(1)] ? location.hash.slice(1) : 'ak47');
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const delta = Math.min(clock.getDelta(), 0.05);
  if (transition) {
    const t = Math.min((performance.now() - transition.start) / 900, 1);
    const eased = t * t * (3 - 2 * t);
    camera.position.lerpVectors(transition.from, transition.to, eased);
    controls.target.lerpVectors(transition.fromTarget, transition.toTarget, eased);
    if (t === 1) transition = null;
  }
  if (!firstPerson.active) controls.update(delta);
  firstPerson.update(delta);
  firing.update(delta);
  // Apply a small render-only camera impulse, so OrbitControls never accumulates drift.
  const cameraOffset = firing.cameraOffset;
  if (!firstPerson.active) { camera.position.add(cameraOffset); camera.lookAt(controls.target); }
  renderer.render(scene, camera);
  if (!firstPerson.active) camera.position.sub(cameraOffset);
});
document.querySelector('#loading').classList.add('ready');

// Provide a reusable GLB asset without including gallery lights or the ground.
const exportModel = () => new Promise((resolve, reject) => {
  const exportId = activeArchive;
  const exportedRifle = archives[exportId].group.clone();
  exportedRifle.traverse(part => { if (part.userData.hideInFirstPerson) part.visible = true; });
  exportedRifle.position.set(0, 0, 0); exportedRifle.rotation.set(0, 0, 0);
  new GLTFExporter().parse(exportedRifle, result => {
    const blob = new Blob([result], { type: 'model/gltf-binary' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${exportId}-exterior.glb`; link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000); resolve(blob.size);
  }, reject, { binary: true });
});
window.exportModel = exportModel;
document.querySelector('#export').addEventListener('click', async () => {
  const button = document.querySelector('#export');
  button.disabled = true; button.textContent = '正在导出…';
  try { await exportModel(); button.textContent = '下载模型 ↓'; }
  catch (error) { console.error(error); button.textContent = '导出失败，点击重试'; }
  finally { button.disabled = false; }
});
