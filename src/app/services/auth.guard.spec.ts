import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { of } from 'rxjs';
import { User } from 'firebase/auth';

import { authGuard } from './auth.guard';
import { OutreachAuthService } from './outreach-auth.service';

describe('authGuard', () => {
  const runGuard = (url: string) =>
    TestBed.runInInjectionContext(() =>
      authGuard({} as any, { url } as any),
    );

  it('allows navigation when a user is signed in', (done) => {
    TestBed.configureTestingModule({
      providers: [
        { provide: OutreachAuthService, useValue: { getUser: () => of({ uid: 'abc' } as User), signIn: () => {} } },
      ],
    });

    const result = runGuard('/signal-engine');
    (result as any).subscribe((allowed: boolean | UrlTree) => {
      expect(allowed).toBeTrue();
      done();
    });
  });

  it('sends an unauthenticated visitor to the hosted login with the attempted URL as returnUrl', (done) => {
    const signIn = jasmine.createSpy('signIn');
    TestBed.configureTestingModule({
      providers: [
        { provide: OutreachAuthService, useValue: { getUser: () => of(null), signIn } },
      ],
    });

    const result = runGuard('/signal-engine');
    (result as any).subscribe((allowed: boolean | UrlTree) => {
      expect(allowed).toBeFalse();
      expect(signIn).toHaveBeenCalledWith('/signal-engine');
      done();
    });
  });
});
