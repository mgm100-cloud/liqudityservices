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

type OrRow = {
  contractor_information?: string;
  award_title?: string;
  document_number?: string;
  original_award_value?: string;
  total_award_value_w_amendments?: string;
  original_start_date?: string;
  expiration_date?: string;
  agency_name?: string;
  amendment_number?: string;
};

function n(v: string | undefined): number {
  if (!v) return 0;
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : 0;
}

async function fetchDataset(datasetId: string): Promise<StateContract[]> {
  const rows = await socrataFetchByWhere<OrRow>(
    { portal: "data.oregon.gov", datasetId },
    "contractor_information",
    STRICT_PATTERNS,
  );
  const out: StateContract[] = [];
  for (const row of rows) {
    const vendor = row.contractor_information?.trim() || "";
    const normalized = normalizeVendor(vendor);
    if (!normalized) continue;
    const docNum = row.document_number?.trim() || "";
    const amendNum = row.amendment_number?.trim() || "";
    const contractId = amendNum ? `${docNum}/A${amendNum}` : docNum;
    const year = row.original_start_date?.slice(0, 4) || "";
    out.push({
      state_code: "OR",
      source_portal: "data.oregon.gov",
      source_dataset_id: datasetId,
      contract_id: contractId,
      vendor_name: vendor,
      vendor_normalized: normalized,
      customer_agency: row.agency_name?.trim() || "",
      contract_title: row.award_title?.trim() || null,
      amount: n(row.total_award_value_w_amendments) || n(row.original_award_value),
      year,
      quarter: "",
      period_start: row.original_start_date || null,
      period_end: row.expiration_date || null,
      raw_data: row as Record<string, unknown>,
    });
  }
  return out;
}

export const oregonAdapter: StateAdapter = {
  stateCode: "OR",
  portal: "data.oregon.gov",
  async fetch(): Promise<StateContract[]> {
    const [active, expired] = await Promise.all([
      fetchDataset("6e9e-sfc4").catch((e) => { console.error("[oregon] active:", e); return [] as StateContract[]; }),
      fetchDataset("8izy-bwhd").catch((e) => { console.error("[oregon] expired:", e); return [] as StateContract[]; }),
    ]);
    return [...active, ...expired];
  },
};
