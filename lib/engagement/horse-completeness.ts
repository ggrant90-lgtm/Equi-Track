/**
 * Horse profile completeness — pure compute on a single horse row +
 * optional flags about its supporting data. No DB queries; the caller
 * supplies what we need from whatever it already loaded for the page.
 *
 * Weights match the engagement spec:
 *   name 10% (always true if the horse exists)
 *   breed 10%
 *   dob 10%
 *   sex 10%
 *   color 5%
 *   photo 15%
 *   registration_number 10%
 *   any log entry 10%
 *   current coggins 15%
 *   registration papers scanned 5%
 */

export interface HorseLike {
  name: string | null;
  breed: string | null;
  foal_date: string | null;
  sex: string | null;
  color: string | null;
  photo_url: string | null;
  registration_number: string | null;
}

export interface HorseCompletenessInput {
  horse: HorseLike;
  /** True if any activity_log / health_records row exists for this horse. */
  hasAnyEntry: boolean;
  /** True if any non-expired coggins document exists. */
  hasCurrentCoggins: boolean;
  /** True if any registration-papers document exists. */
  hasRegistrationPapers: boolean;
}

export interface HorseCompletenessItem {
  key: string;
  label: string;
  weight: number;
  met: boolean;
}

export interface HorseCompletenessResult {
  score: number;
  items: HorseCompletenessItem[];
  nextHint: { label: string; weight: number } | null;
}

export function computeHorseCompleteness(
  input: HorseCompletenessInput,
): HorseCompletenessResult {
  const { horse } = input;
  const items: HorseCompletenessItem[] = [
    { key: "name", label: "Name", weight: 10, met: !!horse.name?.trim() },
    { key: "breed", label: "Breed", weight: 10, met: !!horse.breed?.trim() },
    {
      key: "dob",
      label: "Date of birth",
      weight: 10,
      met: !!horse.foal_date?.trim(),
    },
    { key: "sex", label: "Sex", weight: 10, met: !!horse.sex?.trim() },
    {
      key: "color",
      label: "Color",
      weight: 5,
      met: !!horse.color?.trim(),
    },
    {
      key: "photo",
      label: "Photo",
      weight: 15,
      met: !!horse.photo_url?.trim(),
    },
    {
      key: "registration_number",
      label: "Registration number",
      weight: 10,
      met: !!horse.registration_number?.trim(),
    },
    {
      key: "any_entry",
      label: "At least one log entry",
      weight: 10,
      met: input.hasAnyEntry,
    },
    {
      key: "current_coggins",
      label: "Current coggins on file",
      weight: 15,
      met: input.hasCurrentCoggins,
    },
    {
      key: "registration_papers",
      label: "Registration papers scanned",
      weight: 5,
      met: input.hasRegistrationPapers,
    },
  ];
  const score = items.reduce((s, i) => s + (i.met ? i.weight : 0), 0);
  // Highest-weight unmet item — that's the "next biggest win."
  const missing = items.filter((i) => !i.met).sort((a, b) => b.weight - a.weight);
  const nextHint = missing.length > 0
    ? { label: missing[0].label, weight: missing[0].weight }
    : null;
  return { score, items, nextHint };
}

export function completenessTone(
  score: number,
): "low" | "mid" | "high" {
  if (score >= 80) return "high";
  if (score >= 50) return "mid";
  return "low";
}
