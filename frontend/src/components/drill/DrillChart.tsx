'use client';

/**
 * The drill-down chart. Highcharts, per the design system's chart layer: colours come from
 * the theme tokens at draw time (and redraw on a theme flip), the tooltip renders outside
 * the chart so the drawer cannot clip it, and there is NO exporting module — nothing is
 * ever posted to an external export server.
 *
 * The legend is ours, not Highcharts': toggle buttons (click or keyboard) that hide/show a
 * series, and highlight it on hover/focus. Visibility lives in React state keyed by series
 * id, so it survives a grain or range change that rebuilds the chart.
 *
 * A missing value is a gap, never a zero.
 */
import { useEffect, useRef, useState } from 'react';
import type { Chart, Options, Series, SeriesOptionsType } from 'highcharts';
import { useGlobalSel } from '@/state/globalSel';

const tok = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';

export const fmtNum = (v: number | null | undefined, dp = 1) =>
  v === null || v === undefined ? '—' : v.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });

export interface DrillSeries {
  id: string;
  name: string;
  /** Theme colour token, e.g. '--s-prod'. */
  token: string;
  type: 'line' | 'column';
  dashed?: boolean;
  /** Index into `axes`. */
  axis?: number;
  /** Columns with the same stack id stack on each other. */
  stack?: string;
  /** Per category, or [epoch ms, value] on a time axis. */
  data: (number | null)[] | [number, number | null][];
  /** Decimal places in the tooltip. */
  dp?: number;
}

export interface DrillAxis {
  title: string; unit: string; opposite?: boolean; min?: number; max?: number;
  /** A labelled reference line, e.g. 100 % on a yield axis. */
  line?: { value: number; label: string };
}

const TIME = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });

function options(p: {
  series: DrillSeries[];
  categories?: string[];
  axes: DrillAxis[];
  tooltip?: (index: number, visible: Set<string>) => string;
  hidden: Set<string>;
  horizontal?: boolean;
}): Options {
  const text = tok('--text');
  const muted = tok('--muted-2');
  const grid = tok('--border-soft');
  const time = !p.categories;
  return {
    chart: {
      backgroundColor: 'transparent', spacing: [12, 8, 8, 4], inverted: p.horizontal,
      style: { fontFamily: 'inherit' }, animation: { duration: 260 },
      // Set only when wanted — an explicit undefined replaces Highcharts' default object.
      ...(time ? { zooming: { type: 'x' as const } } : {}),
    },
    time: { timezone: 'Asia/Kolkata' },
    title: { text: undefined },
    credits: { enabled: false },
    accessibility: { enabled: false },
    legend: { enabled: false },
    xAxis: {
      type: time ? 'datetime' : 'category',
      categories: p.categories, lineColor: grid, tickColor: grid,
      dateTimeLabelFormats: { minute: '%H:%M', hour: '%H:%M', day: '%e %b' },
      // Tick times are IST (the chart is in plant time); said once, under the axis.
      title: time ? { text: 'IST', style: { color: muted, fontSize: '10px' } } : undefined,
      labels: { style: { color: muted, fontSize: '10.5px' } },
    },
    yAxis: p.axes.map((a, i) => ({
      title: { text: a.title, style: { color: muted, fontSize: '10.5px' } },
      opposite: a.opposite, min: a.min, max: a.max,
      gridLineColor: i === 0 ? grid : 'transparent',
      labels: { style: { color: muted, fontSize: '10.5px' } },
      plotLines: [
        ...(i === 0 ? [{ value: 0, color: tok('--border-hi'), width: 1, zIndex: 2 }] : []),
        ...(a.line ? [{
          value: a.line.value, color: tok('--risk'), width: 1.5, dashStyle: 'Dash' as const, zIndex: 3,
          label: { text: a.line.label, align: 'left' as const, x: 4, y: -5, style: { color: tok('--risk'), fontSize: '10px', fontWeight: '700' } },
        }] : []),
      ],
    })),
    tooltip: {
      shared: true, outside: true, useHTML: true,
      backgroundColor: tok('--panel'), borderColor: tok('--border-hi'), style: { color: text },
      formatter() {
        const pts = this.points ?? [];
        // Shared tooltips only carry the visible series' points — those are the ones to describe.
        if (p.tooltip && !time) return p.tooltip(pts[0]?.index ?? 0, new Set(pts.map((pt) => String(pt.series.options.id))));
        const head = time ? `${TIME.format(new Date(Number(this.x)))} IST` : String(p.categories?.[pts[0]?.index ?? 0] ?? '');
        return `<b>${head}</b><br/>` + pts.map((pt) => {
          const s = p.series.find((x) => x.id === pt.series.options.id);
          const unit = p.axes[s?.axis ?? 0]?.unit ?? '';
          return `<span style="color:${pt.color}">●</span> ${pt.series.name}: <b>${fmtNum(pt.y, s?.dp ?? 1)}${unit ? ` ${unit}` : ''}</b>`;
        }).join('<br/>');
      },
    },
    plotOptions: {
      series: {
        connectNulls: false, lineWidth: 2,
        marker: { enabled: !time, radius: 3, symbol: 'circle' },
        states: { inactive: { opacity: 0.25 } },
      },
      column: { stacking: p.series.some((s) => s.stack) ? 'normal' : undefined, borderWidth: 0, borderRadius: 2, groupPadding: 0.12, pointPadding: 0.06 },
    },
    series: p.series.map((s): SeriesOptionsType => ({
      type: s.type, id: s.id, name: s.name, color: tok(s.token),
      yAxis: s.axis ?? 0,
      stack: s.stack,
      dashStyle: s.dashed ? 'ShortDash' : 'Solid',
      visible: !p.hidden.has(s.id),
      zIndex: s.type === 'line' ? 2 : 1,
      data: s.data,
    } as SeriesOptionsType)),
  };
}

export default function DrillChart(props: {
  series: DrillSeries[];
  /** Omit for a time axis. */
  categories?: string[];
  axes: DrillAxis[];
  /**
   * Tooltip body for category charts; the default lists each visible series. A custom one
   * gets the ids of the series currently shown, so a line hidden in the legend leaves it too.
   */
  tooltip?: (index: number, visible: Set<string>) => string;
  /** Text alternative — the figures the chart draws. */
  ariaLabel: string;
  height?: number;
  horizontal?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<Chart | null>(null);
  const theme = useGlobalSel().theme;
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  // Read when (re)building, without making visibility a rebuild trigger of its own.
  const hiddenRef = useRef(hidden);
  useEffect(() => { hiddenRef.current = hidden; }, [hidden]);
  const { series, categories, axes, tooltip, horizontal } = props;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const Highcharts = (await import('highcharts')).default;
      if (cancelled || !host.current) return;
      chart.current?.destroy();
      chart.current = Highcharts.chart(host.current, options({ series, categories, axes, tooltip, hidden: hiddenRef.current, horizontal }));
    })();
    return () => { cancelled = true; };
  }, [series, categories, axes, tooltip, horizontal, theme]);

  useEffect(() => () => { chart.current?.destroy(); chart.current = null; }, []);

  const toggle = (id: string) => {
    const next = new Set(hidden);
    if (next.has(id)) next.delete(id); else next.add(id);
    setHidden(next);
    (chart.current?.get(id) as Series | undefined)?.setVisible(!next.has(id));
  };
  /** Emphasise one series (hover/focus) — the others fade; null restores all. */
  const highlight = (id: string | null) => {
    for (const s of chart.current?.series ?? []) {
      s.setState(id === null ? '' : s.options.id === id ? 'hover' : 'inactive');
    }
  };

  return (
    <div className="pd-chart-wrap">
      {/* A legend is for choosing between lines: with one there is nothing to choose — the
          axis title and the drawer's heading already say what it is. */}
      {series.length > 1 && <div className="pd-legend" role="group" aria-label="Show or hide series">
        {series.map((s) => {
          const on = !hidden.has(s.id);
          return (
            <button
              key={s.id}
              type="button"
              className={`pd-legend-item${on ? '' : ' off'}`}
              style={{ ['--series' as string]: `var(${s.token})` }}
              aria-pressed={on}
              onClick={() => toggle(s.id)}
              onMouseEnter={() => on && highlight(s.id)}
              onMouseLeave={() => highlight(null)}
              onFocus={() => on && highlight(s.id)}
              onBlur={() => highlight(null)}
              title={on ? `Hide ${s.name}` : `Show ${s.name}`}
            >
              <i className={`pd-legend-swatch${s.type === 'column' ? ' block' : ''}${s.dashed ? ' dashed' : ''}`} aria-hidden />
              {s.name}
            </button>
          );
        })}
      </div>}
      <div className="pd-chart" ref={host} role="img" aria-label={props.ariaLabel} style={props.height ? { height: props.height } : undefined} />
    </div>
  );
}
