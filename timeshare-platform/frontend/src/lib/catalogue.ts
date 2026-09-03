import { supabase } from "@/integrations/supabase/client";

export type Resort = {
  id: string;
  slug: string | null;
  name: string;
  description: string | null;
  location: string | null;
  country: string | null;
  image_url: string | null;
  amenities: { items?: string[] } | null;
};

export type PlanBenefit = { label: string; detail?: string };

export type PlanBenefits = {
  tier?: string;
  code?: string;
  cadence?: string;
  tagline?: string;
  stay_length?: string;
  credits?: string;
  credit_carry_forward?: string;
  guests?: string;
  cancellation?: string;
  best_for?: string;
  booking_window_days?: number;
  perpetual?: boolean;
  items?: PlanBenefit[];
};

export type MembershipPlan = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  duration_years: number;
  annual_points: number | null;
  annual_nights: number | null;
  maintenance_fee: number | null;
  benefits: PlanBenefits | null;
};

export async function listResorts(): Promise<Resort[]> {
  const { data, error } = await supabase
    .from("resorts")
    .select("id, slug, name, description, location, country, image_url, amenities")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as Resort[];
}

export async function listMembershipPlans(): Promise<MembershipPlan[]> {
  const { data, error } = await supabase
    .from("membership_plans")
    .select(
      "id, name, description, price, currency, duration_years, annual_points, annual_nights, maintenance_fee, benefits",
    )
    .eq("active", true)
    .order("price");
  if (error) throw new Error(error.message);

  return (data ?? []).map((p) => ({
    ...p,
    price: Number(p.price),
    maintenance_fee: p.maintenance_fee === null ? null : Number(p.maintenance_fee),
    annual_points: p.annual_points === null ? null : Number(p.annual_points),
    annual_nights: p.annual_nights === null ? null : Number(p.annual_nights),
  })) as MembershipPlan[];
}

export function money(amount: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function entitlementLabel(plan: MembershipPlan) {
  if (plan.annual_points) return `${plan.annual_points.toLocaleString("en-IN")} points`;
  if (plan.annual_nights) return `${plan.annual_nights} nights`;
  return "—";
}
