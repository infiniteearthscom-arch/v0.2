import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react';

// ============================================
// TOOLTIP CONTEXT
// ============================================
//
// A single floating tooltip div that follows the mouse. Any component in
// the tree can call showTooltip(content) / hideTooltip() via useTooltip().
//
// PERFORMANCE NOTE (important):
// An earlier version of this provider called setTooltip() on every
// mousemove so React would re-render with the new position. That caused
// the entire subtree (i.e. the whole game UI) to re-render 60+ times per
// second whenever a tooltip was visible — which made hovers feel sluggish
// in dense screens like the Ship Designer (canvas + multiple panels).
//
// The current implementation instead:
//   1. Stores mouse position in a ref (no re-render).
//   2. Writes the tooltip DOM node's transform directly on mousemove via
//      requestAnimationFrame batching (still no React re-render).
//   3. React state (`visible`, `content`) only flips when show/hide is
//      called — i.e. once per hover, not per mouse pixel.
//
// The tooltip div itself is always mounted (display:none when hidden) so
// we don't pay mount/unmount cost per hover either.
// ============================================

const TooltipContext = createContext(null);

export const TooltipProvider = ({ children }) => {
  // Whether a tooltip is currently shown. The only state that causes a
  // React re-render here.
  const [state, setState] = useState({ visible: false, content: null });

  // Live cursor position — never stored in React state.
  const mousePos = useRef({ x: 0, y: 0 });
  // Ref to the floating tooltip div so we can set its transform directly.
  const tooltipRef = useRef(null);
  // rAF handle for throttling position updates to the display refresh rate.
  const rafRef = useRef(0);

  // Imperative function that writes the tooltip's position to the DOM.
  // Called from both the mousemove listener (during hover) and right after
  // show (to position at the first-paint cursor location).
  const placeTooltip = useCallback(() => {
    const node = tooltipRef.current;
    if (!node) return;
    const OFFSET = 14;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Use the node's own measured size — it may vary with content length.
    const w = node.offsetWidth  || 0;
    const h = node.offsetHeight || 0;
    let tx = mousePos.current.x + OFFSET;
    let ty = mousePos.current.y + OFFSET;
    if (tx + w > vw - 8) tx = mousePos.current.x - w - OFFSET;
    if (ty + h > vh - 8) ty = mousePos.current.y - h - OFFSET;
    tx = Math.max(8, tx);
    ty = Math.max(8, ty);
    // transform is on the compositor thread — much cheaper than left/top.
    node.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
  }, []);

  // Global mousemove → update mousePos ref and schedule an rAF to reposition
  // the tooltip DOM node. No React re-render happens here.
  useEffect(() => {
    const onMove = (e) => {
      mousePos.current.x = e.clientX;
      mousePos.current.y = e.clientY;
      if (!state.visible) return;
      if (rafRef.current) return; // already scheduled
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        placeTooltip();
      });
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [state.visible, placeTooltip]);

  // After a show (or content swap), immediately place the tooltip at the
  // current mouse position rather than waiting for the next mousemove —
  // this is what makes the tooltip feel "instant" rather than "arriving".
  useLayoutEffect(() => {
    if (state.visible) placeTooltip();
  }, [state.visible, state.content, placeTooltip]);

  const showTooltip = useCallback((content) => {
    setState({ visible: true, content });
  }, []);

  const hideTooltip = useCallback(() => {
    setState(prev => prev.visible ? { visible: false, content: null } : prev);
  }, []);

  // Memoize the context value. CRITICAL: a fresh `{ showTooltip, hideTooltip }`
  // object on every render forces every consumer of useTooltip() — i.e. every
  // ItemCell in the entire game — to re-render whenever the tooltip itself
  // changes visibility. Stable identity here means hover state changes only
  // re-render this provider, not all its consumers.
  const ctxValue = useRef(null);
  if (!ctxValue.current) ctxValue.current = { showTooltip, hideTooltip };

  return (
    <TooltipContext.Provider value={ctxValue.current}>
      {children}
      {/* Always mounted. Visibility toggled via display so we skip the
          mount/unmount cost per hover. Initial transform places it offscreen
          until placeTooltip runs. */}
      <div
        ref={tooltipRef}
        className="fixed top-0 left-0 z-[9999] pointer-events-none"
        style={{
          transform: 'translate3d(-9999px, -9999px, 0)',
          display: state.visible ? 'block' : 'none',
          willChange: 'transform',
        }}
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
          {state.content}
        </div>
      </div>
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
