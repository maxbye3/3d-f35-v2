# F-35B Assembly Explorer

An interactive viewer with a SIRES-inspired navy and blue interface, locally hosted Lato fonts, and the separated F-35B model: **38 named assemblies and 103 editable component meshes**.

[Open the public viewer on GitHub Pages](https://maxbye.co/3d-f35-v2/).

The [original hosted viewer](https://f35b-assembly-explorer.steerbridge-8360.chatgpt.site) remains private to its owner.

## GitHub Pages

The `Deploy viewer to GitHub Pages` workflow publishes `dist/` whenever `main` changes, after running the JavaScript checks. It can also be run manually from the Actions tab. No dependency installation or build step is needed; the models, fonts, and Three.js modules are included in `dist/`.

The repository's Pages publishing source is **GitHub Actions**. Asset URLs are relative, so the viewer works under `/3d-f35-v2/`. The address `https://maxbye3.github.io/3d-f35-v2/` redirects to the account's existing custom domain above.

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
- Search the component index, highlight an assembly, and focus or isolate it. Focus View pans and zooms smoothly over 0.5 seconds; dragging, zooming, or resetting interrupts the move. Reduced-motion preferences use an immediate focus.
- Isolate Part sends the other assemblies outward in a 0.5-second explosion and centers the selected component. Show All Parts reverses the motion and restores the previous camera view. Switching components or clearing the selection also transitions smoothly.
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

Lato is distributed under the SIL Open Font License in `dist/fonts/OFL.txt`. The SIRES-style vector mark is adapted from the user-provided design reference.

## Hidden flight mode

With focus outside a text field, enter **↑ ↑ ↓ ↓ ← → ← → B A**. Arrow keys fly the F-35 and **Space** drops bombs onto page elements. Hits create debris and temporarily hide the struck element. **Escape** or **Exit & restore** restores every element and returns to the model viewer. All damage is local to the current browser session.
