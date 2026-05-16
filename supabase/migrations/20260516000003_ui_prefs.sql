-- ==========================================================================
-- profiles.ui_prefs — per-user dashboard widget preferences
-- ==========================================================================
-- JSONB bag of UI feature toggles. Unset keys default to ON (opt-out
-- pattern, matches notification_prefs convention). Keys we read in
-- this migration's first consumer:
--
--   show_health_ring  — render the Barn Health ring on the dashboard
--   show_streak_chip  — render the daily-streak chip on the dashboard
--
-- New widgets can be added without further migrations — the read
-- path treats absence-of-key as "on" so existing users continue to
-- see new widgets by default.
--
-- Risk: additive only.
-- ==========================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ui_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;
