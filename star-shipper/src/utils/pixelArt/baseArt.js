// baseArt.js -- procedural pixel-art portrait of a player base (2026-09-26).
//
// Draws a 192x112 scene from the base's tier, kind and fitted buildings:
//   surface  -> a planet skyline: terrain, a dome per area, a building
//               silhouette per fitted plot coloured by its family, an
//               antenna mast that grows with tier, blinking lights.
//   orbital  -> a station: a hub ring, a spar per area, a pod per fitted
//               plot, a docking bar, nav lights.
// Deterministic from the base id (seeded jitter), so the same base looks
// the same every open; animated by a 2-frame light blink the caller
// alternates. Painted straight onto a canvas -- no sheet, no cache
// pressure, a base window opens rarely.

const FAMILY_COLOR = {
  smelting: '#f0883e', gas: '#38bdf8', bio: '#4ade80', electronics: '#a78bfa', assembly: '#f5c542', service: '#94a3b8', none: '#64748b',
};
const seedOf = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
const rng = (seed) => { let x = seed || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return (x % 10000) / 10000; }; };
const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); const r = Math.min(255, Math.round(((n >> 16) & 255) * k)), g = Math.min(255, Math.round(((n >> 8) & 255) * k)), b = Math.min(255, Math.round((n & 255) * k)); return `rgb(${r},${g},${b})`; };

export const BASE_ART_W = 192, BASE_ART_H = 112;

// buildings: [{ slot, family, tier, kind: 'station'|'depot'|'refinery'|'lab'|'repair'|null }]
export function paintBaseArt(ctx, { id, kind = 'surface', tier = 1, buildings = [], frame = 0, planetColor = '#6b4f3a' }) {
  const W = BASE_ART_W, H = BASE_ART_H;
  const r = rng(seedOf(id || 'base'));
  ctx.imageSmoothingEnabled = false;
  // sky / space
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  if (kind === 'orbital') { sky.addColorStop(0, '#05070f'); sky.addColorStop(1, '#0b1224'); }
  else { sky.addColorStop(0, '#0b1a33'); sky.addColorStop(1, '#1d2b44'); }
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  // stars
  for (let i = 0; i < 46; i++) { const x = Math.floor(r() * W), y = Math.floor(r() * (kind === 'orbital' ? H : 62)); ctx.fillStyle = (i + frame) % 7 === 0 ? '#ffffff' : '#7f93a8'; ctx.fillRect(x, y, 1, 1); }
  const P = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const areas = Math.max(1, Math.min(5, tier));
  const byArea = Array.from({ length: 5 }, () => []);
  for (const b of buildings) { const a = Math.floor((Number(String(b.slot || 'b1').replace('b', '')) - 1) / 4); if (a >= 0 && a < 5) byArea[a].push(b); }

  if (kind === 'surface') {
    // planet body: a big arc at the bottom in the planet colour
    const pc = planetColor;
    P(0, 78, W, H - 78, shade(pc, 0.55));
    for (let x = 0; x < W; x += 2) { const y = 78 + Math.round(Math.sin(x / 11) * 2 + Math.sin(x / 3.7) * 1); P(x, y, 2, 4, shade(pc, 0.8)); }
    for (let i = 0; i < 60; i++) { P(r() * W, 84 + r() * 26, 1 + Math.floor(r() * 3), 1, r() > 0.5 ? shade(pc, 0.4) : shade(pc, 0.7)); }
    // landing pad + mast
    P(6, 80, 30, 3, '#2a3a55'); P(8, 79, 26, 1, '#5a7aa5');
    const mast = 14 + areas * 8;
    P(W - 14, 80 - mast, 2, mast, '#6b7b95'); P(W - 18, 80 - mast, 10, 1, '#8aa0c0'); P(W - 15, 80 - mast - 3, 4, 3, (frame % 2) ? '#ff3b3b' : '#5a1010');
    // one dome per area, each area 34px wide from x=40
    for (let a = 0; a < areas; a++) {
      const x0 = 40 + a * 30, w = 28;
      const col = a === 0 ? '#3b4d6b' : a === 1 ? '#455a7a' : a === 2 ? '#4e6688' : a === 3 ? '#5a6f95' : '#6a7fa5';
      // dome
      for (let y = 0; y <= 12; y++) { const hw = Math.sqrt(Math.max(0, 1 - (y / 12) ** 2)) * (w / 2); P(x0 + w / 2 - hw, 78 - y, hw * 2, 1, y > 9 ? shade(col, 1.25) : y > 4 ? col : shade(col, 0.8)); }
      P(x0 + 4, 74, 3, 2, '#ffe28a'); P(x0 + w - 8, 72, 3, 2, (frame + a) % 2 ? '#ffe28a' : '#7a6a30');
      // buildings on this area's plots
      byArea[a].forEach((b, i) => {
        const bx = x0 + 2 + i * 7, c = FAMILY_COLOR[b.family] || FAMILY_COLOR.none;
        const h = b.kind === 'station' ? 9 + (b.tier || 1) * 2 : 8;
        P(bx, 78 - 12 - h, 6, h, shade(c, 0.75)); P(bx, 78 - 12 - h, 6, 1, shade(c, 1.3)); P(bx + 5, 78 - 12 - h, 1, h, shade(c, 0.45));
        if (b.kind === 'station') { P(bx + 2, 78 - 12 - h - 4, 2, 4, '#556'); if ((frame + i) % 2) P(bx + 2, 78 - 12 - h - 6, 2, 2, '#c8ccd0'); }
        if (b.kind === 'depot') { P(bx + 1, 78 - 12 - h + 2, 4, 2, shade(c, 0.4)); }
        if (b.kind === 'lab') { P(bx + 2, 78 - 12 - h - 2, 2, 2, (frame % 2) ? '#67e8f9' : '#155e75'); }
      });
    }
    // ground lights along the front
    for (let x = 6; x < W - 10; x += 12) P(x, 82, 1, 1, ((x / 12 + frame) % 2) ? '#ffd45a' : '#6a5a20');
  } else {
    // orbital: hub ring centre-left, a spar per area to the right
    const cx = 46, cy = 56;
    for (let a = 0; a < 360; a += 2) { const rad = a * Math.PI / 180; const rr = 22; P(cx + Math.cos(rad) * rr, cy + Math.sin(rad) * rr * 0.55, 2, 2, a > 180 ? '#9fb2cc' : '#5f7392'); }
    P(cx - 8, cy - 8, 16, 16, '#3b4d6b'); P(cx - 8, cy - 8, 16, 2, '#7f93b0'); P(cx - 4, cy - 3, 8, 5, '#0f1a2c');
    for (let i = 0; i < 6; i++) P(cx - 3 + i, cy - 1, 1, 1, ((i + frame) % 3) ? '#67e8f9' : '#134e5a');
    // docking bar
    P(cx - 30, cy + 14, 24, 3, '#4a5f80'); P(cx - 30, cy + 14, 24, 1, '#8aa0c0'); P(cx - 28, cy + 17, 2, 2, (frame % 2) ? '#4ade80' : '#14532d');
    for (let a = 0; a < areas; a++) {
      const sx = cx + 26 + a * 24, sy = cy - 26 + (a % 2) * 8;
      P(cx + 8, sy + 20, sx - cx - 8, 2, '#556a8c'); // spar out from hub
      P(sx, sy, 6, 44, '#4e6688'); P(sx, sy, 6, 1, '#8aa0c0'); P(sx + 5, sy, 1, 44, '#2a3a55');
      byArea[a].forEach((b, i) => {
        const c = FAMILY_COLOR[b.family] || FAMILY_COLOR.none;
        const px = sx + (i % 2 ? 8 : -10), py = sy + 4 + Math.floor(i / 2) * 20;
        P(px, py, 8, 12, shade(c, 0.75)); P(px, py, 8, 1, shade(c, 1.3)); P(px + 7, py, 1, 12, shade(c, 0.45));
        P(px + 3, py + 5, 2, 2, ((i + frame) % 2) ? '#ffffff' : shade(c, 0.4));
        if (b.kind === 'station') P(px + 2, py + 12, 4, 2, '#556');
      });
      P(sx + 2, sy - 3, 2, 2, ((a + frame) % 2) ? '#ff3b3b' : '#5a1010');
    }
    // solar wings
    P(cx - 8, cy - 40, 16, 8, '#1e3a5f'); for (let i = 0; i < 4; i++) P(cx - 8 + i * 4, cy - 40, 3, 8, '#2b5a8f'); P(cx - 1, cy - 32, 2, 8, '#6b7b95');
  }
  // vignette frame
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, W, 2); ctx.fillRect(0, H - 2, W, 2); ctx.fillRect(0, 0, 2, H); ctx.fillRect(W - 2, 0, 2, H);
}

export const familyColor = (f) => FAMILY_COLOR[f] || FAMILY_COLOR.none;
