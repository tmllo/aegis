# Build concept A "Second skin": e^x sensor garment on a Rocketbox avatar.
# Run: Blender -b --factory-startup --python build_second_skin.py -- <assets_root> <out_dir> <res_pct> <samples>
import bpy, bmesh, sys, os, math
from mathutils import Vector, Matrix, Quaternion
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index('--') + 1:]
ROOT, OUT = argv[0], argv[1]
RES_PCT, SAMPLES = int(argv[2]), int(argv[3])
os.makedirs(OUT, exist_ok=True)

AV = os.path.join(ROOT, '02-human-bodies/rocketbox-avatars/Sports_Male_04/Sports_Male_04.blend')
HDRI = os.path.join(ROOT, '04-space-environment/hdri-studio_small_09/studio_small_09_4k.hdr')
WEAVE = os.path.join(ROOT, '04-space-environment/material-stretch_poplin/stretch_poplin_nor_gl_2k.jpg')

bpy.ops.wm.open_mainfile(filepath=AV)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'A-second-skin.blend'))  # remaps texture paths
scene = bpy.context.scene
arm = bpy.data.objects['Bip01']
body = bpy.data.objects['m026_hipoly_81_bones']
dg = bpy.context.evaluated_depsgraph_get

def hex_rgb(h, a=1.0):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((x / 12.92) if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4) for x in c) + (a,)

ACCENT = hex_rgb('#5fcf96')  # e^x "normal" status green from the Cockpit Glass palette

# ---------- facing direction and key heights (rest pose, world space) ----------
B = arm.data.bones
W = arm.matrix_world
def wpos(name, tail=False):
    b = B[name]; return W @ (b.tail_local if tail else b.head_local)
face = (wpos('Bip01 LEye') - wpos('Bip01 Head')); face.z = 0; face.normalize()
fy = 1 if face.y > 0 else -1
neck_z = wpos('Bip01 Neck').z
hem_z = wpos('Bip01 Pelvis').z - 0.05
wrist_x = abs(wpos('Bip01 L Hand').x) - 0.025
print('FACE', face, 'neck', neck_z, 'hem', hem_z, 'wrist', wrist_x)

# ---------- garment: copy of body, keep torso + arms, before posing ----------
g = body.copy(); g.data = body.data.copy(); g.name = 'ex_garment'
scene.collection.objects.link(g)
keep_groups = {'Bip01 Spine', 'Bip01 Spine1', 'Bip01 Spine2', 'Bip01 L Clavicle', 'Bip01 R Clavicle',
               'Bip01 L UpperArm', 'Bip01 R UpperArm', 'Bip01 L Forearm', 'Bip01 R Forearm', 'Bip01 Pelvis', 'Bip01 Neck'}
gi = {vg.index for vg in g.vertex_groups if vg.name in keep_groups}
neck_i = g.vertex_groups['Bip01 Neck'].index
bm = bmesh.new(); bm.from_mesh(g.data)
dl = bm.verts.layers.deform.active
gm = g.matrix_world
kill = []
for v in bm.verts:
    p = gm @ v.co
    w = sum(val for k, val in v[dl].items() if k in gi)
    nk = v[dl].get(neck_i, 0.0)
    ok = w > 0.5 and p.z > hem_z and abs(p.x) < wrist_x and not (p.z > neck_z + 0.012)
    if not ok: kill.append(v)
killset = set(v.index for v in kill)
interior = [v.index for v in bm.verts if v.index not in killset and all(e.other_vert(v).index not in killset for e in v.link_edges)]
cov = body.vertex_groups.new(name='covered'); cov.add(interior, 1.0, 'REPLACE')
bmesh.ops.delete(bm, geom=kill, context='VERTS')
bm.to_mesh(g.data); bm.free()
g.data.materials.clear()
# order: offset from skin, thickness, then skeleton, then smooth
disp = g.modifiers.new('fit', 'DISPLACE'); disp.strength = 0.0045; disp.mid_level = 0.0
sol = g.modifiers.new('thickness', 'SOLIDIFY'); sol.thickness = 0.0025; sol.offset = 1
while g.modifiers[0].name != 'fit':
    bpy.ops.object.modifier_move_up({'object': g}, modifier='fit') if False else g.modifiers.move(g.modifiers.find('fit'), 0)
g.modifiers.move(g.modifiers.find('thickness'), 1)
sub = g.modifiers.new('smooth', 'SUBSURF'); sub.levels = 1; sub.render_levels = 2
mk = body.modifiers.new('hide_covered', 'MASK'); mk.vertex_group = 'covered'; mk.invert_vertex_group = True
bs = body.modifiers.new('smooth', 'SUBSURF'); bs.levels = 1; bs.render_levels = 1

# ---------- pose: arms relaxed down, slight elbow bend, weight shift ----------
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='POSE')
Winv = W.inverted().to_3x3()
def aim(bname, child, target_world_dir):
    pb = arm.pose.bones[bname]
    bpy.context.view_layer.update()
    head = pb.head.copy(); cur = (arm.pose.bones[child].head - pb.head).normalized()
    tgt = (Winv @ Vector(target_world_dir)).normalized()
    R = cur.rotation_difference(tgt).to_matrix().to_4x4()
    pb.matrix = Matrix.Translation(head) @ R @ Matrix.Translation(-head) @ pb.matrix
    bpy.context.view_layer.update()
side = lambda s: 1 if wpos(f'Bip01 {s} Hand').x > 0 else -1
for s in ('L', 'R'):
    sx = side(s)
    aim(f'Bip01 {s} UpperArm', f'Bip01 {s} Forearm', (0.30 * sx, 0.06 * fy, -1.0))
    aim(f'Bip01 {s} Forearm', f'Bip01 {s} Hand', (0.12 * sx, 0.38 * fy, -1.0))
    aim(f'Bip01 {s} Hand', f'Bip01 {s} Finger2', (0.08 * sx, 0.30 * fy, -1.0))
# subtle head turn toward camera side and chin down
hb = arm.pose.bones['Bip01 Head']; hb.rotation_mode = 'XYZ'
bpy.ops.object.mode_set(mode='OBJECT')
bpy.context.view_layer.update()

# ---------- materials ----------
def mat(name):
    m = bpy.data.materials.new(name); m.use_nodes = True
    return m, m.node_tree.nodes, m.node_tree.links, m.node_tree.nodes['Principled BSDF']

fab, N, L, P = mat('ex_fabric_graphite')
P.inputs['Base Color'].default_value = hex_rgb('#26282b')
P.inputs['Roughness'].default_value = 0.82
P.inputs['Sheen Weight'].default_value = 0.25
P.inputs['Sheen Roughness'].default_value = 0.35
P.inputs['Sheen Tint'].default_value = hex_rgb('#5a6068')
tc = N.new('ShaderNodeTexCoord'); mp = N.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (22, 22, 22)
L.new(tc.outputs['Object'], mp.inputs['Vector'])
img = N.new('ShaderNodeTexImage'); img.image = bpy.data.images.load(WEAVE); img.image.colorspace_settings.name = 'Non-Color'
img.projection = 'BOX'; img.projection_blend = 0.3
L.new(mp.outputs['Vector'], img.inputs['Vector'])
nm = N.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = 0.6
L.new(img.outputs['Color'], nm.inputs['Color'])
# panels: lighter side panels + chest/back respiration band, via object-space masks
sep = N.new('ShaderNodeSeparateXYZ'); L.new(tc.outputs['Object'], sep.inputs['Vector'])
ax = N.new('ShaderNodeMath'); ax.operation = 'ABSOLUTE'; L.new(sep.outputs['X'], ax.inputs[0])
side_m = N.new('ShaderNodeMapRange'); side_m.inputs['From Min'].default_value = 0.125; side_m.inputs['From Max'].default_value = 0.131
L.new(ax.outputs[0], side_m.inputs['Value'])
mix = N.new('ShaderNodeMix'); mix.data_type = 'RGBA'
mix.inputs[6].default_value = hex_rgb('#131417'); mix.inputs[7].default_value = hex_rgb('#1f2226')
L.new(side_m.outputs['Result'], mix.inputs['Factor'])
L.new(mix.outputs[2], P.inputs['Base Color'])
# seam ridge along the panel edge as bump
edge = N.new('ShaderNodeMath'); edge.operation = 'PINGPONG'
seam = N.new('ShaderNodeMapRange'); seam.inputs['From Min'].default_value = 0.122; seam.inputs['From Max'].default_value = 0.128
seam.interpolation_type = 'SMOOTHERSTEP'
sw = N.new('ShaderNodeMath'); sw.operation = 'SUBTRACT'; sw.inputs[0].default_value = 1.0
L.new(ax.outputs[0], seam.inputs['Value'])
tri = N.new('ShaderNodeMath'); tri.operation = 'MULTIPLY'
one_minus = N.new('ShaderNodeMath'); one_minus.operation = 'SUBTRACT'; one_minus.inputs[0].default_value = 1
L.new(seam.outputs['Result'], one_minus.inputs[1])
L.new(seam.outputs['Result'], tri.inputs[0]); L.new(one_minus.outputs[0], tri.inputs[1])
bump = N.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.8; bump.inputs['Distance'].default_value = 0.002
L.new(tri.outputs[0], bump.inputs['Height']); L.new(nm.outputs['Normal'], bump.inputs['Normal'])
L.new(bump.outputs['Normal'], P.inputs['Normal'])
g.data.materials.append(fab)

def simple(name, col, rough, metal=0.0, coat=0.0, emis=None, strength=0.0):
    m, N2, L2, P2 = mat(name)
    P2.inputs['Base Color'].default_value = col
    P2.inputs['Roughness'].default_value = rough
    P2.inputs['Metallic'].default_value = metal
    P2.inputs['Coat Weight'].default_value = coat
    if emis:
        P2.inputs['Emission Color'].default_value = emis; P2.inputs['Emission Strength'].default_value = strength
    return m
shell = simple('ex_shell_white', hex_rgb('#c9c6bf'), 0.42, coat=0.2)
rubber = simple('ex_band_rubber', hex_rgb('#1c1d1f'), 0.6)
thread = simple('ex_conductive_thread', hex_rgb('#8d939a'), 0.35, metal=0.85)
pad_m = simple('ex_electrode', hex_rgb('#3a3d41'), 0.45, metal=0.6)
led = simple('ex_status_led', ACCENT, 0.2, emis=ACCENT, strength=6.0)
glass = simple('ex_display', hex_rgb('#0b0c0d'), 0.08, coat=1.0)

# skin realism tweak
for m in body.data.materials:
    p = m.node_tree.nodes.get('Principled BSDF')
    if p:
        p.inputs['Subsurface Weight'].default_value = 0.12
        p.inputs['Subsurface Radius'].default_value = (0.9, 0.35, 0.2)
        p.inputs['Subsurface Scale'].default_value = 0.004
        p.inputs['Roughness'].default_value = 0.52

# ---------- surface helpers on the posed, evaluated garment ----------
bpy.context.view_layer.update()
def bvh_of(obj):
    ev = obj.evaluated_get(dg()); me = ev.to_mesh()
    bmx = bmesh.new(); bmx.from_mesh(me); bmx.transform(obj.matrix_world)
    t = BVHTree.FromBMesh(bmx); ev.to_mesh_clear(); bmx.free(); return t
GB = bvh_of(g)
front = Vector((0, fy, 0))
def on_front(x, z):
    hit = GB.ray_cast(Vector((x, fy * 1.0, z)), -front)
    return hit if hit[0] else None

# chest hub at sternum
s2 = (arm.matrix_world @ arm.pose.bones['Bip01 Spine2'].head)
hub_z = s2.z + 0.03
loc, nrm, _, _ = on_front(0.0, hub_z)
bpy.ops.mesh.primitive_cube_add(size=1, location=loc + nrm * 0.008)
hub = bpy.context.object; hub.name = 'ex_chest_hub'; hub.scale = (0.064, 0.016, 0.044)
hub.rotation_euler = nrm.to_track_quat('Y' if fy > 0 else '-Y', 'Z').to_euler()
bv = hub.modifiers.new('round', 'BEVEL'); bv.width = 0.006; bv.segments = 6; bv.limit_method = 'NONE'
hub.data.materials.append(shell)
bpy.ops.object.shade_smooth()
bpy.ops.mesh.primitive_cylinder_add(radius=0.0028, depth=0.003, location=loc + nrm * 0.0165 + Vector((0.021, 0, 0.012)))
l1 = bpy.context.object; l1.name = 'ex_hub_led'; l1.rotation_euler = hub.rotation_euler.copy(); l1.rotation_euler.x += math.pi / 2
l1.data.materials.append(led)

# electrodes (ECG limb leads + chest) and conductive traces to the hub
pads = [(-0.095, hub_z + 0.075), (0.095, hub_z + 0.075), (-0.075, hub_z - 0.12), (0.085, hub_z - 0.13), (0.035, hub_z - 0.05)]
def place_pad(x, z):
    h = on_front(x, z)
    if not h: return None
    p, n = h[0], h[1]
    bpy.ops.mesh.primitive_cylinder_add(radius=0.009, depth=0.0018, vertices=32, location=p + n * 0.0015)
    o = bpy.context.object; o.name = 'ex_electrode'
    o.rotation_euler = n.to_track_quat('Z', 'Y').to_euler()
    bv = o.modifiers.new('round', 'BEVEL'); bv.width = 0.001; bv.segments = 3
    o.data.materials.append(pad_m); bpy.ops.object.shade_smooth()
    return p
def trace(x0, z0, x1, z1, n=40, name='ex_trace'):
    pts = []
    for i in range(n + 1):
        t = i / n
        x = x0 + (x1 - x0) * t; z = z0 + (z1 - z0) * t + 0.012 * math.sin(math.pi * t)
        h = on_front(x, z)
        if h: pts.append(h[0] + h[1] * 0.0012)
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'
    sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
    for i, p in enumerate(pts): sp.points[i].co = (p.x, p.y, p.z, 1)
    cu.bevel_depth = 0.0009; cu.bevel_resolution = 2
    o = bpy.data.objects.new(name, cu); scene.collection.objects.link(o)
    o.data.materials.append(thread)
for (x, z) in pads:
    if place_pad(x, z):
        trace(x, z, 0.0 + (0.02 if x > 0 else -0.02), hub_z, name='ex_trace')

# respiration band, headband and wrist unit: open cylinders shrink-wrapped to the body
def wrap_ring(name, center, axis, radius, height, offset, thick, material, target):
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=radius, depth=height, location=center, end_fill_type='NOTHING')
    o = bpy.context.object; o.name = name
    o.rotation_euler = Vector(axis).to_track_quat('Z', 'Y').to_euler()
    bpy.ops.object.transform_apply(rotation=True, scale=True)
    o.modifiers.new('sub', 'SUBSURF').levels = 2
    sw = o.modifiers.new('wrap', 'SHRINKWRAP'); sw.target = target; sw.wrap_method = 'NEAREST_SURFACEPOINT'; sw.offset = offset
    sm = o.modifiers.new('even', 'SMOOTH'); sm.factor = 1.0; sm.iterations = 12
    so = o.modifiers.new('thick', 'SOLIDIFY'); so.thickness = thick; so.offset = 1
    bv = o.modifiers.new('round', 'BEVEL'); bv.width = thick * 0.4; bv.segments = 3
    o.data.materials.append(material); bpy.ops.object.shade_smooth()
    return o
head = arm.matrix_world @ arm.pose.bones['Bip01 Head'].head
eyes = arm.matrix_world @ arm.pose.bones['Bip01 LEye'].head
wrap_ring('ex_resp_band', Vector((0, s2.y, hub_z - 0.085)), (0, 0, 1), 0.2, 0.016, 0.0035, 0.0014, rubber, g)
hb_ring = wrap_ring('ex_headband', Vector((head.x, head.y, eyes.z + 0.045)), (0, 0.18 * -fy, 1), 0.13, 0.024, 0.004, 0.0022, rubber, body)
# forehead sensor pod on the headband
hb_hit = bvh_of(body).ray_cast(Vector((0, fy * 1.0, eyes.z + 0.045)), -front)
if hb_hit[0]:
    bpy.ops.mesh.primitive_cube_add(size=1, location=hb_hit[0] + hb_hit[1] * 0.007)
    pod = bpy.context.object; pod.name = 'ex_forehead_sensor'; pod.scale = (0.03, 0.007, 0.018)
    pod.rotation_euler = hb_hit[1].to_track_quat('Y' if fy > 0 else '-Y', 'Z').to_euler()
    b2 = pod.modifiers.new('round', 'BEVEL'); b2.width = 0.004; b2.segments = 5; b2.limit_method = 'NONE'
    pod.data.materials.append(shell); bpy.ops.object.shade_smooth()
# wrist unit on the left wrist (the arm nearer the viewer is decided by camera below)
for s in ('L',):
    hand = arm.matrix_world @ arm.pose.bones[f'Bip01 {s} Hand'].head
    fore = arm.matrix_world @ arm.pose.bones[f'Bip01 {s} Forearm'].head
    d = (hand - fore).normalized(); c = hand - d * 0.04
    wr = wrap_ring('ex_wrist_band', c, d, 0.06, 0.026, 0.006, 0.0045, rubber, body)
    hit = bvh_of(body).ray_cast(c + Vector((0, fy * 0.3, 0)), Vector((0, -fy, 0)))
    if hit[0]:
        bpy.ops.mesh.primitive_cube_add(size=1, location=hit[0] + hit[1] * 0.009)
        face_o = bpy.context.object; face_o.name = 'ex_wrist_unit'; face_o.scale = (0.03, 0.009, 0.038)
        face_o.rotation_euler = hit[1].to_track_quat('Y' if fy > 0 else '-Y', 'Z').to_euler()
        b3 = face_o.modifiers.new('round', 'BEVEL'); b3.width = 0.004; b3.segments = 6; b3.limit_method = 'NONE'
        face_o.data.materials.append(shell); face_o.data.materials.append(glass); bpy.ops.object.shade_smooth()

# ---------- studio: backdrop, lights, world, camera ----------
bpy.ops.mesh.primitive_plane_add(size=12, location=(0, -fy * 2.2, 3))
bd = bpy.context.object; bd.name = 'backdrop'; bd.rotation_euler = (math.pi / 2, 0, 0)
bd.data.materials.append(simple('backdrop_grey', hex_rgb('#0e0f10'), 0.9))
bpy.ops.mesh.primitive_plane_add(size=12, location=(0, 0, 0)); fl = bpy.context.object; fl.name = 'floor'
fl.data.materials.append(simple('floor_grey', hex_rgb('#121314'), 0.85))

w = scene.world or bpy.data.worlds.new('World'); scene.world = w; w.use_nodes = True
wn = w.node_tree.nodes; wl = w.node_tree.links
env = wn.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(HDRI)
wl.new(env.outputs['Color'], wn['Background'].inputs['Color']); wn['Background'].inputs['Strength'].default_value = 0.05

def area(name, loc, size, power, color, target):
    ld = bpy.data.lights.new(name, 'AREA'); ld.shape = 'RECTANGLE'; ld.size = size[0]; ld.size_y = size[1]
    ld.energy = power; ld.color = color
    o = bpy.data.objects.new(name, ld); scene.collection.objects.link(o); o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    return o
tgt = (0, 0, hub_z)
area('key_soft', (1.6, fy * 1.9, hub_z + 0.9), (1.2, 1.6), 300, (1.0, 0.96, 0.9), tgt)
area('rim_cool', (-1.3, -fy * 1.3, hub_z + 0.6), (0.4, 1.8), 700, (0.75, 0.85, 1.0), tgt)
area('rim_warm', (1.2, -fy * 1.2, hub_z + 0.4), (0.3, 1.6), 260, (1.0, 0.9, 0.8), tgt)
area('fill', (-1.8, fy * 1.6, hub_z - 0.2), (2.0, 2.0), 60, (0.85, 0.9, 1.0), tgt)

cd = bpy.data.cameras.new('cam'); cd.lens = 55; cd.sensor_width = 36
cam = bpy.data.objects.new('cam_hero', cd); scene.collection.objects.link(cam)
cam.location = (0.9, fy * 2.75, hub_z + 0.12)
look = Vector((-0.02, 0.0, hub_z - 0.02))
cam.rotation_euler = (look - cam.location).to_track_quat('-Z', 'Y').to_euler()
cd.dof.use_dof = True; cd.dof.focus_object = hub; cd.dof.aperture_fstop = 2.2
scene.camera = cam

# ---------- render ----------
r = scene.render; r.engine = 'CYCLES'; r.resolution_x = 1600; r.resolution_y = 900; r.resolution_percentage = RES_PCT
cy = scene.cycles; cy.samples = SAMPLES; cy.use_denoising = True; cy.device = 'GPU'
try:
    pr = bpy.context.preferences.addons['cycles'].preferences; pr.compute_device_type = 'METAL'; pr.get_devices()
    for dv in pr.devices: dv.use = True
except Exception as e:
    print('GPU setup failed', e); cy.device = 'CPU'
scene.view_settings.view_transform = 'AgX'; scene.view_settings.look = 'AgX - Medium High Contrast'
for o in list(scene.objects):
    if o.type == 'MESH' and o.name not in ('backdrop', 'floor') and o.parent is None and o.name.startswith('ex_') is False and o is not body and o is not g:
        pass
bpy.ops.file.make_paths_relative()
bpy.ops.wm.save_mainfile()
r.filepath = os.path.join(OUT, argv[4] if len(argv) > 4 else 'A-second-skin_v1.png')
bpy.ops.render.render(write_still=True)
print('DONE', r.filepath)
