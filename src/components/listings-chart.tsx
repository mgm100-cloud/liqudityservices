"use client";

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

export function ListingsChart({ data }: { data: ListingRow[] }) {
  const chartData = [...data]
    .reverse()
    .map((row) => ({
      label: row.date,
      AllSurplus: row.allsurplus,
      GovDeals: row.govdeals,
    }));

  if (chartData.length === 0) {
    return <p className="text-gray-500 text-center py-8">No data yet.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={360}>
      <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
        <YAxis tickFormatter={(v: number) => v.toLocaleString()} tick={{ fontSize: 12 }} />
        <Tooltip formatter={(v) => typeof v === "number" ? v.toLocaleString() : v} />
        <Legend />
        <Line type="monotone" dataKey="AllSurplus" stroke="#2563eb" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="GovDeals" stroke="#16a34a" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
