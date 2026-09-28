/**
 * localStorage key of the global selection. Kept apart from the store so the root layout
 * (a Server Component) can import it for the inline theme script without pulling in React
 * hooks. Keep the two readers in step.
 */
export const SEL_STORAGE_KEY = 'msp.rollingmill.globalSel.v1';
