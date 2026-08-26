"use client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    // Clear any existing session first so switching accounts never
    // leaves a stale identity behind.
    await supabase.auth.signOut();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    // Retrieve the user's profile to determine role
    const profileRes = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user?.id)
      .single();
    if (profileRes.error) {
      setError(profileRes.error.message);
      setLoading(false);
      return;
    }
    const role = profileRes.data?.role as string;
    // Redirect based on role
    switch (role) {
      case "admin":
        router.replace("/admin");
        break;
      case "teacher":
        router.replace("/teacher");
        break;
      case "student":
        router.replace("/student");
        break;
      default:
        router.replace("/dashboard");
    }
    setLoading(false);
  };

  return (
    <div className={cn("flex min-h-screen items-center justify-center p-4")}>
      <form onSubmit={handleLogin} className={cn("w-full max-w-sm space-y-4")}>
        <h2 className="text-center text-2xl font-semibold">Login</h2>
        {error && <p className="text-sm text-destructive text-center">{error}</p>}
        <div className="space-y-1.5">
          <label htmlFor="login-email" className="text-sm font-medium">
            Email
          </label>
          <Input
            id="login-email"
            type="email"
            placeholder="you@school.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="login-password" className="text-sm font-medium">
            Password
          </label>
          <Input
            id="login-password"
            type="password"
            placeholder="Your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <Button
          type="submit"
          className="w-full"
          disabled={loading}
        >
          {loading && (
            <span
              aria-hidden
              className="size-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground"
            />
          )}
          {loading ? "Logging in…" : "Login"}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Contact your administrator to create an account.
        </p>
      </form>
    </div>
  );
}
