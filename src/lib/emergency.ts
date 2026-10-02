import type { SQLiteDatabase } from 'expo-sqlite';

import type { EmergencyContact, EmergencyInfo } from './types';

type Row = Omit<EmergencyInfo, 'contacts'> & { contacts: string };

function parseContacts(json: string): EmergencyContact[] {
  try {
    const value: unknown = JSON.parse(json);
    if (!Array.isArray(value)) return [];
    return value
      .filter((c): c is EmergencyContact => !!c && typeof c.name === 'string' && typeof c.phone === 'string')
      .map((c) => ({ name: c.name, relation: typeof c.relation === 'string' ? c.relation : '', phone: c.phone }));
  } catch {
    return [];
  }
}

export async function getEmergencyInfo(db: SQLiteDatabase, memberId: string): Promise<EmergencyInfo | null> {
  const row = await db.getFirstAsync<Row>('SELECT * FROM emergency_info WHERE memberId = ?', memberId);
  return row ? { ...row, contacts: parseContacts(row.contacts) } : null;
}

export async function upsertEmergencyInfo(db: SQLiteDatabase, info: EmergencyInfo) {
  await db.runAsync(
    `INSERT INTO emergency_info (memberId, contacts, doctorName, doctorPhone, insurer, policyNumber, notes, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(memberId) DO UPDATE SET
       contacts = excluded.contacts, doctorName = excluded.doctorName, doctorPhone = excluded.doctorPhone,
       insurer = excluded.insurer, policyNumber = excluded.policyNumber, notes = excluded.notes,
       updatedAt = excluded.updatedAt`,
    info.memberId, JSON.stringify(info.contacts), info.doctorName, info.doctorPhone, info.insurer, info.policyNumber,
    info.notes, info.updatedAt
  );
}

export async function listEmergencyInfo(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<Row>('SELECT * FROM emergency_info');
  return rows.map((row) => ({ ...row, contacts: parseContacts(row.contacts) }));
}
