"use client";

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { ListingRow } from "@/lib/supabase";

type ChartRow = {
  label: string;
  AllSurplus: number | null;
  GovDeals: number | null;
  "AS YoY %": number | null;
  "GD YoY %": number | null;
};

function buildChartData(filtered: ListingRow[], allData: ListingRow[]): ChartRow[] {
  const byDate = new Map<string, ListingRow>();
  for (const row of allData) {
    if (!byDate.has(row.date)) byDate.set(row.date, row);
  }

  function yearAgoDate(d: string): string {
    const dt = new Date(d + "T00:00:00");
    dt.setFullYear(dt.getFullYear() - 1);
    return dt.toISOString().slice(0, 10);
  }

  function findNearby(target: string): ListingRow | null {
    const exact = byDate.get(target);
    if (exact) return exact;
    for (let offset = 1; offset <= 7; offset++) {
      const d = new Date(target + "T00:00:00");
      d.setDate(d.getDate() - offset);
      const key = d.toISOString().slice(0, 10);
      const found = byDate.get(key);
      if (found) return found;
      const d2 = new Date(target + "T00:00:00");
      d2.setDate(d2.getDate() + offset);
      const key2 = d2.toISOString().slice(0, 10);
      const found2 = byDate.get(key2);
      if (found2) return found2;
    }
    return null;
  }

  const chronological = [...filtered].reverse();
  return chronological.map((row) => {
    const ya = yearAgoDate(row.date);
    const prev = findNearby(ya);

    let asYoY: number | null = null;
    let gdYoY: number | null = null;

    if (prev && row.allsurplus != null && prev.allsurplus != null && prev.allsurplus > 0) {
      asYoY = Math.round(((row.allsurplus - prev.allsurplus) / prev.allsurplus) * 1000) / 10;
    }
    if (prev && row.govdeals != null && prev.govdeals != null && prev.govdeals > 0) {
      gdYoY = Math.round(((row.govdeals - prev.govdeals) / prev.govdeals) * 1000) / 10;
    }

    return {
      label: row.date,
      AllSurplus: row.allsurplus,
      GovDeals: row.govdeals,
      "AS YoY %": asYoY,
      "GD YoY %": gdYoY,
    };
  });
}

export function ListingsChart({ data, allData }: { data: ListingRow[]; allData: ListingRow[] }) {
  const chartData = useMemo(() => buildChartData(data, allData), [data, allData]);

  if (chartData.length === 0) {
    return <p className="text-gray-500 text-center py-8">No data yet.</p>;
  }

  const hasYoY = chartData.some((r) => r["AS YoY %"] != null || r["GD YoY %"] != null);

  return (
    <ResponsiveContainer width="100%" height={600}>
      <LineChart data={chartData} margin={{ top: 5, right: hasYoY ? 60 : 20, bottom: 5, left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
        <YAxis
          yAxisId="left"
          tickFormatter={(v: number) => (v / 1000).toFixed(0) + "k"}
          tick={{ fontSize: 12 }}
        />
        {hasYoY && (
          <YAxis
            yAxisId="right"
            orientation="right"
            tickFormatter={(v: number) => v + "%"}
            tick={{ fontSize: 12 }}
          />
        )}
        <Tooltip
          formatter={(v, name) =>
            typeof v === "number"
              ? (String(name).includes("YoY") ? v + "%" : v.toLocaleString())
              : v
          }
        />
        <Legend />
        <Line yAxisId="left" type="monotone" dataKey="AllSurplus" stroke="#2563eb" strokeWidth={2} dot={false} connectNulls />
        <Line yAxisId="left" type="monotone" dataKey="GovDeals" stroke="#16a34a" strokeWidth={2} dot={false} connectNulls />
        {hasYoY && (
          <>
            <Line yAxisId="right" type="monotone" dataKey="AS YoY %" stroke="#93c5fd" strokeWidth={1.5} strokeDasharray="4 2" dot={false} connectNulls />
            <Line yAxisId="right" type="monotone" dataKey="GD YoY %" stroke="#86efac" strokeWidth={1.5} strokeDasharray="4 2" dot={false} connectNulls />
          </>
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
