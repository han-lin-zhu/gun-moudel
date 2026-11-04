import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createM1913FrameProfiles, createM1913FrameGeometry } from '../src/m1913.js';

function inside(point, polygon) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) &&
        point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}

function edgeDistance(point, polygon) {
  let distance = Infinity;
  for (let i = 0; i < polygon.length - 1; i++) {
    const a = polygon[i], edge = polygon[i + 1].clone().sub(a);
    const t = Math.max(0, Math.min(1, point.clone().sub(a).dot(edge) / edge.lengthSq()));
    distance = Math.min(distance, point.distanceTo(edge.multiplyScalar(t).add(a)));
  }
  return distance;
}

test('M1913 guard opening stays within the frame with room for opposing bevels', () => {
  const { frame, opening } = createM1913FrameProfiles();
  const outline = frame.getPoints(160);
  for (const p of opening.getPoints(160)) {
    assert.ok(inside(p, outline), 'guard opening crosses the outer silhouette');
    assert.ok(edgeDistance(p, outline) > 0.10, 'guard walls are too thin for their bevels');
  }
});

test('M1913 exposed trigger clears the guard, including its rounded free end', () => {
  const { opening, trigger } = createM1913FrameProfiles();
  const hole = opening.getPoints(160);
  // The upper root joins the frame; check the exposed part below that attachment.
  const exposed = trigger.getPoints(160).filter(p => p.y < (260 - 300) / 140);
  assert.ok(exposed.length > 100);
  for (const p of exposed) {
    assert.ok(inside(p, hole), 'exposed trigger intersects the guard');
    assert.ok(edgeDistance(p, hole) > 0.08, 'trigger clearance is lost after beveling');
  }
});

test('M1913 inner guard walls face the opening and do not disappear when viewed obliquely', () => {
  const geometry = createM1913FrameGeometry();
  const visible = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  const bothSides = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  for (const z of [-0.18, 0, 0.18]) {
    const origin = new THREE.Vector3((535 - 550) / 140, (260 - 330) / 140, z);
    for (let i = 0; i < 16; i++) {
      const angle = i * Math.PI / 8;
      const ray = new THREE.Raycaster(origin, new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0));
      const actual = ray.intersectObject(visible)[0];
      const wall = ray.intersectObject(bothSides)[0];
      assert.ok(wall, 'missing inner wall');
      assert.ok(actual, 'inner wall is culled from the trigger opening');
      assert.ok(Math.abs(actual.distance - wall.distance) < 1e-6, 'ray sees through the inner wall into the frame');
    }
  }
  // Preserve the intended opening between the two sides of the model.
  const through = new THREE.Raycaster(new THREE.Vector3((535 - 550) / 140, (260 - 330) / 140, -1), new THREE.Vector3(0, 0, 1));
  assert.equal(through.intersectObject(bothSides).length, 0);
  geometry.dispose(); visible.material.dispose(); bothSides.material.dispose();
});
