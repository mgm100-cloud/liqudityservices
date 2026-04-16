"use client";

import type { ListingRow } from "@/lib/supabase";

function fmt(n: number | null) {
  return n !== null ? n.toLocaleString("en-US") : "—";
}

export function ListingsTable({ data }: { data: ListingRow[] }) {
  if (data.length === 0) {
    return <p className="text-gray-500 text-center py-8">No data yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2 pr-4 font-semibold">Date</th>
            <th className="py-2 pr-4 font-semibold">Time (ET)</th>
            <th className="py-2 pr-4 font-semibold text-right">AllSurplus</th>
            <th className="py-2 font-semibold text-right">GovDeals</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.id} className="border-b border-gray-100">
              <td className="py-2 pr-4">{row.date}</td>
              <td className="py-2 pr-4">{row.timestamp}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{fmt(row.allsurplus)}</td>
              <td className="py-2 text-right tabular-nums">{fmt(row.govdeals)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
