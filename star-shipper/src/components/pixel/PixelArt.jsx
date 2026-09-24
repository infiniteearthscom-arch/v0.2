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

// Build a resource icon spec from a resource_type_id (category / rarity
// come from the static catalogue) and an average quality.
const resById = (id) => Object.values(RESOURCE_TYPES).find(r => r.id === id);
export const resourceIconSpec = (resourceTypeId, avgQuality) => {
  const r = resById(resourceTypeId);
  return { kind: 'resource', category: r?.category || 'ore', rarity: r?.rarity || 'common', quality: avgQuality ?? null };
};
export const moduleIconSpec = ({ itemId, slotType, tier, damageType, avgQuality }) => ({
  kind: slotType ? 'module' : 'item', itemId, slotType, tier: tier || null, damageType: damageType || null, quality: avgQuality ?? null,
});

export const PixelItemIcon = ({ spec, size = 32, style }) => {
  const s = getItemIcon(spec);
  return <img src={s.dataUrl} alt="" width={size} height={size} draggable={false} style={{ imageRendering: 'pixelated', width: size, height: size, display: 'block', ...style }} />;
};

export default PixelItemIcon;
