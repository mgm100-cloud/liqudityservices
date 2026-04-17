import { createClient } from "@supabase/supabase-js";

export type ListingRow = {
  id: number;
  date: string;
  timestamp: string;
  allsurplus: number;
  govdeals: number;
  created_at: string;
};

export type MarketplaceMetricsRow = {
  id: number;
  date: string;
  timestamp: string;
  platform: "AD" | "GD";
  total_listings: number | null;
  total_bids: number | null;
  avg_bids_per_listing: number | null;
  total_current_price: number | null;
  listings_with_bids: number | null;
  bid_rate: number | null;
  unique_seller_count: number | null;
  listings_closing_24h: number | null;
  avg_watch_count: number | null;
  top_categories: Record<string, number> | null;
  sample_size: number | null;
  created_at: string;
};

export type FederalContractRow = {
  id: number;
  award_id: string;
  recipient_name: string;
  award_amount: number | null;
  total_obligation: number | null;
  awarding_agency: string | null;
  funding_agency: string | null;
  award_type: string | null;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
  place_of_performance_state: string | null;
  naics_code: string | null;
  first_seen_date: string;
  created_at: string;
};

export type ContractSnapshotRow = {
  id: number;
  date: string;
  total_active_contracts: number | null;
  total_obligated_amount: number | null;
  new_contracts_last_30d: number | null;
  new_obligation_last_30d: number | null;
  top_agencies: { name: string; amount: number; count: number }[] | null;
  created_at: string;
};

export type MarketplaceSellerRow = {
  id: number;
  date: string;
  platform: "AD" | "GD";
  account_id: string;
  company_name: string;
  country: string | null;
  state: string | null;
  listing_count: number | null;
  total_current_bid: number | null;
  total_bids: number | null;
  top_bid_asset_id: string | null;
  sub_business_id: string | null;
  created_at: string;
};

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
