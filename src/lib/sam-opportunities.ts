export type SamOpportunity = {
  notice_id: string;
  title: string;
  solicitation_number: string | null;
  organization: string | null;
  posted_date: string | null;
  response_deadline: string | null;
  notice_type: string | null;
  base_type: string | null;
  naics_code: string | null;
  classification_code: string | null;
  description_url: string | null;
  ui_link: string | null;
  awardee_name: string | null;
  awardee_uei: string | null;
  award_amount: number | null;
  award_date: string | null;
};

type SamRaw = {
  noticeId?: string;
  title?: string;
  solicitationNumber?: string;
  fullParentPathName?: string;
  postedDate?: string;
  responseDeadLine?: string;
  type?: string;
  baseType?: string;
  naicsCode?: string;
  classificationCode?: string;
  description?: string;
  uiLink?: string;
  award?: {
    date?: string;
    amount?: string | number;
    awardee?: { name?: string; ueiSAM?: string };
  };
};

// GSA docs show both URL variants in different examples. We try both.
const SAM_ENDPOINTS = [
  "https://api.sam.gov/opportunities/v2/search",
  "https://api.sam.gov/prod/opportunities/v2/search",
];

function fmtDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getFullYear()}`;
}

function mapOpportunity(raw: SamRaw): SamOpportunity | null {
  if (!raw.noticeId || !raw.title) return null;
  const award = raw.award;
  const amount = award?.amount != null ? Number(award.amount) : null;
  return {
    notice_id: raw.noticeId,
    title: raw.title,
    solicitation_number: raw.solicitationNumber ?? null,
    organization: raw.fullParentPathName ?? null,
    posted_date: raw.postedDate ?? null,
    response_deadline: raw.responseDeadLine ?? null,
    notice_type: raw.type ?? null,
    base_type: raw.baseType ?? null,
    naics_code: raw.naicsCode ?? null,
    classification_code: raw.classificationCode ?? null,
    description_url: raw.description ?? null,
    ui_link: raw.uiLink ?? null,
    awardee_name: award?.awardee?.name ?? null,
    awardee_uei: award?.awardee?.ueiSAM ?? null,
    award_amount: amount != null && Number.isFinite(amount) ? amount : null,
    award_date: award?.date ?? null,
  };
}

// Build a query string without percent-encoding forward slashes in date values.
// SAM dates use MM/DD/YYYY and some gateways reject %2F-encoded slashes.
function buildQs(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v).replace(/%2F/gi, "/")}`)
    .join("&");
}

function maskKey(url: string): string {
  return url.replace(/api_key=[^&]+/, "api_key=***");
}

// Try each endpoint until one returns non-404. Cache which one works.
let workingEndpoint: string | null = null;

async function samFetch(
  apiKey: string,
  params: Record<string, string>,
): Promise<SamOpportunity[]> {
  const qs = buildQs({ api_key: apiKey, ...params });
  const endpoints = workingEndpoint ? [workingEndpoint] : SAM_ENDPOINTS;

  for (const base of endpoints) {
    const url = `${base}?${qs}`;
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      });

      if (res.status === 404) {
        const body = await res.text().catch(() => "");
        console.warn(`[sam] 404 from ${maskKey(url).slice(0, 80)}… body: ${body.slice(0, 200) || "(empty)"}`);
        continue;
      }

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error(`[sam] HTTP ${res.status} ${maskKey(url).slice(0, 80)}… body: ${body.slice(0, 300)}`);
        return [];
      }

      // Success — remember this endpoint for subsequent calls.
      if (!workingEndpoint) {
        workingEndpoint = base;
        console.log(`[sam] using endpoint: ${base}`);
      }

      const data = await res.json();
      const raw: SamRaw[] = Array.isArray(data?.opportunitiesData) ? data.opportunitiesData : [];
      const mapped: SamOpportunity[] = [];
      for (const r of raw) {
        const m = mapOpportunity(r);
        if (m) mapped.push(m);
      }
      return mapped;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[sam] fetch error for ${maskKey(url).slice(0, 80)}: ${msg}`);
    }
  }

  console.error("[sam] all endpoints returned 404 — check that SAM_API_KEY is a valid Opportunities API key");
  return [];
}

export async function fetchSamOpportunities(daysBack = 90): Promise<{
  opportunities: SamOpportunity[];
  debug: string;
}> {
  const apiKey = process.env.SAM_API_KEY;
  if (!apiKey) {
    console.error("[sam] SAM_API_KEY not set");
    return { opportunities: [], debug: "SAM_API_KEY not set" };
  }

  console.log(`[sam] API key present (${apiKey.length} chars, starts with ${apiKey.slice(0, 4)}…)`);

  const now = new Date();
  const from = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
  const postedFrom = fmtDate(from);
  const postedTo = fmtDate(now);

  // First, run a minimal probe to find the working endpoint and verify the key.
  const probe = await samFetch(apiKey, { postedFrom, postedTo, limit: "1" });
  const probeOk = probe.length >= 0 && workingEndpoint != null;

  if (!probeOk) {
    return {
      opportunities: [],
      debug: "probe failed — all endpoints returned 404 (invalid key or endpoint down)",
    };
  }

  // Run searches. Keep query count low — public keys may have daily limits.
  const searches = await Promise.all([
    samFetch(apiKey, { postedFrom, postedTo, title: "surplus", limit: "500" }),
    samFetch(apiKey, { postedFrom, postedTo, title: "liquidation", limit: "500" }),
    samFetch(apiKey, { postedFrom, postedTo, title: "disposal", limit: "500" }),
    samFetch(apiKey, { postedFrom, postedTo, ncode: "561499", limit: "500" }),
    samFetch(apiKey, { postedFrom, postedTo, ncode: "423930", limit: "500" }),
  ]);

  const seen = new Set<string>();
  const opportunities: SamOpportunity[] = [];
  for (const batch of searches) {
    for (const opp of batch) {
      if (seen.has(opp.notice_id)) continue;
      seen.add(opp.notice_id);
      opportunities.push(opp);
    }
  }

  const c = searches.map((r) => r.length);
  return {
    opportunities,
    debug: `endpoint:${workingEndpoint} surplus:${c[0]} liquidation:${c[1]} disposal:${c[2]} naics561499:${c[3]} naics423930:${c[4]} unique:${opportunities.length}`,
  };
}
