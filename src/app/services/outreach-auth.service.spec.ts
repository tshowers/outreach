import { OutreachAuthService } from './outreach-auth.service';

describe('OutreachAuthService.signIn', () => {
  let service: OutreachAuthService;
  let navigateSpy: jasmine.Spy;

  beforeEach(() => {
    service = new OutreachAuthService();
    sessionStorage.removeItem('outreach_hosted_login_pending');
    // window.location.href's setter isn't configurable in real browsers, so
    // the actual navigation is spied on via its own method instead.
    navigateSpy = spyOn(service as any, 'navigateToHostedLogin');
  });

  afterEach(() => {
    sessionStorage.removeItem('outreach_hosted_login_pending');
  });

  it('stashes the returnUrl and a CSRF state token, then hands off to the hosted login', () => {
    service.signIn('/signal-engine');

    const pending = JSON.parse(sessionStorage.getItem('outreach_hosted_login_pending') || '{}');
    expect(pending.returnUrl).toBe('/signal-engine');
    expect(pending.state).toBeTruthy();

    expect(navigateSpy).toHaveBeenCalledTimes(1);
    const redirectedTo = navigateSpy.calls.mostRecent().args[0] as string;
    expect(redirectedTo).toContain('https://todd.taliferro.tech/login');
    expect(redirectedTo).toContain(`state=${pending.state}`);
  });

  it('consumePendingLogin rejects a mismatched state and clears the pending entry either way', () => {
    service.signIn('/inbox-access');

    expect(service.consumePendingLogin('wrong-state')).toBeNull();
    expect(sessionStorage.getItem('outreach_hosted_login_pending')).toBeNull();
  });

  it('consumePendingLogin returns the returnUrl when the state matches', () => {
    service.signIn('/inbox-access');
    const { state } = JSON.parse(sessionStorage.getItem('outreach_hosted_login_pending') || '{}');

    expect(service.consumePendingLogin(state)).toEqual({ returnUrl: '/inbox-access' });
  });
});
