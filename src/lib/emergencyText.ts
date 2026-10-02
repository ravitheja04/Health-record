import { ageFrom, formatDate } from './format';
import type { EmergencyContact, EmergencyInfo, Member } from './types';

/** QR codes stay easy to scan from a phone screen below about this many characters. */
export const QR_TEXT_LIMIT = 600;

export function emptyEmergencyInfo(memberId: string): EmergencyInfo {
  return { memberId, contacts: [], doctorName: '', doctorPhone: '', insurer: '', policyNumber: '', notes: '', updatedAt: '' };
}

/** Keeps the digits and a leading "+", which is all a dialler needs. */
export function dialable(phone: string) {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/[^\d]/g, '');
  if (digits.length < 3) return null;
  return trimmed.startsWith('+') ? `+${digits}` : digits;
}

/**
 * Splits the old free-text "Emergency contact" field (e.g. "Ravi (son) 98765 43210")
 * into a contact, so existing data shows up on the card.
 */
export function contactFromText(text: string): EmergencyContact | null {
  const clean = text.trim();
  if (!clean) return null;
  const match = /(\+?\d[\d\s-]{6,}\d)/.exec(clean);
  const phone = match ? match[1].replace(/\s+/g, ' ').trim() : '';
  let rest = match ? clean.replace(match[1], ' ') : clean;
  let relation = '';
  const rel = /\(([^)]+)\)/.exec(rest);
  if (rel) {
    relation = rel[1].trim();
    rest = rest.replace(rel[0], ' ');
  }
  const name = rest.replace(/[,:;|/-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!name && !phone) return null;
  return { name: name || 'Emergency contact', relation, phone };
}

/** Contacts to show: the card's own, or one recovered from the member's old free-text field. */
export function cardContacts(member: Pick<Member, 'emergencyContact'>, info: EmergencyInfo | null) {
  const own = (info?.contacts ?? []).filter((c) => c.name.trim() || c.phone.trim());
  if (own.length) return own;
  const legacy = contactFromText(member.emergencyContact);
  return legacy ? [legacy] : [];
}

function clip(text: string, max: number) {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * Plain text of the card, readable by any phone camera from the QR code and
 * pasteable into a phone's own emergency/Medical ID settings.
 */
export function emergencyText(
  member: Pick<Member, 'name' | 'dob' | 'gender' | 'bloodGroup' | 'allergies' | 'conditions' | 'medications' | 'emergencyContact'>,
  info: EmergencyInfo | null,
  medicines: string[],
  today: string,
  limit = QR_TEXT_LIMIT
) {
  const age = ageFrom(member.dob);
  const basics = [age !== null ? `${age} yrs` : null, member.gender, member.bloodGroup ? `Blood group ${member.bloodGroup}` : null]
    .filter(Boolean)
    .join(', ');
  const meds = [...medicines, ...(member.medications.trim() ? [member.medications] : [])].join('; ');
  const contacts = cardContacts(member, info);

  const lines = [
    'EMERGENCY MEDICAL INFORMATION',
    `Name: ${clip(member.name, 60)}`,
    basics ? basics : null,
    `ALLERGIES: ${member.allergies.trim() ? clip(member.allergies, 200) : 'None known'}`,
    member.conditions.trim() ? `Conditions: ${clip(member.conditions, 200)}` : null,
    meds ? `Medicines: ${clip(meds, 250)}` : null,
    ...contacts
      .slice(0, 3)
      .map((c) => `Contact: ${clip([c.name, c.relation ? `(${c.relation})` : ''].filter(Boolean).join(' '), 40)} ${c.phone}`.trim()),
    info?.doctorName || info?.doctorPhone ? `Doctor: ${clip(`${info.doctorName} ${info.doctorPhone}`, 60)}` : null,
    info?.insurer || info?.policyNumber
      ? `Insurance: ${clip([info.insurer, info.policyNumber ? `policy ${info.policyNumber}` : ''].filter(Boolean).join(', '), 80)}`
      : null,
    info?.notes.trim() ? `Notes: ${clip(info.notes, 200)}` : null,
    `Updated ${formatDate(today)}`,
  ].filter((l): l is string => !!l);

  let text = lines.join('\n');
  // Drop optional lines from the end until it fits; the name, allergies and first contact stay.
  const optional = ['Notes: ', 'Insurance: ', 'Doctor: ', 'Medicines: ', 'Conditions: '];
  for (const prefix of optional) {
    if (text.length <= limit) break;
    text = text
      .split('\n')
      .filter((l) => !l.startsWith(prefix))
      .join('\n');
  }
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

/** UTF-8 bytes, so names in any Indian script survive the QR code. */
export function utf8Bytes(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}
