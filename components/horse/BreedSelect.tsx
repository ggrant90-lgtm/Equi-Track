"use client";

import { useEffect, useId, useState } from "react";
import { HORSE_BREEDS } from "@/lib/horse-form-constants";

/**
 * Breed picker — dropdown of common breeds with a freeform fallback
 * for anything not on the list. When the user picks "Other," a text
 * input appears below where they can type Mustang, Friesian, Gypsy
 * Vanner, anything.
 *
 * Acts as a controlled input: parent owns the final breed string;
 * this component decides which UI to show based on whether the value
 * matches one of the preset options. An initial value not in the
 * preset list auto-pivots to custom mode with the value pre-filled.
 *
 * The component renders a hidden input with `name={name}` so it
 * works inside uncontrolled `<form>`s + FormData submissions the
 * same way a single `<select name="breed">` did.
 */
export function BreedSelect({
  value,
  onChange,
  defaultValue,
  name = "breed",
  className,
  required = false,
  id,
}: {
  /** Controlled mode — parent owns the current breed string. */
  value?: string;
  onChange?: (next: string) => void;
  /** Uncontrolled mode — seed the internal state, then let the hidden
   *  input handle FormData submission. Ignored when `value` is set. */
  defaultValue?: string;
  name?: string;
  className?: string;
  required?: boolean;
  id?: string;
}) {
  const isControlled = value !== undefined;
  // When uncontrolled, an internal state mirrors the dropdown +
  // custom input pair. Initialized from `defaultValue`.
  const [uncontrolledValue, setUncontrolledValue] = useState<string>(
    defaultValue ?? "",
  );
  const currentValue = isControlled ? (value as string) : uncontrolledValue;
  const autoId = useId();
  const selectId = id ?? `breed-${autoId}`;

  const PRESETS = HORSE_BREEDS as readonly string[];
  const isPreset = (v: string) => PRESETS.includes(v) && v !== "Other";

  const seed = currentValue;
  const [selection, setSelection] = useState<string>(() => {
    if (!seed) return "";
    if (isPreset(seed)) return seed;
    return "Other";
  });
  const [customValue, setCustomValue] = useState<string>(() =>
    seed && !isPreset(seed) ? seed : "",
  );

  // Controlled mode: keep internal state in sync when the parent's
  // value changes externally. Uncontrolled mode: this branch is a
  // no-op (currentValue mirrors uncontrolledValue which mirrors
  // selection/customValue).
  useEffect(() => {
    if (!isControlled) return;
    const v = value as string;
    const current = selection === "Other" ? customValue.trim() : selection;
    if (current === v) return;
    if (!v) {
      setSelection("");
      setCustomValue("");
    } else if (isPreset(v)) {
      setSelection(v);
      setCustomValue("");
    } else {
      setSelection("Other");
      setCustomValue(v);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, isControlled]);

  function emit(next: string) {
    if (isControlled) {
      onChange?.(next);
    } else {
      setUncontrolledValue(next);
    }
  }

  function handleSelectChange(next: string) {
    setSelection(next);
    if (next === "" || next === "Other") {
      emit(next === "Other" ? customValue.trim() : "");
    } else {
      emit(next);
    }
  }

  function handleCustomChange(next: string) {
    setCustomValue(next);
    if (selection === "Other") emit(next.trim());
  }

  return (
    <div className="space-y-2">
      <select
        id={selectId}
        value={selection}
        onChange={(e) => handleSelectChange(e.target.value)}
        className={className}
        required={required}
      >
        <option value="">Select…</option>
        {PRESETS.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </select>

      {selection === "Other" && (
        <input
          type="text"
          value={customValue}
          onChange={(e) => handleCustomChange(e.target.value)}
          placeholder="Type the breed (Mustang, Friesian, etc.)"
          className={className}
          maxLength={60}
          aria-label="Custom breed name"
        />
      )}

      {/* Hidden input so the picker still works inside an
          uncontrolled <form> that reads FormData. The hidden value
          stays in sync with whichever surface is active. */}
      <input
        type="hidden"
        name={name}
        value={selection === "Other" ? customValue.trim() : selection}
      />
    </div>
  );
}
