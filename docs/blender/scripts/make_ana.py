# Create "Ana" (the demo astronaut) with MPFB in a sandboxed Blender config, then render a portrait test.
# Run with BLENDER_USER_RESOURCES=<sandbox>: Blender -b --factory-startup --python make_ana.py -- <assets_root> <out_dir> <pack_zip>
import bpy, sys, os, zipfile, math, addon_utils
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
ROOT, OUT, PACK = argv
os.makedirs(OUT, exist_ok=True)
mod = [m.__name__ for m in addon_utils.modules() if m.__name__.endswith('mpfb')][0]
bpy.ops.preferences.addon_enable(module=mod)
import importlib
HS = importlib.import_module(mod + '.services.humanservice').HumanService
LS = importlib.import_module(mod + '.services.locationservice').LocationService

data = LS.get_user_data() if not callable(getattr(LS, 'get_user_data', None)) or isinstance(LS, type) and False else None
try:
    data = LS.get_user_data()
except TypeError:
    data = importlib.import_module(mod + '.services.locationservice').LocationService().get_user_data()
print('USERDATA', data)
if not os.path.exists(os.path.join(data, 'skins', 'middleage_caucasian_female')):
    with zipfile.ZipFile(PACK) as z:
        for n in z.namelist():  # data files only; refuse path traversal
            if n.startswith('/') or '..' in n.split('/'): continue
            z.extract(n, data)

for o in list(bpy.data.objects): bpy.data.objects.remove(o)
macro = {"gender": 0.0, "age": 0.62, "muscle": 0.62, "weight": 0.45, "proportions": 0.65, "height": 0.58,
         "cupsize": 0.45, "firmness": 0.55, "race": {"asian": 0.15, "caucasian": 0.7, "african": 0.15}}
body = HS.create_human(macro_detail_dict=macro, scale=0.1)
body.name = 'ana_body'
HS.add_builtin_rig(body, 'default')
D = lambda *p: os.path.join(data, *p)
def first(folder, ext):
    for f in sorted(os.listdir(D(folder))):
        if f.endswith(ext): return D(folder, f)
HS.set_character_skin(first('skins/middleage_caucasian_female', '.mhmat'), body, skin_type='ENHANCED_SSS')
for folder, kind in (('eyes/high-poly', 'Eyes'), ('eyebrows/eyebrow006', 'Eyebrows'), ('eyelashes/eyelashes02', 'Eyelashes'),
                     ('hair/ponytail01', 'Hair'), ('teeth/teeth_base', 'Teeth')):
    try:
        HS.add_mhclo_asset(first(folder, '.mhclo'), body, asset_type=kind, subdiv_levels=1)
    except Exception as e:
        print('ASSET FAIL', folder, e)
arm = body.parent
print('ARMATURE', arm and arm.name, 'DIMS', body.dimensions)

# quick portrait test: 3/4 head-and-shoulders, soft key + rim
scene = bpy.context.scene
cd = bpy.data.cameras.new('cam'); cd.lens = 85
cam = bpy.data.objects.new('cam_portrait', cd); scene.collection.objects.link(cam)
top = max((body.matrix_world @ v.co).z for v in body.data.vertices)
head_c = Vector((0, 0, top - 0.12))
cam.location = head_c + Vector((0.45, -1.15, 0.02))
cam.rotation_euler = (head_c - cam.location).to_track_quat('-Z', 'Y').to_euler()
cd.dof.use_dof = True; cd.dof.focus_distance = (head_c - cam.location).length - 0.08; cd.dof.aperture_fstop = 2.8
scene.camera = cam
def area(name, loc, size, power, color):
    ld = bpy.data.lights.new(name, 'AREA'); ld.size = size; ld.energy = power; ld.color = color
    o = bpy.data.objects.new(name, ld); scene.collection.objects.link(o); o.location = loc
    o.rotation_euler = (head_c - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
area('key', head_c + Vector((0.9, -0.9, 0.5)), 1.0, 26, (1, 0.95, 0.9))
area('rim', head_c + Vector((-0.7, 0.8, 0.3)), 0.4, 80, (0.75, 0.85, 1.0))
area('fill', head_c + Vector((-0.9, -0.8, -0.2)), 1.5, 10, (0.85, 0.9, 1.0))
w = scene.world or bpy.data.worlds.new('W'); scene.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.006, 0.0065, 0.007, 1)
r = scene.render; r.engine = 'CYCLES'; r.resolution_x = 1200; r.resolution_y = 1200
scene.cycles.samples = 96; scene.cycles.use_denoising = True; scene.cycles.device = 'GPU'
try:
    pr = bpy.context.preferences.addons['cycles'].preferences; pr.compute_device_type = 'METAL'; pr.get_devices()
    for dv in pr.devices: dv.use = True
except Exception as e:
    print('GPU', e); scene.cycles.device = 'CPU'
scene.view_settings.view_transform = 'AgX'; scene.view_settings.look = 'AgX - Medium High Contrast'
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'ana_base.blend'))
r.filepath = os.path.join(OUT, 'ana_portrait_test.png')
bpy.ops.render.render(write_still=True)
print('DONE')
