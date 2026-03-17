import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DraggableWindow } from '@/components/ui/DraggableWindow';
import { fittingAPI } from '@/utils/api';
import { useGameStore } from '@/stores/gameStore';
import { useTooltip } from '@/components/ui/TooltipProvider';

// ============================================
// SEEDED RANDOM (for consistent ship details)
// ============================================
class SRng {
  constructor(seed) { this.s = seed % 2147483647; if (this.s <= 0) this.s += 2147483646; }
  next() { this.s = (this.s * 16807) % 2147483647; return (this.s - 1) / 2147483646; }
  range(a, b) { return a + this.next() * (b - a); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[this.int(0, arr.length - 1)]; }
}

// ============================================
// SLOT TYPE VISUALS
// ============================================
const SLOT_TYPES = {
  engine:  { color: '#ff6622', name: 'Engine',  icon: '🔥' },
  weapon:  { color: '#ff2244', name: 'Weapon',  icon: '🔫' },
  shield:  { color: '#8844ff', name: 'Shield',  icon: '🛡️' },
  cargo:   { color: '#ddaa22', name: 'Cargo',   icon: '📦' },
  utility: { color: '#22ccaa', name: 'Utility', icon: '🔧' },
  reactor: { color: '#00ddff', name: 'Reactor', icon: '⚛️' },
  mining:  { color: '#aa66ff', name: 'Mining',  icon: '⛏️' },
};

// ============================================
// HULL SHAPES (client-side rendering data)
// ============================================
const HULL_SHAPES = {
  // starter_scout uses the same shape as scout
  starter_scout: null, // populated below after scout is defined
  fighter: {
    gridW: 5, gridH: 9,
    shape: [
      [0,0,1,0,0],[0,0,1,0,0],[0,1,2,1,0],[0,1,2,1,0],
      [1,2,2,2,1],[1,2,2,2,1],[1,0,2,0,1],[0,0,1,0,0],[0,0,1,0,0],
    ],
    bridgeRow: 2, bridgeWidth: 1, bridgeX: 2,
    engines: [{ x: 2, w: 1 }],
    palette: { hull: [0x60,0x60,0x6a], armor: [0x48,0x48,0x55], accent: '#dd8833', engine: '#ff8833', viewport: '#ffcc88', stripe: '#dd8833', detail: [0x50,0x50,0x5a] },
  },
  scout: {
    gridW: 7, gridH: 18,
    shape: [
      [0,0,0,1,0,0,0],[0,0,0,1,0,0,0],[0,0,1,2,1,0,0],[0,0,1,2,1,0,0],
      [0,0,1,2,1,0,0],[0,1,2,2,2,1,0],[0,1,2,2,2,1,0],[0,1,2,2,2,1,0],
      [0,1,2,2,2,1,0],[0,1,2,2,2,1,0],[0,1,2,2,2,1,0],[0,1,2,2,2,1,0],
      [1,1,2,2,2,1,1],[1,0,1,2,1,0,1],[1,0,1,2,1,0,1],[1,0,0,2,0,0,1],
      [0,0,0,1,0,0,0],[0,0,0,1,0,0,0],
    ],
    bridgeRow: 3, bridgeWidth: 1, bridgeX: 3,
    engines: [{ x: 3, w: 1 }],
    palette: { hull: [0x58,0x68,0x78], armor: [0x40,0x50,0x60], accent: '#5599cc', engine: '#4488ff', viewport: '#88ccff', stripe: '#5599cc', detail: [0x4a,0x5a,0x6a] },
  },
  shuttle: {
    gridW: 11, gridH: 14,
    shape: [
      [0,0,0,0,1,1,1,0,0,0,0],[0,0,0,1,2,2,2,1,0,0,0],[0,0,1,2,2,2,2,2,1,0,0],
      [0,1,2,2,2,2,2,2,2,1,0],[0,1,2,2,2,2,2,2,2,1,0],[1,1,2,2,2,2,2,2,2,1,1],
      [1,2,2,2,2,2,2,2,2,2,1],[1,2,2,2,2,2,2,2,2,2,1],[1,1,2,2,2,2,2,2,2,1,1],
      [0,1,2,2,2,2,2,2,2,1,0],[0,1,2,2,2,2,2,2,2,1,0],[0,0,1,2,2,2,2,2,1,0,0],
      [0,0,0,1,2,2,2,1,0,0,0],[0,0,0,0,1,1,1,0,0,0,0],
    ],
    bridgeRow: 1, bridgeWidth: 3, bridgeX: 4,
    engines: [{ x: 4, w: 3 }],
    palette: { hull: [0x58,0x68,0x52], armor: [0x48,0x58,0x42], accent: '#7faa55', engine: '#44ff88', viewport: '#aaffcc', stripe: '#7faa55', detail: [0x4a,0x5a,0x44] },
  },
  freighter: {
    gridW: 13, gridH: 22,
    shape: [
      [0,0,0,0,0,0,1,0,0,0,0,0,0],[0,0,0,0,0,1,2,1,0,0,0,0,0],[0,0,0,0,1,2,2,2,1,0,0,0,0],
      [0,0,0,1,2,2,2,2,2,1,0,0,0],[0,0,1,2,2,2,2,2,2,2,1,0,0],[0,1,2,2,2,2,2,2,2,2,2,1,0],
      [1,2,2,2,2,2,2,2,2,2,2,2,1],[1,2,2,2,2,2,2,2,2,2,2,2,1],[1,2,2,2,2,2,2,2,2,2,2,2,1],
      [1,2,2,2,2,2,2,2,2,2,2,2,1],[1,2,2,2,2,2,2,2,2,2,2,2,1],[1,2,2,2,2,2,2,2,2,2,2,2,1],
      [1,2,2,2,2,2,2,2,2,2,2,2,1],[1,2,2,2,2,2,2,2,2,2,2,2,1],[1,2,2,2,2,2,2,2,2,2,2,2,1],
      [1,2,2,2,2,2,2,2,2,2,2,2,1],[1,2,2,2,2,2,2,2,2,2,2,2,1],[1,2,2,2,2,2,2,2,2,2,2,2,1],
      [1,1,2,2,2,2,2,2,2,2,2,1,1],[0,1,1,2,2,2,2,2,2,2,1,1,0],[0,0,1,1,2,2,2,2,2,1,1,0,0],
      [0,0,0,1,1,1,1,1,1,1,0,0,0],
    ],
    bridgeRow: 2, bridgeWidth: 3, bridgeX: 5,
    engines: [{ x: 3, w: 2 }, { x: 5, w: 3 }, { x: 8, w: 2 }],
    palette: { hull: [0x6a,0x5c,0x4a], armor: [0x58,0x4a,0x38], accent: '#cc9944', engine: '#ffaa44', viewport: '#ffeebb', stripe: '#cc9944', detail: [0x5a,0x4c,0x3a] },
  },
  frigate: {
    gridW: 17, gridH: 11,
    shape: [
      [0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,1,2,1,0,0,0,0,0,0,0],
      [0,0,0,0,0,0,1,2,2,2,1,0,0,0,0,0,0],[0,0,0,0,0,1,2,2,2,2,2,1,0,0,0,0,0],
      [0,0,0,0,1,2,2,2,2,2,2,2,1,0,0,0,0],[0,0,0,1,2,2,2,2,2,2,2,2,2,1,0,0,0],
      [0,0,1,2,2,2,1,2,2,2,1,2,2,2,1,0,0],[0,1,2,2,2,1,0,1,2,1,0,1,2,2,2,1,0],
      [1,1,2,2,1,0,0,1,2,1,0,0,1,2,2,1,1],[0,0,1,1,0,0,0,0,2,0,0,0,0,1,1,0,0],
      [0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
    ],
    bridgeRow: 1, bridgeWidth: 3, bridgeX: 7,
    engines: [{ x: 2, w: 2 }, { x: 7, w: 3 }, { x: 13, w: 2 }],
    palette: { hull: [0x3a,0x3a,0x48], armor: [0x2a,0x2a,0x38], accent: '#885555', engine: '#ff4444', viewport: '#ffaaaa', stripe: '#664444', detail: [0x30,0x30,0x40] },
  },
  capital: {
    gridW: 19, gridH: 32,
    shape: [
      [0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,1,2,1,0,0,0,0,0,0,0,0],
      [0,0,0,0,0,0,0,1,2,2,2,1,0,0,0,0,0,0,0],[0,0,0,0,0,0,1,2,2,2,2,2,1,0,0,0,0,0,0],
      [0,0,0,0,0,1,2,2,2,2,2,2,2,1,0,0,0,0,0],[0,0,0,0,1,2,2,2,2,2,2,2,2,2,1,0,0,0,0],
      [0,0,0,1,2,2,2,2,2,2,2,2,2,2,2,1,0,0,0],[0,0,1,2,2,2,2,2,2,2,2,2,2,2,2,2,1,0,0],
      [0,1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,0],[1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
      [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],[1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
      [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],[1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
      [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],[1,2,2,2,1,1,2,2,2,2,2,2,2,1,1,2,2,2,1],
      [1,2,2,2,1,0,1,2,2,2,2,2,1,0,1,2,2,2,1],[1,2,2,2,1,0,1,2,2,2,2,2,1,0,1,2,2,2,1],
      [1,2,2,2,1,0,1,2,2,2,2,2,1,0,1,2,2,2,1],[1,2,2,2,1,0,1,2,2,2,2,2,1,0,1,2,2,2,1],
      [1,2,2,2,1,1,2,2,2,2,2,2,2,1,1,2,2,2,1],[1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
      [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],[1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
      [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],[1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
      [1,1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,1],[1,1,2,2,2,1,2,2,2,2,2,2,2,1,2,2,2,1,1],
      [0,1,1,2,1,0,1,2,2,2,2,2,1,0,1,2,1,1,0],[0,0,1,1,0,0,0,1,2,2,2,1,0,0,0,1,1,0,0],
      [0,0,0,0,0,0,0,1,2,2,2,1,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0],
    ],
    bridgeRow: 3, bridgeWidth: 5, bridgeX: 7,
    engines: [{ x: 2, w: 2 }, { x: 6, w: 2 }, { x: 8, w: 3 }, { x: 11, w: 2 }, { x: 15, w: 2 }],
    palette: { hull: [0x50,0x52,0x5a], armor: [0x3a,0x3c,0x44], accent: '#7788aa', engine: '#6699ff', viewport: '#aaccff', stripe: '#667799', detail: [0x42,0x44,0x4c] },
  },
};

// Starter Scout uses Scout hull shape
HULL_SHAPES.starter_scout = HULL_SHAPES.scout;

// ============================================
// SHIP CANVAS RENDERER (from ShipArtDemo)
// ============================================
const CELL = 20;
const rgb = (r,g,b) => `rgb(${r},${g},${b})`;
const rgba = (r,g,b,a) => `rgba(${r},${g},${b},${a})`;

const drawShip = (ctx, hull, scale, time, opts = {}) => {
  const { showSlots = false, modules = {}, hovered = null, dragOver = null } = opts;
  const C = CELL * scale;
  const pal = hull.palette;
  const [hr,hg,hb] = pal.hull;
  const [ar,ag,ab] = pal.armor;
  const [dr,dg,db] = pal.detail;
  const rng = new SRng(hull.gridW*1000 + hull.gridH*100 + (hull.bridgeRow||0)*10);

  ctx.save();

  // Pass 1: Base fill
  for (let y = 0; y < hull.gridH; y++) {
    for (let x = 0; x < hull.gridW; x++) {
      const v = hull.shape[y]?.[x]; if (!v) continue;
      const px = x*C, py = y*C;
      const sh = rng.range(-6,6);
      ctx.fillStyle = v===1 ? rgb(ar+sh,ag+sh,ab+sh) : rgb(hr+sh,hg+sh,hb+sh);
      ctx.fillRect(px,py,C,C);
    }
  }

  // Pass 2: Large panels
  const pRng = new SRng(hull.gridW*4321+hull.gridH);
  for (let i=0; i<8+hull.gridW; i++) {
    const pw=pRng.int(2,Math.min(4,hull.gridW-2)), ph=pRng.int(2,Math.min(4,hull.gridH-2));
    const px2=pRng.int(1,hull.gridW-pw-1), py2=pRng.int(2,hull.gridH-ph-2);
    let ok=true;
    for (let dy=0;dy<ph&&ok;dy++) for(let dx=0;dx<pw&&ok;dx++) if(hull.shape[py2+dy]?.[px2+dx]!==2) ok=false;
    if(!ok) continue;
    const s2=pRng.range(-12,8);
    ctx.fillStyle=rgb(hr+s2,hg+s2,hb+s2);
    ctx.fillRect(px2*C+2,py2*C+2,pw*C-4,ph*C-4);
    ctx.strokeStyle=rgba(0,0,0,0.2); ctx.lineWidth=0.7*scale;
    ctx.strokeRect(px2*C+2,py2*C+2,pw*C-4,ph*C-4);
    ctx.fillStyle='rgba(255,255,255,0.04)';
    ctx.fillRect(px2*C+3,py2*C+3,pw*C-6,1.5*scale);
  }

  // Pass 3: Panel lines
  ctx.lineWidth=0.4*scale;
  for (let y=0;y<hull.gridH;y++) for(let x=0;x<hull.gridW;x++) {
    if(!hull.shape[y]?.[x]) continue;
    if(hull.shape[y+1]?.[x]&&rng.chance(0.55)){ctx.strokeStyle=rgba(0,0,0,rng.range(0.15,0.3));ctx.beginPath();ctx.moveTo(x*C+1,y*C+C);ctx.lineTo(x*C+C-1,y*C+C);ctx.stroke();}
    if(hull.shape[y]?.[x+1]&&rng.chance(0.45)){ctx.strokeStyle=rgba(0,0,0,rng.range(0.15,0.25));ctx.beginPath();ctx.moveTo(x*C+C,y*C+1);ctx.lineTo(x*C+C,y*C+C-1);ctx.stroke();}
  }

  // Pass 4: Edge lighting
  for (let y=0;y<hull.gridH;y++) for(let x=0;x<hull.gridW;x++) {
    const v=hull.shape[y]?.[x]; if(!v) continue;
    const px=x*C,py=y*C;
    const above=hull.shape[y-1]?.[x]||0, below=hull.shape[y+1]?.[x]||0, left=hull.shape[y]?.[x-1]||0, right=hull.shape[y]?.[x+1]||0;
    if(!above){const g=ctx.createLinearGradient(px,py,px,py+C*0.35);g.addColorStop(0,'rgba(255,255,255,0.18)');g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.fillRect(px,py,C,C*0.35);}
    if(!below){const g=ctx.createLinearGradient(px,py+C*0.65,px,py+C);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,0.25)');ctx.fillStyle=g;ctx.fillRect(px,py+C*0.65,C,C*0.35);}
    if(!left){ctx.fillStyle='rgba(255,255,255,0.08)';ctx.fillRect(px,py,1.5*scale,C);}
    if(!right){ctx.fillStyle='rgba(0,0,0,0.12)';ctx.fillRect(px+C-1.5*scale,py,1.5*scale,C);}
    if(v===1){if(!above){ctx.fillStyle=rgba(ar-15,ag-15,ab-15,0.5);ctx.fillRect(px,py,C,2*scale);}if(!below){ctx.fillStyle=rgba(ar-20,ag-20,ab-20,0.5);ctx.fillRect(px,py+C-2*scale,C,2*scale);}}
  }

  // Pass 5: Greebles
  const gRng = new SRng(hull.gridW*7777+hull.gridH);
  for(let y=0;y<hull.gridH;y++) for(let x=0;x<hull.gridW;x++){
    if(hull.shape[y]?.[x]!==2) continue;
    const px=x*C,py=y*C;
    if(gRng.chance(0.10)){const lines=gRng.int(2,4);ctx.fillStyle=rgba(0,0,0,0.35);for(let i=0;i<lines;i++){const lw=C*gRng.range(0.4,0.7);ctx.fillRect(px+(C-lw)/2,py+C*0.15+i*(C*0.7/lines),lw,1.5*scale);}}
    if(gRng.chance(0.12)){ctx.fillStyle=rgba(255,255,255,0.07);const ps=gRng.int(0,3);const pos=[[0.25,0.25],[0.75,0.25],[0.25,0.75],[0.75,0.75]];pos.slice(0,ps+1).forEach(([bx,by])=>{ctx.beginPath();ctx.arc(px+C*bx,py+C*by,1.2*scale,0,Math.PI*2);ctx.fill();});}
    if(gRng.chance(0.09)){const bw=C*gRng.range(0.3,0.65),bh=C*gRng.range(0.25,0.55);ctx.fillStyle=rgb(dr+gRng.range(-15,10),dg+gRng.range(-15,10),db+gRng.range(-15,10));ctx.fillRect(px+(C-bw)/2,py+(C-bh)/2,bw,bh);ctx.strokeStyle=rgba(0,0,0,0.25);ctx.lineWidth=0.5*scale;ctx.strokeRect(px+(C-bw)/2,py+(C-bh)/2,bw,bh);
      if(gRng.chance(0.5)){const lc=gRng.pick(['#44ff44','#ff4444','#ffaa00','#4488ff']);const blink=Math.sin(time*2+x+y)>0?0.8:0.3;ctx.fillStyle=lc+Math.floor(blink*200).toString(16).padStart(2,'0');ctx.beginPath();ctx.arc(px+(C+bw)/2-3*scale,py+(C-bh)/2+3*scale,1*scale,0,Math.PI*2);ctx.fill();}}
    if(gRng.chance(0.07)){ctx.strokeStyle=rgba(dr-10,dg-10,db-10,0.6);ctx.lineWidth=2*scale;ctx.lineCap='round';ctx.beginPath();const ly=py+C*gRng.range(0.3,0.7);ctx.moveTo(px+2,ly);ctx.lineTo(px+C-2,ly);ctx.stroke();ctx.lineCap='butt';}
    if(gRng.chance(0.05)){const hw=C*0.6,hh=C*0.5,hx=px+(C-hw)/2,hy=py+(C-hh)/2;ctx.fillStyle=rgb(hr-8,hg-8,hb-8);ctx.fillRect(hx,hy,hw,hh);ctx.strokeStyle=rgba(0,0,0,0.3);ctx.lineWidth=0.8*scale;ctx.strokeRect(hx,hy,hw,hh);}
  }

  // Pass 5b: Armor greebles
  const aRng = new SRng(hull.gridW*3131+hull.gridH);
  for(let y=0;y<hull.gridH;y++) for(let x=0;x<hull.gridW;x++){
    if(hull.shape[y]?.[x]!==1) continue;
    const px=x*C,py=y*C;
    if(aRng.chance(0.3)){ctx.fillStyle=rgba(255,255,255,0.05);[[0.2,0.2],[0.8,0.2],[0.2,0.8],[0.8,0.8]].forEach(([cx2,cy2])=>{if(aRng.chance(0.6)){ctx.beginPath();ctx.arc(px+C*cx2,py+C*cy2,1*scale,0,Math.PI*2);ctx.fill();}});}
    if(aRng.chance(0.08)){ctx.strokeStyle=rgba(0,0,0,0.15);ctx.lineWidth=0.5*scale;ctx.beginPath();ctx.moveTo(px+aRng.range(2,C-2),py+aRng.range(2,C-2));ctx.lineTo(px+aRng.range(0,C),py+aRng.range(0,C));ctx.stroke();}
  }

  // Pass 6: Center stripe
  const cx = Math.floor(hull.gridW/2);
  for(let y=1;y<hull.gridH-1;y++) if(hull.shape[y]?.[cx]===2){ctx.fillStyle=pal.stripe+'10';ctx.fillRect(cx*C,y*C,C,C);ctx.fillStyle=pal.stripe+'30';ctx.fillRect(cx*C+C/2-1*scale,y*C,2*scale,C);}

  // Pass 7: Bridge viewport
  {
    const bx=hull.bridgeX*C, by=hull.bridgeRow*C, bw=hull.bridgeWidth*C, bh=C*1.8;
    const rx=bx+C*0.3, ry=by+C*0.2, rw=bw-C*0.6, rh=bh-C*0.4;
    ctx.fillStyle=rgba(0,0,0,0.4);ctx.beginPath();ctx.roundRect(rx-2,ry-2,rw+4,rh+4,4*scale);ctx.fill();
    const pulse=0.75+0.25*Math.sin(time*1.5);
    const glow=ctx.createRadialGradient(rx+rw/2,ry+rh/2,0,rx+rw/2,ry+rh/2,rw*0.8);
    glow.addColorStop(0,pal.viewport+Math.floor(pulse*30).toString(16).padStart(2,'0'));glow.addColorStop(1,pal.viewport+'00');
    ctx.fillStyle=glow;ctx.fillRect(rx-rw*0.3,ry-rh*0.3,rw*1.6,rh*1.6);
    const gg=ctx.createLinearGradient(rx,ry,rx,ry+rh);gg.addColorStop(0,pal.viewport+'cc');gg.addColorStop(0.4,pal.viewport+'88');gg.addColorStop(1,pal.viewport+'55');
    ctx.fillStyle=gg;ctx.beginPath();ctx.roundRect(rx,ry,rw,rh,3*scale);ctx.fill();
    ctx.strokeStyle=rgba(ar+20,ag+20,ab+20,0.6);ctx.lineWidth=1.5*scale;ctx.beginPath();ctx.roundRect(rx-1,ry-1,rw+2,rh+2,4*scale);ctx.stroke();
    const mull=Math.max(1,hull.bridgeWidth-1);ctx.strokeStyle=rgba(ar,ag,ab,0.5);ctx.lineWidth=1*scale;
    for(let m=1;m<mull;m++){ctx.beginPath();ctx.moveTo(rx+(rw/mull)*m,ry+2);ctx.lineTo(rx+(rw/mull)*m,ry+rh-2);ctx.stroke();}
    ctx.fillStyle='rgba(255,255,255,0.2)';ctx.beginPath();ctx.roundRect(rx+3,ry+3,rw*0.35,rh*0.3,2*scale);ctx.fill();
  }

  // Pass 8: Running lights
  const lRng=new SRng(hull.gridW*5555+hull.gridH);
  for(let y=0;y<hull.gridH;y++) for(let x=0;x<hull.gridW;x++){
    if(hull.shape[y]?.[x]!==1) continue;
    if(!(!(hull.shape[y]?.[x-1])||!(hull.shape[y]?.[x+1]))) continue;
    if(!lRng.chance(0.1)) continue;
    const px=x*C+C/2,py=y*C+C/2;
    const lc=x<hull.gridW/2?'#ff2222':'#22ff22';
    const blink=Math.sin(time*2.5)>0.2?1.0:0.15;
    const grad=ctx.createRadialGradient(px,py,0,px,py,5*scale);
    grad.addColorStop(0,lc+Math.floor(blink*220).toString(16).padStart(2,'0'));grad.addColorStop(1,lc+'00');
    ctx.fillStyle=grad;ctx.fillRect(px-5*scale,py-5*scale,10*scale,10*scale);
    ctx.fillStyle=lc+Math.floor(blink*255).toString(16).padStart(2,'0');ctx.beginPath();ctx.arc(px,py,1.2*scale,0,Math.PI*2);ctx.fill();
  }

  // Pass 9: Engines (uniform)
  {
    const flicker=0.75+0.25*Math.sin(time*6), throb=0.9+0.1*Math.sin(time*12);
    for(const eng of hull.engines){
      const ecx=(eng.x+eng.w/2)*C, ey=(hull.gridH-1)*C+C, nw=eng.w*C*0.7, pl=C*2.5*flicker;
      ctx.fillStyle=rgba(ar-20,ag-20,ab-20,0.9);ctx.fillRect(ecx-nw/2,ey-C*0.3,nw,C*0.35);
      ctx.fillStyle=pal.engine+'cc';ctx.fillRect(ecx-nw*0.35,ey-C*0.1,nw*0.7,C*0.2);
      const pg=ctx.createRadialGradient(ecx,ey,0,ecx,ey+pl*0.7,pl);
      pg.addColorStop(0,'#ffffffee');pg.addColorStop(0.1,pal.engine+'dd');pg.addColorStop(0.35,pal.engine+'88');pg.addColorStop(0.6,pal.engine+'33');pg.addColorStop(1,pal.engine+'00');
      ctx.fillStyle=pg;ctx.beginPath();ctx.ellipse(ecx,ey+pl*0.3,nw*0.45*throb,pl,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=`rgba(255,255,255,${0.7*flicker})`;ctx.beginPath();ctx.ellipse(ecx,ey+C*0.1,nw*0.15,C*0.4*throb,0,0,Math.PI*2);ctx.fill();
    }
  }

  // Pass 10: Module slot overlay
  if (showSlots) {
    for (const slot of (opts.slots || [])) {
      const sx=slot.x*C, sy=slot.y*C, sw=slot.w*C, sh=slot.h*C;
      const st = SLOT_TYPES[slot.type] || { color: '#888', name: slot.type };
      const isHov = hovered === slot.id;
      const isDrag = dragOver === slot.id;
      const installed = modules[slot.id];

      if (installed) {
        // Installed module — solid color fill with strong border
        ctx.fillStyle = st.color + '44';
        ctx.fillRect(sx+1,sy+1,sw-2,sh-2);
        ctx.strokeStyle = st.color + 'bb';
        ctx.lineWidth = 2*scale;
        ctx.strokeRect(sx+1,sy+1,sw-2,sh-2);
        // Inner highlight
        ctx.fillStyle = st.color + '15';
        ctx.fillRect(sx+2,sy+2,sw-4,3*scale);
        // Module name
        ctx.fillStyle = '#ffffffdd';
        ctx.font = `bold ${Math.min(9*scale,sh*0.28)}px monospace`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(installed.name || st.name, sx+sw/2, sy+sh/2 - 4*scale);
        // Quality bar
        if (installed.quality) {
          const q = installed.quality;
          const avg = Math.round((q.purity + q.stability + q.potency + q.density) / 4);
          const barW = sw * 0.6, barH = 3*scale;
          const barX = sx + (sw-barW)/2, barY = sy + sh/2 + 5*scale;
          // Background
          ctx.fillStyle = 'rgba(0,0,0,0.4)';
          ctx.fillRect(barX, barY, barW, barH);
          // Fill — color based on quality
          const qColor = avg >= 80 ? '#aa44ff' : avg >= 60 ? '#4488ff' : avg >= 40 ? '#44cc44' : '#888888';
          ctx.fillStyle = qColor + 'cc';
          ctx.fillRect(barX, barY, barW * Math.min(avg/100, 1), barH);
          ctx.strokeStyle = 'rgba(255,255,255,0.15)';
          ctx.lineWidth = 0.5*scale;
          ctx.strokeRect(barX, barY, barW, barH);
          // Quality number
          ctx.fillStyle = qColor;
          ctx.font = `${6*scale}px monospace`;
          ctx.fillText(`Q${avg}`, sx+sw/2, barY + barH + 5*scale);
        }
      } else {
        // Empty slot — always visible with colored tint + solid border
        ctx.fillStyle = st.color + '18';
        ctx.fillRect(sx+1,sy+1,sw-2,sh-2);

        // Solid border (brighter on hover/drag)
        ctx.strokeStyle = isDrag ? st.color+'ee' : isHov ? st.color+'bb' : st.color+'66';
        ctx.lineWidth = (isDrag ? 2.5 : isHov ? 2 : 1.5) * scale;
        ctx.strokeRect(sx+1,sy+1,sw-2,sh-2);

        // Hover/drag extra fill
        if(isDrag){ctx.fillStyle=st.color+'33';ctx.fillRect(sx+2,sy+2,sw-4,sh-4);}
        else if(isHov){ctx.fillStyle=st.color+'1a';ctx.fillRect(sx+2,sy+2,sw-4,sh-4);}

        // Slot type label — always visible
        ctx.fillStyle = isHov||isDrag ? st.color+'cc' : st.color+'88';
        ctx.font = `bold ${Math.min(8*scale,sh*0.25)}px monospace`;
        ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.fillText(st.name, sx+sw/2, sy+sh/2);

        // Size label
        ctx.fillStyle=st.color+'44';ctx.font=`${6*scale}px monospace`;
        ctx.fillText(`${slot.w}×${slot.h}`,sx+sw/2,sy+sh/2+9*scale);

        // Corner markers (small colored squares at corners for extra visibility)
        const cm = 3*scale;
        ctx.fillStyle = st.color + '77';
        ctx.fillRect(sx+1,sy+1,cm,cm);
        ctx.fillRect(sx+sw-cm-1,sy+1,cm,cm);
        ctx.fillRect(sx+1,sy+sh-cm-1,cm,cm);
        ctx.fillRect(sx+sw-cm-1,sy+sh-cm-1,cm,cm);
      }
      // Required indicator
      if(slot.required&&!installed){ctx.fillStyle='#ff4444aa';ctx.beginPath();ctx.arc(sx+sw-5*scale,sy+5*scale,3.5*scale,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.font=`bold ${7*scale}px monospace`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('!',sx+sw-5*scale,sy+5.5*scale);}
    }
  }

  ctx.restore();
};

// ============================================
// SHIP CANVAS COMPONENT
// ============================================
const ShipCanvas = ({ hullId, scale = 2, showSlots = false, slots = [], modules = {}, onSlotClick, onSlotHover, onSlotDrop }) => {
  const canvasRef = useRef(null);
  const [hovered, setHovered] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const animRef = useRef(null);
  const hull = HULL_SHAPES[hullId];

  useEffect(() => {
    if (!hull) return;
    const canvas = canvasRef.current;
    const C = CELL * scale;
    canvas.width = hull.gridW * C + 20;
    canvas.height = hull.gridH * C + C * 3;
    const ctx = canvas.getContext('2d');
    let frame = 0;
    const animate = () => {
      frame++;
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.save(); ctx.translate(10,5);
      drawShip(ctx, hull, scale, frame/60, { showSlots, slots, modules, hovered, dragOver });
      ctx.restore();
      animRef.current = requestAnimationFrame(animate);
    };
    animate();
    return () => cancelAnimationFrame(animRef.current);
  }, [hull, scale, showSlots, slots, modules, hovered, dragOver]);

  const getSlotAt = useCallback((e) => {
    if (!hull || !slots.length) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    const C = CELL * scale;
    const x = Math.floor((e.clientX - rect.left - 10) / C);
    const y = Math.floor((e.clientY - rect.top - 5) / C);
    return slots.find(s => x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h) || null;
  }, [hull, scale, slots]);

  const handleMouseMove = (e) => { const s = getSlotAt(e); if (s?.id !== hovered) { setHovered(s?.id || null); onSlotHover?.(s, e); } };
  const handleDragOver = (e) => { e.preventDefault(); setDragOver(getSlotAt(e)?.id || null); };
  const handleDrop = (e) => {
    e.preventDefault();
    const s = getSlotAt(e);
    setDragOver(null);
    if (s && onSlotDrop) {
      try { onSlotDrop(s, JSON.parse(e.dataTransfer.getData('application/json'))); } catch {}
    }
  };

  if (!hull) return <div className="text-red-400 text-xs">Unknown hull: {hullId}</div>;
  return (
    <canvas ref={canvasRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => { setHovered(null); setDragOver(null); onSlotHover?.(null, null); }}
      onClick={(e) => { const s = getSlotAt(e); if (s) onSlotClick?.(s); }}
      onDragOver={handleDragOver} onDragLeave={() => setDragOver(null)} onDrop={handleDrop}
      style={{ cursor: 'pointer' }}
    />
  );
};

// ============================================
// SHIP SELECTOR PANEL
// ============================================
const ShipSelector = ({ ships, selectedId, onSelect, hulls, onBuyHull }) => {
  const [showBuy, setShowBuy] = useState(false);

  return (
    <div className="space-y-2">
      <div className="text-[10px] text-slate-500 uppercase tracking-wider">Your Fleet</div>
      {ships.map(ship => (
        <button key={ship.id} onClick={() => onSelect(ship.id)}
          className={`w-full text-left p-2 rounded transition-all text-xs ${
            selectedId === ship.id
              ? 'bg-cyan-900/30 border border-cyan-500/40'
              : 'bg-slate-800/30 border border-slate-700/30 hover:border-slate-600/50'
          }`}
        >
          <div className="font-medium text-slate-200">{ship.name}</div>
          <div className="text-[10px] text-slate-500">{ship.hull_name || 'Unknown'} • {ship.hull_class || ''}</div>
        </button>
      ))}
      {ships.length === 0 && (
        <div className="text-xs text-slate-600 italic py-2">No ships yet</div>
      )}

      <button onClick={() => setShowBuy(!showBuy)}
        className="w-full text-center text-xs py-1.5 rounded bg-green-900/20 border border-green-700/30 text-green-400 hover:bg-green-900/30 mt-2"
      >
        {showBuy ? '▲ Cancel' : '+ Buy New Hull'}
      </button>

      {showBuy && (
        <div className="space-y-1 mt-1">
          {hulls.map(h => (
            <button key={h.id} onClick={() => { onBuyHull(h.id); setShowBuy(false); }}
              className="w-full text-left p-2 rounded bg-slate-800/40 border border-slate-700/30 hover:border-green-600/40 text-xs"
            >
              <div className="flex justify-between items-center">
                <span className="text-slate-200">{h.name}</span>
                <span className="text-yellow-400">{h.price > 0 ? `${h.price.toLocaleString()} cr` : 'Free'}</span>
              </div>
              <div className="text-[10px] text-slate-500">{h.class} • {(h.slots || []).length} slots</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================
// SLOT INFO PANEL
// ============================================
const SlotInfo = ({ slot, module }) => {
  if (!slot) return <div className="text-center text-slate-600 text-[10px] py-3">Hover a slot for details</div>;
  const st = SLOT_TYPES[slot.type] || { color: '#888', name: slot.type };
  
  let avgQ = null, qColor = '#888';
  if (module?.quality) {
    const q = module.quality;
    avgQ = Math.round((q.purity + q.stability + q.potency + q.density) / 4);
    qColor = avgQ >= 80 ? '#aa44ff' : avgQ >= 60 ? '#4488ff' : avgQ >= 40 ? '#44cc44' : '#888888';
  }

  return (
    <div className="p-2 rounded border text-xs" style={{ borderColor: st.color + '44', background: st.color + '08' }}>
      <div className="flex items-center gap-2 mb-1">
        <div className="w-2.5 h-2.5 rounded" style={{ backgroundColor: st.color }} />
        <span className="font-medium" style={{ color: st.color }}>{st.name} Slot</span>
        {slot.required && <span className="text-[9px] text-red-400 font-bold">REQUIRED</span>}
      </div>
      <div className="text-[10px] text-slate-500">Size: {slot.w}×{slot.h}</div>
      {module ? (
        <div className="mt-1.5">
          <div className="text-slate-300">
            <span className="text-cyan-300 font-medium">{module.name}</span>
            {module.tier && <span className="text-slate-500 ml-1.5">T{module.tier}</span>}
          </div>
          {avgQ !== null && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] text-slate-500">Quality:</span>
              <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${avgQ}%`, backgroundColor: qColor }} />
              </div>
              <span className="text-[10px] font-medium" style={{ color: qColor }}>{avgQ}</span>
            </div>
          )}
          {module.quality && (
            <div className="flex gap-2 mt-1 text-[9px] text-slate-500">
              <span>Pur <span className="text-slate-400">{module.quality.purity}</span></span>
              <span>Stb <span className="text-slate-400">{module.quality.stability}</span></span>
              <span>Pot <span className="text-slate-400">{module.quality.potency}</span></span>
              <span>Den <span className="text-slate-400">{module.quality.density}</span></span>
            </div>
          )}
          {module.base_stats && (
            <div className="mt-1.5 pt-1.5 border-t border-slate-700/30">
              {Object.entries(module.base_stats).map(([key, val]) => {
                const scaled = avgQ !== null ? Math.round(val * (avgQ / 50)) : val;
                return (
                  <div key={key} className="flex justify-between text-[10px]">
                    <span className="text-slate-500">{key.replace(/_/g, ' ')}</span>
                    <span className="text-slate-300">
                      {scaled}
                      {scaled !== val && <span className="text-slate-600 ml-1">({val})</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="text-[9px] text-slate-600 mt-1">Click to select</div>
        </div>
      ) : (
        <div className="mt-1 text-slate-500">Empty — drag a module from cargo</div>
      )}
    </div>
  );
};

// ============================================
// STATS PANEL
// ============================================
const StatsPanel = ({ ship, moduleDetails }) => {
  if (!ship) return null;
  const stats = [
    { label: 'Hull', value: ship.base_hull || 0 },
    { label: 'Speed', value: ship.base_speed || 0 },
    { label: 'Maneuver', value: ship.base_maneuver || 0 },
    { label: 'Sensors', value: ship.base_sensors || 0 },
  ];

  // Count cargo from modules
  let totalCargo = 0;
  for (const mod of Object.values(moduleDetails)) {
    if (mod.base_stats?.cargo_capacity) totalCargo += mod.base_stats.cargo_capacity;
  }

  const fitted = Object.keys(moduleDetails).length;
  const totalSlots = (ship.hull_slots || []).length;

  return (
    <div className="space-y-1.5">
      <div className="text-[10px] text-slate-500 uppercase tracking-wider">Ship Stats</div>
      {stats.map(s => (
        <div key={s.label} className="bg-slate-800/30 rounded p-1.5 border border-slate-700/20">
          <div className="text-[9px] text-slate-500">{s.label}</div>
          <div className="text-sm text-slate-200">{s.value}</div>
        </div>
      ))}
      <div className="bg-slate-800/30 rounded p-1.5 border border-slate-700/20">
        <div className="text-[9px] text-slate-500">Cargo</div>
        <div className="text-sm text-yellow-300">{totalCargo}</div>
      </div>
      <div className="bg-slate-800/30 rounded p-1.5 border border-slate-700/20">
        <div className="text-[9px] text-slate-500">Modules</div>
        <div className="text-sm text-cyan-300">{fitted}/{totalSlots}</div>
      </div>
    </div>
  );
};

// ============================================
// MODULE SHOP (for buying at stations)
// ============================================
const ModuleShop = ({ moduleTypes, onBuy }) => {
  const grouped = {};
  for (const m of moduleTypes) {
    if (!m.buy_price) continue;
    if (!grouped[m.slot_type]) grouped[m.slot_type] = [];
    grouped[m.slot_type].push(m);
  }

  return (
    <div className="space-y-2">
      <div className="text-[10px] text-slate-500 uppercase tracking-wider">Station Modules</div>
      {Object.entries(grouped).map(([type, mods]) => {
        const st = SLOT_TYPES[type] || { color: '#888', name: type };
        return (
          <div key={type}>
            <div className="text-[10px] font-medium mb-1" style={{ color: st.color }}>{st.name}</div>
            {mods.map(m => (
              <button key={m.id} onClick={() => onBuy(m.id)}
                className="w-full text-left p-1.5 rounded bg-slate-800/30 border border-slate-700/20 hover:border-slate-500/40 text-xs mb-1"
              >
                <div className="flex justify-between">
                  <span className="text-slate-300">{m.name}</span>
                  <span className="text-yellow-400">{m.buy_price} cr</span>
                </div>
                <div className="text-[9px] text-slate-500">T{m.tier} • {m.description}</div>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
};

// ============================================
// MAIN SHIP BUILDER WINDOW
// ============================================
export const ShipBuilderWindow = () => {
  const [ships, setShips] = useState([]);
  const [hulls, setHulls] = useState([]);
  const [moduleTypes, setModuleTypes] = useState([]);
  const [selectedShipId, setSelectedShipId] = useState(null);
  const [shipDetail, setShipDetail] = useState(null);
  const [moduleDetails, setModuleDetails] = useState({});
  const [message, setMessage] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const { showTooltip, hideTooltip } = useTooltip();
  const [launching, setLaunching] = useState(false);
  const fetchShips = useGameStore(state => state.fetchShips);
  const closeWindow = useGameStore(state => state.closeWindow);
  const openWindow = useGameStore(state => state.openWindow);
  const [tab, setTab] = useState('fit'); // fitting only now

  // Load initial data
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [hullsRes, modsRes, shipsRes] = await Promise.all([
        fittingAPI.getHulls(),
        fittingAPI.getModuleTypes(),
        fittingAPI.getMyShips(),
      ]);
      setHulls(hullsRes.hulls || []);
      setModuleTypes(modsRes.modules || []);
      setShips(shipsRes.ships || []);
      // Auto-select first ship
      if (shipsRes.ships?.length > 0 && !selectedShipId) {
        selectShip(shipsRes.ships[0].id);
      }
    } catch (err) {
      console.error('Failed to load fitting data:', err);
    }
  };

  const selectShip = async (shipId) => {
    setSelectedShipId(shipId);
    setSelectedSlot(null);
    try {
      const data = await fittingAPI.getShipDetail(shipId);
      setShipDetail(data.ship);
      setModuleDetails(data.moduleDetails || {});
    } catch (err) {
      console.error('Failed to load ship detail:', err);
    }
  };

  const flash = (type, text) => { setMessage({ type, text }); setTimeout(() => setMessage(null), 3000); };

  const handleBuyHull = async (hullTypeId) => {
    try {
      const result = await fittingAPI.buyHull(hullTypeId);
      if (result.success) {
        flash('success', `Purchased ${result.hull.name}!`);
        await loadData();
        selectShip(result.ship.id);
        if (hullTypeId === 'starter_scout') {
          await useGameStore.getState().completeQuest('tutorial_buy_starter_scout');
        }
      }
    } catch (err) {
      flash('error', err.message || 'Failed to buy hull');
    }
  };

  const handleLaunch = async () => {
    if (!selectedShipId || launching) return;
    setLaunching(true);
    try {
      await fittingAPI.setActiveShip(selectedShipId);
      await fetchShips(); // updates activeShipId in store so SystemView picks up the ship
      closeWindow('shipBuilder');
      openWindow('systemView');
      openWindow('navigation');
    } catch (err) {
      flash('error', err.message || 'Failed to launch ship');
    } finally {
      setLaunching(false);
    }
  };

  const handleBuyModule = async (moduleTypeId) => {
    try {
      const result = await fittingAPI.buyModule(moduleTypeId);
      if (result.success) {
        flash('success', `Bought ${result.module} for ${result.price} cr`);
      }
    } catch (err) {
      flash('error', err.message || 'Failed to buy module');
    }
  };

  const handleSlotDrop = async (slot, dragData) => {
    if (!selectedShipId || !dragData?.stack_id) return;

    // Check if module type matches slot
    const cargoItemId = dragData.stack_id;
    try {
      const result = await fittingAPI.fitModule(selectedShipId, slot.id, cargoItemId);
      if (result.success) {
        flash('success', `Fitted ${result.module} → ${slot.id}`);
        selectShip(selectedShipId);
        // All slots filled → complete the fitting quest
        if (result.all_slots_filled) {
          useGameStore.getState().completeQuest('tutorial_fit_modules');
        }
      }
    } catch (err) {
      flash('error', err.message || 'Failed to fit module');
    }
  };

  const handleSlotClick = async (slot) => {
    if (!selectedShipId) return;
    setSelectedSlot(slot);
  };

  const handleUnfitSlot = async (slot) => {
    if (!selectedShipId || !slot) return;
    if (moduleDetails[slot.id]) {
      try {
        const result = await fittingAPI.unfitModule(selectedShipId, slot.id);
        if (result.success) {
          flash('success', `Removed ${result.removed_module} → cargo`);
          selectShip(selectedShipId);
          setSelectedSlot(null);
        }
      } catch (err) {
        flash('error', err.message || 'Failed to unfit module');
      }
    }
  };

  const handleSlotHover = (slot, e) => {
    if (!slot) { hideTooltip(); return; }
    const mod = moduleDetails[slot.id] || null;
    showTooltip(<SlotInfo slot={slot} module={mod} />);
  };

  const hullType = shipDetail?.hull_type_id;
  const hullSlots = shipDetail?.hull_slots || [];

  // Compute scale: fit the ship in ~400px height
  let shipScale = 2;
  if (hullType && HULL_SHAPES[hullType]) {
    const maxH = 480;
    const naturalH = HULL_SHAPES[hullType].gridH * CELL * 2;
    if (naturalH > maxH) shipScale = maxH / (HULL_SHAPES[hullType].gridH * CELL);
  }

  return (
    <DraggableWindow
      windowId="shipBuilder"
      title="Ship Fitting"
      initialWidth={960}
      initialHeight={920}
      minWidth={750}
      minHeight={650}
    >
      <div className="h-full flex flex-col gap-2 text-cyan-100 relative">
        {/* Message overlay — doesn't push content */}
        {message && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
            <div className={`text-xs px-4 py-1.5 rounded-lg shadow-lg border ${message.type === 'success' ? 'bg-green-900/90 text-green-400 border-green-600/40' : 'bg-red-900/90 text-red-400 border-red-600/40'}`}>
              {message.text}
            </div>
          </div>
        )}

        <div className="flex-1 flex gap-3 min-h-0">
          {/* Left: Ship selector */}
          <div className="w-44 flex-shrink-0 overflow-y-auto pr-1">
            <ShipSelector ships={ships} selectedId={selectedShipId} onSelect={selectShip} hulls={hulls} onBuyHull={handleBuyHull} />
          </div>

          {/* Center: Ship canvas + slot info below */}
          <div className="flex-1 flex flex-col items-center overflow-auto"
            style={{ background: '#0c1018', borderRadius: 6, border: '1px solid #1e293b' }}
          >
            {hullType && HULL_SHAPES[hullType] ? (
              <>
                <div className="text-xs text-slate-400 mt-2 mb-1">
                  {shipDetail?.name || 'Ship'} — <span className="text-cyan-400">{shipDetail?.hull_name} {shipDetail?.hull_class}</span>
                </div>
                <ShipCanvas
                  hullId={hullType}
                  scale={shipScale}
                  showSlots={true}
                  slots={hullSlots}
                  modules={moduleDetails}
                  onSlotHover={handleSlotHover}
                  onSlotClick={handleSlotClick}
                  onSlotDrop={handleSlotDrop}
                />
                {/* Slot info bar — shows selected slot with unfit button */}
                {selectedSlot ? (() => {
                  const st = SLOT_TYPES[selectedSlot.type] || { color: '#888', name: selectedSlot.type };
                  const mod = moduleDetails[selectedSlot.id];
                  let avgQ = null, qColor = '#888';
                  if (mod?.quality) {
                    const q = mod.quality;
                    avgQ = Math.round((q.purity + q.stability + q.potency + q.density) / 4);
                    qColor = avgQ >= 80 ? '#aa44ff' : avgQ >= 60 ? '#4488ff' : avgQ >= 40 ? '#44cc44' : '#888888';
                  }
                  return (
                    <div className="w-full px-3 py-2 border-t" style={{ borderColor: st.color + '33', background: st.color + '08' }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: st.color }} />
                          <span className="text-[11px] font-medium" style={{ color: st.color }}>{st.name}</span>
                          {mod ? (
                            <span className="text-[11px] text-cyan-300">{mod.name}{mod.tier ? ` T${mod.tier}` : ''}{avgQ !== null ? <span className="ml-1.5" style={{color: qColor}}>Q{avgQ}</span> : ''}</span>
                          ) : (
                            <span className="text-[11px] text-slate-500">Empty — drag module from cargo</span>
                          )}
                        </div>
                        {mod && (
                          <button
                            onClick={() => handleUnfitSlot(selectedSlot)}
                            className="px-2.5 py-1 rounded text-[10px] font-medium bg-red-900/30 text-red-400 border border-red-700/40 hover:bg-red-900/50 hover:border-red-600/50 transition-colors flex-shrink-0 ml-2"
                          >
                            ✕ Unfit
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })() : (
                  <div className="w-full px-3 py-2 border-t border-slate-800/50">
                    <span className="text-[10px] text-slate-600">Click a slot to select it</span>
                  </div>
                )}
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-600 text-sm">
                {ships.length === 0 ? 'Buy a hull to get started' : 'Select a ship'}
              </div>
            )}
          </div>

          {/* Right: Stats */}
          <div className="w-44 flex-shrink-0 flex flex-col gap-2 overflow-y-auto">
            <StatsPanel ship={shipDetail} moduleDetails={moduleDetails} />

            {/* Slot legend */}
            <div className="mt-2">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Slot Types</div>
              {Object.entries(SLOT_TYPES).map(([key, st]) => (
                <div key={key} className="flex items-center gap-1.5 mb-0.5">
                  <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: st.color }} />
                  <span className="text-[10px] text-slate-400">{st.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-700/30 pt-2">
          <span className="text-[10px] text-slate-500">
            Drag modules from cargo onto slots • Click slot to select • Unfit to remove
          </span>
          {selectedShipId && (
            <button
              onClick={handleLaunch}
              disabled={launching}
              className="flex items-center gap-2 px-4 py-1.5 rounded bg-cyan-600/20 border border-cyan-500/40 text-cyan-300 text-xs font-medium hover:bg-cyan-600/30 hover:border-cyan-400/60 transition-all disabled:opacity-50"
            >
              🚀 {launching ? 'Launching...' : 'Launch Ship'}
            </button>
          )}
        </div>
      </div>
    </DraggableWindow>
  );
};

export default ShipBuilderWindow;
