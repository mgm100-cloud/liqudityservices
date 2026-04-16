const USA_SPENDING_BASE = "https://api.usaspending.gov/api/v2";
const SEARCH_ENDPOINT = `${USA_SPENDING_BASE}/search/spending_by_award/`;
const REQUEST_TIMEOUT_MS = 15_000;

const NAME_VARIANTS = [
  "Liquidity Services",
  "GovDeals",
  "Government Liquidation",
  "AllSurplus",
];

const NAICS_CODES = ["423930", "453310", "561990"];

const AWARD_FIELDS = [
  "Award ID",
  "Recipient Name",
  "Award Amount",
  "Total Obligation",
  "Awarding Agency",
  "Funding Agency",
  "Award Type",
  "Start Date",
  "End Date",
  "Description",
  "Place of Performance State Code",
  "NAICS Code",
] as const;

// Contract award type codes: A = BPA Call, B = Purchase Order,
// C = Delivery Order, D = Definitive Contract
const AWARD_TYPE_CODES = ["A", "B", "C", "D"];

export type ContractAward = {
  award_id: string;
  recipient_name: string;
  award_amount: number;
  total_obligation: number;
  awarding_agency: string;
  funding_agency: string | null;
  award_type: string;
  start_date: string;
  end_date: string | null;
  description: string;
  place_of_performance_state: string | null;
  naics_code: string | null;
};

export type ContractSummary = {
  total_active_contracts: number;
  total_obligated_amount: number;
  new_contracts_last_30d: number;
  new_obligation_last_30d: number;
  top_agencies: { name: string; amount: number; count: number }[];
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return formatDate(d);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: Record<string, any>): ContractAward {
  return {
    award_id: String(row["Award ID"] ?? ""),
    recipient_name: String(row["Recipient Name"] ?? ""),
    award_amount: Number(row["Award Amount"] ?? 0),
    total_obligation: Number(row["Total Obligation"] ?? 0),
    awarding_agency: String(row["Awarding Agency"] ?? ""),
    funding_agency: row["Funding Agency"] ? String(row["Funding Agency"]) : null,
    award_type: String(row["Award Type"] ?? ""),
    start_date: String(row["Start Date"] ?? ""),
    end_date: row["End Date"] ? String(row["End Date"]) : null,
    description: String(row["Description"] ?? ""),
    place_of_performance_state: row["Place of Performance State Code"]
      ? String(row["Place of Performance State Code"])
      : null,
    naics_code: row["NAICS Code"] ? String(row["NAICS Code"]) : null,
  };
}

async function searchByRecipient(
  recipientName: string,
  startDate: string,
  endDate: string,
): Promise<ContractAward[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(SEARCH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filters: {
          recipient_search_text: [recipientName],
          time_period: [{ start_date: startDate, end_date: endDate }],
          award_type_codes: AWARD_TYPE_CODES,
        },
        fields: [...AWARD_FIELDS],
        page: 1,
        limit: 100,
        sort: "Start Date",
        order: "desc",
      }),
      signal: controller.signal,
    });

    if (!res.ok) return [];

    const data = (await res.json()) as { results?: Record<string, unknown>[] };
    return (data.results ?? []).map(mapRow);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function searchByNaics(
  naicsCode: string,
  startDate: string,
  endDate: string,
): Promise<ContractAward[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(SEARCH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filters: {
          naics_codes: [{ naics_code: naicsCode }],
          recipient_search_text: NAME_VARIANTS,
          time_period: [{ start_date: startDate, end_date: endDate }],
          award_type_codes: AWARD_TYPE_CODES,
        },
        fields: [...AWARD_FIELDS],
        page: 1,
        limit: 100,
        sort: "Start Date",
        order: "desc",
      }),
      signal: controller.signal,
    });

    if (!res.ok) return [];

    const data = (await res.json()) as { results?: Record<string, unknown>[] };
    return (data.results ?? []).map(mapRow);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function dedup(awards: ContractAward[]): ContractAward[] {
  const seen = new Map<string, ContractAward>();
  for (const a of awards) {
    if (a.award_id && !seen.has(a.award_id)) {
      seen.set(a.award_id, a);
    }
  }
  return Array.from(seen.values());
}

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Fetch recent contract awards for Liquidity Services and related entities.
 * Searches multiple name variants and NAICS codes, then deduplicates.
 */
export async function fetchNewContracts(
  sinceDaysAgo: number = 30,
): Promise<ContractAward[]> {
  const startDate = daysAgo(sinceDaysAgo);
  const endDate = formatDate(new Date());

  // Search by each name variant in parallel
  const nameSearches = NAME_VARIANTS.map((name) =>
    searchByRecipient(name, startDate, endDate),
  );

  // Also search by NAICS codes relevant to LQDT
  const naicsSearches = NAICS_CODES.map((code) =>
    searchByNaics(code, startDate, endDate),
  );

  const results = await Promise.all([...nameSearches, ...naicsSearches]);
  const allAwards = results.flat();

  return dedup(allAwards);
}

/**
 * Build aggregate summary stats from contract data.
 * "Active" contracts = those whose end_date is in the future or null
 * (i.e. still open) within the last 365 days of data.
 */
export async function fetchContractSummary(): Promise<ContractSummary> {
  // Fetch a broad window for active-contract detection
  const allContracts = await fetchNewContracts(365);
  const recentContracts = await fetchNewContracts(30);

  const today = formatDate(new Date());

  const activeContracts = allContracts.filter(
    (c) => c.end_date === null || c.end_date >= today,
  );

  const totalObligated = activeContracts.reduce(
    (sum, c) => sum + c.total_obligation,
    0,
  );

  const newObligation = recentContracts.reduce(
    (sum, c) => sum + c.total_obligation,
    0,
  );

  // Aggregate by awarding agency
  const agencyMap = new Map<string, { amount: number; count: number }>();
  for (const c of activeContracts) {
    const name = c.awarding_agency || "Unknown";
    const entry = agencyMap.get(name) ?? { amount: 0, count: 0 };
    entry.amount += c.total_obligation;
    entry.count += 1;
    agencyMap.set(name, entry);
  }

  const topAgencies = Array.from(agencyMap.entries())
    .map(([name, { amount, count }]) => ({ name, amount, count }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  return {
    total_active_contracts: activeContracts.length,
    total_obligated_amount: totalObligated,
    new_contracts_last_30d: recentContracts.length,
    new_obligation_last_30d: newObligation,
    top_agencies: topAgencies,
  };
}
