import { bootstrapApplication } from '@angular/platform-browser';
import { RouteReuseStrategy, provideRouter, withPreloading, PreloadAllModules } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';
import { provideFirebaseApp, initializeApp, getApp } from '@angular/fire/app';
import { provideAuth, initializeAuth } from '@angular/fire/auth';
// From 'firebase/auth' itself, like auth.service.ts: the persistence classes
// must be the same module instance the Auth object uses.
import {
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from 'firebase/auth';
import { provideFirestore, initializeFirestore } from '@angular/fire/firestore';
import { provideStorage, getStorage } from '@angular/fire/storage';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';
import { environment } from './environments/environment';

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideRouter(routes, withPreloading(PreloadAllModules)),
    provideAnimationsAsync(),
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    // getAuth() with the same persistence, minus the popup/redirect helper:
    // the app never signs in with a popup or redirect, and loading that
    // helper (Google's api.js) held up restoring the signed-in user on a
    // cold start by 2-30 seconds on a slow connection.
    provideAuth(() => initializeAuth(getApp(), {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
    })),
    // Firestore's default transport (WebChannel/streaming) can hang
    // indefinitely behind certain antivirus HTTPS scanners, corporate
    // proxies, or restrictive networks — even when the browser itself
    // isn't blocking anything. Forcing long-polling makes Firestore use
    // plain, well-understood HTTP requests instead, which is immune to
    // that entire class of interference. This is the officially
    // documented fix for Firestore requests that hang/never resolve
    // while everything else (Auth, REST calls) works fine.
        provideFirestore(() =>
      initializeFirestore(getApp(), {
        experimentalForceLongPolling: true,
      })
    ),
    provideStorage(() => getStorage()),
  ],
});