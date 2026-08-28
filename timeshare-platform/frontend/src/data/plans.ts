export type MembershipBenefit = {
  label: string;
  detail: string;
};

export type MembershipPlan = {
  code: string;
  name: string;
  tier: string;
  entitlementKind: "NIGHTS" | "POINTS";
  nightsPerYear: number | null;
  pointsPerYear: number | null;
  bookingWindowDays: number;
  termYears: number | null;
  price: number;
  maintenanceBaseFee: number;
  benefits: MembershipBenefit[];
};

/** Mirrors the seeded membership_plans catalogue until the plans API lands. */
export const MEMBERSHIP_PLANS: MembershipPlan[] = [
  {
    code: "SILVER",
    name: "Silver Escape",
    tier: "Silver",
    entitlementKind: "NIGHTS",
    nightsPerYear: 7,
    pointsPerYear: null,
    bookingWindowDays: 180,
    termYears: 10,
    price: 295000,
    maintenanceBaseFee: 18000,
    benefits: [
      {
        label: "7 nights every year",
        detail: "Studio and one-bedroom units across our domestic estates",
      },
      { label: "6-month booking window", detail: "Reserve up to 180 days ahead of your stay" },
      { label: "Family of four included", detail: "Two adults and two children on every stay" },
    ],
  },
  {
    code: "GOLD",
    name: "Gold Retreat",
    tier: "Gold",
    entitlementKind: "NIGHTS",
    nightsPerYear: 14,
    pointsPerYear: null,
    bookingWindowDays: 270,
    termYears: 15,
    price: 545000,
    maintenanceBaseFee: 26000,
    benefits: [
      {
        label: "14 nights every year",
        detail: "One and two-bedroom suites, domestic plus select international",
      },
      { label: "9-month booking window", detail: "Reserve up to 270 days ahead for peak season" },
      { label: "Split your stays", detail: "Use your nights across multiple trips each year" },
    ],
  },
  {
    code: "PLATINUM",
    name: "Platinum Points",
    tier: "Platinum",
    entitlementKind: "POINTS",
    nightsPerYear: null,
    pointsPerYear: 30000,
    bookingWindowDays: 365,
    termYears: 25,
    price: 895000,
    maintenanceBaseFee: 38000,
    benefits: [
      {
        label: "30,000 points a year",
        detail: "Spend across seasons, room types and destinations",
      },
      { label: "12-month booking window", detail: "First access to festive and peak inventory" },
      { label: "Exchange and rental access", detail: "Deposit unused points or list your week" },
    ],
  },
  {
    code: "SIGNATURE",
    name: "Signature Residence",
    tier: "Signature",
    entitlementKind: "POINTS",
    nightsPerYear: null,
    pointsPerYear: 60000,
    bookingWindowDays: 365,
    termYears: null,
    price: 1750000,
    maintenanceBaseFee: 62000,
    benefits: [
      { label: "60,000 points a year", detail: "Residence-grade inventory and private villas" },
      { label: "Perpetual membership", detail: "No fixed term — pass it on to your family" },
      { label: "Dedicated concierge", detail: "Personal holiday planner and in-resort host" },
    ],
  },
];

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function money(amount: number) {
  return INR.format(amount);
}

export function entitlementLabel(plan: MembershipPlan) {
  return plan.entitlementKind === "POINTS"
    ? `${(plan.pointsPerYear ?? 0).toLocaleString("en-IN")} points`
    : `${plan.nightsPerYear ?? 0} nights`;
}
