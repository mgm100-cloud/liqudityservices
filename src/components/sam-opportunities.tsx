"use client";

import type { SamOpportunityRow } from "@/lib/supabase";

function fmtDollar(n: number | null | undefined) {
  if (n == null) return "—";
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return "$" + (n / 1_000).toFixed(0) + "k";
  return "$" + n.toFixed(0);
}

function noticeTypeBadge(t: string | null): string {
  if (!t) return "bg-gray-100 text-gray-600";
  const s = t.toLowerCase();
  if (s.includes("award")) return "bg-green-100 text-green-700";
  if (s.includes("sources sought")) return "bg-amber-100 text-amber-700";
  if (s.includes("solicitation")) return "bg-blue-100 text-blue-700";
  if (s.includes("presol") || s.includes("pre-sol")) return "bg-purple-100 text-purple-700";
  return "bg-gray-100 text-gray-600";
}

export function SamOpportunities({ opportunities }: { opportunities: SamOpportunityRow[] }) {
  if (opportunities.length === 0) {
    return (
      <p className="text-gray-500 text-sm">
        No SAM.gov opportunities yet. Data will appear after the next cron run (requires SAM_API_KEY env var).
      </p>
    );
  }

  const awards = opportunities.filter((o) => o.notice_type?.toLowerCase().includes("award"));
  const sourcesSought = opportunities.filter((o) => o.notice_type?.toLowerCase().includes("sources sought"));
  const solicitations = opportunities.filter((o) => {
    const t = (o.notice_type ?? "").toLowerCase();
    return t.includes("solicitation") || t.includes("combined");
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-gray-500 mb-1">Total (last 90d)</p>
          <p className="text-xl font-bold tabular-nums">{opportunities.length}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-gray-500 mb-1">Sources Sought</p>
          <p className="text-xl font-bold tabular-nums text-amber-600">{sourcesSought.length}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-gray-500 mb-1">Solicitations</p>
          <p className="text-xl font-bold tabular-nums text-blue-600">{solicitations.length}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-gray-500 mb-1">Awards</p>
          <p className="text-xl font-bold tabular-nums text-green-600">{awards.length}</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2 border-gray-300">
              <th className="py-2 pr-4 text-left">Posted</th>
              <th className="py-2 pr-4 text-left">Type</th>
              <th className="py-2 pr-4 text-left">Title</th>
              <th className="py-2 pr-4 text-left">Agency</th>
              <th className="py-2 pr-4 text-left">NAICS</th>
              <th className="py-2 text-right">Award $</th>
            </tr>
          </thead>
          <tbody>
            {opportunities.slice(0, 30).map((o) => (
              <tr key={o.notice_id} className="border-b border-gray-100">
                <td className="py-1.5 pr-4 whitespace-nowrap text-gray-500">{o.posted_date?.slice(0, 10) ?? "—"}</td>
                <td className="py-1.5 pr-4">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${noticeTypeBadge(o.notice_type)}`}>
                    {o.notice_type ?? "—"}
                  </span>
                </td>
                <td className="py-1.5 pr-4 max-w-[340px]">
                  {o.ui_link ? (
                    <a
                      href={o.ui_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline truncate block"
                      title={o.title}
                    >
                      {o.title}
                    </a>
                  ) : (
                    <span className="truncate block" title={o.title}>{o.title}</span>
                  )}
                </td>
                <td className="py-1.5 pr-4 truncate max-w-[180px] text-gray-500">{o.organization ?? "—"}</td>
                <td className="py-1.5 pr-4 font-mono text-xs text-gray-500">{o.naics_code ?? "—"}</td>
                <td className="py-1.5 text-right tabular-nums">{fmtDollar(o.award_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">
        Queries: keywords (surplus/disposal/liquidation/auction) + NAICS 561499 &amp; 423930 + LQDT (UEI WJV4A6AM6ZN6) awards.
      </p>
    </div>
  );
}
