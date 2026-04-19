export type SocrataConfig = {
  portal: string;
  datasetId: string;
  searchTerms?: string[];
  appToken?: string;
};

export async function socrataFetchByTerms<T = Record<string, unknown>>(
  cfg: SocrataConfig,
  terms: string[],
  limit = 500,
): Promise<T[]> {
  const seen = new Set<string>();
  const all: T[] = [];

  for (const term of terms) {
    const url = new URL(`https://${cfg.portal}/resource/${cfg.datasetId}.json`);
    url.searchParams.set("$q", term);
    url.searchParams.set("$limit", String(limit));

    const headers: Record<string, string> = { Accept: "application/json" };
    if (cfg.appToken) headers["X-App-Token"] = cfg.appToken;

    try {
      const res = await fetch(url.toString(), { headers, signal: AbortSignal.timeout(15000) });
      if (!res.ok) {
        console.error(`[socrata] ${cfg.portal}/${cfg.datasetId} ${term} HTTP ${res.status}`);
        continue;
      }
      const rows = (await res.json()) as T[];
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        const key = JSON.stringify(row);
        if (seen.has(key)) continue;
        seen.add(key);
        all.push(row);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[socrata] ${cfg.portal}/${cfg.datasetId} ${term} error: ${msg}`);
    }
  }

  return all;
}

/**
 * Fetch with strict $where clause (per-vendor-field LIKE match).
 * Use for portals where $q returns too many false positives.
 */
export async function socrataFetchByWhere<T = Record<string, unknown>>(
  cfg: SocrataConfig,
  vendorField: string,
  vendorPatterns: string[],
  limit = 500,
): Promise<T[]> {
  const seen = new Set<string>();
  const all: T[] = [];

  for (const pat of vendorPatterns) {
    const whereClause = `upper(${vendorField}) like '%${pat.toUpperCase().replace(/'/g, "''")}%'`;
    const url = new URL(`https://${cfg.portal}/resource/${cfg.datasetId}.json`);
    url.searchParams.set("$where", whereClause);
    url.searchParams.set("$limit", String(limit));

    const headers: Record<string, string> = { Accept: "application/json" };
    if (cfg.appToken) headers["X-App-Token"] = cfg.appToken;

    try {
      const res = await fetch(url.toString(), { headers, signal: AbortSignal.timeout(15000) });
      if (!res.ok) {
        console.error(`[socrata] ${cfg.portal}/${cfg.datasetId} where ${pat} HTTP ${res.status}`);
        continue;
      }
      const rows = (await res.json()) as T[];
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        const key = JSON.stringify(row);
        if (seen.has(key)) continue;
        seen.add(key);
        all.push(row);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[socrata] ${cfg.portal}/${cfg.datasetId} where ${pat} error: ${msg}`);
    }
  }

  return all;
}
