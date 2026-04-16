import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { scrapeListings } from "@/lib/scraper";
import { sendDailySummary } from "@/lib/email";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/New_York" }),
  );
  const date = now.toISOString().slice(0, 10);
  const timestamp = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const { allsurplus, govdeals } = await scrapeListings();

  const { error: dbError } = await supabase
    .from("listings")
    .insert({ date, timestamp, allsurplus, govdeals });

  let emailResult: { success: boolean; error?: string; chartIncluded?: boolean; chartDebug?: string } = { success: false, error: "skipped" };
  if (process.env.RESEND_API_KEY) {
    emailResult = await sendDailySummary({ date, timestamp, allsurplus, govdeals });
  }

  const summary = {
    date,
    timestamp,
    allsurplus,
    govdeals,
    db: dbError ? { error: dbError.message } : { success: true },
    email: emailResult,
  };

  return NextResponse.json(summary);
}
