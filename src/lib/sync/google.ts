import Constants from 'expo-constants';

/**
 * Google sign-in for family sync, asking only for the `drive.file`
 * permission (files this app creates). The keys come from the build
 * (app.config.js reads them from GitHub secrets); see docs/google-drive-setup.md.
 */

const SCOPE = 'https://www.googleapis.com/auth/drive.file';

type Extra = { googleWebClientId?: string; googleApiKey?: string };
const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

export const googleApiKey = extra.googleApiKey ?? '';
/** False in builds made without the Google keys, so the app can explain instead of failing. */
export const syncConfigured = !!googleApiKey;

type Module = typeof import('@react-native-google-signin/google-signin');
let loaded: Promise<Module> | null = null;

function load() {
  loaded ??= import('@react-native-google-signin/google-signin').then((m) => {
    m.GoogleSignin.configure({ scopes: [SCOPE], ...(extra.googleWebClientId ? { webClientId: extra.googleWebClientId } : {}) });
    return m;
  });
  loaded.catch(() => {
    loaded = null;
  });
  return loaded;
}

export type GoogleAccount = { email: string; name: string | null };

const toAccount = (u: { user: { email: string; name: string | null } } | null): GoogleAccount | null =>
  u ? { email: u.user.email, name: u.user.name } : null;

/** The account signed in earlier, restored without showing anything. */
export async function restoreGoogleAccount(): Promise<GoogleAccount | null> {
  try {
    const { GoogleSignin } = await load();
    const res = await GoogleSignin.signInSilently();
    return res.type === 'success' ? toAccount(res.data) : null;
  } catch {
    return null;
  }
}

export async function signInWithGoogle(): Promise<GoogleAccount | null> {
  const { GoogleSignin, isErrorWithCode, statusCodes } = await load();
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const res = await GoogleSignin.signIn();
    return res.type === 'success' ? toAccount(res.data) : null;
  } catch (e) {
    if (isErrorWithCode(e) && e.code === statusCodes.IN_PROGRESS) return null;
    if (isErrorWithCode(e) && String(e.code) === '10') {
      // DEVELOPER_ERROR: the Android OAuth client doesn't match this app's package name and signing key.
      throw new Error('Google sign-in isn’t set up for this app yet (DEVELOPER_ERROR). Check the Android OAuth client in the setup guide.');
    }
    throw e;
  }
}

export async function signOutOfGoogle() {
  const { GoogleSignin } = await load();
  await GoogleSignin.signOut();
}

export async function googleAccessToken(): Promise<string | null> {
  try {
    const { GoogleSignin } = await load();
    if (!GoogleSignin.hasPreviousSignIn()) return null;
    if (!GoogleSignin.getCurrentUser()) await GoogleSignin.signInSilently();
    return (await GoogleSignin.getTokens()).accessToken;
  } catch {
    return null;
  }
}

export async function dropGoogleToken(token: string) {
  const { GoogleSignin } = await load();
  await GoogleSignin.clearCachedAccessToken(token);
}
