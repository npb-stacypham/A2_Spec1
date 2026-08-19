import { initThreeScene } from "./three-scene.js?v=20260820-6";
import { startP5Sketch } from "./p5-sketch.js?v=20260820-6";

await Promise.all([
  document.fonts.load('700 128px "Helvetica"'),
  document.fonts.load('400 128px "Mea Culpa"'),
]);
await document.fonts.ready;

// HANDOFF NOTE: Start p5 first so it owns the clock, input, and sound controller.
// Three.js is connected afterward and provides projected 3D positions to 2D effects.
const p5Effects = startP5Sketch();
initThreeScene(p5Effects);
