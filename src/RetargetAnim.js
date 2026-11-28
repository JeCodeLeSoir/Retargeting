import { Quaternion, Vector3 } from "three";

const yRotation = (degrees) => new Quaternion().setFromAxisAngle(
  new Vector3(0, 1, 0),
  degrees * Math.PI / 180,
);

function setWorldPosition(object, position) {
  if (!object.parent) {
    object.position.copy(position);
    return;
  }
  object.position.copy(object.parent.worldToLocal(position.clone()));
}

/**
 * Three.js equivalent of RetargetAnim.cs.
 *
 * The update order is explicit here: animation -> source protocol -> transfer
 * -> target protocol. This avoids Unity's unspecified Update ordering.
 */
export class RetargetAnim {
  constructor({
    source,
    target,
    sourceForwardAngle = 0,
    targetForwardAngle = 0,
    rootMotionScale = 1,
  }) {
    if (!source?.initialized || !target?.initialized) {
      throw new Error("source and target protocols must be initialized");
    }

    this.source = source;
    this.target = target;
    this.sourceForwardAngle = sourceForwardAngle;
    this.targetForwardAngle = targetForwardAngle;
    this.rootMotionScale = rootMotionScale;
    this.bones = [];

    source.setInverse(true);
    target.setInverse(false);

    const targetByHumanName = new Map(
      target.bones.map((bone) => [bone.humanName, bone]),
    );
    for (const sourceBone of source.bones) {
      const targetBone = targetByHumanName.get(sourceBone.humanName);
      if (targetBone) this.bones.push({ sourceBone, targetBone });
    }

    const hips = this.bones.find(({ sourceBone }) => sourceBone.humanName === "Hips")
      ?? this.bones.find(({ sourceBone }) => !sourceBone.parentHumanName);
    this.rootPair = hips ?? null;

    this.sourceBindRoot = this.rootPair?.sourceBone.referenceBone
      .getWorldPosition(new Vector3()) ?? new Vector3();
    this.targetBindRoot = this.rootPair?.targetBone.referenceBone
      .getWorldPosition(new Vector3()) ?? new Vector3();
    this.modelWorldOffset = target.source.getWorldPosition(new Vector3())
      .sub(source.source.getWorldPosition(new Vector3()));
  }

  setForwardAngles(sourceDegrees, targetDegrees) {
    this.sourceForwardAngle = Number(sourceDegrees) || 0;
    this.targetForwardAngle = Number(targetDegrees) || 0;
  }

  update() {
    this.source.update();

    const sourceForward = yRotation(this.sourceForwardAngle);
    const targetForward = yRotation(this.targetForwardAngle);
    const correction = targetForward.invert().multiply(sourceForward);
    const inverseCorrection = correction.clone().invert();

    for (const { sourceBone, targetBone } of this.bones) {
      targetBone.referenceBone.quaternion
        .copy(correction)
        .multiply(sourceBone.referenceBone.quaternion)
        .multiply(inverseCorrection);
    }

    if (this.rootPair) {
      const sourceRoot = this.rootPair.sourceBone.referenceBone
        .getWorldPosition(new Vector3());
      const delta = sourceRoot
        .sub(this.sourceBindRoot)
        .applyQuaternion(correction)
        .multiplyScalar(this.rootMotionScale);
      setWorldPosition(
        this.rootPair.targetBone.referenceBone,
        this.targetBindRoot.clone().add(delta),
      );
    }

    const sourceModelPosition = this.source.source.getWorldPosition(new Vector3());
    setWorldPosition(this.target.source, sourceModelPosition.add(this.modelWorldOffset));
    this.target.update();
  }
}
