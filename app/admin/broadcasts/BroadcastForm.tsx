"use client";

import { useActionState, useState } from "react";
import { sendBroadcastAction, type SendBroadcastState } from "./actions";

/**
 * Compose-and-send form for admin broadcasts.
 *
 * Left column: form fields. Right column: live preview rendering
 * approximately the same way the notification appears in the bell.
 * Submit calls the server action; on success the page revalidates
 * and the new broadcast shows up in the history table below.
 *
 * One footgun guard: a confirm step that surfaces audience size
 * before fan-out. Easy to chicken out before hitting "Send."
 */
export function BroadcastForm() {
  const [state, formAction, pending] = useActionState<
    SendBroadcastState | null,
    FormData
  >(sendBroadcastAction, null);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [icon, setIcon] = useState("📣");
  const [link, setLink] = useState("");
  const [audienceKind, setAudienceKind] =
    useState<"all" | "feature" | "user_by_email">("all");
  const [featureSegment, setFeatureSegment] = useState<
    "business_pro" | "breeders_pro" | "no_barnpilot"
  >("no_barnpilot");
  const [userEmail, setUserEmail] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  function submit(fd: FormData) {
    setConfirmOpen(false);
    formAction(fd);
  }

  function describeAudience(): string {
    if (audienceKind === "all") return "Every user with a BarnBook account";
    if (audienceKind === "user_by_email")
      return userEmail ? `Test send to ${userEmail}` : "Test send (enter an email)";
    if (featureSegment === "business_pro") return "Business Pro users only";
    if (featureSegment === "breeders_pro") return "Breeders Pro users only";
    return "Users who have never opened BarnPilot";
  }

  return (
    <div className="rounded-2xl border border-barn-dark/10 bg-white shadow-sm">
      <div className="border-b border-barn-dark/10 px-6 py-4">
        <h2 className="font-serif text-lg font-semibold text-barn-dark">
          Compose a broadcast
        </h2>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setConfirmOpen(true);
        }}
        className="grid gap-6 px-6 py-6 lg:grid-cols-2"
      >
        {/* Left column — fields */}
        <div className="space-y-4">
          <Field label="Title" hint="Max 120 chars. Plain language.">
            <input
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              required
              placeholder="Check out BarnPilot!"
              className="w-full rounded-lg border border-barn-dark/15 px-3 py-2 text-sm"
            />
          </Field>

          <Field label="Body" hint="Max 500 chars. One short paragraph.">
            <textarea
              name="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={500}
              required
              rows={4}
              placeholder="Ask BarnPilot anything about your horses — try ‘When was Magnolia last shoed?’"
              className="w-full rounded-lg border border-barn-dark/15 px-3 py-2 text-sm"
            />
            <div className="mt-1 text-right text-[10px] text-barn-dark/45">
              {body.length}/500
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Icon" hint="Single emoji or short symbol.">
              <input
                name="icon"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                maxLength={4}
                placeholder="📣"
                className="w-full rounded-lg border border-barn-dark/15 px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Link" hint="Where the bell-tap goes (optional).">
              <input
                name="link"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="/dashboard"
                className="w-full rounded-lg border border-barn-dark/15 px-3 py-2 text-sm"
              />
            </Field>
          </div>

          <Field label="Audience" hint="Who receives this announcement.">
            <select
              name="audience_kind"
              value={audienceKind}
              onChange={(e) =>
                setAudienceKind(
                  e.target.value as "all" | "feature" | "user_by_email",
                )
              }
              className="w-full rounded-lg border border-barn-dark/15 px-3 py-2 text-sm"
            >
              <option value="all">All users</option>
              <option value="feature">Feature segment…</option>
              <option value="user_by_email">Test send to one email</option>
            </select>
          </Field>

          {audienceKind === "feature" && (
            <Field label="Segment">
              <select
                name="feature_segment"
                value={featureSegment}
                onChange={(e) =>
                  setFeatureSegment(
                    e.target.value as
                      | "business_pro"
                      | "breeders_pro"
                      | "no_barnpilot",
                  )
                }
                className="w-full rounded-lg border border-barn-dark/15 px-3 py-2 text-sm"
              >
                <option value="no_barnpilot">
                  Haven&apos;t tried BarnPilot
                </option>
                <option value="business_pro">Business Pro users</option>
                <option value="breeders_pro">Breeders Pro users</option>
              </select>
            </Field>
          )}

          {audienceKind === "user_by_email" && (
            <Field label="Email" hint="Single recipient for a test send.">
              <input
                name="user_email"
                type="email"
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-barn-dark/15 px-3 py-2 text-sm"
              />
            </Field>
          )}

          {/* Hidden mirrors for fields that may not be in the visible form */}
          {audienceKind !== "feature" && (
            <input type="hidden" name="feature_segment" value="" />
          )}
          {audienceKind !== "user_by_email" && (
            <input type="hidden" name="user_email" value="" />
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={pending || !title || !body}
              className="rounded-xl bg-brass-gold px-5 py-2 font-medium text-barn-dark transition hover:brightness-110 disabled:opacity-40"
            >
              {pending ? "Sending…" : "Review & send"}
            </button>
            {state?.ok && (
              <span className="text-sm text-barn-green">
                Sent to {state.recipientCount?.toLocaleString()} users.
              </span>
            )}
            {state?.error && (
              <span className="text-sm text-red-600">{state.error}</span>
            )}
          </div>
        </div>

        {/* Right column — preview */}
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-barn-dark/55">
            Preview
          </div>
          <div className="mt-2 rounded-2xl border bg-parchment p-4 shadow-inner" style={{ borderColor: "rgba(201,168,76,0.35)" }}>
            <div className="flex gap-3">
              <div className="w-1 shrink-0 rounded-full" style={{ background: "#c9a84c" }} />
              <div className="flex h-7 w-7 shrink-0 items-center justify-center text-base">
                {icon || "•"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-barn-dark">
                    {title || "Title goes here"}
                  </p>
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-barn-dark/45">
                    just now
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-barn-dark/65">
                  {body || "Body text goes here."}
                </p>
              </div>
            </div>
            <div className="mt-3 text-[11px] text-barn-dark/50">
              <span className="font-medium">Audience:</span> {describeAudience()}
              {link && (
                <>
                  {" · "}
                  <span className="font-medium">Tap goes to:</span>{" "}
                  <code className="rounded bg-barn-dark/5 px-1">{link}</code>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Confirm modal */}
        {confirmOpen && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
            onClick={() => setConfirmOpen(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-xl"
              style={{ borderColor: "rgba(201,168,76,0.4)" }}
            >
              <h3 className="font-serif text-lg font-semibold text-barn-dark">
                Ready to send?
              </h3>
              <p className="mt-2 text-sm text-barn-dark/65">
                This will fan out into one notification per recipient. There is
                no undo — admins can&apos;t recall a broadcast once it hits the
                bell.
              </p>
              <div
                className="mt-4 rounded-lg border bg-parchment/50 p-3 text-xs text-barn-dark/75"
                style={{ borderColor: "rgba(42,64,49,0.1)" }}
              >
                <div>
                  <span className="font-medium">Audience:</span>{" "}
                  {describeAudience()}
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmOpen(false)}
                  className="rounded-lg border border-barn-dark/15 px-4 py-2 text-sm font-medium text-barn-dark/75 hover:bg-parchment"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    const form = (e.currentTarget as HTMLButtonElement)
                      .closest("form") as HTMLFormElement | null;
                    if (!form) return;
                    submit(new FormData(form));
                  }}
                  className="rounded-lg bg-brass-gold px-4 py-2 text-sm font-medium text-barn-dark hover:brightness-110"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-barn-dark/55">
          {label}
        </span>
        {hint && <span className="text-[10px] text-barn-dark/45">{hint}</span>}
      </div>
      {children}
    </label>
  );
}
