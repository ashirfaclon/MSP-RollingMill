'use client';

/**
 * The top bar's dropdown (Mill, Rolling). A custom listbox rather than a native <select>: the native
 * option popup is drawn by the OS and ignores the theme, so it rendered as a white system menu over
 * the control-room palette. Shares the duration picker's chrome (millpicker.css).
 *
 * Keyboard: ↑/↓ move, Home/End jump, Enter/Space choose, Escape or Tab close.
 */
import { useEffect, useId, useRef, useState } from 'react';
import './millpicker.css';

export interface PickerOption<T extends string> { id: T; text: string }

export default function Picker<T extends string>({ label, options, value, onChoose, title }: {
  /** The short name on the trigger and the list's heading ("Mill", "Rolling"). */
  label: string;
  options: readonly PickerOption<T>[];
  value: T;
  onChoose: (id: T) => void;
  /** The list's heading and the trigger's accessible name ("Rolling mill"). */
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();

  const current = Math.max(0, options.findIndex((o) => o.id === value));

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
    if (options[i].id !== value) onChoose(options[i].id);
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
    const last = options.length - 1;
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
        aria-label={`${title}: ${options[current].text}`}
        onClick={() => (open ? close() : openList())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); openList(); }
        }}
        title={title}
      >
        <span className="mp-k">{label}</span>
        <span className="mp-v">{options[current].text}</span>
        <svg className="mp-caret" width="9" height="9" viewBox="0 0 10 10" aria-hidden>
          <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="mp-pop">
          <div className="mp-head">{title}</div>
          <ul
            ref={list}
            id={`${id}-list`}
            className="mp-list"
            role="listbox"
            tabIndex={-1}
            aria-label={title}
            aria-activedescendant={`${id}-opt-${active}`}
            onKeyDown={onListKey}
          >
            {options.map((o, i) => {
              const selected = i === current;
              return (
                <li
                  key={o.id}
                  id={`${id}-opt-${i}`}
                  role="option"
                  aria-selected={selected}
                  className={`mp-opt${selected ? ' sel' : ''}${i === active ? ' act' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(i)}
                >
                  <span className="mp-code">{o.text}</span>
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
