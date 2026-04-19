import type { StateAdapter, StateContract } from "./types";
import { normalizeVendor, SEARCH_TERMS } from "./types";
import { socrataFetchByWhere } from "./socrata";

const STRICT_PATTERNS = [
  "govdeals",
  "liquidity services",
  "bid4assets",
  "government liquidation",
  "allsurplus",
  "govplanet",
];

// Payments dataset
type ChiPayRow = {
  voucher_number?: string;
  amount?: string;
  check_date?: string;
  contract_number?: string;
  vendor_name?: string;
  department_name?: string;
};

// Contracts dataset (distinct — has PDFs and contract amounts)
type ChiContractRow = {
  vendor_name?: string;
  vendor_id?: string;
  award_amount?: string;
  purchase_order_contract_number?: string;
  specification_number?: string;
  approval_date?: string;
  start_date?: string;
  end_date?: string;
  department?: string;
  procurement_type?: string;
  contract_pdf?: { url?: string };
};

function n(v: string | undefined): number {
  if (!v) return 0;
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : 0;
}

async function fetchPayments(): Promise<StateContract[]> {
  const rows = await socrataFetchByWhere<ChiPayRow>(
    { portal: "data.cityofchicago.org", datasetId: "s4vu-giwb" },
    "vendor_name",
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
}

async function fetchContracts(): Promise<StateContract[]> {
  const rows = await socrataFetchByWhere<ChiContractRow>(
    { portal: "data.cityofchicago.org", datasetId: "rsxa-ify5" },
    "vendor_name",
    STRICT_PATTERNS,
  );
  const out: StateContract[] = [];
  for (const row of rows) {
    const vendor = row.vendor_name?.trim() || "";
    const normalized = normalizeVendor(vendor);
    if (!normalized) continue;
    const po = row.purchase_order_contract_number?.trim() || "";
    const spec = row.specification_number?.trim() || "";
    const contractId = po || spec || "";
    const year = row.start_date?.slice(0, 4) || row.approval_date?.slice(0, 4) || "";
    out.push({
      state_code: "IL-Chicago",
      source_portal: "data.cityofchicago.org",
      source_dataset_id: "rsxa-ify5",
      contract_id: contractId,
      vendor_name: vendor,
      vendor_normalized: normalized,
      customer_agency: row.department?.trim() || "",
      contract_title: row.procurement_type?.trim() || (spec ? `Spec ${spec}` : null),
      amount: n(row.award_amount),
      year,
      quarter: "",
      period_start: row.start_date || null,
      period_end: row.end_date || null,
      raw_data: row as Record<string, unknown>,
    });
  }
  return out;
}

export const chicagoAdapter: StateAdapter = {
  stateCode: "IL-Chicago",
  portal: "data.cityofchicago.org",
  async fetch(): Promise<StateContract[]> {
    const [payments, contracts] = await Promise.all([
      fetchPayments().catch((e) => { console.error("[chicago] payments:", e); return [] as StateContract[]; }),
      fetchContracts().catch((e) => { console.error("[chicago] contracts:", e); return [] as StateContract[]; }),
    ]);
    return [...payments, ...contracts];
  },
};
