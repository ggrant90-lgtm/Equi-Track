export const HORSE_SEX_OPTIONS = ["Mare", "Stallion", "Gelding", "Unknown"] as const;

/**
 * Common breeds shown in the dropdown. "Other" pivots the form to a
 * freeform text input so users can type Mustang, Friesian, Andalusian,
 * etc. The DB column is plain text — any string is accepted.
 *
 * Less-common breeds (Appaloosa, Morgan, Tennessee Walker, Pony, Draft)
 * were removed from the preset list to reduce visual clutter; users
 * who want those just type them via "Other."
 */
export const HORSE_BREEDS = [
  "Thoroughbred",
  "Quarter Horse",
  "Warmblood",
  "Arabian",
  "Paint",
  "Other",
] as const;

export const EXERCISE_SUBTYPES = [
  "gallop",
  "jog",
  "walk",
  "swim",
  "treadmill",
  "work",
  "gate",
  "race",
] as const;

export const LOG_TYPES = [
  "exercise",
  "pony",
  "shoeing",
  "worming",
  "vet_visit",
  "dentistry",
  "feed",
  "medication",
  "note",
  "breed_data",
] as const;

export const BREED_DATA_SUBTYPES = [
  "custom",
  "heat_detected",
  "bred_ai",
  "flush_embryo",
  "embryo_transfer",
  "ultrasound",
  "foaling",
] as const;

export type BreedDataSubtype = (typeof BREED_DATA_SUBTYPES)[number];

export const BREED_DATA_SUBTYPE_LABELS: Record<BreedDataSubtype, string> = {
  custom: "Custom Entry",
  heat_detected: "Heat Detected",
  bred_ai: "Bred / AI",
  flush_embryo: "Flush / Embryo Recovery",
  embryo_transfer: "Embryo Transfer",
  ultrasound: "Ultrasound / Pregnancy Check",
  foaling: "Foaling",
};

export const BREEDING_METHODS = [
  "Traditional Carry",
  "AI Fresh",
  "AI Cooled",
  "AI Frozen",
] as const;

export const ULTRASOUND_RESULTS = [
  "Open",
  "Bred Confirmed",
  "Pregnancy Confirmed",
  "Loss Detected",
  "Inconclusive",
] as const;

export type LogType = (typeof LOG_TYPES)[number];

export function isLogType(s: string): s is LogType {
  return (LOG_TYPES as readonly string[]).includes(s);
}

export function logTypeLabel(type: string): string {
  const map: Record<string, string> = {
    exercise: "Exercise",
    pony: "Pony",
    shoeing: "Shoeing",
    worming: "Worming",
    vet_visit: "Vet visit",
    dentistry: "Dentistry",
    feed: "Feed",
    medication: "Medication",
    note: "Note",
    breed_data: "Breed Data",
  };
  return map[type] ?? type;
}

// ============================================================
// Embryo Asset Flow constants
// ============================================================

export const BREEDING_ROLES = ["donor", "recipient", "stallion", "multiple", "none"] as const;
export type BreedingRole = (typeof BREEDING_ROLES)[number];

export const BREEDING_ROLE_LABELS: Record<BreedingRole, string> = {
  donor: "Donor",
  recipient: "Recipient / Surrogate",
  stallion: "Stallion",
  multiple: "Multiple Roles",
  none: "None",
};

export const REPRODUCTIVE_STATUSES = [
  "open", "in_cycle", "bred", "confirmed_pregnant",
  "foaling", "post_foaling", "retired",
] as const;

export const REPRODUCTIVE_STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_cycle: "In Cycle",
  bred: "Bred",
  confirmed_pregnant: "Confirmed Pregnant",
  foaling: "Foaling",
  post_foaling: "Post-Foaling",
  retired: "Retired",
};

export const EMBRYO_STATUSES = [
  "in_bank_fresh", "in_bank_frozen", "transferred",
  "became_foal", "lost", "shipped_out",
] as const;
export type EmbryoStatus = (typeof EMBRYO_STATUSES)[number];

export const EMBRYO_STATUS_LABELS: Record<EmbryoStatus, string> = {
  in_bank_fresh: "Fresh",
  in_bank_frozen: "Frozen",
  transferred: "Transferred",
  became_foal: "Became Foal",
  lost: "Lost",
  shipped_out: "Shipped Out",
};

export const EMBRYO_GRADES = ["grade_1", "grade_2", "grade_3", "grade_4", "degenerate"] as const;
export type EmbryoGrade = (typeof EMBRYO_GRADES)[number];

export const EMBRYO_GRADE_LABELS: Record<EmbryoGrade, string> = {
  grade_1: "Grade 1 (Excellent)",
  grade_2: "Grade 2 (Good)",
  grade_3: "Grade 3 (Fair)",
  grade_4: "Grade 4 (Poor)",
  degenerate: "Degenerate",
};

export const EMBRYO_STAGES = [
  "morula", "early_blastocyst", "blastocyst",
  "expanded_blastocyst", "hatched_blastocyst",
] as const;
export type EmbryoStage = (typeof EMBRYO_STAGES)[number];

export const EMBRYO_STAGE_LABELS: Record<EmbryoStage, string> = {
  morula: "Morula",
  early_blastocyst: "Early Blastocyst",
  blastocyst: "Blastocyst",
  expanded_blastocyst: "Expanded Blastocyst",
  hatched_blastocyst: "Hatched Blastocyst",
};

export const BREEDING_METHOD_VALUES = ["ai_fresh", "ai_cooled", "ai_frozen", "live_cover"] as const;
export type BreedingMethodValue = (typeof BREEDING_METHOD_VALUES)[number];

export const BREEDING_METHOD_LABELS: Record<BreedingMethodValue, string> = {
  ai_fresh: "AI Fresh",
  ai_cooled: "AI Cooled",
  ai_frozen: "AI Frozen",
  live_cover: "Traditional Carry",
};

export const INSEMINATION_TECHNIQUES = [
  "standard_uterine", "deep_horn", "hysteroscopic",
] as const;
export type InseminationTechnique = (typeof INSEMINATION_TECHNIQUES)[number];

export const INSEMINATION_TECHNIQUE_LABELS: Record<InseminationTechnique, string> = {
  standard_uterine: "Standard Uterine",
  deep_horn: "Deep Horn",
  hysteroscopic: "Hysteroscopic",
};

export const PREGNANCY_STATUSES = [
  "pending_check", "confirmed", "lost_early", "lost_late", "foaled", "aborted",
] as const;

export const PREGNANCY_STATUS_LABELS: Record<string, string> = {
  pending_check: "Pending Check",
  confirmed: "Confirmed",
  lost_early: "Lost (Early)",
  lost_late: "Lost (Late)",
  foaled: "Foaled",
  aborted: "Aborted",
};

export const PREGNANCY_CHECKS = [
  "check_14_day", "check_30_day", "check_45_day", "check_60_day", "check_90_day",
] as const;

export const PREGNANCY_CHECK_LABELS: Record<string, string> = {
  check_14_day: "14-Day Check",
  check_30_day: "30-Day Check",
  check_45_day: "45-Day Check",
  check_60_day: "60-Day Check",
  check_90_day: "90-Day Check",
};

export const FOALING_TYPES = ["normal", "assisted", "dystocia", "c_section", "stillborn"] as const;

export const FOALING_TYPE_LABELS: Record<string, string> = {
  normal: "Normal",
  assisted: "Assisted",
  dystocia: "Dystocia",
  c_section: "C-Section",
  stillborn: "Stillborn",
};

export const FREEZE_METHODS = ["vitrification", "slow_freeze"] as const;

export const FREEZE_METHOD_LABELS: Record<string, string> = {
  vitrification: "Vitrification",
  slow_freeze: "Slow Freeze",
};

export const LOSS_REASONS = [
  "degenerated", "transfer_failure", "early_pregnancy_loss",
  "late_pregnancy_loss", "other",
] as const;

export const LOSS_REASON_LABELS: Record<string, string> = {
  degenerated: "Degenerated",
  transfer_failure: "Transfer Failure",
  early_pregnancy_loss: "Early Pregnancy Loss",
  late_pregnancy_loss: "Late Pregnancy Loss",
  other: "Other",
};

export const FINANCIAL_CATEGORIES = [
  "stud_fee", "collection_shipping", "vet_cycle", "vet_flush",
  "vet_transfer", "vet_ultrasound", "vet_other", "medications",
  "surrogate_lease", "surrogate_board", "freezing_storage",
  "shipping", "registration", "other",
] as const;

export const FINANCIAL_CATEGORY_LABELS: Record<string, string> = {
  stud_fee: "Stud Fee",
  collection_shipping: "Collection / Shipping",
  vet_cycle: "Vet — Cycle",
  vet_flush: "Vet — Flush",
  vet_transfer: "Vet — Transfer",
  vet_ultrasound: "Vet — Ultrasound",
  vet_other: "Vet — Other",
  medications: "Medications",
  surrogate_lease: "Surrogate Lease",
  surrogate_board: "Surrogate Board",
  freezing_storage: "Freezing / Storage",
  shipping: "Shipping",
  registration: "Registration",
  other: "Other",
};
