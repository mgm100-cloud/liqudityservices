const SAM_BASE = "https://api.sam.gov/opportunities/v2/search";
const LQDT_UEI = "WJV4A6AM6ZN6";

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

async function samFetch(params: Record<string, string>): Promise<SamOpportunity[]> {
  const apiKey = process.env.SAM_API_KEY;
  if (!apiKey) {
    console.error("[sam] SAM_API_KEY not set");
    return [];
  }
  const url = new URL(SAM_BASE);
  url.searchParams.set("api_key", apiKey);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(20000) });
    if (!res.ok) {
      console.error(`[sam] HTTP ${res.status} for ${Object.entries(params).map(([k]) => k).join(",")}`);
      return [];
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
    console.error(`[sam] error: ${msg}`);
    return [];
  }
}

export async function fetchSamOpportunities(daysBack = 90): Promise<{
  opportunities: SamOpportunity[];
  debug: string;
}> {
  const now = new Date();
  const from = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
  const postedFrom = fmtDate(from);
  const postedTo = fmtDate(now);

  // Three parallel searches: keywords, NAICS codes, LQDT awards
  const searches = [
    samFetch({
      postedFrom,
      postedTo,
      q: 'surplus OR disposal OR liquidation OR "personal property" OR auction',
      ptype: "o,p,r,k",
      limit: "500",
    }),
    samFetch({
      postedFrom,
      postedTo,
      ncode: "561499",
      limit: "500",
    }),
    samFetch({
      postedFrom,
      postedTo,
      ncode: "423930",
      limit: "500",
    }),
    samFetch({
      postedFrom,
      postedTo,
      ptype: "a",
      ueiSAM: LQDT_UEI,
      limit: "200",
    }),
  ];

  const results = await Promise.all(searches);
  const seen = new Set<string>();
  const opportunities: SamOpportunity[] = [];
  for (const batch of results) {
    for (const opp of batch) {
      if (seen.has(opp.notice_id)) continue;
      seen.add(opp.notice_id);
      opportunities.push(opp);
    }
  }

  const counts = results.map((r) => r.length).join("/");
  return {
    opportunities,
    debug: `keywords:${counts.split("/")[0]} naics561499:${counts.split("/")[1]} naics423930:${counts.split("/")[2]} lqdt_awards:${counts.split("/")[3]} total_unique:${opportunities.length}`,
  };
}
