'use client';

import { useId } from 'react';

/**
 * Iconography ported from pellet-frontend's CppIcon — drawn in one visual language: a
 * 32×32 field, a top-left light source, a shaded body and a rim highlight, so each icon
 * reads as a solid object at 26 px and takes its card's state colour rather than
 * fighting it.
 *
 * Deliberately not emoji. The pellet top bar uses them for tabs, but a KPI card icon
 * has to inherit the value's status colour and stay legible on both a navy and a paper
 * ground — an emoji does neither, and renders differently on every OS.
 */
export type IconId =
  | 'gauge' | 'bolt' | 'bars' | 'flame' | 'fan' | 'shield-check' | 'steam'
  | 'shield-alert' | 'warn-triangle' | 'gear' | 'database' | 'turbine' | 'boiler'
  | 'thermometer' | 'vacuum' | 'o2' | 'trend' | 'stopwatch' | 'clipboard' | 'expand';

export default function Icon({ id, size = 26, color = '#8fabc8' }: {
  id: IconId; size?: number; color?: string;
}) {
  /*
   * Gradient ids are per INSTANCE, not per icon kind. They were `cppi-${id}` in the source, so two
   * gauges on one page — a KPI card and a parameter row, drawn in different colours —
   * shared one <linearGradient>, and whichever rendered first painted both. SVG ids are
   * document-global; only a unique id keeps an icon's colour its own.
   */
  const gid = `rmi-${id}-${useId().replace(/:/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="rm-ico-svg">
      <defs>
        <linearGradient id={`${gid}-body`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.95" />
          <stop offset="55%" stopColor={color} stopOpacity="0.55" />
          <stop offset="100%" stopColor={color} stopOpacity="0.28" />
        </linearGradient>
        <radialGradient id={`${gid}-spec`} cx="32%" cy="26%" r="62%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {id === 'expand' && (
        // Four corners pushed outward — a frame opening up, not a new window
        <g fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 5H5v8" />
          <path d="M19 5h8v8" />
          <path d="M13 27H5v-8" />
          <path d="M19 27h8v-8" />
          <path d="M5 5l7 7M27 5l-7 7M5 27l7-7M27 27l-7-7" opacity="0.5" strokeWidth="2" />
        </g>
      )}

      {id === 'gauge' && (
        // Dial arc with a needle — gross output against a scale
        <g>
          <path d="M4.5 23a11.5 11.5 0 0 1 23 0" fill="none" stroke={`url(#${gid}-body)`} strokeWidth="4" strokeLinecap="round" />
          <path d="M4.5 23a11.5 11.5 0 0 1 6.2-10.2" fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" opacity="0.95" />
          <path d="M16 23 L21.6 14.6" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="16" cy="23" r="2.6" fill={color} />
          <circle cx="16" cy="23" r="1" fill="#ffffff" opacity="0.7" />
        </g>
      )}

      {id === 'bolt' && (
        <g>
          <path d="M18.2 3 L8 18h6.2L13.4 29 24 13.6h-6.4Z" fill={`url(#${gid}-body)`} />
          <path d="M18.2 3 L8 18h6.2l1.4-2Z" fill={`url(#${gid}-spec)`} />
          <path d="M18.2 3 L8 18h6.2L13.4 29 24 13.6h-6.4Z" fill="none" stroke={color} strokeWidth="1.1" strokeLinejoin="round" opacity="0.85" />
        </g>
      )}

      {id === 'bars' && (
        // Load factor — columns against a plinth
        <g>
          <rect x="4" y="24.5" width="24" height="3.4" rx="1.4" fill={`url(#${gid}-body)`} />
          {[[6.5, 15], [12, 10], [17.5, 13], [23, 7]].map(([x, y], i) => (
            <rect key={i} x={x} y={y} width="4.4" height={24.5 - y} rx="1.3" fill={color} opacity={0.45 + i * 0.14} />
          ))}
          <rect x="23" y="7" width="4.4" height="2.4" rx="1.2" fill={`url(#${gid}-spec)`} />
        </g>
      )}

      {id === 'flame' && (
        <g>
          <path d="M16 3c4.4 5 7.8 8.2 7.8 13.2A7.8 7.8 0 0 1 16 24a7.8 7.8 0 0 1-7.8-7.8C8.2 11.2 11.6 8 16 3Z" fill={`url(#${gid}-body)`} />
          <path d="M16 12.5c2.2 2.6 3.6 4.2 3.6 6.4A3.6 3.6 0 0 1 16 22.5a3.6 3.6 0 0 1-3.6-3.6c0-2.2 1.4-3.8 3.6-6.4Z" fill={color} opacity="0.85" />
          <path d="M16 3c2.2 2.5 4 4.4 5.2 6.2-1.6-.9-3.4-1.4-5.2-1.4Z" fill={`url(#${gid}-spec)`} />
          <rect x="9" y="26" width="14" height="2.6" rx="1.3" fill={color} opacity="0.35" />
        </g>
      )}

      {id === 'fan' && (
        // Three-blade impeller — auxiliary drives
        <g>
          {[0, 120, 240].map((a) => (
            <path key={a} d="M16 15.2c0-4 .7-7 2.6-9 2.6 1.2 3.6 4 2.6 7.2-.7 2.2-2.4 3.6-5.2 4.4Z"
                  fill={`url(#${gid}-body)`} transform={`rotate(${a} 16 16)`} />
          ))}
          <circle cx="16" cy="16" r="3.4" fill={color} />
          <circle cx="15.1" cy="15.1" r="1.2" fill="#ffffff" opacity="0.6" />
        </g>
      )}

      {id === 'shield-check' && (
        <g>
          <path d="M16 3.5 L27 7.5v9c0 6-4.6 9.8-11 11.2-6.4-1.4-11-5.2-11-11.2v-9Z" fill={`url(#${gid}-body)`} />
          <path d="M16 3.5 L27 7.5v3.4c-4-2-7.6-3-11-3s-7 1-11 3V7.5Z" fill={`url(#${gid}-spec)`} />
          <path d="M11 16.2 l3.7 3.7 L22 12.4" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}

      {id === 'shield-alert' && (
        <g>
          <path d="M16 3.5 L27 7.5v9c0 6-4.6 9.8-11 11.2-6.4-1.4-11-5.2-11-11.2v-9Z" fill={`url(#${gid}-body)`} />
          <path d="M16 3.5 L27 7.5v3.4c-4-2-7.6-3-11-3s-7 1-11 3V7.5Z" fill={`url(#${gid}-spec)`} />
          <rect x="14.6" y="10.5" width="2.8" height="8" rx="1.4" fill={color} />
          <circle cx="16" cy="21.6" r="1.7" fill={color} />
        </g>
      )}

      {id === 'warn-triangle' && (
        <g>
          <path d="M16 4.2 L28.5 26H3.5Z" fill={`url(#${gid}-body)`} />
          <path d="M16 4.2 L21.8 14.3c-1.8-.8-3.8-1.2-5.8-1.2s-4 .4-5.8 1.2Z" fill={`url(#${gid}-spec)`} />
          <rect x="14.6" y="12" width="2.8" height="7.6" rx="1.4" fill={color} />
          <circle cx="16" cy="22.6" r="1.7" fill={color} />
        </g>
      )}

      {id === 'gear' && (
        <g>
          {[0, 45, 90, 135].map((a) => (
            <rect key={a} x="14.3" y="3.4" width="3.4" height="25.2" rx="1.5"
                  fill={`url(#${gid}-body)`} transform={`rotate(${a} 16 16)`} />
          ))}
          <circle cx="16" cy="16" r="8.4" fill={color} opacity="0.9" />
          <circle cx="16" cy="16" r="3.5" fill="#ffffff" opacity="0.28" />
          <circle cx="13.4" cy="13.4" r="1.6" fill="#ffffff" opacity="0.4" />
        </g>
      )}

      {id === 'database' && (
        // Stacked discs — the asset register
        <g>
          {[20.5, 15, 9.5].map((y, i) => (
            <g key={y}>
              <rect x="6" y={y} width="20" height="6.2" rx="3.1" fill={color} opacity={0.32 + i * 0.22} />
              <ellipse cx="16" cy={y} rx="10" ry="3.1" fill={`url(#${gid}-body)`} />
            </g>
          ))}
          <ellipse cx="13" cy="8.6" rx="4" ry="1.2" fill={`url(#${gid}-spec)`} />
        </g>
      )}

      {id === 'steam' && (
        // Rising vapour over a header — steam generation
        <g>
          <rect x="5" y="23.5" width="22" height="3.6" rx="1.8" fill={`url(#${gid}-body)`} />
          {[9.5, 16, 22.5].map((x, i) => (
            <path key={x} d={`M${x} 20.5c-2.6-2.4 2.6-4.2 0-6.6 -2.6-2.4 2.6-4.2 0-6.6`}
                  fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" opacity={0.55 + i * 0.15} />
          ))}
        </g>
      )}

      {id === 'turbine' && (
        // Rotor on a bedplate
        <g>
          <rect x="4" y="24" width="24" height="3.6" rx="1.8" fill={`url(#${gid}-body)`} />
          {[0, 60, 120].map((a) => (
            <ellipse key={a} cx="16" cy="15" rx="10.5" ry="3.2" fill={color} opacity="0.42"
                     transform={`rotate(${a} 16 15)`} />
          ))}
          <circle cx="16" cy="15" r="3.4" fill={color} />
          <circle cx="15" cy="14" r="1.2" fill="#ffffff" opacity="0.6" />
        </g>
      )}

      {id === 'thermometer' && (
        // Stem and bulb, with a scale — any temperature reading
        <g>
          <rect x="12.4" y="3.5" width="7.2" height="18.5" rx="3.6" fill={`url(#${gid}-body)`} />
          <circle cx="16" cy="23.6" r="5.6" fill={`url(#${gid}-body)`} />
          <rect x="14.8" y="9.5" width="2.4" height="14" rx="1.2" fill={color} />
          <circle cx="16" cy="23.6" r="3.4" fill={color} />
          <circle cx="14.7" cy="22.3" r="1" fill="#ffffff" opacity="0.6" />
          {[7.5, 11.5, 15.5].map((y) => (
            <rect key={y} x="21.6" y={y} width="4.2" height="1.6" rx="0.8" fill={color} opacity="0.5" />
          ))}
        </g>
      )}

      {id === 'vacuum' && (
        // A pulse inside a ring — condenser vacuum, a pressure below atmosphere
        <g>
          <circle cx="16" cy="16" r="12" fill={`url(#${gid}-body)`} opacity="0.5" />
          <circle cx="16" cy="16" r="12" fill="none" stroke={color} strokeWidth="1.6" opacity="0.8" />
          <path d="M5.5 16h4.8l2.5-5.6 4.3 11.2 2.6-5.6h6.8" fill="none" stroke={color}
                strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}

      {id === 'o2' && (
        // The formula in a ring — flue-gas oxygen
        <g>
          <circle cx="16" cy="16" r="12" fill={`url(#${gid}-body)`} opacity="0.5" />
          <circle cx="16" cy="16" r="12" fill="none" stroke={color} strokeWidth="1.6" opacity="0.8" />
          <text x="14.2" y="20.4" textAnchor="middle" fontSize="11.5" fontWeight="800" fill={color}
                fontFamily="Inter, system-ui, sans-serif">O</text>
          <text x="21.2" y="22.8" textAnchor="middle" fontSize="7" fontWeight="800" fill={color}
                fontFamily="Inter, system-ui, sans-serif">2</text>
        </g>
      )}

      {id === 'trend' && (
        // A line rising across axes — a quantity drawn over time
        <g>
          <path d="M4.5 27.5h23.5" stroke={`url(#${gid}-body)`} strokeWidth="2.6" strokeLinecap="round" />
          <path d="M4.5 4.5v23" stroke={`url(#${gid}-body)`} strokeWidth="2.6" strokeLinecap="round" />
          <path d="M8.5 21.5l5.8-7 4.6 4 8.1-10" fill="none" stroke={color}
                strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="27" cy="8.5" r="2" fill={color} />
        </g>
      )}

      {id === 'stopwatch' && (
        // Stopwatch — time to repair: a dial with crown and lap button, hand past twelve
        <g>
          <rect x="13.6" y="2.4" width="4.8" height="2.8" rx="1.2" fill={color} />
          <rect x="15" y="4.6" width="2" height="3" fill={color} opacity="0.8" />
          <rect x="23.2" y="6.6" width="3.4" height="2.4" rx="1" fill={color} opacity="0.75" transform="rotate(45 24.9 7.8)" />
          <circle cx="16" cy="18" r="11" fill={`url(#${gid}-body)`} />
          <circle cx="16" cy="18" r="11" fill={`url(#${gid}-spec)`} />
          <circle cx="16" cy="18" r="11" fill="none" stroke={color} strokeWidth="1.3" opacity="0.9" />
          {[0, 90, 180, 270].map((a) => (
            <rect key={a} x="15.3" y="8.6" width="1.4" height="2.4" rx="0.7" fill={color} opacity="0.85"
                  transform={`rotate(${a} 16 18)`} />
          ))}
          <path d="M16 18 L20.6 12.2" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" opacity="0.92" />
          <circle cx="16" cy="18" r="2" fill="#ffffff" opacity="0.95" />
        </g>
      )}

      {id === 'clipboard' && (
        // Clipboard with a checklist — open work orders: two items done, one to do
        <g>
          <rect x="6" y="5" width="20" height="24.5" rx="3" fill={`url(#${gid}-body)`} />
          <rect x="6" y="5" width="20" height="9" rx="3" fill={`url(#${gid}-spec)`} />
          <rect x="6" y="5" width="20" height="24.5" rx="3" fill="none" stroke={color} strokeWidth="1.2" opacity="0.8" />
          <rect x="11" y="2.6" width="10" height="5" rx="1.8" fill={color} />
          <rect x="13.6" y="3.9" width="4.8" height="1.4" rx="0.7" fill="#ffffff" opacity="0.55" />
          {[12.8, 18.2].map((y) => (
            <g key={y}>
              <path d={`M9.6 ${y} l1.6 1.6 l2.9 -3.1`} fill="none" stroke="#ffffff" strokeWidth="1.8"
                    strokeLinecap="round" strokeLinejoin="round" opacity="0.95" />
              <rect x="15.6" y={y - 0.9} width="7" height="1.9" rx="0.95" fill="#ffffff" opacity="0.7" />
            </g>
          ))}
          <rect x="9.7" y="21.9" width="3.8" height="3.8" rx="0.9" fill="none" stroke="#ffffff" strokeWidth="1.4" opacity="0.9" />
          <rect x="15.6" y="22.9" width="5" height="1.9" rx="0.95" fill="#ffffff" opacity="0.5" />
        </g>
      )}

      {id === 'boiler' && (
        // Drum with a stack and fire below
        <g>
          <rect x="7" y="9" width="18" height="14" rx="4" fill={`url(#${gid}-body)`} />
          <rect x="7" y="9" width="18" height="4.5" rx="2.2" fill={`url(#${gid}-spec)`} />
          <rect x="19.5" y="3.5" width="4" height="6" rx="1.4" fill={color} opacity="0.7" />
          <path d="M16 25.5c1.7 1.7 2.6 2.8 2.6 4 0 1.4-1.2 2.5-2.6 2.5s-2.6-1.1-2.6-2.5c0-1.2.9-2.3 2.6-4Z" fill={color} opacity="0.8" />
        </g>
      )}
    </svg>
  );
}
