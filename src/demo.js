import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { dazGenesis8FbxMapping, mixamoFbxMapping } from "./AvatarData.js";
import { RetargetProtocol } from "./RetargetProtocol.js";

const canvas = document.querySelector("#viewport");
const ui = Object.fromEntries(
  [...document.querySelectorAll("[id]")].map((element) => [element.id, element]),
);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x05080c, 0.0017);

const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 5000);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 80;
controls.maxDistance = 900;

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

const timer = new THREE.Timer();
timer.connect(document);
let mixer;
let protocol;
let sourceSkeleton;
let referenceSkeleton;
let model;
let action;
let playing = true;
let referenceMode = false;
let demoTime = 0;
let loadGeneration = 0;

const modelUrls = import.meta.glob("../Models/*.fbx", {
  eager: true,
  import: "default",
  query: "?url",
});

const availableModelUrl = (filename) => {
  const entry = Object.entries(modelUrls).find(([path]) => path.endsWith(`/${filename}`));
  return entry?.[1] ?? null;
};

const avatarDefinitions = {
  mixamo: {
    label: "Mixamo",
    filename: "Mixamo.fbx",
    mapping: mixamoFbxMapping,
    mappingLabel: "Mapping_Mixamo",
    description: "La pose Mixamo est convertie en rotations humanoïdes grâce aux offsets du protocole Unity.",
  },
  dazGenesis8: {
    label: "Daz Genesis 8",
    filename: "DazGenesis8.fbx",
    mapping: dazGenesis8FbxMapping,
    mappingLabel: "Mapping_DazGenesis8",
    description: "Le squelette Daz Genesis 8 est associé à la même hiérarchie HumanBodyBones.",
  },
};

const avatars = Object.fromEntries(
  Object.entries(avatarDefinitions).flatMap(([key, definition]) => {
    const url = availableModelUrl(definition.filename);
    return url ? [[key, { ...definition, url }]] : [];
  }),
);

for (const [key, avatar] of Object.entries(avatars)) {
  const option = document.createElement("option");
  option.value = key;
  option.textContent = `${avatar.label} · ${avatar.mappingLabel}`;
  ui.modelSelect.append(option);
}

function loadAvatar(key) {
  const avatar = avatars[key];
  if (!avatar) return;
  const generation = ++loadGeneration;
  disposeCurrentAvatar();
  resetLoadingUi(avatar);

  new FBXLoader().load(
    avatar.url,
    (object) => {
      if (generation !== loadGeneration) {
        disposeObject(object);
        return;
      }
      setupModel(object, avatar);
    },
    ({ loaded, total }) => {
      if (generation === loadGeneration && total) {
        ui.statusText.textContent = `Chargement ${Math.round((loaded / total) * 100)} %`;
      }
    },
    (error) => generation === loadGeneration && showError(error, avatar),
  );
}

function setupModel(object, avatar) {
  model = object;
  scene.add(model);

  model.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      const cloned = materials.map((material) => {
        const copy = material.clone();
        if ("roughness" in copy) copy.roughness = 0.72;
        if ("metalness" in copy) copy.metalness = 0.02;
        return copy;
      });
      child.material = Array.isArray(child.material) ? cloned : cloned[0];
    }
  });

  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const height = size.y;
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= bounds.min.y;
  model.updateWorldMatrix(true, true);

  ground.position.y = 0;
  camera.position.set(height * 1.05, height * 0.62, height * 1.75);
  controls.target.set(0, height * 0.5, 0);
  controls.minDistance = height * 0.45;
  controls.maxDistance = height * 4;
  controls.update();

  sourceSkeleton = new THREE.SkeletonHelper(model);
  sourceSkeleton.material.color.set(0x28d7e8);
  sourceSkeleton.material.depthTest = false;
  sourceSkeleton.renderOrder = 3;
  scene.add(sourceSkeleton);

  const markerGeometry = new THREE.SphereGeometry(height * 0.006, 10, 7);
  const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff9f43, depthTest: false });
  protocol = new RetargetProtocol({
    source: model,
    humanBones: avatar.mapping,
    inverse: true,
    createMarker: () => new THREE.Mesh(markerGeometry, markerMaterial),
  }).init();
  scene.add(protocol.referenceRoot);

  referenceSkeleton = new THREE.SkeletonHelper(protocol.referenceRoot);
  referenceSkeleton.material.color.set(0xff9f43);
  referenceSkeleton.material.depthTest = false;
  referenceSkeleton.renderOrder = 4;
  scene.add(referenceSkeleton);

  mixer = new THREE.AnimationMixer(model);
  const clip = model.animations.find((item) => item.duration > 0.01);
  if (clip) {
    action = mixer.clipAction(clip);
    action.play();
    ui.clipDuration.textContent = clip.duration.toFixed(1);
  } else {
    ui.clipDuration.textContent = "0";
  }

  ui.mappedCount.textContent = protocol.bones.length;
  ui.statusText.textContent = "Système opérationnel";
  document.querySelector(".status-dot").style.background = "#28d7e8";
}

function resetLoadingUi(avatar) {
  ui.statusText.textContent = `Chargement de ${avatar.label}…`;
  ui.mappedCount.textContent = "—";
  ui.clipDuration.textContent = "—";
  ui.modelDescription.textContent = avatar.description;
  ui.errorPanel.hidden = true;
}

function disposeCurrentAvatar() {
  mixer?.stopAllAction();
  mixer = null;
  action = null;

  sourceSkeleton?.removeFromParent();
  sourceSkeleton?.geometry?.dispose();
  sourceSkeleton?.material?.dispose();
  sourceSkeleton = null;

  referenceSkeleton?.removeFromParent();
  referenceSkeleton?.geometry?.dispose();
  referenceSkeleton?.material?.dispose();
  referenceSkeleton = null;

  protocol?.dispose();
  protocol?.referenceRoot.removeFromParent();
  protocol = null;

  if (model) {
    model.removeFromParent();
    disposeObject(model);
    model = null;
  }
}

function disposeObject(root) {
  root.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry?.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!material) continue;
      for (const value of Object.values(material)) {
        if (value?.isTexture) value.dispose();
      }
      material.dispose();
    }
  });
}

function showError(error, avatar) {
  console.error(error);
  ui.statusText.textContent = "Erreur de chargement";
  ui.errorPanel.hidden = false;
  ui.errorPanel.textContent = `Impossible de charger ${avatar.label} : ${error.message ?? error}`;
}

ui.directionButton.addEventListener("click", () => {
  if (!protocol) return;
  referenceMode = !referenceMode;
  protocol.setInverse(!referenceMode);
  ui.modeLabel.textContent = referenceMode ? "Référence → Source" : "Source → Référence";
  if (action) action.paused = referenceMode || !playing;
});

ui.playButton.addEventListener("click", () => {
  playing = !playing;
  ui.playIcon.textContent = playing ? "Ⅱ" : "▶";
  ui.playLabel.textContent = playing ? "Mettre en pause" : "Reprendre";
  if (action) action.paused = referenceMode || !playing;
});

ui.speed.addEventListener("input", () => {
  ui.speedValue.textContent = `${Number(ui.speed.value).toFixed(1)}×`;
});
ui.modelSelect.addEventListener("change", () => loadAvatar(ui.modelSelect.value));
ui.sourceSkeleton.addEventListener("change", () => {
  if (sourceSkeleton) sourceSkeleton.visible = ui.sourceSkeleton.checked;
});
ui.referenceSkeleton.addEventListener("change", () => {
  if (referenceSkeleton) referenceSkeleton.visible = ui.referenceSkeleton.checked;
  if (protocol) protocol.referenceRoot.visible = ui.referenceSkeleton.checked;
});
ui.meshVisibility.addEventListener("change", () => {
  model?.traverse((child) => { if (child.isMesh) child.visible = ui.meshVisibility.checked; });
});

function animate(timestamp) {
  requestAnimationFrame(animate);
  timer.update(timestamp);
  const delta = Math.min(timer.getDelta(), 0.05);
  const speed = Number(ui.speed.value);

  if (playing) {
    if (!referenceMode) {
      mixer?.update(delta * speed);
    } else if (protocol) {
      demoTime += delta * speed;
      const leftArm = protocol.bones.find(({ humanName }) => humanName === "LeftUpperArm");
      const leftForearm = protocol.bones.find(({ humanName }) => humanName === "LeftLowerArm");
      if (leftArm) leftArm.referenceBone.rotation.z = Math.sin(demoTime * 1.7) * 0.45;
      if (leftForearm) leftForearm.referenceBone.rotation.x = 0.45 + Math.sin(demoTime * 2.1) * 0.25;
    }
  }

  protocol?.update();
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
if (ui.modelSelect.value) loadAvatar(ui.modelSelect.value);
