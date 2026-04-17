import { supabase } from "@/lib/supabase";
import type { ListingRow, MarketplaceMetricsRow, FederalContractRow, ContractSnapshotRow, MarketplaceSellerRow } from "@/lib/supabase";
import { Dashboard } from "@/components/dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [listingsRes, metricsRes, contractsRes, snapshotsRes, sellersRes] = await Promise.all([
    supabase
      .from("listings")
      .select("*")
      .order("date", { ascending: false })
      .order("timestamp", { ascending: false }),
    supabase
      .from("marketplace_metrics")
      .select("*")
      .order("date", { ascending: false })
      .order("timestamp", { ascending: false })
      .limit(2),
    supabase
      .from("federal_contracts")
      .select("*")
      .order("start_date", { ascending: false })
      .limit(20),
    supabase
      .from("contract_snapshots")
      .select("*")
      .order("date", { ascending: false })
      .limit(1),
    supabase
      .from("marketplace_sellers")
      .select("*")
      .order("date", { ascending: false })
      .order("listing_count", { ascending: false })
      .limit(200),
  ]);

  const listings: ListingRow[] = listingsRes.data ?? [];

  const metricsRows: MarketplaceMetricsRow[] = metricsRes.data ?? [];
  const latestAllsurplus = metricsRows.find((r) => r.platform === "AD") ?? null;
  const latestGovdeals = metricsRows.find((r) => r.platform === "GD") ?? null;

  const contracts: FederalContractRow[] = contractsRes.data ?? [];
  const contractSnapshot: ContractSnapshotRow | null = snapshotsRes.data?.[0] ?? null;

  const allSellers: MarketplaceSellerRow[] = sellersRes.data ?? [];
  const latestSellerDate = allSellers[0]?.date;
  const latestSellers = latestSellerDate ? allSellers.filter((s) => s.date === latestSellerDate) : [];
  const sellersAD = latestSellers.filter((s) => s.platform === "AD");
  const sellersGD = latestSellers.filter((s) => s.platform === "GD");

  return (
    <main className="px-6 py-10">
      <h1 className="text-2xl font-bold mb-1">LQDT Listings Tracker</h1>
      <p className="text-gray-500 text-sm mb-8">
        Daily active listing counts for AllSurplus and GovDeals
      </p>
      <Dashboard
        listings={listings}
        metricsAllsurplus={latestAllsurplus}
        metricsGovdeals={latestGovdeals}
        contracts={contracts}
        contractSnapshot={contractSnapshot}
        sellersAllsurplus={sellersAD}
        sellersGovdeals={sellersGD}
      />
    </main>
  );
}
