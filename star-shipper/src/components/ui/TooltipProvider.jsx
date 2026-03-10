import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

// ============================================
// TOOLTIP CONTEXT
// ============================================

const TooltipContext = createContext(null);

// ============================================
// TOOLTIP PROVIDER
// Renders a single floating tooltip div that follows the mouse.
// Any component in the tree can call showTooltip / hideTooltip.
// ============================================

export const TooltipProvider = ({ children }) => {
  const [tooltip, setTooltip] = useState(null); // { content: ReactNode, x, y }
  const mousePos = useRef({ x: 0, y: 0 });
  const tooltipRef = useRef(null);

  // Track mouse position globally so we always know where to render
  useEffect(() => {
    const onMove = (e) => {
      mousePos.current = { x: e.clientX, y: e.clientY };
      if (tooltip) {
        setTooltip(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
      }
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [tooltip]);

  const showTooltip = useCallback((content) => {
    setTooltip({ content, x: mousePos.current.x, y: mousePos.current.y });
  }, []);

  const hideTooltip = useCallback(() => {
    setTooltip(null);
  }, []);

  // Compute position: keep tooltip within viewport, prefer top-right of cursor
  let tx = 0, ty = 0;
  if (tooltip && tooltipRef.current) {
    const OFFSET = 14;
    const { width, height } = tooltipRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    tx = tooltip.x + OFFSET;
    ty = tooltip.y + OFFSET;

    // Flip left if overflowing right
    if (tx + width > vw - 8) tx = tooltip.x - width - OFFSET;
    // Flip up if overflowing bottom
    if (ty + height > vh - 8) ty = tooltip.y - height - OFFSET;
    // Clamp
    tx = Math.max(8, tx);
    ty = Math.max(8, ty);
  } else if (tooltip) {
    // First render before we have dimensions — use raw mouse pos offset
    tx = tooltip.x + 14;
    ty = tooltip.y + 14;
  }

  return (
    <TooltipContext.Provider value={{ showTooltip, hideTooltip }}>
      {children}
      {tooltip && (
        <div
          ref={tooltipRef}
          className="fixed z-[9999] pointer-events-none"
          style={{ left: tx, top: ty }}
        >
          <div
            className="rounded-lg border text-xs shadow-xl backdrop-blur-sm"
            style={{
              background: 'rgba(10, 15, 28, 0.97)',
              borderColor: 'rgba(100, 180, 255, 0.2)',
              maxWidth: 280,
              minWidth: 160,
            }}
          >
            {tooltip.content}
          </div>
        </div>
      )}
    </TooltipContext.Provider>
  );
};

// ============================================
// HOOK
// ============================================

export const useTooltip = () => {
  const ctx = useContext(TooltipContext);
  if (!ctx) throw new Error('useTooltip must be used inside TooltipProvider');
  return ctx;
};
