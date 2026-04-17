import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { scrapeListings } from "@/lib/scraper";
import { scrapeMarketplaceMetrics } from "@/lib/marketplace-metrics";
import { fetchNewContracts, fetchContractSummary } from "@/lib/contracts";
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
  const [listingResult, metricsResult, newContracts] = await Promise.all([
    scrapeListings(),
    scrapeMarketplaceMetrics().catch(() => null),
    fetchNewContracts(365).catch(() => [] as Awaited<ReturnType<typeof fetchNewContracts>>),
  ]);

  const { allsurplus, govdeals } = listingResult;

  // Build summary from already-fetched contracts (avoids redundant API calls)
  const contractSummary = await fetchContractSummary(newContracts).catch(() => null);

  // 1. Store listing counts
  const { error: dbError } = await supabase
    .from("listings")
    .insert({ date, timestamp, allsurplus, govdeals });

  // 2. Store marketplace metrics
  let metricsDb: Record<string, unknown> = { success: false, error: "skipped" };
  if (metricsResult) {
    const { debug: adDebug, ...adData } = metricsResult.allsurplus;
    const { debug: gdDebug, ...gdData } = metricsResult.govdeals;
    const rows = [
      { date, timestamp, ...adData },
      { date, timestamp, ...gdData },
    ];
    const { error } = await supabase.from("marketplace_metrics").insert(rows);
    metricsDb = {
      success: !error,
      error: error?.message ?? "",
      adDebug,
      gdDebug,
      adSample: metricsResult.allsurplus.sample_size,
      gdSample: metricsResult.govdeals.sample_size,
    };
  }

  // 3. Store new contracts (upsert to avoid duplicates)
  let contractsDb: Record<string, unknown> = { newContracts: 0, snapshot: false, contractsFetched: newContracts.length };
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

  // 5. Send email
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
    email: emailResult,
  });
}
