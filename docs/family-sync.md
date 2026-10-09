# Family sync

Every family phone sees and adds to the same records. It's free, and only **one person** (the main family member) needs a Google account for it.

## How it works

- The main family member adds a small script ([family-storage.gs](family-storage.gs)) to their Google account, once. It keeps the family's sync files in a folder in their Google Drive (`Family Health Registry (encrypted)`).
- Each phone sends its records to that script and reads everyone else's, whenever the app opens or comes back to the front, or with **Sync now**.
- Everything is encrypted on the phone (AES-256-GCM) with a family key that only travels inside the family code. The script and Google only ever store scrambled data.
- The first phone to connect claims the script for its family. A phone without the family code is refused.

Costs nothing: Apps Script and Drive are free with any Google account (15 GB of Drive space). No billing account, no Google Cloud project, nothing to add to the app build.

## Set up (main family member, about 5 minutes)

In the app: **Settings → Family sync → Set up family storage**. The app walks you through it:

1. **Copy script** (or **Send to laptop**; a laptop is easiest, but a phone works).
2. Open <https://script.google.com/create>, sign in, replace the sample code with the script, and **Save**.
3. **Deploy → New deployment** → gear next to "Select type" → **Web app**.
   - **Execute as**: Me
   - **Who has access**: Anyone
   - **Deploy**, then authorise: choose your account → "Google hasn't verified this app" → **Advanced** → **Go to …** → **Allow**. It's your own script, so this warning is expected.
4. Copy the **Web app URL** (ends in `/exec`), paste it into the app, and tap **Connect**.

The phone now shows the **family code** (QR code, or **Share code** for WhatsApp).

## Join (everyone else)

**Settings → Family sync**, name the phone, then **Scan code** (or **Paste code**) with any family phone's code. That's all: no Google account needed. The family's records arrive, and what you add reaches everyone.

## Good to know

- **Deletions don't sync yet**: deleting something on one phone leaves it on the others. Edits sync, and the newest edit wins.
- **Sync runs while the app is open**: a phone picks up changes when it's opened.
- **Photos and PDFs up to 15 MB** are shared; bigger ones stay on the phone that has them.
- **Reminders don't carry over**: medicine reminders from other phones arrive switched off.
- **Updating the script**: if a new app version ships a new script, paste it into the same project and use **Deploy → Manage deployments → Edit → Version: New version**. The link stays the same.
- **Starting over**: in the script project, open **Project Settings → Script properties** and delete `tokenHash`; the next phone to connect claims it with a new family code. The old files stay in the Drive folder until you delete them.
- **Limits**: a free Google account allows Apps Script about 90 minutes of running time a day; a family's syncing uses a tiny fraction of that.
