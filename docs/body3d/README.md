# AEGIS body: interactive 3D anatomy driven by crew vitals

A real anatomical body (BodyParts3D 4.0, about 570k triangles, 14 layers) that you can rotate, zoom into and click. Each measured metric changes what you see inside it.

| Metric / scenario | What you see |
|---|---|
| Heart rate | The heart contracts at the real BPM; the pulses travelling through the arteries and veins follow it |
| Blood pressure | High pressure makes the arteries glow hotter and throb wider with every beat |
| Glucose | Amber particles mix into the arterial flow |
| Sleep / mood | The brain's neural sparks slow down and fatigue patches pulse |
| Bone loss / exercise | Glowing density patches on the hips, spine and legs; the antigravity muscles thin and pale |
| Radiation | Particle streaks pass through the body; the skin shimmers; storm levels flood the screen |
| Temperature | The skin shell warms to orange with fever |

The screen edge glows amber or pulses red, and a banner names the problem with a "See it inside the body" button. Clicking any 3D label flies the camera to that region and fades the layers in front of it. The side panel explains what's happening inside and what to do.

## Every visual maps to a field in crew_data.json
| Field | Where it shows |
|---|---|
| `hr` | Heart beats at this rate; flow pulses in every vessel follow it; artery close-up speed |
| `bp_sys`, `bp_dia` | Artery glow and throb; artery wall stretch in the close-up |
| `glucose` | Amber particles in the arterial flow and the close-up |
| `sleep_h`, `mood` | Brain spark speed and fatigue patches; nerve-signal close-up |
| `exercise_min`, `bone_loss_pct` | Bone density heat map; antigravity muscle thinning; bone lattice and muscle fibre close-ups (launch vs today) |
| `dose_mSv_day`, `dose_mSv_cum` | Particle streaks and skin shimmer; DNA-break close-up; career budget |
| `temp` | Skin shell warms to orange |
| flags + `status` | Warning light, banner, label colours |

Nothing is shown that isn't driven by one of these. The "Simulate" scenarios only push these same fields out of range for rehearsal.

## How it's organised (v2)
- **Lenses** (left rail): Whole body, Heart & blood, Brain & sleep, Bones & muscle, Blood sugar, Radiation & temp. Each one fades the body to the layers that matter for that data and shows its labels. Defined in `src/body/targets.ts`.
- **Click any organ or label** to open the inspector: the organ cut out of the same model and running live (`Inspector.tsx`), plus a cell-scale close-up (`Micro.tsx`): red cells in an artery, nerve signals, bone lattice and muscle fibres at launch vs today, DNA breaks.
- Deep links: `#scenario-target-crew`, e.g. `#hypertension-heart`, `#boneloss-bone`, `#storm-dna`, `#sleep-brain-2`, `#sugar-metabolic`.

## Run
`npm i && npm run dev`, then try the deep links above.

## Put it in the app (Emile)
- Copy `src/body/` and `public/body.glb`. Add deps: `three@0.169 @react-three/fiber@8 @react-three/drei@9 @react-three/postprocessing@2 postprocessing@6 suspend-react`.
- Render `<App dataUrl="/data/crew_data.json" />` as the astronaut screen, or lift `Body`, `CameraRig`, `Hotspots`, `Plaque`, `Radiation` and `ViewShift` into your own Canvas. Set `VITE_MODEL_URL=/models/body.glb` if you move the model.
- All values come from `crew_data.json` through `derive()`. The "Simulate" scenarios override values for the demo and are labelled as simulated on screen.
- To rebuild or change the model: `python3 build_body_full.py <human-atlas>/public/models out/` (clone github.com/ashemag/human-atlas). Blender isn't needed. Opening `body.glb` in Blender is only useful if you want to hand-edit meshes.

Credit, required: Anatomy: BodyParts3D 4.0, © Database Center for Life Science, CC BY 4.0.
