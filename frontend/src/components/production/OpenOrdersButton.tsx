'use client';

/**
 * The ERP open order book for strip, as one figure that opens the orders drawer:
 * quantity still pending on every open sales-order line today, whatever its order date.
 */
import { useState } from 'react';
import OrdersDrawer from '@/components/drill/OrdersDrawer';
import { fixed } from '@/lib/num';
import { useSelection } from '@/services/hsmProduction';
import { rangeUrl, useApi, type OrdersReport } from '@/services/hsmApi';

export default function OpenOrdersButton() {
  const { dates } = useSelection();
  const s = useApi<OrdersReport>(rangeUrl('/api/hsm/orders', dates ? { ...dates, grain: 'day' } : null));
  const [open, setOpen] = useState(false);
  const o = s.data?.open;
  return (
    <>
      <button
        type="button"
        className="chip chip--info rm-chip-btn"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        title="Open sales-order lines for strip, from the ERP"
      >
        {o ? <>Open orders <b className="num">{fixed(o.pendingMt, 0)} MT</b> · {o.lines} lines</> : s.error ? 'Orders unavailable' : 'Open orders …'}
      </button>
      {open && <OrdersDrawer open onClose={() => setOpen(false)} />}
    </>
  );
}
