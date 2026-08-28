import { createFileRoute, Outlet } from "@tanstack/react-router";
import {
  BadgeCheck,
  BarChart3,
  Building2,
  CalendarDays,
  CalendarRange,
  FileSignature,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  ScrollText,
  Settings,
  ShieldCheck,
  UserCog,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";

import { PortalShell, type PortalNavItem } from "@/components/portal/PortalShell";
import { RoleGate } from "@/components/portal/RoleGate";
import { RouteError, RoutePending } from "@/components/RouteStates";

const NAV: PortalNavItem[] = [
  { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { label: "Members", icon: Users },
  { label: "Owners", icon: KeyRound },
  { label: "Membership Plans", icon: BadgeCheck },
  { label: "Contracts", icon: FileSignature },
  { label: "Resorts & Inventory", icon: Building2 },
  { label: "Availability Calendar", icon: CalendarRange },
  { label: "Bookings", icon: CalendarDays },
  { label: "Maintenance Fees", icon: Wrench },
  { label: "Payments & Refunds", icon: Wallet },
  { label: "Support Tickets", icon: LifeBuoy },
  { label: "Reports", icon: BarChart3 },
  { label: "Staff", icon: UserCog },
  { label: "Roles & Permissions", icon: ShieldCheck },
  { label: "Audit Log", icon: ScrollText },
  { label: "Settings", icon: Settings },
];

export const Route = createFileRoute("/_authenticated/admin")({
  errorComponent: RouteError,
  pendingComponent: () => <RoutePending label="Loading portal" />,
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <RoleGate allow={["RESORT_STAFF", "ADMIN_STAFF", "SUPER_ADMIN"]}>
      <PortalShell title="Administration" nav={NAV}>
        <Outlet />
      </PortalShell>
    </RoleGate>
  );
}
