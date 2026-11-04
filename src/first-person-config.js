// Positions use each existing gun's artistic local coordinates, not real dimensions.
export const firstPersonProfiles = {
  ak47: {
    // Hip-fire framing: lower right, mostly forward with a slight inward angle.
    scale: 0.10, position: [0.23, -0.16, -0.65], rotation: [0, Math.PI / 2 + 0.14, 0.065],
    elbows: { right: [0.34, -0.38, -0.25], left: [0.08, -0.34, -0.45] },
    shoulders: { right: [0.36, -0.65, 0.06], left: [-0.17, -0.65, 0.06] },
    right: { wrist: [-1.91, -0.66, 0.36], rotation: [0, 0, -Math.PI / 2] },
    left: { wrist: [1.04, -0.62, -0.65], rotation: [Math.PI / 2, 0, 0] },
    recoil: 0.033, lift: 0.045, label: '步枪 · 护木支撑',
  },
  m1913: {
    scale: 0.048, position: [0.18, -0.12, -0.58], rotation: [0, Math.PI / 2 + 0.12, 0.04],
    elbows: { right: [0.33, -0.37, -0.22], left: [0.02, -0.36, -0.24] },
    shoulders: { right: [0.36, -0.65, 0.06], left: [-0.17, -0.65, 0.06] },
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
