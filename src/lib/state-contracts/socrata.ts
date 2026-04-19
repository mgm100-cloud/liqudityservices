export type SocrataConfig = {
  portal: string;
  datasetId: string;
  searchTerms?: string[];
  appToken?: string;
};

const SOCRATA_TIMEOUT = 20_000;

/**
 * Fetch rows from a Socrata dataset matching any of the vendor patterns.
 * Primary: single combined $where OR query (1 HTTP request).
 * Fallback: parallel $q queries per pattern (for portals where $where is
 * gated by Cloudflare — e.g. opendata.maryland.gov).
 */
export async function socrataFetchByWhere<T = Record<string, unknown>>(
  cfg: SocrataConfig,
  vendorField: string,
  vendorPatterns: string[],
  limit = 500,
): Promise<T[]> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (cfg.appToken) headers["X-App-Token"] = cfg.appToken;

  // Primary: combined $where OR query
  const clauses = vendorPatterns.map(
    (pat) => `upper(${vendorField}) like '%${pat.toUpperCase().replace(/'/g, "''")}%'`,
  );
  const whereUrl = new URL(`https://${cfg.portal}/resource/${cfg.datasetId}.json`);
  whereUrl.searchParams.set("$where", clauses.join(" OR "));
  whereUrl.searchParams.set("$limit", String(limit));

  try {
    const res = await fetch(whereUrl.toString(), { headers, signal: AbortSignal.timeout(SOCRATA_TIMEOUT) });
    if (res.ok) {
      const rows = (await res.json()) as T[];
      return Array.isArray(rows) ? rows : [];
    }
    if (res.status === 403) {
      console.warn(`[socrata] ${cfg.portal}/${cfg.datasetId} $where 403; falling back to $q`);
      return await fetchByQ<T>(cfg, vendorPatterns, headers, limit);
    }
    console.error(`[socrata] ${cfg.portal}/${cfg.datasetId} HTTP ${res.status}`);
    return [];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[socrata] ${cfg.portal}/${cfg.datasetId} error: ${msg}`);
    return [];
  }
}

// Fallback: parallel $q per pattern; dedup identical rows.
async function fetchByQ<T>(
  cfg: SocrataConfig,
  terms: string[],
  headers: Record<string, string>,
  limit: number,
): Promise<T[]> {
  const results = await Promise.all(
    terms.map(async (term) => {
      const url = new URL(`https://${cfg.portal}/resource/${cfg.datasetId}.json`);
      url.searchParams.set("$q", term);
      url.searchParams.set("$limit", String(limit));
      try {
        const res = await fetch(url.toString(), { headers, signal: AbortSignal.timeout(SOCRATA_TIMEOUT) });
        if (!res.ok) return [] as T[];
        const rows = (await res.json()) as T[];
        return Array.isArray(rows) ? rows : [];
      } catch {
        return [] as T[];
      }
    }),
  );

  const seen = new Set<string>();
  const out: T[] = [];
  for (const batch of results) {
    for (const row of batch) {
      const key = JSON.stringify(row);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(row);
    }
  }
  return out;
}
