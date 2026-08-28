import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

import { useAccount } from "@/hooks/useAccount";
import { homePortal } from "@/lib/account-types";

export const Route = createFileRoute("/_authenticated/portal")({
  component: PortalRedirect,
});

function PortalRedirect() {
  const navigate = useNavigate();
  const { data, isError } = useAccount();

  useEffect(() => {
    if (data) navigate({ to: homePortal(data.roles), replace: true });
    else if (isError) navigate({ to: "/auth", replace: true });
  }, [data, isError, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-accent" />
    </div>
  );
}
