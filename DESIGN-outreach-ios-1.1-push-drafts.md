# Outreach iOS 1.1: push notifications, Maya activity, Drafts and Needs You in the app

Status: built and deployed (2026-10-01), except the last step.
- **Done:** every push in this design, Needs You, Drafts, Activity, notification settings, and the web "Maya's day" page (/maya-day). The iOS side is in Outreach 1.1 build 8.
- **Left:** remove Drafts from the web Signal Engine once 1.1 is live on the App Store.

Outreach 1.0 ships without push. 1.1 does three things:

- **Push notifications.** Outreach tells you when something happens, including everything Maya does for you.
- **Drafts move into the app completely.** The Signal Engine on the web keeps only Outbox, Sent and Plan.
- **Needs You is in the app,** with quick actions on each item.

## 1. Push notifications (shared by every TODD app later)

### Delivery
- **APNs directly from the backend,** not Firebase Cloud Messaging. Every TODD app is iOS-only, so FCM adds an SDK and a Firebase console step for nothing.
  - The backend signs an ES256 JWT with the "TODD Push" key (Key ID `X42756KNFK`, Team `6377FLHLAG`) and posts over HTTP/2 to `api.push.apple.com`.
  - The topic is the app's bundle id, e.g. `tech.taliferro.outreachios`.
- **The key lives in Secret Manager as `APNS_AUTH_KEY`,** never in `.env` or git.
  - Ty sets it once: `firebase functions:secrets:set APNS_AUTH_KEY --project taliferrotech < /Users/tyshowers/Dropbox/corporate/AuthKey_X42756KNFK.p8`
  - Key ID and Team ID go in `.env`: `APNS_KEY_ID`, `APNS_TEAM_ID`.
- **Environments:**
  - Xcode debug builds use the sandbox gateway.
  - TestFlight and the App Store use production.
  - The app reports which one it is when it registers.

### Devices
- **Registration:** `POST /mobile/push/devices` (verified ID token) with `{token, app: "outreach", environment, appVersion}`. It's stored at `users/{uid}/pushDevices/{token}`.
- **Removal:**
  - `DELETE /mobile/push/devices/:token` on sign-out.
  - When APNs answers 410 Unregistered, the backend deletes the token.

### Sending: `push/push.service.js`
- **Entry point:** `notify({tenantId, uid?, app, category, title, body, route, collapseId?})`
  - With no `uid`, it notifies the tenant's owner.
  - It checks the person's per-category setting and quiet hours (below).
  - It writes the same item to `tenants/{tenantId}/activity/{id}`, so the app has a history (the Maya Activity screen) even if the push was missed or turned off.
  - It sends to every registered device for that app.
- **Failure handling:** a failure never breaks the job that triggered it. It's logged and nothing more.
- **Tap behaviour:** `route` is a deep link the app opens on tap, e.g. `outreach://needs-you/<contactId>`, `outreach://drafts`, `outreach://inbox/reconnect/<mailboxId>`.

## 2. What Outreach notifies about

| Category (setting) | Trigger | Example | Opens |
|---|---|---|---|
| Replies | Momentum reply classifier marks a thread `replied` / bucket `needs_you` | "Dana Lee replied: 'Thursday works.'" | That Needs You item |
| Mailbox | Mailbox OAuth refresh fails (`mailbox.service.js`) | "Reconnect your Gmail: Outreach lost access to ty@…" | Inbox → reconnect |
| Catalyst | Last Cloud Task of a Catalyst send batch completes | "Catalyst batch finished: 42 sent, 3 failed" | Catalyst |
| Sending approved | Admin approves the Outreach provisioning request | "You're approved to send from Outreach" | Catalyst |
| Maya | Her 6am start (or failure) and her end-of-day summary | "Maya's done for today: 22 sent, 9 drafted, 3 need you" | Maya's day summary |

### Maya: two notifications a day (decided 2026-09-30)
Maya's runs stay as they are; only two of them notify.

1. **Started, or failed.** When the 6am planner (`scheduledMarketingEmployeePlanner`) finishes planning a tenant's day, the push says:
   - "Maya started her day: 14 follow-ups and 5 drafts planned."
   - If planning failed or the day was blocked (`planResult.blocked` or an exception): "Maya couldn't start today: <reason>."
2. **Done for the day, with a summary.** After Maya's last run of the day: "Maya's done for today: 22 sent, 9 drafted, 3 need you. See the summary."
   - **Her day ends** with the last hourly run before quiet hours (the 8:05pm `runMayaMorningBatch`). Anything she does after that counts toward the next day's summary.
   - **Where the summary opens:**
     - For now, a new **"Maya's day"** page in the Outreach web app.
     - Later, a status screen in the Maya iOS app (Maya 1.1).
   - **No empty pushes:** a day with nothing done (e.g. weekends with no sending) sends no "done" push.

Every individual Maya action (each run, draft, send and rewrite) is still recorded in `tenants/{tenantId}/activity`. The summary page is built from those records, so nothing she did is lost even though only two pushes go out.

### Quiet hours (decided 2026-09-30)
- **Held:** from 9pm to 6am in the user's timezone, Maya, Catalyst and Sending approved pushes are held until 6am.
- **Always sent:** **Replies** and **any email problem** (a mailbox that needs reconnecting, a bounce spike, a failed send) come through at any hour.

### Settings
Account → Notifications has one switch per category above, all on by default. Settings are stored at `users/{uid}.pushPreferences`.

## 3. Drafts: a complete move into the app

### iOS: new Drafts tab
- **List:** every thread in the `drafts` lane, both first-touch and reply drafts, excluding `rewriteQueueState` threads, the same filter as the web's `draftThreads`.
- **Draft screen:**
  - Shows the contact, why Maya wrote it, and the subject and body (editable).
  - Approve → it moves to Outbox.
  - Reject & rewrite, with a reason → Maya rewrites it.
  - Discard.
  - Send test to myself.
- **Multi-select:** Approve all, Reject & rewrite all, Discard all, all batched like the web's chunked calls.

### Backend
Add `/mobile/outreach/drafts/*` routes (verified ID token plus `requireOutreachWriteAccess`). They call the existing momentum controller functions the web uses today:
- `approve-draft`
- `approve-drafts-batch`
- `reject-draft`
- `reject-rewrite-drafts-batch`
- `discard-draft`
- `send-draft-test`
- a draft edit, via the existing manual-followup and manual-reply draft paths

The list comes from `/mobile/outreach/status`, which already returns the Signal Engine bootstrap.

### Web (after 1.1 is live on the App Store, so no drafts are stranded)
- The Signal Engine's Drafts tab is removed; the tabs are **Outbox, Sent, Plan**, and Outbox is the default.
- A one-line card links to the app: "Maya's drafts are reviewed in the Outreach app", using the existing `GetTheAppBanner`.
- Every place that links to `?tab=drafts` is updated, including the composer handoff `returnTab`, any nav badges, and the Cypress specs.

## 4. Needs You in the app

### Screen
- A **Needs You** list: Plan threads in the `needs_you` bucket. Each row shows the contact, `needsYouReason` and the latest reply text.
- It sits at the top of the app with a badge count. The app icon badge shows the same number.

### Quick actions (swipe and on the item)
| Action | Backed by |
|---|---|
| **Send Maya's reply**, after a preview, with editing allowed | `manual-reply/send-draft` |
| **Write my own reply** | `manual-reply` (and `draft-assist` for "help me write") |
| **Take over** (Maya stops on this thread) | `operator-takeover` |
| **Done / remove from Plan** | `dismiss-from-plan` |
| **Call / email / text** | from the contact card |

## 5. Build order
0. **Automatic inbox checking (deployed 2026-10-01).**
   - **Why:** replies were never detected, because nothing synced inboxes after the 2024 fetch handler stopped. Maya kept following up with people who had already answered.
   - `scheduledMailboxSync` checks every connected inbox every 10 minutes.
   - `runMayaMorningBatch` checks right before Maya sends.
   - Old mail catches up 40 messages per check, oldest first.
   - A lease stops the two checks from syncing the same inbox at once.
   - Code: `outreach/mailboxes/mailboxSyncRunner.js`.
1. Backend:
   - push service and device routes
   - the Replies and Mailbox triggers
   - tests
2. iOS:
   - register for push (ask permission right after the inbox is connected)
   - deep links
   - Account → Notifications
   - Maya Activity
3. iOS: the Needs You screen with quick actions.
4. iOS: the Drafts tab. Backend: the mobile draft routes.
5. Backend: the Catalyst, Sending approved and the two Maya notifications. Web: the "Maya's day" summary page.
6. Ship Outreach 1.1. After it's approved, remove Drafts from the web Signal Engine.

## Decisions (2026-09-30)
1. **Drafts leave the web for everyone,** including the master tenant, once 1.1 is live.
2. **Maya sends two notifications a day:** started or failed, then done with a summary (above).
3. **Quiet hours are 9pm–6am,** except replies and email problems.
