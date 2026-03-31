import { useState, useEffect, useRef } from "react";

const F = "'Rajdhani', sans-serif";
const FM = "'Share Tech Mono', monospace";

const BLUE = { pri: "#3b82f6", light: "#60a5fa", dark: "#1d4ed8", dim: "#1e3a5f", bg: "#0c1a33" };
const GOLD = { pri: "#f59e0b", light: "#fbbf24", dark: "#d97706", dim: "#5c3d0e" };
const EDGE = "#1a3050";

const BODIES = [
  { id: "mercury", name: "Mercury", type: "planet", ptype: "Rocky", orb: 11, size: 1.8, color: "#aaaaaa", off: 2.1 },
  { id: "venus", name: "Venus", type: "planet", ptype: "Desert", orb: 16, size: 3, color: "#ddaa66", off: 4.7 },
  { id: "earth", name: "Earth", type: "planet", ptype: "Terran", orb: 22, size: 3.5, color: "#4488aa", off: 1.3, atmo: true },
  { id: "luna_station", name: "Luna Station", type: "station", orb: 4, size: 1.2, color: "#66ccff", off: 0.5, parent: "earth" },
  { id: "mars", name: "Mars", type: "planet", ptype: "Desert", orb: 29, size: 2.5, color: "#cc6644", off: 5.9 },
  { id: "jupiter", name: "Jupiter", type: "planet", ptype: "Gas Giant", orb: 48, size: 9, color: "#ddaa77", off: 3.2 },
  { id: "saturn", name: "Saturn", type: "planet", ptype: "Gas Giant", orb: 58, size: 7.5, color: "#ddcc88", off: 0.8, rings: true },
];

const MODULES = [
  { slot: "ENG", type: "engine", name: "Basic Thruster", color: "#ff6622", q: 50 },
  { slot: "RCT", type: "reactor", name: "Fusion Core", color: "#00ddff", q: 50 },
  { slot: "CRG", type: "cargo", name: "Cargo Pod", color: "#ddaa22", q: 50 },
  { slot: "WPN", type: "weapon", name: "Pulse Laser", color: "#ff2244", q: 50 },
  { slot: "UTL", type: "utility", name: "Sensor Suite", color: "#22ccaa", q: 50 },
  { slot: "UTL", type: "utility", name: "Nav Computer", color: "#22ccaa", q: 50 },
];

const HULL_GRID = [
  [0,0,0,1,0,0,0],[0,0,0,1,0,0,0],[0,0,1,2,1,0,0],[0,0,1,2,1,0,0],
  [0,0,1,2,1,0,0],[0,1,2,2,2,1,0],[0,1,2,2,2,1,0],[0,1,2,2,2,1,0],
  [0,1,2,2,2,1,0],[0,1,2,2,2,1,0],[0,1,2,2,2,1,0],[0,1,2,2,2,1,0],
  [1,1,2,2,2,1,1],[1,0,1,2,1,0,1],[1,0,1,2,1,0,1],[1,0,0,2,0,0,1],
  [0,0,0,1,0,0,0],[0,0,0,1,0,0,0],
];

const SLOTS = [
  { id: "eng1", type: "engine", x: 2, y: 14, w: 3, h: 2, color: "#ff6622", mod: "Basic Thruster" },
  { id: "rct1", type: "reactor", x: 2, y: 11, w: 3, h: 2, color: "#00ddff", mod: "Fusion Core" },
  { id: "crg1", type: "cargo", x: 1, y: 7, w: 5, h: 3, color: "#ddaa22", mod: "Cargo Pod" },
  { id: "utl1", type: "utility", x: 1, y: 5, w: 2, h: 2, color: "#22ccaa", mod: "Sensor Suite" },
  { id: "utl2", type: "utility", x: 4, y: 5, w: 2, h: 2, color: "#22ccaa", mod: "Nav Computer" },
  { id: "wpn1", type: "weapon", x: 2, y: 3, w: 3, h: 2, color: "#ff2244", mod: "Pulse Laser" },
];

const diagAll = (c = 8) => `polygon(${c}px 0, calc(100% - ${c}px) 0, 100% ${c}px, 100% calc(100% - ${c}px), calc(100% - ${c}px) 100%, ${c}px 100%, 0 calc(100% - ${c}px), 0 ${c}px)`;

const DiagPanel = ({ children, style = {}, accent = BLUE.dim, border = EDGE, cut = 8, ...props }) => (
  <div style={{ position: "relative", ...style }} {...props}>
    <div style={{ position: "absolute", inset: -1, clipPath: diagAll(cut), background: border, zIndex: 0 }} />
    <div style={{ position: "relative", clipPath: diagAll(cut), background: style.background || "rgba(8,14,28,0.93)", zIndex: 1, height: "100%", display: "flex", flexDirection: "column" }}>
      {children}
    </div>
  </div>
);

const SH = ({ t, accent = BLUE.light, right, icon }) => (
  <div style={{ display: "flex", alignItems: "center", marginBottom: 6, borderLeft: `2px solid ${accent}`, background: `linear-gradient(90deg, ${accent}20, transparent)`, padding: "5px 10px" }}>
    {icon && <span style={{ marginRight: 6, fontSize: 12 }}>{icon}</span>}
    <span style={{ fontSize: 11, fontWeight: 800, color: accent, letterSpacing: 1.5, fontFamily: F, textTransform: "uppercase", flex: 1 }}>{t}</span>
    {right && <span style={{ fontSize: 10, color: "#4a6080", fontFamily: FM }}>{right}</span>}
  </div>
);

const gw = (c, a = 0.25) => `0 0 10px ${c}${Math.round(a * 255).toString(16).padStart(2, "0")}`;

export default function App() {
  const [overlay, setOverlay] = useState(null);
  const [docked, setDocked] = useState(null);
  const [sel, setSel] = useState(null);
  const [subTab, setSubTab] = useState("scan");
  const [hovSlot, setHovSlot] = useState(null);
  const [showOutliner, setShowOutliner] = useState(true);
  const [t, setT] = useState(0);
  const af = useRef();
  useEffect(() => { const tick = () => { setT(p => p + 0.006); af.current = requestAnimationFrame(tick); }; af.current = requestAnimationFrame(tick); return () => cancelAnimationFrame(af.current); }, []);

  const bp = (b) => {
    if (b.parent) { const p = BODIES.find(x => x.id === b.parent); const pp = bp(p); const a = t * (2 / b.orb) + b.off; return { x: pp.x + Math.cos(a) * b.orb, y: pp.y + Math.sin(a) * b.orb }; }
    const a = t * (0.5 / b.orb) + b.off; return { x: 50 + Math.cos(a) * b.orb, y: 50 + Math.sin(a) * b.orb };
  };

  const cmdBtns = [
    { id: "fitting", icon: "🔧", label: "FITTING", c: "#ff6622" },
    { id: "fleet", icon: "🚀", label: "FLEET", c: BLUE.light },
    { id: "nav", icon: "🧭", label: "NAV", c: BLUE.light },
    { id: "cargo", icon: "📦", label: "CARGO", c: GOLD.pri },
    { id: "craft", icon: "🔨", label: "CRAFT", c: "#aa66ff" },
    { id: "missions", icon: "📋", label: "MISSIONS", c: "#22d3ee" },
    { id: "galaxy", icon: "🌌", label: "GALAXY", c: "#8844ff" },
    { id: "research", icon: "🔬", label: "RESEARCH", c: "#22c55e" },
  ];

  return (
    <div style={{ fontFamily: F, color: "#c8d6e5", position: "relative", width: "100%", height: 720, overflow: "hidden", background: "#030610", borderRadius: 4 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700;800&family=Share+Tech+Mono&display=swap');`}</style>

      {/* ═══ FULLSCREEN GAME VIEW ═══ */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} onClick={() => { if (!overlay) setSel(null); }}>
        <defs>
          <radialGradient id="sg"><stop offset="0%" stopColor="#fff8dd" /><stop offset="15%" stopColor="#ffdd44" stopOpacity="0.7" /><stop offset="40%" stopColor="#ffaa00" stopOpacity="0.08" /><stop offset="100%" stopColor="#000" stopOpacity="0" /></radialGradient>
          <radialGradient id="at"><stop offset="55%" stopColor="transparent" /><stop offset="100%" stopColor="#88ccff" stopOpacity="0.3" /></radialGradient>
          <filter id="gl"><feGaussianBlur stdDeviation="0.5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          <filter id="gl2"><feGaussianBlur stdDeviation="2.5" /></filter>
        </defs>
        {Array.from({ length: 300 }, (_, i) => { const a=((i*7919+1)%997)/997,b=((i*6271+3)%991)/991,c=((i*3571+7)%983)/983; return <circle key={i} cx={a*100} cy={b*100} r={c<0.05?0.3:c<0.15?0.15:0.07} fill={c<0.03?"#88aaff":c<0.08?"#ffeedd":"#ffffff"} opacity={0.08+c*0.5} />; })}
        <circle cx={78} cy={18} r={25} fill="#1a2a55" opacity="0.025" filter="url(#gl2)" />
        <circle cx={12} cy={78} r={20} fill="#551a2a" opacity="0.018" filter="url(#gl2)" />
        <circle cx={40} cy={85} r={15} fill="#2a551a" opacity="0.012" filter="url(#gl2)" />
        <circle cx={50} cy={50} r={18} fill="url(#sg)" />
        <circle cx={50} cy={50} r={5} fill="#ffeeaa" filter="url(#gl)" /><circle cx={50} cy={50} r={3.8} fill="#fff8dd" /><circle cx={50} cy={50} r={2.5} fill="#ffffff" opacity="0.8" />
        {BODIES.filter(b => !b.parent).map(b => <circle key={b.id+"o"} cx={50} cy={50} r={b.orb} fill="none" stroke="#aabbcc" strokeWidth="0.05" opacity="0.08" strokeDasharray="0.3,1.8" />)}
        {BODIES.map(b => { const p=bp(b), s=sel?.id===b.id||docked?.id===b.id; return (
          <g key={b.id} onClick={e=>{e.stopPropagation();setSel(b)}} style={{cursor:"pointer"}}>
            {s && <><circle cx={p.x} cy={p.y} r={b.size+2.5} fill="none" stroke={docked?.id===b.id?"#22c55e":BLUE.light} strokeWidth="0.25" strokeDasharray="1.2,0.8" /><circle cx={p.x} cy={p.y} r={b.size+4} fill={docked?.id===b.id?"#22c55e":BLUE.light} opacity="0.03" /></>}
            {b.rings && <ellipse cx={p.x} cy={p.y} rx={b.size*1.8} ry={b.size*0.35} fill="none" stroke={b.color} strokeWidth="0.8" opacity="0.18" transform={`rotate(-15 ${p.x} ${p.y})`} />}
            {b.atmo && <circle cx={p.x} cy={p.y} r={b.size+1} fill="url(#at)" />}
            <circle cx={p.x} cy={p.y} r={b.size} fill={b.color} />
            {b.size>5 && <circle cx={p.x-b.size*0.2} cy={p.y-b.size*0.15} r={b.size*0.35} fill="rgba(0,0,0,0.1)" />}
            {b.type==="station" && <><rect x={p.x-1.2} y={p.y-1.2} width={2.4} height={2.4} fill="none" stroke="#66ccff" strokeWidth="0.2" transform={`rotate(45 ${p.x} ${p.y})`} /><circle cx={p.x} cy={p.y} r={0.5} fill="#66ccff" filter="url(#gl)" /></>}
            <text x={p.x} y={p.y+b.size+2.6} textAnchor="middle" fill="#6a7a8a" fontSize="1.8" fontFamily={F} fontWeight="600">{b.name}</text>
          </g>
        );})}
        <g transform={`translate(${docked?bp(docked).x+4:55},${docked?bp(docked).y-2:56})`}>
          <polygon points="0,-2.2 1.5,1.8 0,0.8 -1.5,1.8" fill={BLUE.light} filter="url(#gl)" />
          <circle cy={2} r={0.5} fill={BLUE.light} opacity={0.3+Math.sin(t*12)*0.25} />
        </g>
      </svg>

      {/* ═══ TOP RESOURCE BAR — Stellaris-style ═══ */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 36, background: "linear-gradient(180deg, rgba(8,16,32,0.97), rgba(6,12,24,0.92))", borderBottom: `1px solid ${EDGE}`, display: "flex", alignItems: "center", padding: "0 10px", zIndex: 10 }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginRight: 14, padding: "3px 14px 3px 8px", background: `linear-gradient(135deg, ${BLUE.pri}30, transparent)`, borderRight: `1px solid ${EDGE}`, height: "100%" }}>
          <div style={{ width: 22, height: 22, background: `linear-gradient(135deg, ${BLUE.pri}, ${BLUE.dark})`, clipPath: diagAll(4), display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 11, color: "#fff", fontWeight: 900 }}>★</span>
          </div>
          <span style={{ fontSize: 12, fontWeight: 800, color: BLUE.light, letterSpacing: 2 }}>STAR SHIPPER</span>
        </div>
        {/* Resources — Stellaris-style icon+number pairs */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, flex: 1, fontSize: 10, fontFamily: FM }}>
          {[
            { icon: "⬡", val: "1,450", label: "Credits", c: GOLD.light },
            { icon: "⛏", val: "45", label: "Iron", c: "#8B4513" },
            { icon: "⚡", val: "22", label: "Copper", c: "#B87333" },
            { icon: "💎", val: "0", label: "Crystite", c: "#00cccc" },
            { icon: "⚛", val: "0", label: "Uranium", c: "#39FF14" },
            { icon: "💨", val: "8", label: "Hydrogen", c: "#87CEEB" },
          ].map((r, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 3, padding: "0 8px", borderRight: `1px solid ${EDGE}`, height: 24 }} title={r.label}>
              <span style={{ fontSize: 11, filter: `drop-shadow(0 0 3px ${r.c}44)` }}>{r.icon}</span>
              <span style={{ color: parseInt(r.val.replace(/,/g, '')) > 0 ? r.c : "#3a4a5a", fontWeight: 700 }}>{r.val}</span>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 3, padding: "0 8px", borderRight: `1px solid ${EDGE}`, height: 24 }} title="Fleet">
            <span style={{ fontSize: 11 }}>🚀</span>
            <span style={{ color: BLUE.light, fontWeight: 700 }}>1</span>
            <span style={{ color: "#3a4a5a" }}>/8</span>
          </div>
        </div>
        {/* Right: ship + hull/shield */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 10, fontFamily: FM }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ color: "#22c55e", fontSize: 8 }}>■</span>
            <div style={{ width: 60, height: 5, background: "#0a1528", borderRadius: 2, border: `1px solid ${EDGE}`, overflow: "hidden" }}>
              <div style={{ width: "100%", height: "100%", background: "linear-gradient(90deg, #166534, #22c55e)", borderRadius: 1 }} />
            </div>
            <span style={{ color: "#22c55e", fontWeight: 700, fontSize: 9 }}>200</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ color: "#818cf8", fontSize: 8 }}>◆</span>
            <div style={{ width: 40, height: 5, background: "#0a1528", borderRadius: 2, border: `1px solid ${EDGE}` }} />
            <span style={{ color: "#3a4a5a", fontSize: 9 }}>—</span>
          </div>
          <div style={{ width: 1, height: 20, background: EDGE }} />
          <div style={{ padding: "2px 10px", background: `linear-gradient(90deg, ${BLUE.bg}, transparent)`, borderLeft: `2px solid ${BLUE.dim}` }}>
            <div style={{ fontSize: 10, color: "#c8d6e5", fontWeight: 700 }}>ISS PIONEER</div>
            <div style={{ fontSize: 8, color: BLUE.dim, fontFamily: FM }}>STARTER SCOUT</div>
          </div>
        </div>
      </div>

      {/* ═══ RIGHT OUTLINER (toggleable) ═══ */}
      {showOutliner && (
        <DiagPanel style={{ position: "absolute", top: 48, right: 8, width: 210, zIndex: 10, maxHeight: "calc(100% - 110px)" }} border={EDGE} cut={6}>
          <div style={{ background: `linear-gradient(90deg, ${BLUE.pri}25, transparent)`, padding: "6px 10px", borderBottom: `1px solid ${EDGE}`, display: "flex", alignItems: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: BLUE.light, letterSpacing: 2, flex: 1 }}>OUTLINER</span>
            <button onClick={() => setShowOutliner(false)} style={{ background: "none", border: "none", color: "#3a5a6a", cursor: "pointer", fontSize: 12, fontFamily: F }}>✕</button>
          </div>
          <div style={{ padding: "6px 8px", overflow: "auto", flex: 1 }}>
            <SH t="Fleet" accent={BLUE.light} right="1" icon="🚀" />
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", background: `linear-gradient(90deg, ${BLUE.pri}0a, transparent)`, borderLeft: `2px solid ${BLUE.pri}44`, marginBottom: 8, marginLeft: 4 }}>
              <div style={{ width: 0, height: 0, borderLeft: `5px solid ${BLUE.light}`, borderTop: "3px solid transparent", borderBottom: "3px solid transparent" }} />
              <div><div style={{ fontSize: 11, color: "#e2e8f0", fontWeight: 700 }}>ISS Pioneer</div><div style={{ fontSize: 9, color: "#3a5a6a", fontFamily: FM }}>Starter Scout</div></div>
            </div>
            <SH t="System" accent={GOLD.pri} right={`${BODIES.length}`} icon="◎" />
            {BODIES.map(b => (
              <div key={b.id} onClick={() => setSel(b)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 8px 3px 12px", cursor: "pointer", background: sel?.id===b.id ? `${BLUE.pri}0a` : "transparent", borderLeft: sel?.id===b.id ? `2px solid ${BLUE.pri}44` : "2px solid transparent", marginBottom: 1 }}>
                <div style={{ width: 6, height: 6, borderRadius: b.type==="station" ? 1 : 3, background: b.color, boxShadow: gw(b.color, 0.3) }} />
                <span style={{ fontSize: 10, color: "#a0b0c0", flex: 1, fontWeight: 500 }}>{b.name}</span>
                <span style={{ fontSize: 8, color: "#2a3a4a", fontFamily: FM }}>{b.ptype || "Station"}</span>
              </div>
            ))}
          </div>
        </DiagPanel>
      )}

      {/* ═══ BOTTOM COMMAND BAR — Homeworld-style ═══ */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 56, background: "linear-gradient(0deg, rgba(8,16,32,0.97), rgba(6,12,24,0.9))", borderTop: `1px solid ${EDGE}`, display: "flex", alignItems: "stretch", zIndex: 10 }}>
        {/* Command buttons */}
        <div style={{ display: "flex", flex: 1 }}>
          {cmdBtns.map((btn, i) => {
            const on = overlay === btn.id;
            return (
              <button key={btn.id} onClick={() => setOverlay(on ? null : btn.id)} style={{
                flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1,
                background: on ? `linear-gradient(0deg, ${btn.c}20, transparent)` : "transparent",
                borderTop: on ? `2px solid ${btn.c}` : "2px solid transparent",
                borderBottom: "none", borderLeft: "none",
                borderRight: i < cmdBtns.length - 1 ? `1px solid ${EDGE}` : "none",
                color: on ? btn.c : "#3a5a6a", cursor: "pointer", fontFamily: F, transition: "all 0.15s",
                textShadow: on ? gw(btn.c, 0.3) : "none",
              }}>
                <span style={{ fontSize: 17 }}>{btn.icon}</span>
                <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: 1.5 }}>{btn.label}</span>
              </button>
            );
          })}
        </div>
        {/* Center divider */}
        <div style={{ width: 1, background: EDGE }} />
        {/* Speed controls + system name */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 14px", minWidth: 260 }}>
          {["⏸", "1×", "2×", "3×"].map((l, i) => (
            <button key={i} style={{
              background: i === 1 ? `linear-gradient(180deg, ${BLUE.pri}25, ${BLUE.pri}08)` : "transparent",
              border: `1px solid ${i === 1 ? BLUE.dim : EDGE}`, color: i === 1 ? BLUE.light : "#3a4a5a",
              padding: "3px 8px", fontSize: 10, cursor: "pointer", fontFamily: FM, borderRadius: 2,
            }}>{l}</button>
          ))}
          <div style={{ width: 1, height: 24, background: EDGE }} />
          <div style={{ background: `linear-gradient(90deg, ${GOLD.pri}12, transparent)`, padding: "3px 14px", borderLeft: `2px solid ${GOLD.dim}` }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: "#e2e8f0", letterSpacing: 1 }}>Sol System</span>
          </div>
        </div>
        {/* Status */}
        <div style={{ width: 1, background: EDGE }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "0 14px", minWidth: 120 }}>
          {docked ? (
            <span style={{ color: "#22c55e", fontSize: 11, fontWeight: 700, textShadow: gw("#22c55e") }}>● DOCKED</span>
          ) : (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 8, color: "#3a4a5a", letterSpacing: 1 }}>SPEED</div>
              <div style={{ fontSize: 14, color: BLUE.light, fontWeight: 800, fontFamily: FM }}>142</div>
            </div>
          )}
        </div>
        {/* Outliner toggle */}
        <div style={{ width: 1, background: EDGE }} />
        <button onClick={() => setShowOutliner(!showOutliner)} style={{
          display: "flex", alignItems: "center", justifyContent: "center", padding: "0 12px",
          background: showOutliner ? `${BLUE.pri}10` : "transparent", border: "none",
          borderTop: showOutliner ? `2px solid ${BLUE.dim}` : "2px solid transparent",
          color: showOutliner ? BLUE.light : "#3a4a5a", cursor: "pointer", fontSize: 12,
        }} title="Toggle Outliner">☰</button>
      </div>

      {/* ═══ BODY POPUP ═══ */}
      {sel && !docked && !overlay && (() => { const p = bp(sel); return (
        <div style={{ position: "absolute", left: `${p.x}%`, top: `${p.y}%`, transform: "translate(20px, -50%)", zIndex: 20 }}>
          <DiagPanel style={{ minWidth: 220 }} border={sel?.id === sel?.id ? `${BLUE.dim}` : EDGE} cut={8}>
            <div style={{ background: `linear-gradient(135deg, ${sel.color}30, transparent)`, padding: "10px 14px", borderBottom: `1px solid ${EDGE}`, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 26, height: 26, borderRadius: sel.type==="station"?4:13, background: `radial-gradient(circle at 35% 35%, ${sel.color}, ${sel.color}88)`, boxShadow: gw(sel.color, 0.3) }} />
              <div><div style={{ fontSize: 14, fontWeight: 800, color: "#e2e8f0" }}>{sel.name}</div><div style={{ fontSize: 9, color: "#4a6080", fontFamily: FM }}>{sel.ptype || sel.type}</div></div>
            </div>
            <div style={{ padding: "10px 14px" }}>
              <div style={{ display: "flex", gap: 12, fontSize: 10, fontFamily: FM, color: "#3a5a6a", marginBottom: 8 }}>
                <span>DIST <span style={{ color: "#c8d6e5" }}>340 km</span></span>
                <span>ETA <span style={{ color: "#c8d6e5" }}>~12s</span></span>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button style={{ flex: 1, padding: 7, background: `linear-gradient(180deg, ${GOLD.pri}20, ${GOLD.pri}08)`, border: `1px solid ${GOLD.pri}44`, color: GOLD.light, fontSize: 10, fontWeight: 800, fontFamily: F, cursor: "pointer", borderRadius: 3, letterSpacing: 1 }}>▷ AUTOPILOT</button>
                <button onClick={() => { setDocked(sel); setSel(null); setSubTab("scan"); }} style={{ flex: 1, padding: 7, background: "linear-gradient(180deg, #22c55e20, #22c55e08)", border: "1px solid #22c55e44", color: "#4ade80", fontSize: 10, fontWeight: 800, fontFamily: F, cursor: "pointer", borderRadius: 3, letterSpacing: 1 }}>⊕ DOCK</button>
              </div>
            </div>
          </DiagPanel>
        </div>
      );})()}

      {/* ═══ DOCKED PANEL ═══ */}
      {docked && !overlay && (
        <DiagPanel style={{ position: "absolute", top: 48, left: 8, bottom: 68, width: 400, zIndex: 15 }} border={EDGE} cut={8}>
          {/* Planet header */}
          <div style={{ background: `linear-gradient(135deg, ${docked.color}30, ${docked.color}10, rgba(8,14,28,0.93))`, borderBottom: `1px solid ${EDGE}`, padding: "12px 14px", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 42, height: 42, borderRadius: docked.type==="station"?6:21, background: `radial-gradient(circle at 30% 30%, ${docked.color}ee, ${docked.color}88)`, border: `2px solid ${docked.color}44`, boxShadow: gw(docked.color, 0.4) }} />
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#e2e8f0" }}>{docked.name}</div>
                  <div style={{ fontSize: 10, color: "#4a6080", fontFamily: FM }}>{docked.ptype || "Station"} · Sol</div>
                </div>
              </div>
              <button onClick={() => setDocked(null)} style={{ background: `linear-gradient(180deg, #ef444418, #ef444808)`, border: "1px solid #ef444444", color: "#ef4444", padding: "5px 14px", fontSize: 10, cursor: "pointer", fontFamily: F, fontWeight: 800, borderRadius: 3, letterSpacing: 1 }}>UNDOCK</button>
            </div>
          </div>
          {/* Vertical icon tabs + content */}
          <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
            {/* Tabs */}
            <div style={{ width: 44, borderRight: `1px solid ${EDGE}`, display: "flex", flexDirection: "column", flexShrink: 0, background: "rgba(6,10,20,0.5)" }}>
              {[
                { id: "scan", icon: "📡", c: "#22d3ee" },
                { id: "mine", icon: "⛏️", c: GOLD.pri },
                { id: "vendor", icon: "🏪", c: GOLD.light },
                { id: "sell", icon: "💰", c: "#22c55e" },
              ].map(tab => (
                <button key={tab.id} onClick={() => setSubTab(tab.id)} title={tab.id} style={{
                  width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center",
                  background: subTab===tab.id ? `linear-gradient(90deg, ${tab.c}18, transparent)` : "transparent",
                  borderLeft: subTab===tab.id ? `3px solid ${tab.c}` : "3px solid transparent",
                  borderRight: "none", borderTop: "none", borderBottom: `1px solid ${EDGE}`,
                  cursor: "pointer", fontSize: 16, transition: "all 0.15s",
                  filter: subTab===tab.id ? `drop-shadow(0 0 4px ${tab.c}44)` : "none",
                }}>{tab.icon}</button>
              ))}
            </div>
            {/* Content */}
            <div style={{ flex: 1, overflow: "auto", padding: 10 }}>
              {subTab === "scan" && <>
                <SH t="Orbital Scan" accent="#22d3ee" right="✓" icon="📡" />
                <div style={{ background: "rgba(6,10,20,0.6)", border: `1px solid ${EDGE}`, borderRadius: 3, padding: 8, marginBottom: 12 }}>
                  {[
                    { n: "Iron", r: "Common", a: "Abundant", c: "#8B4513", ac: "#22c55e" },
                    { n: "Copper", r: "Common", a: "Moderate", c: "#B87333", ac: GOLD.pri },
                    { n: "Crystite", r: "Rare", a: "Scarce", c: "#00FFFF", ac: "#ef4444" },
                  ].map((r, i, arr) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", padding: "5px 4px", borderBottom: i<arr.length-1 ? `1px solid #0a1a2a` : "none" }}>
                      <div style={{ width: 8, height: 8, borderRadius: 4, background: r.c, boxShadow: gw(r.c, 0.3), marginRight: 10 }} />
                      <span style={{ fontSize: 11, color: r.r==="Rare" ? BLUE.light : "#d0dce8", fontWeight: 700, flex: 1 }}>{r.n}</span>
                      <span style={{ fontSize: 9, color: "#3a4a5a", fontFamily: FM, marginRight: 8 }}>{r.r}</span>
                      <span style={{ fontSize: 9, color: r.ac, fontFamily: FM, fontWeight: 700 }}>{r.a}</span>
                    </div>
                  ))}
                </div>
                <SH t="Ground Scan" accent="#8b5cf6" right="○" icon="🛰️" />
                <div style={{ background: "rgba(6,10,20,0.6)", border: `1px solid ${EDGE}`, borderRadius: 3, padding: 18, textAlign: "center" }}>
                  <button style={{ padding: "8px 24px", background: "linear-gradient(180deg, #8b5cf620, #8b5cf608)", border: "1px solid #8b5cf644", color: "#8b5cf6", fontSize: 11, fontFamily: F, fontWeight: 800, cursor: "pointer", borderRadius: 3, letterSpacing: 1, boxShadow: gw("#8b5cf6", 0.12) }}>DEPLOY PROBE</button>
                  <div style={{ fontSize: 9, color: "#2a3a4a", marginTop: 6, fontFamily: FM }}>1 Adv. Probe required</div>
                </div>
              </>}
              {subTab === "vendor" && <>
                <SH t="Hulls" accent={GOLD.light} icon="🚀" />
                {[{ n: "Starter Scout", p: "FREE", d: "Light · 6 slots", ac: "#22c55e" }, { n: "Scout", p: "2,000", d: "Light · 6 slots", ac: GOLD.light }].map((h, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", background: "rgba(6,10,20,0.6)", border: `1px solid ${EDGE}`, borderRadius: 3, marginBottom: 3, cursor: "pointer" }}>
                    <div style={{ width: 0, height: 0, borderLeft: `6px solid #4a5a6a`, borderTop: "4px solid transparent", borderBottom: "4px solid transparent" }} />
                    <div style={{ flex: 1 }}><div style={{ fontSize: 11, color: "#e2e8f0", fontWeight: 700 }}>{h.n}</div><div style={{ fontSize: 9, color: "#2a3a4a" }}>{h.d}</div></div>
                    <span style={{ fontSize: 10, color: h.ac, fontFamily: FM, fontWeight: 700 }}>{h.p}</span>
                  </div>
                ))}
                <SH t="Modules" accent={GOLD.light} icon="⚙" />
                {[{ n: "Pulse Laser", p: "1,000", c: "#ff2244", d: "Weapon T1" }, { n: "Cargo Pod", p: "300", c: "#ddaa22", d: "Cargo T1" }].map((m, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "rgba(6,10,20,0.6)", border: `1px solid ${EDGE}`, borderRadius: 3, marginBottom: 3, cursor: "pointer" }}>
                    <div style={{ width: 3, height: 22, background: `linear-gradient(180deg, ${m.c}, ${m.c}55)`, borderRadius: 1 }} />
                    <div style={{ flex: 1 }}><div style={{ fontSize: 11, color: "#e2e8f0", fontWeight: 700 }}>{m.n}</div><div style={{ fontSize: 9, color: "#2a3a4a" }}>{m.d}</div></div>
                    <span style={{ fontSize: 10, color: GOLD.light, fontFamily: FM, fontWeight: 700 }}>{m.p}</span>
                  </div>
                ))}
              </>}
              {subTab === "mine" && <div style={{ textAlign: "center", padding: 40, color: "#1a2a3a", fontSize: 11 }}>Complete ground scan first</div>}
              {subTab === "sell" && <div style={{ textAlign: "center", padding: 40, color: "#1a2a3a", fontSize: 11 }}>No cargo to sell</div>}
            </div>
          </div>
        </DiagPanel>
      )}

      {/* ═══ SHIP FITTING MODAL ═══ */}
      {overlay === "fitting" && (
        <div style={{ position: "absolute", inset: 0, zIndex: 50 }} onClick={() => setOverlay(null)}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(2,4,10,0.6)", backdropFilter: "blur(2px)" }} />
          <div onClick={e => e.stopPropagation()} style={{ position: "absolute", top: 44, left: 40, right: 40, bottom: 64 }}>
            <DiagPanel style={{ height: "100%" }} border={EDGE} cut={10}>
              {/* Title */}
              <div style={{ background: `linear-gradient(90deg, #ff662225, transparent)`, borderBottom: `1px solid ${EDGE}`, padding: "8px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 16 }}>🔧</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: "#ff6622", letterSpacing: 2, textShadow: gw("#ff6622") }}>SHIP DESIGNER</span>
                </div>
                <button onClick={() => setOverlay(null)} style={{ background: `rgba(20,30,50,0.8)`, border: `1px solid ${EDGE}`, color: "#4a5a6a", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", borderRadius: 3, fontSize: 13 }}>✕</button>
              </div>
              <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
                {/* Left */}
                <div style={{ width: 165, borderRight: `1px solid ${EDGE}`, overflow: "auto", padding: 10, flexShrink: 0 }}>
                  <SH t="Fleet" accent={BLUE.light} icon="🚀" />
                  <div style={{ padding: "7px 10px", background: `${BLUE.pri}0c`, border: `1px solid ${BLUE.dim}`, borderRadius: 3, marginBottom: 6 }}>
                    <div style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 800 }}>ISS Pioneer</div>
                    <div style={{ fontSize: 9, color: BLUE.dim, fontFamily: FM }}>Starter Scout</div>
                  </div>
                  <button style={{ width: "100%", padding: 7, background: "#22c55e0a", border: "1px solid #22c55e33", color: "#22c55e", fontSize: 10, fontFamily: F, fontWeight: 800, cursor: "pointer", borderRadius: 3 }}>+ BUY HULL</button>
                </div>
                {/* Center */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "radial-gradient(ellipse at center, rgba(12,22,44,0.4), rgba(3,6,16,0.7))", position: "relative" }}>
                  <div style={{ fontSize: 10, color: "#2a3a5a", fontFamily: FM, marginBottom: 6 }}>ISS PIONEER — STARTER SCOUT</div>
                  <svg viewBox="-1 -1 9 20" width={130} height={330}>
                    {HULL_GRID.map((row, y) => row.map((cell, x) => cell===0?null:<rect key={`${x},${y}`} x={x} y={y} width={1} height={1} fill={cell===2?"#0e1e38":"#081428"} stroke="#1a3050" strokeWidth="0.04" />))}
                    {SLOTS.map(s => (
                      <g key={s.id} onMouseEnter={() => setHovSlot(s)} onMouseLeave={() => setHovSlot(null)} style={{cursor:"pointer"}}>
                        <rect x={s.x} y={s.y} width={s.w} height={s.h} fill={hovSlot?.id===s.id?`${s.color}18`:`${s.color}08`} stroke={hovSlot?.id===s.id?s.color:`${s.color}33`} strokeWidth={hovSlot?.id===s.id?"0.1":"0.04"} rx="0.08" />
                        <text x={s.x+s.w/2} y={s.y+s.h/2+0.35} textAnchor="middle" fill={s.color} fontSize="0.6" fontFamily={FM} opacity={hovSlot?.id===s.id?1:0.5}>{s.type.slice(0,3).toUpperCase()}</text>
                      </g>
                    ))}
                    <ellipse cx={3.5} cy={17} rx={1} ry={0.4} fill="#ff6622" opacity={0.1+Math.sin(t*10)*0.06} />
                  </svg>
                  {hovSlot && (
                    <div style={{ position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)", background: "rgba(8,14,28,0.95)", border: `1px solid ${hovSlot.color}44`, borderRadius: 4, padding: "6px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 3, height: 18, background: `linear-gradient(180deg, ${hovSlot.color}, ${hovSlot.color}55)`, borderRadius: 1 }} />
                      <span style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 700 }}>{hovSlot.mod}</span>
                      <span style={{ fontSize: 9, color: hovSlot.color, fontFamily: FM }}>{hovSlot.type.toUpperCase()}</span>
                      <button style={{ background: "#ef444412", border: "1px solid #ef444433", color: "#ef4444", padding: "3px 10px", fontSize: 9, fontFamily: F, cursor: "pointer", borderRadius: 2, fontWeight: 800 }}>UNFIT</button>
                    </div>
                  )}
                </div>
                {/* Right */}
                <div style={{ width: 225, borderLeft: `1px solid ${EDGE}`, overflow: "auto", padding: 10, flexShrink: 0 }}>
                  <SH t="Stats" accent={BLUE.light} icon="📊" />
                  <div style={{ background: "rgba(6,10,20,0.6)", border: `1px solid ${EDGE}`, borderRadius: 3, padding: 8, marginBottom: 14 }}>
                    {[{ l: "Hull", v: "200", c: "#22c55e" }, { l: "Speed", v: "120", c: BLUE.light }, { l: "Maneuver", v: "85", c: BLUE.light }, { l: "Sensors", v: "500", c: GOLD.pri }, { l: "Cargo", v: "34/100", c: GOLD.light }].map((s, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3px 2px", fontSize: 10, fontFamily: FM, borderBottom: i<4 ? "1px solid #081428" : "none" }}>
                        <span style={{ color: "#3a5a6a" }}>{s.l}</span><span style={{ color: s.c, fontWeight: 700 }}>{s.v}</span>
                      </div>
                    ))}
                  </div>
                  <SH t="Modules" accent="#ff6622" right="6/6" icon="⚙" />
                  {MODULES.map((m, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", background: "rgba(6,10,20,0.6)", border: `1px solid ${EDGE}`, borderRadius: 3, marginBottom: 2 }}>
                      <div style={{ width: 3, height: 20, background: `linear-gradient(180deg, ${m.color}, ${m.color}55)`, borderRadius: 1 }} />
                      <div style={{ flex: 1 }}><div style={{ fontSize: 10, color: "#d0dce8", fontWeight: 700 }}>{m.name}</div><div style={{ fontSize: 8, color: "#2a3a4a", fontFamily: FM }}>{m.type} · Q{m.q}</div></div>
                    </div>
                  ))}
                  <button style={{ width: "100%", marginTop: 12, padding: 9, background: `linear-gradient(180deg, ${BLUE.pri}20, ${BLUE.pri}08)`, border: `1px solid ${BLUE.dim}`, color: BLUE.light, fontSize: 12, fontFamily: F, fontWeight: 800, cursor: "pointer", borderRadius: 3, letterSpacing: 2, textShadow: gw(BLUE.light, 0.25), boxShadow: gw(BLUE.light, 0.08) }}>🚀 LAUNCH</button>
                </div>
              </div>
              <div style={{ borderTop: `1px solid ${EDGE}`, padding: "5px 16px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0, background: "rgba(6,10,20,0.4)", fontSize: 10 }}>
                <span style={{ color: "#2a3a4a", fontFamily: FM }}>DESIGN</span>
                <div style={{ background: "#081428", border: `1px solid ${EDGE}`, padding: "3px 12px", borderRadius: 2, flex: 1, maxWidth: 180 }}>
                  <span style={{ color: "#a0b0c0", fontFamily: FM, fontSize: 10 }}>ISS Pioneer</span>
                </div>
                <span style={{ color: "#2a3a4a" }}>Click slot to assign modules from cargo</span>
              </div>
            </DiagPanel>
          </div>
        </div>
      )}
    </div>
  );
}
