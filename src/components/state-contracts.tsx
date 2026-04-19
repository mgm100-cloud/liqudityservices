"use client";

import type { StateContractRow } from "@/lib/supabase";

function fmtDollar(n: number | null | undefined) {
  if (n == null || n === 0) return "—";
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return "$" + (n / 1_000).toFixed(0) + "k";
  return "$" + n.toFixed(0);
}

const VENDOR_LABEL: Record<string, string> = {
  govdeals: "GovDeals",
  liquidity_services: "Liquidity Services",
  bid4assets: "Bid4Assets",
  government_liquidation: "Government Liquidation",
  allsurplus: "AllSurplus",
  govplanet: "GovPlanet",
};

export function StateContracts({ contracts }: { contracts: StateContractRow[] }) {
  if (contracts.length === 0) {
    return (
      <p className="text-gray-500 text-sm">
        No state contract data yet. Tracks LQDT entities (GovDeals, Liquidity Services, Bid4Assets) in state procurement data. Currently covers: Washington.
      </p>
    );
  }

  // Group by state then by contract/vendor for summary
  const byState: Record<string, StateContractRow[]> = {};
  for (const c of contracts) {
    if (!byState[c.state_code]) byState[c.state_code] = [];
    byState[c.state_code].push(c);
  }

  // Totals by vendor
  const byVendor: Record<string, { total: number; count: number }> = {};
  for (const c of contracts) {
    const k = c.vendor_normalized;
    if (!byVendor[k]) byVendor[k] = { total: 0, count: 0 };
    byVendor[k].total += c.amount ?? 0;
    byVendor[k].count += 1;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {Object.entries(byVendor)
          .sort(([, a], [, b]) => b.total - a.total)
          .map(([k, v]) => (
            <div key={k} className="rounded border px-3 py-1.5 text-xs">
              <span className="font-semibold">{VENDOR_LABEL[k] ?? k}</span>
              <span className="text-gray-500 ml-2">
                {fmtDollar(v.total)} · {v.count} records
              </span>
            </div>
          ))}
      </div>

      {Object.entries(byState)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([state, rows]) => (
          <div key={state}>
            <h3 className="text-sm font-semibold mb-2">{state}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b-2 border-gray-300">
                    <th className="py-1.5 pr-4 text-left">Vendor</th>
                    <th className="py-1.5 pr-4 text-left">Contract</th>
                    <th className="py-1.5 pr-4 text-left">Title</th>
                    <th className="py-1.5 pr-4 text-left">Customer</th>
                    <th className="py-1.5 pr-4 text-left">Year</th>
                    <th className="py-1.5 pr-4 text-left">Qtr</th>
                    <th className="py-1.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 50).map((c) => (
                    <tr key={c.id} className="border-b border-gray-100">
                      <td className="py-1 pr-4 font-medium">{VENDOR_LABEL[c.vendor_normalized] ?? c.vendor_name}</td>
                      <td className="py-1 pr-4 font-mono text-xs text-gray-500">{c.contract_id || "—"}</td>
                      <td className="py-1 pr-4 truncate max-w-[200px]">{c.contract_title ?? "—"}</td>
                      <td className="py-1 pr-4 truncate max-w-[180px] text-gray-500">{c.customer_agency || "—"}</td>
                      <td className="py-1 pr-4 tabular-nums">{c.year || "—"}</td>
                      <td className="py-1 pr-4 tabular-nums">{c.quarter || "—"}</td>
                      <td className="py-1 text-right tabular-nums">{fmtDollar(c.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
    </div>
  );
}
