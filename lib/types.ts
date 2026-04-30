/**
 * BarnBook public schema — Supabase Postgres types for typed clients.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/** public.profiles — extends auth.users */
export interface Profile {
  id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  is_platform_admin: boolean;
  has_breeders_pro: boolean;
  has_business_pro: boolean;
  business_pro_enabled_at: string | null;
  business_pro_enabled_by: string | null;
  // ── Onboarding wizard state ──
  onboarding_core_completed: boolean;
  onboarding_business_pro_completed: boolean;
  onboarding_breeders_pro_completed: boolean;
  /** Set when the user explicitly dismissed the Core wizard. Non-null
   *  means we will NOT auto-open it again. */
  onboarding_core_dismissed_at: string | null;
  /** 1-indexed step where the user left off in the Core wizard. */
  onboarding_core_step: number;
  updated_at: string;
}

/** public.barns */
export interface Barn {
  id: string;
  name: string;
  owner_id: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  logo_url: string | null;
  banner_url: string | null;
  about: string | null;
  website: string | null;
  instagram: string | null;
  facebook: string | null;
  public_email: string | null;
  public_phone: string | null;
  barn_type: "standard" | "mare_motel" | "service";
  plan_tier: "free" | "paid" | "comped";
  /** Free/base stalls the barn starts with (5 for free, 0 for stall-block-funded
   *  "build new" barns). Effective capacity = base_stalls + SUM of active
   *  barn_stall_blocks. Formerly `stall_capacity`. */
  base_stalls: number;
  plan_started_at: string | null;
  plan_expires_at: string | null;
  plan_notes: string | null;
  plan_updated_by_user_id: string | null;
  plan_updated_at: string | null;
  grace_period_ends_at: string | null;
  // ── Business Pro: invoice branding defaults ──
  // (logo_url is already on the Barn interface above — reused for invoices)
  company_name: string | null;
  company_address: string | null;
  company_phone: string | null;
  company_email: string | null;
  invoice_notes_default: string | null;
  invoice_terms_default: string | null;
  next_invoice_seq: number;
  /** Line-item presets for the invoice creation flow. Saved by the
   *  Business Pro wizard step 2. Shape: [{ label, priceCents }]. */
  invoice_service_presets: InvoiceServicePreset[];
  created_at: string;
  updated_at: string;
}

/** Single saved invoice line-item preset, stored on
 *  barns.invoice_service_presets as JSON. */
export interface InvoiceServicePreset {
  label: string;
  priceCents: number;
}

/** public.invoice_line_items — custom invoice line items (non-log-entry charges) */
export interface InvoiceLineItem {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  horse_id: string | null;
  sort_order: number;
  created_at: string;
}

/** public.invoices — Business Pro invoice records */
export interface Invoice {
  id: string;
  barn_id: string;
  invoice_number: string;
  billable_to_user_id: string | null;
  billable_to_name: string | null;
  issue_date: string;
  due_date: string | null;
  status: "draft" | "sent" | "paid" | "overdue" | "void" | "partial";
  subtotal: number;
  paid_amount: number;
  paid_at: string | null;
  notes: string | null;
  terms: string | null;
  // Snapshot of branding at send time
  logo_url: string | null;
  company_name: string | null;
  company_address: string | null;
  company_phone: string | null;
  company_email: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string | null;
  sent_at: string | null;
}

/** public.barn_photos */
export interface BarnPhoto {
  id: string;
  barn_id: string;
  photo_url: string;
  caption: string | null;
  sort_order: number;
  created_at: string;
}

/** public.barn_members */
export interface BarnMember {
  id: string;
  barn_id: string;
  user_id: string;
  role: string;
  status: "active" | "disabled";
  created_at: string;
}

/** public.access_keys (formerly barn_keys) — barn & stall invite keys */
export interface AccessKey {
  id: string;
  barn_id: string;
  key_type: "barn" | "stall";
  horse_id: string | null;
  label: string | null;
  token_hash: string | null;
  key_code: string;
  permission_level: "viewer" | "editor";
  max_uses: number | null;
  times_used: number;
  is_active: boolean;
  created_at: string;
  expires_at: string | null;
}

/** @deprecated Use AccessKey */
export type BarnKey = AccessKey;

/** public.barn_access_requests */
export interface BarnAccessRequest {
  id: string;
  barn_id: string;
  user_id: string;
  status: "pending" | "approved" | "denied";
  created_at: string;
}

/** public.key_redemptions */
export interface KeyRedemption {
  id: string;
  access_key_id: string;
  user_id: string;
  redeemed_at: string;
}

/** public.key_requests */
export interface KeyRequest {
  id: string;
  barn_id: string;
  requester_id: string;
  full_name: string | null;
  email: string | null;
  desired_role: string;
  message: string | null;
  status: "pending" | "approved" | "denied";
  created_at: string;
}

/** public.user_horse_access — individual horse access via stall keys */
export interface UserHorseAccess {
  id: string;
  user_id: string;
  horse_id: string;
  source_key_id: string | null;
  created_at: string;
}

/** public.horses */
export interface Horse {
  id: string;
  barn_id: string;
  created_by: string | null;
  name: string;
  barn_name: string | null;
  /** Which name is the primary display name across the app.
   *  'papered' = horses.name (registered/papered name, default).
   *  'barn'    = horses.barn_name (nickname). */
  primary_name_pref: "papered" | "barn";
  breed: string | null;
  sex: string | null;
  color: string | null;
  foal_date: string | null;
  owner_name: string | null;
  sire: string | null;
  dam: string | null;
  registration_number: string | null;
  microchip_number: string | null;
  photo_url: string | null;
  qr_code: string;
  /** Care card fields — publicly visible */
  feed_regimen: string | null;
  supplements: string | null;
  special_care_notes: string | null;
  turnout_schedule: string | null;
  archived: boolean;
  breeding_only: boolean;
  /** Service Barn quick-record flag. True = this horse is a minimal
   *  "line in the notebook" for a service provider, not a full profile.
   *  Only the five fields below are expected to be populated. */
  is_quick_record: boolean;
  /** Quick-record contact info. Null on full horse profiles. */
  owner_contact_name: string | null;
  owner_contact_phone: string | null;
  owner_contact_email: string | null;
  /** Free-text physical location for quick records (e.g. "Smith Ranch
   *  on Williamson Valley Rd"). Null on full profiles. */
  location_name: string | null;
  created_at: string;
  updated_at: string;
  /** Breeding extensions */
  breeding_role: "donor" | "recipient" | "stallion" | "multiple" | "none" | null;
  reproductive_status: "open" | "in_cycle" | "bred" | "confirmed_pregnant" | "foaling" | "post_foaling" | "retired" | null;
  recipient_herd_id: string | null;
  stallion_stud_fee: number | null;
  lifetime_embryo_count: number;
  lifetime_live_foal_count: number;
  lifetime_loss_count: number;
  sire_horse_id: string | null;
  dam_horse_id: string | null;
  /** Lifecycle disposition (Breeders Pro) — what happened to this horse
   *  as an asset in the program. Distinct from reproductive_status. */
  disposition?: "sold" | "died" | "retired" | null;
  disposition_date?: string | null;
  disposition_notes?: string | null;
  disposition_sold_to?: string | null;
  disposition_sale_price?: number | null;
}

/** public.locations — Breeders Pro per-barn facility registry */
export interface Location {
  id: string;
  barn_id: string;
  facility_name: string;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state_province: string | null;
  postal_code: string | null;
  country: string | null;
  notes: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
  created_by_user_id: string | null;
}

/** public.horse_location_assignments — historical log entry */
export interface HorseLocationAssignment {
  id: string;
  barn_id: string;
  horse_id: string;
  location_id: string;
  started_at: string;
  ended_at: string | null;
  note: string | null;
  created_at: string;
  created_by_user_id: string | null;
}

/** public.horse_current_location — read-only view of the active assignment */
export interface HorseCurrentLocation {
  horse_id: string;
  barn_id: string;
  assignment_id: string | null;
  location_id: string | null;
  facility_name: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state_province: string | null;
  postal_code: string | null;
  country: string | null;
  assignment_note: string | null;
  started_at: string | null;
}

/** public.flushes */
export interface Flush {
  id: string;
  barn_id: string;
  donor_horse_id: string;
  stallion_horse_id: string | null;
  external_stallion_name: string | null;
  external_stallion_registration: string | null;
  flush_date: string;
  veterinarian_name: string | null;
  breeding_method: "ai_fresh" | "ai_cooled" | "ai_frozen" | "live_cover";
  embryo_count: number;
  flush_cost: number | null;
  notes: string | null;
  photos: Json | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

/** public.embryos */
export interface Embryo {
  id: string;
  barn_id: string;
  flush_id: string;
  donor_horse_id: string;
  stallion_horse_id: string | null;
  external_stallion_name: string | null;
  embryo_code: string;
  label: string | null;
  grade: "grade_1" | "grade_2" | "grade_3" | "grade_4" | "degenerate";
  stage: "morula" | "early_blastocyst" | "blastocyst" | "expanded_blastocyst" | "hatched_blastocyst";
  status: "in_bank_fresh" | "in_bank_frozen" | "transferred" | "became_foal" | "lost" | "shipped_out";
  storage_facility: string | null;
  storage_tank: string | null;
  storage_cane: string | null;
  storage_position: string | null;
  freeze_date: string | null;
  freeze_method: "vitrification" | "slow_freeze" | null;
  loss_reason: "degenerated" | "transfer_failure" | "early_pregnancy_loss" | "late_pregnancy_loss" | "other" | null;
  loss_date: string | null;
  loss_notes: string | null;
  shipped_to: string | null;
  ship_date: string | null;
  sale_price: number | null;
  notes: string | null;
  photo_url: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export type PregnancyCheckValue = "pending" | "confirmed" | "not_pregnant" | "not_done";

/** public.pregnancies */
export interface Pregnancy {
  id: string;
  barn_id: string;
  embryo_id: string | null; // null for live cover pregnancies
  surrogate_horse_id: string;
  donor_horse_id: string;
  stallion_horse_id: string | null;
  transfer_date: string;
  transfer_veterinarian_name: string | null;
  expected_foaling_date: string | null;
  status: "pending_check" | "confirmed" | "lost_early" | "lost_late" | "foaled" | "aborted";
  conception_method: "embryo_transfer" | "live_cover" | "ai_fresh" | "ai_cooled" | "ai_frozen";
  cover_method: string | null;
  cover_count: number | null;
  cover_cost: number | null;
  semen_source: string | null;
  collection_date: string | null;
  insemination_technique: string | null;
  semen_volume_ml: number | null;
  motility_percent: number | null;
  semen_dose: string | null;
  check_14_day: PregnancyCheckValue;
  check_30_day: PregnancyCheckValue;
  check_45_day: PregnancyCheckValue;
  check_60_day: PregnancyCheckValue;
  check_90_day: PregnancyCheckValue;
  loss_date: string | null;
  loss_reason: string | null;
  notes: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

/** public.foalings */
export interface Foaling {
  id: string;
  barn_id: string;
  pregnancy_id: string;
  surrogate_horse_id: string;
  foal_horse_id: string | null;
  foaling_date: string;
  foaling_time: string | null;
  foaling_type: "normal" | "assisted" | "dystocia" | "c_section" | "stillborn";
  foal_sex: "colt" | "filly";
  foal_color: string | null;
  foal_markings: string | null;
  birth_weight_lbs: number | null;
  placenta_passed_normally: boolean | null;
  iga_test_result: "adequate" | "marginal" | "failure" | "not_tested" | null;
  foal_alive_at_24hr: boolean | null;
  foal_alive_at_30d: boolean | null;
  complications: string | null;
  attending_vet_name: string | null;
  photos: Json | null;
  notes: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

/** public.financial_records */
export interface FinancialRecord {
  id: string;
  barn_id: string;
  flush_id: string | null;
  embryo_id: string | null;
  pregnancy_id: string | null;
  horse_id: string | null;
  category: string;
  amount: number;
  record_date: string;
  vendor: string | null;
  paid: boolean;
  notes: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

/** public.barn_stall_blocks */
export interface BarnStallBlock {
  id: string;
  barn_id: string;
  block_size: number;
  price_cents: number;
  stripe_subscription_item_id: string | null;
  status: "active" | "pending_cancel" | "cancelled";
  /** true = block was comped during early access. Used to find these users
   *  later when billing flips on. */
  is_free_promo: boolean;
  added_at: string;
  added_by_user_id: string | null;
  cancelled_at: string | null;
}

/** public.service_barn_links — join table connecting a Service Barn to
 *  horses at other BarnBook barns that the linker has Stall Key access
 *  to. Not a copy — the horse lives at its real barn. */
export interface ServiceBarnLink {
  id: string;
  service_barn_id: string;
  horse_id: string;
  linked_by_user_id: string;
  notes: string | null;
  created_at: string;
}

/** public.module_trials — 30-day free-trial record for a premium module. */
export interface ModuleTrial {
  id: string;
  user_id: string;
  module: "breeders_pro" | "business_pro";
  started_at: string;
  expires_at: string;
  converted_at: string | null;
  status: "active" | "expired" | "converted";
  created_at: string;
}

/** public.module_subscriptions — active subscription (no Stripe yet). */
export interface ModuleSubscription {
  id: string;
  user_id: string;
  module: "breeders_pro" | "business_pro";
  price_cents: number;
  status: "active" | "cancelled" | "past_due";
  started_at: string;
  cancelled_at: string | null;
  created_at: string;
}

/** public.paywall_interest */
export interface PaywallInterest {
  id: string;
  user_id: string | null;
  barn_id: string | null;
  plan_requested: string;
  email: string;
  message: string | null;
  created_at: string;
  contacted_at: string | null;
}

/** public.admin_audit_log */
export interface AdminAuditLog {
  id: string;
  admin_user_id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  details: Json | null;
  created_at: string;
}

/** public.activity_log */
export interface ActivityLog {
  id: string;
  horse_id: string;
  logged_by: string | null;
  activity_type: string;
  notes: string | null;
  distance: number | null;
  duration_minutes: number;
  speed_avg: number | null;
  details: Json | null;
  logged_at_barn_id: string | null;
  updated_at: string | null;
  updated_by_user_id: string | null;
  performed_by_user_id: string | null;
  performed_by_name: string | null;
  performed_at: string | null;
  total_cost: number | null;
  // ── Business Pro financial fields (nullable) ──
  cost_type: "expense" | "revenue" | "pass_through" | null;
  billable_to_user_id: string | null;
  billable_to_name: string | null;
  payment_status: "unpaid" | "paid" | "partial" | "waived" | null;
  paid_at: string | null;
  paid_amount: number | null;
  invoice_id: string | null;
  created_at: string;
  /** 'planned' = scheduled for the future (or overdue), 'completed' =
   *  the work was actually performed. Existing rows default to
   *  'completed'; only the Service Barn schedule path sets 'planned'. */
  status: "planned" | "completed";
  /** True if the entry was originally created via scheduleEntryAction
   *  (i.e., planned ahead). Survives the planned→completed flip so the
   *  UI can distinguish proactive work from ad-hoc logs. */
  was_scheduled: boolean;
}

/** public.health_records */
export interface HealthRecord {
  id: string;
  horse_id: string;
  record_type: string;
  provider_name: string | null;
  description: string | null;
  notes: string | null;
  record_date: string;
  next_due_date: string | null;
  document_url: string | null;
  details: Json | null;
  logged_by: string | null;
  logged_at_barn_id: string | null;
  updated_at: string | null;
  updated_by_user_id: string | null;
  performed_by_user_id: string | null;
  performed_by_name: string | null;
  performed_at: string | null;
  total_cost: number | null;
  // ── Business Pro financial fields (nullable) ──
  cost_type: "expense" | "revenue" | "pass_through" | null;
  billable_to_user_id: string | null;
  billable_to_name: string | null;
  payment_status: "unpaid" | "paid" | "partial" | "waived" | null;
  paid_at: string | null;
  paid_amount: number | null;
  invoice_id: string | null;
  created_at: string;
  /** 'planned' = scheduled for the future (or overdue), 'completed' =
   *  the work was actually performed. Existing rows default to
   *  'completed'; only the Service Barn schedule path sets 'planned'. */
  status: "planned" | "completed";
  /** True if the entry was originally created via scheduleEntryAction
   *  (i.e., planned ahead). Survives the planned→completed flip so the
   *  UI can distinguish proactive work from ad-hoc logs. */
  was_scheduled: boolean;
}

/** public.log_entry_line_items */
export interface LogEntryLineItem {
  id: string;
  log_type: "activity" | "health";
  log_id: string;
  description: string;
  amount: number;
  sort_order: number;
  created_at: string;
}

/** public.horse_stays */
export interface HorseStay {
  id: string;
  horse_id: string;
  home_barn_id: string;
  host_barn_id: string;
  start_date: string;
  end_date: string | null;
  status: "active" | "completed" | "cancelled";
  created_by_user_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** public.log_media */
export interface LogMedia {
  id: string;
  log_type: "activity" | "health";
  log_id: string;
  media_type: "photo" | "video";
  url: string;
  thumbnail_url: string | null;
  caption: string | null;
  sort_order: number;
  created_at: string;
}

/** public.horse_biometric_embeddings */
export interface HorseBiometricEmbedding {
  horse_id: string;
  pose_key: string;
  embedding: Json;
  photo_url: string | null;
  updated_at: string;
}

export type ProfileInsert = {
  id: string;
  full_name?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  updated_at?: string;
};

export type ProfileUpdate = Partial<Omit<Profile, "id">>;

export type BarnInsert = {
  id?: string;
  name: string;
  owner_id?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  phone?: string | null;
  logo_url?: string | null;
  banner_url?: string | null;
  about?: string | null;
  website?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  public_email?: string | null;
  public_phone?: string | null;
  barn_type?: "standard" | "mare_motel" | "service";
  plan_tier?: "free" | "paid" | "comped";
  base_stalls?: number;
  plan_started_at?: string | null;
  plan_notes?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type BarnUpdate = Partial<Omit<Barn, "id">>;

export type BarnPhotoInsert = {
  id?: string;
  barn_id: string;
  photo_url: string;
  caption?: string | null;
  sort_order?: number;
  created_at?: string;
};

export type BarnMemberInsert = {
  id?: string;
  barn_id: string;
  user_id: string;
  role?: string;
  status?: "active" | "disabled";
  created_at?: string;
};

export type BarnMemberUpdate = Partial<Omit<BarnMember, "id" | "barn_id" | "user_id">>;

export type AccessKeyInsert = {
  id?: string;
  barn_id: string;
  key_type: "barn" | "stall";
  horse_id?: string | null;
  label?: string | null;
  token_hash?: string | null;
  key_code: string;
  permission_level?: "viewer" | "editor";
  max_uses?: number | null;
  times_used?: number;
  is_active?: boolean;
  created_at?: string;
  expires_at?: string | null;
};

/** @deprecated Use AccessKeyInsert */
export type BarnKeyInsert = AccessKeyInsert;

export type UserHorseAccessInsert = {
  id?: string;
  user_id: string;
  horse_id: string;
  source_key_id?: string | null;
  created_at?: string;
};

export type HorseInsert = {
  id?: string;
  barn_id: string;
  created_by?: string | null;
  name: string;
  barn_name?: string | null;
  breed?: string | null;
  sex?: string | null;
  color?: string | null;
  foal_date?: string | null;
  owner_name?: string | null;
  sire?: string | null;
  dam?: string | null;
  registration_number?: string | null;
  microchip_number?: string | null;
  photo_url?: string | null;
  qr_code: string;
  feed_regimen?: string | null;
  supplements?: string | null;
  special_care_notes?: string | null;
  turnout_schedule?: string | null;
  breeding_role?: "donor" | "recipient" | "stallion" | "multiple" | "none" | null;
  reproductive_status?: string | null;
  recipient_herd_id?: string | null;
  stallion_stud_fee?: number | null;
  sire_horse_id?: string | null;
  dam_horse_id?: string | null;
  // Service Barn quick-record fields
  is_quick_record?: boolean;
  owner_contact_name?: string | null;
  owner_contact_phone?: string | null;
  owner_contact_email?: string | null;
  location_name?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type HorseUpdate = Partial<Omit<Horse, "id" | "created_at">>;

export type HorseStayInsert = {
  id?: string;
  horse_id: string;
  home_barn_id: string;
  host_barn_id: string;
  start_date?: string;
  end_date?: string | null;
  status?: "active" | "completed" | "cancelled";
  created_by_user_id?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type LogMediaInsert = {
  id?: string;
  log_type: "activity" | "health";
  log_id: string;
  media_type: "photo" | "video";
  url: string;
  thumbnail_url?: string | null;
  caption?: string | null;
  sort_order?: number;
  created_at?: string;
};

export type ActivityLogInsert = {
  id?: string;
  horse_id: string;
  logged_by?: string | null;
  activity_type: string;
  notes?: string | null;
  distance?: number | null;
  duration_minutes: number;
  speed_avg?: number | null;
  details?: Json | null;
  logged_at_barn_id?: string | null;
  created_at?: string;
};

export type ActivityLogUpdate = Partial<
  Omit<ActivityLog, "id" | "horse_id">
>;

export type HealthRecordInsert = {
  id?: string;
  horse_id: string;
  record_type: string;
  provider_name?: string | null;
  description?: string | null;
  notes?: string | null;
  record_date: string;
  next_due_date?: string | null;
  document_url?: string | null;
  details?: Json | null;
  logged_by?: string | null;
  logged_at_barn_id?: string | null;
  created_at?: string;
};

export type HealthRecordUpdate = Partial<
  Omit<HealthRecord, "id" | "horse_id">
>;

export type HorseBiometricEmbeddingInsert = {
  horse_id: string;
  pose_key: string;
  embedding: Json;
  photo_url?: string | null;
  updated_at?: string;
};

export type HorseBiometricEmbeddingUpdate = Partial<
  Omit<HorseBiometricEmbedding, "horse_id" | "pose_key">
>;

type R = Record<string, unknown>;

/** Supabase client generic — `& R` satisfies @supabase/postgrest-js `GenericTable` Row/Insert/Update */
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile & R;
        Insert: ProfileInsert & R;
        Update: ProfileUpdate & R;
        Relationships: [];
      };
      barns: {
        Row: Barn & R;
        Insert: BarnInsert & R;
        Update: BarnUpdate & R;
        Relationships: [];
      };
      barn_members: {
        Row: BarnMember & R;
        Insert: BarnMemberInsert & R;
        Update: BarnMemberUpdate & R;
        Relationships: [];
      };
      barn_photos: {
        Row: BarnPhoto & R;
        Insert: BarnPhotoInsert & R;
        Update: Partial<Omit<BarnPhoto, "id">> & R;
        Relationships: [];
      };
      access_keys: {
        Row: AccessKey & R;
        Insert: AccessKeyInsert & R;
        Update: Partial<AccessKey> & R;
        Relationships: [];
      };
      key_redemptions: {
        Row: KeyRedemption & R;
        Insert: {
          id?: string;
          access_key_id: string;
          user_id: string;
          redeemed_at?: string;
        } & R;
        Update: Partial<Omit<KeyRedemption, "id">> & R;
        Relationships: [];
      };
      key_requests: {
        Row: KeyRequest & R;
        Insert: {
          id?: string;
          barn_id: string;
          requester_id: string;
          full_name?: string | null;
          email?: string | null;
          desired_role?: string;
          message?: string | null;
          status?: "pending" | "approved" | "denied";
          created_at?: string;
        } & R;
        Update: Partial<Omit<KeyRequest, "id">> & R;
        Relationships: [];
      };
      barn_access_requests: {
        Row: BarnAccessRequest & R;
        Insert: {
          id?: string;
          barn_id: string;
          user_id: string;
          status?: "pending" | "approved" | "denied";
          created_at?: string;
        } & R;
        Update: Partial<Omit<BarnAccessRequest, "id">> & R;
        Relationships: [];
      };
      user_horse_access: {
        Row: UserHorseAccess & R;
        Insert: UserHorseAccessInsert & R;
        Update: Partial<Omit<UserHorseAccess, "id">> & R;
        Relationships: [];
      };
      horses: {
        Row: Horse & R;
        Insert: HorseInsert & R;
        Update: HorseUpdate & R;
        Relationships: [];
      };
      activity_log: {
        Row: ActivityLog & R;
        Insert: ActivityLogInsert & R;
        Update: ActivityLogUpdate & R;
        Relationships: [];
      };
      health_records: {
        Row: HealthRecord & R;
        Insert: HealthRecordInsert & R;
        Update: HealthRecordUpdate & R;
        Relationships: [];
      };
      horse_stays: {
        Row: HorseStay & R;
        Insert: HorseStayInsert & R;
        Update: Partial<Omit<HorseStay, "id">> & R;
        Relationships: [];
      };
      log_media: {
        Row: LogMedia & R;
        Insert: LogMediaInsert & R;
        Update: Partial<Omit<LogMedia, "id">> & R;
        Relationships: [];
      };
      horse_biometric_embeddings: {
        Row: HorseBiometricEmbedding & R;
        Insert: HorseBiometricEmbeddingInsert & R;
        Update: HorseBiometricEmbeddingUpdate & R;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      redeem_access_key: {
        Args: { p_raw_code: string; p_user_id: string };
        Returns: Json;
      };
    };
  };
};
