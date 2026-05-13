-- ==========================================================================
-- BarnPilot assistant usage tracking
-- ==========================================================================
-- Per-turn telemetry for the /api/assistant/chat endpoint. Separate from
-- api_call_log (which is the rate-limit counter) so we can capture richer
-- detail without bloating that table: tokens, tools, model, conversation
-- grouping.
--
-- Cost tracking lives here. The admin dashboard reads from this table to
-- show usage + estimated spend.
--
-- Conversation grouping: client generates a UUID per panel-open session and
-- sends it with every request, so we can see "this user had a 6-turn
-- conversation that cost X cents" without storing message content.
--
-- Zero risk: new table, additive only.
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.assistant_usage (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id     text,
  model               text NOT NULL,
  input_tokens        integer NOT NULL DEFAULT 0,
  output_tokens       integer NOT NULL DEFAULT 0,
  cache_read_tokens   integer NOT NULL DEFAULT 0,
  cache_write_tokens  integer NOT NULL DEFAULT 0,
  tools_called        text[] NOT NULL DEFAULT '{}',
  rounds              integer NOT NULL DEFAULT 1,
  cost_cents          integer NOT NULL DEFAULT 0,
  success             boolean NOT NULL DEFAULT true,
  error               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Indexes for the admin dashboard rollups.
CREATE INDEX IF NOT EXISTS idx_assistant_usage_created_at
  ON public.assistant_usage(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assistant_usage_user_created
  ON public.assistant_usage(user_id, created_at DESC);

-- RLS: users can read their own rows; admins can read everything via the
-- service-role client in /admin. No INSERT/UPDATE/DELETE policies — writes
-- happen exclusively from the server route using the user's session, and
-- the server route is the only thing that should be writing here.
ALTER TABLE public.assistant_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assistant_usage_select_own ON public.assistant_usage;
CREATE POLICY assistant_usage_select_own ON public.assistant_usage
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS assistant_usage_insert_own ON public.assistant_usage;
CREATE POLICY assistant_usage_insert_own ON public.assistant_usage
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
