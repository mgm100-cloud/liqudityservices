import { NextResponse } from "next/server";
import { computeRevenueForecast } from "@/lib/auctions";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const takeRateParam = searchParams.get("takeRate");
  const takeRate = takeRateParam ? Number(takeRateParam) : 0.2;
  const forecast = await computeRevenueForecast(Number.isFinite(takeRate) ? takeRate : 0.2);
  return NextResponse.json(forecast);
}
