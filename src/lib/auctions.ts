import { randomUUID } from "node:crypto";
import { supabase } from "./supabase";

const MAESTRO_URL = process.env.MAESTRO_API_URL || "https://maestro.lqdt1.com";
const MAESTRO_KEY =
  process.env.MAESTRO_API_KEY || "af93060f-337e-428c-87b8-c74b5837d6cd";

const PAGE_SIZE = Number(process.env.AUCTIONS_PAGE_SIZE) || 200;
const MAX_PAGES_PER_PLATFORM = Number(process.env.AUCTIONS_MAX_PAGES) || 5;

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

function toUsd(amount: number, currencyCode: string, rates: Record<string, number>): number {
  if (!currencyCode || currencyCode === "USD") return amount;
  const code = CURRENCY_MAP[currencyCode] ?? currencyCode;
  const rate = rates[code];
  if (rate && rate > 0) return amount / rate;
  return amount;
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
    sortField: "endingsoon",
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
  current_bid_usd: number;
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
  const currentBidUsd = toUsd(rawBid, currency, rates);
  const endDate = typeof raw.assetAuctionEndDateUtc === "string" ? raw.assetAuctionEndDateUtc : null;

  return {
    platform,
    asset_id: assetId,
    seller_account_id: raw.accountId != null ? String(raw.accountId) : null,
    seller_company: typeof raw.companyName === "string" ? raw.companyName : null,
    category: typeof raw.categoryDescription === "string" ? raw.categoryDescription : null,
    currency_code: currency,
    current_bid_usd: Math.round(currentBidUsd * 100) / 100,
    bid_count: safeNumber(raw.bidCount),
    close_time_utc: endDate,
    status: "open",
    last_seen_at: nowIso,
  };
}

async function fetchPage(platform: "AD" | "GD", page: number): Promise<{ listings: Record<string, unknown>[]; total: number | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
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
    if (!res.ok) return { listings: [], total: null };
    const data = await res.json();
    const headerCount = res.headers.get("x-total-count");
    const total = headerCount ? parseInt(headerCount, 10) || null : null;
    let listings: Record<string, unknown>[] = [];
    if (Array.isArray(data?.assetSearchResults)) listings = data.assetSearchResults;
    else if (Array.isArray(data?.searchResults)) listings = data.searchResults;
    else if (Array.isArray(data)) listings = data;
    return { listings, total };
  } catch {
    return { listings: [], total: null };
  } finally {
    clearTimeout(timeout);
  }
}

async function ingestPlatform(platform: "AD" | "GD", rates: Record<string, number>, nowIso: string): Promise<{ upserted: number; pagesFetched: number; total: number | null }> {
  let upserted = 0;
  let pagesFetched = 0;
  let total: number | null = null;

  for (let page = 1; page <= MAX_PAGES_PER_PLATFORM; page++) {
    const { listings, total: pageTotal } = await fetchPage(platform, page);
    if (total === null && pageTotal !== null) total = pageTotal;
    pagesFetched++;
    if (listings.length === 0) break;

    const rows = listings
      .map((l) => parseListing(platform, l, rates, nowIso))
      .filter((r): r is AuctionRow => r !== null);

    if (rows.length > 0) {
      const { error } = await supabase
        .from("auctions")
        .upsert(rows, { onConflict: "platform,asset_id" });
      if (!error) upserted += rows.length;
      else console.error(`[auctions] upsert error ${platform} p${page}: ${error.message}`);
    }

    if (listings.length < PAGE_SIZE) break;
    if (total !== null && page * PAGE_SIZE >= total) break;
  }

  return { upserted, pagesFetched, total };
}

type ClosureResult = { sold: number; nosale: number };

async function sweepClosures(nowIso: string): Promise<ClosureResult> {
  const { data, error } = await supabase
    .from("auctions")
    .select("id, bid_count, current_bid_usd")
    .eq("status", "open")
    .lt("close_time_utc", nowIso);
  if (error || !data) return { sold: 0, nosale: 0 };

  const soldIds: number[] = [];
  const nosaleIds: number[] = [];
  const finalPriceById = new Map<number, number>();
  for (const row of data) {
    if ((row.bid_count ?? 0) > 0) {
      soldIds.push(row.id);
      finalPriceById.set(row.id, row.current_bid_usd ?? 0);
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

  return { sold: soldIds.length, nosale: nosaleIds.length };
}

export type AuctionsIngestResult = {
  allsurplus: { upserted: number; pagesFetched: number; total: number | null };
  govdeals: { upserted: number; pagesFetched: number; total: number | null };
  closures: ClosureResult;
};

export async function ingestAuctions(): Promise<AuctionsIngestResult> {
  const rates = await fetchUsdRates();
  const nowIso = new Date().toISOString();

  const [allsurplus, govdeals] = await Promise.all([
    ingestPlatform("AD", rates, nowIso),
    ingestPlatform("GD", rates, nowIso),
  ]);

  const closures = await sweepClosures(nowIso);

  return { allsurplus, govdeals, closures };
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
  projected_total_gmv_usd: number;
  projected_total_revenue_usd: number;
};

function quarterBounds(d: Date): { start: Date; end: Date; label: string } {
  const y = d.getUTCFullYear();
  const q = Math.floor(d.getUTCMonth() / 3);
  const start = new Date(Date.UTC(y, q * 3, 1));
  const end = new Date(Date.UTC(y, q * 3 + 3, 1));
  return { start, end, label: `${y}Q${q + 1}` };
}

export async function computeRevenueForecast(takeRate = 0.2): Promise<RevenueForecast> {
  const now = new Date();
  const { start, end, label } = quarterBounds(now);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const platforms: ("AD" | "GD")[] = ["AD", "GD"];
  const rows = await Promise.all(
    platforms.map(async (platform) => {
      const [closedRes, openRes] = await Promise.all([
        supabase
          .from("auctions")
          .select("status, final_price_usd")
          .eq("platform", platform)
          .gte("close_time_utc", startIso)
          .lt("close_time_utc", endIso)
          .in("status", ["closed_sold", "closed_nosale"]),
        supabase
          .from("auctions")
          .select("current_bid_usd")
          .eq("platform", platform)
          .eq("status", "open")
          .gte("close_time_utc", now.toISOString())
          .lt("close_time_utc", endIso),
      ]);

      const closed = closedRes.data ?? [];
      const open = openRes.data ?? [];
      const sold = closed.filter((r) => r.status === "closed_sold");
      const realizedGmv = sold.reduce((s, r) => s + (r.final_price_usd ?? 0), 0);
      const closeRate = closed.length > 0 ? sold.length / closed.length : 0;
      const avgHammer = sold.length > 0 ? realizedGmv / sold.length : 0;
      const openBid = open.reduce((s, r) => s + (r.current_bid_usd ?? 0), 0);

      // Forecast: each still-open auction closes with probability = trailing close rate,
      // and its hammer equals max(current_bid, trailing avg hammer) when sold.
      const projectedOpenGmv = open.reduce((s, r) => {
        const cur = r.current_bid_usd ?? 0;
        const hammer = Math.max(cur, avgHammer);
        return s + closeRate * hammer;
      }, 0);

      const totalGmv = realizedGmv + projectedOpenGmv;

      return {
        platform,
        realized_gmv_usd: Math.round(realizedGmv),
        realized_revenue_usd: Math.round(realizedGmv * takeRate),
        auctions_closed: closed.length,
        auctions_sold: sold.length,
        close_rate: Math.round(closeRate * 10000) / 10000,
        avg_hammer_usd: Math.round(avgHammer),
        scheduled_open_auctions: open.length,
        scheduled_open_bid_usd: Math.round(openBid),
        projected_remaining_gmv_usd: Math.round(projectedOpenGmv),
        projected_remaining_revenue_usd: Math.round(projectedOpenGmv * takeRate),
        projected_total_gmv_usd: Math.round(totalGmv),
        projected_total_revenue_usd: Math.round(totalGmv * takeRate),
      };
    }),
  );

  const projected_total_gmv_usd = rows.reduce((s, r) => s + r.projected_total_gmv_usd, 0);
  const projected_total_revenue_usd = rows.reduce((s, r) => s + r.projected_total_revenue_usd, 0);

  return {
    quarter: label,
    quarter_start: startIso,
    quarter_end: endIso,
    take_rate: takeRate,
    platforms: rows,
    projected_total_gmv_usd,
    projected_total_revenue_usd,
  };
}
