import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Shown when a signed-out visitor tries to book or enroll — sends them to /auth instead of failing silently. */
export function AuthPromptDialog({
  open,
  onOpenChange,
  message = "You need a Forever Timeshare account to continue. Register or sign in, then come back to finish.",
  redirectTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message?: string;
  /** Path to send the visitor back to once signed in (e.g. the resort page they were booking). Defaults to the portal. */
  redirectTo?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Please register to continue</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{message}</p>
        <DialogFooter>
          <Button asChild className="w-full">
            <Link
              to="/auth"
              search={redirectTo ? { redirect: redirectTo } : undefined}
              onClick={() => onOpenChange(false)}
            >
              Register / Sign in
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
