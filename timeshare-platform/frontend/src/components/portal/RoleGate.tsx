import { Link } from "@tanstack/react-router";
import { Loader2, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";

import { useAccount } from "@/hooks/useAccount";
import { hasRole, homePortal, type AppRole } from "@/lib/account-types";

export function RoleGate({ allow, children }: { allow: AppRole[]; children: ReactNode }) {
  const { data, isLoading, isError } = useAccount();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Denied
        title="We couldn't load your account"
        body="Please sign in again to continue."
        to="/auth"
        cta="Go to sign in"
      />
    );
  }

  if (!hasRole(data.roles, ...allow)) {
    return (
      <Denied
        title="You don't have access to this area"
        body="Your account doesn't hold the required role for this portal."
        to={homePortal(data.roles)}
        cta="Go to your portal"
      />
    );
  }

  return <>{children}</>;
}

function Denied({
  title,
  body,
  to,
  cta,
}: {
  title: string;
  body: string;
  to: "/auth" | "/member/dashboard" | "/owner/dashboard" | "/admin/dashboard";
  cta: string;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <ShieldAlert className="mx-auto h-8 w-8 text-accent" />
        <h1 className="mt-4 font-serif text-2xl">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
        <Link
          to={to}
          className="mt-6 inline-flex items-center justify-center rounded-full bg-accent px-5 py-2.5 text-xs font-semibold text-accent-foreground"
        >
          {cta}
        </Link>
      </div>
    </div>
  );
}
