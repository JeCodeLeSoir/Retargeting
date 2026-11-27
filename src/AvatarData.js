import { PropertyBinding } from "three";
import humanData from "../Avatar/Human.json" with { type: "json" };
import dazGenesis8Data from "../Avatar/Mapping_DazGenesis8.json" with { type: "json" };
import mixamoData from "../Avatar/Mapping_Mixamo.json" with { type: "json" };

const normalizeMapping = (mapping) => mapping.map((bone) => ({
  ...bone,
  // FBXLoader removes characters reserved by animation paths (notably ':').
  boneName: PropertyBinding.sanitizeNodeName(bone.boneName),
}));

export const dazGenesis8MappingData = normalizeMapping(dazGenesis8Data.datas);
export const mixamoMappingData = normalizeMapping(mixamoData.datas);

function indexAvatarData(data) {
  if (!Array.isArray(data?.HumanEnum) || !Array.isArray(data?.HumanParent)) {
    throw new TypeError("Avatar data must contain HumanEnum and HumanParent arrays");
  }

  const nameById = new Map(
    data.HumanEnum.map(({ humanID, humanName }) => [humanID, humanName]),
  );
  const idByName = new Map(
    data.HumanEnum.map(({ humanID, humanName }) => [humanName, humanID]),
  );
  const parentById = new Map(
    data.HumanParent.map(({ humanName, parentHumanName }) => [
      humanName,
      parentHumanName,
    ]),
  );

  return { nameById, idByName, parentById };
}

export function getHumanBodyBoneId(humanName, data = humanData) {
  return indexAvatarData(data).idByName.get(humanName) ?? -1;
}

// Equivalent to HumanTrait.GetParentBone(int).
export function getParentBoneId(humanBoneId, data = humanData) {
  return indexAvatarData(data).parentById.get(humanBoneId) ?? -1;
}

export function getParentBoneName(humanName, data = humanData) {
  const { idByName, nameById, parentById } = indexAvatarData(data);
  const id = idByName.get(humanName);
  if (id === undefined) return null;
  return nameById.get(parentById.get(id)) ?? null;
}

export function createHumanBoneMapping(
  mapping = dazGenesis8MappingData,
  data = humanData,
) {
  if (!Array.isArray(mapping)) throw new TypeError("mapping must be an array");

  return mapping.map((bone) => ({
    ...bone,
    // HumanParent is authoritative, just like HumanTrait in Unity.
    parentHumanName: getParentBoneName(bone.humanName, data),
  }));
}

export { humanData };
export const HumanBodyBones = Object.freeze(
  Object.fromEntries(humanData.HumanEnum.map(({ humanName, humanID }) => [humanName, humanID])),
);
export const defaultHumanBoneMapping = createHumanBoneMapping();
export const mixamoFbxMapping = createHumanBoneMapping(
  mixamoMappingData,
);
export const dazGenesis8FbxMapping = createHumanBoneMapping(dazGenesis8MappingData);
