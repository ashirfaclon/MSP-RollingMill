'use client';

/**
 * Mill switch. A custom listbox rather than a native <select>: the native option popup is
 * drawn by the OS and ignores the theme, so it rendered as a white system menu over the
 * control-room palette. This one shares the duration picker's chrome.
 *
 * Keyboard: ↑/↓ move, Home/End jump, Enter/Space choose, Escape or Tab close.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MILLS, millOf, pathFor, type MillId, type ScreenId } from '@/config/navigation';
import './millpicker.css';

export default function MillPicker({ mill, screen }: { mill: MillId; screen: ScreenId }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();

  const current = MILLS.findIndex((m) => m.id === mill);

  const openList = () => {
    setActive(current);
    setOpen(true);
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };
  const choose = (i: number) => {
    close();
    const next = MILLS[i].id;
    if (next !== mill) router.push(pathFor(next, screen));
  };

  // Focus the list when it opens, so the keyboard drives it straight away.
  useEffect(() => { if (open) list.current?.focus(); }, [open]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const onListKey = (e: React.KeyboardEvent) => {
    const last = MILLS.length - 1;
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setActive((a) => Math.min(last, a + 1)); break;
      case 'ArrowUp': e.preventDefault(); setActive((a) => Math.max(0, a - 1)); break;
      case 'Home': e.preventDefault(); setActive(0); break;
      case 'End': e.preventDefault(); setActive(last); break;
      case 'Enter': case ' ': e.preventDefault(); choose(active); break;
      case 'Escape': e.preventDefault(); close(); break;
      case 'Tab': close(false); break;
    }
  };

  return (
    <div className="mp" ref={box}>
      <button
        ref={trigger}
        type="button"
        className={`mp-trigger${open ? ' on' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-label={`Rolling mill: ${millOf(mill).code}`}
        onClick={() => (open ? close() : openList())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); openList(); }
        }}
        title="Rolling mill"
      >
        <span className="mp-k">Mill</span>
        <span className="mp-v">{millOf(mill).code}</span>
        <svg className="mp-caret" width="9" height="9" viewBox="0 0 10 10" aria-hidden>
          <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="mp-pop">
          <div className="mp-head">Rolling mill</div>
          <ul
            ref={list}
            id={`${id}-list`}
            className="mp-list"
            role="listbox"
            tabIndex={-1}
            aria-label="Rolling mill"
            aria-activedescendant={`${id}-opt-${active}`}
            onKeyDown={onListKey}
          >
            {MILLS.map((m, i) => {
              const selected = i === current;
              return (
                <li
                  key={m.id}
                  id={`${id}-opt-${i}`}
                  role="option"
                  aria-selected={selected}
                  className={`mp-opt${selected ? ' sel' : ''}${i === active ? ' act' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(i)}
                >
                  <span className="mp-code">{m.code}</span>
                  {selected && (
                    <svg className="mp-check" width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                      <path d="M2.5 6.2 5 8.6 9.6 3.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
