import { createFileRoute, Outlet } from "@tanstack/react-router";
import {
  FileText,
  KeyRound,
  LayoutDashboard,
  Repeat,
  Sparkles,
  Tag,
  TrendingUp,
  UserRound,
  Wallet,
} from "lucide-react";

import { PortalShell, type PortalNavItem } from "@/components/portal/PortalShell";
import { RoleGate } from "@/components/portal/RoleGate";
import { RouteError, RoutePending } from "@/components/RouteStates";

const NAV: PortalNavItem[] = [
  { to: "/owner/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { label: "My Ownership", icon: KeyRound },
  { label: "Use / Guest / Rent", icon: Sparkles },
  { label: "Rentals", icon: Tag },
  { label: "Exchange", icon: Repeat },
  { label: "Earnings", icon: TrendingUp },
  { label: "Payments & Fees", icon: Wallet },
  { label: "Documents", icon: FileText },
  { label: "Profile", icon: UserRound },
];

export const Route = createFileRoute("/_authenticated/owner")({
  errorComponent: RouteError,
  pendingComponent: () => <RoutePending label="Loading portal" />,
  component: OwnerLayout,
});

function OwnerLayout() {
  return (
    <RoleGate allow={["OWNER"]}>
      <PortalShell title="Owner Portal" nav={NAV}>
        <Outlet />
      </PortalShell>
    </RoleGate>
  );
}
