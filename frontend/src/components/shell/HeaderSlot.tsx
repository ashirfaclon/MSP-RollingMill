'use client';

/**
 * A screen's own controls in the top bar (the user, 31 Oct 2026): the drive-group dropdown of HSM and
 * RMD Asset Health, in place of the "Selected asset" panel. The slot sits in the row of dropdowns, after
 * Mill and Rolling, before Duration (21 Nov 2026). Rendered through a portal; nothing until the slot is there.
 */
import { useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export const HEADER_SLOT_ID = 'tb-slot';

const noSubscribe = () => () => {};

export default function HeaderSlot({ children }: { children: ReactNode }) {
  const el = useSyncExternalStore(noSubscribe, () => document.getElementById(HEADER_SLOT_ID), () => null);
  return el ? createPortal(children, el) : null;
}
