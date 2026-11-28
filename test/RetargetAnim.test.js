import test from "node:test";
import assert from "node:assert/strict";
import { Bone, Euler, Object3D, Quaternion, Vector3 } from "three";
import { RetargetAnim } from "../src/RetargetAnim.js";
import { RetargetProtocol } from "../src/RetargetProtocol.js";

const mapping = [
  { humanName: "Hips", boneName: "hips" },
  { humanName: "Spine", boneName: "spine", parentHumanName: "Hips" },
];

function avatar(x) {
  const model = new Object3D();
  model.position.x = x;
  const hips = new Bone();
  hips.name = "hips";
  hips.position.y = 1;
  const spine = new Bone();
  spine.name = "spine";
  spine.position.y = 1;
  model.add(hips);
  hips.add(spine);
  model.updateWorldMatrix(true, true);
  const protocol = new RetargetProtocol({
    source: model,
    humanBones: mapping,
    createMarker: () => new Object3D(),
  }).init();
  return { model, hips, spine, protocol };
}

test("RetargetAnim transfers matching HumanBodyBones in an explicit pipeline", () => {
  const source = avatar(-2);
  const target = avatar(3);
  const retarget = new RetargetAnim({ source: source.protocol, target: target.protocol });

  source.hips.position.x = 0.75;
  source.spine.quaternion.setFromEuler(new Euler(0.35, -0.2, 0.1));
  retarget.update();

  const sourceRef = source.protocol.bones.find((bone) => bone.humanName === "Spine").referenceBone;
  const targetRef = target.protocol.bones.find((bone) => bone.humanName === "Spine").referenceBone;
  assert.ok(1 - Math.abs(sourceRef.quaternion.dot(targetRef.quaternion)) < 1e-6);
  assert.ok(target.hips.getWorldPosition(new Vector3()).distanceTo(new Vector3(3.75, 1, 0)) < 1e-6);
  assert.equal(source.protocol.inverse, true);
  assert.equal(target.protocol.inverse, false);
});

test("forward-angle correction conjugates pose and root motion", () => {
  const source = avatar(0);
  const target = avatar(5);
  const retarget = new RetargetAnim({
    source: source.protocol,
    target: target.protocol,
    targetForwardAngle: 90,
  });
  source.hips.position.x = 1;
  source.spine.quaternion.setFromEuler(new Euler(0.4, 0, 0));
  retarget.update();

  const correction = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -Math.PI / 2);
  const sourceRef = source.protocol.bones.find((bone) => bone.humanName === "Spine").referenceBone;
  const expected = correction.clone().multiply(sourceRef.quaternion).multiply(correction.clone().invert());
  const targetRef = target.protocol.bones.find((bone) => bone.humanName === "Spine").referenceBone;
  assert.ok(1 - Math.abs(expected.dot(targetRef.quaternion)) < 1e-6);
  assert.ok(target.hips.getWorldPosition(new Vector3()).distanceTo(new Vector3(5, 1, 1)) < 1e-6);
});
