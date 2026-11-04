import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { prepareHand } from '../src/hand-rig.js';
import { firstPersonProfiles, firstPersonRecoil, lookAngles } from '../src/first-person-config.js';

test('mouse observation clamps pitch without limiting horizontal turns', () => {
  assert.deepEqual(lookAngles(0, 0, 0, 0), { yaw: 0, pitch: 0 });
  assert.equal(lookAngles(0, 0, 0, -100000).pitch, 1.15);
  assert.equal(lookAngles(0, 0, 0, 100000).pitch, -1.15);
  assert.ok(lookAngles(0, 0, 100000, 0).yaw < -Math.PI * 2);
});

test('gun profiles face forward and both arms share a reversible recoil transform', () => {
  for (const profile of Object.values(firstPersonProfiles)) {
    const rotation = new THREE.Euler(...profile.rotation);
    const forward = new THREE.Vector3(1, 0, 0).applyEuler(rotation);
    assert.ok(forward.dot(new THREE.Vector3(0, 0, -1)) > 0.97);
    assert.deepEqual(firstPersonRecoil(0, profile), { z: 0, pitch: 0 });
    const full = firstPersonRecoil(1, profile), reduced = firstPersonRecoil(1, profile, true);
    assert.ok(full.z > 0 && full.pitch > 0);
    assert.ok(reduced.z < full.z && reduced.pitch < full.pitch);
    for (const side of ['right', 'left']) {
      const matrix = new THREE.Matrix4().compose(new THREE.Vector3(...profile[side].wrist), new THREE.Quaternion().setFromEuler(new THREE.Euler(...profile[side].rotation)), new THREE.Vector3(1, 1, 1));
      assert.ok(Math.abs(matrix.determinant() - 1) < 1e-6, 'hand poses must not mirror the geometry');
    }
  }
});

for (const side of ['left', 'right']) test(`${side} GLB keeps bone lengths and valid skinning when gripping and pulling the trigger`, async () => {
  const bytes = await readFile(new URL(`../public/models/hands/${side}.glb`, import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const hand = prepareHand(gltf.scene, side, new THREE.MeshStandardMaterial());
  const chains = ['index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'].map(name => ['proximal', 'intermediate', 'distal'].map(suffix => `${name}-phalanx-${suffix}`).concat(`${name}-tip`));
  const lengths = chains.map(chain => chain.slice(1).map((name, i) => hand.bones[name].position.distanceTo(hand.bones[chain[i]].position)));
  let mesh; gltf.scene.traverse(node => { if (node.isSkinnedMesh) mesh = node; });
  assert.ok(mesh && Object.keys(hand.bones).length === 25);
  const poses = [{ support: false, rifle: true }, { support: false, rifle: false, trigger: 1 }, { support: true, rifle: true }, { support: true, rifle: false }];
  for (const pose of poses) {
    hand.pose(pose); mesh.skeleton.update();
    assert.ok(hand.bones.wrist.getWorldPosition(new THREE.Vector3()).length() < 1e-6);
    chains.forEach((chain, c) => chain.slice(1).forEach((name, i) => assert.ok(Math.abs(hand.bones[name].position.distanceTo(hand.bones[chain[i]].position) - lengths[c][i]) < 1e-6)));
    for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
      const p = mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
      assert.ok(p.toArray().every(Number.isFinite));
      assert.ok(p.length() < 0.3, 'skinned vertices must remain within the hand, not explode');
    }
  }
  hand.pose({ support: false, trigger: 0 });
  const indexAtRest = hand.bones['index-finger-tip'].position.clone();
  hand.pose({ support: false, trigger: 1 });
  assert.ok(indexAtRest.distanceTo(hand.bones['index-finger-tip'].position) > 0.01);
  hand.pose({ support: false, trigger: 0 });
  assert.ok(indexAtRest.distanceTo(hand.bones['index-finger-tip'].position) < 1e-6, 'posing must not accumulate deformation');
});
