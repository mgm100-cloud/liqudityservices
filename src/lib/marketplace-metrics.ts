import { randomUUID } from "node:crypto";

export type PlatformMetrics = {
  platform: "AD" | "GD";
  total_listings: number;
  total_bids: number;
  avg_bids_per_listing: number;
  total_current_price: number;
  listings_with_bids: number;
  bid_rate: number;
  unique_seller_count: number;
  listings_closing_24h: number;
  avg_watch_count: number;
  top_categories: Record<string, number>;
  sample_size: number;
  debug?: string;
};

const MAESTRO_URL = process.env.MAESTRO_API_URL || "https://maestro.lqdt1.com";
const MAESTRO_KEY =
  process.env.MAESTRO_API_KEY || "af93060f-337e-428c-87b8-c74b5837d6cd";

function buildPayload(businessId: "AD" | "GD") {
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
    page: 1,
    displayRows: 200,
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

function safeNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return fallback;
}

function emptyMetrics(platform: "AD" | "GD", debug: string): PlatformMetrics {
  return {
    platform,
    total_listings: 0,
    total_bids: 0,
    avg_bids_per_listing: 0,
    total_current_price: 0,
    listings_with_bids: 0,
    bid_rate: 0,
    unique_seller_count: 0,
    listings_closing_24h: 0,
    avg_watch_count: 0,
    top_categories: {},
    sample_size: 0,
    debug,
  };
}

function computeMetrics(
  platform: "AD" | "GD",
  totalListings: number,
  listings: Record<string, unknown>[],
): PlatformMetrics {
  const sampleSize = listings.length;

  if (sampleSize === 0) {
    return { ...emptyMetrics(platform, "0 listings in response"), total_listings: totalListings };
  }

  let totalBids = 0;
  let totalCurrentPrice = 0;
  let listingsWithBids = 0;
  let listingsClosing24h = 0;

  const sellerIds = new Set<string>();
  const categoryCounts: Record<string, number> = {};

  const now = Date.now();
  const twentyFourHoursMs = 24 * 60 * 60 * 1000;

  for (const listing of listings) {
    const bids = safeNumber(listing.bidCount);
    totalBids += bids;
    if (bids > 0) listingsWithBids++;

    totalCurrentPrice += safeNumber(listing.currentBid);

    const sellerId = listing.accountId;
    if (sellerId != null) sellerIds.add(String(sellerId));

    const categoryName = listing.categoryDescription;
    if (typeof categoryName === "string" && categoryName.length > 0) {
      categoryCounts[categoryName] = (categoryCounts[categoryName] || 0) + 1;
    }

    const endDateTime = listing.assetAuctionEndDateUtc;
    if (typeof endDateTime === "string") {
      const endMs = new Date(endDateTime).getTime();
      if (!Number.isNaN(endMs) && endMs > now && endMs - now <= twentyFourHoursMs) {
        listingsClosing24h++;
      }
    }
  }

  const topCategories: Record<string, number> = {};
  const sorted = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  for (const [name, count] of sorted) {
    topCategories[name] = count;
  }

  return {
    platform,
    total_listings: totalListings,
    total_bids: totalBids,
    avg_bids_per_listing: Math.round((totalBids / sampleSize) * 100) / 100,
    total_current_price: Math.round(totalCurrentPrice * 100) / 100,
    listings_with_bids: listingsWithBids,
    bid_rate: Math.round((listingsWithBids / sampleSize) * 10000) / 10000,
    unique_seller_count: sellerIds.size,
    listings_closing_24h: listingsClosing24h,
    avg_watch_count: 0,
    top_categories: topCategories,
    sample_size: sampleSize,
    debug: `ok, ${sampleSize} listings, ${totalBids} bids, ${sellerIds.size} sellers`,
  };
}

async function fetchPlatformMetrics(
  businessId: "AD" | "GD",
): Promise<PlatformMetrics> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const correlationId = randomUUID();
    const res = await fetch(`${MAESTRO_URL}/search/list`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": MAESTRO_KEY,
        "x-user-id": "-1",
        "x-api-correlation-id": correlationId,
      },
      body: JSON.stringify(buildPayload(businessId)),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[marketplace-metrics] ${businessId} HTTP ${res.status}: ${errText.slice(0, 200)}`);
      return emptyMetrics(businessId, `http ${res.status}: ${errText.slice(0, 100)}`);
    }

    const data = await res.json();

    const headerCount = res.headers.get("x-total-count");
    let totalListings = 0;
    if (headerCount) {
      totalListings = parseInt(headerCount, 10) || 0;
    }

    let listings: Record<string, unknown>[] = [];
    if (Array.isArray(data?.assetSearchResults)) {
      listings = data.assetSearchResults;
    } else if (Array.isArray(data?.searchResults)) {
      listings = data.searchResults;
    } else if (Array.isArray(data)) {
      listings = data;
    }

    if (listings.length === 0) {
      const keys = data ? Object.keys(data).join(", ") : "null response";
      console.error(`[marketplace-metrics] ${businessId} no listings found. Response keys: ${keys}`);
      return emptyMetrics(businessId, `no listings array. keys: ${keys}`);
    }

    return computeMetrics(businessId, totalListings, listings);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[marketplace-metrics] ${businessId} error: ${msg}`);
    return emptyMetrics(businessId, `error: ${msg}`);
  } finally {
    clearTimeout(timeout);
  }
}

export async function scrapeMarketplaceMetrics(): Promise<{
  allsurplus: PlatformMetrics;
  govdeals: PlatformMetrics;
}> {
  const [allsurplus, govdeals] = await Promise.all([
    fetchPlatformMetrics("AD"),
    fetchPlatformMetrics("GD"),
  ]);
  return { allsurplus, govdeals };
}
