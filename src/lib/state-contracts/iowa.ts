import type { StateAdapter, StateContract } from "./types";
import { normalizeVendor, SEARCH_TERMS } from "./types";
import { socrataFetchByTerms } from "./socrata";

// Iowa State Checkbook (per-payment)
type IaCheckRow = {
  fiscal_year?: string;
  accounting_period?: string;
  department?: string;
  fund_name?: string;
  program?: string;
  expense_category?: string;
  vendor?: string;
  vendor_id?: string;
  payment_id?: string;
  payment_date?: string;
  invoice_id?: string;
  invoice_date?: string;
  amount?: string;
  description?: string;
};

// Iowa Board of Regents (pre-aggregated per FY+institution)
type IaRegentsRow = {
  bfy?: string;
  institution?: string;
  vendor_name?: string;
  amount?: string;
};

function n(v: string | undefined): number {
  if (!v) return 0;
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : 0;
}

async function fetchCheckbook(): Promise<StateContract[]> {
  const rows = await socrataFetchByTerms<IaCheckRow>(
    { portal: "data.iowa.gov", datasetId: "cyqb-8ina" },
    SEARCH_TERMS,
  );
  const out: StateContract[] = [];
  for (const row of rows) {
    const vendor = row.vendor?.trim() || "";
    const normalized = normalizeVendor(vendor);
    if (!normalized) continue;
    const amount = n(row.amount);
    const paymentId = row.payment_id?.trim() || "";
    const contractId = paymentId || `${row.invoice_id?.trim() || "?"}-${amount}`;
    out.push({
      state_code: "IA",
      source_portal: "data.iowa.gov",
      source_dataset_id: "cyqb-8ina",
      contract_id: contractId,
      vendor_name: vendor,
      vendor_normalized: normalized,
      customer_agency: row.department?.trim() || "",
      contract_title: row.description?.trim() || row.expense_category?.trim() || null,
      amount,
      year: row.fiscal_year?.trim() || "",
      quarter: row.accounting_period?.trim() || "",
      period_start: row.payment_date || null,
      period_end: null,
      raw_data: row as Record<string, unknown>,
    });
  }
  return out;
}

async function fetchRegents(): Promise<StateContract[]> {
  const rows = await socrataFetchByTerms<IaRegentsRow>(
    { portal: "data.iowa.gov", datasetId: "y3id-d73d" },
    SEARCH_TERMS,
  );
  const out: StateContract[] = [];
  for (const row of rows) {
    const vendor = row.vendor_name?.trim() || "";
    const normalized = normalizeVendor(vendor);
    if (!normalized) continue;
    out.push({
      state_code: "IA",
      source_portal: "data.iowa.gov",
      source_dataset_id: "y3id-d73d",
      contract_id: "",
      vendor_name: vendor,
      vendor_normalized: normalized,
      customer_agency: row.institution?.trim() || "",
      contract_title: "Board of Regents Vendor Payments",
      amount: n(row.amount),
      year: row.bfy?.trim() || "",
      quarter: "",
      period_start: null,
      period_end: null,
      raw_data: row as Record<string, unknown>,
    });
  }
  return out;
}

export const iowaAdapter: StateAdapter = {
  stateCode: "IA",
  portal: "data.iowa.gov",
  async fetch(): Promise<StateContract[]> {
    const [checkbook, regents] = await Promise.all([
      fetchCheckbook().catch((e) => { console.error("[iowa] checkbook:", e); return [] as StateContract[]; }),
      fetchRegents().catch((e) => { console.error("[iowa] regents:", e); return [] as StateContract[]; }),
    ]);
    return [...checkbook, ...regents];
  },
};
