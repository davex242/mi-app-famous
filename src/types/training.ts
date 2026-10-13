// Host Training & Development — Stage 1 type contracts.
// These are PREPARATORY interfaces only. No tables, buckets or backend exist yet.
// Host and AppUser contracts are intentionally NOT modified; links to them are by id only.

export type TrainingStatus = 'draft' | 'in_review' | 'published' | 'archived';
export type TrainingMaterialKind = 'document' | 'video' | 'image' | 'link' | 'slides';

/** Dynamic catalog entry, editable by subadmin and superadmin. */
export interface TrainingTopic {
  id: string;
  title: string;
  description: string;
  category: string;
  status: TrainingStatus;
  estimated_minutes: number;
  created_by: string; // AppUser.id
  created_at: string;
  updated_at: string;
}

/** Downloadable / previewable material attached to a topic. */
export interface TrainingMaterial {
  id: string;
  topic_id: string;
  title: string;
  kind: TrainingMaterialKind;
  storage_path: string | null; // reserved for a future private bucket
  external_url: string | null;
  allow_download: boolean;
  allow_preview: boolean;
  status: TrainingStatus;
  created_by: string;
  created_at: string;
}

export interface ProgramDay {
  day: number; // 1..14 in the initial flexible program
  topic_ids: string[];
  notes?: string;
}

/** Versioned training program (initial flexible 14-day program). */
export interface TrainingProgramVersion {
  id: string;
  program_key: string;
  version: number;
  title: string;
  duration_days: number;
  days: ProgramDay[];
  status: TrainingStatus;
  is_optional_update: boolean; // updates are optional for in-progress enrollments
  changelog: string;
  published_by: string | null;
  published_at: string | null;
  created_at: string;
}

export type EnrollmentStatus = 'active' | 'paused' | 'completed' | 'cancelled';

/** A trainee (host) enrolled by a recruiter. Linked by id only. */
export interface TrainingEnrollment {
  id: string;
  host_id: string; // Host.id
  recruiter_id: string; // AppUser.id
  program_version_id: string;
  is_free_training: boolean;
  status: EnrollmentStatus;
  progress_percent: number; // preserved across optional program updates
  started_at: string;
  completed_at: string | null;
}

export type SessionStatus = 'scheduled' | 'completed' | 'missed' | 'rescheduled';

/** Agenda entry; auto-generated and editable. */
export interface TrainingSession {
  id: string;
  enrollment_id: string;
  topic_id: string;
  scheduled_at: string;
  duration_minutes: number;
  status: SessionStatus;
  auto_generated: boolean;
  edited_manually: boolean;
}

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export interface TrainingAttendance {
  id: string;
  session_id: string;
  status: AttendanceStatus;
  recorded_by: string;
  recorded_at: string;
}

export type EvidenceStatus = 'pending' | 'approved' | 'rejected';

/** Mandatory practical evidence submitted for a session/topic. */
export interface TrainingEvidence {
  id: string;
  enrollment_id: string;
  session_id: string | null;
  topic_id: string;
  description: string;
  storage_path: string | null;
  status: EvidenceStatus;
  submitted_at: string;
}

export interface TrainingAssessment {
  id: string;
  enrollment_id: string;
  topic_id: string;
  score: number | null;
  passed: boolean | null;
  notes: string;
  assessed_by: string;
  assessed_at: string;
}

export type ApprovalSubject = 'topic' | 'material' | 'program_version' | 'evidence' | 'assessment';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

/** Administrative validation record. */
export interface TrainingApproval {
  id: string;
  subject_type: ApprovalSubject;
  subject_id: string;
  status: ApprovalStatus;
  requested_by: string;
  reviewed_by: string | null;
  review_notes: string;
  requested_at: string;
  reviewed_at: string | null;
}

/** Final Quiz question. Correct answers are server-side only (Stage 2+); never ship them to clients. */
export interface ExamQuestion {
  id: string;
  exam_key: string;
  prompt: string;
  options: string[];
  // NOTE: no `correct_option` field on purpose — answer keys must never be exposed to the client.
  topic_id: string | null;
  status: TrainingStatus;
}

/** Public link assignment for the 50-question Final Quiz. Not active in Stage 1. */
export interface ExamAssignment {
  id: string;
  exam_key: string;
  question_count: number; // 50
  host_id: string; // result is linked to the host profile
  enrollment_id: string | null;
  public_token_hash: string | null;
  expires_at: string | null;
  status: 'inactive' | 'issued' | 'completed' | 'expired';
}

export interface ExamAttempt {
  id: string;
  assignment_id: string;
  started_at: string;
  submitted_at: string | null;
  score_percent: number | null;
  passed: boolean | null;
}

/** Helper type for UI placeholders that must be clearly labelled as demo data. */
export interface DemoFlag {
  isDemo: true;
}
