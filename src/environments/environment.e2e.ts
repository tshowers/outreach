// Used only by `ng serve --configuration=e2e` (see cypress/e2e/authenticated
// and the "e2e:auth" npm script). Same project as dev - the Auth/Firestore
// emulators are namespaced by projectId, not a separate Firebase project -
// just routed through the local emulator suite instead of live Firebase so
// signing in as a fake test user never touches production auth/data.
//
// Duplicated from environment.ts rather than imported from it: Angular's
// fileReplacements swaps whatever imports 'environments/environment' for
// this file's content, so an import from './environment' here would
// resolve back to itself.
export const environment = {
  production: false,
  useAuthEmulator: true,
  COMPANY_NAME: 'Outreach',
  PLATFORM_URL: 'https://outreach.taliferro.tech',
  backendURL: 'https://api.taliferro.tech/api',
  apiKey: 'AIzaSyCAAgRd8tq9PXkPKE2zddseYtZ-Xx_P8mU',
  linkPreview: '37bd4a175494ee23afba7d8a117c5f77',
  taliferroTenantId: 'yH3nWanUv0RqDCNfwXBOXLWuxt52',
  firebaseConfig: {
    apiKey: 'AIzaSyApZSnHn8Pd2fI_0oSod0Sv9O_JsOoniBc',
    authDomain: 'taliferrotech.firebaseapp.com',
    projectId: 'taliferrotech',
    storageBucket: 'taliferrotech.appspot.com',
    messagingSenderId: '633736143723',
    appId: '1:633736143723:web:1f91a0cc7efcdc9b5fe22e',
    measurementId: 'G-YQ9PHPM6FJ',
  },
};
