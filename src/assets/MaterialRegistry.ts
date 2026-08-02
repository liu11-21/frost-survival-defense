/** Canonical material roles shared by Blender naming and Babylon diagnostics. */
export const MATERIAL_ROLES = ["cloth", "leather", "metal", "stone", "wood", "snow", "ice", "ember", "glass"] as const;
export type MaterialRole = typeof MATERIAL_ROLES[number];

export function isMaterialRole(value: string): value is MaterialRole {
  return (MATERIAL_ROLES as readonly string[]).includes(value);
}
