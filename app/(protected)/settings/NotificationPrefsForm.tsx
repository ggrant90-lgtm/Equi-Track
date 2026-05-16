"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";
import { updateNotificationPrefsAction } from "@/app/(protected)/actions/notifications";

interface PrefState {
  masterEnabled: boolean;
  activity: boolean;
  reminders: boolean;
  financial: boolean;
  tips: boolean;
}

/**
 * Notification preferences form.
 *
 * Per-category toggles are independent and write to
 * profiles.notification_prefs (JSONB). The master switch sets
 * profiles.notifications_enabled — when false, the engagement layer
 * short-circuits all category checks.
 *
 * Auto-saves on toggle change (debounced ~400ms). No "Save" button —
 * toggles should feel immediate, like a system settings panel.
 */
export function NotificationPrefsForm({ initial }: { initial: PrefState }) {
  const [state, setState] = useState<PrefState>(initial);
  const [pending, formAction] = useActionState(
    updateNotificationPrefsAction,
    null,
  );

  function setField<K extends keyof PrefState>(key: K, value: PrefState[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  // Auto-submit when state changes — assemble a FormData on the fly.
  useEffect(() => {
    const t = setTimeout(() => {
      const fd = new FormData();
      if (state.masterEnabled) fd.set("notifications_enabled", "on");
      if (state.activity) fd.set("activity", "on");
      if (state.reminders) fd.set("reminders", "on");
      if (state.financial) fd.set("financial", "on");
      if (state.tips) fd.set("tips", "on");
      formAction(fd);
    }, 400);
    return () => clearTimeout(t);
  }, [state, formAction]);

  const disabled = !state.masterEnabled;

  return (
    <div>
      <div className="flex items-center justify-between gap-4 border-b border-barn-dark/10 pb-4">
        <div>
          <div className="font-medium text-barn-dark">All notifications</div>
          <div className="text-xs text-barn-dark/55">
            Master switch — turn this off to silence the bell entirely.
          </div>
        </div>
        <Toggle
          checked={state.masterEnabled}
          onChange={(v) => setField("masterEnabled", v)}
        />
      </div>

      <div className="mt-4 space-y-3" style={{ opacity: disabled ? 0.5 : 1 }}>
        <Row
          title="Activity from my barns"
          help="When teammates log entries, redeem keys, or add documents."
          checked={state.activity}
          onChange={(v) => setField("activity", v)}
          disabled={disabled}
        />
        <Row
          title="Coggins & document reminders"
          help="Coggins approaching expiration and other paperwork nags."
          checked={state.reminders}
          onChange={(v) => setField("reminders", v)}
          disabled={disabled}
        />
        <Row
          title="Financial summaries"
          help="Weekly receivables, monthly revenue (Business Pro only)."
          checked={state.financial}
          onChange={(v) => setField("financial", v)}
          disabled={disabled}
        />
        <Row
          title="Tips & feature suggestions"
          help="Occasional hints about features you haven't tried yet."
          checked={state.tips}
          onChange={(v) => setField("tips", v)}
          disabled={disabled}
        />
      </div>

      <div className="mt-4 text-xs text-barn-dark/45">
        {pending?.ok ? "Saved." : pending?.error ? pending.error : " "}
      </div>
    </div>
  );
}

function Row({
  title,
  help,
  checked,
  onChange,
  disabled,
}: {
  title: ReactNode;
  help: ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="font-medium text-barn-dark">{title}</div>
        <div className="text-xs text-barn-dark/55">{help}</div>
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        background: checked ? "#c9a84c" : "rgba(42,64,49,0.2)",
      }}
    >
      <span
        aria-hidden="true"
        className="absolute h-5 w-5 rounded-full bg-white shadow transition-all"
        style={{
          left: checked ? "calc(100% - 1.375rem)" : "0.125rem",
        }}
      />
    </button>
  );
}
