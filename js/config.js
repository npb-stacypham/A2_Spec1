export const CONFIG = {
  // QUICK EDIT NOTE — ASSETS: Change model, bug, or sound files here.
  laceModelUrl: "./lace%20center.glb",
  victimModelUrl: "./victim%20flower.glb",
  bugTextureUrls: [
    "./bug%201.png",
    "./bug%202.png",
    "./bug%203.png",
    "./bug%204.png",
  ],
  soundUrls: {
    hover: [
      "./sound%20edited/hovering%201.wav",
      "./sound%20edited/hovering%202.wav",
      "./sound%20edited/hovering%203.wav",
      "./sound%20edited/hovering%204.wav",
    ],
    notes: [
      "./sound%20edited/do.wav",
      "./sound%20edited/re.wav",
      "./sound%20edited/mi.wav",
      "./sound%20edited/fa.wav",
      "./sound%20edited/sol.wav",
      "./sound%20edited/la.wav",
      "./sound%20edited/si.wav",
    ],
    melody: "./sound%20edited/melody.wav",
    timer: "./sound%20edited/timer.wav",
    victimRestore: "./sound%20edited/victim%20flower.wav",
  },
  // HANDOFF NOTE: p5.sound volume values use a 0–1 range.
  // Adjust sound, timing, and visual settings in this file first.
  hoverSoundDistanceFactor: 0.22,
  hoverSoundVolume: 0.28,
  noteSoundVolume: 0.78,
  victimSoundVolume: 0.85,
  melodyVolume: 0.2,
  timerVolume: 0.12,

  // QUICK EDIT NOTE — 3D LAYOUT:
  // ringHeight moves the flower ring up/down; ringSpeed controls its rotation;
  // cameraFit controls the zoom level.
  instanceCount: 10,
  ringHeight: 1,
  ringSpeed: 0.12,

  // QUICK EDIT NOTE — STEM TRAILS:
  // A longer duration keeps trails visible longer. A higher count makes them
  // smoother but increases GPU usage.
  stemTrailCount: 70,
  stemTrailDuration: 1.8,
  stemTrailOpacity: 0.025,
  stemTrailColor: "#D0FFEA",
  cameraFit: 0.67,
  cameraElevation: 0.55,
  bugDarkenFactor: 0.2,
  bugDarkenFadeDuration: 1.2,
  bugRestoreFadeDuration: 1.4,
  materialCrossfadeDuration: 1.35,
  stemColor: "#D0FFEA",

  // QUICK EDIT NOTE — FLOWER MOTION:
  // Swing controls the up/down tilt without stretching the stem or flower.
  flowerVerticalSwingMin: 0.04,
  flowerVerticalSwingMax: 0.22,
  flowerVerticalSpeedMin: 0.35,
  flowerVerticalSpeedMax: 0.8,
  flowerRippleCount: 1,
  flowerRippleDuration: 1.55,
  flowerRippleStagger: 0.24,
  flowerRippleMaxSize: 1.8,
  flowerRippleOpacity: 0.58,
  flowerRippleAspect: 0.38,
  flowerRippleColor: "#D0FFEA",

  // QUICK EDIT NOTE — BUGS: Particle count is randomized between min and max.
  bugParticleCountMin: 8,
  bugParticleCountMax: 20,
  bugFlightDuration: 5,
};
