import { Resend } from "resend";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

type EmailParams = {
  date: string;
  timestamp: string;
  allsurplus: number | null;
  govdeals: number | null;
};

export async function sendDailySummary({ date, timestamp, allsurplus, govdeals }: EmailParams) {
  const to = process.env.NOTIFICATION_EMAIL;
  if (!to) return { success: false, error: "NOTIFICATION_EMAIL not set" };

  const formatCount = (n: number | null) =>
    n !== null ? n.toLocaleString("en-US") : "N/A (scrape failed)";

  const { error } = await getResend().emails.send({
    from: process.env.RESEND_FROM_EMAIL || "LQDT Tracker <notifications@resend.dev>",
    to: to.split(",").map((e) => e.trim()),
    subject: `LQDT Listings Snapshot — ${date}`,
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 480px;">
        <h2 style="margin-bottom: 4px;">LQDT Listings Snapshot</h2>
        <p style="color: #666; margin-top: 0;">${date} ${timestamp} ET</p>
        <table style="border-collapse: collapse; width: 100%;">
          <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 8px 0; font-weight: 600;">AllSurplus</td>
            <td style="padding: 8px 0; text-align: right;">${formatCount(allsurplus)} active listings</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: 600;">GovDeals</td>
            <td style="padding: 8px 0; text-align: right;">${formatCount(govdeals)} active listings</td>
          </tr>
        </table>
      </div>
    `,
  });

  return error ? { success: false, error: error.message } : { success: true };
}
