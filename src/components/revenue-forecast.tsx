"use client";

import { useEffect, useState } from "react";

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

export function RevenueForecast() {
  const [takeRate, setTakeRate] = useState(0.2);
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

      {ad && <PlatformBlock label="AllSurplus" color="text-blue-600" p={ad} />}
      {gd && <PlatformBlock label="GovDeals" color="text-green-600" p={gd} />}

      <p className="text-xs text-gray-400">
        Forecast = realized GMV (closed-sold auctions this quarter) + Σ(open auctions closing this quarter) × close rate × max(current bid, avg hammer).
        Multiplied by take rate to estimate revenue.
      </p>
    </div>
  );
}
