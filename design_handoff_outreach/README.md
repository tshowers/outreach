# Handoff: Outreach in the Find family

## Overview
This is a restyle of Outreach (the Angular web app `tshowers/outreach` and the SwiftUI app `tshowers/ios-outreach`) so it reads as the same family as Find. It uses the same tokens, Helvetica and pill controls as Find. Each area of the product keeps one logo colour everywhere it appears.

## About the design files
`Outreach Family.dc.html` is an **HTML design reference**, not production code.
- **Web:** recreate it in Angular, using the existing components and styles.
- **iOS:** recreate it in SwiftUI. Replace the default `Form` / `List` styling with the custom surfaces and pills described below.

Open the file in a browser. The screens are labelled 4a–4m. Use the Tweaks panel to preview light and dark mode.

## Fidelity
**High fidelity** for colour, type, spacing, radii and layout. All names, numbers and the TODD chat content are sample data.

## Design tokens (shared with Find)
Font: `"Helvetica Neue", Helvetica, Arial, sans-serif` (SF Pro is fine on iOS).

The theme follows the system setting through `prefers-color-scheme` on web and `colorScheme` on iOS.

| Token | Light | Dark |
|---|---|---|
| --bg | #ffffff | #0c0e13 |
| --surface | #f2f3f6 | #171a22 |
| --surface2 | #e4e7ed | #242936 |
| --text | #0f1115 | #f2f4f8 |
| --muted | #5a6170 | #9aa2b2 |
| --blue (primary) | #2f6bff | #3d7bff |
| --blue-ink (links) | #1f55e0 | #86aeff |
| --danger | #d92d4a | #ff6b81 |
| --t-blue / -fg | #e3ecff / #1d4fd6 | #15254a / #a3c1ff |
| --t-cyan / -fg | #daf6fc / #08657d | #0c2d35 / #74e4f8 |
| --t-pink / -fg | #ffe3f1 / #a8105a | #3a1029 / #ff92c9 |
| --t-violet / -fg | #efe5ff / #6427c9 | #2a1847 / #cdaaff |
| --t-yellow / -fg | #fff4c2 / #6e5700 | #2f2906 / #ffe56a |
| --t-green / -fg | #e0f6e6 / #17703a | #0e2c19 / #80e2a4 |

Solid accent colours (dots and bars): cyan #1fc8ec, violet #a259ff, pink #ff4fa8, yellow #ffd92e.

**Colour per area:** Needs you = pink · Drafts / Signal Engine = violet · Inbox = blue · Catalyst = cyan · Activity / warnings = yellow · TODD / Maya notes = green. The primary action is always `--blue`. Outreach's existing green buttons become blue.

**Radii:** pills 999 · large cards 24 · cards 18–20 · list rows 12–14 · iPhone frame content 16px side padding.

**Type scale:**
- Landing headline: 88 (laptop), 46 (iPhone)
- Page titles: 26–34
- Card titles: 22
- Body: 15–16
- Meta: 12–13
- Eyebrows: 12/700 uppercase with letter-spacing .06em

**Icons:** Lucide on web, SF Symbols on iOS. 2.5 stroke on web.

## Shared patterns
- **iPhone header:** a 44px circular back button (`--surface`), a centred title (15/700), and an optional right button.
- **Laptop shell:**
  - 240px sidebar (`--surface`) with the logo and "Outreach" wordmark.
  - Nav items: Growth, Needs you, Signal Engine, Inbox, Composer, Catalyst, Activity. Each is 40px tall with radius 12.
  - The active item gets a `--bg` background and a small shadow.
  - Count badges use the tint of that item's area.
- **Segmented control:** a `--surface` pill track (padding 4). The active segment is `--bg` with a shadow.
- **TODD note:** `--t-green` background, radius 18, sparkle icon, 12/700 uppercase label, 14px text. It replaces the current "What TODD sees" and "Why Maya wrote this" blocks.
- **TODD decision chip:** a `--bg` pill inside the note (for example "‖ Pause"), sourced from `recommendedAction`. Below the note go one-tap follow-ups such as "Pause until Oct 5" and "Email Matt Zika".
- **Message-type tags** (from `classification`), as 11/700 pills:
  - Reply: green
  - Out of office: yellow
  - Bounce: pink
  - Forward: blue
  - Newsletter: neutral
- **Sticky bottom action bar (iPhone):** a `--bg` bar with an upward shadow, a 52–54px primary pill, and a secondary row below it.

## Screens

### 4g / 4h: Landing
- Keep the copy exactly as it is.
- **Header:** logo + "Outreach", then "Outreach for iOS ↗" (surface pill), "Open Outreach →" (blue pill) and Menu (dark pill). Drop the Light/Dark toggle, since the theme follows the system.
- **Hero (laptop):** two columns.
  - Left: the eyebrow is a `--t-blue` pill. The headline is 88/700, letter-spacing -0.05em, with "next move." in `--blue`. Body text 19 muted. CTAs: Get started (blue, 56px), See Outreach for iOS (surface), See how it works (link).
  - Right: `public/assets/outreach-banner.png` over a 440px `--t-blue` circle.
- **Footer line:** "From the makers of Find", with the Find logo.
- **iPhone:** the illustration on top, then the eyebrow, a 46px headline, body text, a full-width Get started button, and two links.

### 4a / 4b: Home (iOS home / web Growth)
- **Connection warning:** `--t-yellow` strip with a Reconnect pill (`--text` background).
- **Needs you hero:** `--t-pink`, radius 24.
  - The count is 56–64/700.
  - iPhone: an avatar stack, then a Start pill.
  - Laptop: five rows of name, reason (from `reasonLabel`/`replySummary`) and time ago, plus a "Start with {first}" button.
- **Four tiles** (Drafts violet, Inbox blue, Catalyst cyan, Activity yellow), radius 20. Each has an icon, count, label and one line of detail. 2×2 grid on iPhone, 4 across on laptop.
- **Pipeline card:** six figures, each with a coloured dot (Active threads, Draft ready, Stalled, Hot leads, Warm leads, Queued), plus "Sending now N" on the right. This replaces the six large pipeline cards.
- **Laptop right column:** an Activity feed grouped by day ("Today", "Yesterday"). **Merge duplicate events** into one row (for example "Robert Leung replied ×2"). Each row gets a 30px tinted icon chip.
- The web Growth gauges (Pipeline health, Engagement, Maya drafting, Outbox) can sit below the tiles as a second row. Restyle them as tinted cards with a single figure each.

### 4c / 4d: Drafts review (iOS Drafts / web Signal Engine › Drafts)
- **Review one draft at a time** with the Find pager: Previous/Next names on either side, "N of 191" in the middle, and "See list".
- **Recipient row:** a 44–48px violet initials circle, the name, company and email, and a "Reply" or "Reply · sends now" tag.
- **Email card:** render the HTML body (iOS currently shows raw tags). The subject goes in a header row, the signature in a footer row, with an Edit link.
- **Why Maya wrote this:** a TODD note, using `rationale`.
- **Actions:**
  - Send reply / Approve: primary blue.
  - Rewrite (with an optional note), Test to me, Discard (`--danger`).
  - On iPhone the secondary actions are three 58px tiles in the sticky bar.
  - Laptop shortcuts: **A** approve, **R** rewrite, **T** test, **⌫** discard, **← →** previous/next.
- **Laptop layout:** sidebar | 360px list | review pane.
  - The list rows show name, time, company, subject (600) and a 2-line preview. The selected row is `--t-violet`.
  - Filter chips across the top: All / Replies / Follow-ups / Select. On web, the Drafts / Outbox / Sent / Plan tabs sit above these.
- Batch select stays behind "Select".

### 4e / 4f: Inbox
- **Header:** the mailbox address and "Synced N min ago" as the subtitle. This replaces the large account card.
- **Filter chips:** All / Replies / Auto-replies / Bounces (from `classification`).
- **Rows:** an unread dot (`--blue`), sender, time, subject, and a message-type tag followed by a **one-line TODD summary** (`signalSummary`). Show the summary in place of the raw preview, which currently includes quoted email headers.
- **Laptop:** sidebar | 380px list (selected row `--t-blue`) | message pane.
  - Message pane: a 26px subject, the sender row with its tag, then the TODD note with the decision chip and follow-up buttons, the body, and the reply box (subject, textarea, Send reply).

### 4i–4k: Catalyst on iPhone
- A segmented control: Stale / Send / History.
- **Stale:**
  - `--t-cyan` card: title, "500 contacts waiting", batch chips (the selected one is solid cyan with dark text), and two stat tiles (Oldest gap, 30+ days untouched).
  - "Up next" list: initials, name, company, days since last contact.
  - Sticky button: "Continue with {n} →".
- **Send:**
  - A status tag, a 180px progress ring (conic fill in cyan, "0/25 sent"), and Remaining / Skipped / Left today.
  - An Auto-send toggle row and a TODD note.
  - Sticky Start button, plus Reload queue and Load skipped.
- **History:** one card per run, showing the title, status and time range, sent count on the right, and two 6px bars (opens in blue, clicks in violet) with percentages.

### 4l: Catalyst on laptop
- One page, three columns:
  1. **Choose who:** the cyan card with the batch chips, a summary line and the Include Lead Vault toggle.
  2. **Up next:** the staged list.
  3. **Send:** the large count, a progress bar, Start, the Auto-send toggle, and Reload/Load skipped links.
- A "Ready · N left today" status pill in the header.
- **Recent runs** sit below as rows: title/status, sent, opens bar, clicks bar, Done/Active tag.
- The web app's Signal Engine explainer copy moves into a TODD note or a help popover.

### 4m: Composer (laptop/web)
- **Header:** "New email", with Send test and Send buttons.
- **Recipient card** (`--surface`, radius 18): a To row with recipient chips and a "Cc · Bcc" link that expands those fields, then a Subject row.
- **Toolbar:** a single row of pill buttons (B, I, U, H1, H2, lists, Link, Image), plus Template ▾ and Code view on the right. Font and size controls move into an overflow menu.
- **Editor:** bordered, radius 18, 16px text with line-height 1.6.
- **Footer:** a "Signal Engine on" green tag with a short explanation, and a "Mark as ADV" checkbox.
- **TODD panel** (340px, `--surface`):
  - A "Before you send" tip (this replaces the floating Tip card).
  - Quick chips: Draft it for me · Shorten · Soften · Add a clear ask.
  - The chat thread: user messages in blue bubbles, TODD replies with Apply / Try again.
  - An input pill at the bottom.
  - Selecting text in the editor scopes TODD's edit to that selection, shown as a green highlight.

## Data mapping (existing fields)
- Drafts: `DraftItem.contactName, companyName, email, kind, subject, body, rationale, updatedAt`.
- Needs you: `NeedsYouItem.contactName, reasonLabel, replySummary, replyClean, repliedAt, nextMove, mayaDraft*`.
- Inbox: `MailboxMessage.classification, signalSummary, recommendedAction, replyDraft*, unread, receivedAt`.
- Pipeline: `SignalEngineSummary.*`.
- Catalyst: `CatalystStore` / `CatalystModels`.
- New (optional): grouping duplicate activity events on the client.

## Assets
- `outreach-logo.png`: from `ios-outreach/OutreachIOS/Resources/Assets.xcassets/OutreachLogo.imageset/`.
- `outreach-banner.png`: from `outreach/public/assets/`.
- `find-logo.png`: used only for the "From the makers of Find" line.

## Files
- `Outreach Family.dc.html`: the design canvas (screens 4a–4m).
- `support.js`: the runtime needed to open the file in a browser.
- Assets at the same relative paths as the design file references.
