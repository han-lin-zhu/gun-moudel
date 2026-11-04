import * as THREE from 'three';

// Separate color, roughness and height layers make wear react to moving light.
export function createAgedSurface(kind = 'steel', seed = 1913) {
  const size = 1024;
  const canvases = Array.from({ length: 3 }, () => { const c = document.createElement('canvas'); c.width = c.height = size; return c; });
  const [color, rough, height] = canvases.map(c => c.getContext('2d'));
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const isGrip = kind === 'grip';
  color.fillStyle = isGrip ? '#484438' : '#737b84'; color.fillRect(0, 0, size, size);
  rough.fillStyle = isGrip ? '#d3d3d3' : '#929292'; rough.fillRect(0, 0, size, size);
  height.fillStyle = '#808080'; height.fillRect(0, 0, size, size);
  // Broad uneven patina and worn patches, beneath the fine surface detail.
  for (let i = 0; i < 190; i++) {
    const x = rand() * size, y = rand() * size, r = 18 + rand() * 110;
    const g = color.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, isGrip ? 'rgba(15,12,7,.18)' : i % 3 ? 'rgba(26,34,45,.2)' : 'rgba(184,170,139,.19)');
    g.addColorStop(1, 'rgba(0,0,0,0)'); color.fillStyle = g; color.fillRect(x - r, y - r, r * 2, r * 2);
    rough.fillStyle = `rgba(${i % 2 ? '225,225,225' : '45,45,45'},.08)`;
    rough.beginPath(); rough.ellipse(x, y, r, r * 0.3, rand() * Math.PI, 0, Math.PI * 2); rough.fill();
  }
  for (let i = 0; i < 95000; i++) {
    const x = rand() * size, y = rand() * size, r = 0.4 + rand() * 1.2;
    const light = rand() > 0.55;
    color.fillStyle = light ? 'rgba(213,213,195,.17)' : 'rgba(17,24,29,.23)'; color.fillRect(x, y, r, r);
    height.fillStyle = light ? '#999999' : '#555555'; height.fillRect(x, y, r, r);
  }
  for (let i = 0; i < (isGrip ? 1500 : 4000); i++) {
    const x = rand() * size, y = rand() * size, length = 1 + rand() ** 3 * 55;
    for (const [ctx, stroke] of [[color, 'rgba(219,218,201,.27)'], [rough, '#494949'], [height, '#555555']]) {
      ctx.strokeStyle = stroke; ctx.lineWidth = 0.3 + rand() * 0.65;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (isGrip ? length * 0.15 : length), y - (isGrip ? length : rand() * 3)); ctx.stroke();
    }
  }
  if (isGrip) {
    for (let i = 0; i < 140; i++) {
      const x = rand() * size;
      color.strokeStyle = 'rgba(175,151,102,.14)'; color.lineWidth = 0.8;
      color.beginPath(); color.moveTo(x, 0); color.bezierCurveTo(x + 12, 300, x - 8, 700, x + 14, size); color.stroke();
    }
  }
  const [map, roughnessMap, bumpMap] = canvases.map(c => new THREE.CanvasTexture(c));
  map.colorSpace = THREE.SRGBColorSpace;
  return { map, roughnessMap, bumpMap, bumpScale: isGrip ? 0.018 : 0.008 };
}
