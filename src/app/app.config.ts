import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideServiceWorker } from '@angular/service-worker';
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

import { routes } from './app.routes';
import { environment } from '../environments/environment';
import { tenantInterceptor } from './core/interceptors/tenant.interceptor';

initializeApp( environment.firebaseConfig );

if ( environment.useAuthEmulator ) {
  connectAuthEmulator( getAuth(), 'http://localhost:9099', { disableWarnings: true } );
  connectFirestoreEmulator( getFirestore(), 'localhost', 8085 );
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptors([tenantInterceptor])),
    provideServiceWorker('ngsw-worker.js', {
      enabled: environment.production,
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ]
};
