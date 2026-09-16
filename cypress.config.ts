import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:4200',
    supportFile: 'cypress/support/e2e.ts',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    setupNodeEvents(on) {
      on('task', {
        // Mints a sign-in token for a fake user against the local Firebase
        // Auth emulator (see firebase.emulator.json) - never touches real
        // Firebase, so no test credentials or live account are needed.
        // Requires FIREBASE_AUTH_EMULATOR_HOST to be set (see the
        // "e2e:auth" npm script) before firebase-admin is first used.
        async mintTestLoginToken(uid: string) {
          const { getApps, initializeApp } = await import('firebase-admin/app');
          const { getAuth } = await import('firebase-admin/auth');
          const app = getApps()[0] ?? initializeApp({ projectId: 'taliferrotech' });
          return getAuth(app).createCustomToken(uid);
        },
      });
    },
  },
});
