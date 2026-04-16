type ScrapeResult = {
  allsurplus: number | null;
  govdeals: number | null;
};

const MAESTRO_URL = process.env.MAESTRO_API_URL || "https://maestro.lqdt1.com";
const MAESTRO_KEY = process.env.MAESTRO_API_KEY || "af93060f-337e-428c-87b8-c74b5837d6cd";

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
    displayRows: 1,
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

async function fetchListingCount(businessId: "AD" | "GD"): Promise<number | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(`${MAESTRO_URL}/search/list`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": MAESTRO_KEY,
        "x-user-id": "-1",
        "x-api-correlation-id": crypto.randomUUID(),
      },
      body: JSON.stringify(buildPayload(businessId)),
      signal: controller.signal,
    });

    if (!res.ok) return null;

    const totalCount = res.headers.get("x-total-count");
    return totalCount ? parseInt(totalCount, 10) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function scrapeListings(): Promise<ScrapeResult> {
  const [allsurplus, govdeals] = await Promise.all([
    fetchListingCount("AD"),
    fetchListingCount("GD"),
  ]);
  return { allsurplus, govdeals };
}
