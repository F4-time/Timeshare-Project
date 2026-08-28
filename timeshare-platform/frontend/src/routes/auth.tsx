import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Lock, Mail, UserRound } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import emblem from "@/assets/ft-emblem.png";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Forever Timeshare Member & Owner Portal" },
      {
        name: "description",
        content:
          "Sign in or create your Forever Timeshare account to manage memberships, ownership, holidays and bookings.",
      },
      { property: "og:title", content: "Sign in — Forever Timeshare" },
      {
        property: "og:description",
        content: "Access your Forever Timeshare member, owner or administrator portal.",
      },
    ],
  }),
  component: AuthPage,
});

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function AuthPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        if (data.session) navigate({ to: "/portal", replace: true });
        else setChecking(false);
      })
      .catch(() => active && setChecking(false));
    return () => {
      active = false;
    };
  }, [navigate]);

  async function signIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: String(form.get("email")),
        password: String(form.get("password")),
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      navigate({ to: "/portal", replace: true });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function signUp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: String(form.get("email")),
        password: String(form.get("password")),
        options: {
          emailRedirectTo: `${window.location.origin}/portal`,
          data: { full_name: String(form.get("full_name") ?? "") },
        },
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      // Projects with email confirmation disabled return a session immediately.
      if (data.session) {
        toast.success("Welcome to Forever Timeshare.");
        navigate({ to: "/portal", replace: true });
        return;
      }
      toast.success("Account created. Check your inbox to confirm your email.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(String(form.get("email")), {
        redirectTo: `${window.location.origin}/auth`,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Reset link sent if that email is registered.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <main className="gradient-hero">
      <div className="mx-auto flex max-w-md flex-col px-6 py-16">
        <div className="mb-8 text-center">
          <img
            src={emblem}
            alt="Forever Timeshare"
            className="mx-auto h-16 w-auto mix-blend-multiply"
          />
          <h1 className="mt-5 font-serif text-3xl">Your holiday portal</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Members, owners and staff sign in here.
          </p>
        </div>

        <div className="card-luxe rounded-xl p-6 shadow-luxe">
          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Register</TabsTrigger>
              <TabsTrigger value="reset">Reset</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form className="space-y-4 pt-4" onSubmit={signIn}>
                <Field icon={Mail} id="email" name="email" type="email" label="Email" />
                <Field icon={Lock} id="password" name="password" type="password" label="Password" />
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Sign in
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form className="space-y-4 pt-4" onSubmit={signUp}>
                <Field icon={UserRound} id="full_name" name="full_name" label="Full name" />
                <Field icon={Mail} id="su-email" name="email" type="email" label="Email" />
                <Field
                  icon={Lock}
                  id="su-password"
                  name="password"
                  type="password"
                  label="Password"
                />
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create account
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="reset">
              <form className="space-y-4 pt-4" onSubmit={resetPassword}>
                <Field icon={Mail} id="rs-email" name="email" type="email" label="Email" />
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Send reset link
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          By continuing you agree to our terms.{" "}
          <Link to="/contact" className="text-accent underline-offset-4 hover:underline">
            Need help?
          </Link>
        </p>
      </div>
    </main>
  );
}

function Field({
  icon: Icon,
  id,
  name,
  label,
  type = "text",
}: {
  icon: React.ComponentType<{ className?: string }>;
  id: string;
  name: string;
  label: string;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input id={id} name={name} type={type} required className="pl-9" autoComplete="on" />
      </div>
    </div>
  );
}
