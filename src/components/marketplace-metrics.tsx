"use client";

import type { MarketplaceMetricsRow } from "@/lib/supabase";

function fmt(n: number | null | undefined) {
  return n != null ? n.toLocaleString("en-US") : "—";
}

function fmtPct(n: number | null | undefined) {
  return n != null ? (n * 100).toFixed(1) + "%" : "—";
}

function fmtDollar(n: number | null | undefined) {
  if (n == null) return "—";
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return "$" + (n / 1_000).toFixed(0) + "k";
  return "$" + n.toFixed(0);
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-xl font-bold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function PlatformSection({ label, color, data }: { label: string; color: string; data: MarketplaceMetricsRow }) {
  return (
    <div>
      <h3 className={`text-sm font-semibold mb-3 ${color}`}>{label}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Total Bids (sample)" value={fmt(data.total_bids)} sub={`${fmt(data.sample_size)} sampled`} />
        <MetricCard label="Avg Bids/Listing" value={data.avg_bids_per_listing?.toFixed(1) ?? "—"} />
        <MetricCard label="Bid Rate" value={fmtPct(data.bid_rate)} sub={`${fmt(data.listings_with_bids)} with bids`} />
        <MetricCard label="GMV Proxy (sample)" value={fmtDollar(data.total_current_price)} />
        <MetricCard label="Unique Sellers" value={fmt(data.unique_seller_count)} />
        <MetricCard label="Closing in 24h" value={fmt(data.listings_closing_24h)} />
        <MetricCard label="Avg Watch Count" value={data.avg_watch_count?.toFixed(1) ?? "—"} />
        <MetricCard label="Total Listings" value={fmt(data.total_listings)} />
      </div>
      {data.top_categories && Object.keys(data.top_categories).length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-gray-500 mb-1">Top Categories (sample)</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(data.top_categories)
              .sort(([, a], [, b]) => b - a)
              .map(([name, count]) => (
                <span key={name} className="text-xs bg-gray-100 rounded px-2 py-0.5">
                  {name} <span className="text-gray-400">({count})</span>
                </span>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function MarketplaceMetrics({
  allsurplus,
  govdeals,
}: {
  allsurplus: MarketplaceMetricsRow | null;
  govdeals: MarketplaceMetricsRow | null;
}) {
  if (!allsurplus && !govdeals) {
    return <p className="text-gray-500 text-sm">No marketplace metrics data yet. Metrics will appear after the next cron run.</p>;
  }

  return (
    <div className="space-y-6">
      {allsurplus && <PlatformSection label="AllSurplus" color="text-blue-600" data={allsurplus} />}
      {govdeals && <PlatformSection label="GovDeals" color="text-green-600" data={govdeals} />}
      {(allsurplus || govdeals) && (
        <p className="text-xs text-gray-400">
          Last updated: {(allsurplus ?? govdeals)!.date} {(allsurplus ?? govdeals)!.timestamp} ET
        </p>
      )}
    </div>
  );
}
