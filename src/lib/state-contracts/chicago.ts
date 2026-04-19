import type { StateAdapter, StateContract } from "./types";
import { normalizeVendor, SEARCH_TERMS } from "./types";
import { socrataFetchByTerms } from "./socrata";

type ChiRow = {
  voucher_number?: string;
  amount?: string;
  check_date?: string;
  contract_number?: string;
  vendor_name?: string;
  department_name?: string;
};

function n(v: string | undefined): number {
  if (!v) return 0;
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : 0;
}

export const chicagoAdapter: StateAdapter = {
  stateCode: "IL-Chicago",
  portal: "data.cityofchicago.org",
  async fetch(): Promise<StateContract[]> {
    const rows = await socrataFetchByTerms<ChiRow>(
      { portal: "data.cityofchicago.org", datasetId: "s4vu-giwb" },
      SEARCH_TERMS,
    );
    const out: StateContract[] = [];
    for (const row of rows) {
      const vendor = row.vendor_name?.trim() || "";
      const normalized = normalizeVendor(vendor);
      if (!normalized) continue;
      const amount = n(row.amount);
      const voucher = row.voucher_number?.trim() || "";
      const contractNum = row.contract_number?.trim() || "";
      // Use voucher for per-payment uniqueness; fall back to contract+amount if missing
      const contractId = voucher || `${contractNum}-${amount}`;
      out.push({
        state_code: "IL-Chicago",
        source_portal: "data.cityofchicago.org",
        source_dataset_id: "s4vu-giwb",
        contract_id: contractId,
        vendor_name: vendor,
        vendor_normalized: normalized,
        customer_agency: row.department_name?.trim() || "",
        contract_title: contractNum ? `Contract ${contractNum}` : null,
        amount,
        year: row.check_date?.trim() || "",
        quarter: "",
        period_start: null,
        period_end: null,
        raw_data: row as Record<string, unknown>,
      });
    }
    return out;
  },
};
