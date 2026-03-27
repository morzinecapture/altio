// ─── Core domain types for Altio ─────────────────────────────────────────────

// ─── Mission statuses ────────────────────────────────────────────────────────

export type MissionStatus =
  | 'pending'
  | 'pending_provider_approval'
  | 'assigned'
  | 'in_progress'
  | 'awaiting_payment'
  | 'validated'
  | 'completed'
  | 'paid'
  | 'cancelled'
  | 'dispute'
  | 'expired'
  | 'rejected'
  | 'quote_submitted'
  | 'quote_sent'
  | 'quote_accepted'
  | 'quote_refused';

export type EmergencyStatus =
  | 'open'
  | 'bids_open'
  | 'provider_accepted'
  | 'bid_accepted'
  | 'displacement_paid'
  | 'on_site'
  | 'quote_submitted'
  | 'quote_sent'
  | 'quote_accepted'
  | 'quote_refused'
  | 'in_progress'
  | 'completed';

export type ApplicationStatus = 'pending' | 'accepted' | 'rejected';
export type BidStatus = 'pending' | 'accepted' | 'rejected';
export type QuoteStatus = 'pending' | 'sent' | 'accepted' | 'refused';
export type InvoiceType = 'mandate' | 'owner_fee' | 'provider_commission';
export type UserRole = 'owner' | 'provider' | 'admin';

// ─── Property ────────────────────────────────────────────────────────────────

export interface Property {
  id: string;
  owner_id: string;
  name: string;
  address: string;
  type?: string;
  property_type?: string;
  access_code?: string;
  instructions?: string;
  deposit_location?: string;
  linen_instructions?: string;
  photos?: string[];
  latitude?: number;
  longitude?: number;
  fixed_rate?: number;
  ical_url?: string;
  ical_airbnb_url?: string;
  ical_booking_url?: string;
  last_ical_sync?: string;
  created_at: string;
  updated_at?: string;
}

export interface CreatePropertyPayload {
  name: string;
  address: string;
  type?: string;
  property_type?: string;
  access_code?: string;
  instructions?: string;
  deposit_location?: string;
  linen_instructions?: string;
  photos?: string[];
  fixed_rate?: number;
  ical_url?: string;
  ical_airbnb_url?: string;
  ical_booking_url?: string;
}

export type UpdatePropertyPayload = Partial<CreatePropertyPayload>;

// ─── User / Profile ──────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string;
  picture?: string;
  role: UserRole;
  is_admin?: boolean;
  suspended?: boolean;
  suspended_at?: string | null;
  suspended_reason?: string | null;
  onboarding_completed?: boolean;
  owner_type?: string;
  company_name?: string;
  siren?: string;
  vat_number?: string;
  billing_address?: string;
  is_vat_exempt?: boolean;
  cgu_accepted_at?: string;
  mandate_accepted_at?: string;
  dsa_certified_at?: string;
  marketing_consent_at?: string | null;
  expo_push_token?: string;
  google_calendar_token?: string | null;
  google_calendar_refresh_token?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface ProviderProfile {
  provider_id: string;
  specialties: string[];
  company_type?: string;
  radius_km: number;
  weekly_availability?: string[];
  available?: boolean;
  latitude?: number;
  longitude?: number;
  rating?: number;
  total_reviews?: number;
  total_earnings?: number;
  bio?: string;
  zone?: string;
  siret?: string;
  company_name?: string;
  tva_status?: string;
  verified?: boolean;
  rc_pro_verified?: boolean;
  decennale_verified?: boolean;
  rc_pro_doc_url?: string;
  decennale_doc_url?: string;
  documents?: ProviderDocument[];
  user?: { id?: string; name?: string; picture?: string; email?: string; [key: string]: unknown };
}

export interface ProviderDocument {
  type: string;
  url?: string;
  status: 'pending' | 'approved' | 'rejected';
  reject_reason?: string;
}

export interface UserWithProfile extends User {
  provider_profile?: ProviderProfile;
}

export interface UpdateProviderProfilePayload {
  specialties?: string[];
  company_type?: string;
  radius_km?: number;
  weekly_availability?: string[];
  available?: boolean;
  latitude?: number;
  longitude?: number;
  bio?: string;
  zone?: string;
  siret?: string;
  company_name?: string;
  tva_status?: string;
  documents?: ProviderDocument[];
  rc_pro_doc_url?: string;
  decennale_doc_url?: string;
}

// ─── Mission ─────────────────────────────────────────────────────────────────

export interface Mission {
  id: string;
  owner_id: string;
  property_id: string;
  assigned_provider_id?: string | null;
  mission_type: string;
  status: MissionStatus;
  description?: string;
  scheduled_date?: string;
  fixed_rate?: number;
  favorites_only_until?: string | null;
  payment_intent_id?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  validated_at?: string | null;
  paid_at?: string | null;
  cancelled_at?: string | null;
  dispute_reason?: string | null;
  dispute_at?: string | null;
  dispute_resolution?: string | null;
  dispute_resolved_at?: string | null;
  dispute_resolved_by?: string | null;
  created_at: string;
  updated_at?: string;
}

/** Enriched mission returned by getMissions (merged with property data) */
export interface MergedMission extends Mission {
  mission_id: string;
  property_name?: string;
  property_address?: string;
  property_city?: string;
  access_code?: string;
  instructions?: string;
  deposit_location?: string;
  linen_instructions?: string;
  property_lat?: number;
  property_lng?: number;
  is_emergency: boolean;
  /** Mission pricing mode */
  mode?: string;
  /** Number of applications received */
  applications_count?: number;
  /** Only present on mapped emergencies */
  raw_status?: string;
  /** Joined property object from Supabase */
  property?: {
    name?: string;
    address?: string;
    access_code?: string;
    instructions?: string;
    deposit_location?: string;
    linen_instructions?: string;
    latitude?: number;
    longitude?: number;
  };
  /** Joined applications for detail view */
  applications?: MissionApplicationEnriched[];
  /** Joined photos for detail view */
  photos?: MissionPhoto[];
}

export interface MissionPhoto {
  photo_url: string;
  uploaded_at: string;
}

export interface CreateMissionPayload {
  property_id: string;
  mission_type: string;
  description?: string;
  scheduled_date?: string;
  fixed_rate?: number;
  assigned_provider_id?: string | null;
  mode?: string;
  status?: string;
}

// ─── Mission Application ─────────────────────────────────────────────────────

export interface MissionApplication {
  id: string;
  mission_id: string;
  provider_id: string;
  proposed_rate?: number;
  message?: string;
  status: ApplicationStatus;
  created_at: string;
}

export interface MissionApplicationEnriched extends MissionApplication {
  provider_name?: string;
  provider_picture?: string;
  provider_rating?: number;
  provider_reviews?: number;
  is_verified?: boolean;
  provider?: {
    name?: string;
    picture?: string;
    profile?: { rating?: number; total_reviews?: number } | Array<{ rating?: number; total_reviews?: number }>;
  };
}

export interface ApplyToMissionPayload {
  proposed_rate?: number;
  message?: string;
}

// ─── Emergency ───────────────────────────────────────────────────────────────

export interface EmergencyRequest {
  id: string;
  owner_id: string;
  property_id?: string;
  service_type: string;
  description?: string;
  status: EmergencyStatus;
  accepted_provider_id?: string | null;
  displacement_fee?: number;
  diagnostic_fee?: number;
  repair_cost?: number;
  response_deadline?: string;
  quote_payment_id?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at?: string;
  /** Joined property */
  property?: {
    name?: string;
    address?: string;
    latitude?: number;
    longitude?: number;
  };
  /** Joined provider */
  provider?: {
    name?: string;
    picture?: string;
  };
  /** Enriched fields */
  property_name?: string;
  property_address?: string;
  property_lat?: number;
  property_lng?: number;
  provider_name?: string;
  provider_picture?: string;
  /** Bids and quote populated by getEmergency */
  bids?: EmergencyBidEnriched[];
  quote?: QuoteWithLineItems | null;
}

export interface CreateEmergencyPayload {
  property_id: string;
  service_type: string;
  description?: string;
}

export interface AcceptEmergencyPayload {
  displacement_fee?: number;
  diagnostic_fee?: number;
}

export interface CompleteEmergencyPayload {
  repair_cost?: number;
}

// ─── Emergency Bids ──────────────────────────────────────────────────────────

export interface EmergencyBid {
  id: string;
  emergency_request_id: string;
  provider_id: string;
  travel_cost: number;
  diagnostic_cost: number;
  estimated_arrival: string;
  status: BidStatus;
  created_at: string;
}

export interface EmergencyBidEnriched extends EmergencyBid {
  provider_name?: string;
  provider_picture?: string;
  provider_rating?: number;
  provider_reviews?: number;
  provider_siret?: string;
  provider_company?: string;
  provider_tva_status?: string;
  provider?: {
    name?: string;
    picture?: string;
    profile?: { rating?: number; total_reviews?: number; siret?: string; company_name?: string; tva_status?: string } | Array<{ rating?: number; total_reviews?: number; siret?: string; company_name?: string; tva_status?: string }>;
  };
}

// ─── Quotes ──────────────────────────────────────────────────────────────────

export interface Quote {
  id: string;
  emergency_request_id?: string;
  mission_id?: string;
  provider_id: string;
  description?: string;
  repair_cost: number;
  repair_delay_days?: number;
  status: QuoteStatus;
  stripe_capture_deadline?: string;
  owner_signature_at?: string | null;
  owner_signature_text?: string | null;
  owner_signature_ip?: string | null;
  quote_number?: string | null;
  quote_document_url?: string | null;
  refusal_reason?: string | null;
  created_at: string;
}

export interface QuoteLineItem {
  id: string;
  quote_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  sort_order: number;
  unit?: string;
  unit_price_ht?: string | number;
  total_ht?: string | number;
}

export interface QuoteWithLineItems extends Quote {
  line_items: QuoteLineItem[];
  quote_document_url?: string;
  quote_number?: string;
}

export interface QuoteDetailMission {
  id?: string;
  mission_type?: string;
  description?: string;
  property?: { name?: string; address?: string };
  [key: string]: unknown;
}

export interface QuoteDetailEmergency {
  id?: string;
  service_type?: string;
  description?: string;
  property?: { name?: string; address?: string };
  [key: string]: unknown;
}

export interface QuoteDetailEnriched extends QuoteWithLineItems {
  provider_name?: string;
  provider_picture?: string;
  provider_email?: string;
  provider_rating?: number;
  provider_reviews?: number;
  provider_specialties?: string[];
  provider_bio?: string;
  provider_zone?: string;
  provider_siret?: string;
  provider_company?: string;
  provider_tva_status?: string;
  tva_rate?: number;
  valid_until?: string;
  expires_at?: string;
  quote_document_url?: string;
  quote_number?: string;
  estimated_start_date?: string;
  conditions?: string;
  mission?: QuoteDetailMission | null;
  emergency?: QuoteDetailEmergency | null;
}

export interface CreateQuotePayload {
  emergency_request_id: string;
  description?: string;
  repair_cost: number;
  repair_delay_days?: number;
}

// ─── Invoice ─────────────────────────────────────────────────────────────────

export type InvoiceStatus = 'draft' | 'issued' | 'sent' | 'paid' | 'overdue' | 'cancelled';

export interface Invoice {
  id: string;
  invoice_number: string;
  invoice_type: InvoiceType;
  seller_id: string;
  buyer_id: string;
  mission_id?: string;
  emergency_id?: string;
  amount_ht: number;
  tva_rate: number;
  tva_amount: number;
  amount_ttc: number;
  status: InvoiceStatus;
  pdf_url?: string;
  facturx_url?: string;
  created_at: string;
  issued_at?: string;
  paid_at?: string;
  due_date?: string;
  description?: string;
  mandate_reference?: string;
  /** Joined relations */
  mission?: { mission_type?: string; description?: string; property?: { name?: string; address?: string } };
  emergency?: { service_type?: string; description?: string };
  seller?: InvoiceParty;
  buyer?: InvoiceParty;
}

export interface InvoiceParty {
  name?: string;
  company_name?: string;
  siren?: string;
  vat_number?: string;
  billing_address?: string;
  is_vat_exempt?: boolean;
}

// ─── Notification ────────────────────────────────────────────────────────────

export interface AppNotification {
  notification_id: string;
  type: string;
  title: string;
  body: string;
  reference_id?: string | null;
  read: boolean;
  created_at: string;
}

// ─── Push notification data ──────────────────────────────────────────────────

export interface PushNotificationData {
  missionId?: string;
  emergencyId?: string;
  quoteId?: string;
  [key: string]: string | undefined;
}

// ─── Schedule ────────────────────────────────────────────────────────────────

export interface ScheduleItem {
  id: string;
  mission_id: string | null;
  title: string;
  address: string;
  is_emergency: boolean;
  is_reservation?: boolean;
  source?: string;
  check_in?: string;
  check_out?: string;
  scheduled_at: string;
  duration_minutes: number | null;
}

// ─── Dashboard types ─────────────────────────────────────────────────────────

export interface OwnerDashboardData {
  properties_count: number;
  pending_missions: number;
  active_missions: number;
  upcoming_missions: MergedMission[];
  completed_missions_total?: number;
}

export interface ProviderStats {
  total_earnings: number;
  rating: number;
  total_reviews: number;
  completed_missions: number;
  in_progress_missions: number;
  pending_applications: number;
  recent_missions: RecentMission[];
}

export interface RecentMission {
  mission_id: string;
  mission_type?: string;
  description?: string;
  fixed_rate: number;
  completed_at?: string;
  property_name?: string;
  is_emergency: boolean;
}

// ─── Admin types ─────────────────────────────────────────────────────────────

export interface AdminStats {
  total_users?: number;
  total_owners?: number;
  total_providers?: number;
  total_missions?: number;
  active_missions?: number;
  active_missions_count?: number;
  total_emergencies?: number;
  active_emergencies?: number;
  total_volume?: number;
  commissions_this_month?: number;
  new_users_30d?: number;
  failed_payments_48h?: number;
  providers_pending_verification?: number;
  owners_count?: number;
  providers_count?: number;
  completed_missions_total?: number;
  [key: string]: unknown;
}

export interface AdminUserListItem {
  id: string;
  name: string;
  email: string;
  role: string;
  is_admin?: boolean;
  suspended?: boolean;
  created_at: string;
  onboarding_completed?: boolean;
}

export interface AdminUserDetail {
  user: User | null;
  provider: ProviderProfile | null;
  missions: Array<{
    id: string;
    status: string;
    mission_type: string;
    scheduled_date?: string;
    fixed_rate?: number;
    created_at: string;
  }>;
  audit: AuditLogEntry[];
}

export interface AuditLogEntry {
  id: string;
  admin_id: string;
  action: string;
  target_type: string;
  target_id?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface AdminFinances {
  commissions_this_month: number;
  volume_this_month: number;
  paid_missions_count: number;
  total_volume: number;
  recent_missions: Array<MissionFinanceRow>;
}

export interface MissionFinanceRow {
  id: string;
  status: string;
  mission_type: string;
  fixed_rate?: number;
  created_at: string;
  property_name?: string;
}

// ─── Partner ─────────────────────────────────────────────────────────────────

export interface LocalPartner {
  id: string;
  name: string;
  category: string;
  zone: string;
  description?: string;
  logo_url?: string;
  brochure_url?: string;
  phone?: string;
  website?: string;
  address?: string;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface CreatePartnerPayload {
  name: string;
  category: string;
  zone: string;
  description?: string;
  logo_url?: string;
  brochure_url?: string;
  phone?: string;
  website?: string;
  address?: string;
}

export type UpdatePartnerPayload = Partial<CreatePartnerPayload & { is_active: boolean }>;

// ─── Review ──────────────────────────────────────────────────────────────────

export interface Review {
  id: string;
  mission_id: string;
  owner_id: string;
  provider_id: string;
  rating: number;
  comment?: string | null;
  provider_response?: string | null;
  provider_response_at?: string | null;
  created_at: string;
  /** Joined owner */
  owner?: { name?: string; picture?: string };
}

// ─── Messages ────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  mission_id?: string | null;
  emergency_id?: string | null;
  created_at: string;
  sender?: { name?: string; picture?: string };
  receiver?: { name?: string; picture?: string };
}

// ─── Reservation ─────────────────────────────────────────────────────────────

export interface Reservation {
  id: string;
  property_id: string;
  guest_name?: string;
  check_in: string;
  check_out: string;
  source?: string;
  property?: { name?: string; address?: string };
}

// ─── Favorites ───────────────────────────────────────────────────────────────

export interface FavoriteProvider {
  id: string;
  owner_id: string;
  provider_id: string;
  created_at: string;
  provider?: {
    id: string;
    name: string;
    picture?: string;
    profile?: { specialties?: string[]; rating?: number; total_reviews?: number } | Array<{ specialties?: string[]; rating?: number; total_reviews?: number }>;
  };
}

// ─── Stripe / Payment ────────────────────────────────────────────────────────

export interface PaymentIntentResult {
  clientSecret: string;
  paymentIntentId: string;
}

export interface PaymentMetadata {
  missionId?: string;
  emergencyId?: string;
  type?: string;
  [key: string]: string | undefined;
}

// ─── Supabase error helper type ──────────────────────────────────────────────

export interface SupabaseError {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}

export interface FunctionsInvokeError {
  message: string;
  context?: {
    json?: () => Promise<Record<string, unknown>>;
    text?: () => Promise<string>;
  };
}
