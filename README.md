# Health-record

One place for family health: a mobile app for **Android and iOS** that keeps every family member's medical reports in one registry and makes them easy to share with the rest of the family.

Built with [Expo](https://expo.dev) (SDK 57, React Native, TypeScript, Expo Router).

## Features

- **Family members**: a profile for each person with relation, date of birth, gender, blood group, allergies, medical conditions, current medications, emergency contact and notes. Allergies are highlighted wherever the person appears.
- **Medical records**: lab reports, prescriptions, doctor visits, vaccinations, scans/imaging, surgeries/procedures, insurance and other documents. Each record has a date, doctor, hospital/lab and notes/results.
- **Attachments**: photograph a report with the camera, pick photos, or attach PDFs and images from Files/Drive/iCloud. Files are copied into the app's private storage.
- **Lab trends**: type in the values from each lab report (about 30 common tests, grouped into panels like Diabetes, Lipid profile, Thyroid; or any custom test). Each person gets a trends view showing which tests are out of the report's range, a chart per test over time with the normal range shaded, how often it is tested, and a side-by-side comparison of any two reports. Changes are marked as moving toward or away from the report's range; the app never diagnoses.
- **Medicines & reminders**: each person's medicines with dose, food instructions, times of day, every day or chosen weekdays, and start/end dates for courses. A "Today" checklist for the whole family (tick when taken, or mark skipped), phone notifications at each dose time, and tablets-left tracking with a refill warning when about 5 days remain. Reminders are per phone: shared medicines arrive with reminders off.
- **Search** across all records by title, doctor, hospital, notes or family member name.
- **Share with family**: export the whole family, or a single person, as one data file (records and attachments included). Send it by WhatsApp, email, AirDrop, Nearby Share, Drive, and so on. Family members use **Import data file** to merge it into their own app. New entries are added, and when two phones edited the same entry the newest edit wins.
- **Share with doctors**: generate a clean PDF health summary for a person, or a PDF of a single record with its images embedded.
- **Private by default**: data lives on the device in SQLite. There are no accounts, no servers and no analytics.

## Getting started

```bash
npm install
npx expo start
```

Then scan the QR code with **Expo Go** on your Android or iOS phone, or press `a` / `i` to open an emulator or simulator.

Checks:

```bash
npx tsc --noEmit   # typecheck
npx expo lint      # lint
npm test           # unit tests
```

## Free Android APK from GitHub

The **Android APK** workflow (`.github/workflows/android-apk.yml`) builds the app on GitHub's free runners. No Expo account is needed. It runs only when started by hand: **Actions → Android APK → Run workflow**, choosing `main` to update the download link below.

- **From `main`:** open the repo's **Releases** page on your phone, open **Latest Android build**, tap `family-health-registry.apk`, and allow your browser to install apps when Android asks.
- **From any branch:** open **Actions → Android APK → the run → Artifacts** and download the zip with the APK (requires being signed in to GitHub).

These APKs are signed with a development key, which is fine for personal and family use. Play Store releases need your own signing key (see below).

## Building installable apps

Builds are made in the cloud with [EAS Build](https://docs.expo.dev/build/introduction/), so you don't need Xcode or Android Studio:

```bash
npx eas-cli@latest login
npx eas-cli@latest build --profile preview --platform android   # installable .apk for testing
npx eas-cli@latest build --profile production --platform all    # store builds (.aab + .ipa)
npx eas-cli@latest submit --platform all                        # upload to Play Store / App Store
```

Before your first store build, change `ios.bundleIdentifier` and `android.package` in `app.json` to identifiers you own.

## Project layout

```
src/
  app/                  Screens (Expo Router: each file is a route)
    _layout.tsx         Database provider + navigation stack
    index.tsx           Home: family members and recent records
    member/[id].tsx     Member profile, health info, records, share
    member/edit.tsx     Add / edit a family member
    record/[id].tsx     Record details and attachments
    record/edit.tsx     Add / edit a record and its attachments
    search.tsx          Search all records
    share.tsx           Share & Sync: export / import family data files
  components/           Reusable UI (buttons, cards, form fields, record rows)
  lib/
    db.ts               SQLite schema, migrations and queries
    files.ts            Attachment storage and native share sheet
    share.ts            Family data file export/import and PDF generation
    types.ts            Data model and record categories
```

## How family sharing works

Each phone keeps its own copy of the registry. The data file (`*-health-records-YYYY-MM-DD.json`) contains members, records and base64-encoded attachments. On import:

- members, records and attachments are matched by ID, so importing the same file twice is harmless;
- when both phones have the same member or record, the one with the newest `updatedAt` is kept;
- deletions are not synced, so something deleted on one phone stays on the others until they delete it too.

The data files contain private medical information. Only share them with people you trust.

Future improvement: optional real-time cloud sync (for example Supabase or Firebase with end-to-end encryption) so the family doesn't have to pass files around.
