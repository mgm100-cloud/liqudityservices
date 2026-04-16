import { supabase } from "@/lib/supabase";
import type { ListingRow } from "@/lib/supabase";
import { Dashboard } from "@/components/dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { data } = await supabase
    .from("listings")
    .select("*")
    .order("date", { ascending: false })
    .order("timestamp", { ascending: false });

  const listings: ListingRow[] = data ?? [];

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold mb-1">LQDT Listings Tracker</h1>
      <p className="text-gray-500 text-sm mb-8">
        Daily active listing counts for AllSurplus and GovDeals
      </p>
      <Dashboard listings={listings} />
    </main>
  );
}
