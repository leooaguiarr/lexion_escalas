export type Role = 'owner' | 'scheduler' | 'tech';
export type Status = 'active' | 'inactive';
export type ScheduleStatus = 'draft' | 'active' | 'closed';
export type AvailabilityStatus = 'available' | 'unavailable' | 'not_informed';
export type Preference = 'day' | 'night' | 'any';
export type PaymentStatus = 'pending_pickup' | 'picked_up';

export type Profile = {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  created_at?: string;
  updated_at?: string;
};

export type Guard = {
  id: string;
  full_name: string;
  short_name: string;
  phone: string;
  hourly_rate: number;
  status: Status;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
};

export type Location = {
  id: string;
  name: string;
  address: string | null;
  notes: string | null;
  status: Status;
  created_at?: string;
  updated_at?: string;
};

export type SchedulePeriod = {
  id: string;
  location_id: string;
  title: string;
  start_date: string;
  end_date: string;
  status: ScheduleStatus;
  notes: string | null;
  created_by: string | null;
  created_at?: string;
  updated_at?: string;
  locations?: Location;
};

export type ShiftTemplate = {
  id: string;
  schedule_period_id: string;
  name: string;
  start_time: string;
  end_time: string;
  position: number;
  hourly_rate: number;
  created_at?: string;
};

export type GuardAvailability = {
  id?: string;
  schedule_period_id: string;
  guard_id: string;
  availability_date: string;
  availability_status: AvailabilityStatus;
  preference: Preference;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ScheduleAssignment = {
  id?: string;
  schedule_period_id: string;
  shift_template_id: string;
  guard_id: string | null;
  service_date: string;
  planned_start: string;
  planned_end: string;
  planned_hours: number;
  completed: boolean | null;
  worked_hours: number | null;
  hourly_rate: number;
  total_amount: number;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
  guards?: Guard | null;
  shift_templates?: ShiftTemplate | null;
};

export type PaymentRecord = {
  id: string;
  schedule_period_id: string;
  guard_id: string;
  total_hours: number;
  hourly_rate: number;
  total_amount: number;
  status: PaymentStatus;
  picked_up_at: string | null;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
  guards?: Guard;
};
