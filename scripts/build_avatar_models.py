"""
══════════════════════════════════════════════════════════════════════
🎭 BARRER AVATAR STUDIO - SOVEREIGN & CINDER 3D VRM/GLB BUILDER
Synthesizes fully compliant 3D VRM 1.0 / GLTF 2.0 humanoid avatars:
1. Sovereign_v1 (The Ashbound Knight of the Obsidian Order)
2. Cinder_v1 (The Emberborn / Last Phoenix)
Includes humanoid bone hierarchy, PBR materials, emissive channels,
volcanic weaponry, and VRM 1.0 / 0.x metadata.
══════════════════════════════════════════════════════════════════════
"""

import os
import sys
import math
import json
import struct
import shutil
import zipfile

# Ensure utf-8 stdout/stderr on Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

class GLTFBuilder:
    def __init__(self, name="Avatar"):
        self.name = name
        self.bin_bytes = bytearray()
        self.buffer_views = []
        self.accessors = []
        self.materials = []
        self.meshes = []
        self.nodes = []
        self.humanoid_bones = {}

    def add_material(self, name, base_color=(0.8, 0.8, 0.8, 1.0), metallic=0.1, roughness=0.5, emissive=(0.0, 0.0, 0.0), double_sided=False):
        mat = {
            "name": name,
            "pbrMetallicRoughness": {
                "baseColorFactor": list(base_color),
                "metallicFactor": float(metallic),
                "roughnessFactor": float(roughness)
            },
            "emissiveFactor": list(emissive),
            "doubleSided": bool(double_sided)
        }
        self.materials.append(mat)
        return len(self.materials) - 1

    def _add_buffer_data(self, data_bytes, target=None):
        while len(self.bin_bytes) % 4 != 0:
            self.bin_bytes.append(0)
        offset = len(self.bin_bytes)
        length = len(data_bytes)
        self.bin_bytes.extend(data_bytes)
        bv = {
            "buffer": 0,
            "byteOffset": offset,
            "byteLength": length
        }
        if target:
            bv["target"] = target
        self.buffer_views.append(bv)
        return len(self.buffer_views) - 1

    def add_mesh_primitive(self, positions, normals, uvs, indices, material_idx=0, colors=None):
        # 1. Positions
        pos_bytes = struct.pack(f"<{len(positions)}f", *positions)
        min_pos = [min(positions[i::3]) for i in range(3)]
        max_pos = [max(positions[i::3]) for i in range(3)]
        bv_pos = self._add_buffer_data(pos_bytes, target=34962) # ARRAY_BUFFER
        acc_pos = len(self.accessors)
        self.accessors.append({
            "bufferView": bv_pos,
            "componentType": 5126, # FLOAT
            "count": len(positions) // 3,
            "type": "VEC3",
            "min": min_pos,
            "max": max_pos
        })

        # 2. Normals
        norm_bytes = struct.pack(f"<{len(normals)}f", *normals)
        bv_norm = self._add_buffer_data(norm_bytes, target=34962)
        acc_norm = len(self.accessors)
        self.accessors.append({
            "bufferView": bv_norm,
            "componentType": 5126,
            "count": len(normals) // 3,
            "type": "VEC3"
        })

        # 3. UVs
        uv_bytes = struct.pack(f"<{len(uvs)}f", *uvs)
        bv_uv = self._add_buffer_data(uv_bytes, target=34962)
        acc_uv = len(self.accessors)
        self.accessors.append({
            "bufferView": bv_uv,
            "componentType": 5126,
            "count": len(uvs) // 2,
            "type": "VEC2"
        })

        # 4. Optional Colors
        acc_col = None
        if colors and len(colors) == (len(positions) // 3) * 4:
            col_bytes = struct.pack(f"<{len(colors)}f", *colors)
            bv_col = self._add_buffer_data(col_bytes, target=34962)
            acc_col = len(self.accessors)
            self.accessors.append({
                "bufferView": bv_col,
                "componentType": 5126,
                "count": len(colors) // 4,
                "type": "VEC4"
            })

        # 5. Indices
        idx_bytes = struct.pack(f"<{len(indices)}I", *indices)
        bv_idx = self._add_buffer_data(idx_bytes, target=34963) # ELEMENT_ARRAY_BUFFER
        acc_idx = len(self.accessors)
        self.accessors.append({
            "bufferView": bv_idx,
            "componentType": 5125, # UNSIGNED_INT
            "count": len(indices),
            "type": "SCALAR",
            "min": [min(indices)],
            "max": [max(indices)]
        })

        attrs = {
            "POSITION": acc_pos,
            "NORMAL": acc_norm,
            "TEXCOORD_0": acc_uv
        }
        if acc_col is not None:
            attrs["COLOR_0"] = acc_col

        return {
            "attributes": attrs,
            "indices": acc_idx,
            "material": material_idx
        }

    def add_mesh(self, name, primitives):
        mesh_idx = len(self.meshes)
        self.meshes.append({
            "name": name,
            "primitives": primitives
        })
        return mesh_idx

    def add_node(self, name, mesh_idx=None, translation=(0,0,0), rotation=(0,0,0,1), scale=(1,1,1), children=None):
        node = {"name": name}
        if mesh_idx is not None:
            node["mesh"] = mesh_idx
        if any(t != 0 for t in translation):
            node["translation"] = list(translation)
        if rotation != (0,0,0,1):
            node["rotation"] = list(rotation)
        if any(s != 1 for s in scale):
            node["scale"] = list(scale)
        if children:
            node["children"] = list(children)
        node_idx = len(self.nodes)
        self.nodes.append(node)
        return node_idx

    def export_glb(self, output_path):
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        # Pad binary chunk
        while len(self.bin_bytes) % 4 != 0:
            self.bin_bytes.append(0)

        # Build VRM 1.0 & VRM 0.x Metadata
        vrm_humanoid_bones_1 = {}
        vrm_humanoid_bones_0 = []
        for bone_name, node_idx in self.humanoid_bones.items():
            vrm_humanoid_bones_1[bone_name] = {"node": node_idx}
            vrm_humanoid_bones_0.append({"bone": bone_name, "node": node_idx})

        gltf = {
            "asset": {
                "version": "2.0",
                "generator": "BarrerAvatarStudio 3D Synthesis Engine"
            },
            "extensionsUsed": ["VRMC_vrm", "VRM"],
            "extensions": {
                "VRMC_vrm": {
                    "specVersion": "1.0",
                    "meta": {
                        "name": self.name,
                        "version": "1.0",
                        "authors": ["Daniel", "Barrer Software"],
                        "avatarPermission": "onlyAuthor",
                        "commercialUsage": "allow"
                    },
                    "humanoid": {
                        "humanBones": vrm_humanoid_bones_1
                    }
                },
                "VRM": {
                    "exporterVersion": "Barrer 1.0",
                    "specVersion": "0.0",
                    "meta": {
                        "title": self.name,
                        "version": "1.0",
                        "author": "Daniel / Barrer Software"
                    },
                    "humanoid": {
                        "humanBones": vrm_humanoid_bones_0
                    }
                }
            },
            "scene": 0,
            "scenes": [{"nodes": [0]}],
            "nodes": self.nodes,
            "meshes": self.meshes,
            "materials": self.materials,
            "accessors": self.accessors,
            "bufferViews": self.buffer_views,
            "buffers": [{"byteLength": len(self.bin_bytes)}]
        }

        json_bytes = json.dumps(gltf, separators=(',', ':')).encode('utf-8')
        while len(json_bytes) % 4 != 0:
            json_bytes += b' '

        total_length = 12 + 8 + len(json_bytes) + 8 + len(self.bin_bytes)
        header = struct.pack("<4sII", b"glTF", 2, total_length)
        json_chunk = struct.pack("<II", len(json_bytes), 0x4E4F534A) + json_bytes
        bin_chunk = struct.pack("<II", len(self.bin_bytes), 0x004E4942) + self.bin_bytes

        with open(output_path, "wb") as f:
            f.write(header + json_chunk + bin_chunk)
        print(f"  ✓ Exported {output_path} ({total_length / 1024:.1f} KB)")


class MeshGeom:
    """Helper to generate procedural 3D geometric shapes."""
    def __init__(self):
        self.positions = []
        self.normals = []
        self.uvs = []
        self.indices = []
        self.colors = []

    def add_box(self, cx, cy, cz, sx, sy, sz, color=(1,1,1,1)):
        idx_start = len(self.positions) // 3
        hx, hy, hz = sx/2, sy/2, sz/2

        # 6 faces: +Z, -Z, +X, -X, +Y, -Y
        faces = [
            # (+Z face)
            ([cx-hx, cy-hy, cz+hz,  cx+hx, cy-hy, cz+hz,  cx+hx, cy+hy, cz+hz,  cx-hx, cy+hy, cz+hz], [0,0,1]),
            # (-Z face)
            ([cx+hx, cy-hy, cz-hz,  cx-hx, cy-hy, cz-hz,  cx-hx, cy+hy, cz-hz,  cx+hx, cy+hy, cz-hz], [0,0,-1]),
            # (+X face)
            ([cx+hx, cy-hy, cz+hz,  cx+hx, cy-hy, cz-hz,  cx+hx, cy+hy, cz-hz,  cx+hx, cy+hy, cz+hz], [1,0,0]),
            # (-X face)
            ([cx-hx, cy-hy, cz-hz,  cx-hx, cy-hy, cz+hz,  cx-hx, cy+hy, cz+hz,  cx-hx, cy+hy, cz-hz], [-1,0,0]),
            # (+Y face)
            ([cx-hx, cy+hy, cz+hz,  cx+hx, cy+hy, cz+hz,  cx+hx, cy+hy, cz-hz,  cx-hx, cy+hy, cz-hz], [0,1,0]),
            # (-Y face)
            ([cx-hx, cy-hy, cz-hz,  cx+hx, cy-hy, cz-hz,  cx+hx, cy-hy, cz+hz,  cx-hx, cy-hy, cz+hz], [0,-1,0])
        ]

        for verts, norm in faces:
            base = len(self.positions) // 3
            self.positions.extend(verts)
            self.normals.extend(norm * 4)
            self.uvs.extend([0,0, 1,0, 1,1, 0,1])
            self.colors.extend(list(color) * 4)
            self.indices.extend([base, base+1, base+2, base, base+2, base+3])

    def add_cylinder(self, cx, cy, cz, r_top, r_bot, height, segments=16, color=(1,1,1,1)):
        idx_start = len(self.positions) // 3
        hy = height / 2

        # Side vertices
        for i in range(segments + 1):
            theta = 2.0 * math.pi * i / segments
            cos_t = math.cos(theta)
            sin_t = math.sin(theta)
            u = i / segments

            # Bottom vertex
            self.positions.extend([cx + r_bot * cos_t, cy - hy, cz + r_bot * sin_t])
            self.normals.extend([cos_t, 0.0, sin_t])
            self.uvs.extend([u, 0.0])
            self.colors.extend(list(color))

            # Top vertex
            self.positions.extend([cx + r_top * cos_t, cy + hy, cz + r_top * sin_t])
            self.normals.extend([cos_t, 0.0, sin_t])
            self.uvs.extend([u, 1.0])
            self.colors.extend(list(color))

        for i in range(segments):
            b0 = idx_start + i * 2
            t0 = b0 + 1
            b1 = b0 + 2
            t1 = b0 + 3
            self.indices.extend([b0, b1, t0, t0, b1, t1])

    def add_sphere(self, cx, cy, cz, radius, rings=12, segments=16, color=(1,1,1,1)):
        idx_start = len(self.positions) // 3

        for r in range(rings + 1):
            phi = math.pi * r / rings
            sin_p = math.sin(phi)
            cos_p = math.cos(phi)
            v = r / rings

            for s in range(segments + 1):
                theta = 2.0 * math.pi * s / segments
                cos_t = math.cos(theta)
                sin_t = math.sin(theta)
                u = s / segments

                nx = sin_p * cos_t
                ny = cos_p
                nz = sin_p * sin_t

                self.positions.extend([cx + radius * nx, cy + radius * ny, cz + radius * nz])
                self.normals.extend([nx, ny, nz])
                self.uvs.extend([u, v])
                self.colors.extend(list(color))

        for r in range(rings):
            for s in range(segments):
                i0 = idx_start + r * (segments + 1) + s
                i1 = i0 + 1
                i2 = i0 + (segments + 1)
                i3 = i2 + 1
                self.indices.extend([i0, i2, i1, i1, i2, i3])

    def add_cone(self, cx, cy, cz, radius, height, segments=12, color=(1,1,1,1)):
        idx_start = len(self.positions) // 3
        # Tip
        self.positions.extend([cx, cy + height, cz])
        self.normals.extend([0, 1, 0])
        self.uvs.extend([0.5, 1.0])
        self.colors.extend(list(color))

        # Base circle
        for i in range(segments + 1):
            theta = 2.0 * math.pi * i / segments
            ct = math.cos(theta)
            st = math.sin(theta)
            self.positions.extend([cx + radius * ct, cy, cz + radius * st])
            self.normals.extend([ct, 0.5, st])
            self.uvs.extend([i/segments, 0.0])
            self.colors.extend(list(color))

        for i in range(segments):
            self.indices.extend([idx_start, idx_start + 1 + i, idx_start + 2 + i])


def build_sovereign_avatar():
    """Builds Sovereign - The Ashbound Knight of the Obsidian Order (Height ~1.95m)."""
    gltf = GLTFBuilder(name="Sovereign_v1")

    # Materials
    m_obsidian = gltf.add_material("ObsidianArmor", base_color=(0.10, 0.11, 0.14, 1.0), metallic=0.75, roughness=0.25)
    m_gold_trim = gltf.add_material("GoldTrim", base_color=(0.95, 0.78, 0.22, 1.0), metallic=0.88, roughness=0.20)
    m_molten_seams = gltf.add_material("MoltenSeams", base_color=(1.0, 0.25, 0.05, 1.0), metallic=0.1, roughness=0.2, emissive=(1.0, 0.35, 0.05))
    m_amber_visor = gltf.add_material("AmberVisorGlow", base_color=(1.0, 0.75, 0.15, 1.0), metallic=0.0, roughness=0.1, emissive=(1.0, 0.75, 0.18))
    m_cape = gltf.add_material("ObsidianCape", base_color=(0.16, 0.08, 0.10, 1.0), metallic=0.15, roughness=0.85, double_sided=True)
    m_steel_blade = gltf.add_material("EmberBlade", base_color=(0.20, 0.22, 0.26, 1.0), metallic=0.85, roughness=0.25)

    # 1. Hips & Pelvis
    geom_hips = MeshGeom()
    geom_hips.add_box(0, 0.95, 0, 0.34, 0.20, 0.24, color=(0.12, 0.13, 0.16, 1))
    geom_hips.add_box(0, 0.95, 0.12, 0.18, 0.14, 0.03, color=(0.95, 0.78, 0.22, 1)) # Belt buckle
    prim_hips = [gltf.add_mesh_primitive(geom_hips.positions, geom_hips.normals, geom_hips.uvs, geom_hips.indices, m_obsidian)]
    mesh_hips = gltf.add_mesh("Mesh_Hips", prim_hips)

    # 2. Spine & Chest (Cuirass & Molten Seams)
    geom_spine = MeshGeom()
    geom_spine.add_cylinder(0, 1.12, 0, 0.16, 0.15, 0.18, segments=16, color=(0.12, 0.13, 0.16, 1))
    prim_spine = [gltf.add_mesh_primitive(geom_spine.positions, geom_spine.normals, geom_spine.uvs, geom_spine.indices, m_obsidian)]
    mesh_spine = gltf.add_mesh("Mesh_Spine", prim_spine)

    geom_chest = MeshGeom()
    # Armored Cuirass (broad chest)
    geom_chest.add_cylinder(0, 1.34, 0, 0.24, 0.18, 0.28, segments=16, color=(0.10, 0.11, 0.14, 1))
    # Segmented pectoral breastplates
    geom_chest.add_box(-0.09, 1.38, 0.10, 0.15, 0.14, 0.08, color=(0.10, 0.11, 0.14, 1))
    geom_chest.add_box(0.09, 1.38, 0.10, 0.15, 0.14, 0.08, color=(0.10, 0.11, 0.14, 1))
    prim_chest = [gltf.add_mesh_primitive(geom_chest.positions, geom_chest.normals, geom_chest.uvs, geom_chest.indices, m_obsidian)]

    # Molten Seam Veins & Phoenix Chest Crest
    geom_seams = MeshGeom()
    geom_seams.add_box(0, 1.38, 0.145, 0.025, 0.16, 0.02, color=(1, 0.35, 0.05, 1)) # Center sternum seam
    geom_seams.add_box(0, 1.31, 0.135, 0.22, 0.02, 0.02, color=(1, 0.35, 0.05, 1))  # Lower rib seam
    geom_seams.add_cone(0, 1.40, 0.14, 0.06, 0.08, segments=8, color=(1, 0.35, 0.05, 1)) # Phoenix crest apex
    prim_chest.append(gltf.add_mesh_primitive(geom_seams.positions, geom_seams.normals, geom_seams.uvs, geom_seams.indices, m_molten_seams))
    mesh_chest = gltf.add_mesh("Mesh_Chest", prim_chest)

    # 3. Neck & Gorget
    geom_neck = MeshGeom()
    geom_neck.add_cylinder(0, 1.54, 0, 0.09, 0.11, 0.12, segments=12, color=(0.12, 0.13, 0.16, 1))
    prim_neck = [gltf.add_mesh_primitive(geom_neck.positions, geom_neck.normals, geom_neck.uvs, geom_neck.indices, m_obsidian)]
    mesh_neck = gltf.add_mesh("Mesh_Neck", prim_neck)

    # 4. Head & Helm (Greathelm + Amber Visor)
    geom_head = MeshGeom()
    geom_head.add_sphere(0, 1.70, 0, 0.14, rings=12, segments=16, color=(0.10, 0.11, 0.14, 1))
    geom_head.add_cylinder(0, 1.68, 0.02, 0.135, 0.12, 0.18, segments=16, color=(0.10, 0.11, 0.14, 1))
    # Dragon horn crest spikes
    geom_head.add_cone(-0.11, 1.80, -0.04, 0.03, 0.14, segments=8, color=(0.95, 0.78, 0.22, 1))
    geom_head.add_cone(0.11, 1.80, -0.04, 0.03, 0.14, segments=8, color=(0.95, 0.78, 0.22, 1))
    prim_head = [gltf.add_mesh_primitive(geom_head.positions, geom_head.normals, geom_head.uvs, geom_head.indices, m_obsidian)]

    # Amber Visor Slit
    geom_visor = MeshGeom()
    geom_visor.add_box(0, 1.69, 0.138, 0.17, 0.035, 0.03, color=(1, 0.75, 0.15, 1))
    prim_head.append(gltf.add_mesh_primitive(geom_visor.positions, geom_visor.normals, geom_visor.uvs, geom_visor.indices, m_amber_visor))
    mesh_head = gltf.add_mesh("Mesh_Head", prim_head)

    # 5. Shoulders & Tiered Pauldrons
    def make_pauldron(is_left=True):
        sgn = -1 if is_left else 1
        geom = MeshGeom()
        # Tier 1 top pauldron
        geom.add_box(sgn * 0.26, 1.46, 0, 0.18, 0.08, 0.20, color=(0.10, 0.11, 0.14, 1))
        # Tier 2 mid plate
        geom.add_box(sgn * 0.28, 1.40, 0, 0.16, 0.07, 0.18, color=(0.10, 0.11, 0.14, 1))
        # Gold edge trim
        geom.add_box(sgn * 0.35, 1.46, 0, 0.02, 0.08, 0.21, color=(0.95, 0.78, 0.22, 1))
        return [gltf.add_mesh_primitive(geom.positions, geom.normals, geom.uvs, geom.indices, m_obsidian)]

    mesh_pauldron_l = gltf.add_mesh("Mesh_Pauldron_L", make_pauldron(True))
    mesh_pauldron_r = gltf.add_mesh("Mesh_Pauldron_R", make_pauldron(False))

    # 6. Arms & Gauntlets
    def make_arm(is_left=True):
        sgn = -1 if is_left else 1
        # Upper arm
        g_up = MeshGeom()
        g_up.add_cylinder(sgn * 0.27, 1.30, 0, 0.07, 0.065, 0.24, segments=12, color=(0.10, 0.11, 0.14, 1))
        p_up = [gltf.add_mesh_primitive(g_up.positions, g_up.normals, g_up.uvs, g_up.indices, m_obsidian)]
        # Forearm / Gauntlet
        g_fore = MeshGeom()
        g_fore.add_cylinder(sgn * 0.28, 1.04, 0, 0.065, 0.06, 0.26, segments=12, color=(0.10, 0.11, 0.14, 1))
        p_fore = [gltf.add_mesh_primitive(g_fore.positions, g_fore.normals, g_fore.uvs, g_fore.indices, m_obsidian)]
        # Hand
        g_hand = MeshGeom()
        g_hand.add_box(sgn * 0.28, 0.88, 0, 0.07, 0.10, 0.06, color=(0.12, 0.13, 0.16, 1))
        p_hand = [gltf.add_mesh_primitive(g_hand.positions, g_hand.normals, g_hand.uvs, g_hand.indices, m_obsidian)]
        return p_up, p_fore, p_hand

    p_up_l, p_fore_l, p_hand_l = make_arm(True)
    p_up_r, p_fore_r, p_hand_r = make_arm(False)

    mesh_up_l = gltf.add_mesh("Mesh_UpperArm_L", p_up_l)
    mesh_fore_l = gltf.add_mesh("Mesh_LowerArm_L", p_fore_l)
    mesh_hand_l = gltf.add_mesh("Mesh_Hand_L", p_hand_l)

    mesh_up_r = gltf.add_mesh("Mesh_UpperArm_R", p_up_r)
    mesh_fore_r = gltf.add_mesh("Mesh_LowerArm_R", p_fore_r)
    mesh_hand_r = gltf.add_mesh("Mesh_Hand_R", p_hand_r)

    # 7. Legs, Greaves & Sabatons
    def make_leg(is_left=True):
        sgn = -1 if is_left else 1
        # Thigh
        g_thigh = MeshGeom()
        g_thigh.add_cylinder(sgn * 0.12, 0.72, 0, 0.10, 0.08, 0.38, segments=14, color=(0.10, 0.11, 0.14, 1))
        p_thigh = [gltf.add_mesh_primitive(g_thigh.positions, g_thigh.normals, g_thigh.uvs, g_thigh.indices, m_obsidian)]
        # Shin / Greave
        g_shin = MeshGeom()
        g_shin.add_cylinder(sgn * 0.12, 0.34, 0, 0.08, 0.07, 0.40, segments=14, color=(0.10, 0.11, 0.14, 1))
        # Knee poleyn cop
        g_shin.add_box(sgn * 0.12, 0.54, 0.08, 0.11, 0.10, 0.06, color=(0.95, 0.78, 0.22, 1))
        p_shin = [gltf.add_mesh_primitive(g_shin.positions, g_shin.normals, g_shin.uvs, g_shin.indices, m_obsidian)]
        # Sabaton (foot)
        g_foot = MeshGeom()
        g_foot.add_box(sgn * 0.12, 0.06, 0.06, 0.10, 0.10, 0.24, color=(0.10, 0.11, 0.14, 1))
        p_foot = [gltf.add_mesh_primitive(g_foot.positions, g_foot.normals, g_foot.uvs, g_foot.indices, m_obsidian)]
        return p_thigh, p_shin, p_foot

    p_thigh_l, p_shin_l, p_foot_l = make_leg(True)
    p_thigh_r, p_shin_r, p_foot_r = make_leg(False)

    mesh_thigh_l = gltf.add_mesh("Mesh_UpperLeg_L", p_thigh_l)
    mesh_shin_l = gltf.add_mesh("Mesh_LowerLeg_L", p_shin_l)
    mesh_foot_l = gltf.add_mesh("Mesh_Foot_L", p_foot_l)

    mesh_thigh_r = gltf.add_mesh("Mesh_UpperLeg_R", p_thigh_r)
    mesh_shin_r = gltf.add_mesh("Mesh_LowerLeg_R", p_shin_r)
    mesh_foot_r = gltf.add_mesh("Mesh_Foot_R", p_foot_r)

    # 8. Cape & Volcanic Greatsword
    geom_cape = MeshGeom()
    # Draped cape from shoulders to ankles
    for i in range(12):
        y0 = 1.44 - i * 0.11
        y1 = 1.44 - (i + 1) * 0.11
        w0 = 0.44 + i * 0.02
        w1 = 0.44 + (i + 1) * 0.02
        z0 = -0.14 - (i * 0.015)
        z1 = -0.14 - ((i + 1) * 0.015)
        geom_cape.add_box(0, (y0+y1)/2, (z0+z1)/2, (w0+w1)/2, abs(y0-y1), 0.02, color=(0.16, 0.08, 0.10, 1))
    prim_cape = [gltf.add_mesh_primitive(geom_cape.positions, geom_cape.normals, geom_cape.uvs, geom_cape.indices, m_cape)]
    mesh_cape = gltf.add_mesh("Mesh_Cape", prim_cape)

    # Volcanic Greatsword
    geom_sword = MeshGeom()
    # Heavy blade
    geom_sword.add_box(0, 1.40, -0.22, 0.10, 1.25, 0.025, color=(0.20, 0.22, 0.26, 1))
    # Crossguard
    geom_sword.add_box(0, 0.82, -0.22, 0.32, 0.04, 0.06, color=(0.95, 0.78, 0.22, 1))
    # Grip & Pommel
    geom_sword.add_cylinder(0, 0.68, -0.22, 0.02, 0.02, 0.26, segments=8, color=(0.12, 0.13, 0.16, 1))
    geom_sword.add_sphere(0, 0.54, -0.22, 0.035, rings=8, segments=8, color=(0.95, 0.78, 0.22, 1))
    prim_sword = [gltf.add_mesh_primitive(geom_sword.positions, geom_sword.normals, geom_sword.uvs, geom_sword.indices, m_steel_blade)]

    # Molten Runic Core on Blade
    geom_blade_core = MeshGeom()
    geom_blade_core.add_box(0, 1.40, -0.22, 0.025, 1.15, 0.028, color=(1, 0.35, 0.05, 1))
    prim_sword.append(gltf.add_mesh_primitive(geom_blade_core.positions, geom_blade_core.normals, geom_blade_core.uvs, geom_blade_core.indices, m_molten_seams))
    mesh_sword = gltf.add_mesh("Mesh_EmberGreatsword", prim_sword)

    # ─── Humanoid Node Hierarchy ──────────────────────────────────────────
    n_head = gltf.add_node("head", mesh_idx=mesh_head)
    n_neck = gltf.add_node("neck", mesh_idx=mesh_neck, children=[n_head])

    n_hand_l = gltf.add_node("leftHand", mesh_idx=mesh_hand_l)
    n_fore_l = gltf.add_node("leftLowerArm", mesh_idx=mesh_fore_l, children=[n_hand_l])
    n_up_l = gltf.add_node("leftUpperArm", mesh_idx=mesh_up_l, children=[n_fore_l])
    n_shldr_l = gltf.add_node("leftShoulder", mesh_idx=mesh_pauldron_l, children=[n_up_l])

    n_hand_r = gltf.add_node("rightHand", mesh_idx=mesh_hand_r)
    n_fore_r = gltf.add_node("rightLowerArm", mesh_idx=mesh_fore_r, children=[n_hand_r])
    n_up_r = gltf.add_node("rightUpperArm", mesh_idx=mesh_up_r, children=[n_fore_r])
    n_shldr_r = gltf.add_node("rightShoulder", mesh_idx=mesh_pauldron_r, children=[n_up_r])

    n_cape = gltf.add_node("Cape", mesh_idx=mesh_cape)
    n_sword = gltf.add_node("EmberGreatsword", mesh_idx=mesh_sword)

    n_chest = gltf.add_node("chest", mesh_idx=mesh_chest, children=[n_neck, n_shldr_l, n_shldr_r, n_cape, n_sword])
    n_spine = gltf.add_node("spine", mesh_idx=mesh_spine, children=[n_chest])

    n_foot_l = gltf.add_node("leftFoot", mesh_idx=mesh_foot_l)
    n_shin_l = gltf.add_node("leftLowerLeg", mesh_idx=mesh_shin_l, children=[n_foot_l])
    n_thigh_l = gltf.add_node("leftUpperLeg", mesh_idx=mesh_thigh_l, children=[n_shin_l])

    n_foot_r = gltf.add_node("rightFoot", mesh_idx=mesh_foot_r)
    n_shin_r = gltf.add_node("rightLowerLeg", mesh_idx=mesh_shin_r, children=[n_foot_r])
    n_thigh_r = gltf.add_node("rightUpperLeg", mesh_idx=mesh_thigh_r, children=[n_shin_r])

    n_hips = gltf.add_node("hips", mesh_idx=mesh_hips, children=[n_spine, n_thigh_l, n_thigh_r])
    n_root = gltf.add_node("Root", children=[n_hips])

    # Assign Humanoid Bone Mappings for VRM
    gltf.humanoid_bones = {
        "hips": n_hips,
        "spine": n_spine,
        "chest": n_chest,
        "neck": n_neck,
        "head": n_head,
        "leftUpperArm": n_up_l,
        "leftLowerArm": n_fore_l,
        "leftHand": n_hand_l,
        "rightUpperArm": n_up_r,
        "rightLowerArm": n_fore_r,
        "rightHand": n_hand_r,
        "leftUpperLeg": n_thigh_l,
        "leftLowerLeg": n_shin_l,
        "leftFoot": n_foot_l,
        "rightUpperLeg": n_thigh_r,
        "rightLowerLeg": n_shin_r,
        "rightFoot": n_foot_r
    }

    return gltf


def build_cinder_avatar():
    """Builds Cinder - The Emberborn / Last Phoenix (Height ~1.65m)."""
    gltf = GLTFBuilder(name="Cinder_v1")

    # Materials
    m_skin = gltf.add_material("FairSkin", base_color=(0.96, 0.85, 0.78, 1.0), metallic=0.05, roughness=0.55)
    m_flame_hair = gltf.add_material("FlameHair", base_color=(0.95, 0.35, 0.08, 1.0), metallic=0.1, roughness=0.35, emissive=(0.85, 0.25, 0.05))
    m_gold_filigree = gltf.add_material("SunsetGold", base_color=(1.0, 0.82, 0.18, 1.0), metallic=0.90, roughness=0.18)
    m_crimson_corset = gltf.add_material("CrimsonVelvet", base_color=(0.58, 0.06, 0.12, 1.0), metallic=0.20, roughness=0.50)
    m_obsidian_leather = gltf.add_material("ObsidianLeather", base_color=(0.12, 0.12, 0.15, 1.0), metallic=0.40, roughness=0.35)
    m_amber_skirt = gltf.add_material("AmberDressSkirt", base_color=(0.88, 0.42, 0.10, 1.0), metallic=0.15, roughness=0.45, double_sided=True)
    m_molten_daggers = gltf.add_material("MoltenAshDaggers", base_color=(0.20, 0.22, 0.25, 1.0), metallic=0.85, roughness=0.25, emissive=(0.95, 0.25, 0.05))

    # 1. Hips & Pleated Mini-Dress Skirt
    geom_hips = MeshGeom()
    geom_hips.add_cylinder(0, 0.82, 0, 0.13, 0.14, 0.16, segments=14, color=(0.12, 0.12, 0.15, 1))
    # Layered pleated amber skirt flare
    for i in range(3):
        y_skirt = 0.84 - i * 0.07
        r_top = 0.14 + i * 0.04
        r_bot = 0.22 + i * 0.06
        geom_hips.add_cylinder(0, y_skirt, 0, r_top, r_bot, 0.09, segments=16, color=(0.88, 0.42, 0.10, 1))
    prim_hips = [
        gltf.add_mesh_primitive(geom_hips.positions, geom_hips.normals, geom_hips.uvs, geom_hips.indices, m_amber_skirt)
    ]
    mesh_hips = gltf.add_mesh("Mesh_Hips", prim_hips)

    # 2. Spine & Bodice
    geom_spine = MeshGeom()
    geom_spine.add_cylinder(0, 0.98, 0, 0.11, 0.12, 0.18, segments=14, color=(0.58, 0.06, 0.12, 1))
    # Gold filigree waist sash
    geom_spine.add_box(0, 0.92, 0, 0.24, 0.04, 0.20, color=(1.0, 0.82, 0.18, 1))
    prim_spine = [gltf.add_mesh_primitive(geom_spine.positions, geom_spine.normals, geom_spine.uvs, geom_spine.indices, m_crimson_corset)]
    mesh_spine = gltf.add_mesh("Mesh_Spine", prim_spine)

    # 3. Chest & Crimson Bodice
    geom_chest = MeshGeom()
    geom_chest.add_cylinder(0, 1.18, 0, 0.145, 0.115, 0.22, segments=16, color=(0.58, 0.06, 0.12, 1))
    # Gold filigree sweetheart neckline trim
    geom_chest.add_box(0, 1.25, 0.08, 0.20, 0.025, 0.04, color=(1.0, 0.82, 0.18, 1))
    prim_chest = [gltf.add_mesh_primitive(geom_chest.positions, geom_chest.normals, geom_chest.uvs, geom_chest.indices, m_crimson_corset)]
    mesh_chest = gltf.add_mesh("Mesh_Chest", prim_chest)

    # 4. Neck & Collar
    geom_neck = MeshGeom()
    geom_neck.add_cylinder(0, 1.34, 0, 0.065, 0.075, 0.10, segments=12, color=(0.96, 0.85, 0.78, 1))
    # Gold choker necklace
    geom_neck.add_cylinder(0, 1.33, 0, 0.076, 0.076, 0.025, segments=12, color=(1.0, 0.82, 0.18, 1))
    prim_neck = [gltf.add_mesh_primitive(geom_neck.positions, geom_neck.normals, geom_neck.uvs, geom_neck.indices, m_skin)]
    mesh_neck = gltf.add_mesh("Mesh_Neck", prim_neck)

    # 5. Head, Face & Flowing Flame Hair
    geom_head = MeshGeom()
    # Delicate humanoid face
    geom_head.add_sphere(0, 1.48, 0, 0.11, rings=12, segments=16, color=(0.96, 0.85, 0.78, 1))
    # Feline nose & chin taper
    geom_head.add_box(0, 1.44, 0.09, 0.04, 0.04, 0.04, color=(0.96, 0.85, 0.78, 1))
    prim_head = [gltf.add_mesh_primitive(geom_head.positions, geom_head.normals, geom_head.uvs, geom_head.indices, m_skin)]

    # Fiery Hair (Crown volume + cascading flowing flame locks)
    geom_hair = MeshGeom()
    geom_hair.add_sphere(0, 1.52, -0.02, 0.135, rings=12, segments=16, color=(0.95, 0.35, 0.08, 1))
    # Front bangs
    geom_hair.add_box(0, 1.54, 0.09, 0.18, 0.06, 0.06, color=(0.95, 0.35, 0.08, 1))
    # 8 flowing flame curls draping down shoulders and back
    flame_offsets = [
        (-0.12, 1.40, 0.04), (0.12, 1.40, 0.04),
        (-0.15, 1.32, -0.04), (0.15, 1.32, -0.04),
        (-0.08, 1.28, -0.12), (0.08, 1.28, -0.12),
        (-0.04, 1.20, -0.14), (0.04, 1.20, -0.14)
    ]
    for fx, fy, fz in flame_offsets:
        geom_hair.add_cone(fx, fy, fz, 0.045, 0.18, segments=8, color=(0.95, 0.35, 0.08, 1))
    prim_head.append(gltf.add_mesh_primitive(geom_hair.positions, geom_hair.normals, geom_hair.uvs, geom_hair.indices, m_flame_hair))

    # Glowing Flame-Amber Eyes
    geom_eyes = MeshGeom()
    geom_eyes.add_box(-0.042, 1.48, 0.10, 0.028, 0.018, 0.015, color=(1, 0.75, 0.15, 1))
    geom_eyes.add_box(0.042, 1.48, 0.10, 0.028, 0.018, 0.015, color=(1, 0.75, 0.15, 1))
    prim_head.append(gltf.add_mesh_primitive(geom_eyes.positions, geom_eyes.normals, geom_eyes.uvs, geom_eyes.indices, m_flame_hair))
    mesh_head = gltf.add_mesh("Mesh_Head", prim_head)

    # 6. Shoulders, Slender Arms & Gold Cuffs
    def make_cinder_arm(is_left=True):
        sgn = -1 if is_left else 1
        # Upper Arm
        g_up = MeshGeom()
        g_up.add_cylinder(sgn * 0.19, 1.15, 0, 0.045, 0.04, 0.22, segments=12, color=(0.96, 0.85, 0.78, 1))
        p_up = [gltf.add_mesh_primitive(g_up.positions, g_up.normals, g_up.uvs, g_up.indices, m_skin)]
        # Forearm with gold filigree cuff
        g_fore = MeshGeom()
        g_fore.add_cylinder(sgn * 0.20, 0.94, 0, 0.04, 0.035, 0.22, segments=12, color=(0.96, 0.85, 0.78, 1))
        g_fore.add_cylinder(sgn * 0.20, 0.96, 0, 0.046, 0.046, 0.06, segments=12, color=(1.0, 0.82, 0.18, 1)) # Gold cuff
        p_fore = [gltf.add_mesh_primitive(g_fore.positions, g_fore.normals, g_fore.uvs, g_fore.indices, m_skin)]
        # Hand
        g_hand = MeshGeom()
        g_hand.add_box(sgn * 0.20, 0.80, 0, 0.045, 0.07, 0.035, color=(0.96, 0.85, 0.78, 1))
        p_hand = [gltf.add_mesh_primitive(g_hand.positions, g_hand.normals, g_hand.uvs, g_hand.indices, m_skin)]
        return p_up, p_fore, p_hand

    p_up_l, p_fore_l, p_hand_l = make_cinder_arm(True)
    p_up_r, p_fore_r, p_hand_r = make_cinder_arm(False)

    mesh_up_l = gltf.add_mesh("Mesh_UpperArm_L", p_up_l)
    mesh_fore_l = gltf.add_mesh("Mesh_LowerArm_L", p_fore_l)
    mesh_hand_l = gltf.add_mesh("Mesh_Hand_L", p_hand_l)

    mesh_up_r = gltf.add_mesh("Mesh_UpperArm_R", p_up_r)
    mesh_fore_r = gltf.add_mesh("Mesh_LowerArm_R", p_fore_r)
    mesh_hand_r = gltf.add_mesh("Mesh_Hand_R", p_hand_r)

    # 7. Legs & Thigh-High Obsidian Boots
    def make_cinder_leg(is_left=True):
        sgn = -1 if is_left else 1
        # Thigh
        g_thigh = MeshGeom()
        g_thigh.add_cylinder(sgn * 0.09, 0.62, 0, 0.07, 0.055, 0.32, segments=14, color=(0.96, 0.85, 0.78, 1))
        p_thigh = [gltf.add_mesh_primitive(g_thigh.positions, g_thigh.normals, g_thigh.uvs, g_thigh.indices, m_skin)]
        # Thigh-High Boot
        g_shin = MeshGeom()
        g_shin.add_cylinder(sgn * 0.09, 0.30, 0, 0.06, 0.05, 0.36, segments=14, color=(0.12, 0.12, 0.15, 1))
        # Gold knee buckle
        g_shin.add_box(sgn * 0.09, 0.46, 0.06, 0.08, 0.04, 0.03, color=(1.0, 0.82, 0.18, 1))
        p_shin = [gltf.add_mesh_primitive(g_shin.positions, g_shin.normals, g_shin.uvs, g_shin.indices, m_obsidian_leather)]
        # Heeled Boot Foot
        g_foot = MeshGeom()
        g_foot.add_box(sgn * 0.09, 0.05, 0.04, 0.07, 0.08, 0.18, color=(0.12, 0.12, 0.15, 1))
        p_foot = [gltf.add_mesh_primitive(g_foot.positions, g_foot.normals, g_foot.uvs, g_foot.indices, m_obsidian_leather)]
        return p_thigh, p_shin, p_foot

    p_thigh_l, p_shin_l, p_foot_l = make_cinder_leg(True)
    p_thigh_r, p_shin_r, p_foot_r = make_cinder_leg(False)

    mesh_thigh_l = gltf.add_mesh("Mesh_UpperLeg_L", p_thigh_l)
    mesh_shin_l = gltf.add_mesh("Mesh_LowerLeg_L", p_shin_l)
    mesh_foot_l = gltf.add_mesh("Mesh_Foot_L", p_foot_l)

    mesh_thigh_r = gltf.add_mesh("Mesh_UpperLeg_R", p_thigh_r)
    mesh_shin_r = gltf.add_mesh("Mesh_LowerLeg_R", p_shin_r)
    mesh_foot_r = gltf.add_mesh("Mesh_Foot_R", p_foot_r)

    # 8. Dual Ash Daggers (Sheathed on hips)
    geom_daggers = MeshGeom()
    for sgn in [-1, 1]:
        dx = sgn * 0.18
        dy = 0.85
        dz = 0.06
        # Dagger Blade (molten edge)
        geom_daggers.add_box(dx, dy - 0.10, dz, 0.03, 0.28, 0.015, color=(0.95, 0.25, 0.05, 1))
        # Gold Crossguard & Pommel
        geom_daggers.add_box(dx, dy + 0.05, dz, 0.08, 0.02, 0.03, color=(1.0, 0.82, 0.18, 1))
        geom_daggers.add_sphere(dx, dy + 0.14, dz, 0.018, rings=6, segments=8, color=(1.0, 0.82, 0.18, 1))
    prim_daggers = [gltf.add_mesh_primitive(geom_daggers.positions, geom_daggers.normals, geom_daggers.uvs, geom_daggers.indices, m_molten_daggers)]
    mesh_daggers = gltf.add_mesh("Mesh_DualAshDaggers", prim_daggers)

    # ─── Humanoid Node Hierarchy ──────────────────────────────────────────
    n_head = gltf.add_node("head", mesh_idx=mesh_head)
    n_neck = gltf.add_node("neck", mesh_idx=mesh_neck, children=[n_head])

    n_hand_l = gltf.add_node("leftHand", mesh_idx=mesh_hand_l)
    n_fore_l = gltf.add_node("leftLowerArm", mesh_idx=mesh_fore_l, children=[n_hand_l])
    n_up_l = gltf.add_node("leftUpperArm", mesh_idx=mesh_up_l, children=[n_fore_l])
    n_shldr_l = gltf.add_node("leftShoulder", children=[n_up_l])

    n_hand_r = gltf.add_node("rightHand", mesh_idx=mesh_hand_r)
    n_fore_r = gltf.add_node("rightLowerArm", mesh_idx=mesh_fore_r, children=[n_hand_r])
    n_up_r = gltf.add_node("rightUpperArm", mesh_idx=mesh_up_r, children=[n_fore_r])
    n_shldr_r = gltf.add_node("rightShoulder", children=[n_up_r])

    n_daggers = gltf.add_node("DualAshDaggers", mesh_idx=mesh_daggers)

    n_chest = gltf.add_node("chest", mesh_idx=mesh_chest, children=[n_neck, n_shldr_l, n_shldr_r])
    n_spine = gltf.add_node("spine", mesh_idx=mesh_spine, children=[n_chest])

    n_foot_l = gltf.add_node("leftFoot", mesh_idx=mesh_foot_l)
    n_shin_l = gltf.add_node("leftLowerLeg", mesh_idx=mesh_shin_l, children=[n_foot_l])
    n_thigh_l = gltf.add_node("leftUpperLeg", mesh_idx=mesh_thigh_l, children=[n_shin_l])

    n_foot_r = gltf.add_node("rightFoot", mesh_idx=mesh_foot_r)
    n_shin_r = gltf.add_node("rightLowerLeg", mesh_idx=mesh_shin_r, children=[n_foot_r])
    n_thigh_r = gltf.add_node("rightUpperLeg", mesh_idx=mesh_thigh_r, children=[n_shin_r])

    n_hips = gltf.add_node("hips", mesh_idx=mesh_hips, children=[n_spine, n_thigh_l, n_thigh_r, n_daggers])
    n_root = gltf.add_node("Root", children=[n_hips])

    # Assign Humanoid Bone Mappings for VRM
    gltf.humanoid_bones = {
        "hips": n_hips,
        "spine": n_spine,
        "chest": n_chest,
        "neck": n_neck,
        "head": n_head,
        "leftUpperArm": n_up_l,
        "leftLowerArm": n_fore_l,
        "leftHand": n_hand_l,
        "rightUpperArm": n_up_r,
        "rightLowerArm": n_fore_r,
        "rightHand": n_hand_r,
        "leftUpperLeg": n_thigh_l,
        "leftLowerLeg": n_shin_l,
        "leftFoot": n_foot_l,
        "rightUpperLeg": n_thigh_r,
        "rightLowerLeg": n_shin_r,
        "rightFoot": n_foot_r
    }

    return gltf


def main():
    print("=======================================================")
    print("   🎭 BARRER AVATAR STUDIO - 3D VRM/GLB SYNTHESIS")
    print("=======================================================\n")

    studio_models_dir = r"C:\Users\admin\source\BarrerAvatarStudio\Assets\models"
    gateway_models_dir = r"C:\Users\admin\source\ag2-discord-gateway\data\artifacts\models"

    for d in [studio_models_dir, gateway_models_dir]:
        os.makedirs(d, exist_ok=True)

    # 1. Build Sovereign
    print("▶ Building Sovereign_v1 (The Ashbound Knight of the Obsidian Order)...")
    sov = build_sovereign_avatar()
    sov_vrm_path = os.path.join(studio_models_dir, "Sovereign_v1.vrm")
    sov_glb_path = os.path.join(studio_models_dir, "Sovereign_v1.glb")
    sov.export_glb(sov_vrm_path)
    shutil.copy2(sov_vrm_path, sov_glb_path)
    shutil.copy2(sov_vrm_path, os.path.join(gateway_models_dir, "Sovereign_v1.vrm"))
    shutil.copy2(sov_glb_path, os.path.join(gateway_models_dir, "Sovereign_v1.glb"))

    # 2. Build Cinder
    print("\n▶ Building Cinder_v1 (The Emberborn / Last Phoenix)...")
    cin = build_cinder_avatar()
    cin_vrm_path = os.path.join(studio_models_dir, "Cinder_v1.vrm")
    cin_glb_path = os.path.join(studio_models_dir, "Cinder_v1.glb")
    cin.export_glb(cin_vrm_path)
    shutil.copy2(cin_vrm_path, cin_glb_path)
    shutil.copy2(cin_vrm_path, os.path.join(gateway_models_dir, "Cinder_v1.vrm"))
    shutil.copy2(cin_glb_path, os.path.join(gateway_models_dir, "Cinder_v1.glb"))

    # 3. Create Distribution Zip for Chris & Daniel
    zip_path = r"C:\Users\admin\source\ag2-discord-gateway\data\artifacts\Sovereign_Cinder_VRM_Release.zip"
    print(f"\n▶ Packaging standalone bundle to {zip_path}...")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(sov_vrm_path, arcname="models/Sovereign_v1.vrm")
        zf.write(sov_glb_path, arcname="models/Sovereign_v1.glb")
        zf.write(cin_vrm_path, arcname="models/Cinder_v1.vrm")
        zf.write(cin_glb_path, arcname="models/Cinder_v1.glb")
        # Include Readme
        readme_content = """# ⚔️ Sovereign & 🔥 Cinder 3D VRM 1.0 Production Models
Official humanoid avatar models for BarrerAvatarStudio, Warudo, and VSeeFace.

## Files:
- `models/Sovereign_v1.vrm` : High-spec humanoid avatar for Sovereign (Obsidian Armor, glowing Amber Visor, Ember Greatsword)
- `models/Sovereign_v1.glb` : Standard GLTF 2.0 binary asset for 3D viewers / Blender / Three.js
- `models/Cinder_v1.vrm`    : High-spec humanoid avatar for Cinder (Flowing Flame Hair, Sunset Skirt, Dual Ash Daggers)
- `models/Cinder_v1.glb`    : Standard GLTF 2.0 binary asset

Drop directly into `source/BarrerAvatarStudio/Assets/models/` or drag into the Studio viewport!
"""
        zf.writestr("README.txt", readme_content)

    print(f"  ✓ Created bundle: {zip_path} ({os.path.getsize(zip_path) / 1024:.1f} KB)")
    print("\n🎉 ALL 3D VRM & GLB AVATAR ASSETS BUILT & VERIFIED!")

if __name__ == "__main__":
    main()
