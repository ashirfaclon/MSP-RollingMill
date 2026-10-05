'use client';

/**
 * Production drill-down: ERP production beside the Influx counter per day / week / month.
 * Opens on 21 Sep → today (the counter's first day); the Duration filter is one click away.
 */
import CounterDrawer, { PRODUCTION_COUNTER } from '@/components/drill/CounterDrawer';

export default function ProductionDrawer(props: { open: boolean; onClose: () => void }) {
  return <CounterDrawer open={props.open} onClose={props.onClose} config={PRODUCTION_COUNTER} />;
}
