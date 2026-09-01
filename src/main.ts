import { bootstrapApplication } from '@angular/platform-browser';
import { RouteReuseStrategy, provideRouter, withPreloading, PreloadAllModules } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';
import { provideFirebaseApp, initializeApp, getApp } from '@angular/fire/app';
import { provideAuth, getAuth } from '@angular/fire/auth';
import { provideFirestore, initializeFirestore } from '@angular/fire/firestore';
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
    provideAuth(() => getAuth()),
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
  ],
});