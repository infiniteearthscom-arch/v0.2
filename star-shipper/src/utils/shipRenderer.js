// Ship Renderer Utility
// Two render modes:
//   'detail' — full procedural art for fleet window thumbnails (scale ~0.2-0.5)
//   'icon'   — clean silhouette for system view (renders at exact target pixel height)

const CELL = 20;
const rgb = (r,g,b) => `rgb(${r},${g},${b})`;
const rgba = (r,g,b,a) => `rgba(${r},${g},${b},${a})`;

class SRng {
  constructor(seed) { this.s = seed % 2147483647; if (this.s <= 0) this.s += 2147483646; }
  next() { this.s = (this.s * 16807) % 2147483647; return (this.s - 1) / 2147483646; }
  range(a, b) { return a + this.next() * (b - a); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  chance(p) { return this.next() < p; }
}

// ============================================
// HULL SHAPE DATA
// ============================================
export const HULL_SHAPES = {
  fighter: {
    gridW:5,gridH:9,
    shape:[[0,0,1,0,0],[0,0,1,0,0],[0,1,2,1,0],[0,1,2,1,0],[1,2,2,2,1],[1,2,2,2,1],[1,0,2,0,1],[0,0,1,0,0],[0,0,1,0,0]],
    bridgeRow:2,bridgeWidth:1,bridgeX:2,
    engines:[{x:2,w:1}],
    palette:{hull:[0x60,0x60,0x6a],armor:[0x48,0x48,0x55],accent:'#dd8833',engine:'#ff8833',viewport:'#ffcc88',stripe:'#dd8833',detail:[0x50,0x50,0x5a]},
    displaySize: 5,
  },
  scout: {
    gridW:7,gridH:18,
    shape:[[0,0,0,1,0,0,0],[0,0,0,1,0,0,0],[0,0,1,2,1,0,0],[0,0,1,2,1,0,0],[0,0,1,2,1,0,0],[0,1,2,2,2,1,0],[0,1,2,2,2,1,0],[0,1,2,2,2,1,0],[0,1,2,2,2,1,0],[0,1,2,2,2,1,0],[0,1,2,2,2,1,0],[0,1,2,2,2,1,0],[1,1,2,2,2,1,1],[1,0,1,2,1,0,1],[1,0,1,2,1,0,1],[1,0,0,2,0,0,1],[0,0,0,1,0,0,0],[0,0,0,1,0,0,0]],
    bridgeRow:3,bridgeWidth:1,bridgeX:3,
    engines:[{x:3,w:1}],
    palette:{hull:[0x58,0x68,0x78],armor:[0x40,0x50,0x60],accent:'#5599cc',engine:'#4488ff',viewport:'#88ccff',stripe:'#5599cc',detail:[0x4a,0x5a,0x6a]},
    displaySize: 7,
  },
  shuttle: {
    gridW:11,gridH:14,
    shape:[[0,0,0,0,1,1,1,0,0,0,0],[0,0,0,1,2,2,2,1,0,0,0],[0,0,1,2,2,2,2,2,1,0,0],[0,1,2,2,2,2,2,2,2,1,0],[0,1,2,2,2,2,2,2,2,1,0],[1,1,2,2,2,2,2,2,2,1,1],[1,2,2,2,2,2,2,2,2,2,1],[1,2,2,2,2,2,2,2,2,2,1],[1,1,2,2,2,2,2,2,2,1,1],[0,1,2,2,2,2,2,2,2,1,0],[0,1,2,2,2,2,2,2,2,1,0],[0,0,1,2,2,2,2,2,1,0,0],[0,0,0,1,2,2,2,1,0,0,0],[0,0,0,0,1,1,1,0,0,0,0]],
    bridgeRow:1,bridgeWidth:3,bridgeX:4,
    engines:[{x:4,w:3}],
    palette:{hull:[0x58,0x68,0x52],armor:[0x48,0x58,0x42],accent:'#7faa55',engine:'#44ff88',viewport:'#aaffcc',stripe:'#7faa55',detail:[0x4a,0x5a,0x44]},
    displaySize: 8,
  },
  freighter: {
    gridW:13,gridH:22,
    shape:[[0,0,0,0,0,0,1,0,0,0,0,0,0],[0,0,0,0,0,1,2,1,0,0,0,0,0],[0,0,0,0,1,2,2,2,1,0,0,0,0],[0,0,0,1,2,2,2,2,2,1,0,0,0],[0,0,1,2,2,2,2,2,2,2,1,0,0],[0,1,2,2,2,2,2,2,2,2,2,1,0],[1,2,2,2,2,2,2,2,2,2,2,2,1],[1,2,2,2,2,2,2,2,2,2,2,2,1],[1,2,2,2,2,2,2,2,2,2,2,2,1],[1,2,2,2,2,2,2,2,2,2,2,2,1],[1,2,2,2,2,2,2,2,2,2,2,2,1],[1,2,2,2,2,2,2,2,2,2,2,2,1],[1,2,2,2,2,2,2,2,2,2,2,2,1],[1,2,2,2,2,2,2,2,2,2,2,2,1],[1,2,2,2,2,2,2,2,2,2,2,2,1],[1,2,2,2,2,2,2,2,2,2,2,2,1],[1,2,2,2,2,2,2,2,2,2,2,2,1],[1,2,2,2,2,2,2,2,2,2,2,2,1],[1,1,2,2,2,2,2,2,2,2,2,1,1],[0,1,1,2,2,2,2,2,2,2,1,1,0],[0,0,1,1,2,2,2,2,2,1,1,0,0],[0,0,0,1,1,1,1,1,1,1,0,0,0]],
    bridgeRow:2,bridgeWidth:3,bridgeX:5,
    engines:[{x:3,w:2},{x:5,w:3},{x:8,w:2}],
    palette:{hull:[0x6a,0x5c,0x4a],armor:[0x58,0x4a,0x38],accent:'#cc9944',engine:'#ffaa44',viewport:'#ffeebb',stripe:'#cc9944',detail:[0x5a,0x4c,0x3a]},
    displaySize: 10,
  },
  frigate: {
    gridW:17,gridH:11,
    shape:[[0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,1,2,1,0,0,0,0,0,0,0],[0,0,0,0,0,0,1,2,2,2,1,0,0,0,0,0,0],[0,0,0,0,0,1,2,2,2,2,2,1,0,0,0,0,0],[0,0,0,0,1,2,2,2,2,2,2,2,1,0,0,0,0],[0,0,0,1,2,2,2,2,2,2,2,2,2,1,0,0,0],[0,0,1,2,2,2,1,2,2,2,1,2,2,2,1,0,0],[0,1,2,2,2,1,0,1,2,1,0,1,2,2,2,1,0],[1,1,2,2,1,0,0,1,2,1,0,0,1,2,2,1,1],[0,0,1,1,0,0,0,0,2,0,0,0,0,1,1,0,0],[0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0]],
    bridgeRow:1,bridgeWidth:3,bridgeX:7,
    engines:[{x:2,w:2},{x:7,w:3},{x:13,w:2}],
    palette:{hull:[0x3a,0x3a,0x48],armor:[0x2a,0x2a,0x38],accent:'#885555',engine:'#ff4444',viewport:'#ffaaaa',stripe:'#664444',detail:[0x30,0x30,0x40]},
    displaySize: 10,
  },
  capital: {
    gridW:19,gridH:32,
    shape:[[0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,1,2,1,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,1,2,2,2,1,0,0,0,0,0,0,0],[0,0,0,0,0,0,1,2,2,2,2,2,1,0,0,0,0,0,0],[0,0,0,0,0,1,2,2,2,2,2,2,2,1,0,0,0,0,0],[0,0,0,0,1,2,2,2,2,2,2,2,2,2,1,0,0,0,0],[0,0,0,1,2,2,2,2,2,2,2,2,2,2,2,1,0,0,0],[0,0,1,2,2,2,2,2,2,2,2,2,2,2,2,2,1,0,0],[0,1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,0],[1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],[1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],[1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],[1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],[1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],[1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],[1,2,2,2,1,1,2,2,2,2,2,2,2,1,1,2,2,2,1],[1,2,2,2,1,0,1,2,2,2,2,2,1,0,1,2,2,2,1],[1,2,2,2,1,0,1,2,2,2,2,2,1,0,1,2,2,2,1],[1,2,2,2,1,0,1,2,2,2,2,2,1,0,1,2,2,2,1],[1,2,2,2,1,0,1,2,2,2,2,2,1,0,1,2,2,2,1],[1,2,2,2,1,1,2,2,2,2,2,2,2,1,1,2,2,2,1],[1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],[1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],[1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],[1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],[1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],[1,1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,1],[1,1,2,2,2,1,2,2,2,2,2,2,2,1,2,2,2,1,1],[0,1,1,2,1,0,1,2,2,2,2,2,1,0,1,2,1,1,0],[0,0,1,1,0,0,0,1,2,2,2,1,0,0,0,1,1,0,0],[0,0,0,0,0,0,0,1,2,2,2,1,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0]],
    bridgeRow:3,bridgeWidth:5,bridgeX:7,
    engines:[{x:2,w:2},{x:6,w:2},{x:8,w:3},{x:11,w:2},{x:15,w:2}],
    palette:{hull:[0x50,0x52,0x5a],armor:[0x3a,0x3c,0x44],accent:'#7788aa',engine:'#6699ff',viewport:'#aaccff',stripe:'#667799',detail:[0x42,0x44,0x4c]},
    displaySize: 14,
  },
};

// ============================================
// FACTION DATA
// ============================================
export const FACTIONS = {
  player: { name: 'Independent', color: '#22ddee', hostile: false },
  pirate: { name: 'Void Reavers', color: '#ff4444', hostile: true, tagColor: '#ff4444', tagBg: '#ff444422' },
};

// ============================================
// PIRATE HULL SHAPES (Void Reavers faction)
// Aggressive, angular designs with red/crimson palette
// ============================================
export const PIRATE_HULLS = {
  pirate_interceptor: {
    gridW:7,gridH:11,
    shape:[
      [0,0,0,1,0,0,0],
      [0,0,1,2,1,0,0],
      [0,1,2,2,2,1,0],
      [1,2,2,2,2,2,1],
      [1,0,2,2,2,0,1],
      [1,0,2,2,2,0,1],
      [1,1,2,2,2,1,1],
      [0,1,2,2,2,1,0],
      [0,1,0,2,0,1,0],
      [0,1,0,1,0,1,0],
      [0,0,0,1,0,0,0],
    ],
    bridgeRow:1,bridgeWidth:1,bridgeX:3,
    engines:[{x:1,w:1},{x:3,w:1},{x:5,w:1}],
    palette:{hull:[0x5a,0x28,0x28],armor:[0x44,0x18,0x18],accent:'#ff4444',engine:'#ff2200',viewport:'#ff8866',stripe:'#cc2222',detail:[0x4a,0x20,0x20]},
    displaySize: 6,
    stats: { maxHull: 40, maxShield: 15, speed: 160, damage: 8, fireRate: 0.8, range: 120 },
  },
  pirate_marauder: {
    gridW:9,gridH:14,
    shape:[
      [0,0,0,0,1,0,0,0,0],
      [0,0,0,1,2,1,0,0,0],
      [0,0,1,2,2,2,1,0,0],
      [0,1,2,2,2,2,2,1,0],
      [1,2,2,2,2,2,2,2,1],
      [1,2,2,2,2,2,2,2,1],
      [1,0,2,2,2,2,2,0,1],
      [1,0,2,2,2,2,2,0,1],
      [1,1,2,2,2,2,2,1,1],
      [0,1,2,2,2,2,2,1,0],
      [0,1,2,2,2,2,2,1,0],
      [0,1,0,2,2,2,0,1,0],
      [0,0,0,1,2,1,0,0,0],
      [0,0,0,0,1,0,0,0,0],
    ],
    bridgeRow:2,bridgeWidth:3,bridgeX:3,
    engines:[{x:1,w:1},{x:3,w:3},{x:7,w:1}],
    palette:{hull:[0x4a,0x22,0x30],armor:[0x38,0x14,0x22],accent:'#dd3355',engine:'#ff3300',viewport:'#ff7788',stripe:'#aa2244',detail:[0x3c,0x1a,0x28]},
    displaySize: 8,
    stats: { maxHull: 80, maxShield: 30, speed: 120, damage: 12, fireRate: 1.2, range: 140 },
  },
  pirate_destroyer: {
    gridW:11,gridH:18,
    shape:[
      [0,0,0,0,0,1,0,0,0,0,0],
      [0,0,0,0,1,2,1,0,0,0,0],
      [0,0,0,1,2,2,2,1,0,0,0],
      [0,0,1,2,2,2,2,2,1,0,0],
      [0,1,2,2,2,2,2,2,2,1,0],
      [1,2,2,2,2,2,2,2,2,2,1],
      [1,2,2,2,2,2,2,2,2,2,1],
      [1,2,2,2,2,2,2,2,2,2,1],
      [1,1,2,2,2,2,2,2,2,1,1],
      [1,0,2,2,2,2,2,2,2,0,1],
      [1,0,2,2,2,2,2,2,2,0,1],
      [1,1,2,2,2,2,2,2,2,1,1],
      [1,2,2,2,2,2,2,2,2,2,1],
      [1,2,2,2,2,2,2,2,2,2,1],
      [0,1,2,2,2,2,2,2,2,1,0],
      [0,1,0,1,2,2,2,1,0,1,0],
      [0,0,0,0,1,2,1,0,0,0,0],
      [0,0,0,0,0,1,0,0,0,0,0],
    ],
    bridgeRow:2,bridgeWidth:3,bridgeX:4,
    engines:[{x:1,w:2},{x:4,w:3},{x:8,w:2}],
    palette:{hull:[0x3a,0x1a,0x2a],armor:[0x28,0x0e,0x1e],accent:'#cc2244',engine:'#ff4400',viewport:'#ff6677',stripe:'#992233',detail:[0x30,0x14,0x24]},
    displaySize: 11,
    stats: { maxHull: 150, maxShield: 60, speed: 80, damage: 20, fireRate: 1.8, range: 180 },
  },
};

// ============================================
// DETAIL RENDERER (for fleet window thumbnails)
// ============================================
const renderShipDetail = (hull, scale) => {
  const C = CELL * scale;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(hull.gridW * C + 4);
  canvas.height = Math.ceil(hull.gridH * C + C * 2.5 + 4);
  const ctx = canvas.getContext('2d');
  const pal = hull.palette;
  const [hr,hg,hb] = pal.hull;
  const [ar,ag,ab] = pal.armor;
  const rng = new SRng(hull.gridW*1000 + hull.gridH*100);

  ctx.translate(2, 2);

  for(let y=0;y<hull.gridH;y++) for(let x=0;x<hull.gridW;x++){
    const v=hull.shape[y]?.[x]; if(!v) continue;
    const sh=rng.range(-6,6);
    ctx.fillStyle=v===1?rgb(ar+sh,ag+sh,ab+sh):rgb(hr+sh,hg+sh,hb+sh);
    ctx.fillRect(x*C,y*C,C,C);
  }

  ctx.lineWidth=0.4*scale;
  for(let y=0;y<hull.gridH;y++) for(let x=0;x<hull.gridW;x++){
    if(!hull.shape[y]?.[x]) continue;
    if(hull.shape[y+1]?.[x]&&rng.chance(0.5)){ctx.strokeStyle=rgba(0,0,0,0.2);ctx.beginPath();ctx.moveTo(x*C+1,y*C+C);ctx.lineTo(x*C+C-1,y*C+C);ctx.stroke();}
    if(hull.shape[y]?.[x+1]&&rng.chance(0.4)){ctx.strokeStyle=rgba(0,0,0,0.18);ctx.beginPath();ctx.moveTo(x*C+C,y*C+1);ctx.lineTo(x*C+C,y*C+C-1);ctx.stroke();}
  }

  for(let y=0;y<hull.gridH;y++) for(let x=0;x<hull.gridW;x++){
    const v=hull.shape[y]?.[x]; if(!v) continue;
    const px=x*C,py=y*C;
    if(!hull.shape[y-1]?.[x]){ctx.fillStyle='rgba(255,255,255,0.15)';ctx.fillRect(px,py,C,2*scale);}
    if(!hull.shape[y+1]?.[x]){ctx.fillStyle='rgba(0,0,0,0.2)';ctx.fillRect(px,py+C-2*scale,C,2*scale);}
  }

  const cx=Math.floor(hull.gridW/2);
  for(let y=1;y<hull.gridH-1;y++) if(hull.shape[y]?.[cx]===2){
    ctx.fillStyle=pal.stripe+'30';
    ctx.fillRect(cx*C+C/2-1*scale,y*C,2*scale,C);
  }

  const bx=hull.bridgeX*C,by=hull.bridgeRow*C,bw=hull.bridgeWidth*C,bh=C*1.5;
  const rx2=bx+C*0.3,ry2=by+C*0.2,rw2=bw-C*0.6,rh2=bh-C*0.4;
  ctx.fillStyle=pal.viewport+'88';
  ctx.fillRect(rx2,ry2,rw2,rh2);

  for(const eng of hull.engines){
    const ecx=(eng.x+eng.w/2)*C,ey=hull.gridH*C;
    const nw=eng.w*C*0.6;
    ctx.fillStyle=pal.engine+'aa';
    ctx.beginPath();ctx.ellipse(ecx,ey+C*0.5,nw*0.35,C*1.2,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='rgba(255,255,255,0.5)';
    ctx.beginPath();ctx.ellipse(ecx,ey+C*0.2,nw*0.12,C*0.3,0,0,Math.PI*2);ctx.fill();
  }

  return canvas;
};

// ============================================
// ICON RENDERER (for system view — tiny clean silhouette with engine glow)
// ============================================
const renderShipIcon = (hull) => {
  const targetH = hull.displaySize || 10;
  const pxPerCell = targetH / hull.gridH;
  const imgW = Math.ceil(hull.gridW * pxPerCell);
  const imgH = Math.ceil(hull.gridH * pxPerCell);

  const pad = 4;
  const canvas = document.createElement('canvas');
  canvas.width = imgW + pad * 2;
  canvas.height = imgH + pad * 2 + 6;
  const ctx = canvas.getContext('2d');
  const pal = hull.palette;
  const [hr,hg,hb] = pal.hull;
  const [ar,ag,ab] = pal.armor;

  ctx.translate(pad, pad);

  // Solid silhouette — bright enough to see at small size
  for(let y=0;y<hull.gridH;y++) for(let x=0;x<hull.gridW;x++){
    const v=hull.shape[y]?.[x]; if(!v) continue;
    if(v === 1) ctx.fillStyle = rgb(ar+25,ag+25,ab+25);
    else ctx.fillStyle = rgb(hr+35,hg+35,hb+35);
    ctx.fillRect(
      Math.floor(x * pxPerCell),
      Math.floor(y * pxPerCell),
      Math.ceil(pxPerCell) + 1,
      Math.ceil(pxPerCell) + 1
    );
  }

  // Bright nose highlight
  for(let y=0;y<Math.min(3,hull.gridH);y++) for(let x=0;x<hull.gridW;x++){
    const v=hull.shape[y]?.[x]; if(!v) continue;
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(Math.floor(x*pxPerCell),Math.floor(y*pxPerCell),Math.ceil(pxPerCell)+1,Math.ceil(pxPerCell)+1);
  }

  // Engine glow
  const engineY = imgH;
  for(const eng of hull.engines){
    const ecx = (eng.x + eng.w/2) * pxPerCell;
    const glowR = Math.max(1.5, eng.w * pxPerCell * 0.5);
    ctx.fillStyle = pal.engine + '55';
    ctx.beginPath();ctx.arc(ecx, engineY + 2, glowR * 2, 0, Math.PI*2);ctx.fill();
    ctx.fillStyle = pal.engine + 'cc';
    ctx.beginPath();ctx.arc(ecx, engineY + 2, glowR * 0.7, 0, Math.PI*2);ctx.fill();
  }

  return canvas;
};

// ============================================
// CACHE
// ============================================
const shipImageCache = new Map();

/** Lookup hull from either player or pirate hulls */
const lookupHull = (hullId) => HULL_SHAPES[hullId] || PIRATE_HULLS[hullId] || null;

/** Fleet window thumbnails */
export const getShipImage = (hullId, scale = 0.3) => {
  const hull = lookupHull(hullId);
  if (!hull) return null;
  const cacheKey = `detail_${hullId}_${scale}`;
  if (shipImageCache.has(cacheKey)) return shipImageCache.get(cacheKey);
  const canvas = renderShipDetail(hull, scale);
  const result = { dataUrl: canvas.toDataURL(), width: canvas.width, height: canvas.height };
  shipImageCache.set(cacheKey, result);
  return result;
};

/** System view tiny icons */
export const getShipIcon = (hullId) => {
  const hull = lookupHull(hullId);
  if (!hull) return null;
  const cacheKey = `icon_${hullId}`;
  if (shipImageCache.has(cacheKey)) return shipImageCache.get(cacheKey);
  const canvas = renderShipIcon(hull);
  const result = { dataUrl: canvas.toDataURL(), width: canvas.width, height: canvas.height };
  shipImageCache.set(cacheKey, result);
  return result;
};

export const clearShipImageCache = () => { shipImageCache.clear(); };

// ============================================
// FLEET FORMATION — Flying V
// Leader at front (the tip), wingmen trail behind and to the sides.
// In ship-local space: y+ = "behind" (opposite travel direction), x = lateral
// ============================================
export const FORMATION_OFFSETS = [
  { x: 0, y: 0 },        // Leader — tip of the V
  { x: -25, y: 30 },      // Left wing
  { x: 25, y: 30 },       // Right wing
];

export const MAX_FLEET_SIZE = 3;
