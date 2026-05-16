"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";
import { updateUiPrefsAction } from "@/app/(protected)/actions/ui-prefs";

interface DashboardPrefsState {
  showHealthRing: boolean;
  showStreakChip: boolean;
}

/**
 * Dashboard widget toggles. Mirrors the auto-save pattern from
 * NotificationPrefsForm — flipping a switch debounces ~400ms and
 * sends the full state. Defaults are on; turning a widget off hides
 * it from the dashboard engagement strip on next render.
 */
export function DashboardPrefsForm({
  initial,
}: {
  initial: DashboardPrefsState;
}) {
  const [state, setState] = useState<DashboardPrefsState>(initial);
  const [pending, formAction] = useActionState(updateUiPrefsAction, null);

  function setField<K extends keyof DashboardPrefsState>(
    key: K,
    value: DashboardPrefsState[K],
  ) {
    setState((s) => ({ ...s, [key]: value }));
  }

  useEffect(() => {
    const t = setTimeout(() => {
      const fd = new FormData();
      if (state.showHealthRing) fd.set("show_health_ring", "on");
      if (state.showStreakChip) fd.set("show_streak_chip", "on");
      formAction(fd);
    }, 400);
    return () => clearTimeout(t);
  }, [state, formAction]);

  return (
    <div>
      <div className="space-y-3">
        <Row
          title="Barn Health ring"
          help="The circular progress ring that shows how complete your barn setup is."
          checked={state.showHealthRing}
          onChange={(v) => setField("showHealthRing", v)}
        />
        <Row
          title="Streak chip"
          help="The 🔥 daily-logging streak indicator next to your greeting."
          checked={state.showStreakChip}
          onChange={(v) => setField("showStreakChip", v)}
        />
      </div>

      <div className="mt-4 text-xs text-barn-dark/45">
        {pending?.ok ? "Saved." : pending?.error ? pending.error : " "}
      </div>
    </div>
  );
}

function Row({
  title,
  help,
  checked,
  onChange,
}: {
  title: ReactNode;
  help: ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="font-medium text-barn-dark">{title}</div>
        <div className="text-xs text-barn-dark/55">{help}</div>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition"
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
