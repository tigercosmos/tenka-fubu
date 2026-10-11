import type { ComponentProps, ReactElement } from 'react';
import { useStore } from 'zustand';
import { store } from '@app/store';
import { useUIStore } from '../hooks/uiStore';
import { SystemMenu } from './SystemMenu';

export type SystemMenuHostProps = ComponentProps<typeof SystemMenu>;
const owners = new WeakMap<object, number>();
let nextOwner = 0;
function ownerKey(value: object | null): number {
  if (value === null) return 0;
  let key = owners.get(value);
  if (key === undefined) {
    key = ++nextOwner;
    owners.set(value, key);
  }
  return key;
}

/** Screen-independent host; the existing modal FIFO owns visibility and pause policy. */
export function SystemMenuHost(props: SystemMenuHostProps): ReactElement | null {
  const modal = useUIStore((state) => state.modal);
  const game = useStore(store, (state) => state.game);
  const screen = useStore(store, (state) => state.session.screen);
  return modal?.id === 'systemMenu' ? (
    <SystemMenu
      key={`${ownerKey(game)}:${ownerKey(modal)}:${screen}:${JSON.stringify(modal)}`}
      {...props}
    />
  ) : null;
}
