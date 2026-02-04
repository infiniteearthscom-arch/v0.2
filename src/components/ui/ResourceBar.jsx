import React from 'react';
import { useResources } from '@/stores/gameStore';
import { RESOURCES } from '@/systems/gameData';

export const ResourceBar = () => {
  const resources = useResources();

  const displayResources = ['credits', 'metals', 'crystals', 'fuel', 'components'];

  const formatNumber = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 flex items-center gap-1 px-3 py-2 rounded-lg bg-slate-900/80 border border-cyan-500/20 backdrop-blur-sm z-40">
      {displayResources.map((resourceId, i) => {
        const resource = RESOURCES[resourceId];
        const value = resources[resourceId] || 0;
        
        return (
          <React.Fragment key={resourceId}>
            <div className="flex items-center gap-1.5 px-2 group relative">
              <span className="text-sm">{resource.icon}</span>
              <span className="text-xs text-slate-400 hidden sm:inline">{resource.name}</span>
              <span
                className="text-sm font-medium tabular-nums"
                style={{ color: resource.color }}
              >
                {formatNumber(value)}
              </span>
              
              {/* Tooltip */}
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 rounded bg-slate-800 border border-slate-600 text-xs text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                {resource.name}: {value.toLocaleString()}
              </div>
            </div>
            {i < displayResources.length - 1 && (
              <div className="w-px h-4 bg-slate-600/50" />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default ResourceBar;
