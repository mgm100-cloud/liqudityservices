import { Resend } from "resend";
import { supabase } from "./supabase";
import type { ListingRow } from "./supabase";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

type EmailParams = {
  date: string;
  timestamp: string;
  allsurplus: number | null;
  govdeals: number | null;
};

function fmtNum(n: number | null) {
  return n != null ? n.toLocaleString("en-US") : "N/A";
}

async function generateChartImage(rows: ListingRow[]): Promise<string | null> {
  const withData = rows.filter((r) => r.allsurplus != null || r.govdeals != null);
  if (withData.length === 0) return null;

  const chronological = [...withData].reverse();
  const labels = chronological.map((r) => r.date);
  const asData = chronological.map((r) => (r.allsurplus != null ? r.allsurplus : null));
  const gdData = chronological.map((r) => (r.govdeals != null ? r.govdeals : null));

  const chartString = JSON.stringify({
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "AllSurplus",
          data: asData,
          borderColor: "#2563eb",
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
          spanGaps: true,
        },
        {
          label: "GovDeals",
          data: gdData,
          borderColor: "#16a34a",
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
          spanGaps: true,
        },
      ],
    },
    options: {
      title: { display: true, text: "LQDT Active Listings (1 Year)" },
      scales: {
        xAxes: [{ ticks: { maxTicksLimit: 12, fontSize: 10 } }],
        yAxes: [{ ticks: { beginAtZero: false } }],
      },
      legend: { position: "bottom" },
    },
  });

  try {
    const res = await fetch("https://quickchart.io/chart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chart: chartString,
        width: 800,
        height: 400,
        backgroundColor: "white",
        format: "png",
        version: "2",
      }),
    });

    if (!res.ok) return null;

    const buffer = await res.arrayBuffer();
    return Buffer.from(buffer).toString("base64");
  } catch {
    return null;
  }
}

export async function sendDailySummary({ date, timestamp, allsurplus, govdeals }: EmailParams) {
  const to = process.env.NOTIFICATION_EMAIL;
  if (!to) return { success: false, error: "NOTIFICATION_EMAIL not set" };

  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const cutoff = oneYearAgo.toISOString().slice(0, 10);

  const { data: rows } = await supabase
    .from("listings")
    .select("*")
    .gte("date", cutoff)
    .order("date", { ascending: false })
    .order("timestamp", { ascending: false });

  const chartBase64 = await generateChartImage(rows ?? []);

  const attachments: { filename: string; content: string; content_type: string; contentId: string }[] = [];
  let chartHtml = "";
  if (chartBase64) {
    attachments.push({
      filename: "chart.png",
      content: chartBase64,
      content_type: "image/png",
      contentId: "chart_img",
    });
    chartHtml = `<img src="cid:chart_img" style="width:100%;max-width:800px;margin:16px 0;" alt="Listings Chart" />`;
  }

  const tableRows = (rows ?? [])
    .map(
      (r) =>
        `<tr>
          <td style="padding:3px 10px 3px 0;border-bottom:1px solid #eee;">${r.date}</td>
          <td style="padding:3px 10px 3px 0;border-bottom:1px solid #eee;text-align:right;">${fmtNum(r.allsurplus)}</td>
          <td style="padding:3px 0;border-bottom:1px solid #eee;text-align:right;">${fmtNum(r.govdeals)}</td>
        </tr>`,
    )
    .join("");

  const { error } = await getResend().emails.send({
    from: process.env.RESEND_FROM_EMAIL || "LQDT Tracker <notifications@resend.dev>",
    to: to.split(",").map((e) => e.trim()),
    subject: `LQDT Listings Snapshot — ${date}`,
    attachments,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:800px;">
        <h2 style="margin-bottom:4px;">LQDT Listings Snapshot</h2>
        <p style="color:#666;margin-top:0;">${date} ${timestamp} ET</p>
        <table style="margin-bottom:20px;">
          <tr>
            <td style="padding-right:24px;"><strong>AllSurplus:</strong> ${fmtNum(allsurplus)} active listings</td>
            <td><strong>GovDeals:</strong> ${fmtNum(govdeals)} active listings</td>
          </tr>
        </table>
        ${chartHtml}
        <h3 style="margin-top:24px;">1-Year History</h3>
        <table style="border-collapse:collapse;font-size:13px;">
          <tr style="border-bottom:2px solid #333;">
            <th style="padding:4px 10px 4px 0;text-align:left;">Date</th>
            <th style="padding:4px 10px 4px 0;text-align:right;">AllSurplus</th>
            <th style="padding:4px 0;text-align:right;">GovDeals</th>
          </tr>
          ${tableRows}
        </table>
      </div>
    `,
  });

  return error
    ? { success: false, error: error.message, chartIncluded: !!chartBase64 }
    : { success: true, chartIncluded: !!chartBase64 };
}
