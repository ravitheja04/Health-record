export type Member = {
  id: string;
  name: string;
  relation: string;
  dob: string | null;
  gender: string | null;
  bloodGroup: string | null;
  allergies: string;
  conditions: string;
  medications: string;
  emergencyContact: string;
  notes: string;
  color: string;
  createdAt: string;
  updatedAt: string;
};

export type RecordType =
  | 'lab'
  | 'prescription'
  | 'visit'
  | 'vaccination'
  | 'imaging'
  | 'procedure'
  | 'insurance'
  | 'other';

export type MedicalRecord = {
  id: string;
  memberId: string;
  type: RecordType;
  title: string;
  date: string;
  doctor: string;
  facility: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type Attachment = {
  id: string;
  recordId: string;
  name: string;
  mimeType: string;
  /** File name inside the app's attachments directory (not an absolute path). */
  fileName: string;
  size: number;
  createdAt: string;
};

export type LabResult = {
  id: string;
  recordId: string;
  /** Canonical test id from the catalog, or `custom:<name>` for tests the user typed. */
  testKey: string;
  testName: string;
  value: number;
  unit: string;
  /** Reference range as printed on the lab report; either end may be missing. */
  refLow: number | null;
  refHigh: number | null;
  createdAt: string;
};

export type MedFrequency = 'daily' | 'weekly';

export type Medication = {
  id: string;
  memberId: string;
  name: string;
  /** Free text such as "500 mg" or "1 tablet". */
  dose: string;
  /** When to take it, e.g. "After food". */
  instructions: string;
  /** Dose times as 24-hour "HH:MM", sorted. */
  times: string[];
  frequency: MedFrequency;
  /** For weekly medicines: weekdays 0 (Sunday) to 6 (Saturday). */
  days: number[];
  startDate: string;
  /** Last day to take it; null while ongoing. */
  endDate: string | null;
  /** Tablets or doses left; null when not tracked. */
  stock: number | null;
  /** How many units one dose uses up. */
  perDose: number;
  /** Whether this phone shows reminders for it. Not shared with other phones. */
  remindersOn: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type DoseStatus = 'taken' | 'skipped';

export type DoseLog = {
  id: string;
  medicationId: string;
  date: string;
  time: string;
  status: DoseStatus;
  loggedAt: string;
};

export type Vaccination = {
  id: string;
  memberId: string;
  /** Vaccine name, e.g. "MMR". */
  name: string;
  /** Which dose, e.g. "Dose 1" or "Booster 1". */
  dose: string;
  /** When it is due; null when no date is known ("as advised"). */
  dueDate: string | null;
  /** When it was given; null while still due. */
  givenDate: string | null;
  facility: string;
  notes: string;
  /** The medical record created when it was given (holds the certificate). */
  recordId: string | null;
  /** Template entry it came from, e.g. "iap:mmr-1", so a schedule is never added twice. */
  scheduleKey: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EmergencyContact = {
  name: string;
  /** e.g. "Son", "Neighbour" */
  relation: string;
  phone: string;
};

/** Extra details for a member's emergency card; health details live on the member. */
export type EmergencyInfo = {
  memberId: string;
  contacts: EmergencyContact[];
  doctorName: string;
  doctorPhone: string;
  insurer: string;
  policyNumber: string;
  /** Anything a responder should know, e.g. "Has a pacemaker". */
  notes: string;
  updatedAt: string;
};

export const RECORD_TYPES: Record<RecordType, { label: string; icon: string; color: string }> = {
  lab: { label: 'Lab report', icon: 'flask-outline', color: '#7C3AED' },
  prescription: { label: 'Prescription', icon: 'medkit-outline', color: '#DB2777' },
  visit: { label: 'Doctor visit', icon: 'pulse-outline', color: '#2563EB' },
  vaccination: { label: 'Vaccination', icon: 'shield-checkmark-outline', color: '#059669' },
  imaging: { label: 'Scan / Imaging', icon: 'scan-outline', color: '#0891B2' },
  procedure: { label: 'Surgery / Procedure', icon: 'cut-outline', color: '#DC2626' },
  insurance: { label: 'Insurance', icon: 'document-text-outline', color: '#CA8A04' },
  other: { label: 'Other', icon: 'folder-outline', color: '#64748B' },
};

export const RELATIONS = ['Self', 'Spouse', 'Child', 'Parent', 'Sibling', 'Grandparent', 'Other'];
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
export const GENDERS = ['Female', 'Male', 'Other'];
export const MEMBER_COLORS = ['#2563EB', '#DB2777', '#059669', '#D97706', '#7C3AED', '#0891B2', '#DC2626', '#4B5563'];
