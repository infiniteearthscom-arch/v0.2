import { useState, useEffect, useRef } from "react";

const F = "'Rajdhani', sans-serif";
const FM = "'Share Tech Mono', monospace";

const BLUE = { pri: "#3b82f6", light: "#60a5fa", dark: "#1d4ed8", dim: "#1e3a5f", bg: "#0c1a33" };
const GOLD = { pri: "#f59e0b", light: "#fbbf24", dark: "#d97706", dim: "#5c3d0e" };
const EDGE = "#1a3050";
const PB = "rgba(8,14,28,0.93)";

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

const gw = (c, a = 0.25) => `0 0 10px ${c}${Math.round(a * 255).toString(16).padStart(2, "0")}`;

const diagAll = (c = 8) => `polygon(${c}px 0, calc(100% - ${c}px) 0, 100% ${c}px, 100% calc(100% - ${c}px), calc(100% - ${c}px) 100%, ${c}px 100%, 0 calc(100% - ${c}px), 0 ${c}px)`;
const diagTL = (c = 8) => `polygon(${c}px 0, 100% 0, 100% 100%, 0 100%, 0 ${c}px)`;
const diagBR = (c = 8) => `polygon(0 0, 100% 0, 100% calc(100% - ${c}px), calc(100% - ${c}px) 100%, 0 100%)`;
const diagMix = (c = 8) => `polygon(${c}px 0, 100% 0, 100% calc(100% - ${c}px), calc(100% - ${c}px) 100%, 0 100%, 0 ${c}px)`;

const DiagPanel = ({ children, style = {}, border = EDGE, cut = 8, shape = "mix" }) => {
  const clip = shape === "all" ? diagAll(cut) : shape === "tl" ? diagTL(cut) : shape === "br" ? diagBR(cut) : diagMix(cut);
  return (
    <div style={{ position: "relative", ...style }}>
      <div style={{ position: "absolute", inset: -1, clipPath: clip, background: border, zIndex: 0 }} />
      <div style={{ position: "relative", clipPath: clip, background: style.background || PB, zIndex: 1, height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
};

const SH = ({ t, accent = BLUE.light, right, icon }) => (
  <div style={{ display: "flex", alignItems: "center", marginBottom: 6, borderLeft: `2px solid ${accent}`, background: `linear-gradient(90deg, ${accent}18, transparent)`, padding: "4px 10px" }}>
    {icon && <span style={{ marginRight: 6, fontSize: 11 }}>{icon}</span>}
    <span style={{ fontSize: 11, fontWeight: 800, color: accent, letterSpacing: 1.5, fontFamily: F, textTransform: "uppercase", flex: 1 }}>{t}</span>
    {right && <span style={{ fontSize: 10, color: "#3a5a6a", fontFamily: FM }}>{right}</span>}
  </div>
);

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
    if (b.parent) { const par = BODIES.find(x => x.id === b.parent); const pp = bp(par); const a = t * (2 / b.orb) + b.off; return { x: pp.x + Math.cos(a) * b.orb, y: pp.y + Math.sin(a) * b.orb }; }
    const a = t * (0.5 / b.orb) + b.off; return { x: 50 + Math.cos(a) * b.orb, y: 50 + Math.sin(a) * b.orb };
  };

  const toolBtns = [
    { id: "fitting", icon: "🔧", label: "Fitting", c: "#ff6622" },
    { id: "fleet", icon: "🚀", label: "Fleet", c: BLUE.light },
    { id: "cargo", icon: "📦", label: "Cargo", c: GOLD.pri },
    { id: "craft", icon: "🔨", label: "Craft", c: "#aa66ff" },
    { id: "missions", icon: "📋", label: "Missions", c: "#22d3ee" },
    { id: "galaxy", icon: "🌌", label: "Galaxy", c: "#8844ff" },
    { id: "research", icon: "🔬", label: "Research", c: "#22c55e" },
  ];

  return (
    <div style={{ fontFamily: F, color: "#c8d6e5", position: "relative", width: "100%", height: "100vh", overflow: "hidden", background: "#030610" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700;800&family=Share+Tech+Mono&display=swap');`}</style>

      {/* ═══ FULLSCREEN GAME VIEW ═══ */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} onClick={() => { if (!overlay) setSel(null); }}>
        <defs>
          <radialGradient id="sg"><stop offset="0%" stopColor="#fff8dd" /><stop offset="15%" stopColor="#ffdd44" stopOpacity="0.7" /><stop offset="40%" stopColor="#ffaa00" stopOpacity="0.08" /><stop offset="100%" stopColor="#000" stopOpacity="0" /></radialGradient>
          <radialGradient id="at"><stop offset="55%" stopColor="transparent" /><stop offset="100%" stopColor="#88ccff" stopOpacity="0.3" /></radialGradient>
          <filter id="gl"><feGaussianBlur stdDeviation="0.5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          <filter id="gl2"><feGaussianBlur stdDeviation="2.5" /></filter>
        </defs>
        {Array.from({ length: 300 }, (_, i) => { const a=((i*7919+1)%997)/997,b=((i*6271+3)%991)/991,c=((i*3571+7)%983)/983; return <circle key={i} cx={a*100} cy={b*100} r={c<0.05?0.3:c<0.15?0.14:0.06} fill={c<0.03?"#88aaff":c<0.08?"#ffeedd":"#ffffff"} opacity={0.08+c*0.5} />; })}
        <circle cx={78} cy={18} r={25} fill="#1a2a55" opacity="0.025" filter="url(#gl2)" />
        <circle cx={12} cy={78} r={20} fill="#551a2a" opacity="0.018" filter="url(#gl2)" />
        <circle cx={42} cy={88} r={14} fill="#2a551a" opacity="0.012" filter="url(#gl2)" />
        <circle cx={50} cy={50} r={18} fill="url(#sg)" />
        <circle cx={50} cy={50} r={5} fill="#ffeeaa" filter="url(#gl)" /><circle cx={50} cy={50} r={3.8} fill="#fff8dd" /><circle cx={50} cy={50} r={2.5} fill="#ffffff" opacity="0.8" />
        {BODIES.filter(b => !b.parent).map(b => <circle key={b.id+"o"} cx={50} cy={50} r={b.orb} fill="none" stroke="#aabbcc" strokeWidth="0.05" opacity="0.07" strokeDasharray="0.3,1.8" />)}
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

      {/* ═══ TOP RESOURCE BAR ═══ */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 34, background: "linear-gradient(180deg, rgba(8,16,32,0.97), rgba(6,12,24,0.9))", borderBottom: `1px solid ${EDGE}`, display: "flex", alignItems: "center", padding: "0 10px", zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginRight: 14, padding: "3px 14px 3px 8px", background: `linear-gradient(135deg, ${BLUE.pri}25, transparent)`, borderRight: `1px solid ${EDGE}`, height: "100%" }}>
          <div style={{ width: 20, height: 20, background: `linear-gradient(135deg, ${BLUE.pri}, ${BLUE.dark})`, clipPath: diagAll(4), display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 10, color: "#fff", fontWeight: 900 }}>★</span>
          </div>
          <span style={{ fontSize: 12, fontWeight: 800, color: BLUE.light, letterSpacing: 2 }}>STAR SHIPPER</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 3, flex: 1, fontSize: 10, fontFamily: FM }}>
          {[
            { icon: "⬡", val: "1,450", c: GOLD.light, label: "Credits" },
            { icon: "⛏", val: "45", c: "#B87333", label: "Iron" },
            { icon: "⚡", val: "22", c: "#B87333", label: "Copper" },
            { icon: "💎", val: "0", c: "#00cccc", label: "Crystite" },
            { icon: "💨", val: "8", c: "#87CEEB", label: "Hydrogen" },
            { icon: "🚀", val: "1/8", c: BLUE.light, label: "Fleet" },
          ].map((r, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 3, padding: "0 7px", borderRight: `1px solid ${EDGE}`, height: 22 }} title={r.label}>
              <span style={{ fontSize: 10 }}>{r.icon}</span>
              <span style={{ color: r.val === "0" ? "#2a3a4a" : r.c, fontWeight: 700 }}>{r.val}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, fontFamily: FM }}>
          <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <span style={{ color: "#22c55e", fontSize: 7 }}>■</span>
            <div style={{ width: 55, height: 4, background: "#0a1528", borderRadius: 2, border: `1px solid ${EDGE}`, overflow: "hidden" }}>
              <div style={{ width: "100%", height: "100%", background: "linear-gradient(90deg, #166534, #22c55e)" }} />
            </div>
            <span style={{ color: "#22c55e", fontWeight: 700, fontSize: 9 }}>200</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <span style={{ color: "#818cf8", fontSize: 7 }}>◆</span>
            <div style={{ width: 35, height: 4, background: "#0a1528", borderRadius: 2, border: `1px solid ${EDGE}` }} />
            <span style={{ color: "#2a3a4a", fontSize: 9 }}>—</span>
          </div>
          <div style={{ width: 1, height: 18, background: EDGE }} />
          <div style={{ borderLeft: `2px solid ${BLUE.dim}`, padding: "1px 8px", background: `${BLUE.bg}66` }}>
            <div style={{ fontSize: 10, color: "#c8d6e5", fontWeight: 700 }}>ISS PIONEER</div>
            <div style={{ fontSize: 7, color: "#3a5a6a" }}>STARTER SCOUT</div>
          </div>
        </div>
      </div>

      {/* ═══ LEFT TOOLBAR ═══ */}
      <div style={{ position: "absolute", top: 46, left: 6, display: "flex", flexDirection: "column", gap: 2, zIndex: 10 }}>
        {toolBtns.map(b => {
          const on = overlay === b.id;
          return (
            <div key={b.id} style={{ position: "relative" }}>
              <div style={{ position: "absolute", inset: -1, clipPath: diagMix(5), background: on ? `${b.c}55` : EDGE, zIndex: 0 }} />
              <button onClick={() => setOverlay(on ? null : b.id)} title={b.label} style={{
                position: "relative", zIndex: 1, width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center",
                background: on ? `linear-gradient(135deg, ${b.c}28, ${b.c}0a)` : PB,
                clipPath: diagMix(5), border: "none", cursor: "pointer", fontSize: 16, transition: "all 0.15s",
                filter: on ? `drop-shadow(0 0 6px ${b.c}44)` : "none",
              }}>{b.icon}</button>
            </div>
          );
        })}
        <div style={{ height: 8 }} />
        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", inset: -1, clipPath: diagMix(5), background: showOutliner ? `${BLUE.dim}` : EDGE }} />
          <button onClick={() => setShowOutliner(!showOutliner)} title="Outliner" style={{
            position: "relative", zIndex: 1, width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center",
            background: showOutliner ? `${BLUE.pri}15` : PB, clipPath: diagMix(5), border: "none",
            cursor: "pointer", fontSize: 14, color: showOutliner ? BLUE.light : "#3a5a6a",
          }}>☰</button>
        </div>
      </div>

      {/* ═══ RIGHT OUTLINER ═══ */}
      {showOutliner && (
        <DiagPanel style={{ position: "absolute", top: 46, right: 6, width: 200, zIndex: 10, maxHeight: "calc(100% - 88px)" }} border={EDGE} cut={6} shape="mix">
          <div style={{ background: `linear-gradient(90deg, ${BLUE.pri}20, transparent)`, padding: "6px 10px", borderBottom: `1px solid ${EDGE}`, display: "flex", alignItems: "center" }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: BLUE.light, letterSpacing: 2, flex: 1 }}>OUTLINER</span>
            <button onClick={() => setShowOutliner(false)} style={{ background: "none", border: "none", color: "#2a3a4a", cursor: "pointer", fontSize: 11 }}>✕</button>
          </div>
          <div style={{ padding: "6px 8px", overflow: "auto", flex: 1 }}>
            <SH t="Fleet" accent={BLUE.light} right="1" icon="🚀" />
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", background: `${BLUE.pri}08`, borderLeft: `2px solid ${BLUE.pri}44`, marginBottom: 8, marginLeft: 4 }}>
              <div style={{ width: 0, height: 0, borderLeft: `5px solid ${BLUE.light}`, borderTop: "3px solid transparent", borderBottom: "3px solid transparent" }} />
              <div><div style={{ fontSize: 10, color: "#e2e8f0", fontWeight: 700 }}>ISS Pioneer</div><div style={{ fontSize: 8, color: "#2a4a5a", fontFamily: FM }}>Starter Scout</div></div>
            </div>
            <SH t="Bodies" accent={GOLD.pri} right={`${BODIES.length}`} icon="◎" />
            {BODIES.map(b => (
              <div key={b.id} onClick={() => setSel(b)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "2px 6px 2px 10px", cursor: "pointer", background: sel?.id===b.id ? `${BLUE.pri}0a` : "transparent", borderLeft: sel?.id===b.id ? `2px solid ${BLUE.pri}44` : "2px solid transparent", marginBottom: 1 }}>
                <div style={{ width: 5, height: 5, borderRadius: b.type==="station"?1:3, background: b.color, boxShadow: gw(b.color, 0.2) }} />
                <span style={{ fontSize: 9, color: "#8a9aaa", flex: 1, fontWeight: 500 }}>{b.name}</span>
                <span style={{ fontSize: 7, color: "#1a2a3a", fontFamily: FM }}>{b.ptype || "Stn"}</span>
              </div>
            ))}
          </div>
        </DiagPanel>
      )}

      {/* ═══ BOTTOM BAR — minimal with speed/system ═══ */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 32, background: "linear-gradient(0deg, rgba(8,16,32,0.95), rgba(6,12,24,0.85))", borderTop: `1px solid ${EDGE}`, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, zIndex: 10, fontSize: 10, fontFamily: FM }}>
        <span style={{ color: "#2a3a4a" }}>SPD <span style={{ color: docked ? "#2a3a4a" : BLUE.light }}>{docked?"0":"142"}</span></span>
        <span style={{ color: "#0e1a2a" }}>│</span>
        {["⏸","1×","2×","3×"].map((l,i) => (
          <button key={i} style={{ background: i===1?`${BLUE.pri}18`:"transparent", border: `1px solid ${i===1?BLUE.dim:EDGE}`, color: i===1?BLUE.light:"#2a3a4a", padding: "2px 7px", fontSize: 10, cursor: "pointer", fontFamily: FM, borderRadius: 2 }}>{l}</button>
        ))}
        <span style={{ color: "#0e1a2a" }}>│</span>
        <div style={{ borderLeft: `2px solid ${GOLD.dim}`, padding: "2px 12px", background: `${GOLD.pri}08` }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: "#d0dce8", letterSpacing: 1, fontFamily: F }}>Sol System</span>
        </div>
        {docked && <><span style={{ color: "#0e1a2a" }}>│</span><span style={{ color: "#22c55e", textShadow: gw("#22c55e", 0.2) }}>● DOCKED — {docked.name}</span></>}
      </div>

      {/* ═══ BODY POPUP ═══ */}
      {sel && !docked && !overlay && (() => { const p = bp(sel); return (
        <div style={{ position: "absolute", left: `${p.x}%`, top: `${p.y}%`, transform: "translate(20px, -50%)", zIndex: 20 }}>
          <DiagPanel style={{ minWidth: 220 }} border={EDGE} cut={8} shape="mix">
            <div style={{ background: `linear-gradient(135deg, ${sel.color}28, transparent)`, padding: "10px 14px", borderBottom: `1px solid ${EDGE}`, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 24, height: 24, borderRadius: sel.type==="station"?3:12, background: `radial-gradient(circle at 35% 35%, ${sel.color}, ${sel.color}88)`, boxShadow: gw(sel.color, 0.3) }} />
              <div><div style={{ fontSize: 14, fontWeight: 800, color: "#e2e8f0" }}>{sel.name}</div><div style={{ fontSize: 9, color: "#3a5a6a", fontFamily: FM }}>{sel.ptype || sel.type}</div></div>
            </div>
            <div style={{ padding: "8px 14px" }}>
              <div style={{ display: "flex", gap: 12, fontSize: 9, fontFamily: FM, color: "#2a4a5a", marginBottom: 8 }}>
                <span>DIST <span style={{ color: "#a0b0c0" }}>340 km</span></span>
                <span>ETA <span style={{ color: "#a0b0c0" }}>~12s</span></span>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button style={{ flex: 1, padding: 7, background: `linear-gradient(180deg, ${GOLD.pri}18, ${GOLD.pri}06)`, border: `1px solid ${GOLD.pri}44`, color: GOLD.light, fontSize: 10, fontWeight: 800, fontFamily: F, cursor: "pointer", borderRadius: 3, letterSpacing: 1 }}>▷ AUTOPILOT</button>
                <button onClick={() => { setDocked(sel); setSel(null); setSubTab("scan"); }} style={{ flex: 1, padding: 7, background: "linear-gradient(180deg, #22c55e18, #22c55e06)", border: "1px solid #22c55e44", color: "#4ade80", fontSize: 10, fontWeight: 800, fontFamily: F, cursor: "pointer", borderRadius: 3, letterSpacing: 1 }}>⊕ DOCK</button>
              </div>
            </div>
          </DiagPanel>
        </div>
      );})()}

      {/* ═══ DOCKED PLANET PANEL — Phase 2: landscape header + vertical icon tabs + stats ═══ */}
      {docked && !overlay && (
        <DiagPanel style={{ position: "absolute", top: 46, left: 56, bottom: 44, width: 420, zIndex: 15 }} border={EDGE} cut={8} shape="mix">
          {/* Landscape banner header — Stellaris-style with planet art + stats */}
          <div style={{ position: "relative", height: 110, flexShrink: 0, overflow: "hidden" }}>
            {/* Landscape gradient — simulates terrain art */}
            <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, transparent 0%, ${docked.color}15 30%, ${docked.color}25 60%, ${docked.color}08 100%)` }} />
            {/* Horizon line */}
            <div style={{ position: "absolute", bottom: 30, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${docked.color}33, transparent)` }} />
            {/* Terrain silhouette */}
            <svg viewBox="0 0 420 40" style={{ position: "absolute", bottom: 28, left: 0, width: "100%", height: 40 }} preserveAspectRatio="none">
              <path d={`M0,40 L0,${25+Math.sin(1)*8} ${Array.from({length:42},(_, i)=>`L${i*10},${18+Math.sin(i*0.7+docked.off)*8+Math.sin(i*1.3)*4}`).join(' ')} L420,40 Z`} fill={`${docked.color}15`} />
              <path d={`M0,40 L0,${30+Math.sin(2)*5} ${Array.from({length:42},(_, i)=>`L${i*10},${25+Math.sin(i*0.5+docked.off+1)*6+Math.sin(i*1.7)*3}`).join(' ')} L420,40 Z`} fill={`${docked.color}0c`} />
            </svg>
            {/* Sky gradient */}
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 50, background: `linear-gradient(180deg, rgba(3,6,16,0.95), transparent)` }} />
            {/* Stars in sky area */}
            {Array.from({length:20},(_,i) => (
              <div key={i} style={{ position: "absolute", top: 5+((i*37)%45), left: 10+((i*73)%380), width: 1, height: 1, borderRadius: 1, background: "#ffffff", opacity: 0.15+((i*17)%30)/100 }} />
            ))}
            {/* Planet orb in sky */}
            <div style={{ position: "absolute", top: 12, right: 30, width: 36, height: 36, borderRadius: 18, background: `radial-gradient(circle at 35% 35%, ${docked.color}cc, ${docked.color}66)`, boxShadow: `${gw(docked.color, 0.35)}, inset -4px -4px 8px rgba(0,0,0,0.3)`, border: `1px solid ${docked.color}44` }} />
            {/* Header content over landscape */}
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "8px 14px", background: "linear-gradient(0deg, rgba(8,14,28,0.95), rgba(8,14,28,0.5), transparent)" }}>
              <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#e2e8f0", textShadow: "0 1px 4px rgba(0,0,0,0.5)" }}>{docked.name}</div>
                  <div style={{ fontSize: 10, color: "#6a8a9a", fontFamily: FM }}>{docked.ptype || "Station"} · Sol System</div>
                </div>
                <button onClick={() => setDocked(null)} style={{ background: `linear-gradient(180deg, #ef444418, #ef444806)`, border: "1px solid #ef444433", color: "#ef4444", padding: "4px 12px", fontSize: 9, cursor: "pointer", fontFamily: F, fontWeight: 800, borderRadius: 2, letterSpacing: 1 }}>UNDOCK</button>
              </div>
            </div>
          </div>
          {/* Stats bar below header */}
          <div style={{ display: "flex", padding: "6px 14px", borderBottom: `1px solid ${EDGE}`, gap: 12, fontSize: 9, fontFamily: FM, color: "#3a5a6a", background: "rgba(6,10,20,0.5)", flexShrink: 0 }}>
            <span>TYPE <span style={{ color: "#a0b0c0" }}>{docked.ptype || "Station"}</span></span>
            <span>SIZE <span style={{ color: "#a0b0c0" }}>Class {docked.size > 5 ? "IV" : docked.size > 3 ? "III" : "II"}</span></span>
            <span>GRAVITY <span style={{ color: "#a0b0c0" }}>{docked.size > 5 ? "1.8g" : docked.size > 3 ? "1.0g" : "0.4g"}</span></span>
            <span>DEPOSITS <span style={{ color: GOLD.pri }}>3</span></span>
          </div>
          {/* Content area: vertical icon tabs + panel */}
          <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
            {/* Vertical icon tabs */}
            <div style={{ width: 42, borderRight: `1px solid ${EDGE}`, display: "flex", flexDirection: "column", flexShrink: 0, background: "rgba(4,8,16,0.4)" }}>
              {[
                { id: "scan", icon: "📡", c: "#22d3ee", label: "Scan" },
                { id: "mine", icon: "⛏️", c: GOLD.pri, label: "Mine" },
                { id: "vendor", icon: "🏪", c: GOLD.light, label: "Vendor" },
                { id: "sell", icon: "💰", c: "#22c55e", label: "Sell" },
              ].map(tab => (
                <button key={tab.id} onClick={() => setSubTab(tab.id)} title={tab.label} style={{
                  width: 42, height: 44, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1,
                  background: subTab===tab.id ? `linear-gradient(90deg, ${tab.c}15, transparent)` : "transparent",
                  borderLeft: subTab===tab.id ? `3px solid ${tab.c}` : "3px solid transparent",
                  borderRight: "none", borderTop: "none", borderBottom: `1px solid ${EDGE}`,
                  cursor: "pointer", transition: "all 0.15s",
                  filter: subTab===tab.id ? `drop-shadow(0 0 4px ${tab.c}33)` : "none",
                }}>
                  <span style={{ fontSize: 14 }}>{tab.icon}</span>
                  <span style={{ fontSize: 7, color: subTab===tab.id ? tab.c : "#2a3a4a", fontWeight: 700, fontFamily: F, letterSpacing: 0.5 }}>{tab.label.toUpperCase()}</span>
                </button>
              ))}
            </div>
            {/* Tab content */}
            <div style={{ flex: 1, overflow: "auto", padding: 10 }}>
              {subTab === "scan" && <>
                <SH t="Orbital Scan" accent="#22d3ee" right="✓" icon="📡" />
                <div style={{ background: "rgba(4,8,16,0.5)", border: `1px solid ${EDGE}`, borderRadius: 3, padding: 8, marginBottom: 12 }}>
                  {[
                    { n: "Iron", r: "Common", a: "Abundant", c: "#8B4513", ac: "#22c55e" },
                    { n: "Copper", r: "Common", a: "Moderate", c: "#B87333", ac: GOLD.pri },
                    { n: "Titanium", r: "Common", a: "Scarce", c: "#C0C0C0", ac: "#ef4444" },
                    { n: "Crystite", r: "Rare", a: "Scarce", c: "#00FFFF", ac: "#ef4444" },
                  ].map((r, i, arr) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", padding: "5px 4px", borderBottom: i<arr.length-1 ? "1px solid #060e1a" : "none" }}>
                      <div style={{ width: 7, height: 7, borderRadius: 4, background: r.c, boxShadow: gw(r.c, 0.25), marginRight: 8 }} />
                      <span style={{ fontSize: 11, color: r.r==="Rare" ? BLUE.light : "#c8d6e5", fontWeight: 700, flex: 1 }}>{r.n}</span>
                      <span style={{ fontSize: 8, color: "#2a3a4a", fontFamily: FM, marginRight: 8 }}>{r.r}</span>
                      <span style={{ fontSize: 8, color: r.ac, fontFamily: FM, fontWeight: 700 }}>{r.a}</span>
                    </div>
                  ))}
                </div>
                <SH t="Ground Scan" accent="#8b5cf6" right="○" icon="🛰️" />
                <div style={{ background: "rgba(4,8,16,0.5)", border: `1px solid ${EDGE}`, borderRadius: 3, padding: 16, textAlign: "center" }}>
                  <button style={{ padding: "7px 22px", background: "linear-gradient(180deg, #8b5cf618, #8b5cf606)", border: "1px solid #8b5cf644", color: "#8b5cf6", fontSize: 10, fontFamily: F, fontWeight: 800, cursor: "pointer", borderRadius: 3, letterSpacing: 1, boxShadow: gw("#8b5cf6", 0.1) }}>DEPLOY PROBE</button>
                  <div style={{ fontSize: 8, color: "#1a2a3a", marginTop: 6, fontFamily: FM }}>1 Adv. Probe required</div>
                </div>
              </>}
              {subTab === "vendor" && <>
                <SH t="Hulls" accent={GOLD.light} icon="🚀" />
                {[{ n: "Starter Scout", p: "FREE", d: "Light · 6 slots", ac: "#22c55e" }, { n: "Scout", p: "2,000", d: "Light · 6 slots", ac: GOLD.light }, { n: "Fighter", p: "3,000", d: "Strike · 4 slots", ac: GOLD.light }].map((h, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: "rgba(4,8,16,0.5)", border: `1px solid ${EDGE}`, borderRadius: 3, marginBottom: 3, cursor: "pointer" }}>
                    <div style={{ width: 0, height: 0, borderLeft: "5px solid #3a4a5a", borderTop: "3px solid transparent", borderBottom: "3px solid transparent" }} />
                    <div style={{ flex: 1 }}><div style={{ fontSize: 11, color: "#d0dce8", fontWeight: 700 }}>{h.n}</div><div style={{ fontSize: 8, color: "#1a2a3a" }}>{h.d}</div></div>
                    <span style={{ fontSize: 10, color: h.ac, fontFamily: FM, fontWeight: 700 }}>{h.p}</span>
                  </div>
                ))}
                <SH t="Modules" accent={GOLD.light} icon="⚙" />
                {[{ n: "Pulse Laser", p: "1,000", c: "#ff2244", d: "Weapon T1" }, { n: "Cargo Pod", p: "300", c: "#ddaa22", d: "Cargo T1" }, { n: "Starter Kit", p: "500", c: "#22d3ee", d: "Full basic loadout" }].map((m, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: "rgba(4,8,16,0.5)", border: `1px solid ${EDGE}`, borderRadius: 3, marginBottom: 3, cursor: "pointer" }}>
                    <div style={{ width: 3, height: 20, background: `linear-gradient(180deg, ${m.c}, ${m.c}44)`, borderRadius: 1 }} />
                    <div style={{ flex: 1 }}><div style={{ fontSize: 11, color: "#d0dce8", fontWeight: 700 }}>{m.n}</div><div style={{ fontSize: 8, color: "#1a2a3a" }}>{m.d}</div></div>
                    <span style={{ fontSize: 10, color: GOLD.light, fontFamily: FM, fontWeight: 700 }}>{m.p}</span>
                  </div>
                ))}
              </>}
              {subTab === "mine" && <div style={{ textAlign: "center", padding: 30, color: "#1a2a3a", fontSize: 10 }}>Complete ground scan first</div>}
              {subTab === "sell" && <div style={{ textAlign: "center", padding: 30, color: "#1a2a3a", fontSize: 10 }}>No cargo to sell</div>}
            </div>
          </div>
        </DiagPanel>
      )}

      {/* ═══ SHIP FITTING MODAL ═══ */}
      {overlay === "fitting" && (
        <div style={{ position: "absolute", inset: 0, zIndex: 50 }} onClick={() => setOverlay(null)}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(2,4,10,0.55)", backdropFilter: "blur(2px)" }} />
          <div onClick={e => e.stopPropagation()} style={{ position: "absolute", top: 42, left: 50, right: 50, bottom: 42 }}>
            <DiagPanel style={{ height: "100%" }} border={EDGE} cut={10} shape="mix">
              <div style={{ background: `linear-gradient(90deg, #ff662220, transparent)`, borderBottom: `1px solid ${EDGE}`, padding: "7px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 15 }}>🔧</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: "#ff6622", letterSpacing: 2, textShadow: gw("#ff6622") }}>SHIP DESIGNER</span>
                </div>
                <button onClick={() => setOverlay(null)} style={{ background: "rgba(15,25,45,0.8)", border: `1px solid ${EDGE}`, color: "#3a4a5a", width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", borderRadius: 3, fontSize: 12 }}>✕</button>
              </div>
              <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
                <div style={{ width: 160, borderRight: `1px solid ${EDGE}`, overflow: "auto", padding: 10, flexShrink: 0 }}>
                  <SH t="Fleet" accent={BLUE.light} icon="🚀" />
                  <div style={{ padding: "6px 8px", background: `${BLUE.pri}0a`, border: `1px solid ${BLUE.dim}`, borderRadius: 3, marginBottom: 6 }}>
                    <div style={{ fontSize: 11, color: "#e2e8f0", fontWeight: 800 }}>ISS Pioneer</div>
                    <div style={{ fontSize: 8, color: "#2a4a5a", fontFamily: FM }}>Starter Scout</div>
                  </div>
                  <button style={{ width: "100%", padding: 6, background: "#22c55e08", border: "1px solid #22c55e33", color: "#22c55e", fontSize: 9, fontFamily: F, fontWeight: 800, cursor: "pointer", borderRadius: 3 }}>+ BUY HULL</button>
                </div>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "radial-gradient(ellipse at center, rgba(10,20,40,0.4), rgba(3,6,16,0.7))", position: "relative" }}>
                  <div style={{ fontSize: 9, color: "#1a2a3a", fontFamily: FM, marginBottom: 6 }}>ISS PIONEER — STARTER SCOUT</div>
                  <svg viewBox="-1 -1 9 20" width={125} height={310}>
                    {HULL_GRID.map((row, y) => row.map((cell, x) => cell===0?null:<rect key={`${x},${y}`} x={x} y={y} width={1} height={1} fill={cell===2?"#0c1c35":"#071225"} stroke="#1a3050" strokeWidth="0.04" />))}
                    {SLOTS.map(s => (
                      <g key={s.id} onMouseEnter={() => setHovSlot(s)} onMouseLeave={() => setHovSlot(null)} style={{cursor:"pointer"}}>
                        <rect x={s.x} y={s.y} width={s.w} height={s.h} fill={hovSlot?.id===s.id?`${s.color}18`:`${s.color}08`} stroke={hovSlot?.id===s.id?s.color:`${s.color}30`} strokeWidth={hovSlot?.id===s.id?"0.1":"0.04"} rx="0.06" />
                        <text x={s.x+s.w/2} y={s.y+s.h/2+0.3} textAnchor="middle" fill={s.color} fontSize="0.6" fontFamily={FM} opacity={hovSlot?.id===s.id?1:0.4}>{s.type.slice(0,3).toUpperCase()}</text>
                      </g>
                    ))}
                    <ellipse cx={3.5} cy={17} rx={1} ry={0.4} fill="#ff6622" opacity={0.08+Math.sin(t*10)*0.05} />
                  </svg>
                  {hovSlot && (
                    <div style={{ position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)", background: PB, border: `1px solid ${hovSlot.color}44`, borderRadius: 3, padding: "5px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 3, height: 16, background: `linear-gradient(180deg, ${hovSlot.color}, ${hovSlot.color}44)`, borderRadius: 1 }} />
                      <span style={{ fontSize: 11, color: "#d0dce8", fontWeight: 700 }}>{hovSlot.mod}</span>
                      <span style={{ fontSize: 8, color: hovSlot.color, fontFamily: FM }}>{hovSlot.type.toUpperCase()}</span>
                      <button style={{ background: "#ef444410", border: "1px solid #ef444430", color: "#ef4444", padding: "2px 8px", fontSize: 8, fontFamily: F, cursor: "pointer", borderRadius: 2, fontWeight: 800 }}>UNFIT</button>
                    </div>
                  )}
                </div>
                <div style={{ width: 215, borderLeft: `1px solid ${EDGE}`, overflow: "auto", padding: 10, flexShrink: 0 }}>
                  <SH t="Stats" accent={BLUE.light} icon="📊" />
                  <div style={{ background: "rgba(4,8,16,0.5)", border: `1px solid ${EDGE}`, borderRadius: 3, padding: 8, marginBottom: 12 }}>
                    {[{ l: "Hull", v: "200", c: "#22c55e" }, { l: "Speed", v: "120", c: BLUE.light }, { l: "Maneuver", v: "85", c: BLUE.light }, { l: "Sensors", v: "500", c: GOLD.pri }, { l: "Cargo", v: "34/100", c: GOLD.light }].map((s, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3px 2px", fontSize: 10, fontFamily: FM, borderBottom: i<4?"1px solid #060e1a":"none" }}>
                        <span style={{ color: "#2a4a5a" }}>{s.l}</span><span style={{ color: s.c, fontWeight: 700 }}>{s.v}</span>
                      </div>
                    ))}
                  </div>
                  <SH t="Modules" accent="#ff6622" right="6/6" icon="⚙" />
                  {MODULES.map((m, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 6px", background: "rgba(4,8,16,0.5)", border: `1px solid ${EDGE}`, borderRadius: 3, marginBottom: 2 }}>
                      <div style={{ width: 3, height: 18, background: `linear-gradient(180deg, ${m.color}, ${m.color}44)`, borderRadius: 1 }} />
                      <div style={{ flex: 1 }}><div style={{ fontSize: 10, color: "#c8d6e5", fontWeight: 700 }}>{m.name}</div><div style={{ fontSize: 7, color: "#1a2a3a", fontFamily: FM }}>{m.type} · Q{m.q}</div></div>
                    </div>
                  ))}
                  <button style={{ width: "100%", marginTop: 10, padding: 8, background: `linear-gradient(180deg, ${BLUE.pri}18, ${BLUE.pri}06)`, border: `1px solid ${BLUE.dim}`, color: BLUE.light, fontSize: 11, fontFamily: F, fontWeight: 800, cursor: "pointer", borderRadius: 3, letterSpacing: 2, textShadow: gw(BLUE.light, 0.2) }}>🚀 LAUNCH</button>
                </div>
              </div>
              <div style={{ borderTop: `1px solid ${EDGE}`, padding: "4px 16px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0, background: "rgba(4,8,16,0.4)", fontSize: 9 }}>
                <span style={{ color: "#1a2a3a", fontFamily: FM }}>DESIGN</span>
                <div style={{ background: "#071225", border: `1px solid ${EDGE}`, padding: "2px 10px", borderRadius: 2 }}>
                  <span style={{ color: "#8a9aaa", fontFamily: FM, fontSize: 9 }}>ISS Pioneer</span>
                </div>
                <span style={{ color: "#1a2a3a" }}>Click slot → assign module from cargo</span>
              </div>
            </DiagPanel>
          </div>
        </div>
      )}

      {/* ═══ HUD OVERLAY — speed/heading on game view ═══ */}
      {!overlay && (
        <div style={{ position: "absolute", bottom: 40, left: 56, fontSize: 9, fontFamily: FM, color: "#2a3a4a", background: "rgba(4,8,16,0.6)", padding: "3px 8px", borderRadius: 2, border: `1px solid ${EDGE}44`, zIndex: 5 }}>
          SPD <span style={{ color: docked ? "#1a2a3a" : BLUE.light }}>{docked?"0.0":"142.3"}</span> · HDG <span style={{ color: docked ? "#1a2a3a" : BLUE.light }}>247°</span>
        </div>
      )}
    </div>
  );
}
