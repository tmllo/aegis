"""Full interactive body for AEGIS: skin, muscles, skeleton, arteries, veins, heart, brain, lungs, organs, LAD coronary.

Source: BodyParts3D 4.0 (CC BY 4.0) as packaged by ashemag/human-atlas (MIT).
Usage: python3 -I build_body_full.py <human-atlas/public/models> <out_dir>
Writes body.glb (node names below) and anchors.json (points the viewer pins labels / blockage to).
"""
import json, re, sys
from pathlib import Path
import numpy as np
import trimesh
import fast_simplification

src, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
out_dir.mkdir(parents=True, exist_ok=True)
atlas = json.loads((src / "atlas.json").read_text())
parts = atlas["parts"]
_chunks = {}


def chunk(i):
    if i not in _chunks:
        _chunks[i] = (src / f"body-{i}.bin").read_bytes()
    return _chunks[i]


def mesh_of(p):
    b = chunk(p["chunk"])
    v = np.frombuffer(b, np.float32, p["vertexCount"] * 3, p["positions"]).reshape(-1, 3)
    f = np.frombuffer(b, np.uint32, p["indexCount"], p["indices"]).reshape(-1, 3)
    return trimesh.Trimesh(vertices=v.copy(), faces=f.copy(), process=False)


nm = lambda p: p["name"].lower()
BRAIN_VENTRICLES = {"third ventricle", "fourth ventricle", "interventricular foramen", "left lateral ventricle", "right lateral ventricle"}
LAD = re.compile(r"anterior interventricular branch of left coronary|anterior descending branch of left coronary")
LOAD = re.compile(r"femur|hip bone|lumbar vertebra|sacrum|tibia|calcaneus")
ANTIGRAV = re.compile(r"soleus|gastrocnemius|vastus|rectus femoris|gluteus (maximus|medius)|iliocostalis lumborum|longissimus thoracis|psoas major")
ORGANS = re.compile(r"^stomach$|colon$|^pancreas$|kidney|spleen|bladder|adrenal|caudate lobe of liver|thymus|^trachea$|duodenum|rectum|esophagus|cecum")

is_brain = lambda p: (p["system"] == "nervous" and p["bounds"][0][1] > 1.45 and "nerve" not in nm(p)) or nm(p) in BRAIN_VENTRICLES
is_heart = lambda p: p["system"] == "cardiac" and nm(p) not in BRAIN_VENTRICLES
is_lad = lambda p: p["system"] == "arterial" and LAD.search(nm(p))
is_artery = lambda p: p["system"] == "arterial" and not is_lad(p)
is_vein = lambda p: p["system"] == "venous"
is_bone_load = lambda p: p["system"] == "skeletal" and LOAD.search(nm(p)) and "disk" not in nm(p)
is_bone = lambda p: p["system"] == "skeletal" and not is_bone_load(p) and "gingiva" not in nm(p)
is_mus_ag = lambda p: p["system"] == "muscular" and ANTIGRAV.search(nm(p))
is_mus = lambda p: p["system"] == "muscular" and not is_mus_ag(p)
is_airway = lambda p: p["system"] == "respiratory" and ("bronch" in nm(p) or nm(p) == "trachea")
is_organ = lambda p: p["system"] in ("digestive", "urinary", "lymphatic", "endocrine") and ORGANS.search(nm(p))
is_skin = lambda p: nm(p) == "skin"
EYE = re.compile(r"sclera|cornea|^(left|right) lens|optic nerve|iris|choroid$|vitreous")
is_eye = lambda p: (p["system"] == "sensory" and EYE.search(nm(p))) or "optic nerve" in nm(p) or "optic chiasm" in nm(p)

# node: (filter, fraction of triangles kept)
GROUPS = {
    "skin": (is_skin, 0.6),
    "muscles": (is_mus, 0.14),
    "muscle_antigravity": (is_mus_ag, 0.5),
    "bones": (is_bone, 0.3),
    "bones_loadbearing": (is_bone_load, 0.7),
    "arteries": (is_artery, 0.3),
    "artery_lad": (is_lad, 1.0),
    "veins": (is_vein, 0.3),
    "heart": (is_heart, 0.7),
    "brain": (is_brain, 0.3),
    "airways": (is_airway, 0.6),
    "organs": (is_organ, 0.5),
    "eyes": (is_eye, 0.5),
}


def decimate(m, keep):
    if keep >= 1:
        return m
    v, f = fast_simplification.simplify(m.vertices.astype(np.float32), m.faces.astype(np.int32), target_reduction=1 - keep)
    return trimesh.Trimesh(vertices=v, faces=f, process=False)


meshes, picked = {}, {}
for node, (flt, keep) in GROUPS.items():
    sel = [p for p in parts if flt(p)]
    picked[node] = sel
    m = trimesh.util.concatenate([mesh_of(p) for p in sel])
    meshes[node] = decimate(m, keep)
    print(f"{node:20s} {len(sel):4d} structures  {len(meshes[node].faces):7d} tris")

# Lungs: BodyParts3D 4.0 has no lung surface, so wrap each bronchial tree in a smoothed hull.
air = trimesh.util.concatenate([mesh_of(p) for p in picked["airways"] if "bronch" in nm(p)])
cx = np.median(air.vertices[:, 0])
for side, mask in (("lung_left", air.vertices[:, 0] > cx), ("lung_right", air.vertices[:, 0] <= cx)):
    pts = air.vertices[mask]
    hull = trimesh.convex.convex_hull(pts)
    c = hull.vertices.mean(0)
    hull.apply_translation(-c); hull.apply_scale([1.12, 1.08, 1.15]); hull.apply_translation(c)
    hull = hull.subdivide().subdivide()
    trimesh.smoothing.filter_taubin(hull, lamb=0.5, nu=-0.53, iterations=30)
    meshes[side] = hull
    print(f"{side:20s} hull {len(hull.faces)} tris")

# Center: feet on the floor, body on the y axis.
allv = np.vstack([m.vertices for m in meshes.values()])
lo, hi = allv.min(0), allv.max(0)
shift = np.array([-(lo[0] + hi[0]) / 2, -lo[1], -(lo[2] + hi[2]) / 2])
for m in meshes.values():
    m.apply_translation(shift)

scene = trimesh.Scene()
for node, m in meshes.items():
    _ = m.vertex_normals
    m.visual = trimesh.visual.TextureVisuals(material=trimesh.visual.material.PBRMaterial(name=node, baseColorFactor=[0.8, 0.8, 0.8, 1]))
    scene.add_geometry(m, node_name=node, geom_name=node)
scene.export(out_dir / "body.glb")


def center(node):
    b = meshes[node].bounds
    return ((b[0] + b[1]) / 2).round(4).tolist()


# LAD blockage point: 35% down the trunk from its top (origin near the left main stem).
trunk = trimesh.util.concatenate([mesh_of(p) for p in picked["artery_lad"] if nm(p).startswith("trunk of anterior interventricular")])
tv = trunk.vertices + shift
u, s, vt = np.linalg.svd(tv - tv.mean(0), full_matrices=False)
axis = vt[0] if vt[0][1] < 0 else -vt[0]  # pointing down toward the apex
proj = (tv - tv.mean(0)) @ axis
t = proj.min() + 0.35 * (proj.max() - proj.min())
block = tv[np.argmin(np.abs(proj - t))]

hb = meshes["heart"].bounds
anchors = {
    "height": float(hi[1] - lo[1]),
    "heart": center("heart"),
    "heart_top": [float((hb[0][0] + hb[1][0]) / 2), float(hb[1][1]), float((hb[0][2] + hb[1][2]) / 2)],
    "brain": center("brain"),
    "lungs": ((np.array(center("lung_left")) + np.array(center("lung_right"))) / 2).round(4).tolist(),
    "organs": center("organs"),
    "lad_block": block.round(4).tolist(),
    "lad_axis": axis.round(4).tolist(),
    "hip": center("bones_loadbearing"),
    "thigh": (np.array(center("muscle_antigravity")) + [0.0, -0.05, 0.0]).round(4).tolist(),
    "femur_left": (np.array([m for m in [meshes["bones_loadbearing"].vertices]][0][meshes["bones_loadbearing"].vertices[:, 0] > 0].mean(0))).round(4).tolist(),
    "skin_chest": [0.0, float(hb[1][1]) - 0.05, float(meshes["skin"].bounds[1][2])],
}
def box_of(flt, pad=0.0, down=0.0, up=0.0):
    v = np.vstack([mesh_of(p).vertices for p in parts if flt(p)]) + shift
    lo2, hi2 = v.min(0) - pad, v.max(0) + pad
    lo2[1] -= down; hi2[1] += up
    return {"c": ((lo2 + hi2) / 2).round(4).tolist(), "h": ((hi2 - lo2) / 2).round(4).tolist()}

anchors["boxes"] = {
    "heart": box_of(is_heart, 0.03),
    "brain": box_of(is_brain, 0.012),
    "pelvis": box_of(lambda p: p["system"] == "skeletal" and re.search(r"hip bone|sacrum|lumbar vertebra", nm(p)) and "disk" not in nm(p), 0.02, down=0.16),
    "thigh": box_of(lambda p: p["system"] == "muscular" and re.search(r"vastus|rectus femoris", nm(p)), 0.02),
    "metabolic": box_of(lambda p: nm(p) in ("stomach", "pancreas"), 0.025),
    "kidneys": box_of(lambda p: "kidney" in nm(p), 0.03),
    "jugular": box_of(lambda p: "internal jugular vein" in nm(p), 0.03),
    "eyes": box_of(lambda p: p["system"] == "sensory" and "sclera" in nm(p), 0.012),
}
(out_dir / "anchors.json").write_text(json.dumps(anchors, indent=1))
print(json.dumps(anchors))
