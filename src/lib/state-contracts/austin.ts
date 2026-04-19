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

type AusRow = {
  lgl_nm?: string;
  amount?: string;
  chk_eft_iss_dt?: string;
  fy_dc?: string;
  dept_nm?: string;
  fund_nm?: string;
  obj_nm?: string;
  rfed_doc_id?: string;
};

function n(v: string | undefined): number {
  if (!v) return 0;
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : 0;
}

export const austinAdapter: StateAdapter = {
  stateCode: "TX-Austin",
  portal: "datahub.austintexas.gov",
  async fetch(): Promise<StateContract[]> {
    const rows = await socrataFetchByWhere<AusRow>(
      { portal: "datahub.austintexas.gov", datasetId: "8c6z-qnmj" },
      "lgl_nm",
      STRICT_PATTERNS,
    );
    const out: StateContract[] = [];
    for (const row of rows) {
      const vendor = row.lgl_nm?.trim() || "";
      const normalized = normalizeVendor(vendor);
      if (!normalized) continue;
      const doc = row.rfed_doc_id?.trim() || "";
      const amount = n(row.amount);
      out.push({
        state_code: "TX-Austin",
        source_portal: "datahub.austintexas.gov",
        source_dataset_id: "8c6z-qnmj",
        contract_id: doc || `${row.chk_eft_iss_dt?.slice(0, 10) ?? "?"}-${amount}`,
        vendor_name: vendor,
        vendor_normalized: normalized,
        customer_agency: row.dept_nm?.trim() || "",
        contract_title: row.obj_nm?.trim() || null,
        amount,
        year: row.fy_dc?.trim() || "",
        quarter: "",
        period_start: row.chk_eft_iss_dt || null,
        period_end: null,
        raw_data: row as Record<string, unknown>,
      });
    }
    return out;
  },
};
