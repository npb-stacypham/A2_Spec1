import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { CONFIG } from "./config.js?v=20260820-6";

// HANDOFF NOTE: This file intentionally keeps only features that depend on
// actual 3D data: GLBs, skeleton animation, material slots, raycasting, and
// the stem trail geometry.
const loader = new GLTFLoader();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const flowerStates = [];
const clickMeshes = [];
const activeBlooms = new Set();
const projectedWorldPosition = new THREE.Vector3();

let renderer;
let scene;
let camera;
let modelRoot;
let ringGroup;
let p5Effects;
let interactionEnabled = false;
let completionAnnounced = false;
let sceneTime = 0;

export function initThreeScene(effects) {
  p5Effects = effects;
  createRenderer();
  createScene();
  createCamera();
  createLights();
  createModelGroups();
  p5Effects?.setProjector(projectObjectToScreen);
  loadModels();
}

function createRenderer() {
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.domElement.id = "three-canvas";
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = false;
  document.body.prepend(renderer.domElement);
}

function createScene() {
  scene = new THREE.Scene();
  scene.background = null;
  renderer.setClearColor(0x000000, 0);
}

function createCamera() {
  camera = new THREE.PerspectiveCamera(
    40,
    window.innerWidth / window.innerHeight,
    0.01,
    1000,
  );
  camera.position.set(4, 2.8, 7);
  camera.lookAt(0, 1, 0);
}

function createLights() {
  scene.add(new THREE.HemisphereLight(0xfff8ec, 0x59636d, 2.2));

  const keyLight = new THREE.DirectionalLight(0xffffff, 3.5);
  keyLight.position.set(4, 7, 5);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0xbcd9ff, 1.6);
  rimLight.position.set(-5, 3, -4);
  scene.add(rimLight);
}

function createModelGroups() {
  modelRoot = new THREE.Group();
  scene.add(modelRoot);

  ringGroup = new THREE.Group();
  modelRoot.add(ringGroup);
}

function loadGLB(url, label) {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        gltf.scene.name = label;
        gltf.scene.traverse((object) => {
          if (!object.isMesh) return;
          object.castShadow = false;
          object.receiveShadow = false;
        });
        resolve(gltf);
      },
      undefined,
      (error) => reject(new Error(`Không tải được ${label}: ${error.message}`)),
    );
  });
}

function cloneMeshMaterials(root) {
  root.traverse((object) => {
    if (!object.isMesh) return;

    object.material = Array.isArray(object.material)
      ? object.material.map((material) => material.clone())
      : object.material.clone();
    object.castShadow = false;
    object.receiveShadow = false;
  });
}

function getMaterials(mesh) {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function prepareFlowerState(instance, holder, clip, index) {
  cloneMeshMaterials(instance);

  const state = {
    index,
    instance,
    holder,
    phase: "idle",
    trigger: null,
    elapsed: 0,
    duration: clip.duration,
    outerMeshes: [],
    stemMeshes: [],
    smallLaceTemplate: null,
    outerMaterialTransitions: [],
    stemTransitions: [],
    flowerMotion: null,
    stemTrails: [],
    bugDarkenedMaterials: [],
    bugBrightnessTransition: null,
    isBugTarget: false,
    anchor: null,
    mixer: new THREE.AnimationMixer(instance),
    action: null,
  };

  instance.traverse((object) => {
    if (object.name.toLowerCase() === "pearl") state.anchor = object;
    if (!object.isMesh) return;

    const objectName = object.name.toLowerCase().replaceAll("_", " ");
    const materials = getMaterials(object);
    const materialNames = materials.map((material) => material.name.toLowerCase());
    const hasMaterial = (name) => materialNames.includes(name);
    const isSmallLaceSlot = hasMaterial("small lace");
    const isStemGlowSlot = hasMaterial("stem glow");

    object.userData.flowerState = state;

    // These primitives are helper triangles used only to retain GLB material slots.
    if (isSmallLaceSlot) {
      state.smallLaceTemplate = materials.find(
        (material) => material.name.toLowerCase() === "small lace",
      );
      object.visible = false;
      return;
    }

    if (isStemGlowSlot) {
      object.visible = false;
      return;
    }

    clickMeshes.push(object);

    if (hasMaterial("outer pedal") || objectName === "outer pedal") {
      state.outerMeshes.push(object);
    }

    if (hasMaterial("stem")) {
      state.stemMeshes.push(object);
    }
  });

  if (!state.smallLaceTemplate) {
    throw new Error("Không tìm thấy material slot 'small lace' trong victim flower.glb.");
  }
  state.action = state.mixer.clipAction(clip);
  state.action.setLoop(THREE.LoopOnce, 1);
  state.action.clampWhenFinished = true;
  state.action.play();
  state.mixer.update(0);
  state.action.paused = true;

  prepareFlowerVerticalMotion(state);

  if (!state.anchor) state.anchor = instance;
  return state;
}

function createCircularLayout(laceGLTF, victimGLTF) {
  const lace = laceGLTF.scene;
  modelRoot.add(lace);

  const laceBox = new THREE.Box3().setFromObject(lace);
  const laceCenter = laceBox.getCenter(new THREE.Vector3());
  const laceSize = laceBox.getSize(new THREE.Vector3());
  lace.position.x -= laceCenter.x;
  lace.position.y -= laceBox.min.y;
  lace.position.z -= laceCenter.z;
  lace.updateMatrixWorld(true);

  ringGroup.position.set(0, laceSize.y * CONFIG.ringHeight, 0);

  const clip = victimGLTF.animations[0];
  if (!clip) throw new Error("victim flower.glb không có animation clip.");

  for (let index = 0; index < CONFIG.instanceCount; index += 1) {
    const angle = (index / CONFIG.instanceCount) * Math.PI * 2;
    const holder = new THREE.Group();
    const instance = cloneSkeleton(victimGLTF.scene);

    holder.add(instance);
    holder.rotation.y = angle;
    ringGroup.add(holder);
    const state = prepareFlowerState(instance, holder, clip, index);
    flowerStates.push(state);
    createStemTrails(state);
  }

  p5Effects?.setFlowerTargets(
    flowerStates.map((state) => ({
      anchor: state.anchor,
      index: state.index,
      state,
    })),
  );
}

function fitModelsToView() {
  modelRoot.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(modelRoot);

  if (box.isEmpty()) return 1;

  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxSize = Math.max(size.x, size.y, size.z);
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const fitHeightDistance = maxSize / (2 * Math.tan(fov / 2));
  const fitWidthDistance = fitHeightDistance / camera.aspect;
  const distance = CONFIG.cameraFit * Math.max(fitHeightDistance, fitWidthDistance);

  camera.position.set(
    center.x,
    center.y + distance * CONFIG.cameraElevation,
    center.z + distance,
  );
  camera.near = Math.max(distance / 1000, 0.01);
  camera.far = distance * 100;
  camera.updateProjectionMatrix();
  camera.lookAt(center);

  return maxSize;
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function prepareFlowerVerticalMotion(state) {
  state.flowerMotion = {
    amplitude: randomBetween(
      CONFIG.flowerVerticalSwingMin,
      CONFIG.flowerVerticalSwingMax,
    ),
    speed: randomBetween(
      CONFIG.flowerVerticalSpeedMin,
      CONFIG.flowerVerticalSpeedMax,
    ),
    phase: Math.random() * Math.PI * 2,
    baseRotationZ: state.holder.rotation.z,
  };
}

function createStemTrailMaterial(material) {
  return new THREE.MeshBasicMaterial({
    color: CONFIG.stemTrailColor,
    side: material.side,
    transparent: true,
    opacity: CONFIG.stemTrailOpacity,
    depthWrite: false,
    toneMapped: false,
  });
}

function createStemTrails(state) {
  // HANDOFF NOTE: Trails must remain in Three because every frame needs the
  // stem's actual matrixWorld and geometry. p5 could only draw a 2D line and
  // could not accurately follow the mesh or skeletal deformation.
  const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

  state.stemTrails = state.stemMeshes.map((mesh) => {
    const trailMaterial = createStemTrailMaterial(getMaterials(mesh)[0]);
    const trailMesh = new THREE.InstancedMesh(
      mesh.geometry,
      trailMaterial,
      CONFIG.stemTrailCount,
    );

    trailMesh.name = `${mesh.name} synchronized motion trail`;
    trailMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    trailMesh.frustumCulled = false;
    trailMesh.renderOrder = mesh.renderOrder - 1;
    for (let index = 0; index < CONFIG.stemTrailCount; index += 1) {
      trailMesh.setMatrixAt(index, hiddenMatrix);
    }
    trailMesh.instanceMatrix.needsUpdate = true;
    scene.add(trailMesh);

    return {
      mesh,
      trailMesh,
      history: [],
    };
  });
}

function getTrailHistoryMatrix(history, targetTime) {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index].time <= targetTime) return history[index].matrix;
  }
  return null;
}

function updateStemTrails() {
  scene.updateMatrixWorld(true);
  const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

  for (const state of flowerStates) {
    for (const trail of state.stemTrails) {
      trail.history.push({
        time: sceneTime,
        matrix: trail.mesh.matrixWorld.clone(),
      });

      const oldestNeededTime = sceneTime - CONFIG.stemTrailDuration - 0.1;
      while (
        trail.history.length > 2 &&
        trail.history[1].time < oldestNeededTime
      ) {
        trail.history.shift();
      }

      for (let index = 0; index < CONFIG.stemTrailCount; index += 1) {
        const delay =
          (CONFIG.stemTrailDuration * (index + 1)) / CONFIG.stemTrailCount;
        const historicalMatrix = getTrailHistoryMatrix(
          trail.history,
          sceneTime - delay,
        );
        trail.trailMesh.setMatrixAt(
          index,
          historicalMatrix ?? hiddenMatrix,
        );
      }
      trail.trailMesh.instanceMatrix.needsUpdate = true;
    }
  }
}

function updateFlowerVerticalMotion() {
  for (const state of flowerStates) {
    const motion = state.flowerMotion;
    if (!motion) continue;

    const wave = Math.sin(sceneTime * motion.speed + motion.phase);
    state.holder.rotation.z = motion.baseRotationZ + motion.amplitude * wave;
  }
}

function beginOuterPedalCrossfade(state) {
  // HANDOFF NOTE: This crossfade directly modifies GLB material slots, so it
  // is one of the features that cannot be moved to p5.js.
  state.outerMaterialTransitions = state.outerMeshes.map((mesh) => {
    const sourceMaterials = getMaterials(mesh);
    const sourceStates = sourceMaterials.map((material) => ({
      material,
      opacity: material.opacity,
      transparent: material.transparent,
      depthWrite: material.depthWrite,
    }));

    for (const { material } of sourceStates) {
      material.transparent = true;
      material.depthWrite = false;
      material.needsUpdate = true;
    }

    const targetMaterial = state.smallLaceTemplate.clone();
    const targetState = {
      opacity: targetMaterial.opacity,
      transparent: targetMaterial.transparent,
      depthWrite: targetMaterial.depthWrite,
    };
    targetMaterial.name = "small lace";
    targetMaterial.opacity = 0;
    targetMaterial.transparent = true;
    targetMaterial.depthWrite = false;
    targetMaterial.needsUpdate = true;

    const sourceUserData = mesh.userData;
    let overlay;
    mesh.userData = {};
    try {
      overlay = mesh.clone(false);
    } finally {
      mesh.userData = sourceUserData;
    }
    overlay.name = `${mesh.name} small lace crossfade`;
    overlay.material = targetMaterial;
    overlay.userData = {};
    overlay.renderOrder = mesh.renderOrder + 1;
    mesh.parent.add(overlay);

    return {
      mesh,
      overlay,
      sourceStates,
      targetMaterial,
      targetState,
      finished: false,
    };
  });
}

function syncCrossfadeOverlay(transition) {
  const { mesh, overlay } = transition;
  overlay.position.copy(mesh.position);
  overlay.quaternion.copy(mesh.quaternion);
  overlay.scale.copy(mesh.scale);

  if (mesh.morphTargetInfluences && overlay.morphTargetInfluences) {
    overlay.morphTargetInfluences.splice(
      0,
      overlay.morphTargetInfluences.length,
      ...mesh.morphTargetInfluences,
    );
  }
}

function finishOuterPedalCrossfade(transition) {
  if (transition.finished) return;

  const { mesh, overlay, sourceStates, targetMaterial, targetState } = transition;
  for (const sourceState of sourceStates) {
    sourceState.material.opacity = sourceState.opacity;
    sourceState.material.transparent = sourceState.transparent;
    sourceState.material.depthWrite = sourceState.depthWrite;
    sourceState.material.needsUpdate = true;
  }

  targetMaterial.opacity = targetState.opacity;
  targetMaterial.transparent = targetState.transparent;
  targetMaterial.depthWrite = targetState.depthWrite;
  targetMaterial.needsUpdate = true;
  mesh.material = targetMaterial;
  overlay.parent?.remove(overlay);
  transition.finished = true;
}

function updateOuterPedalCrossfade(state) {
  const progress = Math.min(
    state.elapsed / CONFIG.materialCrossfadeDuration,
    1,
  );
  const easedProgress = THREE.MathUtils.smoothstep(progress, 0, 1);

  for (const transition of state.outerMaterialTransitions) {
    if (transition.finished) continue;
    syncCrossfadeOverlay(transition);

    for (const sourceState of transition.sourceStates) {
      sourceState.material.opacity = THREE.MathUtils.lerp(
        sourceState.opacity,
        0,
        easedProgress,
      );
    }
    transition.targetMaterial.opacity = THREE.MathUtils.lerp(
      0,
      transition.targetState.opacity,
      easedProgress,
    );

    if (progress >= 1) finishOuterPedalCrossfade(transition);
  }
}

function beginBugFlowerDarkenFade(state) {
  const processedMaterials = new Set();
  state.bugDarkenedMaterials = [];
  const transitions = [];

  state.instance.traverse((object) => {
    if (
      !object.isMesh ||
      !object.visible ||
      state.stemMeshes.includes(object)
    ) {
      return;
    }

    for (const material of getMaterials(object)) {
      if (processedMaterials.has(material) || !material.color) continue;
      processedMaterials.add(material);
      state.bugDarkenedMaterials.push({
        material,
        originalColor: material.color.clone(),
      });
      transitions.push({
        material,
        startColor: material.color.clone(),
        targetColor: material.color
          .clone()
          .multiplyScalar(CONFIG.bugDarkenFactor),
      });
    }
  });

  state.bugBrightnessTransition = {
    elapsed: 0,
    duration: CONFIG.bugDarkenFadeDuration,
    transitions,
    restore: false,
  };
}

function beginBugFlowerBrightnessRestore() {
  const bugFlower = flowerStates.find((state) => state.trigger === "bug");
  if (!bugFlower) return;

  p5Effects?.playVictimRestore();

  bugFlower.bugBrightnessTransition = {
    elapsed: 0,
    duration: CONFIG.bugRestoreFadeDuration,
    transitions: bugFlower.bugDarkenedMaterials.map(
      ({ material, originalColor }) => ({
        material,
        startColor: material.color.clone(),
        targetColor: originalColor.clone(),
      }),
    ),
    restore: true,
  };
}

function updateBugFlowerBrightnessFades(delta) {
  for (const state of flowerStates) {
    const fade = state.bugBrightnessTransition;
    if (!fade) continue;

    fade.elapsed += delta;
    const progress = Math.min(fade.elapsed / fade.duration, 1);
    const easedProgress = THREE.MathUtils.smoothstep(progress, 0, 1);

    for (const transition of fade.transitions) {
      transition.material.color.lerpColors(
        transition.startColor,
        transition.targetColor,
        easedProgress,
      );
      transition.material.needsUpdate = true;
    }

    if (progress < 1) continue;

    state.bugBrightnessTransition = null;
    if (fade.restore) state.bugDarkenedMaterials = [];
  }
}

function beginStemColorFade(state) {
  const stemColor = new THREE.Color(CONFIG.stemColor);

  state.stemTransitions = state.stemMeshes.flatMap((mesh) =>
    getMaterials(mesh).map((material) => {
      return {
        material,
        startColor: material.color?.clone(),
        targetColor: stemColor.clone(),
      };
    }),
  );
}

function updateStemColorFade(state, progress) {
  const easedProgress = THREE.MathUtils.smoothstep(progress, 0, 1);

  for (const transition of state.stemTransitions) {
    const { material, targetColor } = transition;

    if (material.color && transition.startColor) {
      material.color.lerpColors(
        transition.startColor,
        targetColor,
        easedProgress,
      );
    }
    material.emissive?.set(0x000000);
    material.emissiveIntensity = 0;
    material.needsUpdate = true;
  }
}

function bloomFlower(state, trigger) {
  if (!state || state.phase !== "idle") return;

  state.phase = "blooming";
  state.trigger = trigger;
  state.elapsed = 0;
  state.action.reset();
  state.action.setLoop(THREE.LoopOnce, 1);
  state.action.clampWhenFinished = true;
  state.action.play();

  if (trigger === "bug") {
    beginOuterPedalCrossfade(state);
    beginBugFlowerDarkenFade(state);
  }
  if (trigger === "user") {
    beginStemColorFade(state);
    p5Effects?.launchRipple(state.anchor);
    p5Effects?.playFlowerNote();
  }

  activeBlooms.add(state);
}

function updateBlooms(delta) {
  for (const state of [...activeBlooms]) {
    state.elapsed += delta;
    state.mixer.update(delta);

    const progress = Math.min(state.elapsed / state.duration, 1);
    if (state.trigger === "user") updateStemColorFade(state, progress);
    if (state.trigger === "bug") updateOuterPedalCrossfade(state);

    if (progress < 1) continue;

    state.phase = "bloomed";
    activeBlooms.delete(state);
  }

  if (
    !completionAnnounced &&
    flowerStates.length > 0 &&
    flowerStates.every((state) => state.phase === "bloomed")
  ) {
    completionAnnounced = true;
    beginBugFlowerBrightnessRestore();
    interactionEnabled = false;
  }
}

function launchBugSwarm() {
  const targetState = flowerStates[Math.floor(Math.random() * flowerStates.length)];
  targetState.isBugTarget = true;
  const onLand = () => {
    bloomFlower(targetState, "bug");
    interactionEnabled = true;
  };

  if (p5Effects?.launchBug) {
    p5Effects.launchBug(targetState.anchor, onLand);
  } else {
    onLand();
  }
}

function projectObjectToScreen(object) {
  if (!renderer || !camera || !object) return null;

  object.getWorldPosition(projectedWorldPosition);
  projectedWorldPosition.project(camera);
  const rect = renderer.domElement.getBoundingClientRect();

  return {
    x: (projectedWorldPosition.x * 0.5 + 0.5) * rect.width + rect.left,
    y: (-projectedWorldPosition.y * 0.5 + 0.5) * rect.height + rect.top,
    visible:
      projectedWorldPosition.z >= -1 && projectedWorldPosition.z <= 1,
  };
}

export function triggerFlowerAtScreen(screenX, screenY) {
  if (!interactionEnabled || !renderer || !camera) return false;

  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((screenX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((screenY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  const hit = raycaster
    .intersectObjects(clickMeshes, false)
    .find((intersection) => intersection.object.userData.flowerState?.phase === "idle");

  let selectedState = hit?.object.userData.flowerState;
  if (!selectedState) {
    const pickRadius = Math.max(42, Math.min(rect.width, rect.height) * 0.055);
    let nearestDistance = pickRadius;

    for (const state of flowerStates) {
      if (state.phase !== "idle") continue;
      const screenPosition = projectObjectToScreen(state.anchor);
      const distance = Math.hypot(
        screenPosition.x - screenX,
        screenPosition.y - screenY,
      );
      if (distance >= nearestDistance) continue;
      nearestDistance = distance;
      selectedState = state;
    }
  }

  if (!selectedState) return false;
  bloomFlower(selectedState, "user");
  return true;
}

function loadModels() {
  Promise.all([
    loadGLB(CONFIG.laceModelUrl, "lace center.glb"),
    loadGLB(CONFIG.victimModelUrl, "victim flower.glb"),
  ])
    .then(([laceGLTF, victimGLTF]) => {
      createCircularLayout(laceGLTF, victimGLTF);
      fitModelsToView();
      launchBugSwarm();
    })
    .catch((error) => {
      console.error(error);
    });
}

export function updateThreeScene(delta = 0) {
  if (!renderer || !ringGroup) return;

  // p5.deltaTime is the only clock. Clamp it again to prevent a visual jump
  // when the browser tab resumes.
  const safeDelta = Math.min(Math.max(delta, 0), 0.1);
  sceneTime += safeDelta;
  ringGroup.rotation.y += CONFIG.ringSpeed * safeDelta;
  updateBlooms(safeDelta);
  updateBugFlowerBrightnessFades(safeDelta);
  updateFlowerVerticalMotion();
  updateStemTrails();
  renderer.render(scene, camera);
}

export function resizeThreeScene(width, height) {
  if (!renderer || !camera) return;

  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
