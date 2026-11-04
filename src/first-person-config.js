// Positions use each existing gun's artistic local coordinates, not real dimensions.
export const firstPersonProfiles = {
  ak47: {
    // Hip-fire framing: receiver at lower right, muzzle below/right of reticle.
    scale: 0.105, position: [0.31, -0.23, -0.80], rotation: [0, Math.PI / 2 + 0.32, 0.065],
    elbows: { right: [0.46, -0.61, -0.12], left: [0.04, -0.58, -0.18] },
    right: { wrist: [-1.91, -0.66, 0.36], rotation: [0, 0, -Math.PI / 2] },
    left: { wrist: [1.04, -0.62, -0.65], rotation: [Math.PI / 2, 0, 0] },
    recoil: 0.033, lift: 0.045, label: '步枪 · 护木支撑',
  },
  m1913: {
    scale: 0.048, position: [0.25, -0.19, -0.72], rotation: [0, Math.PI / 2 + 0.32, 0.04],
    elbows: { right: [0.41, -0.57, -0.13], left: [0.03, -0.56, -0.18] },
    right: { wrist: [-3.8, -1.6, 0.61], rotation: [0, 0, -Math.PI / 2] },
    left: { wrist: [-3.85, -2.15, -0.78], rotation: [Math.PI, 0, -Math.PI / 2] },
    recoil: 0.046, lift: 0.09, label: '手枪 · 双手包覆',
  },
};

export function lookAngles(yaw, pitch, dx, dy, sensitivity = 0.0022) {
  return { yaw: yaw - dx * sensitivity, pitch: Math.max(-1.15, Math.min(1.15, pitch - dy * sensitivity)) };
}

export function firstPersonRecoil(impulse, profile, reduced = false) {
  const factor = reduced ? 0.18 : 1;
  return { z: impulse * profile.recoil * factor, pitch: impulse * profile.lift * factor };
}
