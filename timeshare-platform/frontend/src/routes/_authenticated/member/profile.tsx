import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, Loader2, Save, UserRound } from "lucide-react";
import { toast } from "sonner";

import { PortalPage } from "@/components/portal/PortalShell";
import { InfoRow } from "@/components/portal/PortalWidgets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAccount } from "@/hooks/useAccount";
import { initialsOf } from "@/lib/account-types";
import { updatePassword, updateProfile } from "@/lib/profile";

export const Route = createFileRoute("/_authenticated/member/profile")({
  head: () => ({ meta: [{ title: "My Profile — Forever Timeshare" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const { data: account, isLoading } = useAccount();
  const queryClient = useQueryClient();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (account?.profile) {
      setFullName(account.profile.full_name ?? "");
      setPhone(account.profile.phone ?? "");
    }
  }, [account?.profile]);

  const saveProfile = useMutation({
    mutationFn: () => updateProfile(account!.userId, { full_name: fullName, phone }),
    onSuccess: () => {
      toast.success("Profile updated");
      queryClient.invalidateQueries({ queryKey: ["account"] });
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const changePassword = useMutation({
    mutationFn: () => updatePassword(password),
    onSuccess: () => {
      toast.success("Password changed");
      setPassword("");
      setConfirmPassword("");
    },
    onError: (error) => toast.error((error as Error).message),
  });

  function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) {
      toast.error("Full name is required");
      return;
    }
    saveProfile.mutate();
  }

  function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    changePassword.mutate();
  }

  if (isLoading) {
    return (
      <PortalPage title="My profile">
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-accent" />
        </div>
      </PortalPage>
    );
  }

  return (
    <PortalPage title="My profile" description="Manage your personal details and account security.">
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-border bg-background p-6 lg:col-span-2">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {initialsOf(account)}
            </span>
            <div>
              <h2 className="font-serif text-lg">Personal details</h2>
              <p className="text-xs text-muted-foreground">Updates are saved to your Forever Timeshare account.</p>
            </div>
          </div>

          <form className="mt-6 space-y-4" onSubmit={handleSaveProfile}>
            <div className="space-y-1.5">
              <Label htmlFor="full_name">Full name</Label>
              <Input
                id="full_name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your full name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={account?.profile?.email ?? ""} disabled />
              <p className="text-xs text-muted-foreground">Contact support to change your sign-in email.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. +91 98765 43210"
              />
            </div>
            <Button type="submit" disabled={saveProfile.isPending} className="mt-2">
              {saveProfile.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save changes
            </Button>
          </form>
        </section>

        <aside className="rounded-xl border border-border bg-background p-6">
          <div className="flex items-center gap-2">
            <UserRound className="h-4 w-4 text-accent" />
            <h2 className="font-serif text-lg">Account</h2>
          </div>
          <dl className="mt-4 space-y-3 text-sm">
            <InfoRow label="Member code" value={account?.member?.member_code ?? "—"} />
            <InfoRow label="Status" value={account?.profile?.status ?? "—"} />
            <InfoRow label="Roles" value={account?.roles.join(", ") || "—"} />
          </dl>
        </aside>

        <section className="rounded-xl border border-border bg-background p-6 lg:col-span-2">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-accent" />
            <h2 className="font-serif text-lg">Change password</h2>
          </div>
          <form className="mt-6 max-w-sm space-y-4" onSubmit={handleChangePassword}>
            <div className="space-y-1.5">
              <Label htmlFor="new_password">New password</Label>
              <Input
                id="new_password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm_password">Confirm new password</Label>
              <Input
                id="confirm_password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
              />
            </div>
            <Button type="submit" disabled={changePassword.isPending} variant="outline">
              {changePassword.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update password
            </Button>
          </form>
        </section>
      </div>
    </PortalPage>
  );
}
