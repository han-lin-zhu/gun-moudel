import * as THREE from 'three';
import { createHoldFire } from './hold-fire.js';

const soundStyles = {
  classic: { crack: 0.9, body: 2.8, thump: 0.48, bass: 94, decay: 15, echo: 0.45 },
  heavy: { crack: 0.55, body: 4.1, thump: 0.8, bass: 65, decay: 11, echo: 0.58 },
  crisp: { crack: 1.5, body: 1.5, thump: 0.24, bass: 135, decay: 23, echo: 0.25 },
};

// A self-contained audiovisual effect: no remote sound files or runtime downloads.
function createShotBuffer(context, style) {
  const duration = 0.85;
  const buffer = context.createBuffer(2, Math.ceil(context.sampleRate * duration), context.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let low = 0;
    for (let i = 0; i < data.length; i++) {
      const t = i / context.sampleRate;
      const noise = Math.random() * 2 - 1;
      low += (noise - low) * 0.065;
      const attack = Math.min(t / 0.0008, 1);
      const crack = noise * Math.exp(-t * 95) * style.crack;
      const body = low * Math.exp(-t * style.decay) * style.body;
      const thump = Math.sin(2 * Math.PI * (style.bass * t - 35 * t * t)) * Math.exp(-t * 28) * style.thump;
      const echoTime = t - (channel ? 0.069 : 0.052);
      const echo = echoTime > 0 ? low * Math.exp(-echoTime * 9) * style.echo : 0;
      const tailFade = Math.min((duration - t) / 0.08, 1);
      data[i] = Math.tanh((crack + body + thump + echo) * attack) * tailFade;
    }
  }
  return buffer;
}

function flameTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(38, 64, 1, 85, 64, 124);
  gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(0.16, '#fffbd9');
  gradient.addColorStop(0.38, '#ffca52'); gradient.addColorStop(0.65, '#ff6410aa'); gradient.addColorStop(1, '#ff340000');
  ctx.fillStyle = gradient;
  ctx.beginPath(); ctx.moveTo(0, 56);
  ctx.lineTo(45, 49); ctx.lineTo(76, 10); ctx.lineTo(100, 47); ctx.lineTo(162, 31);
  ctx.lineTo(145, 53); ctx.lineTo(250, 64); ctx.lineTo(154, 75); ctx.lineTo(181, 96);
  ctx.lineTo(105, 80); ctx.lineTo(74, 116); ctx.lineTo(51, 77); ctx.lineTo(0, 71); ctx.closePath(); ctx.fill();
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function smokeTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 3, 64, 64, 62);
  gradient.addColorStop(0, 'rgba(118,111,99,.55)');
  gradient.addColorStop(0.4, 'rgba(133,127,114,.27)'); gradient.addColorStop(1, 'rgba(143,137,123,0)');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

export function createFiringExperience({ scene, rifle }) {
  const button = document.querySelector('#fire');
  const muteButton = document.querySelector('#mute');
  const status = document.querySelector('#sound-status');
  const count = document.querySelector('#shot-count');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let context, master;
  const shotBuffers = new Map();
  let volume = 0.4, pitch = 1, soundStyle = 'classic';
  let muted = false, shots = 0, recoilAge = Infinity;
  let shotStrength = 1;
  const cameraOffset = new THREE.Vector3();
  const muzzleLocal = new THREE.Vector3(4.46, -0.025, 0);
  const muzzleWorld = new THREE.Vector3();

  const flash = new THREE.Group(); flash.visible = false; scene.add(flash);
  const flashRoll = new THREE.Quaternion();
  const forwardAxis = new THREE.Vector3(1, 0, 0);
  const texture = flameTexture();
  const flameMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  for (let i = 0; i < 3; i++) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.68), flameMaterial);
    plane.position.x = 0.7; plane.rotation.x = i * Math.PI / 3;
    flash.add(plane);
  }
  const light = new THREE.PointLight(0xffa33c, 0, 7, 2); scene.add(light);

  // Reuse fixed pools so repeated clicks cannot accumulate GPU objects.
  const sparkCount = 48;
  const sparkPositions = new Float32Array(sparkCount * 6);
  const sparkGeometry = new THREE.BufferGeometry();
  sparkGeometry.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3).setUsage(THREE.DynamicDrawUsage));
  const sparkMaterial = new THREE.LineBasicMaterial({ color: 0xffa741, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const sparkLines = new THREE.LineSegments(sparkGeometry, sparkMaterial); sparkLines.frustumCulled = false; sparkLines.visible = false; scene.add(sparkLines);
  const sparks = Array.from({ length: sparkCount }, () => ({ position: new THREE.Vector3(), velocity: new THREE.Vector3(), age: 9, life: 0 }));
  const smokeMap = smokeTexture();
  const smoke = Array.from({ length: 18 }, () => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeMap, transparent: true, depthWrite: false, opacity: 0, rotation: Math.random() * Math.PI }));
    sprite.visible = false; scene.add(sprite);
    return { sprite, velocity: new THREE.Vector3(), age: 9, life: 0 };
  });
  let smokeCursor = 0, sparkCursor = 0;

  function audioStatus(text, state) { status.textContent = text; button.dataset.audio = state; }
  async function playSound() {
    if (muted) return;
    const shotTime = performance.now();
    const shotNumber = shots;
    const selectedStyle = soundStyle;
    try {
      if (!context) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) throw new Error('Web Audio unavailable');
        context = new AudioContext();
        master = context.createGain(); master.gain.value = volume;
        const limiter = context.createDynamicsCompressor();
        limiter.threshold.value = -12; limiter.knee.value = 6; limiter.ratio.value = 8;
        limiter.attack.value = 0.001; limiter.release.value = 0.12;
        master.connect(limiter); limiter.connect(context.destination);
      }
      if (!shotBuffers.has(selectedStyle)) shotBuffers.set(selectedStyle, createShotBuffer(context, soundStyles[selectedStyle]));
      if (context.state !== 'running') await context.resume();
      // Discard stale audio if a permission/resume delay spans several shots.
      if (muted || shotNumber !== shots || performance.now() - shotTime > 200 || document.hidden) return;
      if (context.state !== 'running') throw new Error('Audio suspended');
      const source = context.createBufferSource(); source.buffer = shotBuffers.get(selectedStyle);
      source.playbackRate.value = pitch * (0.98 + Math.random() * 0.04);
      source.connect(master); source.onended = () => source.disconnect(); source.start();
      audioStatus('音效已开启 · 松开停止开火', 'running');
    } catch {
      audioStatus('声音未能播放，请检查浏览器音频权限。', 'unavailable');
    }
  }

  function fire() {
    recoilAge = 0; shotStrength = 0.9 + Math.random() * 0.2;
    count.textContent = `${String(++shots).padStart(3, '0')} 次`;
    button.classList.add('firing'); button.dataset.shots = String(shots);
    flashRoll.setFromAxisAngle(forwardAxis, Math.random() * Math.PI);
    rifle.updateWorldMatrix(true, false); muzzleWorld.copy(muzzleLocal).applyMatrix4(rifle.matrixWorld);
    for (let i = 0; i < 14; i++) {
      const spark = sparks[sparkCursor++ % sparkCount];
      spark.position.copy(muzzleWorld); spark.age = 0; spark.life = 0.16 + Math.random() * 0.2;
      spark.velocity.set(3 + Math.random() * 6, (Math.random() - 0.35) * 3.4, (Math.random() - 0.5) * 3.6).applyQuaternion(rifle.quaternion);
    }
    for (let i = 0; i < 3; i++) {
      const puff = smoke[smokeCursor++ % smoke.length];
      puff.sprite.position.copy(muzzleWorld); puff.age = 0; puff.life = 0.65 + Math.random() * 0.4;
      puff.velocity.set(0.55 + Math.random() * 0.4, 0.22 + Math.random() * 0.3, (Math.random() - 0.5) * 0.25);
    }
    void playSound();
  }
  const hold = createHoldFire({ fire: () => {
    if (document.hidden) { stopFiring(); return; }
    fire();
  } });
  let activePointer = null, activeKey = null;
  function stopFiring() {
    hold.stop(); activeKey = null;
    button.dataset.held = 'false';
    const pointer = activePointer; activePointer = null;
    if (pointer !== null && button.hasPointerCapture(pointer)) button.releasePointerCapture(pointer);
  }
  button.addEventListener('pointerdown', event => {
    if (event.button !== 0 || activePointer !== null || activeKey !== null) return;
    event.preventDefault(); button.focus({ preventScroll: true });
    activePointer = event.pointerId;
    button.setPointerCapture(event.pointerId);
    button.dataset.held = 'true'; hold.start();
  });
  window.addEventListener('pointerup', event => { if (event.pointerId === activePointer) stopFiring(); });
  window.addEventListener('pointercancel', event => { if (event.pointerId === activePointer) stopFiring(); });
  button.addEventListener('lostpointercapture', event => { if (event.pointerId === activePointer) stopFiring(); });
  button.addEventListener('contextmenu', event => event.preventDefault());
  button.addEventListener('keydown', event => {
    if (!['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    if (event.repeat || activePointer !== null || activeKey !== null) return;
    activeKey = event.key; button.dataset.held = 'true'; hold.start();
  });
  window.addEventListener('keyup', event => { if (event.key === activeKey) { event.preventDefault(); stopFiring(); } });
  // Pointer and keyboard paths already fired on press; only assistive clicks need a fallback.
  button.addEventListener('click', event => { if (event.detail === 0 && !hold.held) fire(); });
  button.addEventListener('blur', stopFiring);
  window.addEventListener('blur', stopFiring);
  window.addEventListener('pagehide', stopFiring);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopFiring(); });

  function applyVolume() {
    if (master) master.gain.setTargetAtTime(muted ? 0 : volume, context.currentTime, 0.015);
  }
  document.querySelector('#fire-rate').addEventListener('input', event => {
    const rate = Number(event.target.value); hold.setRate(rate);
    document.querySelector('#rate-value').textContent = `${rate} 发/分钟`;
  });
  document.querySelector('#sound-style').addEventListener('change', event => {
    soundStyle = event.target.value;
    audioStatus(`已切换：${event.target.selectedOptions[0].textContent}`, muted ? 'muted' : 'ready');
  });
  document.querySelector('#sound-volume').addEventListener('input', event => {
    volume = Number(event.target.value) / 100; applyVolume();
    document.querySelector('#volume-value').textContent = `${event.target.value}%`;
  });
  document.querySelector('#sound-pitch').addEventListener('input', event => {
    pitch = Number(event.target.value);
    document.querySelector('#pitch-value').textContent = `${pitch.toFixed(2)}×`;
  });
  muteButton.addEventListener('click', () => {
    muted = !muted;
    applyVolume();
    muteButton.setAttribute('aria-pressed', String(muted)); muteButton.setAttribute('aria-label', muted ? '开启声音' : '静音');
    muteButton.textContent = muted ? '声音 · 关' : '声音 · 开';
    audioStatus(muted ? '静音模式 · 视觉效果保留' : '音效已开启 · 长按可持续开火', muted ? 'muted' : 'ready');
  });

  function update(delta) {
    recoilAge += delta;
    const t = recoilAge;
    const impulse = Number.isFinite(t) ? (1 - Math.exp(-t * 120)) * Math.exp(-t * 13) * shotStrength : 0;
    const motion = reducedMotion.matches ? 0.18 : 1;
    rifle.position.x = -0.32 * impulse * motion;
    rifle.position.y = 0.035 * impulse * motion;
    rifle.rotation.z = 0.065 * impulse * motion;
    rifle.rotation.y = Math.sin(t * 58) * impulse * 0.009 * motion || 0;
    cameraOffset.set(Math.sin(t * 105) * 0.026 * impulse * motion || 0, Math.sin(t * 87) * 0.018 * impulse * motion || 0, 0);
    if (t > 0.35) button.classList.remove('firing');

    const flashDuration = 0.065;
    flash.visible = t < flashDuration;
    if (flash.visible) {
      rifle.updateWorldMatrix(true, false); flash.position.copy(muzzleLocal).applyMatrix4(rifle.matrixWorld);
      flash.quaternion.copy(rifle.quaternion).multiply(flashRoll);
      const pulse = (1 - t / flashDuration) * shotStrength;
      flash.scale.setScalar(0.7 + pulse * 0.65);
      flameMaterial.opacity = Math.min(1, pulse * 2);
      light.position.copy(flash.position); light.intensity = pulse * 28;
    } else light.intensity = 0;

    let visibleSparks = false;
    for (let i = 0; i < sparks.length; i++) {
      const spark = sparks[i]; spark.age += delta;
      const active = spark.age < spark.life;
      const offset = i * 6;
      if (active) {
        visibleSparks = true; spark.velocity.y -= delta * 4;
        spark.position.addScaledVector(spark.velocity, delta);
        const length = 0.014 * (1 - spark.age / spark.life);
        sparkPositions[offset] = spark.position.x; sparkPositions[offset + 1] = spark.position.y; sparkPositions[offset + 2] = spark.position.z;
        sparkPositions[offset + 3] = spark.position.x - spark.velocity.x * length;
        sparkPositions[offset + 4] = spark.position.y - spark.velocity.y * length;
        sparkPositions[offset + 5] = spark.position.z - spark.velocity.z * length;
      } else sparkPositions.fill(0, offset, offset + 6);
    }
    sparkLines.visible = visibleSparks; sparkGeometry.attributes.position.needsUpdate = visibleSparks;
    for (const puff of smoke) {
      puff.age += delta; puff.sprite.visible = puff.age < puff.life;
      if (!puff.sprite.visible) continue;
      const life = puff.age / puff.life;
      puff.sprite.position.addScaledVector(puff.velocity, delta);
      puff.sprite.scale.setScalar(0.13 + life * 0.85);
      puff.sprite.material.opacity = Math.sin(life * Math.PI) * 0.38;
      puff.sprite.material.rotation += delta * 0.25;
    }
  }
  return { update, cameraOffset, setModel(model, muzzle) {
    stopFiring();
    rifle.position.set(0, 0, 0); rifle.rotation.set(0, 0, 0);
    rifle = model; muzzleLocal.copy(muzzle); recoilAge = Infinity;
    shots = 0; count.textContent = '000 次'; button.dataset.shots = '0';
    flash.visible = false; light.intensity = 0; cameraOffset.set(0, 0, 0);
    button.classList.remove('firing');
    for (const spark of sparks) spark.age = 9;
    for (const puff of smoke) { puff.age = 9; puff.sprite.visible = false; }
    sparkLines.visible = false;
  } };
}
