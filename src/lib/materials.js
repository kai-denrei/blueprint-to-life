import * as THREE from 'three';

/**
 * The game-path materials. These live on the meshes at all times.
 *
 * The blueprint viewer never touches them — it renders the scene with an overrideMaterial,
 * so switching display mode is one assignment and the asset carries zero display state.
 * Textures are deliberately absent: uv/uv2 exist on every part, so albedo/normal/roughness
 * maps can be dropped in without touching geometry.
 */
export function createMaterials() {
  const armour = new THREE.MeshStandardMaterial({
    name: 'M_Armour', color: 0x5a6152, roughness: 0.82, metalness: 0.15, flatShading: true,
  });
  return {
    armour,
    turret: new THREE.MeshStandardMaterial({
      name: 'M_Turret', color: 0x565d4e, roughness: 0.85, metalness: 0.15, flatShading: true,
    }),
    steel: new THREE.MeshStandardMaterial({
      name: 'M_Steel', color: 0x43464a, roughness: 0.55, metalness: 0.75, flatShading: true,
    }),
    rubber: new THREE.MeshStandardMaterial({
      name: 'M_Rubber', color: 0x24262a, roughness: 0.95, metalness: 0.05, flatShading: true,
    }),
    track: new THREE.MeshStandardMaterial({
      name: 'M_Track', color: 0x35383c, roughness: 0.9, metalness: 0.4, flatShading: true,
    }),
    detail: new THREE.MeshStandardMaterial({
      name: 'M_Detail', color: 0x4e5347, roughness: 0.7, metalness: 0.3, flatShading: true,
    }),
    // Powered elements. The blueprint pass ignores this entirely — it reads the `emissive`
    // vertex attribute instead — so the two display modes agree on which parts are lit without
    // either one depending on the other's representation.
    glow: new THREE.MeshStandardMaterial({
      name: 'M_Glow', color: 0x2a2130, roughness: 0.4, metalness: 0.0,
      emissive: 0xc44ff0, emissiveIntensity: 2.6, flatShading: true,
    }),
  };
}
