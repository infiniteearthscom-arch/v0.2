// PixelArt.jsx -- React wrappers for the procedural pixel generators
// (2026-09-24): <Portrait /> for NPC busts, <PixelItemIcon /> for item /
// module / resource icons. Both are plain <img> tags over cached data
// URLs with pixelated scaling, so they cost nothing per render.

import React from 'react';
import { getPortrait, ROLE_STYLE } from '@/utils/pixelArt/portrait';
import { getItemIcon } from '@/utils/pixelArt/itemIcon';
import { RESOURCE_TYPES } from '@/data/resources';

export const Portrait = ({ seed, role = 'vendor', size = 64, style, title }) => {
  const s = getPortrait(String(seed || 'anon'), role);
  const st = ROLE_STYLE[role] || ROLE_STYLE.vendor;
  return (
    <img src={s.dataUrl} alt="" width={size} height={size} title={title}
      style={{ imageRendering: 'pixelated', width: size, height: size, borderRadius: 3, border: `1px solid ${st.accent}66`, boxShadow: `0 0 8px ${st.accent}33`, flexShrink: 0, ...style }} />
  );
};

// Resources the static catalogue does not know (the Foundry's processed
// materials, 088) are registered at login from GET /foundry/catalog.
const DYNAMIC_RESOURCES = new Map(); // id -> { id, name, category, rarity, family, is_part, tier }
export const registerResourceTypes = (list) => { for (const r of list || []) if (r?.id != null) DYNAMIC_RESOURCES.set(Number(r.id), r); };
const specOf = (r, avgQuality) => ({
  kind: 'resource', category: r?.category || 'ore', rarity: r?.rarity || 'common', quality: avgQuality ?? null,
  family: r?.family || null, isPart: !!r?.is_part, tier: r?.category === 'processed' ? (r?.tier || null) : null, itemId: r?.name || '',
});
// Build a resource icon spec from a resource_type_id (category / rarity
// come from the static catalogue or the dynamic registry) and an average quality.
const resById = (id) => Object.values(RESOURCE_TYPES).find(r => r.id === id) || DYNAMIC_RESOURCES.get(Number(id));
export const resourceIconSpec = (resourceTypeId, avgQuality) => specOf(resById(resourceTypeId), avgQuality);
// By resource NAME (recipes, scan results) -- looks the id up in the catalogue.
const resByName = (name) => { const n = String(name || '').toLowerCase(); return Object.values(RESOURCE_TYPES).find(x => x.name.toLowerCase() === n) || [...DYNAMIC_RESOURCES.values()].find(x => String(x.name).toLowerCase() === n); };
export const resourceIconSpecByName = (name, avgQuality) => specOf(resByName(name), avgQuality);
export const resourceInfoByName = (name) => resByName(name) || null;
// A crafting recipe's OUTPUT (module or item).
export const recipeIconSpec = (recipe) => ({
  kind: recipe?.item_data_defaults?.slot_type ? 'module' : 'item',
  itemId: recipe?.output_item_id, slotType: recipe?.item_data_defaults?.slot_type || null,
  tier: recipe?.module_tier || null, damageType: recipe?.module_stats?.damage_type || null, quality: null,
});
export const moduleIconSpec = ({ itemId, slotType, tier, damageType, avgQuality }) => ({
  kind: slotType ? 'module' : 'item', itemId, slotType, tier: tier || null, damageType: damageType || null, quality: avgQuality ?? null,
});

export const PixelItemIcon = ({ spec, size = 32, style }) => {
  const s = getItemIcon(spec);
  return <img src={s.dataUrl} alt="" width={size} height={size} draggable={false} style={{ imageRendering: 'pixelated', width: size, height: size, display: 'block', ...style }} />;
};

export default PixelItemIcon;
