import type { StateAdapter, StateContract } from "./types";
import { normalizeVendor, SEARCH_TERMS } from "./types";
import { socrataFetchByWhere } from "./socrata";

type WaRow = {
  customer_type?: string;
  customer_name?: string;
  contract_number?: string;
  contract_title?: string;
  vendor_name?: string;
  year?: string;
  q1_sales_reported?: string;
  q2_sales_reported?: string;
  q3_sales_reported?: string;
  q4_sales_reported?: string;
};

function n(v: string | undefined): number {
  if (!v) return 0;
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : 0;
}

function toContract(row: WaRow, quarter: string, amount: number): StateContract | null {
  const vendor = row.vendor_name?.trim() || "";
  const normalized = normalizeVendor(vendor);
  if (!normalized) return null;
  return {
    state_code: "WA",
    source_portal: "data.wa.gov",
    source_dataset_id: "n8q6-4twj",
    contract_id: row.contract_number?.trim() || "",
    vendor_name: vendor,
    vendor_normalized: normalized,
    customer_agency: row.customer_name?.trim() || row.customer_type?.trim() || "",
    contract_title: row.contract_title?.trim() || null,
    amount,
    year: row.year?.trim() || "",
    quarter,
    period_start: null,
    period_end: null,
    raw_data: row as Record<string, unknown>,
  };
}

export const washingtonAdapter: StateAdapter = {
  stateCode: "WA",
  portal: "data.wa.gov",
  async fetch(): Promise<StateContract[]> {
    const rows = await socrataFetchByWhere<WaRow>(
      { portal: "data.wa.gov", datasetId: "n8q6-4twj" },
      "vendor_name",
      SEARCH_TERMS,
    );
    const out: StateContract[] = [];
    for (const row of rows) {
      const q1 = n(row.q1_sales_reported);
      const q2 = n(row.q2_sales_reported);
      const q3 = n(row.q3_sales_reported);
      const q4 = n(row.q4_sales_reported);
      // Emit one row per quarter with sales so we track time-series
      if (q1 > 0) { const c = toContract(row, "Q1", q1); if (c) out.push(c); }
      if (q2 > 0) { const c = toContract(row, "Q2", q2); if (c) out.push(c); }
      if (q3 > 0) { const c = toContract(row, "Q3", q3); if (c) out.push(c); }
      if (q4 > 0) { const c = toContract(row, "Q4", q4); if (c) out.push(c); }
      // Also emit contract even if zero sales, so we track active contract existence
      if (q1 + q2 + q3 + q4 === 0) {
        const c = toContract(row, "none", 0);
        if (c) out.push(c);
      }
    }
    return out;
  },
};
