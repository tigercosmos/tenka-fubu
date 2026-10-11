import { createContext, useContext } from 'react';

export const ViewportContext = createContext(false);
export function useViewportBlocked(): boolean {
  return useContext(ViewportContext);
}

/** plan/11 §3.16.2: CSS viewport pixels, independent of the player's UI scale. */
export function isViewportTooSmall(width: number, height: number): boolean {
  return width < 1280 || height < 720;
}
