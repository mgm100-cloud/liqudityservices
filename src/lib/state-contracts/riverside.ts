import type { StateAdapter, StateContract } from "./types";
import { normalizeVendor } from "./types";
import { socrataFetchByWhere } from "./socrata";

const STRICT_PATTERNS = [
  "govdeals",
  "liquidity services",
  "bid4assets",
  "government liquidation",
  "allsurplus",
  "govplanet",
];

type RivRow = {
  vendor_name?: string;
  vendor_id?: string;
  amount?: string;
  date?: string;
  department?: string;
  fund?: string;
  fiscal_year?: string;
  invoice_id?: string;
  account_category?: string;
};

function n(v: string | undefined): number {
  if (!v) return 0;
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : 0;
}

export const riversideAdapter: StateAdapter = {
  stateCode: "CA-Riverside",
  portal: "data.countyofriverside.us",
  async fetch(): Promise<StateContract[]> {
    const rows = await socrataFetchByWhere<RivRow>(
      { portal: "data.countyofriverside.us", datasetId: "swwh-4ka9" },
      "vendor_name",
      STRICT_PATTERNS,
    );
    const out: StateContract[] = [];
    for (const row of rows) {
      const vendor = row.vendor_name?.trim() || "";
      const normalized = normalizeVendor(vendor);
      if (!normalized) continue;
      const invoice = row.invoice_id?.trim() || "";
      const amount = n(row.amount);
      out.push({
        state_code: "CA-Riverside",
        source_portal: "data.countyofriverside.us",
        source_dataset_id: "swwh-4ka9",
        contract_id: invoice || `${row.date?.slice(0, 10) ?? "?"}-${amount}`,
        vendor_name: vendor,
        vendor_normalized: normalized,
        customer_agency: row.department?.trim() || "",
        contract_title: row.account_category?.trim() || null,
        amount,
        year: row.fiscal_year?.trim() || "",
        quarter: "",
        period_start: row.date || null,
        period_end: null,
        raw_data: row as Record<string, unknown>,
      });
    }
    return out;
  },
};
