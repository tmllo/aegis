# Export a light web GLB of Ana in the e^x sensor layer from ana_cupola_front.blend.
# Run: Blender -b ana_cupola_front.blend --factory-startup --python export_web_glb.py -- <out.glb>
import bpy, sys
out = sys.argv[sys.argv.index('--') + 1]
keep_prefix = ('ana_body', 'ex_')
scene = bpy.context.scene
for o in list(scene.objects):
    if not o.name.startswith(keep_prefix) or o.type not in ('MESH', 'CURVE'):
        if o.type != 'ARMATURE': bpy.data.objects.remove(o)
bpy.ops.object.select_all(action='DESELECT')
for o in [o for o in scene.objects if o.type == 'CURVE']:  # traces -> mesh
    o.select_set(True); bpy.context.view_layer.objects.active = o
bpy.ops.object.convert(target='MESH')
for o in scene.objects:
    if o.type != 'MESH': continue
    for m in o.modifiers:
        if m.type == 'SUBSURF': m.levels = 0; m.render_levels = 0
    if o.name in ('ana_body', 'ex_garment'):
        d = o.modifiers.new('web', 'DECIMATE'); d.ratio = 0.45
# names the app can pick: region -> node
rename = {'ex_chest_hub': 'sensor_heart', 'ex_forehead_sensor': 'sensor_head', 'ex_wrist_band': 'sensor_wrist',
          'ex_resp_band': 'sensor_lungs', 'ex_garment': 'suit', 'ana_body': 'body'}
for o in scene.objects:
    if o.name in rename: o.name = rename[o.name]
for im in bpy.data.images:
    if im.size[0] > 1024 and im.has_data or (im.size[0] > 1024):
        try: im.scale(1024, max(1, int(1024 * im.size[1] / im.size[0])))
        except Exception as e: print('SCALE', im.name, e)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_apply=True, export_animations=False,
                          export_image_format='JPEG', export_jpeg_quality=82, export_draco_mesh_compression_enable=False,
                          use_selection=False, export_yup=True)
tris = 0
for o in scene.objects:
    if o.type == 'MESH':
        me = o.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh(); tris += sum(len(p.vertices) - 2 for p in me.polygons)
print('EXPORTED', out, 'tris', tris, [o.name for o in scene.objects if o.name.startswith(('sensor', 'suit', 'body'))])
