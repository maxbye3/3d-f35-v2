# F-35B Assembly Explorer

An interactive viewer for the separated F-35B model: **38 named assemblies and 103 editable component meshes**.

[Open the hosted viewer](https://f35b-assembly-explorer.steerbridge-8360.chatgpt.site) (access is private to its owner).

## Run locally

Requires Node.js 18 or newer. The browser dependencies are included in `dist/vendor`, so no installation or build step is needed.

```sh
npm run dev
```

Open [localhost:8765](http://localhost:8765). Set `PORT` to use another port. Serve `dist/` with any static web server for deployment.

## Explore

- Drag to rotate and scroll to zoom.
- Move the separation slider between assembled and exploded views.
- Animate assembly or toggle automatic rotation.
- Search the component index, highlight an assembly, and focus or isolate it.
- Switch to the labeled render or download either GLB model.

## Editable model and assets

| Path | Contents |
| --- | --- |
| `models/F35B-exploded.blend` | Editable Blender 5.0 model with original-resolution packed textures |
| `dist/assets/F35B-assembled.glb` | Assembled model with the separated mesh hierarchy |
| `dist/assets/F35B-exploded.glb` | Exploded model with separation offsets baked into assembly transforms |
| `dist/assets/exploded-preview.jpg` | Labeled exploded render |
| `dist/app.js` | Viewer, animation, selection, and camera controls |
| `dist/vendor/` | Three.js 0.180.0 and the browser modules used by the viewer |

In Blender, select **EXPLODE CONTROL** and change **Object Properties → Custom Properties → Explode**: `0` is assembled and `1` is exploded. Timeline frame **1** is assembled; frame **120** is exploded. Each assembly has its own collection and parent empty. The original pose has the lift fan door open and landing gear deployed.

The main exterior mesh was cut into nose, fuselage, wing, and tail sections while retaining UVs. Section boundaries remain open. Radar, avionics racks, internal wing structure, and a complete engine are absent from the supplied source model. The cockpit, lift fan, exhaust nozzle, and landing gear details present in the source are retained.

## Checks

```sh
npm run check
```

The viewer was checked in a browser for model loading, reassembly, animation, selection and isolation, labeled-render switching, and responsive layouts including a 390px viewport.

Three.js is distributed under its MIT license in `dist/vendor/THREE-LICENSE.txt`. The aircraft assets originate from the user-supplied `F35-B.zip`; the Three.js license does not grant rights to those model assets.
