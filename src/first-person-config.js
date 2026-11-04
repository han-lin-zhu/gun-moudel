// Positions use each existing gun's artistic local coordinates, not real dimensions.
export const firstPersonProfiles = {
  ak47: {
    scale: 0.115, position: [0.13, -0.04, -0.50], rotation: [0.015, Math.PI / 2 + 0.10, 0],
    right: { wrist: [-1.91, -0.66, 0.36], rotation: [0, 0, -Math.PI / 2] },
    left: { wrist: [1.04, -0.62, -0.65], rotation: [Math.PI / 2, 0, 0] },
    recoil: 0.033, lift: 0.045, label: '步枪 · 护木支撑',
  },
  m1913: {
    scale: 0.052, position: [0.12, -0.09, -0.70], rotation: [0.015, Math.PI / 2 + 0.10, 0],
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
