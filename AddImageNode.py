import bpy

obj = bpy.context.object
image = bpy.data.images.get("Untitled")

for mat_slot in obj.material_slots:
    mat = mat_slot.material
    if not mat or not mat.use_nodes:
        continue

    nodes = mat.node_tree.nodes
    links = mat.node_tree.links

    tex_node = nodes.new("ShaderNodeTexImage")
    tex_node.image = image

    uv_node = nodes.new("ShaderNodeUVMap")
    uv_node.uv_map = "Bake"

    links.new(uv_node.outputs["UV"], tex_node.inputs["Vector"])

    nodes.active = tex_node