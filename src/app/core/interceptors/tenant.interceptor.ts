import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { OutreachAuthService } from '../../services/outreach-auth.service';

/**
 * Ported from the same tenant.interceptor.ts used by every other
 * standalone TODD extraction (moves, maya-marketing, ask-todd) - missing
 * here entirely, which is why every api.taliferro.tech call this app
 * makes came back 401 after the migration to its own standalone app.
 * Without this, callers had to manually thread tenantId/userId/userEmail
 * into every OutreachApiService method by hand, and several call sites
 * (OutreachGoalService.getLatestMayaOutreachBatch, getAutoSendCapStatus)
 * never got userId/userEmail wired in at all. This stamps every outgoing
 * `/api/` request with the identity triad the backend requires, the same
 * way TODD's own client already does.
 */
function isBackendApiRequest ( url: string ): boolean {
  return url.includes( '/api/' );
}

export const tenantInterceptor: HttpInterceptorFn = ( req, next ) => {
  if ( !isBackendApiRequest( req.url ) ) {
    return next( req );
  }

  const authService = inject( OutreachAuthService );
  const tenantId = authService.getCurrentTenantIdSync();
  const userId = authService.getCurrentUserIdSync();
  const userEmail = authService.getCurrentUserEmailSync();

  if ( !tenantId || !userId ) {
    return next( req );
  }

  const cloned = req.clone( {
    setHeaders: {
      'X-Tenant-Id': tenantId,
      'X-User-Id': userId,
      'X-User-Email': userEmail ?? '',
    }
  } );

  return next( cloned );
};
