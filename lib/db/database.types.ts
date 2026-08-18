/* ============================================================================
   Database types for the M0 schema.

   Hand-written for now because `npm run db:types` needs a linked Supabase
   project. Once one exists, regenerate and let the generated file win:

     npm run db:types

   Keep this in sync with supabase/migrations/* until then. The shapes below
   are the ones the isolation suite exercises, so a drift shows up as a type
   error in tests before it shows up in production.
   ========================================================================= */

export type GymRole =
  | "owner"
  | "manager"
  | "trainer"
  | "receptionist"
  | "nutritionist"
  | "member";

export type MembershipStatus =
  | "pending"
  | "active"
  | "expiring"
  | "expired"
  | "frozen"
  | "cancelled";

export type PaymentStatus =
  | "pending"
  | "processing"
  | "paid"
  | "failed"
  | "refunded";

export type PaymentMethod =
  | "cash"
  | "upi"
  | "card"
  | "netbanking"
  | "bank_transfer"
  | "other";

export type CheckinMethod = "qr" | "manual" | "pin" | "member_id" | "phone";

export type NotificationChannel =
  | "whatsapp"
  | "sms"
  | "email"
  | "push"
  | "in_app";

export type NotificationStatus =
  | "queued"
  | "sending"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "cancelled";

/* ── row shapes ───────────────────────────────────────────────────────────── */

export interface Gym {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  currency: string;
  timezone: string;
  reminder_hour: number;
  onboarding_state: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  date_of_birth: string | null;
  created_at: string;
  updated_at: string;
}

export interface GymUser {
  id: string;
  gym_id: string;
  user_id: string;
  role: GymRole;
  is_active: boolean;
  revoked_at: string | null;
  created_at: string;
}

export interface RolePermission {
  role: GymRole;
  module: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  scope: "all" | "assigned" | "own" | "none";
}

export interface Member {
  id: string;
  gym_id: string;
  /** Null for reception-created members with no app login. Never assume set. */
  user_id: string | null;
  member_code: string;
  full_name: string;
  phone: string;
  email: string | null;
  date_of_birth: string | null;
  gender: string | null;
  address: string | null;
  photo_url: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  height_cm: number | null;
  goal: string | null;
  fitness_level: string | null;
  target_weight_kg: number | null;
  injuries: string | null;
  joined_on: string;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface MemberConsent {
  id: string;
  gym_id: string;
  member_id: string;
  consent_type: "waiver" | "terms" | "data_processing" | "marketing" | "guardian";
  granted: boolean;
  guardian_name: string | null;
  guardian_phone: string | null;
  guardian_relationship: string | null;
  verification_method: string | null;
  document_url: string | null;
  granted_at: string;
  withdrawn_at: string | null;
  recorded_by: string | null;
  ip_address: string | null;
}

export interface Plan {
  id: string;
  gym_id: string;
  name: string;
  duration_days: number;
  /** Money is paise (bigint), never float. Arrives from PostgREST as string. */
  price_paise: string;
  joining_fee_paise: string;
  pt_sessions: number;
  freeze_days_allowed: number;
  description: string | null;
  is_visible_to_members: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Membership {
  id: string;
  gym_id: string;
  member_id: string;
  plan_id: string;
  status: MembershipStatus;
  started_on: string;
  expires_on: string;
  price_paise: string;
  discount_paise: string;
  auto_renew: boolean;
  renewed_from: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface Branch {
  id: string;
  gym_id: string;
  name: string;
  address: string | null;
  is_primary: boolean;
  created_at: string;
}

export type EquipmentCategory =
  | "machine"
  | "free_weight"
  | "cable"
  | "cardio"
  | "bench_rack"
  | "accessory";

export type EquipmentStatus = "working" | "maintenance" | "out_of_order";

export interface Equipment {
  id: string;
  gym_id: string;
  name: string;
  category: EquipmentCategory;
  brand: string | null;
  model: string | null;
  quantity: number;
  status: EquipmentStatus;
  photo_url: string | null;
  purchased_on: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MembershipFreeze {
  id: string;
  gym_id: string;
  membership_id: string;
  starts_on: string;
  days: number;
  reason: string | null;
  previous_expires_on: string;
  new_expires_on: string;
  created_by: string | null;
  created_at: string;
}

/* ── the shape @supabase/supabase-js expects ──────────────────────────────── */

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      gyms: Table<Gym>;
      branches: Table<Branch>;
      profiles: Table<Profile>;
      gym_users: Table<GymUser>;
      role_permissions: Table<RolePermission>;
      members: Table<Member>;
      member_consents: Table<MemberConsent>;
      plans: Table<Plan>;
      memberships: Table<Membership>;
      membership_freezes: Table<MembershipFreeze>;
      equipment: Table<Equipment>;
    };
    Views: Record<never, never>;
    Functions: {
      next_expiry: {
        Args: {
          p_current_expiry: string | null;
          p_duration_days: number;
          p_today?: string;
        };
        Returns: string;
      };
      has_permission: {
        Args: { p_module: string; p_action: string };
        Returns: boolean;
      };
      permission_scope: {
        Args: { p_module: string };
        Returns: string;
      };
    };
    Enums: {
      gym_role: GymRole;
      membership_status: MembershipStatus;
      payment_status: PaymentStatus;
      payment_method: PaymentMethod;
      checkin_method: CheckinMethod;
      notification_channel: NotificationChannel;
      notification_status: NotificationStatus;
    };
    CompositeTypes: Record<never, never>;
  };
}
