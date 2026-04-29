-- ==========================================================================
-- Embryo codes — uniqueness scoped per barn, not globally
-- ==========================================================================
-- The original migration created a globally-unique index on
-- embryos.embryo_code, but the `generate_embryo_code(barn_id)`
-- function computes the next sequence number per-barn — so two barns
-- both starting their first flush of the year produced "CB-2026-0001"
-- and the second insert hit a unique-violation:
--
--   duplicate key value violates unique constraint "idx_embryos_code"
--
-- Fix: drop the global unique index, replace it with a composite
-- unique index on (barn_id, embryo_code). Codes stay reader-friendly
-- (CB-2026-0001 within a barn) and are guaranteed unique inside that
-- barn — which is the only scope humans care about.
--
-- Idempotent. Safe on databases where the new constraint already
-- exists or the old one is already gone.
-- ==========================================================================

DROP INDEX IF EXISTS public.idx_embryos_code;

CREATE UNIQUE INDEX IF NOT EXISTS idx_embryos_barn_code
  ON public.embryos (barn_id, embryo_code);
