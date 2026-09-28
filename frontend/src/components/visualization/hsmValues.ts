/**
 * HSM Visualization — the figures on screen, hardcoded from the approved reference.
 *
 * Deliberately static: data wiring is a later step. Everything the screen shows is here
 * and nowhere else, so that step replaces this one object and touches no component.
 * Percentages and rates are derived from these inputs in the components, so the screen
 * stays self-consistent when a number changes.
 */
export const HSM_VALUES = {
  /** Finished production for the window, MT. */
  production: 342.0,
  /** Production plan for the window, MT — three equal shifts of 120. */
  plan: 360,
  /** Billets charged, MT and count. */
  billetInput: 354.0,
  billets: 282,
  /** Metered energy for the window, MWh. */
  powerMwh: 30.78,
  /** Mill running / not-running hours in the window. */
  runHours: 21.6,
  nonRunHours: 2.4,

  shifts: [
    { name: 'Shift A', production: 112.0 },
    { name: 'Shift B', production: 118.0 },
    { name: 'Shift C', production: 112.0 },
  ],

  /** Day production split against sales orders (ERP). */
  productionAgainstOrder: 270.0,
  productionWithoutOrder: 72.0,

  /** Period-end finished stock by size, MT. */
  stockBySize: [
    { size: '8 mm', withOrder: 130, free: 60 },
    { size: '10 mm', withOrder: 110, free: 50 },
    { size: '12 mm', withOrder: 100, free: 50 },
    { size: '16 mm', withOrder: 80, free: 50 },
  ],
  /** As shown on the reference; not derived from the stock split. */
  orderCoverPct: 70.0,

  /** Process zones of the mill mimic, infeed to exit. */
  mimic: {
    roughing: 'Running',
    intermediate: 'Running',
    finishing: 'Running',
  },
} as const;

export type HsmValues = typeof HSM_VALUES;

/** Everything the screen prints that is arithmetic on the values above. */
export function deriveHsm(v: HsmValues) {
  const stockWithOrder = v.stockBySize.reduce((s, r) => s + r.withOrder, 0);
  const stockFree = v.stockBySize.reduce((s, r) => s + r.free, 0);
  const stockTotal = stockWithOrder + stockFree;
  const hours = v.runHours + v.nonRunHours;
  return {
    planPct: (v.production / v.plan) * 100,
    planGap: v.plan - v.production,
    shiftTarget: v.plan / v.shifts.length,
    runRateTph: v.production / v.runHours,
    yieldPct: (v.production / v.billetInput) * 100,
    massDiff: v.billetInput - v.production,
    billetRate: v.billets / v.runHours,
    availabilityPct: hours > 0 ? (v.runHours / hours) * 100 : 0,
    specificEnergy: (v.powerMwh * 1000) / v.production,
    withoutOrderPct: (v.productionWithoutOrder / v.production) * 100,
    stockWithOrder,
    stockFree,
    stockTotal,
    stockWithOrderPct: (stockWithOrder / stockTotal) * 100,
    stockFreePct: (stockFree / stockTotal) * 100,
  };
}

export type HsmDerived = ReturnType<typeof deriveHsm>;
