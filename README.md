# Outreach

<p align="center">
  <img src="public/assets/outreach-banner.png" alt="Outreach campaign signals and follow-up visualization" width="900">
</p>

Outreach is 16Ahead’s email campaign and follow-up workspace. It helps teams plan thoughtful outreach, understand engagement signals, and choose the right next move for each conversation.

Live at <https://outreach.16ahead.com>. Built with Angular 19, Firebase Auth and the shared `@taliferro/ui` package; all data and AI work happens in the 16Ahead backend (`api.taliferro.tech`).

## Before you start

You need:

| Tool | Why | Notes |
| --- | --- | --- |
| Node.js 22 and npm | Build and dev server | Developed on Node 22.13. |
| The `taliferro-ui` repo | `@taliferro/ui` is installed from `file:../../taliferro-ui` | `npm install` fails without it. |
| Firebase CLI (`npm i -g firebase-tools`) | Emulators and deploys | Deploys need access to the `taliferrotech` project. |
| Java (OpenJDK 11+) | Firebase emulators, for the signed-in Cypress tests | `npm run emulators` puts `/usr/local/opt/openjdk/bin` on `PATH` (Homebrew on Intel Macs); adjust if yours is elsewhere. |
| Chrome | Unit tests run in headless Chrome | |

Clone the repos so they sit side by side like this:

```text
corporate/
├── taliferro-ui/                 # shared UI package, menu, footer, Help/About template
└── web-products/
    └── outreach/                 # this repo
```

## Run it locally

```bash
npm install
npm start
```

Open <http://localhost:4200>. `npm start` stamps a new build version first (see [Versioning](#versioning)), then runs `ng serve`.

**Local dev talks to production.** There is no separate dev backend or Firebase project. The default configuration uses the live 16Ahead API and the live `taliferrotech` Firebase project, so anything you create while signed in is real data on your real account. Use the emulator setup under [Tests](#tests) when you need a throwaway user.

### Signing in locally

Sign-in is not done in this app. `OutreachAuthService.signIn()` sends you to 16Ahead’s hosted login (`todd.taliferro.tech/login`) with `client=outreach-web-local` when the host is `localhost` or `127.0.0.1` (`outreach-web` in production). 16Ahead sends you back to `/auth/callback` with a Firebase custom token, and the app signs in with it. Keep the dev server on port 4200 so the return trip lands.

You can browse every page signed out. Actions that save something are gated one by one (`WriteActionDirective`) and enforced by the server.

## Configuration

There are no environment variables or `.env` files. Settings live in [src/environments/](src/environments/) and are committed. All of them are public client-side values.

| File | Used by | Differences |
| --- | --- | --- |
| `environment.ts` | `npm start` (development) | `production: false` |
| `environment.prod.ts` | `npm run build` (production) | `production: true`, turns on the service worker |
| `environment.e2e.ts` | `npm run start:e2e` | `useAuthEmulator: true`: Auth on `localhost:9099`, Firestore on `localhost:8085` |

| Key | What it is |
| --- | --- |
| `PLATFORM_URL` | The site’s public URL. |
| `backendURL` | 16Ahead backend base URL (`https://api.taliferro.tech/api`). |
| `apiKey` | Bearer key for a few older backend calls (`EmailService`, `OutreachInsightService`). |
| `firebaseConfig` | Web config for the `taliferrotech` Firebase project (Auth). |
| `taliferroTenantId` | The admin account’s uid; that user sees admin-only UI. |
| `linkPreview` | Not used by the app today. |

If you add a key, add it to all three files. `environment.e2e.ts` is a copy, not an import (see the comment at its top).

## Services it depends on

| Service | What Outreach uses it for |
| --- | --- |
| 16Ahead backend (`api.taliferro.tech/api`) | Everything: contacts, mailboxes, emails, drafts, catalyst runs, signals, engagement, Lead Vault, profile, the in-app assistant, billing. Every `/api/` request is stamped with tenant, user and email by `tenantInterceptor`, and with a Firebase ID token by `idTokenInterceptor`. |
| 16Ahead hosted login (`todd.taliferro.tech/login`) | Sign-in (see above). |
| Firebase Auth (`taliferrotech`) | Session after sign-in. |
| Stripe, through the backend’s `/billing` | Web subscriptions (`WebCheckoutService`). The App Store handles iOS subscriptions. |
| Google OAuth, through the backend | Connecting a Gmail mailbox (`/outreach/mailboxes/oauth/google/start`). |
| Google Analytics 4 (`G-57V6BWTDMB`) | Page analytics. Skipped on `localhost` (see `src/index.html`). |

None of these need keys on your machine. Backend-side secrets (Stripe, Google OAuth, AI providers) live in the backend.

## Routes

| Route | Purpose | Prerendered |
| --- | --- | --- |
| `/` | Marketing landing page; signed-in visitors are sent to `/app` | yes |
| `/ios` | Outreach for iOS | yes |
| `/pricing` | Browse free, subscribe to create | yes |
| `/help` | Help (shared template plus Outreach’s guide) | yes |
| `/about` | About (shared template plus Outreach’s story) | yes |
| `/get-started` | Sign-up wizard: sending email, name, then sign in | |
| `/login` | Straight to 16Ahead’s hosted login, for returning users and deep links | |
| `/auth/callback` | Return from hosted login | |
| `/app` | Outreach workspace | |
| `/needs-you` | Conversations waiting on you | |
| `/maya-day` | The Marketing Assistant’s day plan | |
| `/compose-email` | Email composer | |
| `/email-processor` | Contacts, last-contact chart, sending | |
| `/inbox-access` | Connect and review mailboxes | |
| `/signal-engine` | Follow-up signal workflow | |
| `/engagement` | Ad engagement and click stream | |
| `/profile` | Profile basics | |
| `/mobile-handoff` | Landing page for a native 16Ahead app opening this site already signed in | |
| `/unsubscribe-success`, `/unsubscribe-failure` | Unsubscribe results | |
| `/success` | Old Stripe return page; redirects to `/app` | |

## Tests

```bash
npm run test:ci          # unit tests (Karma, headless Chrome)
npm test                 # unit tests in watch mode
npm run e2e              # starts the dev server and runs the Cypress smoke suite (public pages)
npm run e2e:auth         # signed-in Cypress suite against the Firebase emulators
npm run cypress:open     # Cypress UI
```

`e2e:auth` starts the Auth and Firestore emulators (`firebase.emulator.json`, needs Java), serves the app with the `e2e` configuration, and signs in as a fake user minted by `firebase-admin` against the emulator. It never touches production auth or data.

## Production build

```bash
npm run build
```

Output goes to `dist/outreach/browser`. The public pages (`/`, `/ios`, `/pricing`, `/help`, `/about`) are prerendered to static HTML for search engines ([src/app/app.routes.server.ts](src/app/app.routes.server.ts)); every other URL falls back to `index.csr.html` and renders in the browser. Nothing runs on a server in production: `src/server.ts` exists only for the prerender step.

Code that runs while a page or the app shell starts must not touch `window`, `document`, `localStorage`, `sessionStorage` or `navigator` without a browser check, or the prerender fails. After a build, check that `dist/outreach/browser/<route>/index.html` contains the page’s text.

### SEO

- Every public page sets its own title and description; canonical and `og:url` follow the route ([src/app/shared/canonical-url.ts](src/app/shared/canonical-url.ts)).
- [public/sitemap.xml](public/sitemap.xml) lists the prerendered pages. Add a URL there when you prerender a new page.
- [public/robots.txt](public/robots.txt) keeps crawlers out of the app routes.

### Versioning

`npm start` and `npm run build` run `scripts/generate-version.js` first. It writes a `YYYY.M.D-build.N` stamp to `public/assets/version.json` and to `package.json`’s `version`. The footer shows it. Expect both files to change after every build.

## Deploy

```bash
npm run deploy:hosting   # ./deploy.sh
```

`deploy.sh` builds, runs the unit tests and the Cypress smoke suite, commits **everything** in the working tree (`git add -A`) as `Deploy: v<version>`, then deploys to the Firebase Hosting site `todd-outreach` in the `taliferrotech` project. If any step fails, nothing is deployed. Make sure your working tree has only what you mean to ship.

## Shared code: don’t edit here

Outreach follows the Taliferro product standard (`taliferro-ui/PRODUCT-STANDARD.md`). These folders are copied in from `taliferro-ui` by its `sync.sh` scripts; change them there and re-sync:

- `src/app/shared/product-pages/` (Help and About template; `product-pages.config.ts` is Outreach’s own)
- `src/app/shared/site-footer/`
- `src/app/shared/write-access/` (subscribe prompt and web checkout; `write-access.config.ts` is Outreach’s own)
- the universal menu

## Project structure

- `src/app/features/` — one folder per page (landing, help, about, outreach-home, signal-engine, …)
- `src/app/services/` — API clients and app state (`outreach-api.service.ts`, `outreach-auth.service.ts`, …)
- `src/app/core/interceptors/` — ID token, tenant stamping, service-worker bypass
- `src/app/shared/` — shared components, utilities and styles
- `src/environments/` — configuration (see above)
- `public/` — static files served as-is: assets, `robots.txt`, `sitemap.xml`
- `cypress/` — end-to-end tests and emulator Firestore rules
- `scripts/generate-version.js` — build version stamping
- `deploy.sh` — build, test, commit and deploy

## Brand assets

- `public/assets/outreach/logo.png` — logo and favicon
- `public/assets/outreach-banner.png` — landing-page, README and social-share artwork
- `public/assets/outreach-ios.png` — iOS page artwork
