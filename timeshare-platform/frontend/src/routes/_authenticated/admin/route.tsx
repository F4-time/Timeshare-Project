import { createFileRoute, Outlet } from "@tanstack/react-router";
import { BarChart3, Building2, KeyRound, LayoutDashboard, LifeBuoy, Users } from "lucide-react";

import { PortalShell, type PortalNavItem } from "@/components/portal/PortalShell";
import { RoleGate } from "@/components/portal/RoleGate";
import { RouteError, RoutePending } from "@/components/RouteStates";

const NAV: PortalNavItem[] = [
  { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/admin/members", label: "Members", icon: Users },
  { to: "/admin/resorts", label: "Resorts & Inventory", icon: Building2 },
  { to: "/admin/owners", label: "Owners", icon: KeyRound },
  { to: "/admin/support", label: "Support", icon: LifeBuoy },
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
