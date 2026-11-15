# Hero shot: Ana in the e^x second-skin sensor layer, floating at the ISS Cupola at orbital sunrise.
# Run (sandbox env for MPFB data): Blender -b <ana_base.blend> --factory-startup --python hero_cupola.py -- <assets_root> <out_dir> <pct> <samples> <png>
import bpy, bmesh, sys, os, math
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index('--') + 1:]
ROOT, OUT, PCT, SAMPLES, PNG = argv[0], argv[1], int(argv[2]), int(argv[3]), argv[4]
os.makedirs(OUT, exist_ok=True)
ENV = os.path.join(ROOT, '04-space-environment')
EARTH_DAY = os.path.join(ENV, 'earth-nasa-blue-marble/world.200407.16k.jpg')
EARTH_NIGHT = os.path.join(ENV, 'earth-nasa-blue-marble/BlackMarble_2016_3km.jpg')
CLOUDS = os.path.join(ENV, 'earth-solarsystemscope-8k-clouds-spec-normal/8k_earth_clouds.jpg')
SPEC = os.path.join(ENV, 'earth-solarsystemscope-8k-clouds-spec-normal/8k_earth_specular_map.tif')
STARS = os.path.join(ENV, 'starfield-nasa-svs-deep-star-maps-2020/starmap_2020_4k_print.jpg')
WEAVE = os.path.join(ENV, 'material-stretch_poplin/stretch_poplin_nor_gl_2k.jpg')

scene = bpy.context.scene
import shutil
TEX = os.path.join(OUT, 'textures'); os.makedirs(TEX, exist_ok=True)
for im_ in bpy.data.images:
    fp = im_.filepath
    if 'blender-assets/' in fp:
        src = os.path.join(ROOT, fp.split('blender-assets/', 1)[1])
        if os.path.exists(src):
            dst = os.path.join(TEX, os.path.basename(src))
            if not os.path.exists(dst): shutil.copy2(src, dst)
            im_.filepath = dst; im_.reload()
        else:
            print('MISSING', src)
for n in ('cam_portrait', 'key', 'rim', 'fill'):
    if n in bpy.data.objects: bpy.data.objects.remove(bpy.data.objects[n])
body = bpy.data.objects['ana_body']; arm = bpy.data.objects['ana_body.rig']
dg = bpy.context.evaluated_depsgraph_get

def hex_rgb(h, a=1.0):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((x / 12.92) if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4) for x in c) + (a,)
AMBER = hex_rgb('#f0b04a'); GREEN = hex_rgb('#5fcf96')

def bpos(name): return arm.matrix_world @ arm.pose.bones[name].head
face = bpos('oculi01.L') - bpos('head'); face.z = 0; face.normalize()
fy = 1 if face.y > 0 else -1
print('FACE', face)

# ---------- garment (full-body base layer), built in rest pose ----------
g = body.copy(); g.data = body.data.copy(); g.name = 'ex_garment'; scene.collection.objects.link(g)
for m in list(g.modifiers):
    if m.type == 'MASK': g.modifiers.remove(m)
keep = ('spine0', 'pelvis', 'clavicle', 'shoulder01', 'upperarm0', 'lowerarm0', 'upperleg0', 'lowerleg0', 'breast')
gi = {vg.index for vg in g.vertex_groups if vg.name.startswith(keep)}
body_i = g.vertex_groups['body'].index
wrist_i = {g.vertex_groups[n].index for n in ('wrist.L', 'wrist.R')}
foot_i = {g.vertex_groups[n].index for n in ('foot.L', 'foot.R')}
neck_i = {vg.index for vg in g.vertex_groups if vg.name.startswith('neck')}
bm = bmesh.new(); bm.from_mesh(g.data); dl = bm.verts.layers.deform.active
kill = []
neck_cut = (arm.matrix_world @ arm.data.bones['neck01'].head_local).z - 0.05
for v in bm.verts:
    d = v[dl]
    if (g.matrix_world @ v.co).z > neck_cut and abs((g.matrix_world @ v.co).x) < 0.085: kill.append(v); continue
    if d.get(body_i, 0) < 0.5: kill.append(v); continue
    w = sum(val for k, val in d.items() if k in gi)
    bad = sum(d.get(k, 0) for k in wrist_i | foot_i) + 0.9 * sum(d.get(k, 0) for k in neck_i)
    if w < 0.55 or bad > 0.18: kill.append(v)
killset = {v.index for v in kill}
interior = [v.index for v in bm.verts if v.index not in killset and all(e.other_vert(v).index not in killset for e in v.link_edges)]
bmesh.ops.delete(bm, geom=kill, context='VERTS'); bm.to_mesh(g.data); bm.free()
cov = body.vertex_groups.new(name='covered'); cov.add(interior, 1.0, 'REPLACE')
mk = body.modifiers.new('hide_covered', 'MASK'); mk.vertex_group = 'covered'; mk.invert_vertex_group = True
g.data.materials.clear()
d1 = g.modifiers.new('fit', 'DISPLACE'); d1.strength = 0.0035; d1.mid_level = 0
s1 = g.modifiers.new('thickness', 'SOLIDIFY'); s1.thickness = 0.002; s1.offset = 1
sm_ = g.modifiers.new('relax', 'SMOOTH'); sm_.factor = 0.8; sm_.iterations = 8
g.modifiers.move(g.modifiers.find('fit'), 0); g.modifiers.move(g.modifiers.find('relax'), 1); g.modifiers.move(g.modifiers.find('thickness'), 2)
g.modifiers.new('smooth', 'SUBSURF').levels = 1
body.modifiers.new('smooth', 'SUBSURF').levels = 1

# ---------- micro-gravity neutral body posture ----------
bpy.context.view_layer.objects.active = arm; bpy.ops.object.mode_set(mode='POSE')
Winv = arm.matrix_world.inverted().to_3x3()
def aim(bname, child, wdir):
    bpy.context.view_layer.update()
    pb = arm.pose.bones[bname]; head = pb.head.copy()
    cur = (arm.pose.bones[child].head - pb.head).normalized()
    R = cur.rotation_difference((Winv @ Vector(wdir)).normalized()).to_matrix().to_4x4()
    pb.matrix = Matrix.Translation(head) @ R @ Matrix.Translation(-head) @ pb.matrix
fwd = Vector((face.x, face.y, 0))
def fd(f, s, z, sx):  # forward, side, up -> world
    side = Vector((-fwd.y, fwd.x, 0)) * sx
    return tuple(fwd * f + side * s + Vector((0, 0, z)))
for s, sx in (('L', 1), ('R', -1)):
    # MPFB .L is the character's left; side sign chosen by geometry
    sgn = 1 if (bpos(f'upperarm01.{s}') - bpos('spine01')).dot(Vector((-fwd.y, fwd.x, 0))) > 0 else -1
    if sgn > 0:
        aim(f'upperarm01.{s}', f'lowerarm01.{s}', fd(0.55, 0.45 * sgn, -0.55, 1))
        aim(f'lowerarm01.{s}', f'wrist.{s}', fd(0.9, 0.12 * sgn, 0.25, 1))
    else:
        aim(f'upperarm01.{s}', f'lowerarm01.{s}', fd(0.25, 0.4 * sgn, -0.9, 1))
        aim(f'lowerarm01.{s}', f'wrist.{s}', fd(0.85, 0.05 * sgn, -0.35, 1))
    aim(f'upperleg01.{s}', f'lowerleg01.{s}', fd(0.55, 0.12 * sgn, -0.85, 1))
    aim(f'lowerleg01.{s}', f'foot.{s}', fd(-0.35, 0.05 * sgn, -0.9, 1))
aim('neck01', 'head', fd(0.25, 0, 1.0, 1))
bpy.ops.object.mode_set(mode='OBJECT'); bpy.context.view_layer.update()

# ---------- materials ----------
def mat(name):
    m = bpy.data.materials.new(name); m.use_nodes = True
    return m, m.node_tree.nodes, m.node_tree.links, m.node_tree.nodes['Principled BSDF']
def simple(name, col, rough, metal=0.0, coat=0.0, emis=None, strength=0.0, transmission=0.0):
    m, N, L, P = mat(name)
    P.inputs['Base Color'].default_value = col; P.inputs['Roughness'].default_value = rough
    P.inputs['Metallic'].default_value = metal; P.inputs['Coat Weight'].default_value = coat
    P.inputs['Transmission Weight'].default_value = transmission
    if emis: P.inputs['Emission Color'].default_value = emis; P.inputs['Emission Strength'].default_value = strength
    return m
fab, N, L, P = mat('ex_fabric_graphite')
P.inputs['Base Color'].default_value = hex_rgb('#17191c'); P.inputs['Roughness'].default_value = 0.78
P.inputs['Sheen Weight'].default_value = 0.35; P.inputs['Sheen Tint'].default_value = hex_rgb('#6b737d')
tc = N.new('ShaderNodeTexCoord'); mp = N.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (30, 30, 30)
L.new(tc.outputs['Object'], mp.inputs['Vector'])
im = N.new('ShaderNodeTexImage'); im.image = bpy.data.images.load(WEAVE); im.image.colorspace_settings.name = 'Non-Color'
im.projection = 'BOX'; im.projection_blend = 0.3; L.new(mp.outputs['Vector'], im.inputs['Vector'])
nm = N.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = 0.7
L.new(im.outputs['Color'], nm.inputs['Color']); L.new(nm.outputs['Normal'], P.inputs['Normal'])
g.data.materials.append(fab)
shell = simple('ex_shell', hex_rgb('#2a2d31'), 0.35, coat=0.4)
rubber = simple('ex_band', hex_rgb('#101113'), 0.55)
trace_m = simple('ex_trace_signal', hex_rgb('#3a2a10'), 0.4, metal=0.5, emis=AMBER, strength=2.2)
led_amber = simple('ex_led_amber', AMBER, 0.2, emis=AMBER, strength=40)
led_green = simple('ex_led_green', GREEN, 0.2, emis=GREEN, strength=25)
pad_m = simple('ex_electrode', hex_rgb('#4a4d52'), 0.35, metal=0.8)

# ---------- sensors on the posed garment ----------
def bvh(obj):
    ev = obj.evaluated_get(dg()); me = ev.to_mesh(); b = bmesh.new(); b.from_mesh(me); b.transform(obj.matrix_world)
    t = BVHTree.FromBMesh(b); ev.to_mesh_clear(); b.free(); return t
GB = bvh(g); BB = bvh(body)
side_v = Vector((-fwd.y, fwd.x, 0))
chest = bpos('spine01'); chest_z = chest.z - 0.02
def on_front(tree, s, z, depth_from=0.6):
    o = chest + side_v * s; o.z = z; o += fwd * depth_from
    h = tree.ray_cast(o, -fwd)
    return h if h[0] else None
def boxy(name, loc, nrm, scale, material, bevel=0.004):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc); o = bpy.context.object; o.name = name; o.scale = scale
    o.rotation_euler = nrm.to_track_quat('Y', 'Z').to_euler()
    b = o.modifiers.new('round', 'BEVEL'); b.width = bevel; b.segments = 5; b.limit_method = 'NONE'
    o.data.materials.append(material); bpy.ops.object.shade_smooth(); return o
h = on_front(GB, 0, chest_z)
hub = boxy('ex_chest_hub', h[0] + h[1] * 0.009, h[1], (0.058, 0.014, 0.04), shell)
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.0035, location=h[0] + h[1] * 0.017 + side_v * 0.018 + Vector((0, 0, 0.01)))
bpy.context.object.name = 'ex_hub_led'; bpy.context.object.data.materials.append(led_amber)
def trace(s0, z0, s1, z1, n=48):
    pts = []
    for i in range(n + 1):
        t = i / n; hh = on_front(GB, s0 + (s1 - s0) * t, z0 + (z1 - z0) * t + 0.01 * math.sin(math.pi * t))
        if hh: pts.append(hh[0] + hh[1] * 0.001)
    if len(pts) < 2: return
    cu = bpy.data.curves.new('ex_trace', 'CURVE'); cu.dimensions = '3D'; sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
    for i, p in enumerate(pts): sp.points[i].co = (*p, 1)
    cu.bevel_depth = 0.0008; o = bpy.data.objects.new('ex_trace', cu); scene.collection.objects.link(o); o.data.materials.append(trace_m)
for (s, dz) in ((-0.085, 0.08), (0.085, 0.08), (-0.07, -0.13), (0.08, -0.14), (0.03, -0.06)):
    hh = on_front(GB, s, chest_z + dz)
    if hh:
        bpy.ops.mesh.primitive_cylinder_add(radius=0.008, depth=0.0016, vertices=32, location=hh[0] + hh[1] * 0.001)
        e = bpy.context.object; e.name = 'ex_electrode'; e.rotation_euler = hh[1].to_track_quat('Z', 'Y').to_euler(); e.data.materials.append(pad_m)
        trace(s, chest_z + dz, 0.02 if s > 0 else -0.02, chest_z)
def ring(name, center, axis, radius, height, offset, thick, material, target):
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=radius, depth=height, location=center, end_fill_type='NOTHING')
    o = bpy.context.object; o.name = name; o.rotation_euler = Vector(axis).to_track_quat('Z', 'Y').to_euler()
    bpy.ops.object.transform_apply(rotation=True, scale=True)
    o.modifiers.new('sub', 'SUBSURF').levels = 2
    w = o.modifiers.new('wrap', 'SHRINKWRAP'); w.target = target; w.wrap_method = 'NEAREST_SURFACEPOINT'; w.offset = offset
    sm = o.modifiers.new('even', 'SMOOTH'); sm.factor = 1; sm.iterations = 12
    so = o.modifiers.new('thick', 'SOLIDIFY'); so.thickness = thick; so.offset = 1
    o.data.materials.append(material); bpy.ops.object.shade_smooth(); return o
ring('ex_resp_band', Vector((chest.x, chest.y, chest_z - 0.09)), (0, 0, 1), 0.07, 0.016, 0.003, 0.0014, rubber, g)
hd = bpos('head'); eye = bpos('oculi01.L')
ring('ex_headband', Vector((hd.x, hd.y, eye.z + 0.04)), tuple(Vector((0, 0, 1)) - fwd * 0.2), 0.05, 0.02, 0.009, 0.0025, rubber, body)
hh = BB.ray_cast(Vector((hd.x, hd.y, eye.z + 0.05)) + fwd * 0.5, -fwd)
if hh[0]:
    boxy('ex_forehead_sensor', hh[0] + hh[1] * 0.008, hh[1], (0.028, 0.007, 0.016), shell)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.0022, location=hh[0] + hh[1] * 0.0125 + side_v * 0.008)
    bpy.context.object.data.materials.append(led_green)
for s in ('L',):
    wr = bpos(f'wrist.{s}'); fa = bpos(f'lowerarm02.{s}'); dvec = (wr - fa).normalized(); c = wr - dvec * 0.035
    ring('ex_wrist_band', c, tuple(dvec), 0.06, 0.026, 0.006, 0.0045, rubber, body)

# skin: keep MPFB SSS, slightly rougher
for m in bpy.data.materials:
    if m.name.startswith('ana_body') and m.node_tree:
        for n in m.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED': n.inputs['Roughness'].default_value = max(0.45, n.inputs['Roughness'].default_value)

# ---------- Cupola (axis = Ana's forward), 6 trapezoid windows + round top window ----------
base_c = chest + fwd * 0.55 + Vector((0, 0, 0.25))
bm = bmesh.new()
res = bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=1.45, radius2=0.72, depth=0.6)
bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(30), 3, 'Z'))
bm.faces.ensure_lookup_table()
sides = [f for f in bm.faces if len(f.verts) == 4]
top = [f for f in bm.faces if len(f.verts) == 6 and f.calc_center_median().z > 0][0]
bottom = [f for f in bm.faces if len(f.verts) == 6 and f.calc_center_median().z < 0][0]
bmesh.ops.delete(bm, geom=[bottom], context='FACES_ONLY')
r = bmesh.ops.inset_individual(bm, faces=sides + [top], thickness=0.09, depth=0)
bmesh.ops.delete(bm, geom=sides + [top], context='FACES_ONLY')
cup_me = bpy.data.meshes.new('cupola_frame'); bm.to_mesh(cup_me); bm.free()
cup = bpy.data.objects.new('cupola_frame', cup_me); scene.collection.objects.link(cup)
cup.matrix_world = Matrix.Translation(base_c) @ fwd.to_track_quat('Z', 'Y').to_matrix().to_4x4()
so = cup.modifiers.new('thick', 'SOLIDIFY'); so.thickness = 0.06
bv = cup.modifiers.new('bevel', 'BEVEL'); bv.width = 0.008; bv.segments = 3
cup.data.materials.append(simple('cupola_aluminium', hex_rgb('#9a9fa6'), 0.45, metal=0.6))
# station wall around the cupola ring, with handrails
bpy.ops.mesh.primitive_circle_add(vertices=64, radius=2.6, fill_type='NGON', location=base_c)
wall = bpy.context.object; wall.name = 'module_wall'; wall.rotation_euler = fwd.to_track_quat('Z', 'Y').to_euler()
bm = bmesh.new(); bm.from_mesh(wall.data); bmesh.ops.inset_region(bm, faces=bm.faces[:], thickness=1.2)
inner = [f for f in bm.faces if len(f.verts) == 64][0]
bmesh.ops.delete(bm, geom=[inner], context='FACES_ONLY'); bm.to_mesh(wall.data); bm.free()
wall.modifiers.new('thick', 'SOLIDIFY').thickness = 0.05
wall.data.materials.append(simple('module_panel', hex_rgb('#d8d6d0'), 0.6))
for k in range(0):
    ang = k * 2.1
    p = base_c + (Vector((math.cos(ang), math.sin(ang), 0)) * 1.55) - fwd * 0.05
    bpy.ops.mesh.primitive_torus_add(major_radius=0.18, minor_radius=0.012, location=p)
    hr = bpy.context.object; hr.name = 'handrail'; hr.scale = (1, 0.35, 1)
    hr.data.materials.append(simple('handrail_yellow', hex_rgb('#c9a23c'), 0.4))

# ---------- Earth, clouds, atmosphere (scale 1 unit = 10 km) ----------
R = 637.1; ALT = 42.0
earth_dir = (fwd * math.cos(math.radians(62)) + Vector((0, 0, -math.sin(math.radians(62))))).normalized()
earth_c = base_c + earth_dir * (R + ALT)
sun_dir = (fwd * 0.55 + Vector((0, 0, 0.55)) - side_v * 0.6).normalized()  # toward the sun, just above the limb
def sphere(name, rad, segs=256):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=segs // 2, radius=rad, location=earth_c)
    o = bpy.context.object; o.name = name; bpy.ops.object.shade_smooth(); return o
earth = sphere('earth', R)
earth.rotation_euler = (math.radians(18), 0, math.radians(-75))  # Europe/Africa under the terminator
em, N, L, P = mat('earth_surface')
tc = N.new('ShaderNodeTexCoord')
day = N.new('ShaderNodeTexImage'); day.image = bpy.data.images.load(EARTH_DAY)
night = N.new('ShaderNodeTexImage'); night.image = bpy.data.images.load(EARTH_NIGHT)
spec = N.new('ShaderNodeTexImage'); spec.image = bpy.data.images.load(SPEC); spec.image.colorspace_settings.name = 'Non-Color'
for t in (day, night, spec): L.new(tc.outputs['UV'], t.inputs['Vector'])
L.new(day.outputs['Color'], P.inputs['Base Color'])
inv = N.new('ShaderNodeMapRange'); inv.inputs['To Min'].default_value = 0.75; inv.inputs['To Max'].default_value = 0.22
L.new(spec.outputs['Color'], inv.inputs['Value']); L.new(inv.outputs['Result'], P.inputs['Roughness'])
geo = N.new('ShaderNodeNewGeometry'); dot = N.new('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'
dot.inputs[1].default_value = sun_dir; L.new(geo.outputs['Normal'], dot.inputs[0])
mask = N.new('ShaderNodeMapRange'); mask.inputs['From Min'].default_value = 0.05; mask.inputs['From Max'].default_value = -0.15
L.new(dot.outputs['Value'], mask.inputs['Value'])
nl = N.new('ShaderNodeMath'); nl.operation = 'MULTIPLY'; nl.inputs[1].default_value = 3.5
L.new(mask.outputs['Result'], nl.inputs[0])
L.new(night.outputs['Color'], P.inputs['Emission Color']); L.new(nl.outputs[0], P.inputs['Emission Strength'])
earth.data.materials.append(em)
clouds = sphere('earth_clouds', R + 0.6); clouds.rotation_euler = earth.rotation_euler
cm, N, L, P = mat('earth_clouds')
ct = N.new('ShaderNodeTexImage'); ct.image = bpy.data.images.load(CLOUDS)
L.new(N.new('ShaderNodeTexCoord').outputs['UV'], ct.inputs['Vector'])
P.inputs['Base Color'].default_value = (1, 1, 1, 1); P.inputs['Roughness'].default_value = 0.9
L.new(ct.outputs['Color'], P.inputs['Alpha'])
clouds.data.materials.append(cm)
atm = sphere('earth_atmosphere', R + 3.0)
am = bpy.data.materials.new('atmosphere_rim'); am.use_nodes = True; N = am.node_tree.nodes; L = am.node_tree.links
N.remove(N['Principled BSDF'])
lw = N.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.06
pw = N.new('ShaderNodeMath'); pw.operation = 'POWER'; pw.inputs[1].default_value = 2.2; L.new(lw.outputs['Facing'], pw.inputs[0])
geo = N.new('ShaderNodeNewGeometry'); dot = N.new('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'; dot.inputs[1].default_value = sun_dir
L.new(geo.outputs['Normal'], dot.inputs[0])
lit = N.new('ShaderNodeMapRange'); lit.inputs['From Min'].default_value = -0.35; lit.inputs['From Max'].default_value = 0.25
L.new(dot.outputs['Value'], lit.inputs['Value'])
ramp = N.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].color = (0.9, 0.35, 0.08, 1); ramp.color_ramp.elements[1].color = (0.25, 0.55, 1.0, 1)
L.new(lit.outputs['Result'], ramp.inputs['Fac'])
mul = N.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; L.new(pw.outputs[0], mul.inputs[0]); L.new(lit.outputs['Result'], mul.inputs[1])
k = N.new('ShaderNodeMath'); k.operation = 'MULTIPLY'; k.inputs[1].default_value = 5.0; L.new(mul.outputs[0], k.inputs[0])
emi = N.new('ShaderNodeEmission'); L.new(ramp.outputs['Color'], emi.inputs['Color']); L.new(k.outputs[0], emi.inputs['Strength'])
tr = N.new('ShaderNodeBsdfTransparent'); add = N.new('ShaderNodeAddShader')
L.new(emi.outputs[0], add.inputs[0]); L.new(tr.outputs[0], add.inputs[1]); L.new(add.outputs[0], N['Material Output'].inputs['Surface'])
atm.data.materials.append(am); atm.visible_shadow = False
clouds.visible_shadow = False

# ---------- lights + world ----------
sd = bpy.data.lights.new('sun', 'SUN'); sd.energy = 6.0; sd.angle = math.radians(0.53); sd.color = (1.0, 0.93, 0.84)
sun = bpy.data.objects.new('sun', sd); scene.collection.objects.link(sun)
sun.rotation_euler = (-sun_dir).to_track_quat('-Z', 'Y').to_euler()
ld = bpy.data.lights.new('earthshine', 'AREA'); ld.shape = 'DISK'; ld.size = 4; ld.energy = 120; ld.color = (0.45, 0.6, 1.0)
es = bpy.data.objects.new('earthshine', ld); scene.collection.objects.link(es); es.location = base_c + earth_dir * 3
es.rotation_euler = (-earth_dir).to_track_quat('-Z', 'Y').to_euler()
ld = bpy.data.lights.new('cabin_fill', 'AREA'); ld.size = 1.5; ld.energy = 14; ld.color = (0.8, 0.88, 1.0)
cf = bpy.data.objects.new('cabin_fill', ld); scene.collection.objects.link(cf)
cf.location = chest - fwd * 1.6 - side_v * 1.2 + Vector((0, 0, 0.6))
cf.rotation_euler = (chest - cf.location).to_track_quat('-Z', 'Y').to_euler()
w = scene.world or bpy.data.worlds.new('W'); scene.world = w; w.use_nodes = True
st = w.node_tree.nodes.new('ShaderNodeTexEnvironment'); st.image = bpy.data.images.load(STARS)
w.node_tree.links.new(st.outputs['Color'], w.node_tree.nodes['Background'].inputs['Color'])
w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.08

# ---------- camera: behind-side of Ana, profile against the windows ----------
cd = bpy.data.cameras.new('cam'); cd.lens = 32; cd.sensor_width = 36; cd.clip_start = 0.05; cd.clip_end = 3000
cam = bpy.data.objects.new('cam_hero', cd); scene.collection.objects.link(cam)
cam.location = chest - fwd * 1.4 - side_v * 1.3 + Vector((0, 0, 0.05))
look = chest + fwd * 0.6 + Vector((0, 0, 0.1))
VIEW = argv[5] if len(argv) > 5 else 'back'
if VIEW == 'front':  # outside the Cupola, looking in through the top window at Ana's front
    cd.lens = 50
    cam.location = base_c + fwd * 2.3 + side_v * 0.25 + Vector((0, 0, -0.12))
    look = chest + Vector((0, 0, 0.1))
    # station interior behind her, so the background is a lit module, not open space
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=1.4, depth=4.0, end_fill_type='NOTHING', location=base_c - fwd * 2.05)
    tube = bpy.context.object; tube.name = 'module_interior'; tube.rotation_euler = fwd.to_track_quat('Z', 'Y').to_euler()
    for f in tube.data.polygons: f.flip()
    tube.data.materials.append(simple('module_interior_panel', hex_rgb('#5d6064'), 0.65))
    bpy.ops.mesh.primitive_circle_add(vertices=48, radius=1.4, fill_type='NGON', location=base_c - fwd * 4.0)
    back = bpy.context.object; back.name = 'module_back'; back.rotation_euler = fwd.to_track_quat('Z', 'Y').to_euler()
    back.data.materials.append(tube.data.materials[0])
    ld2 = bpy.data.lights.new('module_lamp', 'AREA'); ld2.size = 1.2; ld2.energy = 18; ld2.color = (0.92, 0.95, 1.0)
    ml = bpy.data.objects.new('module_lamp', ld2); scene.collection.objects.link(ml); ml.location = base_c - fwd * 2.2 + Vector((0, 0, 1.1))
cam.rotation_euler = (look - cam.location).to_track_quat('-Z', 'Y').to_euler()
cd.dof.use_dof = True; cd.dof.focus_distance = (hd - cam.location).length; cd.dof.aperture_fstop = 2.0
scene.camera = cam

r = scene.render; r.engine = 'CYCLES'; r.resolution_x = 1920; r.resolution_y = 1080; r.resolution_percentage = PCT
cy = scene.cycles; cy.samples = SAMPLES; cy.use_denoising = True; cy.device = 'GPU'; cy.max_bounces = 8; cy.transparent_max_bounces = 16
try:
    pr = bpy.context.preferences.addons['cycles'].preferences; pr.compute_device_type = 'METAL'; pr.get_devices()
    for dv in pr.devices: dv.use = True
except Exception as e:
    print('GPU', e); cy.device = 'CPU'
scene.view_settings.view_transform = 'AgX'; scene.view_settings.look = 'AgX - High Contrast'
scene.view_settings.exposure = 0.0
bpy.ops.file.make_paths_relative()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'ana_cupola_hero.blend'))
r.filepath = os.path.join(OUT, PNG); bpy.ops.render.render(write_still=True)
print('DONE')
