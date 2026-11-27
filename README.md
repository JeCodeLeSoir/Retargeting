# Port Three.js de `RetargetProtocol.cs`

Cette version transpose la logique des deux scripts Unity du dossier `Exemple` :

- parcours et recherche des os par nom ;
- création d'un squelette de référence ;
- conservation des offsets de rotation calculés à l'initialisation ;
- copie des rotations `référence → source` ou `source → référence`.

## Installation

```bash
npm install
npm test
```

## Utilisation avec un modèle GLTF/GLB

```js
import { RetargetProtocol } from "./src/RetargetProtocol.js";

// gltf.scene est la racine chargée avec GLTFLoader.
const protocol = new RetargetProtocol({
  source: gltf.scene,
}).init();

scene.add(protocol.referenceRoot);

function animate() {
  requestAnimationFrame(animate);
  protocol.update();
  renderer.render(scene, camera);
}
animate();
```

Par défaut, les marqueurs de référence pilotent le squelette du modèle, comme
`isComputInverse = false` dans Unity. Pour inverser le flux :

```js
protocol.setInverse(true);
```

## Différence importante avec Unity

Three.js ne possède pas d'équivalent natif de `Avatar.humanDescription`, mais le
port exploite désormais les fichiers structurés du dossier `Avatar` :

- `Human.json` produit `HumanBodyBones` et la hiérarchie des parents ;
- `Mapping_DazGenesis8.json` est le mapping utilisé par défaut ;
- `Mapping_Mixamo.json` alimente la démo `Models/Mixamo.fbx` ;
- `HumanParent` alimente `getParentBoneId()` et `getParentBoneName()`, les
  équivalents de `HumanTrait.GetParentBone`.

Il est toujours possible de fournir un autre mapping :

```js
import { createHumanBoneMapping } from "./src/AvatarData.js";

const humanBones = createHumanBoneMapping([
  { humanName: "Hips", boneName: "mixamorigHips" },
  { humanName: "Spine", boneName: "mixamorigSpine" },
]);
```

Les parents sont déduits de `HumanParent`; il n'est plus nécessaire de les
répéter dans le mapping.

Les rotations Unity utilisées dans le script sont des rotations monde. Le port
convertit explicitement ces rotations en quaternions locaux Three.js lors de
l'écriture, afin de rester correct même quand un os a un parent transformé.

## Modèles de la démo

La démo détecte automatiquement les fichiers FBX présents dans `Models` et
n'affiche que les avatars disponibles. Sur GitHub, `Mixamo.fbx` est fourni comme
asset de la release `v1.0.0` et sert de repli lorsque le fichier local est absent.
`Models/DazGenesis8.fbx` reste volontairement local et est exclu par `.gitignore`.
