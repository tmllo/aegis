"""Extract an Aegis-sized body from the human-atlas (BodyParts3D 4.0, CC BY 4.0) geometry.

Output GLB node names = Aegis body regions, so the R3F side can do
  scene.getObjectByName('heart').material.color.set(statusColor)

Usage: python3 -I build_aegis_body.py <human-atlas/public/models> <out.glb>
"""
import json, sys, re
from pathlib import Path
import numpy as np
import trimesh

src, out = Path(sys.argv[1]), Path(sys.argv[2])
atlas = json.loads((src / "atlas.json").read_text())
parts = atlas["parts"]
chunk_cache = {}

def chunk(i):
    if i not in chunk_cache:
        chunk_cache[i] = (src / f"body-{i}.bin").read_bytes()
    return chunk_cache[i]

def mesh_of(p):
    buf = chunk(p["chunk"])
    v = np.frombuffer(buf, np.float32, p["vertexCount"] * 3, p["positions"]).reshape(-1, 3)
    n = np.frombuffer(buf, np.int16, p["vertexCount"] * 3, p["normals"]).reshape(-1, 3) / 32767.0
    f = np.frombuffer(buf, np.uint32, p["indexCount"], p["indices"]).reshape(-1, 3)
    return trimesh.Trimesh(vertices=v.copy(), faces=f.copy(), vertex_normals=n, process=False)

name = lambda p: p["name"].lower()
BRAIN_VENTRICLES = {"third ventricle", "fourth ventricle", "interventricular foramen",
                    "left lateral ventricle", "right lateral ventricle"}

def is_brain(p):
    return (p["system"] == "nervous" and p["bounds"][0][1] > 1.45 and "nerve" not in name(p)) \
        or name(p) in BRAIN_VENTRICLES

def is_heart(p):
    return p["system"] == "cardiac" and name(p) not in BRAIN_VENTRICLES

MAJOR_VESSELS = re.compile(r"aorta|vena cava|common carotid|subclavian|brachiocephalic|common iliac|external iliac|"
                           r"femoral (artery|vein)|popliteal|internal jugular|pulmonary trunk|renal (artery|vein)|"
                           r"axillary (artery|vein)|brachial (artery|vein)")
def is_blood(p):
    return p["system"] in ("arterial", "venous") and MAJOR_VESSELS.search(name(p))

LOAD_BEARING = re.compile(r"femur|hip bone|lumbar vertebra|sacrum|tibia|calcaneus")
def is_bone_load(p):
    return p["system"] == "skeletal" and LOAD_BEARING.search(name(p)) and "disk" not in name(p)

def is_bone_rest(p):
    return p["system"] == "skeletal" and not is_bone_load(p) and not re.search(r"tooth|gingiva", name(p))

ANTIGRAVITY = re.compile(r"soleus|gastrocnemius|vastus|rectus femoris|gluteus (maximus|medius)|"
                         r"iliocostalis lumborum|longissimus thoracis|psoas major")
def is_muscle(p):
    return p["system"] == "muscular" and ANTIGRAVITY.search(name(p))

def is_skin(p):
    return name(p) == "skin"

groups = {  # node name -> (filter, rgba). Colors are neutral defaults; the app recolors by status.
    "whole_body":        (is_skin,      [0.75, 0.85, 1.0, 0.12]),
    "brain":             (is_brain,     [0.85, 0.85, 0.9, 1]),
    "heart":             (is_heart,     [0.85, 0.85, 0.9, 1]),
    "blood":             (is_blood,     [0.85, 0.85, 0.9, 1]),
    "bones":             (is_bone_rest, [0.90, 0.90, 0.88, 1]),
    "bones_loadbearing": (is_bone_load, [0.90, 0.90, 0.88, 1]),
    "muscle_antigravity":(is_muscle,    [0.85, 0.6, 0.6, 1]),
}

import fast_simplification
# Fraction of triangles kept per node: enough for a premium look on a projector, light enough for a laptop.
KEEP = {"whole_body": 0.5, "brain": 0.2, "heart": 0.5, "blood": 0.5, "bones": 0.3,
        "bones_loadbearing": 0.6, "muscle_antigravity": 0.6}

scene = trimesh.Scene()
manifest = {"source": "BodyParts3D 4.0 via ashemag/human-atlas", "license": "CC BY 4.0", "nodes": {}}
for node, (flt, rgba) in groups.items():
    sel = [p for p in parts if flt(p)]
    m = trimesh.util.concatenate([mesh_of(p) for p in sel])
    keep = KEEP.get(node, 0.5)
    if keep < 1:
        v, f = fast_simplification.simplify(m.vertices.astype(np.float32), m.faces.astype(np.int32),
                                            target_reduction=1 - keep)
        m = trimesh.Trimesh(vertices=v, faces=f, process=False)
        _ = m.vertex_normals  # cache smooth normals so they are exported
    m.visual = trimesh.visual.TextureVisuals(material=trimesh.visual.material.PBRMaterial(
        name=node, baseColorFactor=rgba, metallicFactor=0.0, roughnessFactor=0.6,
        alphaMode="BLEND" if rgba[3] < 1 else "OPAQUE", doubleSided=rgba[3] < 1))
    scene.add_geometry(m, node_name=node, geom_name=node)
    manifest["nodes"][node] = {"structures": len(sel), "triangles": int(len(m.faces)),
                               "examples": sorted({p["name"] for p in sel})[:12]}
    print(f"{node:20s} {len(sel):4d} structures {len(m.faces):8d} tris")

# Center on the floor at x=z=0 so it drops into an R3F scene without fiddling.
lo, hi = scene.bounds
scene.apply_translation([-(lo[0] + hi[0]) / 2, -lo[1], -(lo[2] + hi[2]) / 2])
scene.export(out)
(out.with_suffix(".manifest.json")).write_text(json.dumps(manifest, indent=1))
print("height m:", round(hi[1] - lo[1], 3), "->", out)
