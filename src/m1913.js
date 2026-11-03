import * as THREE from 'three';
import { createAgedSurface } from './surface.js';

const point = (x, y) => new THREE.Vector2((x - 550) / 140, (260 - y) / 140);
function path(commands, Type = THREE.Shape) {
  const shape = new Type();
  for (const [command, ...values] of commands) {
    const p = [];
    for (let i = 0; i < values.length; i += 2) p.push(...point(values[i], values[i + 1]).toArray());
    shape[command](...p);
  }
  return shape;
}

function extrudedGeometry(shape, depth, bevel, z = 0) {
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSegments: 4, bevelSize: bevel, bevelThickness: bevel, curveSegments: 28, steps: 1 });
  geometry.translate(0, 0, z - depth / 2);
  const uv = geometry.attributes.uv, positions = geometry.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, positions.getX(i) / 7 + 0.5, positions.getY(i) / 5 + 0.65);
  return geometry;
}

// Keep enough space for both extrusion bevels around the guard opening.
export function createM1913FrameProfiles() {
  const frame = path([
    ['moveTo', 105, 216], ['lineTo', 794, 211], ['lineTo', 792, 253],
    ['quadraticCurveTo', 681, 251, 647, 267], ['quadraticCurveTo', 635, 277, 630, 316],
    ['quadraticCurveTo', 623, 397, 571, 420], ['quadraticCurveTo', 468, 423, 420, 430],
    ['quadraticCurveTo', 378, 441, 366, 503], ['lineTo', 339, 667],
    ['quadraticCurveTo', 233, 683, 145, 670], ['quadraticCurveTo', 131, 653, 138, 605],
    ['lineTo', 177, 383], ['quadraticCurveTo', 190, 325, 146, 290],
    ['quadraticCurveTo', 96, 259, 105, 216],
  ]);
  // A hole must wind opposite to the outer frame. ExtrudeGeometry only repairs
  // hole winding when it also reverses the outer contour; ours is already clockwise.
  // Matching windings produce inward-facing hole walls that vanish from the opening.
  const opening = path([
    ['moveTo', 481, 275], ['quadraticCurveTo', 436, 306, 453, 359],
    ['quadraticCurveTo', 460, 390, 512, 387], ['quadraticCurveTo', 565, 388, 580, 365],
    ['quadraticCurveTo', 603, 320, 580, 293], ['quadraticCurveTo', 550, 268, 481, 275],
  ], THREE.Path);
  frame.holes.push(opening);
  const trigger = path([
    ['moveTo', 482, 266], ['lineTo', 504, 271],
    ['quadraticCurveTo', 482, 320, 512, 357],
    ['quadraticCurveTo', 517, 363, 510, 367], ['lineTo', 498, 365],
    ['quadraticCurveTo', 459, 341, 476, 300], ['lineTo', 482, 266],
  ]);
  return { frame, opening, trigger };
}

export function createM1913FrameGeometry() {
  return extrudedGeometry(createM1913FrameProfiles().frame, 0.43, 0.035);
}

// Exterior silhouette traced approximately from the supplied side photograph.
// Coordinates are image-space proportions, not manufacturing dimensions.
export function createM1913() {
  const group = new THREE.Group(); group.name = 'M1913 — photographic exterior study';
  let seed = 1913;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#b7bdc0'; ctx.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 24000; i++) {
    const shade = random() > 0.5 ? 230 : 20;
    ctx.fillStyle = `rgba(${shade},${shade},${shade},${random() * 0.13})`;
    ctx.fillRect(random() * 1024, random() * 1024, random() * 3 + 0.5, random() * 2 + 0.5);
  }
  for (let i = 0; i < 900; i++) {
    ctx.strokeStyle = `rgba(230,231,215,${random() * 0.15})`; ctx.lineWidth = random() + 0.3;
    const x = random() * 1024, y = random() * 1024;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + random() * 35, y - random() * 8); ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const steel = new THREE.MeshStandardMaterial({ color: 0xffffff, ...createAgedSurface('steel'), metalness: 0.78, roughness: 0.72, envMapIntensity: 0.85 });
  const worn = new THREE.MeshStandardMaterial({ color: 0xa1a79e, map: texture, metalness: 0.8, roughness: 0.43 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x30383c, metalness: 0.6, roughness: 0.55 });
  const grip = new THREE.MeshStandardMaterial({ color: 0x9c9983, ...createAgedSurface('grip', 97), metalness: 0.08, roughness: 0.92 });
  const gripRidge = new THREE.MeshStandardMaterial({ color: 0x6f7060, map: texture, metalness: 0.17, roughness: 0.72 });
  const groove = new THREE.MeshStandardMaterial({ color: 0x151c1c, roughness: 0.7 });
  function mesh(geometry, material) {
    const part = new THREE.Mesh(geometry, material); part.castShadow = part.receiveShadow = true;
    group.add(part); return part;
  }
  function extrude(shape, depth, material, bevel = 0.025, z = 0) {
    return mesh(extrudedGeometry(shape, depth, bevel, z), material);
  }
  function box(x, y, w, h, d, material, z = 0) {
    const part = mesh(new THREE.BoxGeometry(w / 140, h / 140, d), material);
    part.position.set(...point(x, y).toArray(), z); return part;
  }
  function disc(x, y, radius, depth, z, material) {
    const part = mesh(new THREE.CylinderGeometry(radius / 140, radius / 140, depth, 40), material);
    part.rotation.x = Math.PI / 2; part.position.set(...point(x, y).toArray(), z); return part;
  }
  function line(coords, radius, material) {
    const curve = new THREE.CatmullRomCurve3(coords.map(([x, y, z]) => new THREE.Vector3(...point(x, y).toArray(), z)));
    return mesh(new THREE.TubeGeometry(curve, 48, radius, 7, false), material);
  }

  // Continuous frame with a true open trigger guard, including the curved grip backstrap.
  const { trigger } = createM1913FrameProfiles();
  mesh(createM1913FrameGeometry(), steel).name = 'Frame and open trigger guard';

  // Rounded slide, rear scallop, long straight top and the visible ejection-port inset.
  const slide = path([
    ['moveTo', 102, 213], ['quadraticCurveTo', 108, 153, 156, 122],
    ['quadraticCurveTo', 170, 111, 204, 111], ['lineTo', 970, 108],
    ['lineTo', 970, 245],
    ['lineTo', 800, 247], ['lineTo', 794, 211], ['lineTo', 102, 219],
  ]);
  extrude(slide, 0.54, steel, 0.045).name = 'Rounded slide';
  // Front cap with an actual opening. The former solid extrusion covered the bore.
  const front = new THREE.Shape();
  front.moveTo(-0.23, 0.10); front.lineTo(0.23, 0.10);
  front.quadraticCurveTo(0.27, 0.10, 0.27, 0.17); front.lineTo(0.27, 1.02);
  front.quadraticCurveTo(0.27, 1.085, 0.20, 1.085); front.lineTo(-0.20, 1.085);
  front.quadraticCurveTo(-0.27, 1.085, -0.27, 1.02); front.lineTo(-0.27, 0.17);
  front.quadraticCurveTo(-0.27, 0.10, -0.23, 0.10);
  const boreY = point(1010, 174).y;
  const boreOpening = new THREE.Path(); boreOpening.absarc(0, boreY, 0.147, 0, Math.PI * 2, true); front.holes.push(boreOpening);
  const capGeo = new THREE.ExtrudeGeometry(front, { depth: 0.30, bevelEnabled: true, bevelSegments: 3, bevelSize: 0.015, bevelThickness: 0.015, curveSegments: 48 });
  const cap = mesh(capGeo, steel); cap.rotation.y = Math.PI / 2; cap.position.x = point(970, 174).x; cap.name = 'Front cap with open muzzle';
  for (const side of [-1, 1]) {
    const z = side * 0.32;
    line([[112, 219, z], [380, 218, z], [790, 212, z]], 0.009, worn);
    line([[801, 246, z], [995, 245, z]], 0.012, worn);
    for (let i = 0; i < 13; i++) {
      const x = 148 + i * 16;
      const y = i === 0 ? 147 : 139;
      line([[x, y, z], [x + 1, 173, z], [x + 4, 209, z]], 0.019, worn);
      line([[x + 4, y + 3, z], [x + 5, 175, z], [x + 8, 208, z]], 0.012, dark);
    }
    box(432, 150, 128, 12, 0.018, groove, z);
    box(432, 147, 125, 4, 0.021, worn, z + side * 0.006);
    for (const [x, y, radius] of [[278, 147, 8], [441, 240, 10], [530, 240, 8], [402, 376, 11]]) {
      disc(x, y, radius, 0.023, z + side * 0.04, worn);
      box(x, y, radius * 1.35, 2, 0.008, groove, z + side * 0.056).rotation.z = 0.65;
    }
    extrude(path([['moveTo', 424, 228], ['lineTo', 546, 228], ['lineTo', 553, 237], ['lineTo', 539, 256], ['lineTo', 423, 257], ['lineTo', 424, 228]]), 0.016, dark, 0.012, z - side * 0.008);
    box(489, 239, 76, 7, 0.025, steel, z + side * 0.005);
    for (let i = 0; i < 32; i++) {
      const x = 380 + random() * 570, y = 167 + random() * 32;
      line([[x, y, z], [x + 3 + random() * 6, y - 1 - random() * 2, z]], 0.0025, worn);
    }
  }
  const port = path([['moveTo', 493, 117], ['lineTo', 642, 117], ['lineTo', 641, 143], ['quadraticCurveTo', 630, 159, 602, 160], ['lineTo', 504, 158], ['lineTo', 493, 149], ['lineTo', 493, 117]]);
  extrude(port, 0.02, groove, 0.012, 0.325);
  const portFace = extrude(path([['moveTo', 498, 127], ['lineTo', 638, 127], ['lineTo', 634, 145], ['quadraticCurveTo', 620, 155, 598, 154], ['lineTo', 499, 151], ['lineTo', 498, 127]]), 0.025, worn, 0.012, 0.338);
  portFace.name = 'Visible ejection port surface';

  // Dark ribbed grip panels, including the circular inset medallion and screw.
  const gripShape = path([
    ['moveTo', 247, 275], ['quadraticCurveTo', 327, 266, 367, 286],
    ['quadraticCurveTo', 384, 299, 373, 337], ['lineTo', 322, 638],
    ['quadraticCurveTo', 316, 659, 288, 659], ['lineTo', 165, 655],
    ['quadraticCurveTo', 149, 653, 153, 624], ['lineTo', 208, 309],
    ['quadraticCurveTo', 215, 281, 247, 275],
  ]);
  for (const side of [-1, 1]) {
    extrude(gripShape, 0.09, grip, 0.04, side * 0.27).name = 'Ribbed dark grip panel';
    const z = side * 0.365;
    for (let i = 0; i < 23; i++) {
      const bottomX = 161 + i * 6.7;
      const topX = bottomX + 63;
      const topY = i < 3 ? 315 - i * 9 : i > 19 ? 290 + (i - 19) * 9 : 283;
      const endY = i > 20 ? 634 : 648;
      line([[topX, topY, z], [(topX + bottomX) / 2, 460, z], [bottomX, endY, z]], 0.011, gripRidge);
      line([[topX + 3, topY, z], [(topX + bottomX) / 2 + 3, 460, z], [bottomX + 3, endY, z]], 0.012, groove);
    }
    disc(275, 472, 46, 0.028, z + side * 0.018, dark);
    const badge = mesh(new THREE.TorusGeometry(44 / 140, 0.01, 8, 64), worn);
    badge.position.set(...point(275, 472).toArray(), z + side * 0.039);
    disc(275, 472, 11, 0.034, z + side * 0.047, worn);
    box(275, 472, 13, 2, 0.008, dark, z + side * 0.068).rotation.z = 0.3;
    line([[239, 486, z + side * 0.04], [272, 500, z + side * 0.04], [309, 486, z + side * 0.04]], 0.009, worn);
  }
  extrude(path([['moveTo', 152, 678], ['lineTo', 337, 674], ['lineTo', 346, 682], ['quadraticCurveTo', 330, 691, 153, 689], ['lineTo', 152, 678]]), 0.57, dark, 0.015);
  line([[144, 665, 0.25], [240, 670, 0.25], [337, 665, 0.25]], 0.016, worn);
  // Trigger and the two small sight silhouettes are exterior visual details only.
  extrude(trigger, 0.14, dark, 0.012).name = 'Trigger with clearance inside guard';
  box(968, 103, 32, 15, 0.17, dark);
  extrude(path([['moveTo', 217, 119], ['lineTo', 222, 89], ['lineTo', 230, 89], ['lineTo', 236, 119], ['lineTo', 217, 119]]), 0.2, worn, 0.008);
  const hammer = disc(174, 120, 23, 0.22, 0, dark);
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.1 + i * 0.1);
    box(174 + Math.cos(a) * 23, 120 - Math.sin(a) * 23, 5, 5, 0.24, worn).rotation.z = a;
  }
  hammer.name = 'Rear serrated silhouette';
  const muzzle = mesh(new THREE.RingGeometry(0.137, 0.225, 64), worn);
  muzzle.rotation.y = Math.PI / 2; muzzle.position.set(...point(1020, 174).toArray(), 0); muzzle.name = 'Worn muzzle crown';
  const outer = mesh(new THREE.CylinderGeometry(0.225, 0.225, 0.11, 64, 1, true), steel);
  outer.rotation.z = Math.PI / 2; outer.position.copy(muzzle.position); outer.position.x -= 0.055;
  const inside = mesh(new THREE.CylinderGeometry(0.137, 0.137, 0.30, 64, 1, true), new THREE.MeshStandardMaterial({ color: 0x171b1f, roughness: 0.86, metalness: 0.25, side: THREE.BackSide }));
  inside.rotation.z = Math.PI / 2; inside.position.copy(muzzle.position); inside.position.x -= 0.15; inside.name = 'Recessed dark muzzle cavity';
  const bore = mesh(new THREE.CircleGeometry(0.137, 48), groove);
  bore.rotation.y = Math.PI / 2; bore.position.copy(muzzle.position); bore.position.x -= 0.29;
  const lowerCap = mesh(new THREE.CircleGeometry(0.065, 40), dark);
  lowerCap.rotation.y = Math.PI / 2; lowerCap.position.set(point(1013, 174).x, 0.25, 0);
  return { group, muzzle: new THREE.Vector3(...point(1024, 174).toArray(), 0) };
}
