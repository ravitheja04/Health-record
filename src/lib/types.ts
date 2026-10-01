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
