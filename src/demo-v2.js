import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { dazGenesis8FbxMapping, mixamoFbxMapping } from "./AvatarData.js";
import { RetargetAnim } from "./RetargetAnim.js";
import { RetargetProtocol } from "./RetargetProtocol.js";

const canvas = document.querySelector("#viewport");
const ui = Object.fromEntries([...document.querySelectorAll("[id]")].map((element) => [element.id, element]));
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x05080c, 0.0017);
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 5000);
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  powerPreference: "high-performance",
});
// Évite de calculer quatre fois plus de pixels sur un écran DPR 2.
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.35));
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;

scene.add(new THREE.HemisphereLight(0x9cecff, 0x11151b, 2.2));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
keyLight.position.set(3, 5, 4);
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0x28d7e8, 3);
rimLight.position.set(-4, 2, -3);
scene.add(rimLight);
const ground = new THREE.GridHelper(1200, 60, 0x16313a, 0x10191e);
ground.material.transparent = true;
ground.material.opacity = 0.38;
scene.add(ground);

const modelUrls = import.meta.glob("../Models/*.fbx", { eager: true, import: "default", query: "?url" });
const releaseUrls = { "Mixamo.fbx": "https://github.com/JeCodeLeSoir/Retargeting/releases/download/v1.0.0/Mixamo.fbx" };
const modelUrl = (filename) => Object.entries(modelUrls).find(([path]) => path.endsWith(`/${filename}`))?.[1] ?? releaseUrls[filename] ?? null;
const definitions = {
  mixamo: { label: "Mixamo", filename: "Mixamo.fbx", mapping: mixamoFbxMapping, mappingLabel: "Mapping_Mixamo" },
  dazGenesis8: { label: "Daz Genesis 8", filename: "DazGenesis8.fbx", mapping: dazGenesis8FbxMapping, mappingLabel: "Mapping_DazGenesis8" },
};
const avatars = Object.fromEntries(Object.entries(definitions).flatMap(([key, value]) => {
  const url = modelUrl(value.filename);
  return url ? [[key, { ...value, url }]] : [];
}));

for (const select of [ui.sourceModelSelect, ui.targetModelSelect]) {
  for (const [key, avatar] of Object.entries(avatars)) {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = `${avatar.label} · ${avatar.mappingLabel}`;
    select.append(option);
  }
}
ui.sourceModelSelect.value = avatars.mixamo ? "mixamo" : Object.keys(avatars)[0] ?? "";
ui.targetModelSelect.value = avatars.dazGenesis8 ? "dazGenesis8" : Object.keys(avatars)[0] ?? "";

const timer = new THREE.Timer();
timer.connect(document);
let generation = 0;
let playing = true;
let mixer = null;
let action = null;
let retarget = null;
let runtime = [];

const loadObject = (url) => new Promise((resolve, reject) => new FBXLoader().load(url, resolve, undefined, reject));

async function loadPair() {
  const sourceAvatar = avatars[ui.sourceModelSelect.value];
  const targetAvatar = avatars[ui.targetModelSelect.value];
  if (!sourceAvatar || !targetAvatar) return;
  const current = ++generation;
  disposeRuntime();
  ui.errorPanel.hidden = true;
  ui.statusText.textContent = "Chargement des deux avatars…";
  ui.mappedCount.textContent = "—";
  ui.clipDuration.textContent = "—";
  try {
    const [sourceModel, targetModel] = await Promise.all([loadObject(sourceAvatar.url), loadObject(targetAvatar.url)]);
    if (current !== generation) {
      disposeObject(sourceModel);
      disposeObject(targetModel);
      return;
    }
    setupPair(sourceModel, targetModel, sourceAvatar, targetAvatar);
  } catch (error) {
    if (current === generation) showError(error);
  }
}

function prepareModel(model, tint) {
  model.traverse((child) => {
    if (!child.isMesh) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    const copies = materials.map((material) => {
      const copy = material.clone();
      if ("roughness" in copy) copy.roughness = 0.72;
      if ("metalness" in copy) copy.metalness = 0.02;
      copy.color?.lerp(new THREE.Color(tint), 0.08);
      return copy;
    });
    child.material = Array.isArray(child.material) ? copies : copies[0];
  });
  scene.add(model);
  return new THREE.Box3().setFromObject(model);
}

function setupPair(sourceModel, targetModel, sourceAvatar, targetAvatar) {
  const sourceBounds = prepareModel(sourceModel, 0x28d7e8);
  const targetBounds = prepareModel(targetModel, 0xff9f43);
  const sourceSize = sourceBounds.getSize(new THREE.Vector3());
  const targetSize = targetBounds.getSize(new THREE.Vector3());
  const height = Math.max(sourceSize.y, targetSize.y);
  const gap = Math.max(sourceSize.x, targetSize.x, height * 0.34);
  placeOnGround(sourceModel, sourceBounds, -gap * 0.62);
  placeOnGround(targetModel, targetBounds, gap * 0.62);
  sourceModel.updateWorldMatrix(true, true);
  targetModel.updateWorldMatrix(true, true);

  const sourceProtocol = createProtocol(sourceModel, sourceAvatar.mapping, true);
  const targetProtocol = createProtocol(targetModel, targetAvatar.mapping, false);
  retarget = new RetargetAnim({ source: sourceProtocol, target: targetProtocol });
  retarget.setForwardAngles(0, Number(ui.forwardAngle.value));
  runtime = [createRuntime(sourceModel, sourceProtocol, 0x28d7e8), createRuntime(targetModel, targetProtocol, 0xff9f43)];

  mixer = new THREE.AnimationMixer(sourceModel);
  const clip = sourceModel.animations.find((item) => item.duration > 0.01);
  if (clip) {
    action = mixer.clipAction(clip);
    action.play();
    ui.clipDuration.textContent = clip.duration.toFixed(1);
  } else {
    ui.clipDuration.textContent = "0";
  }
  ui.mappedCount.textContent = retarget.bones.length;
  ui.modeLabel.textContent = `${sourceAvatar.label} → ${targetAvatar.label}`;
  ui.modelDescription.textContent = `${retarget.bones.length} HumanBodyBones communs transfèrent la pose, la racine et la correction d’orientation.`;
  ui.statusText.textContent = "Retargeting opérationnel";
  camera.position.set(height * 1.45, height * 0.72, height * 2.15);
  controls.target.set(0, height * 0.5, 0);
  controls.minDistance = height * 0.55;
  controls.maxDistance = height * 5;
  controls.update();
  applyVisibility();
}

function placeOnGround(model, bounds, x) {
  const center = bounds.getCenter(new THREE.Vector3());
  model.position.x += x - center.x;
  model.position.y -= bounds.min.y;
  model.position.z -= center.z;
}

function createProtocol(model, mapping, inverse) {
  const protocol = new RetargetProtocol({
    source: model, humanBones: mapping, inverse,
    // Un SkeletonHelper dessine tous les Bone en une passe. Les anciennes
    // sphères produisaient environ un draw call par HumanBodyBone et par avatar.
    createMarker: () => new THREE.Bone(),
  }).init();
  scene.add(protocol.referenceRoot);
  return protocol;
}

function createRuntime(model, protocol, color) {
  const skeleton = new THREE.SkeletonHelper(model);
  skeleton.material.color.set(color);
  skeleton.material.depthTest = false;
  scene.add(skeleton);
  const reference = new THREE.SkeletonHelper(protocol.referenceRoot);
  reference.material.color.set(color);
  reference.material.depthTest = false;
  scene.add(reference);
  return { model, protocol, skeleton, reference };
}

function disposeRuntime() {
  mixer?.stopAllAction();
  mixer = null;
  action = null;
  retarget = null;
  for (const item of runtime) {
    for (const helper of [item.skeleton, item.reference]) {
      helper.removeFromParent();
      helper.geometry?.dispose();
      helper.material?.dispose();
    }
    item.protocol.dispose();
    item.protocol.referenceRoot.removeFromParent();
    item.model.removeFromParent();
    disposeObject(item.model);
  }
  runtime = [];
}

function disposeObject(root) {
  root.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry?.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!material) continue;
      for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
      material.dispose();
    }
  });
}

function showError(error) {
  console.error(error);
  ui.statusText.textContent = "Erreur de chargement";
  ui.errorPanel.hidden = false;
  ui.errorPanel.textContent = `Impossible de charger les avatars : ${error.message ?? error}`;
}

function applyVisibility() {
  for (const item of runtime) {
    item.skeleton.visible = ui.sourceSkeleton.checked;
    item.reference.visible = ui.referenceSkeleton.checked;
    item.protocol.referenceRoot.visible = ui.referenceSkeleton.checked;
    item.model.traverse((child) => { if (child.isMesh) child.visible = ui.meshVisibility.checked; });
  }
}

ui.directionButton.addEventListener("click", () => {
  const source = ui.sourceModelSelect.value;
  ui.sourceModelSelect.value = ui.targetModelSelect.value;
  ui.targetModelSelect.value = source;
  loadPair();
});
ui.sourceModelSelect.addEventListener("change", loadPair);
ui.targetModelSelect.addEventListener("change", loadPair);
ui.playButton.addEventListener("click", () => {
  playing = !playing;
  ui.playIcon.textContent = playing ? "Ⅱ" : "▶";
  ui.playLabel.textContent = playing ? "Mettre en pause" : "Reprendre";
  if (action) action.paused = !playing;
});
ui.speed.addEventListener("input", () => { ui.speedValue.textContent = `${Number(ui.speed.value).toFixed(1)}×`; });
ui.forwardAngle.addEventListener("input", () => {
  ui.forwardAngleValue.textContent = `${ui.forwardAngle.value}°`;
  retarget?.setForwardAngles(0, Number(ui.forwardAngle.value));
});
for (const input of [ui.sourceSkeleton, ui.referenceSkeleton, ui.meshVisibility]) input.addEventListener("change", applyVisibility);

function animate(timestamp) {
  requestAnimationFrame(animate);
  timer.update(timestamp);
  const delta = Math.min(timer.getDelta(), 0.05);
  if (playing) mixer?.update(delta * Number(ui.speed.value));
  retarget?.update();
  controls.update();
  renderer.render(scene, camera);
}

function resize() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();
animate();
loadPair();
