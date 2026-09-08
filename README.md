# Outreach

<p align="center">
  <img src="public/assets/outreach-banner.png" alt="Outreach campaign signals and follow-up visualization" width="900">
</p>

Outreach is TODD’s email campaign and follow-up workspace. It helps teams plan thoughtful outreach, understand engagement signals, and choose the right next move for each conversation.

## What’s included

- Public landing page with Outreach positioning, metrics, testimonials, FAQ, and links to the iOS page
- Outreach for iOS showcase at `/ios`, using the iOS product artwork
- Authenticated Outreach workspace at `/app`
- Campaign creation and email composition workflows
- Inbox access, Signal Engine, engagement, pricing, sign-in, and payment-success routes
- Persistent light/dark mode toggle
- Shared Outreach visual theme across workflow pages while preserving existing buttons and form controls
- Shared legal footer with dynamically stamped build version

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Outreach marketing landing page |
| `/ios` | Outreach for iOS showcase |
| `/app` | Outreach workspace |
| `/compose-email` | Authenticated email composer |
| `/inbox-access` | Authenticated inbox connection and review |
| `/signal-engine` | Authenticated follow-up signal workflow |
| `/engagement` | Authenticated engagement insights |
| `/pricing` | Outreach pricing |
| `/login` | Sign in |

## Development

Install dependencies and start the Angular development server:

```bash
npm install
npm start
```

The app runs at the local URL printed by Angular CLI.

## Production build

```bash
npm run build
```

The build runs the version generator before Angular compiles. It writes the current build stamp to `public/assets/version.json` using this format:

```text
YYYY.M.D-build.N
```

The footer loads that generated version at runtime, with the package version as a fallback.

## Brand assets

- `public/assets/outreach/logo.png` — Outreach logo and favicon
- `public/assets/outreach-banner.png` — landing-page and README header artwork
- `public/assets/outreach-ios.png` — iOS showcase artwork

## Project structure

- `src/app/features/landing` — public landing page
- `src/app/features/app-showcase` — iOS showcase page
- `src/app/features/outreach-home` — authenticated Outreach workspace
- `src/app/shared/site-footer` — shared legal footer and build-version display
- `src/app/shared/theme-toggle` — persistent light/dark mode control
- `scripts/generate-version.js` — pre-build and pre-start version stamping

Outreach is built with Angular and uses the shared Taliferro UI package for existing application controls.
