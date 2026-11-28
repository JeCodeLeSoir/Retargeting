# Port Three.js de `RetargetProtocol.cs` et `RetargetAnim.cs`

Cette version transpose la logique des deux scripts Unity du dossier `Exemple` :

- parcours et recherche des os par nom ;
- création d'un squelette de référence ;
- conservation des offsets de rotation calculés à l'initialisation ;
- copie des rotations `référence → source` ou `source → référence` ;
- transfert d'une pose entre deux avatars via les `HumanBodyBones` communs ;
- correction de l'axe avant et transfert du mouvement de racine.

`RetargetAnim.update()` impose l'ordre animation → protocole source → transfert
→ protocole cible. La version Three.js ne dépend donc pas de l'ordre implicite
de plusieurs appels `Update()`.

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

Pour transférer la pose vers un second avatar :

```js
import { RetargetAnim } from "./src/RetargetAnim.js";

const transfer = new RetargetAnim({
  source: sourceProtocol,
  target: targetProtocol,
  sourceForwardAngle: 0,
  targetForwardAngle: 90,
});

function animate() {
  sourceMixer.update(clock.getDelta());
  transfer.update();
  renderer.render(scene, camera);
}
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

La démo détecte automatiquement les fichiers FBX présents dans `Models`, permet
de choisir séparément la source et la cible, puis affiche les deux avatars. Sur GitHub, `Mixamo.fbx` est fourni comme
asset de la release `v1.0.0` et sert de repli lorsque le fichier local est absent.
`Models/DazGenesis8.fbx` reste volontairement local et est exclu par `.gitignore`.
