import bpy

obj = bpy.context.object

slots_to_remove = [i for i, slot in enumerate(obj.material_slots) if slot.material and slot.material.name.lower() != "bake"]

for index in reversed(slots_to_remove):
    obj.active_material_index = index
    bpy.ops.object.material_slot_remove()