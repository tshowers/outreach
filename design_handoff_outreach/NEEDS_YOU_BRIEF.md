# Brief: Needs You (Outreach web and iOS)

## What Needs You is for

Needs You lists the people who are waiting on a decision from the user. Maya (Outreach's AI assistant) handles follow-ups on her own until one of two things happens:

1. **The person replied.** Replies always go to the user before Maya does anything else.
2. **Maya stopped and handed the conversation back.** For example, she wasn't confident enough to answer, a draft is empty, or there's no sending address.

The user's job on this page is to clear each person: reply, or decide there's nothing to do. A good Needs You page gets the user to zero quickly, and each item says in plain words why it's there.

## How it differs from Plan

These are two separate places and shouldn't be mixed.

| | Needs You | Plan |
|---|---|---|
| What it holds | People waiting on the user | Every conversation Maya is still running on her own |
| Typical size | A handful (about 5) | Hundreds (about 300) |
| What the user does | Decides: reply, use Maya's draft, or mark done | Usually nothing; it's a status view |
| Colour | Pink | Violet (part of Signal Engine) |

**Plan buckets:** waiting, watching, engaged, stalled, drafting, queued, and "needs human edit" (Maya's draft failed review).

## Which conversations appear

A conversation appears in Needs You when either of these is true:

- It sits in Plan with bucket `needs_you`.
- Someone replied, the thread was handed to the user, and Maya has already drafted an answer.

## The data available for each item

The iOS app gets these fields from `GET /mobile/outreach/needs-you`. The web app gets the same fields from the Signal Engine bootstrap thread.

| Field | What it is | Example |
|---|---|---|
| `contactName`, `companyName`, `email`, `phone` | Who it is | Dana Lee, Lee & Co |
| `lastSubject` | The subject of the conversation | "Which do you think is better, Finding or Searching?" |
| `replyText` | Their raw email, including quoted thread, headers and links | (often messy) |
| `replyClean` | The same email with links, headers and the quoted thread removed. **Show this one.** | "Thursday works for me." |
| `replyKind` | What kind of reply it is (see below) | `interested` |
| `replySummary` | Maya's one-line read | "Wants to meet Thursday." |
| `repliedAt` | When they replied | 2 hours ago |
| `reasonKey` | Why it's waiting on the user (see below) | `reply_came_in` |
| `reasonLabel`, `reasonDetail`, `nextMove` | The server's internal wording for the reason. **Don't show it**; it reads as jargon. | "No safe draft" |
| `mayaDraftSubject`, `mayaDraftBody` | Maya's suggested reply, if she wrote one | |

### Kinds of reply (`replyKind`)

Each kind gets a pill:

| Kind | Pill label | Suggested tint | Needs an answer? |
|---|---|---|---|
| `interested` | Interested | green | yes |
| `question` | Asked a question | blue | yes |
| `concern` | Has a concern (price, timing, authority, fit, trust) | yellow | yes |
| `not_interested` | Not interested | pink | usually not |
| `wrong_person` | Wrong person | violet | maybe (ask for the right person) |
| `reply` | Replied (anything else) | green | yes |
| `out_of_office` | Out of office | yellow | **no** |
| `automated` | Automated email (a system wrote it, not the person) | neutral | **no** |
| `unsubscribe` | Asked to stop | pink | **no** |

When there's nothing to answer, the main action should be **Mark as done**, not Reply.

### Reasons (`reasonKey`)

Each reason has plain wording to use instead of the internal labels:

| Key | Internal label (don't show) | Plain wording to show |
|---|---|---|
| `reply_came_in` | Reply came in | "{Name} replied. Replies always come to you before Maya continues." |
| `no_safe_draft` | No safe draft | "{Name} replied. Maya wasn't confident enough to answer this one for you." |
| `approval_required` | Approval required | "Waiting for your OK. Maya has a message ready and won't send it without you." |
| `error_blocker` | Error / blocker | "Maya paused this conversation. Something stopped her from following up." |
| `missing_sender` | Missing sender | "No address to send from. Connect your inbox, or reply yourself." |
| `missing_draft_body` | Missing draft body | "The draft is empty. Write the reply yourself." |
| `needs_human` | Needs human | "{Name} needs a decision from you." |

## Actions that already exist

| Action | What it does | Endpoint |
|---|---|---|
| **Review Maya's reply** | Opens Maya's draft for editing, then sends it | `POST /mobile/outreach/needs-you/:contactId/send`, web: `manual-reply/send-draft` |
| **Write my own** | The same send path, with the user's text | same |
| **Help me write it** | Maya drafts a reply now | `POST /mobile/outreach/needs-you/:contactId/draft` |
| **Mark as done** | Archives the conversation. Maya stays stopped for this person. | `POST /mobile/outreach/needs-you/:contactId/done`, web: `dismiss-from-plan` |
| **Call / Text / Email** | Uses the contact's phone and email on the device | none |
| **Open in Composer** (web) | Opens the full composer with the draft, then returns to Needs You | `composer-handoff` |

## What the current build does

These are reference points, not requirements:

- **List:** pink, with each row showing an avatar, name, company, age, kind pill, a "Reply drafted" pill when Maya has one, and two lines of `replyClean` (or Maya's summary, for automated mail).
- **Detail:** name and company, a pink "Why it needs you" card in plain words, Maya's read as a green note, "What {Name} said" with the original email tucked away, then the actions with the obvious one first.
- **Count:** the Home hero, the sidebar badge and the iOS app icon badge all show this number.

## Questions for the design

- What should happen after **Mark as done**: move to the next person, or go back to the list?
- Should out-of-office replies show the person's return date and offer "Remind me on {date}"? The server can't snooze yet.
- Should Needs You on the web be a page of its own (the current build) or a drawer over Growth?
