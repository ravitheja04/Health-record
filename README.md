# Health-record

One place for family health: a mobile app for **Android and iOS** that keeps every family member's medical reports in one registry and makes them easy to share with the rest of the family.

Built with [Expo](https://expo.dev) (SDK 57, React Native, TypeScript, Expo Router).

## Features

- **Family members**: a profile for each person with relation, date of birth, gender, blood group, allergies, medical conditions, current medications, emergency contact and notes. Allergies are highlighted wherever the person appears.
- **Medical records**: lab reports, prescriptions, doctor visits, vaccinations, scans/imaging, surgeries/procedures, insurance and other documents. Each record has a date, doctor, hospital/lab and notes/results.
- **Attachments**: photograph a report with the camera, pick photos, or attach PDFs and images from Files/Drive/iCloud. Files are copied into the app's private storage.
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
```

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
