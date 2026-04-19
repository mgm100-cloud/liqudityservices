import type { StateAdapter, StateContract } from "./types";
import { normalizeVendor, SEARCH_TERMS } from "./types";
import { socrataFetchByWhere } from "./socrata";

type MdRow = {
  fiscal_year?: string;
  agency_name?: string;
  vendor_name?: string;
  vendor_zip?: string;
  amount?: string;
  fiscal_period?: string;
  date?: string;
  category?: string;
};

function n(v: string | undefined): number {
  if (!v) return 0;
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : 0;
}

export const marylandAdapter: StateAdapter = {
  stateCode: "MD",
  portal: "opendata.maryland.gov",
  async fetch(): Promise<StateContract[]> {
    const rows = await socrataFetchByWhere<MdRow>(
      { portal: "opendata.maryland.gov", datasetId: "7syw-q4cy" },
      "vendor_name",
      SEARCH_TERMS,
    );
    const out: StateContract[] = [];
    for (const row of rows) {
      const vendor = row.vendor_name?.trim() || "";
      const normalized = normalizeVendor(vendor);
      if (!normalized) continue;
      const amount = n(row.amount);
      const date = row.date?.trim() || "";
      const period = row.fiscal_period?.trim() || "";
      // Synthesize contract_id for per-payment uniqueness (no natural contract number)
      const contractId = `${period || "?"}-${date.slice(0, 10) || "?"}-${amount}`;
      out.push({
        state_code: "MD",
        source_portal: "opendata.maryland.gov",
        source_dataset_id: "7syw-q4cy",
        contract_id: contractId,
        vendor_name: vendor,
        vendor_normalized: normalized,
        customer_agency: row.agency_name?.trim() || "",
        contract_title: row.category?.trim() || null,
        amount,
        year: row.fiscal_year?.trim() || "",
        quarter: period,
        period_start: date || null,
        period_end: null,
        raw_data: row as Record<string, unknown>,
      });
    }
    return out;
  },
};
