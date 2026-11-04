import * as THREE from 'three';
import { loadHands, createForearm } from './hand-rig.js';
import { firstPersonProfiles, lookAngles, firstPersonRecoil } from './first-person-config.js';

export function createFirstPerson({ scene, camera, controls, canvas, archives, firing, getActiveArchive, onModeChange }) {
  let active = false, hands, loading, saved, id, yaw = 0, pitch = 0, dragPointer = null, lastX = 0, lastY = 0;
  let arms = null, time = 0;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const button = document.querySelector('#first-person');
  const hud = document.querySelector('#fp-hud');
  const hint = document.querySelector('#fp-control-hint');
  // Separate observation, player translation and local gun motion. Future walking
  // changes camera position; recoil never accumulates into the observation angles.
  const viewmodelRoot = new THREE.Group(); viewmodelRoot.name = 'first-person-viewmodel';
  const recoilRoot = new THREE.Group(); recoilRoot.name = 'shared-hands-and-gun-recoil';
  const weapon = new THREE.Group(); weapon.name = 'weapon-and-grip-profile';
  viewmodelRoot.add(recoilRoot); recoilRoot.add(weapon); camera.add(viewmodelRoot); scene.add(camera);
  viewmodelRoot.visible = false;
  const studio = new THREE.Group(); studio.name = 'first-person-observation-space'; studio.visible = false;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({ color: '#b3b8a7', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.01; studio.add(ground);
  const grid = new THREE.GridHelper(120, 120, '#929e8b', '#a4af9b');
  grid.material.transparent = true; grid.material.opacity = 0.34; studio.add(grid);
  const wallMaterial = new THREE.MeshStandardMaterial({ color: '#d6d8cb', roughness: 0.95 });
  for (let i = -3; i <= 3; i++) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.5, 3.2, 0.12), wallMaterial);
    panel.position.set(i * 3, 1.6, -12); studio.add(panel);
  }
  scene.add(studio);
  const sleeve = new THREE.MeshStandardMaterial({ color: '#656e53', roughness: 0.97 });
  function setShoulderParts(model, visible) {
    model.traverse(part => { if (part.userData.hideInFirstPerson) part.visible = visible; });
  }
  function status() {
    const locked = document.pointerLockElement === canvas;
    document.body.classList.toggle('fp-locked', active && locked);
    hint.textContent = locked ? '移动鼠标观察 · 左键开火 · Esc 释放鼠标' : '点击画面捕获鼠标 · 左键开火 · 拖动也可观察';
  }
  function configure(nextId) {
    if (id) { setShoulderParts(archives[id].group, true); scene.add(archives[id].group); }
    if (arms) {
      arms.traverse(node => { if (node.isMesh) { node.geometry.dispose(); if (node.material !== sleeve) node.material.dispose(); } });
      weapon.remove(arms);
    }
    id = nextId;
    const profile = firstPersonProfiles[id];
    weapon.position.fromArray(profile.position); weapon.rotation.fromArray(profile.rotation);
    weapon.scale.setScalar(profile.scale);
    const model = archives[id].group;
    // The stock is against the shoulder, behind the first-person framing. Keep
    // its full exterior mesh for the gallery/export rather than covering the hand.
    setShoulderParts(model, false);
    model.position.set(0, 0, 0); model.rotation.set(0, 0, 0); weapon.add(model);
    arms = new THREE.Group(); arms.name = 'forearms';
    weapon.updateMatrix();
    const cameraToGun = weapon.matrix.clone().invert();
    for (const side of ['left', 'right']) {
      const hand = hands[side], pose = profile[side];
      hand.root.position.fromArray(pose.wrist); hand.root.rotation.fromArray(pose.rotation);
      hand.root.scale.setScalar(1 / profile.scale);
      weapon.add(hand.root); hand.pose({ support: side === 'left', rifle: id === 'ak47' });
      const elbow = new THREE.Vector3(side === 'right' ? 0.40 : -0.34, -0.68, -0.06).applyMatrix4(cameraToGun);
      arms.add(createForearm(new THREE.Vector3(...pose.wrist), elbow, 0.043 / profile.scale, sleeve));
    }
    weapon.add(arms);
    document.querySelector('#fp-model-name').textContent = archives[id].title;
    document.querySelector('#fp-grip-name').textContent = profile.label;
    recoilRoot.position.set(0, 0, 0); recoilRoot.rotation.set(0, 0, 0);
  }
  async function enter() {
    if (active) return;
    button.disabled = true; button.textContent = '正在载入手臂…';
    try {
      loading ??= loadHands().catch(error => { loading = null; throw error; });
      hands = await loading;
    } catch (error) {
      console.error('手臂模型加载失败', error);
      button.textContent = '手臂加载失败 · 点击重试';
      button.disabled = false;
      return;
    }
    const lights = [];
    scene.traverse(node => { if (node.isLight && !node.isPointLight) lights.push([node, node.intensity]); });
    saved = { position: camera.position.clone(), quaternion: camera.quaternion.clone(), target: controls.target.clone(), fov: camera.fov, near: camera.near, width: window.innerWidth, height: window.innerHeight, archive: getActiveArchive(), autoRotate: controls.autoRotate, background: scene.background, fog: scene.fog, lights, environmentIntensity: scene.environmentIntensity };
    for (const [light, intensity] of lights) light.intensity = intensity * 0.38;
    scene.environmentIntensity = 0.3;
    active = true; yaw = pitch = time = 0;
    firing.stopFiring(); controls.enabled = false; controls.autoRotate = false;
    camera.position.set(0, 1.6, 0); camera.rotation.set(0, 0, 0); camera.fov = 65; camera.near = 0.01; camera.clearViewOffset();
    scene.background = new THREE.Color('#dce0d3'); scene.fog = new THREE.Fog('#dce0d3', 14, 65);
    configure(getActiveArchive());
    firing.setModel(archives[id].group, archives[id].muzzle);
    firing.setRecoilHandler((impulse, reduced) => {
      const recoil = firstPersonRecoil(impulse, firstPersonProfiles[id], reduced);
      recoilRoot.position.z = recoil.z; recoilRoot.rotation.x = recoil.pitch;
      hands.right.pose({ rifle: id === 'ak47', trigger: impulse });
    });
    viewmodelRoot.visible = studio.visible = true;
    hud.hidden = false; document.body.classList.add('first-person-active');
    button.textContent = '第一人称'; button.disabled = false; button.setAttribute('aria-pressed', 'true');
    canvas.tabIndex = 0; canvas.focus({ preventScroll: true });
    status(); onModeChange(true);
  }
  function exit() {
    if (!active) return;
    firing.stopFiring(); releasePointer();
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    active = false;
    setShoulderParts(archives[id].group, true);
    scene.add(archives[id].group); firing.setRecoilHandler(null); firing.setModel(archives[id].group, archives[id].muzzle);
    camera.position.copy(saved.position); camera.quaternion.copy(saved.quaternion); camera.fov = saved.fov; camera.near = saved.near;
    controls.target.copy(saved.target); controls.enabled = true; controls.autoRotate = saved.autoRotate;
    scene.background = saved.background; scene.fog = saved.fog;
    for (const [light, intensity] of saved.lights) light.intensity = intensity;
    scene.environmentIntensity = saved.environmentIntensity;
    viewmodelRoot.visible = studio.visible = false;
    hud.hidden = true; document.body.classList.remove('first-person-active', 'fp-locked');
    button.setAttribute('aria-pressed', 'false');
    onModeChange(false, saved.width !== window.innerWidth || saved.height !== window.innerHeight || saved.archive !== id);
    button.focus({ preventScroll: true });
  }
  function releasePointer() {
    if (dragPointer !== null && canvas.hasPointerCapture(dragPointer)) canvas.releasePointerCapture(dragPointer);
    dragPointer = null; firing.stopFiring();
  }
  function move(dx, dy) {
    ({ yaw, pitch } = lookAngles(yaw, pitch, dx, dy));
  }
  button.addEventListener('click', () => { if (active) exit(); else void enter(); });
  document.querySelector('#fp-exit').addEventListener('click', exit);
  canvas.addEventListener('pointerdown', event => {
    if (!active || event.button !== 0 || document.querySelector('dialog[open]')) return;
    event.preventDefault();
    if (document.pointerLockElement !== canvas) {
      dragPointer = event.pointerId; lastX = event.clientX; lastY = event.clientY;
      // Pointer capture must precede pointer lock. Chromium rejects capture when
      // a lock request is already pending; shooting must still work in either case.
      try { canvas.setPointerCapture(event.pointerId); } catch { /* Window release/blur still stops firing. */ }
    }
    firing.startFiring();
    if (event.pointerType !== 'touch' && document.pointerLockElement !== canvas) {
      try { canvas.requestPointerLock()?.catch(() => status()); } catch { status(); }
    }
  });
  document.addEventListener('mousemove', event => {
    if (active && document.pointerLockElement === canvas) move(event.movementX, event.movementY);
  });
  canvas.addEventListener('pointermove', event => {
    if (!active || dragPointer !== event.pointerId || document.pointerLockElement === canvas) return;
    move(event.clientX - lastX, event.clientY - lastY); lastX = event.clientX; lastY = event.clientY;
  });
  window.addEventListener('pointerup', releasePointer);
  canvas.addEventListener('pointercancel', releasePointer);
  canvas.addEventListener('lostpointercapture', () => { if (document.pointerLockElement !== canvas) releasePointer(); });
  window.addEventListener('blur', releasePointer);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releasePointer(); });
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement !== canvas) releasePointer();
    else dragPointer = null;
    status();
  });
  document.addEventListener('pointerlockerror', status);
  canvas.addEventListener('contextmenu', event => { if (active) event.preventDefault(); });
  document.querySelectorAll('[data-open-catalog]').forEach(control => control.addEventListener('click', () => {
    releasePointer(); if (document.pointerLockElement === canvas) document.exitPointerLock();
  }));
  return {
    get active() { return active; },
    setModel(nextId) { if (active) configure(nextId); },
    update(delta) {
      if (!active) return;
      time += delta;
      camera.rotation.set(pitch, yaw, 0, 'YXZ');
      const motion = reducedMotion.matches ? 0 : 1;
      weapon.position.x = firstPersonProfiles[id].position[0] * Math.min(1, camera.aspect / 1.4);
      viewmodelRoot.position.set(Math.sin(time * 1.2) * 0.0018 * motion, Math.sin(time * 2.1) * 0.0012 * motion, -Math.max(0, 1 - camera.aspect) * 0.25);
      viewmodelRoot.rotation.z = Math.sin(time * 1.1) * 0.0015 * motion;
      camera.updateMatrixWorld(true);
    },
  };
}
