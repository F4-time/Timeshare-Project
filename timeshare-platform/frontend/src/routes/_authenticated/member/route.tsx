import { createFileRoute, Outlet } from "@tanstack/react-router";
import {
  CalendarDays,
  FileText,
  LayoutDashboard,
  LifeBuoy,
  Palmtree,
  BadgeCheck,
  UserRound,
  Wallet,
} from "lucide-react";

import { PortalShell, type PortalNavItem } from "@/components/portal/PortalShell";
import { RoleGate } from "@/components/portal/RoleGate";
import { RouteError, RoutePending } from "@/components/RouteStates";

const NAV: PortalNavItem[] = [
  { to: "/member/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { label: "My Membership", icon: BadgeCheck },
  { label: "Book a Holiday", icon: Palmtree },
  { label: "My Bookings", icon: CalendarDays },
  { label: "Payments & Fees", icon: Wallet },
  { label: "Documents", icon: FileText },
  { label: "Profile", icon: UserRound },
  { label: "Support", icon: LifeBuoy },
];

export const Route = createFileRoute("/_authenticated/member")({
  errorComponent: RouteError,
  pendingComponent: () => <RoutePending label="Loading portal" />,
  component: MemberLayout,
});

function MemberLayout() {
  return (
    <RoleGate allow={["MEMBER"]}>
      <PortalShell title="Member Portal" nav={NAV}>
        <Outlet />
      </PortalShell>
    </RoleGate>
  );
}
