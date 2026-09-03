/**
 * Trimmed from shared/data/interfaces/product.model.ts - only the fields
 * network-pricing actually reads (per-tenant custom pricing overrides
 * stored on the tenant's own contact.company.products).
 */
export interface Product {
  name?: string;
  active?: boolean;
  discontinued?: boolean;
  description: string;
  shortDescription?: string;
  priceLabel?: string;
  stripePriceIdMonthly?: string;
}
