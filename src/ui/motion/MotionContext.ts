import { createContext, useContext } from 'react';

/** OS preference only; map effects are independently controlled by the map presenter. */
export const MotionContext = createContext(false);
export function useReducedMotion(): boolean {
  return useContext(MotionContext);
}
