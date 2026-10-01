# Outreach iOS 1.1: push notifications, Maya's day, Needs You and Drafts in the app

**Status (2026-10-01): built and deployed.** The backend and web are live. The iOS side is Outreach 1.1, build 8, committed but not yet uploaded.

**Left to do:**
1. Test on a real iPhone. Push doesn't work in the simulator.
2. Upload build 8 to TestFlight.
3. Submit 1.1 once Apple approves 1.0.
4. Remove Drafts from the web Signal Engine once 1.1 is live on the App Store (section 6).

This document describes what was built. Where that differs from the original plan, the change is called out.

## What 1.1 does

- **Push notifications:** replies, inbox problems, finished Catalyst batches, sending approval, and Maya's day.
- **Needs You in the app:** everyone waiting on you, with quick actions.
- **Drafts in the app:** all of Maya's drafts. The web Signal Engine will keep only Outbox, Sent and Plan.
- **Activity:** a history of every notification, including ones held overnight or switched off.
- **Maya's day:** a web page summarizing her day, opened by her end-of-day push.

## 0. Prerequisite: Outreach now actually detects replies

Found while building this: nothing had synced connected inboxes since the 2024 fetch handler stopped. Before 2026-10-01, replies were never detected, so Maya kept following up with people who had already answered, and Needs You never showed a reply.

- **`scheduledMailboxSync`** checks every connected inbox every 10 minutes, around the clock.
- **Pre-send check:** `runMayaMorningBatch` checks the tenant's inboxes right before Maya sends. An inbox checked in the last 3 minutes is skipped.
- **Catch-up:** an inbox far behind is processed 40 messages per check, oldest first, saving progress each time.
- **One sync at a time:** a lease stops two checks syncing the same inbox at once.
- **Read-only:** nothing is marked read, moved or deleted.
- **Gmail failures** now mark the mailbox as errored, like IMAP failures already did.
- **Your own mail is never a reply.** This applies to every Outreach account. Mail from any of the account's connected inbox addresses, from the owner's or a teammate's sign-in email, or matched to one of their contact records stays in the inbox. It never hands a thread over, never lands in Needs You, and never sends a push.
- **Code:** `outreach/mailboxes/mailboxSyncRunner.js`, `scheduledMailboxSync.js`, and `mailbox.service.js` (`selectUidsToSync`, `isOwnInboundMessage`).
- **First run:** found 5 real replies Maya had missed.

Also fixed along the way: the momentumThreads rewrite-queue Firestore index was missing. The "Reject & rewrite" job had been failing every 12 minutes.

## 1. Push notifications (shared by every TODD app)

### Delivery
- **APNs directly from the backend,** not Firebase Cloud Messaging.
  - Code: `push/apnsClient.js`.
  - Signing: an ES256 provider token signed with the "TODD Push" key (Key ID `X42756KNFK`, Team `6377FLHLAG`), reused for 45 minutes, sent over HTTP/2.
- **The key:** the .p8 is the Secret Manager secret `APNS_AUTH_KEY`. `APNS_KEY_ID` and `APNS_TEAM_ID` are in `functions/.env`. The key is never in git.
- **Functions that send pushes declare the secret:**
  - `api`
  - `scheduledMailboxSync`
  - `scheduledMomentum-runMayaMorningBatch`
  - `scheduledMarketingEmployeePlanner`
  - `deliverHeldPushes`
  - `onOutreachSendingApproved`
- **Environments:** Xcode debug builds register as `sandbox`. TestFlight and App Store builds register as `production`.

### Devices, settings and activity (`push/push.service.js`, `pushRoutes.js`)
| What | Where | Endpoint |
|---|---|---|
| Devices | `pushDevices/{sha256(token)}` with tenantId, uid, app, environment. **Changed from the plan,** which used a per-user subcollection; a top-level collection lets one query find a tenant's devices. | `POST /mobile/push/devices`, `DELETE /mobile/push/devices/:token` (on log out) |
| Settings | `users/{uid}.pushPreferences.outreach.{category}`, every category on by default | `GET` / `PUT /mobile/push/preferences?app=outreach` |
| Activity | `tenants/{tenantId}/activity`, one record per notification, written even when no push is sent | `GET /mobile/activity?app=outreach` |
| Held pushes | `pushHeld`, delivered by `deliverHeldPushes` every 15 minutes once the person's 6am arrives | none |

- **Who gets a push:** `notify({tenantId, app, category, title, body, route, collapseId})` sends to every person on the account who has the app and that category switched on. **Changed from the plan,** which sent to the owner only.
- **When Apple rejects a device:** the device is removed if Apple says the token is dead.
- **Failures:** `notify()` never throws, so a push problem can't break the job that triggered it.

### Quiet hours
- **Held:** from 9pm to 6am in the person's timezone (from their profile, default Pacific), Maya, Catalyst and Sending approved pushes are held until 6am.
- **Always sent:** Replies and inbox problems come through at any hour.

## 2. The notifications

| Category | Fires when | Example | Opens |
|---|---|---|---|
| Replies | The inbox check detects a reply (`processInboundMailboxMessage`) | "Dana Lee replied" plus the first lines of the reply | That person in Needs You |
| Inbox problems | A working inbox fails a check: bad password, or Gmail access lost. Sent once when it breaks, not on every failed check. | "Outreach can't reach ty@…" | Inbox |
| Catalyst | A finalized Catalyst run has sent everything it queued. It's checked on every recorded send and when the run is finalized. | "Catalyst batch finished: October re-engage: 42 sent, 3 skipped." | Catalyst |
| Sending approved | The admin control panel changes `outreachProvisioningStatus` to approved. That panel writes Firestore directly, so a Firestore trigger (`onOutreachSendingApproved`) watches the field. | "You're approved to send from Outreach" | Catalyst |
| Maya | Her 6am start (or failure), and her end-of-day summary | see below | Maya's day page |

**Exceptions to the reply push:**
- **Sales pitches** (e.g. a vendor's cold reply) never push.
- **Replies more than a day old,** like the backlog found while an inbox catches up, are recorded in Activity without a push.

**Known limit:** a Catalyst run counts sends, not failures. If any queued email fails for good, that run never reports "finished".

### Maya: two notifications a day (`outreach/mayaDay.service.js`)
1. **Started, or failed.** After the 6am planner finishes a tenant's day:
   - Success: "Maya started her day: She planned 6 things to do today, starting with '<first task>'."
   - Blocked or errored: "Maya couldn't start today" with the reason. For example, "She's at her limit of open tasks. Close out a few Moves and she'll plan again tomorrow."
2. **Done for the day.** After the run in the tenant's 8pm hour (the 8:05pm `runMayaMorningBatch`): "Maya's done for today: 22 sent, 3 replies, 2 drafts waiting, 1 needs you. See the summary."
   - A day where nothing happened sends nothing.

Both are recorded in `tenants/{tenantId}/mayaDays/{date}`. That record keeps each push to once a day and feeds the summary page.

### Maya's day page (web)
- **URL:** `outreach.taliferro.tech/maya-day`
- **Backend:** `GET /outreach/maya-day`
- **Shows:**
  - emails sent, replies, opens and clicks today
  - who's waiting in Needs You and Drafts
  - what Maya planned at 6am
  - a timeline of the day's activity
- **From the app:** the app opens this page already signed in.
- **Later:** a native version goes in Maya 1.1.

## 3. Needs You in the app

### What's listed (`GET /mobile/outreach/needs-you`)
- **Who's included:**
  - Threads in the Plan lane with bucket `needs_you`.
  - **Added beyond the plan:** replies Maya already drafted an answer to, so "Review Maya's Reply" is one tap.
- **Each item:** contact, company, email, phone (from the contact's `phoneNumbers`), reply text, Maya's summary of the reply, why it needs you, and Maya's draft.

### In the app
- **Dashboard card:** a "Needs You" card tops the dashboard, e.g. "George Dimov and 4 more are waiting on you."
- **Badge:** the app icon badge shows the count.
- **List gestures:** swipe right to Reply, swipe left for Done.

### Quick actions
| Action | Backed by |
|---|---|
| **Review Maya's Reply**: edit, then Send | `POST /needs-you/:id/send`, which uses the same `sendManualReplyDraft` as the web |
| **Write a Reply**, with **Help Me Write** / **Have Maya Rewrite It** | `POST /needs-you/:id/draft` (`generateAssistedDraft`, purpose `needs_you`), then send |
| **Call / Text / Email** | the phone's dialer, Messages and Mail |
| **Done – I've Handled It** | `POST /needs-you/:id/done`, which archives the thread. Maya stays stopped for that person. |

**Changed from the plan:**
- **No "Take over" action.** A reply hand-off already stops Maya, so it wasn't needed.
- **Done doesn't use the web's `dismiss-from-plan`.** That endpoint only works for drafts flagged for editing, so Done has its own endpoint.

## 4. Drafts in the app

### What's listed (`GET /mobile/outreach/drafts`)
- **Included:** threads in the `drafts` lane.
- **Left out:**
  - drafts being rewritten, shown only as a count ("Maya is rewriting 3")
  - replies already shown in Needs You, so nobody appears twice
- **Changed from the plan:** this is its own endpoint, not part of `/mobile/outreach/status`.

### In the app
- **Dashboard card:** a "Drafts" card shows how many are waiting.
- **Each draft:**
  - the subject and body, editable
  - why Maya wrote it
  - **Approve** (labelled **Send** for reply drafts)
  - **Reject & Rewrite**, with an optional note for Maya
  - **Send a Test to Me**
  - **Discard**, which takes two taps instead of showing a popup
- **Select:** approve or rewrite many drafts at once, sent in batches of 25. The server allows at most 100 per batch.
- **Changed from the plan:** there's no "Discard all".

### Endpoints (all require the Outreach app)
| Endpoint | Does |
|---|---|
| `POST /drafts/:id/approve` | Takes edits. A reply draft goes through `sendManualReplyDraft`. A first-touch or follow-up goes through `sendManualOutboundDraft`, after the same Drafts-lane and sending-access checks as the web. |
| `POST /drafts/:id/reject` | Builds the same body the web sends, then calls the web's `rejectDraft`. Maya rewrites immediately. |
| `POST /drafts/approve-batch`, `POST /drafts/rewrite-batch` | The web's batch controllers, unchanged |
| `POST /drafts/:id/discard`, `POST /drafts/:id/test` | The web's controllers, unchanged |

## 5. The app (Outreach 1.1, build 8)

- **Turning notifications on:**
  - There's no permission prompt at launch.
  - A dashboard card offers "Turn On Notifications".
  - **Account → Notifications** has the switches, plus a link to Settings if notifications were declined.
- **Menu:** Needs You, Drafts, Inbox, Catalyst, Activity, Notifications.
- **Tapping a notification** opens its page:
  - `outreach://needs-you/<id>` opens that person.
  - `outreach://drafts`, `outreach://catalyst`, `outreach://activity` and `outreach://inbox/...` open those pages.
  - `outreach://maya-day` opens the web page.
- **Log out** removes this phone from the account's pushes.
- **Code:**
  - `App/AppDelegate.swift`
  - `Services/PushService.swift`
  - `Features/NeedsYou/*`
  - `Features/Drafts/*`
  - `Features/Notifications/*`

## 6. Last step: remove Drafts from the web (after 1.1 is live)
- **Tabs:** the Signal Engine shows **Outbox, Sent, Plan**, and Outbox is the default.
- **Pointer to the app:** a one-line card says "Maya's drafts are reviewed in the Outreach app", using `GetTheAppBanner`.
- **Links:** every link to `?tab=drafts` is updated, including the composer handoff `returnTab`, the summary strip's "Awaiting approval", and the Cypress specs.

## Decisions
| Date | Decision |
|---|---|
| 2026-09-30 | Drafts leave the web for everyone, including the master tenant, once 1.1 is live. |
| 2026-09-30 | Maya sends two notifications a day: started or failed, then done with a summary. |
| 2026-09-30 | Quiet hours are 9pm–6am, except replies and email problems. |
| 2026-09-30 | Ship 1.0 without push; push is 1.1. |
| 2026-10-01 | Check inboxes every 10 minutes, plus right before Maya sends. |
| 2026-10-01 | An account's own mail (its inboxes, owner, teammates) never counts as a reply. |

## Commits
| Repo | Commits |
|---|---|
| Backend (`taliferrotech`) | `c46c71db`, `fea8c1c7`, `35b9062f`, `91202ed2`, `de47f79c`, `bd4407a4` |
| Outreach iOS | `e26aedc`, `fe6c95e`, `13a385e`, `48fe06a` |
| Outreach web | `792ef6d` |
