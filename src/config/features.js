// Release gating. Release 1 is "explain the return": PDF → CPA-approved figures → deterministic narration → audio/video → share link. The tax-PLANNING modules (scenario comparison, entity
// returns, multi-year RIA projections) were found to need independent validation before customers rely on them (see docs/ENGINE_CONSTANTS_TO_VERIFY.md), so they are OFF unless
// VITE_ENABLE_PLANNING=true is set at build time. A disabled module has no route, no navigation entry and no link.
export const FEATURES = {
  planningModules: import.meta.env.VITE_ENABLE_PLANNING === 'true',
};
