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

type CinRow = {
  vendor_name?: string;
  amount?: string;
  record_date?: string;
  fiscal_year?: string;
  dept_desc?: string;
  fund_desc?: string;
  check_no?: string;
  trans_id?: string;
};

function n(v: string | undefined): number {
  if (!v) return 0;
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : 0;
}

export const cincinnatiAdapter: StateAdapter = {
  stateCode: "OH-Cincinnati",
  portal: "data.cincinnati-oh.gov",
  async fetch(): Promise<StateContract[]> {
    const rows = await socrataFetchByWhere<CinRow>(
      { portal: "data.cincinnati-oh.gov", datasetId: "qrj9-83t8" },
      "vendor_name",
      STRICT_PATTERNS,
    );
    const out: StateContract[] = [];
    for (const row of rows) {
      const vendor = row.vendor_name?.trim() || "";
      const normalized = normalizeVendor(vendor);
      if (!normalized) continue;
      const txn = row.trans_id?.trim() || row.check_no?.trim() || "";
      out.push({
        state_code: "OH-Cincinnati",
        source_portal: "data.cincinnati-oh.gov",
        source_dataset_id: "qrj9-83t8",
        contract_id: txn,
        vendor_name: vendor,
        vendor_normalized: normalized,
        customer_agency: row.dept_desc?.trim() || "",
        contract_title: row.fund_desc?.trim() || null,
        amount: n(row.amount),
        year: row.fiscal_year?.trim() || "",
        quarter: "",
        period_start: row.record_date || null,
        period_end: null,
        raw_data: row as Record<string, unknown>,
      });
    }
    return out;
  },
};
