# 淼渺 3D 模型 → 网页用 glb（需要 Blender 4.x/5.x）
#
# 用法：
#   1. 先跑 node tools/build-3d-textures.mjs 生成 merged-2048.png（颜色+透明度合成一张 RGBA）
#   2. blender -b --factory-startup --python tools/build-3d-glb.py
#
# 做的事：导入原始 OBJ（29 万三角面）→ 换成一张贴图 → 缩到 1 单位高 → 减面到 5.2 万 →
# 导出 glb。导出后还要跑 tools/patch-glb-alpha.mjs，因为 Blender 5.3 的导出器
# 不再看 blend_method，一律写 alphaMode: BLEND，浏览里会呈现"碎玻璃"。
#
# 原始文件：模型.obj / 模型.mtl / color.png / Opacity.png / Transmittance.png（4096²）
# 输出：miaomiao.glb（约 2 MB）

﻿import bpy, os, json
from mathutils import Vector

SRC = r"D:/vibe_coding/.dsh-cache/model-zip"
OBJ = os.path.join(SRC, "模型.obj")
TEX = os.path.join(SRC, "merged-2048.png")
GLB = os.path.join(SRC, "miaomiao.glb")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=OBJ)
obj = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]

# 材质：合并贴图（颜色 + 透明度）
mat = obj.material_slots[0].material
nt = mat.node_tree
bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
if bsdf is None:
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    out = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'), None) or nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
for n in list(nt.nodes):
    if n.type == 'TEX_IMAGE':
        nt.nodes.remove(n)
tex = nt.nodes.new('ShaderNodeTexImage')
tex.image = bpy.data.images.load(TEX, check_existing=True)
tex.image.alpha_mode = 'CHANNEL_PACKED'
tex.interpolation = 'Linear'
nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
nt.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
mat.blend_method = 'CLIP'
mat.alpha_threshold = 0.5
# 塑料感弱一点，贴近渲染参考
if 'Roughness' in bsdf.inputs:
    bsdf.inputs['Roughness'].default_value = 0.55
if 'Metallic' in bsdf.inputs:
    bsdf.inputs['Metallic'].default_value = 0.0

# 归一化 + 减面
bpy.context.view_layer.objects.active = obj
bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
s = 1.0 / obj.dimensions.z
obj.scale = (s, s, s)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

m = obj.modifiers.new("Dec", 'DECIMATE')
m.ratio = 0.18
bpy.ops.object.modifier_apply(modifier=m.name)
obj.data.calc_loop_triangles()
print("FINAL_TRIS", len(obj.data.loop_triangles), "VERTS", len(obj.data.vertices),
      "DIMS", [round(v, 4) for v in obj.dimensions])

# 只导出这一件
bpy.ops.object.select_all(action='DESELECT')
obj.select_set(True)
bpy.context.view_layer.objects.active = obj

bpy.ops.export_scene.gltf(
    filepath=GLB,
    export_format='GLB',
    use_selection=True,
    export_apply=True,
    export_image_format='AUTO',
    export_yup=True,
)
print("GLB_BYTES", os.path.getsize(GLB))

