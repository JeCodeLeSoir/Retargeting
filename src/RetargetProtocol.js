import {
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  SphereGeometry,
  Vector3,
} from "three";
import { defaultHumanBoneMapping } from "./AvatarData.js";

// Equivalent to the useful part of SkeletonBoneUtils.cs: Three.js already
// exposes the parent directly, so reflection is unnecessary.
export function getParentName(object) {
  return object?.parent?.name ?? null;
}

export function findByName(root, name) {
  if (!root || !name) return null;
  return root.getObjectByName(name) ?? null;
}

export function traverse(root) {
  const result = [];
  root?.traverse((object) => result.push(object));
  return result;
}

function setWorldQuaternion(object, worldQuaternion) {
  if (!object.parent) {
    object.quaternion.copy(worldQuaternion);
    return;
  }

  const parentWorld = object.parent.getWorldQuaternion(new Quaternion());
  object.quaternion.copy(parentWorld.invert().multiply(worldQuaternion));
}

function setWorldPosition(object, worldPosition) {
  if (!object.parent) {
    object.position.copy(worldPosition);
    return;
  }

  object.position.copy(object.parent.worldToLocal(worldPosition.clone()));
}

export class RotationRetargetReference {
  constructor(sourceWorldQuaternion, referenceWorldQuaternion) {
    this.offsetInverse = sourceWorldQuaternion
      .clone()
      .invert()
      .multiply(referenceWorldQuaternion);
    this.offset = referenceWorldQuaternion
      .clone()
      .invert()
      .multiply(sourceWorldQuaternion);
  }

  // Equivalent to ComputInverse: source -> reference.
  computeInverse(reference, source) {
    source.updateWorldMatrix(true, false);
    const world = source
      .getWorldQuaternion(new Quaternion())
      .multiply(this.offsetInverse);
    setWorldQuaternion(reference, world);
    reference.updateWorldMatrix(false, true);
  }

  // Equivalent to Comput: reference -> source.
  compute(reference, source) {
    reference.updateWorldMatrix(true, false);
    const world = reference
      .getWorldQuaternion(new Quaternion())
      .multiply(this.offset);
    setWorldQuaternion(source, world);
    source.updateWorldMatrix(false, true);
  }
}

/**
 * Three.js port of RetargetProtocol.cs.
 *
 * humanBones entries:
 * { humanName, boneName, parentHumanName? }
 *
 * Unlike Unity Avatar/HumanTrait, Three.js has no humanoid avatar database.
 * The caller must therefore provide the human-to-model bone mapping and the
 * humanoid parent relationship.
 */
export class RetargetProtocol {
  constructor({
    source,
    humanBones = defaultHumanBoneMapping,
    referenceRoot = new Object3D(),
    createMarker = defaultMarkerFactory,
    inverse = false,
    retargetRootPosition = true,
  }) {
    if (!source?.isObject3D) throw new TypeError("source must be a THREE.Object3D");
    if (!Array.isArray(humanBones)) throw new TypeError("humanBones must be an array");

    this.source = source;
    this.humanBones = humanBones;
    this.referenceRoot = referenceRoot;
    this.createMarker = createMarker;
    this.inverse = inverse;
    this.retargetRootPosition = retargetRootPosition;
    this.bones = [];
    this.initialized = false;
  }

  init() {
    this.source.updateWorldMatrix(true, true);

    const byHumanName = new Map();

    for (const descriptor of this.humanBones) {
      const sourceBone = findByName(this.source, descriptor.boneName);
      if (!sourceBone) {
        console.warn(
          `RetargetProtocol: bone "${descriptor.boneName}" (${descriptor.humanName}) was not found.`,
        );
        continue;
      }

      const referenceBone = this.createMarker(descriptor);
      referenceBone.name = descriptor.humanName;
      referenceBone.position.copy(sourceBone.getWorldPosition(referenceBone.position));
      referenceBone.quaternion.identity();
      this.referenceRoot.add(referenceBone);
      referenceBone.updateWorldMatrix(true, false);

      const data = {
        sourceBone,
        referenceBone,
        humanName: descriptor.humanName,
        parentHumanName: descriptor.parentHumanName ?? null,
        positionOffset: referenceBone
          .getWorldPosition(new Vector3())
          .sub(sourceBone.getWorldPosition(new Vector3())),
        rotationReference: new RotationRetargetReference(
          sourceBone.getWorldQuaternion(new Quaternion()),
          referenceBone.getWorldQuaternion(new Quaternion()),
        ),
      };

      this.bones.push(data);
      byHumanName.set(data.humanName, data);
    }

    // Object3D.attach is SetParent(parent, true): it preserves world transform.
    for (const bone of this.bones) {
      const parent = byHumanName.get(bone.parentHumanName);
      if (parent) parent.referenceBone.attach(bone.referenceBone);
    }

    this.bones = sortParentFirst(this.bones);
    this.referenceRoot.updateWorldMatrix(true, true);
    this.initialized = true;
    return this;
  }

  update() {
    if (!this.initialized) return;

    // Parent-first order is required because rotations are expressed in world space.
    for (const bone of this.bones) {
      if (this.inverse) {
        bone.rotationReference.computeInverse(bone.referenceBone, bone.sourceBone);
        if (this.retargetRootPosition && !bone.parentHumanName) {
          const position = bone.sourceBone
            .getWorldPosition(new Vector3())
            .add(bone.positionOffset);
          setWorldPosition(bone.referenceBone, position);
          bone.referenceBone.updateWorldMatrix(false, true);
        }
      } else {
        bone.rotationReference.compute(bone.referenceBone, bone.sourceBone);
        if (this.retargetRootPosition && !bone.parentHumanName) {
          const position = bone.referenceBone
            .getWorldPosition(new Vector3())
            .sub(bone.positionOffset);
          setWorldPosition(bone.sourceBone, position);
          bone.sourceBone.updateWorldMatrix(false, true);
        }
      }
    }
  }

  setInverse(value) {
    this.inverse = Boolean(value);
  }

  dispose() {
    for (const { referenceBone } of this.bones) {
      referenceBone.geometry?.dispose();
      referenceBone.material?.dispose();
      referenceBone.removeFromParent();
    }
    this.bones.length = 0;
    this.initialized = false;
  }
}

function sortParentFirst(bones) {
  const byName = new Map(bones.map((bone) => [bone.humanName, bone]));
  const result = [];
  const visited = new Set();
  const visiting = new Set();

  function visit(bone) {
    if (visited.has(bone)) return;
    if (visiting.has(bone)) {
      throw new Error(`Cycle detected in humanoid hierarchy at "${bone.humanName}"`);
    }

    visiting.add(bone);
    const parent = byName.get(bone.parentHumanName);
    if (parent) visit(parent);
    visiting.delete(bone);
    visited.add(bone);
    result.push(bone);
  }

  for (const bone of bones) visit(bone);
  return result;
}

function defaultMarkerFactory() {
  const marker = new Mesh(
    new SphereGeometry(0.05, 12, 8),
    new MeshBasicMaterial({ color: 0x35c2ff, wireframe: true }),
  );
  marker.scale.setScalar(1);
  return marker;
}
