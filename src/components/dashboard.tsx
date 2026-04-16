"use client";

import type { ListingRow } from "@/lib/supabase";
import { ListingsChart } from "./listings-chart";
import { ListingsTable } from "./listings-table";

function fmt(n: number | null | undefined) {
  return n != null ? n.toLocaleString("en-US") : "—";
}

export function Dashboard({ listings }: { listings: ListingRow[] }) {
  const latest = listings[0] ?? null;

  return (
    <>
      {latest && (
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="rounded-lg border p-4">
            <p className="text-xs text-gray-500 mb-1">AllSurplus</p>
            <p className="text-3xl font-bold text-blue-600 tabular-nums">
              {fmt(latest.allsurplus)}
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs text-gray-500 mb-1">GovDeals</p>
            <p className="text-3xl font-bold text-green-600 tabular-nums">
              {fmt(latest.govdeals)}
            </p>
          </div>
          <p className="col-span-2 text-xs text-gray-400">
            Last updated: {latest.date} {latest.timestamp} ET
          </p>
        </div>
      )}

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-4">Trend</h2>
        <ListingsChart data={listings} />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-4">History</h2>
        <ListingsTable data={listings} />
      </section>
    </>
  );
}
