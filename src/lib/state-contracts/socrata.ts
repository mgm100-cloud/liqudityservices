export type SocrataConfig = {
  portal: string;
  datasetId: string;
  searchTerms?: string[];
  appToken?: string;
};

const SOCRATA_TIMEOUT = 12_000;

/**
 * Single combined $where OR query — 1 HTTP request per dataset.
 * Replaces the old per-pattern loop that fired 6 serial requests.
 */
export async function socrataFetchByWhere<T = Record<string, unknown>>(
  cfg: SocrataConfig,
  vendorField: string,
  vendorPatterns: string[],
  limit = 500,
): Promise<T[]> {
  const clauses = vendorPatterns.map(
    (pat) => `upper(${vendorField}) like '%${pat.toUpperCase().replace(/'/g, "''")}%'`,
  );
  const whereClause = clauses.join(" OR ");

  const url = new URL(`https://${cfg.portal}/resource/${cfg.datasetId}.json`);
  url.searchParams.set("$where", whereClause);
  url.searchParams.set("$limit", String(limit));

  const headers: Record<string, string> = { Accept: "application/json" };
  if (cfg.appToken) headers["X-App-Token"] = cfg.appToken;

  try {
    const res = await fetch(url.toString(), { headers, signal: AbortSignal.timeout(SOCRATA_TIMEOUT) });
    if (!res.ok) {
      console.error(`[socrata] ${cfg.portal}/${cfg.datasetId} HTTP ${res.status}`);
      return [];
    }
    const rows = (await res.json()) as T[];
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[socrata] ${cfg.portal}/${cfg.datasetId} error: ${msg}`);
    return [];
  }
}
