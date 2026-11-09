export const BALANCE = {
  movement: { walkSpeed: 2.0, runSpeed: 4.0, capsuleRadius: 0.3, turnRate: 12 },
  camera: {
    distance: 4.0,
    minDistance: 1.0,
    maxDistance: 6.0,
    minPitchDeg: 10,
    maxPitchDeg: 60,
    defaultPitchDeg: 25,
    targetHeight: 1.4,
    stiffness: 10,
    mouseSensitivity: 0.0035,
    occlusionPadding: 0.2,
  },
} as const;
export type Balance = typeof BALANCE;
