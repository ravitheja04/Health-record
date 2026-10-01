import type { SQLiteDatabase } from 'expo-sqlite';

import type { Attachment, MedicalRecord, Member } from './types';

export const DATABASE_NAME = 'family-health.db';
const SCHEMA_VERSION = 2;

/** Runs once when the SQLiteProvider opens the database. */
export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  if (current >= SCHEMA_VERSION) return;

  if (current < 1) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS members (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        relation TEXT NOT NULL DEFAULT '',
        dob TEXT,
        gender TEXT,
        bloodGroup TEXT,
        allergies TEXT NOT NULL DEFAULT '',
        conditions TEXT NOT NULL DEFAULT '',
        medications TEXT NOT NULL DEFAULT '',
        emergencyContact TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        color TEXT NOT NULL DEFAULT '#2563EB',
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS records (
        id TEXT PRIMARY KEY NOT NULL,
        memberId TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        date TEXT NOT NULL,
        doctor TEXT NOT NULL DEFAULT '',
        facility TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS records_member_date ON records(memberId, date DESC);
      CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY NOT NULL,
        recordId TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        mimeType TEXT NOT NULL,
        fileName TEXT NOT NULL,
        size INTEGER NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS attachments_record ON attachments(recordId);
    `);
  }

  if (current < 2) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS lab_results (
        id TEXT PRIMARY KEY NOT NULL,
        recordId TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
        testKey TEXT NOT NULL,
        testName TEXT NOT NULL,
        value REAL NOT NULL,
        unit TEXT NOT NULL DEFAULT '',
        refLow REAL,
        refHigh REAL,
        createdAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS lab_results_record ON lab_results(recordId);
      CREATE INDEX IF NOT EXISTS lab_results_test ON lab_results(testKey);
    `);
  }

  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

// ---- Members ----------------------------------------------------------------

export function listMembers(db: SQLiteDatabase) {
  return db.getAllAsync<Member & { recordCount: number }>(
    `SELECT m.*, (SELECT COUNT(*) FROM records r WHERE r.memberId = m.id) AS recordCount
     FROM members m ORDER BY m.createdAt ASC`
  );
}

export function getMember(db: SQLiteDatabase, id: string) {
  return db.getFirstAsync<Member>('SELECT * FROM members WHERE id = ?', id);
}

export async function upsertMember(db: SQLiteDatabase, m: Member) {
  await db.runAsync(
    `INSERT INTO members (id, name, relation, dob, gender, bloodGroup, allergies, conditions,
       medications, emergencyContact, notes, color, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name, relation = excluded.relation, dob = excluded.dob,
       gender = excluded.gender, bloodGroup = excluded.bloodGroup, allergies = excluded.allergies,
       conditions = excluded.conditions, medications = excluded.medications,
       emergencyContact = excluded.emergencyContact, notes = excluded.notes,
       color = excluded.color, updatedAt = excluded.updatedAt`,
    m.id, m.name, m.relation, m.dob, m.gender, m.bloodGroup, m.allergies, m.conditions,
    m.medications, m.emergencyContact, m.notes, m.color, m.createdAt, m.updatedAt
  );
}

export async function deleteMember(db: SQLiteDatabase, id: string) {
  const files = await db.getAllAsync<Attachment>(
    `SELECT a.* FROM attachments a JOIN records r ON r.id = a.recordId WHERE r.memberId = ?`,
    id
  );
  await db.runAsync('DELETE FROM members WHERE id = ?', id);
  return files;
}

// ---- Records ----------------------------------------------------------------

export type RecordWithCount = MedicalRecord & { attachmentCount: number; memberName?: string; memberColor?: string };

export function listRecords(db: SQLiteDatabase, memberId: string) {
  return db.getAllAsync<RecordWithCount>(
    `SELECT r.*, (SELECT COUNT(*) FROM attachments a WHERE a.recordId = r.id) AS attachmentCount
     FROM records r WHERE r.memberId = ? ORDER BY r.date DESC, r.createdAt DESC`,
    memberId
  );
}

export function listRecentRecords(db: SQLiteDatabase, limit = 5) {
  return db.getAllAsync<RecordWithCount>(
    `SELECT r.*, m.name AS memberName, m.color AS memberColor,
       (SELECT COUNT(*) FROM attachments a WHERE a.recordId = r.id) AS attachmentCount
     FROM records r JOIN members m ON m.id = r.memberId
     ORDER BY r.date DESC, r.createdAt DESC LIMIT ?`,
    limit
  );
}

export function searchRecords(db: SQLiteDatabase, query: string) {
  const q = `%${query.trim()}%`;
  return db.getAllAsync<RecordWithCount>(
    `SELECT r.*, m.name AS memberName, m.color AS memberColor,
       (SELECT COUNT(*) FROM attachments a WHERE a.recordId = r.id) AS attachmentCount
     FROM records r JOIN members m ON m.id = r.memberId
     WHERE r.title LIKE ? OR r.doctor LIKE ? OR r.facility LIKE ? OR r.notes LIKE ? OR m.name LIKE ?
     ORDER BY r.date DESC LIMIT 100`,
    q, q, q, q, q
  );
}

export function getRecord(db: SQLiteDatabase, id: string) {
  return db.getFirstAsync<MedicalRecord>('SELECT * FROM records WHERE id = ?', id);
}

export async function upsertRecord(db: SQLiteDatabase, r: MedicalRecord) {
  await db.runAsync(
    `INSERT INTO records (id, memberId, type, title, date, doctor, facility, notes, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       memberId = excluded.memberId, type = excluded.type, title = excluded.title,
       date = excluded.date, doctor = excluded.doctor, facility = excluded.facility,
       notes = excluded.notes, updatedAt = excluded.updatedAt`,
    r.id, r.memberId, r.type, r.title, r.date, r.doctor, r.facility, r.notes, r.createdAt, r.updatedAt
  );
}

export async function deleteRecord(db: SQLiteDatabase, id: string) {
  const files = await listAttachments(db, id);
  await db.runAsync('DELETE FROM records WHERE id = ?', id);
  return files;
}

// ---- Attachments ------------------------------------------------------------

export function listAttachments(db: SQLiteDatabase, recordId: string) {
  return db.getAllAsync<Attachment>(
    'SELECT * FROM attachments WHERE recordId = ? ORDER BY createdAt ASC',
    recordId
  );
}

export async function insertAttachment(db: SQLiteDatabase, a: Attachment) {
  await db.runAsync(
    `INSERT OR REPLACE INTO attachments (id, recordId, name, mimeType, fileName, size, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    a.id, a.recordId, a.name, a.mimeType, a.fileName, a.size, a.createdAt
  );
}

export async function deleteAttachmentRow(db: SQLiteDatabase, id: string) {
  await db.runAsync('DELETE FROM attachments WHERE id = ?', id);
}
