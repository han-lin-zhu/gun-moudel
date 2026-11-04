// Observation and firing are separate states: looking never depends on a held button.
export function createFirstPersonInput({ canvas, document: doc = document, window: win = window, isActive, move, firing, onChange }) {
  let looking = false, pointer = null, lastPosition = null;
  const locked = () => doc.pointerLockElement === canvas;
  function stopFiring() {
    firing.stopFiring();
    const previous = pointer; pointer = null;
    if (previous !== null && canvas.hasPointerCapture(previous)) canvas.releasePointerCapture(previous);
  }
  function pause() {
    looking = false; lastPosition = null; stopFiring();
    if (locked()) doc.exitPointerLock();
    onChange(looking, locked());
  }
  function resume() {
    if (!isActive()) return;
    looking = true; lastPosition = null;
    onChange(looking, locked());
    // Embedded browsers may reject Pointer Lock. Free mouse movement over the
    // canvas still controls observation without requiring a drag or firing.
    try { canvas.requestPointerLock?.()?.catch(() => onChange(looking, locked())); }
    catch { onChange(looking, locked()); }
  }
  canvas.addEventListener('pointerdown', event => {
    if (!isActive() || !looking || event.button !== 0 || doc.querySelector('dialog[open]')) return;
    event.preventDefault();
    pointer = event.pointerId;
    if (event.pointerType === 'touch') {
      lastPosition = { x: event.clientX, y: event.clientY };
      try { canvas.setPointerCapture(pointer); } catch { /* Global release still stops firing. */ }
    }
    firing.startFiring();
  });
  canvas.addEventListener('pointermove', event => {
    if (!isActive() || !looking || locked() || doc.querySelector('dialog[open]')) return;
    if (event.pointerType === 'touch' && event.pointerId !== pointer) return;
    if (lastPosition) move(event.clientX - lastPosition.x, event.clientY - lastPosition.y);
    lastPosition = { x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener('pointerleave', () => { lastPosition = null; });
  doc.addEventListener('mousemove', event => {
    if (isActive() && looking && locked()) move(event.movementX, event.movementY);
  });
  win.addEventListener('pointerup', event => { if (event.pointerId === pointer) stopFiring(); });
  canvas.addEventListener('pointercancel', stopFiring);
  canvas.addEventListener('lostpointercapture', stopFiring);
  win.addEventListener('blur', () => { if (isActive()) pause(); });
  doc.addEventListener('visibilitychange', () => { if (doc.hidden && isActive()) pause(); });
  doc.addEventListener('keydown', event => {
    if (event.key === 'Escape' && isActive() && !doc.querySelector('dialog[open]')) pause();
  });
  doc.addEventListener('pointerlockchange', () => {
    if (!isActive()) return;
    if (!locked()) pause();
    else if (!looking) doc.exitPointerLock();
    else { lastPosition = null; onChange(looking, true); }
  });
  canvas.addEventListener('contextmenu', event => { if (isActive()) event.preventDefault(); });
  return { resume, pause, get looking() { return looking; } };
}
