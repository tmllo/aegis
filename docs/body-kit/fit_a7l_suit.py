# Fits the Smithsonian 3D scan of the Apollo 11 A7L suit (CC0, 3d.si.edu) to the e^x body frame:
# upright, real size, feet at 0, centred, front = glTF +Z. The agency patches, flag, mission patch and
# name tag are painted out of the 4K base-colour textures (owner rule: no agency logos, no astronaut names).
# Usage: Blender -b --factory-startup --python fit_a7l_suit.py -- <web_glb_4k dir> <out.glb>
import bpy, sys, math, statistics
import numpy as np
from mathutils import Vector, Matrix
D, OUT = sys.argv[sys.argv.index('--') + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
for i in (1, 2, 3):
    bpy.ops.import_scene.gltf(filepath=f"{D}/suit-p{i}-web-high.glb")
ms = [o for o in bpy.data.objects if o.type == 'MESH']
# scan is in mm, lying down, facing +X: stand it up and turn it to face -Y (glTF +Z)
R = Matrix.Rotation(math.radians(-90), 4, 'Z') @ Matrix.Rotation(math.radians(-90), 4, 'X') @ Matrix.Scale(0.001, 4)
for o in ms:
    o.data = o.data.copy(); o.data.transform(R @ o.matrix_world); o.matrix_world = Matrix.Identity(4)
vs = [v.co for o in ms for v in o.data.vertices]
zmin = min(v.z for v in vs); zmax = max(v.z for v in vs)
cx = (min(v.x for v in vs) + max(v.x for v in vs)) / 2
legs = [v for v in vs if zmin + 0.12 * (zmax - zmin) < v.z < zmin + 0.30 * (zmax - zmin)]
cy = (min(v.y for v in legs) + max(v.y for v in legs)) / 2
for o in ms:
    o.data.transform(Matrix.Translation(Vector((-cx, -cy, -zmin))))
print("FIT height", zmax - zmin, "centre", cx, cy)

# patches as boxes in front-view world space (x, z) after the fit above, measured from a front render
H = zmax - zmin
def box(px0, py0, px1, py1):  # pixels in a 1200x1600 ortho render, scale 1.9425 m, centred on the bbox
    s = 1.9425 / 1600; c = (0.0146 - cx, 0.920 - zmin)
    return (c[0] + (px0 - 600) * s, c[1] + (800 - py1) * s, c[0] + (px1 - 600) * s, c[1] + (800 - py0) * s)
BOXES = [box(492, 386, 553, 454), box(566, 414, 644, 446), box(651, 391, 724, 466), box(760, 334, 886, 446)]
fab = None
for o in ms:
    me = o.data; uv = me.uv_layers.active.data
    mat = o.material_slots[0].material
    img = next(n.image for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE' and any(l.to_socket.name == 'Base Color' for l in n.outputs[0].links))
    W, Hh = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(Hh, W, 4)
    tris = []
    for p in me.polygons:
        c = p.center
        if p.normal.y > -0.15: continue  # front-facing only
        if any(b[0] <= c.x <= b[2] and b[1] <= c.z <= b[3] for b in BOXES):
            tris.append([uv[li].uv[:] for li in p.loop_indices])
    if not tris: continue
    m = np.zeros((Hh, W), bool)  # rows top-down in UV v; flipped to Blender's bottom-up below
    for tri in tris:
        P = np.array([(u * W, v * Hh) for u, v in tri])
        for k in range(1, len(P) - 1):  # fan-triangulate quads and n-gons
            a, b, c = P[0], P[k], P[k + 1]
            x0, y0 = np.floor(np.minimum(np.minimum(a, b), c)).astype(int); x1, y1 = np.ceil(np.maximum(np.maximum(a, b), c)).astype(int)
            x0, y0 = max(x0, 0), max(y0, 0); x1, y1 = min(x1, W - 1), min(y1, Hh - 1)
            if x1 < x0 or y1 < y0: continue
            X, Y = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
            den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
            if abs(den) < 1e-9: continue
            l1 = ((b[1] - c[1]) * (X - c[0]) + (c[0] - b[0]) * (Y - c[1])) / den
            l2 = ((c[1] - a[1]) * (X - c[0]) + (a[0] - c[0]) * (Y - c[1])) / den
            inside = (l1 >= -0.02) & (l2 >= -0.02) & (1 - l1 - l2 >= -0.02)
            m[y0:y1 + 1, x0:x1 + 1] |= inside
    def grow(a, r):
        out = a.copy()
        for _ in range(r):
            g = out.copy(); g[1:] |= out[:-1]; g[:-1] |= out[1:]; g[:, 1:] |= out[:, :-1]; g[:, :-1] |= out[:, 1:]; out = g
        return out
    region = grow(m, 2)
    ring = grow(region, 24) & ~region
    col = np.median(px[ring][:, :3], axis=0) if ring.any() else np.array([0.85, 0.83, 0.78])
    # only the patch pixels inside the boxes change: anything clearly off the fabric colour, plus a small margin
    diff = np.abs(px[:, :, :3] - col).max(axis=2)
    sat = px[:, :, :3].max(axis=2) - px[:, :, :3].min(axis=2)
    hole = grow(region & ((diff > 0.10) | (sat > 0.10)), 3) & region
    # inpaint: repeated neighbour averaging from the fabric around the hole keeps its shading gradients
    ys, xs = np.where(hole)
    y0, y1, x0, x1 = max(ys.min() - 30, 0), min(ys.max() + 30, Hh), max(xs.min() - 30, 0), min(xs.max() + 30, W)
    sub = px[y0:y1, x0:x1, :3].copy(); h = hole[y0:y1, x0:x1]
    sub[h] = col
    for _ in range(400):
        avg = (np.roll(sub, 1, 0) + np.roll(sub, -1, 0) + np.roll(sub, 1, 1) + np.roll(sub, -1, 1)) / 4
        sub[h] = avg[h]
    sub[h] = np.clip(sub[h] + np.random.RandomState(1).normal(0, 0.012, sub[h].shape), 0, 1)
    px[y0:y1, x0:x1, :3] = sub
    img.pixels[:] = px.ravel()
    img.update()
    print("PAINTED", o.name, len(tris), "faces, fabric", col)
# keep base colour at 4K, smaller data maps at 2K to hold the file size down
for im in bpy.data.images:
    if im.size[0] == 4096 and not any(n.type == 'TEX_IMAGE' and n.image == im and any(l.to_socket.name == 'Base Color' for l in n.outputs[0].links) for mat in bpy.data.materials if mat.use_nodes for n in mat.node_tree.nodes):
        im.scale(2048, 2048)
for i, o in enumerate(ms):
    o.name = f"suit_{i}"
bpy.ops.object.select_all(action='DESELECT')
for o in ms: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_yup=True,
                          export_image_format='JPEG', export_jpeg_quality=88, export_draco_mesh_compression_enable=False)
print("WROTE", OUT)
