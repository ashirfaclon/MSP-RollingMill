'use client';

/**
 * A screen's own controls in the top bar, between the page title and the Mill switch (the user,
 * 31 Oct 2026): the drive-group switch of HSM and RMD Asset Health, in place of the "Selected asset"
 * panel. Rendered into the top bar's slot through a portal; nothing until the slot is there.
 */
import { useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export const HEADER_SLOT_ID = 'tb-slot';

const noSubscribe = () => () => {};

export default function HeaderSlot({ children }: { children: ReactNode }) {
  const el = useSyncExternalStore(noSubscribe, () => document.getElementById(HEADER_SLOT_ID), () => null);
  return el ? createPortal(children, el) : null;
}
