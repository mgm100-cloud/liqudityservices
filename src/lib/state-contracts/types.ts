export type StateContract = {
  state_code: string;
  source_portal: string;
  source_dataset_id: string;
  contract_id: string;
  vendor_name: string;
  vendor_normalized: string;
  customer_agency: string;
  contract_title: string | null;
  amount: number | null;
  year: string;
  quarter: string;
  period_start: string | null;
  period_end: string | null;
  raw_data: Record<string, unknown>;
};

export type StateAdapter = {
  stateCode: string;
  portal: string;
  fetch: () => Promise<StateContract[]>;
};

const VENDOR_PATTERNS: { normalized: string; patterns: RegExp[] }[] = [
  { normalized: "govdeals", patterns: [/govdeals/i, /gov\s*deals/i] },
  { normalized: "liquidity_services", patterns: [/liquidity\s*services/i, /liquidity\s*svc/i] },
  { normalized: "bid4assets", patterns: [/bid4\s*assets/i, /bid\s*4\s*assets/i] },
  { normalized: "government_liquidation", patterns: [/government\s*liquidation/i, /gov\s*liquidation/i] },
  { normalized: "allsurplus", patterns: [/allsurplus/i, /all\s*surplus/i] },
  { normalized: "govplanet", patterns: [/govplanet/i, /gov\s*planet/i] },
  { normalized: "machinio", patterns: [/machinio/i] },
  { normalized: "network_international", patterns: [/network\s*international/i] },
];

export function normalizeVendor(name: string): string | null {
  for (const { normalized, patterns } of VENDOR_PATTERNS) {
    if (patterns.some((p) => p.test(name))) return normalized;
  }
  return null;
}

export const SEARCH_TERMS = ["govdeals", "liquidity services", "bid4assets", "government liquidation", "allsurplus", "govplanet"];
