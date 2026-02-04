import React, { useState, useEffect, useRef } from 'react';
import { useGameStore } from '@/stores/gameStore';

export const DraggableWindow = ({
  windowId,
  title,
  children,
  initialWidth = 400,
  initialHeight = 300,
  minWidth = 200,
  minHeight = 150,
  resizable = true,
}) => {
  const windows = useGameStore(state => state.windows);
  const windowZIndex = useGameStore(state => state.windowZIndex);
  const closeWindow = useGameStore(state => state.closeWindow);
  const minimizeWindow = useGameStore(state => state.minimizeWindow);
  const bringToFront = useGameStore(state => state.bringToFront);
  const updateWindowPosition = useGameStore(state => state.updateWindowPosition);

  const windowState = windows[windowId];
  const zIndex = windowZIndex[windowId] || 1;

  const [position, setPosition] = useState({ x: windowState?.x || 100, y: windowState?.y || 100 });
  const [size, setSize] = useState({ width: initialWidth, height: initialHeight });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const windowRef = useRef(null);

  // Sync position with store
  useEffect(() => {
    if (windowState) {
      setPosition({ x: windowState.x || 100, y: windowState.y || 100 });
    }
  }, [windowState?.x, windowState?.y]);

  const handleMouseDown = (e) => {
    if (e.target.closest('.window-controls')) return;
    bringToFront(windowId);
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  const handleResizeMouseDown = (e) => {
    e.stopPropagation();
    bringToFront(windowId);
    setIsResizing(true);
    setDragOffset({
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height,
    });
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isDragging) {
        const newX = Math.max(0, e.clientX - dragOffset.x);
        const newY = Math.max(0, e.clientY - dragOffset.y);
        setPosition({ x: newX, y: newY });
      }
      if (isResizing) {
        setSize({
          width: Math.max(minWidth, dragOffset.width + (e.clientX - dragOffset.x)),
          height: Math.max(minHeight, dragOffset.height + (e.clientY - dragOffset.y)),
        });
      }
    };

    const handleMouseUp = () => {
      if (isDragging) {
        updateWindowPosition(windowId, position.x, position.y);
      }
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, dragOffset, minWidth, minHeight, position, windowId, updateWindowPosition]);

  if (!windowState?.open || windowState?.minimized) return null;

  return (
    <div
      ref={windowRef}
      className="absolute pointer-events-auto"
      style={{
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
        zIndex,
      }}
      onClick={() => bringToFront(windowId)}
    >
      <div
        className="h-full flex flex-col rounded-lg overflow-hidden border border-cyan-500/30 shadow-2xl shadow-cyan-500/20"
        style={{
          background: 'linear-gradient(180deg, rgba(10,25,40,0.95) 0%, rgba(5,15,30,0.98) 100%)',
        }}
      >
        {/* Title bar */}
        <div
          className="flex items-center justify-between px-3 py-2 cursor-move select-none border-b border-cyan-500/20"
          onMouseDown={handleMouseDown}
          style={{
            background: 'linear-gradient(90deg, rgba(0,180,220,0.15) 0%, rgba(0,100,150,0.1) 100%)',
          }}
        >
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-lg shadow-cyan-400/50" />
            <span className="text-cyan-100 text-sm font-medium tracking-wide">{title}</span>
          </div>
          <div className="window-controls flex items-center gap-1">
            <button
              onClick={() => minimizeWindow(windowId)}
              className="w-6 h-6 rounded flex items-center justify-center text-cyan-400/60 hover:text-cyan-300 hover:bg-cyan-500/20 transition-colors"
            >
              <svg width="10" height="2" viewBox="0 0 10 2" fill="currentColor">
                <rect width="10" height="2" rx="1" />
              </svg>
            </button>
            <button
              onClick={() => closeWindow(windowId)}
              className="w-6 h-6 rounded flex items-center justify-center text-cyan-400/60 hover:text-red-400 hover:bg-red-500/20 transition-colors"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M1 1l8 8M9 1l-8 8" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-3">{children}</div>

        {/* Resize handle */}
        {resizable && (
          <div
            className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
            onMouseDown={handleResizeMouseDown}
          >
            <svg className="w-full h-full text-cyan-500/40" viewBox="0 0 16 16" fill="currentColor">
              <path d="M14 16V14H16V16H14ZM10 16V14H12V16H10ZM14 12V10H16V12H14Z" />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
};

// Window dock for minimized windows
export const WindowDock = () => {
  const windows = useGameStore(state => state.windows);
  const restoreWindow = useGameStore(state => state.restoreWindow);

  const minimizedWindows = Object.entries(windows)
    .filter(([_, state]) => state.open && state.minimized)
    .map(([id, state]) => ({ id, ...state }));

  if (minimizedWindows.length === 0) return null;

  const getWindowTitle = (id) => {
    const titles = {
      shipBuilder: 'Ship Builder',
      fleetManager: 'Fleet Manager',
      planetView: 'Planet View',
      inventory: 'Inventory',
      research: 'Research',
    };
    return titles[id] || id;
  };

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 px-3 py-2 rounded-lg bg-slate-900/80 border border-cyan-500/20 backdrop-blur-sm z-50">
      {minimizedWindows.map(win => (
        <button
          key={win.id}
          onClick={() => restoreWindow(win.id)}
          className="flex items-center gap-2 px-3 py-1.5 rounded bg-cyan-500/20 border border-cyan-400/30 text-cyan-300 text-sm hover:bg-cyan-500/30 transition-colors"
        >
          <div className="w-2 h-2 rounded-full bg-cyan-400" />
          {getWindowTitle(win.id)}
        </button>
      ))}
    </div>
  );
};

export default DraggableWindow;
