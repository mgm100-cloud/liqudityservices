import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { scrapeListings } from "@/lib/scraper";
import { scrapeMarketplaceMetrics } from "@/lib/marketplace-metrics";
import { fetchNewContracts, fetchContractSummary } from "@/lib/contracts";
import { fetchSamOpportunities } from "@/lib/sam-opportunities";
import { fetchAllStateContracts } from "@/lib/state-contracts";
import { sendDailySummary } from "@/lib/email";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const { searchParams } = new URL(request.url);
  const querySecret = searchParams.get("secret");
  const valid =
    authHeader === `Bearer ${process.env.CRON_SECRET}` ||
    (querySecret !== null && querySecret === process.env.CRON_SECRET);
  if (!valid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/New_York" }),
  );
  const date = now.toISOString().slice(0, 10);
  const timestamp = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  // Run all scrapes in parallel
  const [listingResult, metricsResult, newContracts, samResult, stateResult] = await Promise.all([
    scrapeListings(),
    scrapeMarketplaceMetrics().catch(() => null),
    fetchNewContracts(99999).catch(() => [] as Awaited<ReturnType<typeof fetchNewContracts>>),
    fetchSamOpportunities(90).catch((e) => ({ opportunities: [], debug: `error: ${e instanceof Error ? e.message : String(e)}` })),
    fetchAllStateContracts().catch((e) => ({ contracts: [], perState: { _error: { count: 0, error: e instanceof Error ? e.message : String(e) } } })),
  ]);

  const { allsurplus, govdeals } = listingResult;

  // Build summary from already-fetched contracts (avoids redundant API calls)
  const contractSummary = await fetchContractSummary(newContracts).catch(() => null);

  // 1. Store listing counts
  const { error: dbError } = await supabase
    .from("listings")
    .insert({ date, timestamp, allsurplus, govdeals });

  // 2. Store marketplace metrics + sellers
  let metricsDb: Record<string, unknown> = { success: false, error: "skipped" };
  if (metricsResult) {
    const { debug: adDebug, sellers: adSellers, ...adData } = metricsResult.allsurplus;
    const { debug: gdDebug, sellers: gdSellers, ...gdData } = metricsResult.govdeals;
    const rows = [
      { date, timestamp, ...adData },
      { date, timestamp, ...gdData },
    ];
    const { error } = await supabase.from("marketplace_metrics").insert(rows);

    // Store seller snapshots
    const toRow = (s: typeof adSellers[number], plat: "AD" | "GD") => {
      const { top_bid_amount, ...rest } = s;
      void top_bid_amount;
      return { date, platform: plat, ...rest };
    };
    const sellerRows = [
      ...adSellers.map((s) => toRow(s, "AD")),
      ...gdSellers.map((s) => toRow(s, "GD")),
    ];
    let sellersStored = 0;
    if (sellerRows.length > 0) {
      const { error: sellerErr } = await supabase.from("marketplace_sellers").insert(sellerRows);
      sellersStored = sellerErr ? 0 : sellerRows.length;
    }

    metricsDb = {
      success: !error,
      error: error?.message ?? "",
      adDebug,
      gdDebug,
      adSample: metricsResult.allsurplus.sample_size,
      gdSample: metricsResult.govdeals.sample_size,
      sellersStored,
    };
  }

  // 3. Store new contracts (upsert to avoid duplicates)
  const contractsDb: Record<string, unknown> = { newContracts: 0, snapshot: false, contractsFetched: newContracts.length };
  if (newContracts.length > 0) {
    const contractRows = newContracts.map((c) => ({
      ...c,
      first_seen_date: date,
    }));
    const { error } = await supabase
      .from("federal_contracts")
      .upsert(contractRows, { onConflict: "award_id", ignoreDuplicates: true });
    contractsDb.newContracts = error ? 0 : newContracts.length;
  }

  // 4. Store contract snapshot
  if (contractSummary) {
    const { error } = await supabase.from("contract_snapshots").insert({
      date,
      total_active_contracts: contractSummary.total_active_contracts,
      total_obligated_amount: contractSummary.total_obligated_amount,
      new_contracts_last_30d: contractSummary.new_contracts_last_30d,
      new_obligation_last_30d: contractSummary.new_obligation_last_30d,
      top_agencies: contractSummary.top_agencies,
    });
    contractsDb.snapshot = !error;
  }

  // 5. Store SAM.gov opportunities
  let samDb: Record<string, unknown> = { stored: 0, debug: samResult.debug };
  if (samResult.opportunities.length > 0) {
    const samRows = samResult.opportunities.map((o) => ({ ...o, first_seen_date: date }));
    const { error } = await supabase
      .from("sam_opportunities")
      .upsert(samRows, { onConflict: "notice_id", ignoreDuplicates: true });
    samDb = { stored: error ? 0 : samRows.length, debug: samResult.debug, error: error?.message ?? null };
  }

  // 6. Store state contracts
  let stateDb: Record<string, unknown> = { stored: 0, perState: stateResult.perState };
  if (stateResult.contracts.length > 0) {
    const stateRows = stateResult.contracts.map((c) => ({ ...c, first_seen_date: date }));
    const { error } = await supabase
      .from("state_contracts")
      .upsert(stateRows, {
        onConflict: "state_code,source_dataset_id,contract_id,vendor_normalized,year,quarter,customer_agency",
        ignoreDuplicates: true,
      });
    stateDb = { stored: error ? 0 : stateRows.length, perState: stateResult.perState, error: error?.message ?? null };
  }

  // 7. Send email
  let emailResult: { success: boolean; error?: string; chartIncluded?: boolean; chartDebug?: string } = { success: false, error: "skipped" };
  if (process.env.RESEND_API_KEY) {
    emailResult = await sendDailySummary({ date, timestamp, allsurplus, govdeals });
  }

  return NextResponse.json({
    date,
    timestamp,
    allsurplus,
    govdeals,
    db: dbError ? { error: dbError.message } : { success: true },
    metrics: metricsDb,
    contracts: contractsDb,
    sam: samDb,
    stateContracts: stateDb,
    email: emailResult,
  });
}
