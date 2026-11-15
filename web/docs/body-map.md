# e^x body map: which metric lights up where

Research spec, 2026-11-15. Machine-readable version: `body-map.json` (same folder). Model inspected: `docs/body-kit/aegis-body.glb` (sha256 `95ac5111...2393`).

## Summary

| Item | Finding |
|---|---|
| GLB structure | 7 nodes, 7 meshes, one merged mesh per node. No sub-meshes and no structure names inside the file. |
| Finer granularity | Still available. The source triangle order survived the merge, so each anatomical structure is one contiguous triangle range. 515 of 528 structures verified against the BodyParts3D part index. |
| How to highlight a structure | `geometry.addGroup(start * 3, count * 3, materialIndex)` on the node mesh, or a per-vertex attribute and a shader tint. Ranges are in `structure_index`. |
| Metrics mapped | All 11 metric keys in `crew_data.json`, checked against the file's `body_region`. |
| Issue patterns | 16. Nine can be driven by today's data, two are context only, five have no metric in the file. |
| Missing organs | Eyes, kidneys, pancreas, pineal and pituitary: not in the GLB, but present in the atlas. Inner ear, lung surface, marrow: not in the atlas. |
| Model defects | 6 of the 20 "load-bearing bones" are not bones (filter matched "tibia" in tibialis and iliotibial). |
| Blender | Not needed for mapping. A rebuild with the existing Python script covers every gap. Blender would help the look only. |

## 1. What is in the GLB

Axes: metres, y up, body faces +z, body's left is +x (screen right in the front view). Height 1.72 m, feet on y = 0.

| Node (mesh name) | Contract region | Triangles | Structures | Verified ranges | y range (m) |
|---|---|---:|---:|---:|---|
| `whole_body` | whole_body | 22,372 | 1 | 1 | 0.00 to 1.72 |
| `brain` | brain | 39,679 | 110 | 108 | 1.54 to 1.71 |
| `heart` | heart | 19,389 | 18 | 18 | 1.25 to 1.36 |
| `blood` | blood | 35,352 | 109 | 105 | 0.36 to 1.46 |
| `bones` | bones | 79,843 | 246 | 239 | 0.01 to 1.71 |
| `bones_loadbearing` | bones | 23,760 | 20 | 20 | 0.01 to 1.15 |
| `muscle_antigravity` | bones | 22,726 | 24 | 24 | 0.11 to 1.45 |

A range counts as verified when every triangle in it lies inside the atlas bounds of that structure (3 mm tolerance) and no other range overlaps it. The 13 unverified structures fall back to a bounding box.

## 2. Metric to body

`structures` are exact GLB node names. `Focus parts` are structure names in `structure_index`. Anchors are real mesh vertices (x, y, z in metres).

| Metric key | Region | Structures | Focus parts | Anchor | Spaceflight risk | Source |
|---|---|---|---|---|---|---|
| `hr` | heart | `heart` | Wall of ventricle | 0.036, 1.299, 0.035 | Cardiovascular deconditioning | NORSK, TB-019 |
| `bp_sys` | heart | `heart` | Wall of ventricle; context: aortic arch, ascending aorta, left brachial artery | 0.016, 1.372, -0.006 | Deconditioning, fluid shift | NORSK, TB-019 |
| `bp_dia` | heart | `heart` | Context: descending and abdominal aorta | 0.007, 1.225, -0.006 | Cardiovascular deconditioning | NORSK |
| `glucose` | blood | `blood` | Abdominal aorta, inferior vena cava (pancreas level) | 0.012, 1.119, 0.018 | Insulin resistance | HUGHSON |
| `temp` | whole_body | `whole_body` | Skin; anchor on the forehead | 0.006, 1.669, 0.073 | Thermoregulation shift | STAHN |
| `sleep_h` | brain | `brain` | Hypothalamus, thalamus | 0, 1.622, 0 | Sleep loss, circadian misalignment | THESIS 11, BARGER |
| `mood` | brain | `brain` | Frontal gyri, cingulate, amygdala, hippocampus | 0.009, 1.659, 0.051 | Behavioural health | TB-016 |
| `exercise_min` | bones | `muscle_antigravity`, `bones_loadbearing` | Quadriceps, calf muscles | 0.123, 0.621, -0.002 | Muscle atrophy | EX-NASA |
| `bone_loss_pct` | bones | `bones_loadbearing` | Femurs, hip bones, L1 to L5 (14 true bones in total) | -0.109, 0.887, -0.030 | Bone loss | THESIS 11, MTB-013 |
| `dose_mSv_day` | whole_body | `whole_body` | Skin aura | 0.208, 1.411, -0.027 | Radiation, particle event | THESIS 11, TB-020 |
| `dose_mSv_cum` | whole_body | `whole_body` | Skin aura as a gauge | -0.212, 1.409, -0.032 | Radiation, career limit | THESIS 11, V1 |

Rules for the UI:

| Rule | Reason |
|---|---|
| Colour comes only from `status` and `core/scoring`. | This file says where, never how severe. |
| Context parts (aorta for blood pressure) get a neutral outline. | They sit in the `blood` region, which has its own status. |
| Sleep and mood localisation is illustrative. | A team choice from general anatomy, not a sourced claim. Do not caption it as fact. |
| Quote a `why` line as a claim only when `claim_ok` is true. | Only four lines use THESIS-DETAILS section 11 wording. |
| Measurement sites are a second marker. | Wrist, upper-arm cuff, fingertip, mouth: taken from `how_to_measure` in the file. |

## 3. Issue patterns

| Pattern | Where | Driven by | Can fire today |
|---|---|---|---|
| Fluid shift | Neck vessels, heart, leg veins | bp_sys, bp_dia, hr | Context only |
| Eye (SANS) | Eyes (anchor only), optic chiasm, orbit bones | none | No: no vision metric, no eye mesh |
| Sleep debt | Hypothalamus, thalamus, brainstem | sleep_h, mood, hr | Yes |
| Isolation strain | Frontal and limbic areas | mood, sleep_h | Yes |
| Heart deconditioning | Heart, aorta | hr, bp_sys, bp_dia, exercise_min | Yes |
| Standing tolerance | Heart, leg veins | hr, bp | Context only (needs a stand test) |
| Bone loss | 14 load-bearing bones | bone_loss_pct, exercise_min | Yes |
| Muscle loss | 24 antigravity muscles | exercise_min | Yes (proxy) |
| Radiation storm | Whole-body aura | dose_mSv_day, storm forecast | Yes |
| Career dose | Whole-body gauge | dose_mSv_cum | Yes |
| Glucose drift | Central vessels at pancreas level | glucose, exercise_min | Yes |
| Fever signal | Whole-body aura | temp | Yes |
| Kidney stone risk | Renal vessels (kidney anchors only) | none | No: no hydration metric |
| Back pain | Lumbar vertebrae, disks, back extensors | none | No: no symptom metric |
| Motion sickness | Cerebellum, temporal bones | none | No |
| CO2 headache | Skull | none | No: no cabin CO2 channel |

Patterns that cannot fire must not raise an alert. They are for the architecture map and for future channels.

## 4. Gaps and defects

| Item | In GLB | In atlas | Fix |
|---|---|---|---|
| Eyes | No | Yes | Add an `eyes` node. Check the right sclera first: its atlas bounds cross the midline. |
| Kidneys, ureters, bladder | No | Yes | Add a `kidneys` node. |
| Pancreas | No | Yes | Add as its own node in the blood region. |
| Pineal body, pituitary | No | Yes | Add to `brain` (they are tagged endocrine, so the filter skipped them). |
| Optic nerves | No | Yes | Whitelist in the brain filter (it drops every "nerve"). |
| Lungs | No | Bronchial tree only | Not needed for today's metrics. |
| Inner ear, marrow, thyroid | No | No | Anchor on bone; keep radiation whole-body. |
| Femoral neck | Part of femur | Part of femur | Use the proximal-femur anchor or a box on the top 7 cm. |
| `bones_loadbearing` | 6 non-bones | n/a | Iliotibial tracts, tibialis anterior and posterior. Exclude via the parts list, or fix the "tibia" filter. |
| `bones` | 10 muscles, 25 cartilages | n/a | Fibularis, subscapularis, levator scapulae. Cosmetic. |

## 5. Blender

| Question | Answer |
|---|---|
| Needed for mapping? | No. |
| Cheapest full fix | Extend `build_aegis_body.py`: one named node per structure, corrected filters, new nodes for eyes, kidneys and pancreas. |
| Where Blender helps | Smoother skin shell for the glass look, baked shading, a lung surface, file compression. |

## 6. How this file was made

| Step | Tool |
|---|---|
| Parse the GLB JSON chunk and buffers | Pure Node script, no installs |
| Split each mesh into connected pieces | Union-find over triangle indices |
| Name the pieces | BodyParts3D 4.0 part index (`atlas.json`, public, CC BY 4.0) with the same filters as `build_aegis_body.py` |
| Validate | Metric keys and regions read from `crew_data.json`; every part name resolved; every range checked against atlas bounds |

Ranges hold only for this exact GLB. Regenerate the JSON if the model is rebuilt.
