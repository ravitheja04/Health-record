import { getLocales } from 'expo-localization';

/** The phone's language code, e.g. "te" or "en". */
export const deviceLanguage = () => getLocales()[0]?.languageCode ?? null;
