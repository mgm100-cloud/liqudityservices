import type { StateAdapter, StateContract } from "./types";
import { normalizeVendor } from "./types";
import { socrataFetchByWhere } from "./socrata";

// Strict vendor patterns — $q returns false positives ("Air Liquide") on data.nj.gov
const STRICT_PATTERNS = [
  "govdeals",
  "liquidity services",
  "bid4assets",
  "government liquidation",
  "allsurplus",
  "govplanet",
];

type NjRow = {
  fiscal_year?: string;
  fy_through_date?: string;
  department_agency_desc?: string;
  commodity_sector_desc?: string;
  vendor_name?: string;
  ytd_amt?: string;
};

function n(v: string | undefined): number {
  if (!v) return 0;
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : 0;
}

export const newJerseyAdapter: StateAdapter = {
  stateCode: "NJ",
  portal: "data.nj.gov",
  async fetch(): Promise<StateContract[]> {
    const rows = await socrataFetchByWhere<NjRow>(
      { portal: "data.nj.gov", datasetId: "ubnu-tqu7" },
      "vendor_name",
      STRICT_PATTERNS,
    );
    const out: StateContract[] = [];
    for (const row of rows) {
      const vendor = row.vendor_name?.trim() || "";
      const normalized = normalizeVendor(vendor);
      if (!normalized) continue;
      out.push({
        state_code: "NJ",
        source_portal: "data.nj.gov",
        source_dataset_id: "ubnu-tqu7",
        contract_id: "",
        vendor_name: vendor,
        vendor_normalized: normalized,
        customer_agency: row.department_agency_desc?.trim() || "",
        contract_title: row.commodity_sector_desc?.trim() || null,
        amount: n(row.ytd_amt),
        year: row.fiscal_year?.trim() || "",
        quarter: "",
        period_start: null,
        period_end: row.fy_through_date || null,
        raw_data: row as Record<string, unknown>,
      });
    }
    return out;
  },
};
