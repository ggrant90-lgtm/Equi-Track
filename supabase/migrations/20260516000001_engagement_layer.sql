-- ==========================================================================
-- Engagement layer — Phase 1
-- ==========================================================================
-- Foundation for celebrations, notifications, streaks, and nudges.
--
-- Adds:
--   * notifications              — in-app feed (per-user, with grouping key)
--   * user_celebrations          — one-per-user-per-key ledger (the UNIQUE
--                                  constraint is the source of truth that
--                                  prevents a celebration from showing twice)
--   * profiles columns           — streak counters, last_active_date, dismissed
--                                  nudges, master notification toggle,
--                                  per-category notification prefs (jsonb)
--   * barns.health_score columns — cached barn health score + refresh stamp
--
-- Out of scope for this migration:
--   * share-cards storage bucket (Phase 2 — created via dashboard then)
--   * realtime publication for notifications (Phase 3, if needed)
--
-- Risk: additive only — no destructive changes. Defaults set so existing
-- rows continue to work unchanged.
-- ==========================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- notifications
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type               text NOT NULL CHECK (type IN (
                       'activity', 'milestone', 'reminder',
                       'financial', 'tip', 'system'
                     )),
  title              text NOT NULL,
  body               text NOT NULL,
  icon               text,
  link               text,
  related_barn_id    uuid REFERENCES public.barns(id) ON DELETE CASCADE,
  related_horse_id   uuid REFERENCES public.horses(id) ON DELETE CASCADE,
  -- Coalescing key. "activity:{actor}:{YYYY-MM-DD}" merges multiple log
  -- entries by the same teammate on the same day into one notification;
  -- "coggins_expiring:{user}:{YYYY-WW}" merges weekly coggins reminders.
  group_key          text,
  -- Free-form counter for grouped notifications ("Jake logged 4 entries").
  group_count        integer NOT NULL DEFAULT 1,
  is_read            boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Unread badge queries: WHERE user_id=? AND is_read=false
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id, is_read, created_at DESC);
-- Feed pagination queries: WHERE user_id=? ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_notifications_user_recent
  ON public.notifications(user_id, created_at DESC);
-- Coalescing lookups: WHERE user_id=? AND group_key=? AND is_read=false
CREATE INDEX IF NOT EXISTS idx_notifications_user_group_unread
  ON public.notifications(user_id, group_key)
  WHERE is_read = false AND group_key IS NOT NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can read their own notifications.
DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Users can mark their own notifications as read.
DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- No INSERT/DELETE policy for `authenticated` — writes happen exclusively
-- through the engagement dispatcher with the service-role client, which
-- bypasses RLS. This prevents clients from spoofing notifications to
-- other users.

-- ────────────────────────────────────────────────────────────────────────────
-- user_celebrations
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_celebrations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Unique per (user, celebration_key). The UNIQUE constraint is the
  -- enforcement mechanism — INSERT ... ON CONFLICT DO NOTHING tells us
  -- whether a celebration has already been shown for this user.
  celebration_key  text NOT NULL,
  shown_at         timestamptz NOT NULL DEFAULT now(),
  shared           boolean NOT NULL DEFAULT false,
  UNIQUE (user_id, celebration_key)
);

CREATE INDEX IF NOT EXISTS idx_user_celebrations_user
  ON public.user_celebrations(user_id);

ALTER TABLE public.user_celebrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_celebrations_select_own ON public.user_celebrations;
CREATE POLICY user_celebrations_select_own ON public.user_celebrations
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Users can flip `shared` on their own rows (set when share modal completes).
DROP POLICY IF EXISTS user_celebrations_update_own ON public.user_celebrations;
CREATE POLICY user_celebrations_update_own ON public.user_celebrations
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- INSERT is server-only (service-role) — same reasoning as notifications.

-- ────────────────────────────────────────────────────────────────────────────
-- profiles — engagement columns
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS current_streak        integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS longest_streak        integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_active_date      date,
  ADD COLUMN IF NOT EXISTS seen_nudges           text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS nudges_disabled       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notifications_enabled boolean NOT NULL DEFAULT true,
  -- Per-category toggles. Defaults to all-on. Keys we read in Phase 1:
  --   activity, reminders, financial, tips
  -- New categories can be added without a migration — unset keys default
  -- to true on the read path.
  ADD COLUMN IF NOT EXISTS notification_prefs    jsonb  NOT NULL DEFAULT '{}'::jsonb;

-- ────────────────────────────────────────────────────────────────────────────
-- barns — cached health score
-- ────────────────────────────────────────────────────────────────────────────
-- Used by the Barn Health ring on the dashboard. Recomputed on demand
-- when older than 1 hour (Phase 2 logic).
ALTER TABLE public.barns
  ADD COLUMN IF NOT EXISTS health_score             integer,
  ADD COLUMN IF NOT EXISTS health_score_updated_at  timestamptz;
