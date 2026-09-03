/**
 * Trimmed from services/purchase-flow.config.ts - only the Outreach entry,
 * and loginReturnUrl/successRoute/postConfirmRoute point at this app's own
 * routes ('/pricing', '/success', '/app') rather than TODD's
 * '/outreach/...' sub-routes, since this app IS Outreach, not a page
 * inside a larger app. checkoutEndpoint/confirmEndpoint are unchanged -
 * those are todd-backend routes, not frontend ones.
 */
export interface ProductPurchaseFlowConfig {
  productKey: 'outreach';
  loginReturnUrl: string;
  checkoutEndpoint: string;
  confirmEndpoint: string;
  successRoute: string;
  postConfirmRoute: string;
  checkoutUrlField?: string;
  checkoutCredentials?: RequestCredentials;
  confirmCredentials?: RequestCredentials;
  legacyAccessStorageKey?: string;
}

export const OUTREACH_PURCHASE_FLOW: ProductPurchaseFlowConfig = {
  productKey: 'outreach',
  loginReturnUrl: '/pricing',
  checkoutEndpoint: '/outreach/checkout',
  confirmEndpoint: '/outreach/checkout/confirm',
  successRoute: '/success',
  postConfirmRoute: '/app',
  checkoutCredentials: 'include',
  confirmCredentials: 'include',
};
