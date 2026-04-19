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

type McRow = {
  vendor?: string;
  vendor_id?: string;
  amount?: string;
  payment_date?: string;
  fiscal_year?: string;
  department?: string;
  po_num?: string;
  invoice_id?: string;
  account_code?: string;
};

function n(v: string | undefined): number {
  if (!v) return 0;
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : 0;
}

export const montgomeryMdAdapter: StateAdapter = {
  stateCode: "MD-Montgomery",
  portal: "data.montgomerycountymd.gov",
  async fetch(): Promise<StateContract[]> {
    const rows = await socrataFetchByWhere<McRow>(
      { portal: "data.montgomerycountymd.gov", datasetId: "vpf9-6irq" },
      "vendor",
      STRICT_PATTERNS,
    );
    const out: StateContract[] = [];
    for (const row of rows) {
      const vendor = row.vendor?.trim() || "";
      const normalized = normalizeVendor(vendor);
      if (!normalized) continue; // filters out "Wholesale Liquidations LLC" false positives
      const poNum = row.po_num?.trim() || "";
      const invoice = row.invoice_id?.trim() || "";
      const amount = n(row.amount);
      out.push({
        state_code: "MD-Montgomery",
        source_portal: "data.montgomerycountymd.gov",
        source_dataset_id: "vpf9-6irq",
        contract_id: invoice || poNum || `${row.payment_date?.slice(0, 10) ?? "?"}-${amount}`,
        vendor_name: vendor,
        vendor_normalized: normalized,
        customer_agency: row.department?.trim() || "",
        contract_title: row.account_code ? `Account ${row.account_code}` : null,
        amount,
        year: row.fiscal_year?.trim() || "",
        quarter: "",
        period_start: row.payment_date || null,
        period_end: null,
        raw_data: row as Record<string, unknown>,
      });
    }
    return out;
  },
};
