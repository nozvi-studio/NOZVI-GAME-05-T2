export const BALANCE = {
  interaction: { facingConeDeg: 90 },
  activity: { drinkSeconds: 2.5, waveSeconds: 1.6, crossFadeSeconds: 0.25 },
  movement: { walkSpeed: 2.0, runSpeed: 4.0, capsuleRadius: 0.3, turnRate: 12 },
  camera: {
    fovDeg: 60,
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
    /** The camera stays this far below the room ceiling (layout room.dimensions.height). */
    ceilingClearance: 0.15,
    /** Player mesh fades from opaque at fadeStartDistance to fadeMinOpacity at fadeEndDistance. */
    fadeStartDistance: 1.2,
    fadeEndDistance: 1.0,
    fadeMinOpacity: 0.35,
  },
  net: {
    /** Server simulation rate; one client input equals one fixed step of 1 / tickHz seconds. */
    tickHz: 20,
    /** Server state patch interval (Colyseus patchRate). */
    patchMs: 50,
    /** Remote avatars are rendered this far in the past. */
    interpolationDelayMs: 100,
    /** Seat and avatar are held this long after an unexpected disconnect. */
    reconnectSeconds: 20,
    /** Client retry delays after a drop; after the last one the UI offers Rejoin. */
    backoffSeconds: [1, 2, 4, 8],
    maxClients: 10,
    /** Per-client cap on queued inputs (0.5 s at 20 Hz); extra inputs are dropped. */
    inputQueueMax: 10,
    /** Per-client cap on intents waiting for earlier inputs to apply; extra intents are dropped. */
    intentQueueMax: 4,
    joinsPerMinutePerIp: 10,
    /** Client reconciliation: a replayed position closer than this (m) to the prediction is kept. */
    reconcileEpsilon: 0.001,
    /** Client reconciliation: a larger correction is blended in over this many seconds. */
    correctionBlendSeconds: 0.15,
  },
  rendering: {
    /** 'agx' or 'aces' (THREE.AgXToneMapping / THREE.ACESFilmicToneMapping). */
    toneMapping: 'aces',
    exposure: 1.0,
    background: '#eceef0',
    /** Intensity of the light probe baked from THREE RoomEnvironment (image-based fill). */
    environmentIntensity: 0.55,
    hemisphere: { sky: '#f2f0ec', ground: '#e6e0d6', intensity: 0.8 },
    /** Daylight through the south window (layout shell.windows[south_window]). */
    sun: { color: '#fff1dc', intensity: 3.0, position: [2, 6, 9], target: [0, 0, 0] },
    shadow: { mapSize: 2048, bias: -0.0004, normalBias: 0.03, radius: 3, margin: 0.3 },
  },
} as const;
export type Balance = typeof BALANCE;
