/** The wave lasts the same for the legacy `wave` intent and the `wave` emote. */
const WAVE_SECONDS = 1.6;

export const BALANCE = {
  interaction: { facingConeDeg: 90 },
  /**
   * Client-only interaction feedback (REQ-INT-001/004/005, T-1156, plan phase-4.1 §3.5).
   * The current target's materials get `highlight.color` as emissive at
   * `highlight.intensity`. Cabinet, fridge and main-door leaves swing open by `openAngleDeg`
   * over `openSeconds` (local only, never replicated); the door exit leaves the room
   * `doorExitSeconds` after E so the swing is seen.
   */
  interactionView: {
    highlight: { color: '#ffcf70', intensity: 0.35 },
    openSeconds: 0.45,
    openAngleDeg: { cabinet: 105, fridge: 100, door: 75 },
    doorExitSeconds: 0.5,
  },
  activity: { drinkSeconds: 2.5, waveSeconds: WAVE_SECONDS, crossFadeSeconds: 0.25 },
  /**
   * REQ-INT-003 coffee routine (plan phase-4.1 §3.4, §6.2). A sip lasts
   * `activity.drinkSeconds`; the machine serves one employee at a time.
   */
  coffee: { brewSeconds: 4, sips: 3 },
  /**
   * REQ-AVATAR-004 emotes (plan phase-4.1 §3.8, DECISIONS 2026-11-17). The server ends an
   * emote after its duration. A new emote is refused until `minGapSeconds` after the
   * previous emote of the same employee started, which also limits the rate.
   */
  emote: {
    durationSeconds: { wave: WAVE_SECONDS, dance: 4, think: 3, laugh: 2.5, stretch: 3 },
    minGapSeconds: 1,
  },
  /**
   * Client-only avatar overlays (plan phase-4.1 §3.7, owner option (a)). Directions are
   * weights of the avatar's forward / up / right axes; the overlay blends in and out over
   * `activity.crossFadeSeconds`.
   */
  avatar: {
    /**
     * REQ-AVATAR-002 typing while `working` (T-1219): alternating taps, Hz per hand. The
     * wrists reach `wrist` (T-1614, m in the seat frame: forward of and above the seat
     * socket, `side` either way), just behind the layout keyboard (0.42 m forward, top
     * 0.79 m) so the fingers rest on the keys.
     */
    typing: {
      tapHz: 3.5,
      tapDepth: 0.35,
      wrist: { forward: 0.31, height: 0.82, side: 0.11 },
      elbowOut: 0.6,
      handsIn: 0.32,
    },
    /**
     * REQ-INT-003 make-coffee motion while `brewing` (T-1611): both hands at the machine,
     * the right hand presses `pressHz` times a second, dipping by `pressDepth`.
     */
    brew: { pressHz: 0.8, pressDepth: 0.55, reach: 1.2, elbowOut: 0.2, handsIn: 0.3 },
    /**
     * Seated placement (T-1614), in metres in the seat frame (forward = the way the seat
     * faces, from the layout seat socket; height above the floor). The avatar model is moved
     * so the midpoint of its hip joints (thigh bones) lands on `desk` / `sofa`: about 0.11 m
     * above the cushion top (buttock depth) and about 0.09 m in front of the backrest. The
     * Kenney desk chair, fitted to its layout box, has its cushion top at 0.365 m, front edge
     * at +0.24 m and backrest face at -0.16 m; the sofa cushion top is at 0.45 m and its
     * backrest face at -0.31 m. The move blends in over `blendSeconds`. While seated the
     * feet are planted at the rig's rest foot height, and when not working the hands rest
     * on the thighs: the wrist `thighAlong` of the way from hip to knee, `thighLift` above
     * the thigh bone.
     */
    sit: {
      desk: { forward: -0.07, height: 0.48 },
      sofa: { forward: -0.21, height: 0.57 },
      blendSeconds: 0.6,
      thighAlong: 0.4,
      thighLift: 0.08,
    },
    /**
     * FEAT-143 office stance (`avatar/stance.ts`) over the standing clip: the feet move to
     * `footSpread` x the rest-pose foot spread with `stagger` of the clip's front-to-back
     * offset, the hips rise `hipLift` of the way back to the rest height, the arms hang down
     * `armOut` to the side with the elbows `elbowBend` forward (the right one `holdBend` while
     * it holds a cup), swaying `armSway` at `swayHz`. Standing and walking, the head is
     * levelled to the rest pose; standing, it looks around by `lookAround` rad at `lookHz`.
     * Angles in radians, rates in Hz on the clip's time: 0.4 Hz is once per `Idle_Loop`
     * (2.5 s), so the motion loops with the clip.
     */
    stance: {
      footSpread: 1.15,
      stagger: 0.25,
      hipLift: 0.8,
      armOut: 0.15,
      elbowBend: 0.18,
      holdBend: 0.9,
      armSway: 0.03,
      swayHz: 0.4,
      lookAround: 0.05,
      lookHz: 0.4,
    },
    /**
     * FEAT-143 hands: the standing and walking clips' finger tracks become one pose `curl`
     * of the way from the open rest pose to the UAL fist; holding a cup in the hand, the right
     * fingers close `grip` of the way to the fist again.
     */
    hands: { curl: 0.2, grip: 0.85 },
    /**
     * FEAT-143 load-time look (`avatar/look.ts`): smoothed normals with edges sharper than
     * `creaseAngle` (rad) kept hard, material roughness at least `roughness`; brows flattened
     * to `browFlatten` of their height, lifted `browLift` m and `browFade` of the way to the
     * skin colour; eyes `eyeOpen` times taller.
     */
    look: {
      creaseAngle: 1.2,
      roughness: 0.6,
      browFlatten: 0.6,
      browLift: 0.003,
      browFade: 0.3,
      eyeOpen: 1.15,
    },
    /** REQ-AVATAR-004 emote overlays (T-1222); angles in radians, rates in Hz. */
    emote: {
      think: { headNod: 0.3 },
      laugh: { hz: 4, chest: 0.12, head: 0.2 },
      stretch: { swayHz: 0.5, sway: 0.1, lean: 0.15 },
    },
  },
  /**
   * Client-only coffee presentation (REQ-INT-003, T-1154). Sizes and offsets in metres (a
   * prop is scaled uniformly to its height or its max width, whichever is smaller);
   * a held prop is centred on the grip point in the palm (T-1610): `grip.along` of the way
   * from the hand bone to the finger bone, `grip.palm` toward the palm side;
   * `rest` puts a seated employee's cup `inset` past the near edge of the desk or coffee
   * table and `side` to the seat's right, at least `margin` inside the top. Steam starts
   * `aboveMachine` above the machine's layout position and puffs rise at `riseSpeed` (m/s)
   * for `height`.
   */
  coffeeView: {
    cupHeight: 0.13,
    cupMaxWidth: 0.18,
    glassHeight: 0.12,
    glassMaxWidth: 0.08,
    grip: { along: 0.6, palm: 0.03 },
    rest: { inset: 0.14, side: 0.45, margin: 0.06 },
    steam: { puffs: 14, riseSpeed: 0.22, height: 0.35, size: 0.06, aboveMachine: 0.2 },
  },
  /**
   * Client-only working desktop (REQ-INT-002, T-1155, plan phase-4.1 §3.3, §6.3). One shared
   * canvas per screen state, `canvas` pixels; the desktop canvas is redrawn at most every
   * `redrawSeconds` (clock, `lines` text lines in one window, one new line per redraw).
   * Colours name `officeLayout.palette` entries. `offColor` is the empty desk's dark screen;
   * `lockDim` darkens the wallpaper on the lock screen. `surfaceOffset` (m) lifts the screen
   * quad off the monitor panel. The desk lamp shade glows with `lamp` while its desk shows
   * the desktop; `shadeGrow` enlarges the glow shell over the shade.
   */
  deskScreen: {
    canvas: [256, 192],
    redrawSeconds: 1,
    lines: 7,
    wallpaper: ['chairBack', 'deskDividers'],
    window: 'walls',
    text: 'chairSeat',
    offColor: '#0b0c0e',
    lockDim: 0.55,
    surfaceOffset: 0.003,
    lamp: { color: '#fff1d6', emissive: '#ffd9a0', emissiveIntensity: 5, shadeGrow: 1.04 },
  },
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
    /** Remote avatars are rendered this far in the past (the floor of the adaptive delay). */
    interpolationDelayMs: 100,
    /**
     * T-1377: the delay grows to one patch plus the slowest recent frame (patches are only
     * handled between frames, so a slow frame stamps them late and the buffer runs dry), up to
     * this cap. It moves at most `interpolationDelaySlew` ms per ms of frame time, so remote
     * avatars slow down or speed up by at most that fraction while it adapts.
     */
    interpolationDelayMaxMs: 400,
    interpolationDelaySlew: 0.2,
    /** Frames whose slowest frame time sets the delay target. */
    interpolationDelayWindow: 30,
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
    /**
     * REQ-NET-004 test network profile, dev only: applied to every outgoing server message
     * when the server starts with NET_PROFILE=test (off by default). WebSocket runs on TCP,
     * so a lost segment is never a missing message: it is resent after about one
     * retransmission timeout and holds back everything behind it (a delay spike).
     */
    testProfile: {
      /** Added delay approximating the full round trip (the uplink is not delayed). */
      rttMs: 100,
      /** Uniform jitter of +/- this many ms around rttMs. */
      jitterMs: 20,
      /** Share of messages that pay the retransmission delay (simulated 1% loss). */
      lossPercent: 1,
      /** Extra delay of a "lost" message (Linux minimum TCP retransmission timeout). */
      retransmitMs: 200,
      /** Length of the manual soak run (`e2e/netProfile.spec.ts`). */
      runMinutes: 10,
    },
  },
  /** Phase 4 shared TV (REQ-TV-006, REQ-NFR-005). */
  tv: {
    /** Drift below this many seconds is left alone. */
    ignoreBelowSeconds: 0.5,
    /** Drift from ignoreBelowSeconds up to this many seconds is corrected with a rate nudge. */
    nudgeUpToSeconds: 2,
    /** Drift above nudgeUpToSeconds is corrected with a hard seek. */
    hardSeekAboveSeconds: 2,
    /** A nudge plays at 1 +/- this rate (0.05 = 5 %). */
    nudgeRate: 0.05,
    /** A single nudge lasts at most this long. */
    nudgeMaxSeconds: 2,
    /** Clients are expected to converge within this many seconds after a change. */
    convergenceSeconds: 5,
    /** Phase acceptance: drift between clients after convergence stays below this. */
    driftTargetSeconds: 1.0,
    /** REQ-NFR-005: at most rateLimitCommands TV commands per rateLimitWindowSeconds per client. */
    rateLimitCommands: 5,
    rateLimitWindowSeconds: 10,
    /**
     * OQ-023 (T-1567): `tv_time` clock samples a client takes on every join or reconnect,
     * one after the other; the tightest (largest) lower bound wins.
     */
    clockSamplesOnJoin: 3,
    /** OQ-023: at most this many `tv_time` requests per rateLimitWindowSeconds per client. */
    timeRequestsPerWindow: 6,
  },
  /** T-1568: client YouTube player robustness (presentation only, not synced). */
  tvPlayer: {
    /** The IFrame API script counts as failed after this long without becoming ready. */
    iframeApiTimeoutMs: 15_000,
    /** At most this many commands wait for the IFrame player; the oldest is dropped. */
    playerQueueMax: 32,
  },
  rendering: {
    /** 'agx' or 'aces' (THREE.AgXToneMapping / THREE.ACESFilmicToneMapping). */
    toneMapping: 'aces',
    exposure: 1.0,
    background: '#eceef0',
    /** Intensity of the light probe baked from THREE RoomEnvironment (image-based fill). */
    environmentIntensity: 0.55,
    hemisphere: { sky: '#f2f0ec', ground: '#e6e0d6', intensity: 0.8 },
    /**
     * Daylight through the south window (layout shell.windows[south_window], top edge 2.55 m
     * at z 4.75). T-1150: a lower, warmer sun (about 26 degrees up) so the light falls through
     * the window wall across the desk pods instead of straight down through the ceiling.
     */
    sun: { color: '#fff0d8', intensity: 3.2, position: [1.5, 4.2, 9.5], target: [0, 0, 1] },
    /**
     * T-1150: softer contact shadows: a wider PCF filter radius and shadows that keep some
     * bounce light (intensity < 1) instead of going fully dark.
     */
    shadow: {
      mapSize: 2048,
      bias: -0.0004,
      normalBias: 0.03,
      radius: 6,
      intensity: 0.8,
      margin: 0.3,
      /**
       * FPS pass 2026-11-20: only static furniture and walls cast sun shadows (avatars use a
       * blob shadow), so the shadow map is redrawn at most this often, and every frame only
       * while a cabinet, fridge or door leaf swings. Catches furniture that finishes loading.
       */
      refreshSeconds: 0.5,
    },
    /**
     * T-1150: flush LED ceiling panels (layout shell.lighting[ceiling_light], room centre).
     * Emissive only: they add no light and cast no shadow. A grid of `columns` x `rows`
     * panels, `spacing` metres apart (x, z), centred under the ceiling.
     */
    ceilingFixtures: {
      columns: 4,
      rows: 3,
      spacing: [2.4, 2.4],
      panelSize: 0.6,
      thickness: 0.03,
      color: '#e5e7eb',
      emissive: '#fff8ee',
      /** Linear HDR; above postProcessing.bloom.threshold so panels glow in `high`. */
      emissiveIntensity: 6,
    },
    /**
     * T-1150, `high` render quality only (off in `e2e`): MSAA in the composer targets and a
     * mild bloom. The threshold is in linear HDR before tone mapping, above sunlit walls, so
     * only emissive panels, screens and lamps bloom. Drop bloom (strength 0) if it costs
     * more than 5 FPS on the owner's laptop (plan §6.5).
     */
    postProcessing: {
      msaaSamples: 4,
      // Owner 2026-11-20: high quality fell below 30 FPS on every machine, so bloom is off
      // (strength 0), which also skips the composer (postProcessing.ts).
      bloom: { strength: 0, radius: 0.4, threshold: 4 },
    },
    /**
     * FPS pass 2026-11-20: the canvas pixel ratio is the device's, capped here (was 2). A
     * 1.5 cap draws 44 % fewer pixels than 2 on a retina screen.
     */
    maxPixelRatio: 1.5,
    /**
     * FPS pass 2026-11-20, `high` only (`apps/web/src/game/adaptiveQuality.ts`): when a
     * `sampleSeconds` window averages below `targetFps`, lower the pixel ratio by
     * `pixelRatioStep` down to `minPixelRatio`, then turn the sun shadow map off. Never raised
     * again in a session. `settleSeconds` is skipped at start and after each step.
     */
    adaptive: {
      targetFps: 45,
      settleSeconds: 4,
      sampleSeconds: 2,
      pixelRatioStep: 0.25,
      minPixelRatio: 1,
    },
    /**
     * T-1149, `high` render quality only: `scene.environment` is a PMREM of THREE
     * RoomEnvironment (soft reflections on glass, metal and screens) at
     * `environmentIntensity`, in place of the light probe. `e2e` keeps the light probe.
     * `blurSigma` is the PMREMGenerator.fromScene blur (radians).
     */
    reflections: { blurSigma: 0.04 },
    /**
     * T-1149: one material table per material class, applied to the loaded Kenney
     * furniture, prop and decor materials (`apps/web/src/game/materials.ts` maps Kenney
     * material names to a class). `palette` names an `officeLayout.palette` entry whose
     * colour the class takes (REQ-ROOM-001: walnut wood, white metal); classes without one
     * keep the Kenney colour.
     */
    materials: {
      // No `palette` colour: recolouring by Kenney material name also tinted the bear, the
      // cardboard box, plant pots and lamp stands; Kenney colours stay (lead, 2026-11-18).
      wood: { roughness: 0.7, metalness: 0 },
      metal: { roughness: 0.4, metalness: 0.4 },
      fabric: { roughness: 0.95, metalness: 0 },
      glass: { roughness: 0.05, metalness: 0 },
      /** Plastic housings and screens (black electronics). */
      plastic: { roughness: 0.3, metalness: 0 },
      default: { roughness: 0.8, metalness: 0 },
    },
  },
} as const;
export type Balance = typeof BALANCE;
