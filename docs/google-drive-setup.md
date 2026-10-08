# Setting up family sync (Google Drive)

One-time setup, about 20 minutes, done once by whoever builds the app. **Everything here is free**: no billing account or card is needed.

You'll create three things in Google Cloud and paste two of them into GitHub:

| What | Where it goes |
| --- | --- |
| Android sign-in client | stays in Google Cloud (matched by the app's package name and signing key) |
| Web client ID | GitHub secret `GOOGLE_WEB_CLIENT_ID` |
| API key | GitHub secret `GOOGLE_API_KEY` |

Use a laptop if you can; the Cloud console is hard to use on a phone.

## 1. Create a Google Cloud project

1. Open <https://console.cloud.google.com> and sign in with your Google account.
2. At the top, click the project picker → **New project**. Name it `Family Health Registry` → **Create**, then select it.

## 2. Turn on the Google Drive API

1. Menu → **APIs & Services** → **Library**.
2. Search **Google Drive API** → open it → **Enable**.

## 3. Set up the sign-in screen (OAuth consent)

1. Menu → **APIs & Services** → **OAuth consent screen** (it may be called **Google Auth Platform**). Click **Get started** if asked.
2. **App name**: `Family Health Registry`. **User support email**: your email. → Next.
3. **Audience**: **External** → Next. **Contact information**: your email → Next → agree → **Create**.
4. Open **Data access** → **Add or remove scopes**. In "Manually add scopes" paste
   `https://www.googleapis.com/auth/drive.file` → **Add to table** → **Update** → **Save**.
   This is the only permission the app asks for: it can see and change **only the files it creates** in each person's Drive, nothing else.
5. Open **Audience** → under Publishing status click **Publish app** → **Confirm**, so it says **In production**.
   - This matters: in "Testing" mode Google signs everyone out every 7 days.
   - Because `drive.file` is a non-sensitive permission, publishing needs no review from Google.

## 4. Create the Android sign-in client

1. Open **Clients** (or **APIs & Services → Credentials**) → **Create client**.
2. **Application type**: **Android**. Name: `Family Health Registry Android`.
3. **Package name**: `com.healthrecord.familyregistry`
4. **SHA-1 certificate fingerprint**:
   `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`
5. **Create**. Nothing to copy from this one.

About the fingerprint:
- It belongs to the signing key the GitHub build uses for every APK. It's React Native's standard development key, so it never changes between builds.
- That key is public, which is fine for a family app installed from your own releases.
- If you later publish to the Play Store, you'll sign with your own key and add its SHA-1 here too.

## 5. Create the Web client ID

1. **Create client** again → **Application type**: **Web application**. Name: `Family Health Registry Web`.
2. Leave the URIs empty → **Create**.
3. Copy the **Client ID** (it ends in `.apps.googleusercontent.com`). You'll paste it into GitHub as `GOOGLE_WEB_CLIENT_ID`.

## 6. Create the API key

The app uses this key to read the family's shared (encrypted) files.

1. **APIs & Services** → **Credentials** → **Create credentials** → **API key**. Copy it; you'll paste it into GitHub as `GOOGLE_API_KEY`.
2. Click the key to edit it, then:
   - **API restrictions**: choose **Restrict key** → tick only **Google Drive API** → **Save**.
   - **Application restrictions**: leave **None**. The app calls Drive directly, and the Android restriction needs extra request headers the app doesn't send.

## 7. Add the two values to GitHub

1. Open the repository on GitHub → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
2. Name `GOOGLE_WEB_CLIENT_ID`, value: the Web client ID from step 5 → **Add secret**.
3. Name `GOOGLE_API_KEY`, value: the API key from step 6 → **Add secret**.

The next APK build (**Actions → Android APK → Run workflow**) includes them. Builds without them still work; the Family sync screen just explains that it isn't switched on.

## 8. Using it

The **main family member** (one person) keeps the whole family's records in their Google Drive. Nobody else needs to sign in to Google.

On the main family member's phone:

1. Open **Settings → Family sync**.
2. Give the phone a name (e.g. "Ravi's phone").
3. Tap **Link my Google Drive** and sign in.
4. After the first sync the phone shows the **family code** (QR code, or **Share code** for WhatsApp).

On everyone else's phone:

1. Open **Family sync**, name the phone, then **Scan code** (or **Paste code**) with the main member's code.
2. That's it: the whole family's records arrive, and keep arriving, from the main member's Drive.

Adding records on other phones (optional):

- **Automatically**: sign in with Google on that phone too (any Google account). It shows a code; the main member scans it once in Family sync. From then on its changes reach the main member's Drive, and from there everyone.
- **Without Google**: tap **Send my changes as a file** and send it (e.g. on WhatsApp) to the main member, who opens it in **Share & Sync → Import**.

Why other phones can't write straight into the main member's Drive: the app only asks for Google's narrowest Drive permission (files the app created, in your own Drive). Writing into someone else's Drive needs full Drive access, which Google only allows for apps that pass a paid security review.

Phones sync when the app opens or comes back to the front, and with **Sync now**.

## How it stays private

- Each phone stores its records in **its own** Drive, in a folder named "Family Health Registry (encrypted)". The folder holds one file for the records plus one file per photo or PDF.
- Every file is **AES-256-GCM encrypted** with the family key. The key is created on the first phone and only travels inside the family code. Google never has it, so Drive holds only scrambled data.
- Files are shared as "anyone with the link". That's how family phones read them without full Drive access. Someone who found a link would still see only scrambled data without the family code.
- **Treat the family code like a house key**: share it only with family. To start over with a new key, everyone taps **Stop family sync** and one phone starts again.

## Limits for now

- **Deletions don't sync**: deleting something on one phone leaves it on the others. Edits do sync, and the newest edit wins.
- **Sync only runs while the app is open**: a phone that's never opened won't pick up changes until it is.
- **Reminders don't carry over**: medicine reminders from other phones arrive switched off. Turn them on per medicine if you want them on this phone too.
