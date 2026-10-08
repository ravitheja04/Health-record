import { Appearance, AppState } from 'react-native';

import type { ThemePref } from '@/lib/settings';
import { applyPalette } from './ui';

/**
 * Light or dark: follows the phone, or the choice made in Settings (which is
 * also handed to the OS so date pickers and alerts match). When it changes the
 * shared palette is swapped and subscribers (the root layout) re-render.
 */

type Scheme = 'light' | 'dark';

let pref: ThemePref = 'system';

const current = (): Scheme => (pref !== 'system' ? pref : Appearance.getColorScheme() === 'dark' ? 'dark' : 'light');

let scheme: Scheme = current();
applyPalette(scheme);

const listeners = new Set<() => void>();

function update() {
  // Phones can briefly report the other scheme while taking the app-switcher
  // snapshot; only follow changes while the app is in front.
  if (AppState.currentState !== 'active') return;
  const next = current();
  if (next === scheme) return;
  scheme = next;
  applyPalette(next);
  listeners.forEach((l) => l());
}

Appearance.addChangeListener(update);
AppState.addEventListener('change', update);

export function setThemePref(next: ThemePref) {
  pref = next;
  // Native date pickers and alerts follow the app's choice too (not available on web).
  Appearance.setColorScheme?.(next === 'system' ? 'unspecified' : next);
  update();
}

export function subscribeTheme(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getScheme() {
  return scheme;
}
