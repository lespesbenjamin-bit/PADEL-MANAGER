export type GroupStatus = "active" | "suspended" | "archived";
export type CycleStatus = "upcoming" | "in_progress" | "completed" | "archived";
export type SessionStatus = "planned" | "validated" | "cancelled";
export type SessionKind = "regular" | "exceptional" | "makeup";
export type AttendanceStatus = "present" | "absent" | "excused" | "unknown";

export interface Group {
  id: string;
  name: string;
  level: string;
  weekday: number;
  start_time: string;
  end_time: string;
  capacity: number;
  status: GroupStatus;
  color: string;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
}

export interface GroupOverview extends Group {
  member_count: number;
  cycle_id: string | null;
  cycle_number: number | null;
  cycle_name: string | null;
  planned_sessions: number | null;
  realized: number | null;
  remaining: number | null;
  progress: number | null;
  projected_end_date: string | null;
  cycle_status: CycleStatus | null;
  next_session_date: string | null;
  pending_count: number;
}

export interface CycleStats {
  id: string;
  group_id: string;
  cycle_number: number;
  name: string | null;
  planned_sessions: number;
  start_date: string;
  status: "active" | "completed" | "archived";
  notes: string | null;
  group_name: string;
  level: string;
  weekday: number;
  start_time: string;
  end_time: string;
  capacity: number;
  color: string;
  group_status: GroupStatus;
  realized: number;
  cancelled: number;
  scheduled: number;
  planned_left: number;
  pending: number;
  next_date: string | null;
  first_date: string;
  remaining: number;
  progress: number;
  projected_end_date: string | null;
  effective_status: CycleStatus;
}

export interface VSession {
  id: string;
  group_id: string;
  cycle_id: string | null;
  session_date: string;
  start_time: string;
  end_time: string;
  status: SessionStatus;
  kind: SessionKind;
  counts_in_cycle: boolean;
  original_date: string | null;
  rescheduled: boolean;
  cancel_reason: string | null;
  notes: string | null;
  validated_at: string | null;
  version: number;
  group_name: string;
  group_level: string;
  capacity: number;
  color: string;
  group_status: GroupStatus;
  cycle_number: number | null;
  cycle_name: string | null;
  planned_sessions: number | null;
  cycle_index: number | null;
  member_count: number;
  present_count: number;
  attendance_count: number;
  pending_validation: boolean;
}

export interface Player {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  level: string | null;
  notes: string | null;
  archived_at: string | null;
}

export interface PlayerStats extends Player {
  credits_balance: number;
  credits_consumed: number;
  credits_purchased: number;
  sessions_played: number;
  group_names: string[];
  packages_count: number;
}

export interface Membership {
  id: string;
  group_id: string;
  player_id: string;
  joined_on: string;
  left_on: string | null;
  players?: Player;
  groups?: Pick<Group, "id" | "name" | "level" | "status" | "weekday" | "start_time" | "color">;
}

export interface Attendance {
  id: string;
  session_id: string;
  player_id: string;
  status: AttendanceStatus;
  consume_credit: boolean;
  is_guest: boolean;
  note: string | null;
  players?: Player;
}

export interface PackageRow {
  id: string;
  player_id: string;
  label: string;
  total_credits: number;
  price: number | null;
  purchased_on: string;
  expires_on: string | null;
  notes: string | null;
  remaining: number;
  consumed: number;
}

export interface CreditTx {
  id: string;
  player_id: string;
  package_id: string | null;
  session_id: string | null;
  kind: "purchase" | "consume" | "refund" | "adjust";
  delta: number;
  note: string | null;
  created_at: string;
  sessions?: { session_date: string; groups?: { name: string } | null } | null;
}

export interface Revision {
  id: string;
  session_id: string;
  revision: number;
  action: string;
  snapshot: {
    session: Partial<VSession>;
    attendances: Attendance[];
  };
  reason: string | null;
  created_at: string;
}
