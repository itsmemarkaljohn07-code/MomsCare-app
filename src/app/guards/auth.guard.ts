// src/app/guards/auth.guard.ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth } from '@angular/fire/auth';
import { map, take } from 'rxjs/operators';
import { user } from '@angular/fire/auth';

export const authGuard: CanActivateFn = () => {
  const auth   = inject(Auth);
  const router = inject(Router);

  return user(auth).pipe(
    take(1),
    map(currentUser => {
      if (currentUser) {
        return true; // logged in — allow access
      } else {
        router.navigate(['/login'], { replaceUrl: true });
        return false; // not logged in — redirect to login
      }
    })
  );
};

/** For Welcome and Login only: a patient who is already signed in goes
 *  straight to Home. Waits for Firebase's first auth state, like
 *  authGuard. Not used on signup or forgot-password — signup creates
 *  and signs in the account mid-flow and must not be redirected. */
export const redirectIfAuthenticated: CanActivateFn = () => {
  const auth   = inject(Auth);
  const router = inject(Router);

  return user(auth).pipe(
    take(1),
    map(currentUser => {
      if (currentUser) {
        router.navigate(['/home'], { replaceUrl: true });
        return false; // already signed in — redirect to home
      } else {
        return true; // signed out — allow access
      }
    })
  );
};