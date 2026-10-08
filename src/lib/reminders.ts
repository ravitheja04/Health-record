import * as Notifications from 'expo-notifications';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { todayIso } from './format';
import { addDays, daysOfSupply, isCurrent, isDueOn, needsRefill } from './medSchedule';
import { listMedications, type MedicationWithMember } from './meds';
import { listVaccinations } from './vaccines';
import { refreshMedicinesWidget } from '../widget/refresh';
import { t, tn } from '../i18n';

const CHANNEL_ID = 'medicine-reminders';
const PREFIXES = ['med:', 'refill:', 'vac:'];
/** Vaccines due within this many days get reminders; later ones are added as the date approaches. */
const VACCINE_DAYS = 90;
/** Medicines with an end date get one-off reminders for this many days ahead, refreshed when the app opens. */
const ONE_OFF_DAYS = 14;

export function configureNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Medicine & vaccination reminders',
    importance: Notifications.AndroidImportance.HIGH,
    description: 'Reminders to take medicines, refill them, and for vaccinations that are due',
  });
}

export async function hasNotificationPermission() {
  const { granted } = await Notifications.getPermissionsAsync();
  return granted;
}

/** Asks for permission to show reminders if it has not been decided yet. */
export async function requestNotificationPermission() {
  await ensureChannel();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

function content(med: MedicationWithMember) {
  const title = `${med.memberName}: ${med.name}${med.dose ? ` ${med.dose}` : ''}`;
  const body = med.instructions ? `Time for this dose · ${med.instructions}` : 'Time for this dose';
  return { title, body, data: { url: '/medicines' }, sound: true };
}

function at(date: string, time: string) {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  return new Date(y, m - 1, d, h, min);
}

/**
 * Rebuilds every medicine reminder on this phone from the database. Cheap
 * enough to call after any change and whenever the app opens.
 */
export async function syncReminders(db: SQLiteDatabase) {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => PREFIXES.some((p) => n.identifier.startsWith(p)))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
  if (!(await hasNotificationPermission())) return;
  await ensureChannel();

  const today = todayIso();
  const now = new Date();
  await scheduleVaccineReminders(db, today, now);

  const meds = (await listMedications(db)).filter((m) => m.remindersOn && isCurrent(m, today));

  for (const med of meds) {
    // Repeating reminders cannot stop on their own, so courses with an end date
    // (or a later start) get one-off reminders for the next two weeks instead.
    if (med.endDate !== null || med.startDate > today) {
      for (let i = 0; i < ONE_OFF_DAYS; i++) {
        const date = addDays(today, i);
        if (!isDueOn(med, date)) continue;
        for (const time of med.times) {
          const when = at(date, time);
          if (when <= now) continue;
          await Notifications.scheduleNotificationAsync({
            identifier: `med:${med.id}:${date}:${time}`,
            content: content(med),
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when, channelId: CHANNEL_ID },
          });
        }
      }
    } else {
      for (const time of med.times) {
        const [hour, minute] = time.split(':').map(Number);
        if (med.frequency === 'daily') {
          await Notifications.scheduleNotificationAsync({
            identifier: `med:${med.id}:${time}`,
            content: content(med),
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute, channelId: CHANNEL_ID },
          });
        } else {
          for (const day of med.days) {
            await Notifications.scheduleNotificationAsync({
              identifier: `med:${med.id}:${day}:${time}`,
              content: content(med),
              // Expo counts weekdays from 1 (Sunday); ours start at 0.
              trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: day + 1, hour, minute, channelId: CHANNEL_ID },
            });
          }
        }
      }
    }

    if (needsRefill(med, today)) {
      const days = daysOfSupply(med) ?? 0;
      const tomorrowMorning = at(addDays(today, 1), '09:00');
      await Notifications.scheduleNotificationAsync({
        identifier: `refill:${med.id}`,
        content: {
          title: t('Refill soon: {med}', { med: med.name }),
          body: tn(days, '{name} has about {n} day of {med} left.', '{name} has about {n} days of {med} left.')
            .replace('{name}', med.memberName)
            .replace('{med}', med.name),
          data: { url: '/medicines' },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: tomorrowMorning, channelId: CHANNEL_ID },
      });
    }
  }
}

async function scheduleVaccineReminders(db: SQLiteDatabase, today: string, now: Date) {
  const horizon = addDays(today, VACCINE_DAYS);
  const due = (await listVaccinations(db)).filter((v) => !v.givenDate && v.dueDate && v.dueDate >= today && v.dueDate <= horizon);
  for (const v of due) {
    const what = [v.name, v.dose].filter(Boolean).join(' · ');
    const reminders = [
      {
        date: addDays(v.dueDate!, -7),
        title: t('Vaccination next week: {what}', { what }),
        body: t('{name} is due on {date}.', { name: v.memberName, date: v.dueDate!.split('-').reverse().join('/') }),
      },
      {
        date: v.dueDate!,
        title: t('Vaccination due today: {what}', { what }),
        body: t('{name} is due today. Mark it as given once done.', { name: v.memberName }),
      },
    ];
    for (const r of reminders) {
      const when = at(r.date, '09:00');
      if (when <= now) continue;
      await Notifications.scheduleNotificationAsync({
        identifier: `vac:${v.id}:${r.date}`,
        content: { title: r.title, body: r.body, data: { url: `/vaccines/${v.memberId}` } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when, channelId: CHANNEL_ID },
      });
    }
  }
}

/** Fire-and-forget version for screens: reminders must never block saving data. */
/**
 * Brings everything that mirrors medicines and vaccinations up to date after a
 * change: phone reminders and the Android home-screen widget. Errors are ignored.
 */
export function syncRemindersQuietly(db: SQLiteDatabase) {
  syncReminders(db).catch(() => {});
  refreshMedicinesWidget(db);
}
