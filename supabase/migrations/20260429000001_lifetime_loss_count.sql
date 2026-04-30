-- ==========================================================================
-- Horses — lifetime_loss_count for breeding-program rollup
-- ==========================================================================
-- The donor profile already shows lifetime_embryo_count and
-- lifetime_live_foal_count. The gap is "how many pregnancies didn't
-- make it" — a mare with 5 embryos and 4 live foals doesn't tell you
-- whether the missing one was lost early, lost late, or never
-- transferred. This column gets bumped whenever a pregnancy that
-- belongs to a donor mare flips to a loss status (lost_early,
-- lost_late, aborted) via markPregnancyLostAction or the
-- not_pregnant cascade in logPregnancyCheckAction.
--
-- Defaults to 0 on every existing row. No data backfill — losses
-- recorded prior to this migration are still visible on the
-- pregnancies themselves; the count starts accruing forward.
-- ==========================================================================

ALTER TABLE public.horses
  ADD COLUMN IF NOT EXISTS lifetime_loss_count integer NOT NULL DEFAULT 0;

-- Atomic increment helper called by markPregnancyLostAction and the
-- not_pregnant cascade in logPregnancyCheckAction. Avoids the
-- read-modify-write race that a fetch-then-update on supabase-js
-- would have. Decrement (for the "I marked it lost by mistake"
-- recovery path) is not provided yet — when needed, we'll add a
-- delete-pregnancy-aware version that decrements only if the row
-- actually was a loss.
CREATE OR REPLACE FUNCTION public.increment_horse_loss_count(p_horse_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.horses
     SET lifetime_loss_count = COALESCE(lifetime_loss_count, 0) + 1,
         updated_at = now()
   WHERE id = p_horse_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_horse_loss_count(uuid)
  TO authenticated;

-- Mirror — used when a loss row is deleted or downgraded to a
-- non-loss state (e.g., user clicked Mark Lost by mistake and now
-- wants to revert). Floors at zero so a corrupted state never
-- produces a negative count.
CREATE OR REPLACE FUNCTION public.decrement_horse_loss_count(p_horse_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.horses
     SET lifetime_loss_count = GREATEST(COALESCE(lifetime_loss_count, 0) - 1, 0),
         updated_at = now()
   WHERE id = p_horse_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.decrement_horse_loss_count(uuid)
  TO authenticated;
