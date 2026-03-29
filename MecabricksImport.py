import bpy
import os


# ─── CONFIG ──────────────────────────────────────────────────────────────────
OUTPUT_FOLDER = "~/Github/lego-modular-preview/models/unofficial/ninjago-city"
OUTPUT_NAME   = "ninjago-city"     
BAKE_SIZE     = 3072    # pixels (width & height)
MAX_FACES     = 250_000 # decimate target
# ─────────────────────────────────────────────────────────────────────────────


def join_and_convert():
    print("[1/7] Joining all objects into one mesh")
    bpy.ops.object.select_all(action="SELECT")
    mesh_objects = [o for o in bpy.context.selected_objects if o.type == "MESH"]
    if not mesh_objects:
        raise RuntimeError("No mesh objects found in the scene.")
    bpy.context.view_layer.objects.active = mesh_objects[0]
    bpy.ops.object.join()
 
    print("[2/7] Converting to mesh")
    bpy.ops.object.convert(target="MESH")
 
 
def get_active_mesh():
    obj = bpy.context.view_layer.objects.active
    if obj is None or obj.type != "MESH":
        raise RuntimeError("Active object is not a mesh.")
    return obj
 
 
def setup_bake_material(obj):
    print("[3/7] Creating 'bake' material with full node setup")
    bake_mat = bpy.data.materials.new(name="bake")
    bake_mat.use_nodes = True
    bake_mat.node_tree.nodes.clear()
 
    if "Bake" not in obj.data.uv_layers:
        obj.data.uv_layers.new(name="Bake")
    obj.data.uv_layers["Bake"].active = True
 
    print("[3b/7] Smart UV unwrapping")
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project()
    bpy.ops.object.mode_set(mode="OBJECT")
 
    nodes = bake_mat.node_tree.nodes
    links = bake_mat.node_tree.links
 
    uv_node = nodes.new("ShaderNodeUVMap")
    uv_node.uv_map = "Bake"
    uv_node.location = (-600, 0)
 
    img_node = nodes.new("ShaderNodeTexImage")
    img_node.location = (-300, 0)
 
    bsdf_node = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf_node.location = (100, 0)
 
    output_node = nodes.new("ShaderNodeOutputMaterial")
    output_node.location = (400, 0)
 
    print(f"[4/7] Creating bake image ({BAKE_SIZE}x{BAKE_SIZE})")
    bake_image = bpy.data.images.new(
        name="Untitled",
        width=BAKE_SIZE,
        height=BAKE_SIZE,
    )
    img_node.image = bake_image

    links.new(uv_node.outputs["UV"], img_node.inputs["Vector"])
    links.new(img_node.outputs["Color"], bsdf_node.inputs["Base Color"])
    links.new(bsdf_node.outputs["BSDF"], output_node.inputs["Surface"])
 
    obj.data.materials.append(bake_mat)
    return bake_mat, bake_image
 
 
def add_bake_nodes_to_existing_materials(obj, bake_image):
    print("[5/7] Adding bake image/UV nodes to all existing materials")
    for slot in obj.material_slots:
        mat = slot.material
        if mat is None or mat.name == "bake":
            continue
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
 
        uv_node = nodes.new("ShaderNodeUVMap")
        uv_node.uv_map = "Bake"
        uv_node.location = (-400, -300)
 
        img_node = nodes.new("ShaderNodeTexImage")
        img_node.image = bake_image
        img_node.location = (-100, -300)
 
        links.new(uv_node.outputs["UV"], img_node.inputs["Vector"])
 
        # Must be active (not connected) for baking to target it
        nodes.active = img_node
 
 
def bake_to_image(obj):
    print("[6/7] Baking…")
    bpy.context.scene.render.engine = "CYCLES"
 
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
 
    # Re-activate image node in each material before baking
    for slot in obj.material_slots:
        mat = slot.material
        if mat is None or mat.name == "bake":
            continue
        for node in mat.node_tree.nodes:
            if node.type == "TEX_IMAGE" and node.image and node.image.name == "Untitled":
                mat.node_tree.nodes.active = node
                break
 
    bpy.ops.object.bake(
        type="DIFFUSE",
        pass_filter={"COLOR"},
        use_clear=True,
        margin=16,
    )
 
 
def delete_old_materials(obj):
    print("[+] Removing old materials, keeping only 'bake'")
    to_remove = [
        i for i, slot in enumerate(obj.material_slots)
        if slot.material is None or slot.material.name != "bake"
    ]
    for idx in reversed(to_remove):
        obj.active_material_index = idx
        bpy.ops.object.material_slot_remove()
 
    for mat in bpy.data.materials:
        if mat.name != "bake" and mat.users == 0:
            bpy.data.materials.remove(mat)
 
 
def delete_extra_uv_maps(obj):
    print("[+] Removing all UV maps except 'Bake'")
    to_remove = [uv for uv in obj.data.uv_layers if uv.name != "Bake"]
    for uv in to_remove:
        obj.data.uv_layers.remove(uv)
 
def apply_transforms(obj):
    print("[+] Applying transforms")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
 
def decimate(obj):
    print(f"[+] Decimating to under {MAX_FACES:,} faces")
    pass_num = 1
    while True:
        face_count = len(obj.data.polygons)
        print(f"    Pass {pass_num}: {face_count:,} faces")
        if face_count <= MAX_FACES:
            print(f"    Under limit, done.")
            break
        ratio = (MAX_FACES * 0.85) / face_count
        mod = obj.modifiers.new(name=f"Decimate_{pass_num}", type="DECIMATE")
        mod.ratio = max(ratio, 0.01)
        bpy.ops.object.modifier_apply(modifier=mod.name)
        pass_num += 1
        if pass_num > 5:
            print(f"    WARNING: gave up after 5 passes, final count: {len(obj.data.polygons):,}")
            break
    print(f"    Final face count: {len(obj.data.polygons):,}")
 
 
def export_gltf(folder):
    name = bpy.path.clean_name(OUTPUT_NAME) if OUTPUT_NAME else bpy.path.clean_name(bpy.context.scene.name)
    filepath = os.path.join(folder, name)
    print(f"[7/7] Exporting to {filepath}.gltf")
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format="GLTF_SEPARATE",
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_apply=True,
    )
 
 
def main():
    if not OUTPUT_FOLDER:
        raise RuntimeError("Please set OUTPUT_FOLDER at the top of the script.")
 
    folder = os.path.abspath(os.path.expanduser(OUTPUT_FOLDER))
    os.makedirs(folder, exist_ok=True)
 
    join_and_convert()
    obj = get_active_mesh()
    bake_mat, bake_image = setup_bake_material(obj)
    add_bake_nodes_to_existing_materials(obj, bake_image)
    bake_to_image(obj)
    delete_old_materials(obj)
    delete_extra_uv_maps(obj)
    decimate(obj)
    apply_transforms(obj)
    export_gltf(folder)
 
    print("✓ Complete!")
 
 
main()