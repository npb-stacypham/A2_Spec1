import { CONFIG } from "./config.js?v=20260820-6";
import {
  resizeThreeScene,
  triggerFlowerAtScreen,
  updateThreeScene,
} from "./three-scene.js?v=20260820-6";

const BACKGROUND_COLORS = ["#A2084E", "#2A0009", "#FF0093"];
const TEXT_COLORS = ["#D0FFEA", "#AEEB87", "#FF0093", "#A2084E"];

// HANDOFF NOTE: p5 owns all 2D rendering, input, timing, and sound.
// Three.js only keeps features that require actual GLB 3D data.
const GRID_LAYOUTS = [
  {
    me: [25, 2, "right", "top"],
    now: [1, 13, "left", "bottom"],
    cta: [25, 12, "right", "bottom"],
  },
  {
    me: [25, 13, "right", "bottom"],
    now: [1, 1, "left", "top"],
    cta: [25, 1, "right", "top"],
  },
];

// HANDOFF NOTE: The grid has 24 columns and 12 rows. Values in GRID_LAYOUTS
// are grid lines (1–25 horizontally and 1–13 vertically), not pixel positions.

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function createTheme() {
  const backgroundColor = randomItem(BACKGROUND_COLORS);
  const allowedTextColors = TEXT_COLORS.filter((color) => {
    const sameColor = color.toLowerCase() === backgroundColor.toLowerCase();
    const blockedPair = backgroundColor === "#FF0093" && color === "#A2084E";
    return !sameColor && !blockedPair;
  });

  return {
    backgroundColor,
    textColor: randomItem(allowedTextColors),
  };
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function easeInOutCubic(value) {
  if (value < 0.5) return 4 * value * value * value;
  return 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function easeOutCubic(value) {
  return 1 - Math.pow(1 - value, 3);
}

function loadSoundFile(sketch, url) {
  return sketch.loadSound(
    url,
    undefined,
    () => console.warn(`Không tải được sound ${url}.`),
  );
}

function loadP5Sounds(sketch) {
  return {
    hover: CONFIG.soundUrls.hover.map((url) => loadSoundFile(sketch, url)),
    notes: CONFIG.soundUrls.notes.map((url) => loadSoundFile(sketch, url)),
    melody: loadSoundFile(sketch, CONFIG.soundUrls.melody),
    timer: loadSoundFile(sketch, CONFIG.soundUrls.timer),
    victimRestore: loadSoundFile(sketch, CONFIG.soundUrls.victimRestore),
  };
}

function createP5AudioController(sketch, sounds, playButton) {
  let hoverLoopsStarted = false;
  let lastNoteIndex = -1;
  let compositionPlaying = false;

  function getContext() {
    return sketch.getAudioContext?.() ?? window.getAudioContext?.();
  }

  function startHoverLoops() {
    if (hoverLoopsStarted) return;
    hoverLoopsStarted = true;

    sounds.hover.forEach((sound) => {
      if (!sound?.isLoaded()) return;
      sound.setVolume(0);
      sound.loop();
    });
  }

  function unlock() {
    // NOTE: Browsers only allow sound playback after a real user gesture.
    const startAudio = sketch.userStartAudio ?? window.userStartAudio;
    const result = startAudio?.call(sketch);
    Promise.resolve(result).then(startHoverLoops);

    const context = getContext();
    if (context?.state === "running") startHoverLoops();
  }

  function updateHover(pointer, targets, viewport) {
    if (getContext()?.state !== "running") return;
    startHoverLoops();

    const desiredVolumes = Array(sounds.hover.length).fill(0);
    const maxDistance = Math.max(
      90,
      Math.min(viewport.width, viewport.height) * CONFIG.hoverSoundDistanceFactor,
    );

    if (pointer.inside) {
      for (const target of targets) {
        if (!target.visible) continue;
        const distance = sketch.dist(pointer.x, pointer.y, target.x, target.y);
        const proximity = sketch.constrain(1 - distance / maxDistance, 0, 1);
        const volume = proximity * proximity * CONFIG.hoverSoundVolume;
        const soundIndex = target.index % sounds.hover.length;
        desiredVolumes[soundIndex] = Math.max(
          desiredVolumes[soundIndex],
          volume,
        );
      }
    }

    sounds.hover.forEach((sound, index) => {
      if (sound?.isLoaded()) sound.setVolume(desiredVolumes[index] ?? 0, 0.1);
    });
  }

  function playRandomNote() {
    unlock();
    if (!sounds.notes.length) return;

    let noteIndex = Math.floor(sketch.random(sounds.notes.length));
    if (sounds.notes.length > 1 && noteIndex === lastNoteIndex) {
      noteIndex = (noteIndex + 1 + Math.floor(
        sketch.random(sounds.notes.length - 1),
      )) % sounds.notes.length;
    }
    lastNoteIndex = noteIndex;

    const note = sounds.notes[noteIndex];
    if (!note?.isLoaded()) return;
    note.setVolume(CONFIG.noteSoundVolume);
    note.play();
  }

  function playVictimRestore() {
    unlock();
    if (!sounds.victimRestore?.isLoaded()) return;
    sounds.victimRestore.setVolume(CONFIG.victimSoundVolume);
    sounds.victimRestore.play();
  }

  function setButtonState(isPlaying) {
    playButton.html(isPlaying ? "■" : "▶");
    playButton.attribute(
      "aria-label",
      isPlaying ? "Stop melody and timer" : "Play melody and timer",
    );
  }

  function stopComposition() {
    sounds.melody?.stop();
    sounds.timer?.stop();
    compositionPlaying = false;
    setButtonState(false);
  }

  function toggleComposition() {
    unlock();
    if (compositionPlaying) {
      stopComposition();
      return;
    }
    if (!sounds.melody?.isLoaded() || !sounds.timer?.isLoaded()) return;

    sounds.melody.setVolume(CONFIG.melodyVolume);
    sounds.timer.setVolume(CONFIG.timerVolume);
    sounds.melody.loop();
    sounds.timer.loop();
    compositionPlaying = true;
    setButtonState(true);
  }

  playButton.mousePressed(toggleComposition);
  return {
    unlock,
    updateHover,
    playRandomNote,
    playVictimRestore,
  };
}

function getGridMetrics(sketch) {
  const left = sketch.width * 0.0425;
  const right = sketch.width * 0.0425;
  const top = sketch.height * 0.02;
  const bottom = sketch.height * 0.04;

  return {
    left,
    right,
    top,
    bottom,
    columnWidth: (sketch.width - left - right) / 24,
    rowHeight: (sketch.height - top - bottom) / 12,
  };
}

function gridX(grid, line) {
  return grid.left + (line - 1) * grid.columnWidth;
}

function gridY(grid, line) {
  return grid.top + (line - 1) * grid.rowHeight;
}

function getHeadlineSize(sketch) {
  if (sketch.width <= 700) return clamp(sketch.width * 0.12, 42, 78);
  return clamp(sketch.width * 0.07, 54, 128);
}

function configureHeadline(sketch, size, alignment) {
  sketch.textFont("Helvetica");
  sketch.textStyle(sketch.BOLD);
  sketch.textSize(size);
  sketch.textLeading(size * 0.86);
  sketch.textAlign(alignment === "right" ? sketch.RIGHT : sketch.LEFT, sketch.TOP);
}

function drawScriptQuestion(sketch, normalText, x, y, size, alignment) {
  sketch.push();
  sketch.textFont("Helvetica");
  sketch.textStyle(sketch.BOLD);
  sketch.textSize(size);
  sketch.textAlign(alignment === "right" ? sketch.RIGHT : sketch.LEFT, sketch.TOP);

  const normalWidth = sketch.textWidth(normalText);
  const normalX = alignment === "right" ? x : x + size * 2.1;
  sketch.text(normalText, normalX, y);

  sketch.textFont("Mea Culpa");
  sketch.textStyle(sketch.NORMAL);
  sketch.textSize(size * 1.6);
  sketch.textAlign(sketch.LEFT, sketch.BASELINE);
  const scriptX = alignment === "right"
    ? x - normalWidth - size * 1.72
    : x - size * 0.1;
  // Mea Culpa has a very tall ascender. This lower baseline keeps W inside
  // its own grid row instead of crossing the sans-serif lines above it.
  sketch.text("W", scriptX, y + size * 1.2);
  sketch.pop();
}

function drawMeCluster(sketch, placement, grid, size) {
  const [column, row, alignment, vertical] = placement;
  const x = gridX(grid, column);
  const lineHeight = size * 0.86;
  const clusterHeight = lineHeight * 2 + size * 0.72;
  const anchorY = gridY(grid, row);
  const y = vertical === "bottom" ? anchorY - clusterHeight : anchorY;

  configureHeadline(sketch, size, alignment);
  sketch.text("IF NOT ME,", x, y);

  const secondY = y + lineHeight + size * 0.24;
  if (alignment === "right") {
    drawScriptQuestion(sketch, "HO?", x, secondY, size, alignment);
  } else {
    drawScriptQuestion(sketch, "HO?", x + size * 1.15, secondY, size, alignment);
  }
}

function drawNowCluster(sketch, placement, grid, size) {
  const [column, row, alignment, vertical] = placement;
  const x = gridX(grid, column);
  const lineHeight = size * 0.86;
  const bottomSafety = size * 0.82;
  const clusterHeight = lineHeight * 3 + bottomSafety;
  const anchorY = gridY(grid, row);
  const y = vertical === "bottom" ? anchorY - clusterHeight : anchorY;

  configureHeadline(sketch, size, alignment);
  sketch.text("IF NOT", x, y);
  sketch.text("NOW,", x, y + lineHeight);
  drawScriptQuestion(sketch, "HEN?", x, y + lineHeight * 2, size, alignment);
}

function drawCta(sketch, placement, grid) {
  const [column, row, alignment, vertical] = placement;
  const x = gridX(grid, column);
  const size = sketch.width <= 700 ? 12 : clamp(sketch.width * 0.012, 13, 24);
  const leading = size * 1.35;
  const totalHeight = leading * 3;
  const anchorY = gridY(grid, row);
  const y = vertical === "bottom" ? anchorY - totalHeight : anchorY;

  sketch.textFont("Helvetica");
  sketch.textStyle(sketch.NORMAL);
  sketch.textSize(size);
  sketch.textLeading(leading);
  sketch.textAlign(alignment === "right" ? sketch.RIGHT : sketch.LEFT, sketch.TOP);
  sketch.text("Master the 5Ds of Bystander Intervention", x, y);
  sketch.text("today to help end violence against women", x, y + leading);
  sketch.text("and build safer spaces for everyone.", x, y + leading * 2);
}

function drawBackgroundText(sketch, theme, layout) {
  sketch.background(theme.backgroundColor);
  sketch.fill(theme.textColor);
  sketch.noStroke();

  const grid = getGridMetrics(sketch);
  const headlineSize = getHeadlineSize(sketch);
  drawMeCluster(sketch, layout.me, grid, headlineSize);
  drawNowCluster(sketch, layout.now, grid, headlineSize);
  drawCta(sketch, layout.cta, grid);
}

function createBugParticle(sketch, target, imageCount) {
  const spread = Math.max(Math.min(sketch.width, sketch.height) * 0.55, 220);
  return {
    startX: target.x + sketch.random(-spread * 0.9, spread * 0.9),
    startY: target.y + sketch.random(-spread * 0.75, spread * 0.45),
    phase: sketch.random(sketch.TWO_PI),
    frequency: sketch.random(1.4, 3.2),
    noise: sketch.random(0.25, 0.6) * spread,
    size: Math.max(Math.min(sketch.width, sketch.height) * 0.035, 18)
      * sketch.random(0.7, 1.25),
    rotation: sketch.random(-sketch.PI, sketch.PI),
    imageIndex: Math.floor(sketch.random(imageCount)),
  };
}

function drawBugSwarm(sketch, bugImages, state, projector, delta) {
  if (!state || !projector) return state;
  const target = projector(state.anchor);
  if (!target) return state;

  if (!state.particles.length) {
    const particleCount = Math.floor(
      sketch.random(
        CONFIG.bugParticleCountMin,
        CONFIG.bugParticleCountMax + 1,
      ),
    );
    state.particles = Array.from(
      { length: particleCount },
      () => createBugParticle(sketch, target, bugImages.length),
    );
  }

  state.elapsed += delta;
  const rawProgress = clamp(state.elapsed / CONFIG.bugFlightDuration, 0, 1);
  const progress = easeInOutCubic(rawProgress);
  const remaining = 1 - progress;

  sketch.imageMode(sketch.CENTER);
  for (const particle of state.particles) {
    const time = state.elapsed * particle.frequency + particle.phase;
    const offsetX = Math.sin(time * 1.7) * particle.noise * remaining;
    const offsetY = Math.cos(time * 2.1) * 0.65 * particle.noise * remaining;
    const x = sketch.lerp(particle.startX, target.x, progress) + offsetX;
    const y = sketch.lerp(particle.startY, target.y, progress) + offsetY;

    particle.rotation += delta * 0.8;
    sketch.push();
    sketch.translate(x, y);
    sketch.rotate(particle.rotation);
    sketch.tint(255, Math.min(255, remaining * 1020));
    const bugImage = bugImages[particle.imageIndex];
    if (bugImage?.width) {
      sketch.image(bugImage, 0, 0, particle.size, particle.size);
    }
    sketch.pop();
  }
  sketch.noTint();

  if (rawProgress < 1) return state;
  state.onLand?.();
  return null;
}

function drawWaterRipple(sketch, effect, projector, delta) {
  if (!projector) return true;
  const target = projector(effect.anchor);
  if (!target) return false;

  effect.elapsed += delta;
  const color = sketch.color(CONFIG.flowerRippleColor);
  const maxWidth = Math.min(sketch.width, sketch.height)
    * 0.24
    * (CONFIG.flowerRippleMaxSize / 1.8);
  const ringScales = [0.12, 0.19, 0.27, 0.36, 0.47, 0.59, 0.71, 0.84, 1];
  let finished = true;

  for (let wave = 0; wave < CONFIG.flowerRippleCount; wave += 1) {
    const delay = wave * CONFIG.flowerRippleStagger;
    const progress = clamp(
      (effect.elapsed - delay) / CONFIG.flowerRippleDuration,
      0,
      1,
    );
    if (effect.elapsed < delay || progress >= 1) continue;
    finished = false;

    const expansion = easeOutCubic(progress);
    const opacity = Math.sin(Math.PI * progress) * CONFIG.flowerRippleOpacity;
    const width = sketch.lerp(10, maxWidth, expansion);

    sketch.push();
    sketch.noFill();
    sketch.drawingContext.globalCompositeOperation = "lighter";
    sketch.drawingContext.shadowColor = CONFIG.flowerRippleColor;
    sketch.drawingContext.shadowBlur = 10;
    ringScales.forEach((scale, index) => {
      const alpha = opacity * 255 * (1 - index * 0.065);
      color.setAlpha(alpha);
      sketch.stroke(color);
      sketch.strokeWeight(index % 2 === 0 ? 2.2 : 1.15);
      sketch.ellipse(
        target.x,
        target.y,
        width * scale,
        width * scale * CONFIG.flowerRippleAspect,
      );
    });
    sketch.pop();
  }

  return finished;
}

export function startP5Sketch() {
  const theme = createTheme();
  const layout = randomItem(GRID_LAYOUTS);
  let projector = null;
  let flowerTargets = [];
  let bugState = null;
  let audioController = null;
  const rippleEffects = [];

  const effects = {
    setProjector(nextProjector) {
      projector = nextProjector;
    },
    setFlowerTargets(nextTargets) {
      flowerTargets = nextTargets;
    },
    launchBug(anchor, onLand) {
      bugState = { anchor, onLand, elapsed: 0, particles: [] };
    },
    launchRipple(anchor) {
      rippleEffects.push({ anchor, elapsed: 0 });
    },
    playFlowerNote() {
      audioController?.playRandomNote();
    },
    playVictimRestore() {
      audioController?.playVictimRestore();
    },
  };

  new window.p5((sketch) => {
    sketch.setup = () => {
      const canvas = sketch.createCanvas(window.innerWidth, window.innerHeight);
      canvas.id("p5-background");
      canvas.elt.setAttribute(
        "aria-label",
        "If not me, who? If not now, when? Master the 5Ds of Bystander Intervention.",
      );
      sketch.pixelDensity(Math.min(window.devicePixelRatio, 2));
      sketch.noLoop();
    };

    sketch.draw = () => drawBackgroundText(sketch, theme, layout);

    sketch.windowResized = () => {
      sketch.resizeCanvas(window.innerWidth, window.innerHeight);
      sketch.redraw();
    };
  });

  // HANDOFF NOTE: Using two p5 canvases is intentional.
  // The background canvas sits below the GLB; this canvas sits above it and
  // handles bugs, ripples, and pointer input.
  new window.p5((sketch) => {
    let bugImages = [];
    let sounds;
    let pointerDown = null;
    let pointerMoved = false;

    sketch.preload = () => {
      bugImages = CONFIG.bugTextureUrls.map((url) =>
        sketch.loadImage(
          url,
          undefined,
          () => console.warn(`Không tải được ${url}, bỏ qua hình particle.`),
        ),
      );
      sounds = loadP5Sounds(sketch);
    };

    sketch.setup = () => {
      const canvas = sketch.createCanvas(window.innerWidth, window.innerHeight);
      canvas.id("p5-overlay");
      sketch.pixelDensity(Math.min(window.devicePixelRatio, 2));
      sketch.clear();

      const playButton = sketch.createButton("▶");
      playButton.id("sound-play-button");
      playButton.attribute("aria-label", "Play melody and timer");
      playButton.attribute("title", "Play melody and timer");
      audioController = createP5AudioController(sketch, sounds, playButton);
    };

    sketch.draw = () => {
      sketch.clear();
      const delta = Math.min(sketch.deltaTime / 1000, 0.1);
      // NOTE: p5 is the only animation clock; Three receives delta time here.
      updateThreeScene(delta);
      bugState = drawBugSwarm(sketch, bugImages, bugState, projector, delta);

      const projectedTargets = projector
        ? flowerTargets
          .filter(({ state }) => state.phase === "idle" && !state.isBugTarget)
          .map(({ anchor, index }) => ({
            ...projector(anchor),
            index,
          }))
        : [];
      audioController?.updateHover(
        {
          x: sketch.mouseX,
          y: sketch.mouseY,
          inside:
            sketch.mouseX >= 0 &&
            sketch.mouseX <= sketch.width &&
            sketch.mouseY >= 0 &&
            sketch.mouseY <= sketch.height,
        },
        projectedTargets,
        { width: sketch.width, height: sketch.height },
      );

      for (let index = rippleEffects.length - 1; index >= 0; index -= 1) {
        if (drawWaterRipple(sketch, rippleEffects[index], projector, delta)) {
          rippleEffects.splice(index, 1);
        }
      }
    };

    sketch.windowResized = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      sketch.resizeCanvas(width, height);
      resizeThreeScene(width, height);
    };

    sketch.mousePressed = () => {
      if (sketch.mouseButton !== sketch.LEFT) return;
      audioController?.unlock();
      pointerDown = { x: sketch.mouseX, y: sketch.mouseY };
      pointerMoved = false;
    };

    sketch.mouseDragged = () => {
      if (!pointerDown) return;
      const movement = Math.hypot(
        sketch.mouseX - pointerDown.x,
        sketch.mouseY - pointerDown.y,
      );
      if (movement > 6) pointerMoved = true;
    };

    sketch.mouseReleased = () => {
      if (pointerDown && !pointerMoved) {
        triggerFlowerAtScreen(sketch.mouseX, sketch.mouseY);
      }
      pointerDown = null;
      pointerMoved = false;
    };
  });
  return effects;
}
