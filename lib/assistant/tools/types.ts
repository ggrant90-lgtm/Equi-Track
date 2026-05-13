import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

/**
 * Per-request context handed to every tool handler. The supabase client is
 * the user-scoped one — RLS is the permission layer, so tool handlers can
 * trust that any row they read is one the user is allowed to see.
 */
export interface ToolContext {
  supabase: SupabaseClient<Database>;
  userId: string;
  hasBusinessPro: boolean;
}

/**
 * A tool exposes its Claude-facing definition and a server-side handler.
 * The handler returns a JSON-serializable value that becomes the
 * tool_result content block in the next turn.
 */
export interface AssistantTool {
  definition: {
    name: string;
    description: string;
    input_schema: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
  handler: (input: unknown, ctx: ToolContext) => Promise<unknown>;
}

/** Standard shape for a Business-Pro-gated tool result. */
export interface GatedResult {
  gated: true;
  product: "business_pro" | "breeders_pro" | "document_scanner";
  upgrade_pitch: string;
}

export const businessProGate: GatedResult = {
  gated: true,
  product: "business_pro",
  upgrade_pitch:
    "Business Pro tracks revenue, expenses, invoicing, and who owes you money — across every barn and horse. It's an account-level upgrade.",
};
