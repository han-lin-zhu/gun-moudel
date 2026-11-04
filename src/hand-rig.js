import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const axisX = new THREE.Vector3(1, 0, 0);
const fingers = ['index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'];

function fabricTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#aaa'; ctx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 4) for (let x = 0; x < 128; x += 4) {
    ctx.fillStyle = (x + y) % 8 ? '#777' : '#ddd';
    ctx.fillRect(x, y, 2, 3);
  }
  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(3, 3);
  return map;
}

// WebXR assets store joints as siblings. Pose each segment in the asset's bind
// space, preserving its inverse bind matrix rather than assuming a bone hierarchy.
export function prepareHand(scene, side, material) {
  scene.updateMatrixWorld(true);
  const bones = {};
  scene.traverse(node => { if (node.isBone) bones[node.name] = node; });
  const origin = bones.wrist.position.clone();
  const y = bones['middle-finger-phalanx-proximal'].position.clone().sub(origin).normalize();
  const x = bones['pinky-finger-phalanx-proximal'].position.clone().sub(bones['index-finger-phalanx-proximal'].position);
  if (side === 'left') x.negate();
  x.addScaledVector(y, -x.dot(y)).normalize();
  const z = new THREE.Vector3().crossVectors(x, y).normalize();
  const basis = new THREE.Matrix4().makeBasis(x, y, z);
  const basisQ = new THREE.Quaternion().setFromRotationMatrix(basis);
  const inverseQ = basisQ.clone().invert();
  const bind = {};
  for (const [name, bone] of Object.entries(bones)) bind[name] = {
    p: bone.position.clone().sub(origin).applyQuaternion(inverseQ),
    q: bone.quaternion.clone(),
  };
  const normalized = new THREE.Group();
  normalized.quaternion.copy(inverseQ);
  normalized.position.copy(origin).applyQuaternion(inverseQ).negate();
  normalized.add(scene);
  const root = new THREE.Group(); root.name = `${side}-gloved-hand`; root.add(normalized);
  scene.traverse(node => {
    if (node.isMesh) {
      node.material = material; node.castShadow = false; node.receiveShadow = true;
      // The bind-pose bounding sphere doesn't contain a posed fist.
      node.frustumCulled = false;
    }
  });
  const padding = new THREE.Mesh(new THREE.CapsuleGeometry(0.024, 0.035, 5, 16),
    new THREE.MeshStandardMaterial({ color: '#202920', roughness: 0.86 }));
  padding.position.set(0, 0.063, 0.014); padding.scale.set(1.15, 1, 0.30);
  root.add(padding);
  function setJoint(name, position, rotation) {
    const bone = bones[name];
    bone.position.copy(position).applyQuaternion(basisQ).add(origin);
    bone.quaternion.copy(basisQ).multiply(rotation).multiply(inverseQ).multiply(bind[name].q);
  }
  function curlChain(names, angles) {
    let position = bind[names[0]].p.clone(), angle = 0;
    for (let i = 0; i < names.length; i++) {
      angle += angles[i] || 0;
      const rotation = new THREE.Quaternion().setFromAxisAngle(axisX, -angle);
      setJoint(names[i], position, rotation);
      if (i + 1 < names.length) position = position.clone().add(
        bind[names[i + 1]].p.clone().sub(bind[names[i]].p).applyQuaternion(rotation),
      );
    }
  }
  function pose({ support = false, rifle = false, trigger = 0 } = {}) {
    for (const [name, value] of Object.entries(bind)) {
      bones[name].position.copy(value.p).applyQuaternion(basisQ).add(origin);
      bones[name].quaternion.copy(value.q);
    }
    for (let i = 0; i < fingers.length; i++) {
      const name = fingers[i];
      const index = i === 0 && !support;
      curlChain([`${name}-phalanx-proximal`, `${name}-phalanx-intermediate`, `${name}-phalanx-distal`, `${name}-tip`],
        index ? [0.18 + trigger * 0.22, 0.55 + trigger * 0.25, 0.35, 0] :
          support && rifle ? [0.48, 1.15, 0.65, 0] : [0.72, 1.28, 0.65, 0]);
    }
    curlChain(['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'], [0.12, 0.36, 0.4, 0]);
    root.updateMatrixWorld(true);
  }
  return { root, pose, bones };
}

export async function loadHands() {
  const loader = new GLTFLoader();
  const [left, right] = await Promise.all(['left', 'right'].map(side => loader.loadAsync(`${import.meta.env.BASE_URL}models/hands/${side}.glb`)));
  const weave = fabricTexture();
  const glove = new THREE.MeshStandardMaterial({ color: '#343c34', roughness: 0.92, metalness: 0.02, bumpMap: weave, bumpScale: 0.00065 });
  return { left: prepareHand(left.scene, 'left', glove), right: prepareHand(right.scene, 'right', glove) };
}

// A tapered fabric forearm extends from each GLB wrist beyond the frame. Its
// independent root can later be replaced by a full upper-arm IK chain.
export function createForearm(wrist, elbow, radius, material) {
  const direction = wrist.clone().sub(elbow);
  const geometry = new THREE.CylinderGeometry(radius * 0.63, radius, direction.length(), 24, 8);
  const arm = new THREE.Mesh(geometry, material);
  arm.position.copy(wrist).add(elbow).multiplyScalar(0.5);
  arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.73, radius * 0.73, radius * 0.52, 24),
    new THREE.MeshStandardMaterial({ color: '#252d27', roughness: 0.95 }));
  cuff.position.copy(wrist).addScaledVector(direction, -radius * 0.3);
  cuff.quaternion.copy(arm.quaternion);
  const group = new THREE.Group(); group.add(arm, cuff);
  return group;
}
