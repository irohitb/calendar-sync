# calendar-sync

Two-way calendar sync between a work and personal Google Calendar, running on GitHub Actions every 15 minutes.

- Work events appear on the personal calendar titled **"Work"**.
- Personal events appear on the work calendar titled **"Busy"**.

Mirror events are private, tagged with `extendedProperties.private.calendar-sync-mirror=1`, and carry the source event's ID so updates and deletions propagate correctly. The sync will never create loops — mirror events are excluded from the source scan on each run.

## Setup

### 1. Google Cloud project + OAuth client

1. Create a project at https://console.cloud.google.com.
2. Enable the **Google Calendar API**.
3. On **OAuth consent screen**, publish as **External** (Testing is fine — add both your Google accounts as test users).
4. **Credentials → Create OAuth client ID → Desktop app**. Save the Client ID and Client secret.
5. Add `http://localhost:8765/oauth2callback` as an authorized redirect URI.

### 2. Mint refresh tokens (one per account)

Locally:

```bash
npm install

# For the WORK account: sign into work Google in your browser, then:
GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… npm run get-token
# Open the printed URL, approve, copy the refresh token printed to the terminal.

# Repeat signed into your PERSONAL Google account.
```

### 3. GitHub secrets

In the repo settings → Secrets and variables → Actions, add:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `WORK_REFRESH_TOKEN`
- `PERSONAL_REFRESH_TOKEN`

### 4. Enable the workflow

`.github/workflows/sync.yml` runs every 15 minutes. You can also trigger it manually from the Actions tab (`workflow_dispatch`).

## Local run

```bash
GOOGLE_CLIENT_ID=… \
GOOGLE_CLIENT_SECRET=… \
WORK_REFRESH_TOKEN=… \
PERSONAL_REFRESH_TOKEN=… \
npm run dev
```

## What it syncs

- Time window: next `SYNC_DAYS` days (default 30).
- Skips events marked `transparency=transparent` (free/OOO markers).
- Skips events the account owner has **declined**.
- Handles recurring events by requesting `singleEvents=true` — each instance is mirrored individually.

## Config

- `SYNC_DAYS` — days ahead to sync. Defaults to 30.

## Notes

- The Google Calendar API allows ~1M quota units/day per project; this workflow uses far less.
- If you rename or change a source event, the mirror will get updated on the next run.
- If you delete a source event, its mirror is deleted.
- Cron on GitHub Actions is best-effort; expect drift of a few minutes.
