// src/app/guards/first-run-tutorial.guard.ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth, user } from '@angular/fire/auth';
import { map, take } from 'rxjs/operators';
import { FirstRunTutorialService } from '../services/first-run-tutorial.service';

/** On Home only, after authGuard: an account registered on this phone that
 *  hasn't finished the first-run tutorial goes to /tutorial instead, so
 *  reopening the app (splash or login both lead to Home) can't skip it.
 *  Decided from the local flag alone; no profile read is needed. */
export const firstRunTutorialGuard: CanActivateFn = () => {
  const auth     = inject(Auth);
  const router   = inject(Router);
  const tutorial = inject(FirstRunTutorialService);

  return user(auth).pipe(
    take(1),
    map(currentUser => tutorial.isPending(currentUser?.uid)
      ? router.createUrlTree(['/tutorial'])
      : true),
  );
};
