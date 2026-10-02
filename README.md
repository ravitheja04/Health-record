# Health-record

One place for family health: a mobile app for **Android and iOS** that keeps every family member's medical reports in one registry and makes them easy to share with the rest of the family.

Built with [Expo](https://expo.dev) (SDK 57, React Native, TypeScript, Expo Router).

## Features

- **Family members**: a profile for each person with relation, date of birth, gender, blood group, allergies, medical conditions, current medications, emergency contact and notes. Allergies are highlighted wherever the person appears.
- **Medical records**: lab reports, prescriptions, doctor visits, vaccinations, scans/imaging, surgeries/procedures, insurance and other documents. Each record has a date, doctor, hospital/lab and notes/results.
- **Attachments**: photograph a report with the camera, pick photos, or attach PDFs and images from Files/Drive/iCloud. Files are copied into the app's private storage.
- **Lab trends**: type in the values from each lab report (about 30 common tests, grouped into panels like Diabetes, Lipid profile, Thyroid; or any custom test). Each person gets a trends view showing which tests are out of the report's range, a chart per test over time with the normal range shaded, how often it is tested, and a side-by-side comparison of any two reports. Changes are marked as moving toward or away from the report's range; the app never diagnoses.
- **Read lab report PDFs**: pick a report PDF downloaded from Apollo 24|7 / Apollo Diagnostics, Tata 1mg Labs or most other Indian labs (or received on WhatsApp/email) and the app fills in the test names, values, units and normal ranges, works out the lab, patient, collection date and referring doctor, suggests the family member, and saves it as a lab record with the PDF attached. Everything is read on the phone (no internet, no AI service); password-protected PDFs are supported. Every value is shown for checking before it's saved, with notes on anything unusual (printed as "<0.01", marked high/low, no range found, test not in the common list).
- **Photos and scanned reports**: photograph a paper report (one photo per page, or pick photos from the gallery) or pick a scanned PDF, and the same reader fills in the values using Google ML Kit text recognition on the phone (offline). Tilted photos are straightened, and digits OCR commonly confuses ("l3.2", "1O.5", "6,4") are fixed. Photos are less exact than PDFs, so the app says so and asks for every value to be checked.
- **Medicines & reminders**: each person's medicines with dose, food instructions, times of day, every day or chosen weekdays, and start/end dates for courses. A "Today" checklist for the whole family (tick when taken, or mark skipped), phone notifications at each dose time, and tablets-left tracking with a refill warning when about 5 days remain. Reminders are per phone: shared medicines arrive with reminders off.
- **Vaccination tracker**: per person, doses given and due, grouped as overdue / due in 30 days / upcoming / given. For children, add the whole Indian government (NIS) or IAP schedule in one tap with due dates worked out from the date of birth (typical ages, editable), and mark past doses as given in bulk. Reminders a week before and on the due date, and a linked record for each certificate photo or PDF. Adults can add flu, COVID-19, Tdap, hepatitis B and other vaccines.
- **Home dashboard and tabs**: a bottom tab bar (Home, Records, Medicines, Vitals, Emergency). Home shows the family, what needs attention today (late doses, refills, overdue vaccines), today's medicines and recent records.
- **Emergency card**: its own tab (red medical icon). Shows blood group, allergies (highlighted), conditions, current medicines, up to 3 emergency contacts and the family doctor with call buttons, insurance and notes for responders, plus a QR code any phone camera can read offline (UTF-8, so names in any Indian script work). Share it as a printable PDF card or as text to paste into the phone's own lock-screen medical info.
- **Vitals log**: blood pressure, blood sugar (fasting / after meal / random), weight, heart rate, SpO₂ and temperature. Each person gets a tile per vital with the latest reading and a sparkline, and a detail screen with a chart over 30 days, 6 months or all time, the general adult typical range shaded, and every reading. Readings are marked above / below / in the typical range only; the app never diagnoses.
- **App lock**: optional fingerprint, face or phone PIN lock (Settings), re-locking after 1, 5 or 15 minutes away. The screen is hidden in the app switcher while locked.
- **Records**: every record in the family in one list, searchable by title, doctor, hospital, notes or family member, and filterable by person and type.
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
    _layout.tsx         Database provider, navigation stack and app lock
    (tabs)/             Bottom tabs: Home dashboard, Records, Medicines, Vitals, Emergency
    member/[id].tsx     Member profile, health info, records, share
    member/edit.tsx     Add / edit a family member
    record/[id].tsx     Record details and attachments
    record/edit.tsx     Add / edit a record and its attachments
    vitals/             Vital detail chart and add / edit reading
    settings.tsx        App lock and about
    share.tsx           Share & Sync: export / import family data files
  components/           Reusable UI (buttons, cards, form fields, record rows)
  lib/
    db.ts               SQLite schema, migrations and queries
    files.ts            Attachment storage and native share sheet
    share.ts            Family data file export/import and PDF generation
    types.ts            Data model and record categories
    extract/            Lab report PDF reader (see below)
```

## How lab report PDFs are read

Lab PDFs from Apollo, Tata 1mg and other NABL labs are text PDFs laid out as a table: *Test Name · Result · Unit · Bio. Ref. Range/Interval · Method*, with a patient block above it. The extractor (`src/lib/extract/`) works in three steps:

1. **Text with positions**: [pdf.js](https://mozilla.github.io/pdf.js/) runs in a hidden, offline WebView (`components/PdfReader.tsx`) and returns every piece of text with its x/y position. pdf.js is copied from npm into `src/lib/extract/pdfjsSource.generated.ts` by `npm install` (`scripts/vendor-pdfjs.js`).
2. **Lines and columns** (`layout.ts`): text at the same height becomes a line; wide gaps split it into cells. The table header row ("Test Name", "Result", "Unit", "Bio. Ref. Range"…) tells which column each cell belongs to.
3. **Rows** (`parseReport.ts`, `values.ts`, `profiles.ts`): values (with Indian digit grouping, `<`/`>`, H/L/High/Low flags), units, and reference ranges, including multi-line, gender-specific and multi-band ranges ("Desirable: <200 / Borderline: 200-239" picks the desirable band). Section headings, method lines, interpretation tables, notes, signatures and page furniture are skipped. Names are cleaned of specimen/method text (", SERUM", "(CLIA)") and matched to the app's test catalog so they join existing trends; anything else is kept under its printed name. `profiles.ts` holds the per-lab words (Apollo, Tata 1mg, generic).

**Photos and scanned PDFs** go through OCR instead of step 1: scanned PDF pages are drawn to images by pdf.js, then [ML Kit text recognition](https://github.com/infinitered/react-native-mlkit) (`components/ReportOcr.ts`, native, so not in Expo Go) returns word boxes. `ocr.ts` measures the page tilt from the slope of the words on each recognised line, rotates the boxes straight, repairs look-alike characters inside numbers, and hands them to the same layout and row parsing.

Tests in `src/lib/__tests__/extract.test.ts` build Apollo- and 1mg-style PDFs and read them back through pdf.js, and simulate tilted, typo-ridden photos of the same reports for the OCR path. To support another lab's layout, add a profile or a fixture that reproduces it.


## How family sharing works

Each phone keeps its own copy of the registry. The data file (`*-health-records-YYYY-MM-DD.json`) contains members, records, base64-encoded attachments, lab results, medicines, vaccinations, emergency cards and vitals. On import:

- members, records and attachments are matched by ID, so importing the same file twice is harmless;
- when both phones have the same member or record, the one with the newest `updatedAt` is kept;
- deletions are not synced, so something deleted on one phone stays on the others until they delete it too.

The data files contain private medical information. Only share them with people you trust.

Future improvement: optional real-time cloud sync (for example Supabase or Firebase with end-to-end encryption) so the family doesn't have to pass files around.
