import test from "node:test";
import assert from "node:assert/strict";
import { Bone, Euler, Object3D, Quaternion, Vector3 } from "three";
import {
  RetargetProtocol,
  findByName,
  getParentName,
  traverse,
} from "../src/RetargetProtocol.js";
import {
  HumanBodyBones,
  createHumanBoneMapping,
  mixamoMappingData,
  getParentBoneId,
  getParentBoneName,
} from "../src/AvatarData.js";

const closeQuaternion = (actual, expected, epsilon = 1e-6) => {
  assert.ok(1 - Math.abs(actual.dot(expected)) < epsilon);
};

function fixture() {
  const source = new Object3D();
  const hips = new Bone();
  hips.name = "mixamorigHips";
  const spine = new Bone();
  spine.name = "mixamorigSpine";
  spine.position.y = 1;
  source.add(hips);
  hips.add(spine);

  const protocol = new RetargetProtocol({
    source,
    humanBones: [
      { humanName: "Hips", boneName: "mixamorigHips" },
      { humanName: "Spine", boneName: "mixamorigSpine", parentHumanName: "Hips" },
    ],
    createMarker: () => new Object3D(),
  }).init();

  return { protocol, source, hips, spine };
}

test("tree helpers replace SkeletonBoneUtils", () => {
  const { source, spine } = fixture();
  assert.equal(findByName(source, "mixamorigSpine"), spine);
  assert.equal(getParentName(spine), "mixamorigHips");
  assert.equal(traverse(source).length, 3);
});

test("reference rotation drives source while preserving bind offset", () => {
  const { protocol, spine } = fixture();
  const refSpine = protocol.bones[1].referenceBone;
  const desired = new Quaternion().setFromEuler(new Euler(0.2, -0.3, 0.4));
  refSpine.quaternion.copy(desired);
  protocol.update();

  const actualWorld = spine.getWorldQuaternion(new Quaternion());
  const expectedWorld = refSpine
    .getWorldQuaternion(new Quaternion())
    .multiply(protocol.bones[1].rotationReference.offset);
  closeQuaternion(actualWorld, expectedWorld);
});

test("inverse mode drives reference from source", () => {
  const { protocol, hips } = fixture();
  protocol.setInverse(true);
  hips.quaternion.setFromEuler(new Euler(-0.1, 0.5, 0.25));
  protocol.update();

  const data = protocol.bones[0];
  const expected = hips
    .getWorldQuaternion(new Quaternion())
    .multiply(data.rotationReference.offsetInverse);
  closeQuaternion(data.referenceBone.getWorldQuaternion(new Quaternion()), expected);
});

test("inverse mode transfers root translation without moving child anchors", () => {
  const { protocol, hips } = fixture();
  protocol.setInverse(true);
  hips.position.set(0.5, 1.25, -0.3);
  protocol.update();

  const referenceHips = protocol.bones[0].referenceBone;
  const expected = hips
    .getWorldPosition(new Vector3())
    .add(protocol.bones[0].positionOffset);
  assert.ok(referenceHips.getWorldPosition(new Vector3()).distanceTo(expected) < 1e-6);
});

test("Avatar/Human.json exposes Unity HumanBodyBones and HumanTrait parents", () => {
  assert.equal(HumanBodyBones.Hips, 0);
  assert.equal(HumanBodyBones.UpperChest, 54);
  assert.equal(getParentBoneId(HumanBodyBones.UpperChest), HumanBodyBones.Chest);
  assert.equal(getParentBoneName("Neck"), "UpperChest");

  const mapping = createHumanBoneMapping([
    { humanName: "Neck", boneName: "neckLower", parentHumanName: "wrong" },
  ]);
  assert.equal(mapping[0].parentHumanName, "UpperChest");
});

test("Mixamo mapping uses the FBXLoader-normalized bone names", () => {
  assert.equal(mixamoMappingData[0].boneName, "mixamorigHips");
  assert.equal(mixamoMappingData[1].boneName, "mixamorigLeftUpLeg");
});

test("bones are sorted parent-first even when enum order is not hierarchical", () => {
  const source = new Object3D();
  for (const name of ["neckLower", "chestUpper", "chestLower"]) {
    const bone = new Bone();
    bone.name = name;
    source.add(bone);
  }

  const protocol = new RetargetProtocol({
    source,
    humanBones: createHumanBoneMapping([
      { humanName: "Neck", boneName: "neckLower" },
      { humanName: "UpperChest", boneName: "chestUpper" },
      { humanName: "Chest", boneName: "chestLower" },
    ]),
    createMarker: () => new Object3D(),
  }).init();

  assert.deepEqual(
    protocol.bones.map(({ humanName }) => humanName),
    ["Chest", "UpperChest", "Neck"],
  );
});
