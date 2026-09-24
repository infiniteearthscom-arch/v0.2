// PlanetSprite.jsx -- the pixel-art planet, anywhere outside SystemView
// (2026-09-24). Same sheets as the system view (utils/planetRenderer.js:
// unlit rotation sheet + shared shade mask + emissive pass), driven by
// its own 30 fps rAF loop so only this element re-renders. Used by the
// planet window banner in place of the old flat gradient orb.

import React, { useEffect, useRef, useState } from 'react';
import { getPlanetSheet, getShadeMask, lightIndexFor, spinRate } from '@/utils/planetRenderer';

// First swatch of SystemView's PLANET_TYPES -- the base material colour
// when a body carries no explicit colour (procedural systems).
const TYPE_BASE = {
  rocky: '#888888', terran: '#4488aa', desert: '#ddaa66', ice: '#aaddff', gas_giant: '#ddaa77',
  ocean: '#2266aa', lava: '#ff4400', barren: '#444444', exotic: '#aa44ff',
};
export const planetBaseColor = (body) => body?.color || TYPE_BASE[body?.planetType] || '#888888';

const FRAME_MS = 1000 / 30;

// size: rendered disc diameter in CSS px. lightFrom: {x, y} of where the
// "star" sits relative to the planet (default: upper-left).
export const PlanetSprite = ({ body, size = 84, lightFrom = { x: -100, y: -60 }, style }) => {
  const [frame, setFrame] = useState(0);
  const raf = useRef(0);
  const last = useRef(0);
  const t0 = useRef(performance.now());
  const rate = spinRate(body?.size || 30);

  useEffect(() => {
    const loop = (now) => {
      raf.current = requestAnimationFrame(loop);
      if (now - last.current < FRAME_MS) return;
      last.current = now;
      const sheet = getPlanetSheet(body, planetBaseColor(body));
      const t = (now - t0.current) / 1000;
      const f = Math.floor(((t * rate) % 1) * sheet.frames);
      setFrame(prev => (prev === f ? prev : f));
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [body?.id, rate]);

  if (!body) return null;
  const color = planetBaseColor(body);
  const sheet = getPlanetSheet(body, color);
  // lightIndexFor takes the planet's position with the star at the origin,
  // so the star "at lightFrom" means the planet sits at -lightFrom.
  const mask = getShadeMask(body.size || 30, body.hasRings, lightIndexFor(-lightFrom.x, -lightFrom.y));
  const scale = size / sheet.px;
  const w = sheet.fw * scale, h = sheet.fh * scale;
  const f = Math.min(frame, sheet.frames - 1);
  return (
    <div style={{ position: 'relative', width: w, height: h, ...style }}>
      {/* soft glow behind the disc */}
      <div style={{ position: 'absolute', left: (w - size) / 2 - size * 0.15, top: (h - size) / 2 - size * 0.15, width: size * 1.3, height: size * 1.3, borderRadius: '50%', background: `radial-gradient(circle, ${color}55 0%, ${color}22 45%, transparent 70%)`, pointerEvents: 'none' }} />
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
        <svg x={0} y={0} width={w} height={h} viewBox={`${f * sheet.fw} 0 ${sheet.fw} ${sheet.fh}`} preserveAspectRatio="none" style={{ overflow: 'hidden' }}>
          <image href={sheet.dataUrl} x={0} y={0} width={sheet.fw * sheet.frames} height={sheet.fh} style={{ imageRendering: 'pixelated' }} />
        </svg>
        <image href={mask.dataUrl} x={0} y={0} width={w} height={h} style={{ imageRendering: 'pixelated', mixBlendMode: 'multiply' }} />
        {sheet.emissiveDataUrl && (
          <svg x={0} y={0} width={w} height={h} viewBox={`${f * sheet.fw} 0 ${sheet.fw} ${sheet.fh}`} preserveAspectRatio="none" style={{ overflow: 'hidden' }}>
            <image href={sheet.emissiveDataUrl} x={0} y={0} width={sheet.fw * sheet.frames} height={sheet.fh} style={{ imageRendering: 'pixelated' }} />
          </svg>
        )}
      </svg>
    </div>
  );
};

export default PlanetSprite;
