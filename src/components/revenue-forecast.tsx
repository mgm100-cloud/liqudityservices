"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

type DailyPoint = {
  date: string;
  realized_gmv_usd: number;
  projected_gmv_usd: number;
  realized_revenue_usd: number;
  projected_revenue_usd: number;
};

type PlatformForecast = {
  platform: "AD" | "GD";
  realized_gmv_usd: number;
  realized_revenue_usd: number;
  auctions_closed: number;
  auctions_sold: number;
  close_rate: number;
  avg_hammer_usd: number;
  scheduled_open_auctions: number;
  scheduled_open_bid_usd: number;
  projected_remaining_gmv_usd: number;
  projected_remaining_revenue_usd: number;
  projected_total_gmv_usd: number;
  projected_total_revenue_usd: number;
};

type Forecast = {
  quarter: string;
  quarter_start: string;
  quarter_end: string;
  take_rate: number;
  platforms: PlatformForecast[];
  daily: DailyPoint[];
  projected_total_gmv_usd: number;
  projected_total_revenue_usd: number;
};

function fmtDollar(n: number | null | undefined) {
  if (n == null) return "—";
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return "$" + (n / 1_000).toFixed(0) + "k";
  return "$" + n.toFixed(0);
}

function fmt(n: number | null | undefined) {
  return n != null ? n.toLocaleString("en-US") : "—";
}

function fmtPct(n: number | null | undefined) {
  return n != null ? (n * 100).toFixed(1) + "%" : "—";
}

function Card({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${strong ? "bg-gray-900 text-white border-gray-900" : ""}`}>
      <p className={`text-xs mb-1 ${strong ? "text-gray-300" : "text-gray-500"}`}>{label}</p>
      <p className="text-xl font-bold tabular-nums">{value}</p>
      {sub && <p className={`text-xs mt-0.5 ${strong ? "text-gray-400" : "text-gray-400"}`}>{sub}</p>}
    </div>
  );
}

function PlatformBlock({ label, color, p }: { label: string; color: string; p: PlatformForecast }) {
  return (
    <div>
      <h3 className={`text-sm font-semibold mb-3 ${color}`}>{label}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card label="Realized GMV (QTD)" value={fmtDollar(p.realized_gmv_usd)} sub={`${fmt(p.auctions_sold)} sold / ${fmt(p.auctions_closed)} closed`} />
        <Card label="Realized Revenue" value={fmtDollar(p.realized_revenue_usd)} sub={`at take rate`} />
        <Card label="Close Rate" value={fmtPct(p.close_rate)} sub={`avg hammer ${fmtDollar(p.avg_hammer_usd)}`} />
        <Card label="Scheduled Open" value={fmt(p.scheduled_open_auctions)} sub={`open bids ${fmtDollar(p.scheduled_open_bid_usd)}`} />
        <Card label="Projected Remaining GMV" value={fmtDollar(p.projected_remaining_gmv_usd)} />
        <Card label="Projected Remaining Rev" value={fmtDollar(p.projected_remaining_revenue_usd)} />
        <Card label="Projected Total GMV" value={fmtDollar(p.projected_total_gmv_usd)} />
        <Card label="Projected Total Revenue" value={fmtDollar(p.projected_total_revenue_usd)} strong />
      </div>
    </div>
  );
}

type FetchState = { forecast: Forecast | null; error: string | null; done: boolean };

type ChartMetric = "gmv" | "revenue";

function DailyForecastChart({ daily, metric, todayKey }: { daily: DailyPoint[]; metric: ChartMetric; todayKey: string }) {
  const data = daily.map((d) => ({
    date: d.date.slice(5),
    Realized: metric === "gmv" ? d.realized_gmv_usd : d.realized_revenue_usd,
    Projected: metric === "gmv" ? d.projected_gmv_usd : d.projected_revenue_usd,
  }));
  const hasAny = data.some((d) => d.Realized > 0 || d.Projected > 0);
  if (!hasAny) {
    return <p className="text-gray-500 text-sm py-8 text-center">No daily data yet — auctions table fills after the next cron run.</p>;
  }
  const todayLabel = todayKey.slice(5);

  return (
    <ResponsiveContainer width="100%" height={340}>
      <BarChart data={data} margin={{ top: 10, right: 16, bottom: 5, left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
        <YAxis
          tickFormatter={(v: number) => (v >= 1_000_000 ? (v / 1_000_000).toFixed(1) + "M" : (v / 1000).toFixed(0) + "k")}
          tick={{ fontSize: 11 }}
        />
        <Tooltip formatter={(v) => (typeof v === "number" ? "$" + v.toLocaleString() : v)} />
        <Legend />
        <ReferenceLine x={todayLabel} stroke="#9ca3af" strokeDasharray="4 2" label={{ value: "today", position: "top", fontSize: 10, fill: "#6b7280" }} />
        <Bar dataKey="Realized" stackId="a" fill="#2563eb" />
        <Bar dataKey="Projected" stackId="a" fill="#93c5fd" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RevenueForecast() {
  const [takeRate, setTakeRate] = useState(0.2);
  const [chartMetric, setChartMetric] = useState<ChartMetric>("gmv");
  const [state, setState] = useState<FetchState>({ forecast: null, error: null, done: false });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/forecast?takeRate=${takeRate}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setState({ forecast: data, error: null, done: true });
      })
      .catch((e) => {
        if (!cancelled) setState((prev) => ({ forecast: prev.forecast, error: e instanceof Error ? e.message : String(e), done: true }));
      });
    return () => {
      cancelled = true;
    };
  }, [takeRate]);

  const { forecast, error, done } = state;
  if (!done && !forecast) return <p className="text-gray-500 text-sm">Loading forecast…</p>;
  if (error && !forecast) return <p className="text-red-600 text-sm">Error: {error}</p>;
  if (!forecast) return <p className="text-gray-500 text-sm">No forecast data yet. Auctions table fills after the next cron run.</p>;

  const ad = forecast.platforms.find((p) => p.platform === "AD");
  const gd = forecast.platforms.find((p) => p.platform === "GD");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="text-sm text-gray-600">
          Quarter <span className="font-semibold text-gray-900">{forecast.quarter}</span>
        </div>
        <label className="text-sm text-gray-600 flex items-center gap-2">
          Take rate
          <input
            type="number"
            step="0.01"
            min="0"
            max="1"
            value={takeRate}
            onChange={(e) => setTakeRate(Math.max(0, Math.min(1, Number(e.target.value) || 0)))}
            className="w-20 border rounded px-2 py-0.5 text-sm"
          />
          <span className="text-xs text-gray-400">{(takeRate * 100).toFixed(0)}%</span>
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card label={`Projected ${forecast.quarter} GMV`} value={fmtDollar(forecast.projected_total_gmv_usd)} />
        <Card label={`Projected ${forecast.quarter} Revenue`} value={fmtDollar(forecast.projected_total_revenue_usd)} strong />
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">Daily {chartMetric === "gmv" ? "GMV" : "Revenue"} — {forecast.quarter}</h3>
          <div className="flex gap-1">
            {(["gmv", "revenue"] as ChartMetric[]).map((m) => (
              <button
                key={m}
                onClick={() => setChartMetric(m)}
                className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                  chartMetric === m
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
                }`}
              >
                {m === "gmv" ? "GMV" : "Revenue"}
              </button>
            ))}
          </div>
        </div>
        <DailyForecastChart
          daily={forecast.daily}
          metric={chartMetric}
          todayKey={new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" })}
        />
      </div>

      {ad && <PlatformBlock label="AllSurplus" color="text-blue-600" p={ad} />}
      {gd && <PlatformBlock label="GovDeals" color="text-green-600" p={gd} />}

      <p className="text-xs text-gray-400">
        Forecast = realized GMV (closed-sold auctions this quarter) + Σ(open auctions closing this quarter) × close rate × max(current bid, avg hammer).
        Multiplied by take rate to estimate revenue.
      </p>
    </div>
  );
}
