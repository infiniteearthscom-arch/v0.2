// CargoTooltipLayer — singleton render layer for the rich cargo hover
// tooltip, with a module-level show/hide API.
//
// WHY: the old pattern stored the hovered stack as React state on the
// window component (InventoryWindow / CraftingWindow's cargo panel),
// so every tile the pointer crossed re-rendered the ENTIRE cargo grid
// (~100 tiles in Inventory) just to move a tooltip. That render cost,
// stacked on top of the 60fps SystemView loop running behind the
// panel, is what made tooltips feel laggy.
//
// Now tiles call cargoTooltip.show()/hide() — plain function calls, no
// parent state — and only this tiny component re-renders. Mounted ONCE
// in GameFrame; surfaces that show tooltips should also call
// cargoTooltip.hide() in an unmount effect so a tooltip can't outlive
// its panel (mouseleave doesn't fire when the element is unmounted).

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CargoSlotTooltip } from './CargoSlotTooltip';

let emit = null;

export const cargoTooltip = {
  // payload: { stack, x, y, slotSize, resourceIcons }
  show(payload) { if (emit) emit(payload); },
  hide() { if (emit) emit(null); },
};

export const CargoTooltipLayer = () => {
  const [tip, setTip] = useState(null);
  useEffect(() => {
    emit = setTip;
    return () => { if (emit === setTip) emit = null; };
  }, []);
  if (!tip?.stack) return null;
  return createPortal(
    <CargoSlotTooltip
      stack={tip.stack}
      screenX={tip.x}
      screenY={tip.y}
      slotSize={tip.slotSize}
      resourceIcons={tip.resourceIcons}
    />,
    document.body
  );
};

export default CargoTooltipLayer;
