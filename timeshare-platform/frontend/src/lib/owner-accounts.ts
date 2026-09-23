import { apiGet, apiPost } from "@/lib/api";

export type CreatedOwner = {
  name: string;
  email: string;
  password: string;
  ownerCode: string;
};

export type OwnerOverview = {
  resorts: { id: string; name: string; location: string | null; country: string | null }[];
  totalRooms: number;
  bookedRooms: number;
  availableRooms: number;
  roomTypes: { name: string; total: number; booked: number; available: number }[];
  bookings: { id: string; reference: string; check_in: string; check_out: string; status: string }[];
};

export function createOwner(input: { name: string; email: string }) {
  return apiPost<CreatedOwner>("/api/account/owners", input);
}

export type AdminOwner = {
  id: string;
  ownerCode: string;
  status: string;
  name: string;
  email: string;
  resorts: { id: string; name: string }[];
};

export function listOwners() {
  return apiGet<AdminOwner[]>("/api/account/owners");
}

export function fetchOwnerOverview() {
  return apiGet<OwnerOverview>("/api/account/owner-overview");
}