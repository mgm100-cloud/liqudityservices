import { randomUUID } from "node:crypto";
import { supabase } from "./supabase";

const MAESTRO_URL = process.env.MAESTRO_API_URL || "https://maestro.lqdt1.com";
const MAESTRO_KEY =
  process.env.MAESTRO_API_KEY || "af93060f-337e-428c-87b8-c74b5837d6cd";

const PAGE_SIZE = Number(process.env.AUCTIONS_PAGE_SIZE) || 50;
const MAX_PAGES_PER_PLATFORM = Number(process.env.AUCTIONS_MAX_PAGES) || 10;
const PAGE_TIMEOUT_MS = Number(process.env.AUCTIONS_PAGE_TIMEOUT_MS) || 40000;

const CURRENCY_MAP: Record<string, string> = {
  USD: "USD", ZAR: "ZAR", EUR: "EUR", GBP: "GBP", CAD: "CAD",
  AUD: "AUD", INR: "INR", BRL: "BRL", MXN: "MXN", JPY: "JPY",
};

let cachedRates: Record<string, number> | null = null;
let ratesFetchedAt = 0;

async function fetchUsdRates(): Promise<Record<string, number>> {
  if (cachedRates && Date.now() - ratesFetchedAt < 3600_000) return cachedRates;
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return cachedRates ?? {};
    const data = await res.json();
    const rates: Record<string, number> = data.rates ?? {};
    cachedRates = rates;
    ratesFetchedAt = Date.now();
    return rates;
  } catch {
    return cachedRates ?? {};
  }
}

// Returns the USD-equivalent amount, or null if the currency is non-USD and
// no rate is available. Returning null is important: storing the raw amount
// would silently pollute current_bid_usd / final_price_usd with foreign-
// currency values labeled as USD.
function toUsd(amount: number, currencyCode: string, rates: Record<string, number>): number | null {
  if (!currencyCode || currencyCode === "USD") return amount;
  const code = CURRENCY_MAP[currencyCode] ?? currencyCode;
  const rate = rates[code];
  if (rate && rate > 0) return amount / rate;
  return null;
}

function safeNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return fallback;
}

function buildPayload(businessId: "AD" | "GD", page: number) {
  return {
    category: "",
    groupIds: [],
    businessId,
    searchText: "",
    isQAL: false,
    locationId: null,
    model: "",
    makebrand: "",
    accountIds: [],
    eventId: null,
    auctionTypeId: null,
    page,
    displayRows: PAGE_SIZE,
    sortField: "bestfit",
    sortOrder: "asc",
    requestType: "search",
    responseStyle: "",
    facets: [],
    facetsFilter: [],
    timeType: "atauction",
    sellerTypeId: null,
  };
}

type AuctionRow = {
  platform: "AD" | "GD";
  asset_id: string;
  seller_account_id: string | null;
  seller_company: string | null;
  category: string | null;
  currency_code: string | null;
  current_bid_usd: number | null;
  bid_count: number;
  close_time_utc: string | null;
  status: "open";
  last_seen_at: string;
};

function parseListing(platform: "AD" | "GD", raw: Record<string, unknown>, rates: Record<string, number>, nowIso: string): AuctionRow | null {
  const assetId = raw.assetId != null ? String(raw.assetId) : null;
  if (!assetId) return null;

  const currency = typeof raw.currencyCode === "string" ? raw.currencyCode : "USD";
  const rawBid = safeNumber(raw.currentBid);
  const usd = toUsd(rawBid, currency, rates);
  const currentBidUsd = usd === null ? null : Math.round(usd * 100) / 100;
  const endDate = typeof raw.assetAuctionEndDateUtc === "string" ? raw.assetAuctionEndDateUtc : null;

  return {
    platform,
    asset_id: assetId,
    seller_account_id: raw.accountId != null ? String(raw.accountId) : null,
    seller_company: typeof raw.companyName === "string" ? raw.companyName : null,
    category: typeof raw.categoryDescription === "string" ? raw.categoryDescription : null,
    currency_code: currency,
    current_bid_usd: currentBidUsd,
    bid_count: safeNumber(raw.bidCount),
    close_time_utc: endDate,
    status: "open",
    last_seen_at: nowIso,
  };
}

type FetchPageResult = {
  listings: Record<string, unknown>[];
  total: number | null;
  status: number | null;
  errorMessage: string | null;
  responseKeys: string | null;
};

async function fetchPage(platform: "AD" | "GD", page: number): Promise<FetchPageResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
  try {
    const res = await fetch(`${MAESTRO_URL}/search/list`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": MAESTRO_KEY,
        "x-user-id": "-1",
        "x-api-correlation-id": randomUUID(),
      },
      body: JSON.stringify(buildPayload(platform, page)),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { listings: [], total: null, status: res.status, errorMessage: `http ${res.status}: ${body.slice(0, 200)}`, responseKeys: null };
    }
    const data = await res.json();
    const headerCount = res.headers.get("x-total-count");
    const total = headerCount ? parseInt(headerCount, 10) || null : null;
    let listings: Record<string, unknown>[] = [];
    if (Array.isArray(data?.assetSearchResults)) listings = data.assetSearchResults;
    else if (Array.isArray(data?.searchResults)) listings = data.searchResults;
    else if (Array.isArray(data)) listings = data;
    const responseKeys = data && !Array.isArray(data) ? Object.keys(data).slice(0, 10).join(",") : null;
    return { listings, total, status: res.status, errorMessage: null, responseKeys };
  } catch (e) {
    return { listings: [], total: null, status: null, errorMessage: `fetch error: ${e instanceof Error ? e.message : String(e)}`, responseKeys: null };
  } finally {
    clearTimeout(timeout);
  }
}

type PlatformIngestResult = {
  upserted: number;
  pagesFetched: number;
  rowsParsed: number;
  rowsSkippedFx: number;
  total: number | null;
  lastStatus: number | null;
  fetchError: string | null;
  upsertError: string | null;
  responseKeys: string | null;
};

async function ingestPlatform(platform: "AD" | "GD", rates: Record<string, number>, nowIso: string): Promise<PlatformIngestResult> {
  const result: PlatformIngestResult = {
    upserted: 0, pagesFetched: 0, rowsParsed: 0, rowsSkippedFx: 0, total: null,
    lastStatus: null, fetchError: null, upsertError: null, responseKeys: null,
  };

  for (let page = 1; page <= MAX_PAGES_PER_PLATFORM; page++) {
    const { listings, total, status, errorMessage, responseKeys } = await fetchPage(platform, page);
    if (result.total === null && total !== null) result.total = total;
    result.lastStatus = status;
    if (errorMessage && !result.fetchError) result.fetchError = errorMessage;
    if (responseKeys && !result.responseKeys) result.responseKeys = responseKeys;
    result.pagesFetched++;
    if (listings.length === 0) break;

    const rows = listings
      .map((l) => parseListing(platform, l, rates, nowIso))
      .filter((r): r is AuctionRow => r !== null);
    result.rowsParsed += rows.length;
    result.rowsSkippedFx += rows.filter((r) => r.current_bid_usd === null).length;

    if (rows.length > 0) {
      const { error } = await supabase
        .from("auctions")
        .upsert(rows, { onConflict: "platform,asset_id" });
      if (!error) result.upserted += rows.length;
      else if (!result.upsertError) result.upsertError = error.message;
    }

    if (listings.length < PAGE_SIZE) break;
    if (result.total !== null && page * PAGE_SIZE >= result.total) break;
  }

  return result;
}

type ClosureResult = { sold: number; nosale: number; unknown: number };

async function sweepClosures(nowIso: string): Promise<ClosureResult> {
  const { data, error } = await supabase
    .from("auctions")
    .select("id, bid_count, current_bid_usd")
    .eq("status", "open")
    .lt("close_time_utc", nowIso);
  if (error || !data) return { sold: 0, nosale: 0, unknown: 0 };

  const soldIds: number[] = [];
  const nosaleIds: number[] = [];
  const unknownIds: number[] = [];
  const finalPriceById = new Map<number, number>();
  for (const row of data) {
    const bids = row.bid_count ?? 0;
    if (bids > 0) {
      // Sold, but we need a USD price to record. If current_bid_usd is null
      // the bid was in a foreign currency we couldn't convert — mark unknown
      // so it doesn't pollute realized GMV with a bogus 0.
      if (row.current_bid_usd != null) {
        soldIds.push(row.id);
        finalPriceById.set(row.id, row.current_bid_usd);
      } else {
        unknownIds.push(row.id);
      }
    } else {
      nosaleIds.push(row.id);
    }
  }

  if (soldIds.length > 0) {
    // Update each sold auction individually to capture its final_price.
    // Batched in chunks to avoid N round-trips on small sets but keep payload bounded.
    const CHUNK = 200;
    for (let i = 0; i < soldIds.length; i += CHUNK) {
      const chunk = soldIds.slice(i, i + CHUNK);
      await Promise.all(
        chunk.map((id) =>
          supabase
            .from("auctions")
            .update({
              status: "closed_sold",
              final_price_usd: finalPriceById.get(id) ?? 0,
              closed_at: nowIso,
            })
            .eq("id", id),
        ),
      );
    }
  }

  if (nosaleIds.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < nosaleIds.length; i += CHUNK) {
      const chunk = nosaleIds.slice(i, i + CHUNK);
      await supabase
        .from("auctions")
        .update({ status: "closed_nosale", final_price_usd: 0, closed_at: nowIso })
        .in("id", chunk);
    }
  }

  if (unknownIds.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < unknownIds.length; i += CHUNK) {
      const chunk = unknownIds.slice(i, i + CHUNK);
      await supabase
        .from("auctions")
        .update({ status: "unknown", closed_at: nowIso })
        .in("id", chunk);
    }
  }

  return { sold: soldIds.length, nosale: nosaleIds.length, unknown: unknownIds.length };
}

export type AuctionsIngestResult = {
  allsurplus: PlatformIngestResult;
  govdeals: PlatformIngestResult;
  closures: ClosureResult;
  rlsHint?: string;
};

export async function ingestAuctions(): Promise<AuctionsIngestResult> {
  const rates = await fetchUsdRates();
  const nowIso = new Date().toISOString();

  const [allsurplus, govdeals] = await Promise.all([
    ingestPlatform("AD", rates, nowIso),
    ingestPlatform("GD", rates, nowIso),
  ]);

  const closures = await sweepClosures(nowIso);

  const result: AuctionsIngestResult = { allsurplus, govdeals, closures };

  // If we parsed rows but upserted zero, it's almost always RLS blocking writes.
  const parsed = allsurplus.rowsParsed + govdeals.rowsParsed;
  const upserted = allsurplus.upserted + govdeals.upserted;
  if (parsed > 0 && upserted === 0) {
    result.rlsHint =
      "Parsed rows but upserted 0. Likely RLS: auctions table has no insert policy for the anon role. " +
      "Add one: create policy \"anon write\" on auctions for all using (true) with check (true);";
  }

  return result;
}

export type RevenueForecast = {
  quarter: string;
  quarter_start: string;
  quarter_end: string;
  take_rate: number;
  platforms: {
    platform: "AD" | "GD";
    realized_gmv_usd: number;
    realized_revenue_usd: number;
    auctions_closed: number;
    auctions_sold: number;
    close_rate: number;
    avg_hammer_usd: number;
    scheduled_open_auctions: number;
    scheduled_open_bid_usd: number;
    projected_remaining_gmv_usd: number;
    projected_remaining_revenue_usd: number;
    projected_total_gmv_usd: number;
    projected_total_revenue_usd: number;
  }[];
  daily: {
    date: string;
    realized_gmv_usd: number;
    projected_gmv_usd: number;
    realized_revenue_usd: number;
    projected_revenue_usd: number;
  }[];
  projected_total_gmv_usd: number;
  projected_total_revenue_usd: number;
  debug: {
    now_iso: string;
    total_rows: number;
    by_platform: Record<string, number>;
    by_status: Record<string, number>;
    with_close_time: number;
    without_close_time: number;
    in_quarter_open: number;
    in_quarter_closed: number;
    min_close_time: string | null;
    max_close_time: string | null;
    sample_row: Record<string, unknown> | null;
  };
};

function quarterBounds(d: Date): { start: Date; end: Date; label: string } {
  const y = d.getUTCFullYear();
  const q = Math.floor(d.getUTCMonth() / 3);
  const start = new Date(Date.UTC(y, q * 3, 1));
  const end = new Date(Date.UTC(y, q * 3 + 3, 1));
  return { start, end, label: `${y}Q${q + 1}` };
}

// Convert a UTC ISO timestamp to a YYYY-MM-DD date in America/New_York.
// Matches the `auction_daily_stats` view's bucketing.
function etDateKey(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const y = parts.find((p) => p.type === "year")?.value ?? "";
  const m = parts.find((p) => p.type === "month")?.value ?? "";
  const d = parts.find((p) => p.type === "day")?.value ?? "";
  return `${y}-${m}-${d}`;
}

function enumerateQuarterDays(start: Date, end: Date): string[] {
  const days: string[] = [];
  const cursor = new Date(start);
  while (cursor < end) {
    days.push(etDateKey(cursor.toISOString()));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

async function collectDebug(nowIso: string, startIso: string, endIso: string) {
  const [allRes, sampleRes] = await Promise.all([
    supabase
      .from("auctions")
      .select("platform, status, close_time_utc"),
    supabase
      .from("auctions")
      .select("*")
      .limit(1),
  ]);
  const rows = allRes.data ?? [];
  const by_platform: Record<string, number> = {};
  const by_status: Record<string, number> = {};
  let with_close_time = 0;
  let without_close_time = 0;
  let in_quarter_open = 0;
  let in_quarter_closed = 0;
  let min_close_time: string | null = null;
  let max_close_time: string | null = null;
  for (const r of rows as { platform: string; status: string; close_time_utc: string | null }[]) {
    by_platform[r.platform] = (by_platform[r.platform] ?? 0) + 1;
    by_status[r.status] = (by_status[r.status] ?? 0) + 1;
    if (r.close_time_utc) {
      with_close_time++;
      if (min_close_time === null || r.close_time_utc < min_close_time) min_close_time = r.close_time_utc;
      if (max_close_time === null || r.close_time_utc > max_close_time) max_close_time = r.close_time_utc;
      const inQ = r.close_time_utc >= startIso && r.close_time_utc < endIso;
      if (inQ) {
        if (r.status === "open" && r.close_time_utc >= nowIso) in_quarter_open++;
        if (r.status === "closed_sold" || r.status === "closed_nosale") in_quarter_closed++;
      }
    } else {
      without_close_time++;
    }
  }
  return {
    now_iso: nowIso,
    total_rows: rows.length,
    by_platform,
    by_status,
    with_close_time,
    without_close_time,
    in_quarter_open,
    in_quarter_closed,
    min_close_time,
    max_close_time,
    sample_row: (sampleRes.data?.[0] as Record<string, unknown> | undefined) ?? null,
  };
}

export async function computeRevenueForecast(takeRate = 0.2): Promise<RevenueForecast> {
  const now = new Date();
  const nowIso = now.toISOString();
  const { start, end, label } = quarterBounds(now);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const platforms: ("AD" | "GD")[] = ["AD", "GD"];
  const perPlatform = await Promise.all(
    platforms.map(async (platform) => {
      const [closedRes, openRes] = await Promise.all([
        supabase
          .from("auctions")
          .select("status, final_price_usd, close_time_utc")
          .eq("platform", platform)
          .gte("close_time_utc", startIso)
          .lt("close_time_utc", endIso)
          .in("status", ["closed_sold", "closed_nosale"]),
        supabase
          .from("auctions")
          .select("current_bid_usd, close_time_utc")
          .eq("platform", platform)
          .eq("status", "open")
          .gte("close_time_utc", nowIso)
          .lt("close_time_utc", endIso),
      ]);

      const closed = closedRes.data ?? [];
      const open = openRes.data ?? [];
      const sold = closed.filter((r) => r.status === "closed_sold");
      const realizedGmv = sold.reduce((s, r) => s + (r.final_price_usd ?? 0), 0);
      const closeRate = closed.length > 0 ? sold.length / closed.length : 0;
      const avgHammer = sold.length > 0 ? realizedGmv / sold.length : 0;
      const openBid = open.reduce((s, r) => s + (r.current_bid_usd ?? 0), 0);

      const projectedOpenGmv = open.reduce((s, r) => {
        const cur = r.current_bid_usd ?? 0;
        const hammer = Math.max(cur, avgHammer);
        return s + closeRate * hammer;
      }, 0);

      return {
        platform,
        closed,
        open,
        sold,
        realizedGmv,
        closeRate,
        avgHammer,
        openBid,
        projectedOpenGmv,
      };
    }),
  );

  // Aggregate per-day totals across platforms.
  const dailyMap = new Map<string, { realized: number; projected: number }>();
  for (const day of enumerateQuarterDays(start, end)) {
    dailyMap.set(day, { realized: 0, projected: 0 });
  }
  for (const p of perPlatform) {
    for (const row of p.sold) {
      if (!row.close_time_utc) continue;
      const key = etDateKey(row.close_time_utc);
      const bucket = dailyMap.get(key);
      if (bucket) bucket.realized += row.final_price_usd ?? 0;
    }
    for (const row of p.open) {
      if (!row.close_time_utc) continue;
      const key = etDateKey(row.close_time_utc);
      const bucket = dailyMap.get(key);
      if (!bucket) continue;
      const cur = row.current_bid_usd ?? 0;
      const hammer = Math.max(cur, p.avgHammer);
      bucket.projected += p.closeRate * hammer;
    }
  }

  const daily = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      realized_gmv_usd: Math.round(v.realized),
      projected_gmv_usd: Math.round(v.projected),
      realized_revenue_usd: Math.round(v.realized * takeRate),
      projected_revenue_usd: Math.round(v.projected * takeRate),
    }));

  const rows = perPlatform.map((p) => {
    const totalGmv = p.realizedGmv + p.projectedOpenGmv;
    return {
      platform: p.platform,
      realized_gmv_usd: Math.round(p.realizedGmv),
      realized_revenue_usd: Math.round(p.realizedGmv * takeRate),
      auctions_closed: p.closed.length,
      auctions_sold: p.sold.length,
      close_rate: Math.round(p.closeRate * 10000) / 10000,
      avg_hammer_usd: Math.round(p.avgHammer),
      scheduled_open_auctions: p.open.length,
      scheduled_open_bid_usd: Math.round(p.openBid),
      projected_remaining_gmv_usd: Math.round(p.projectedOpenGmv),
      projected_remaining_revenue_usd: Math.round(p.projectedOpenGmv * takeRate),
      projected_total_gmv_usd: Math.round(totalGmv),
      projected_total_revenue_usd: Math.round(totalGmv * takeRate),
    };
  });

  const projected_total_gmv_usd = rows.reduce((s, r) => s + r.projected_total_gmv_usd, 0);
  const projected_total_revenue_usd = rows.reduce((s, r) => s + r.projected_total_revenue_usd, 0);

  const debug = await collectDebug(nowIso, startIso, endIso);

  return {
    quarter: label,
    quarter_start: startIso,
    quarter_end: endIso,
    take_rate: takeRate,
    platforms: rows,
    daily,
    projected_total_gmv_usd,
    projected_total_revenue_usd,
    debug,
  };
}
