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

type NjSingleRow = {
  fiscal_year?: string;
  fy_through_date?: string;
  department_agency_desc?: string;
  commodity_sector_desc?: string;
  vendor_name?: string;
  ytd_amt?: string;
};

// Multi-year wide format: one row per vendor with fy_2008..fy_2025 columns (amount per FY)
type NjMultiRow = {
  vendor_name?: string;
  department_agency_desc?: string;
  commodity_sector_desc?: string;
  [k: string]: unknown;
};

function n(v: unknown): number {
  if (v == null) return 0;
  const x = parseFloat(String(v));
  return Number.isFinite(x) ? x : 0;
}

async function fetchSingleYear(): Promise<StateContract[]> {
  const rows = await socrataFetchByWhere<NjSingleRow>(
    { portal: "data.nj.gov", datasetId: "ubnu-tqu7" },
    "vendor_name",
    STRICT_PATTERNS,
  );
  const out: StateContract[] = [];
  for (const row of rows) {
    const vendor = row.vendor_name?.trim() || "";
    const normalized = normalizeVendor(vendor);
    if (!normalized) continue;
    out.push({
      state_code: "NJ",
      source_portal: "data.nj.gov",
      source_dataset_id: "ubnu-tqu7",
      contract_id: "",
      vendor_name: vendor,
      vendor_normalized: normalized,
      customer_agency: row.department_agency_desc?.trim() || "",
      contract_title: row.commodity_sector_desc?.trim() || null,
      amount: n(row.ytd_amt),
      year: row.fiscal_year?.trim() || "",
      quarter: "",
      period_start: null,
      period_end: row.fy_through_date || null,
      raw_data: row as Record<string, unknown>,
    });
  }
  return out;
}

// Pivot wide-format multi-year rows into one StateContract per non-zero fiscal year
async function fetchMultiYear(): Promise<StateContract[]> {
  const rows = await socrataFetchByWhere<NjMultiRow>(
    { portal: "data.nj.gov", datasetId: "qvvf-qhtv" },
    "vendor_name",
    STRICT_PATTERNS,
  );
  const out: StateContract[] = [];
  // Match column names like "fy_2020" or "fy2020"
  const fyRegex = /^fy_?(\d{4})(?:_\d+)?$/;
  for (const row of rows) {
    const vendor = (row.vendor_name as string | undefined)?.trim() || "";
    const normalized = normalizeVendor(vendor);
    if (!normalized) continue;
    for (const [key, val] of Object.entries(row)) {
      const m = key.match(fyRegex);
      if (!m) continue;
      const amt = n(val);
      if (amt === 0) continue;
      const year = m[1];
      out.push({
        state_code: "NJ",
        source_portal: "data.nj.gov",
        source_dataset_id: "qvvf-qhtv",
        contract_id: "",
        vendor_name: vendor,
        vendor_normalized: normalized,
        customer_agency: (row.department_agency_desc as string | undefined)?.trim() || "",
        contract_title: (row.commodity_sector_desc as string | undefined)?.trim() || null,
        amount: amt,
        year,
        quarter: "",
        period_start: null,
        period_end: null,
        raw_data: { _source_column: key, ...row } as Record<string, unknown>,
      });
    }
  }
  return out;
}

export const newJerseyAdapter: StateAdapter = {
  stateCode: "NJ",
  portal: "data.nj.gov",
  async fetch(): Promise<StateContract[]> {
    const [single, multi] = await Promise.all([
      fetchSingleYear().catch((e) => { console.error("[nj] single:", e); return [] as StateContract[]; }),
      fetchMultiYear().catch((e) => { console.error("[nj] multi:", e); return [] as StateContract[]; }),
    ]);
    return [...single, ...multi];
  },
};
