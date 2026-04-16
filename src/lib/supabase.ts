import { createClient } from "@supabase/supabase-js";

export type ListingRow = {
  id: number;
  date: string;
  timestamp: string;
  allsurplus: number;
  govdeals: number;
  created_at: string;
};

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
