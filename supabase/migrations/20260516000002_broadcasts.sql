-- ==========================================================================
-- Engagement layer — Phase 1.5: Admin broadcasts
-- ==========================================================================
-- Adds the ability for platform admins to push a single announcement
-- to many users at once (e.g., "Check out BarnPilot!"). Implementation
-- is database-side fan-out: one broadcast row authored by the admin,
-- N notification rows fan out (one per recipient) so the existing
-- notification bell / feed / mark-read flows pick them up unchanged.
--
-- Risk: additive only.
-- ==========================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- broadcasts — admin authored, immutable after send
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.broadcasts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Notification fields the fan-out copies onto each per-user row.
  title             text NOT NULL,
  body              text NOT NULL,
  icon              text,
  link              text,
  notification_type text NOT NULL DEFAULT 'system' CHECK (notification_type IN (
                      'activity', 'milestone', 'reminder',
                      'financial', 'tip', 'system'
                    )),
  -- Audience descriptor. JSON shape so future segments don't need a
  -- migration. Examples:
  --   { "kind": "all" }
  --   { "kind": "feature", "feature": "business_pro" }
  --   { "kind": "feature", "feature": "no_barnpilot" }
  --   { "kind": "user",    "user_id": "<uuid>" }
  audience          jsonb  NOT NULL,
  sent_by           uuid   NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  sent_at           timestamptz NOT NULL DEFAULT now(),
  -- Snapshot of how many notifications were actually inserted at
  -- send-time. Used for the admin history view; never changes.
  recipient_count   integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_broadcasts_sent_at
  ON public.broadcasts(sent_at DESC);

-- Admins can see all broadcasts; non-admins can't see this table
-- (notifications.broadcast_id is enough for joining if anyone ever
-- needs the original source from the user side).
ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS broadcasts_admin_select ON public.broadcasts;
CREATE POLICY broadcasts_admin_select ON public.broadcasts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_platform_admin = true
    )
  );

-- INSERT/UPDATE/DELETE happen exclusively through the server-side
-- admin client; no client-facing write policies.

-- ────────────────────────────────────────────────────────────────────────────
-- notifications.broadcast_id — link per-user rows back to their origin
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS broadcast_id uuid REFERENCES public.broadcasts(id) ON DELETE SET NULL;

-- UNIQUE (user_id, broadcast_id) — same broadcast can't fan out to
-- the same user twice. A defensive belt to keep re-runs idempotent.
-- The WHERE clause means the unique index only applies when
-- broadcast_id IS NOT NULL, so existing organic notifications aren't
-- constrained by it.
DROP INDEX IF EXISTS idx_notifications_user_broadcast_unique;
CREATE UNIQUE INDEX idx_notifications_user_broadcast_unique
  ON public.notifications(user_id, broadcast_id)
  WHERE broadcast_id IS NOT NULL;
