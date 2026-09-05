import { useState } from "react";
import { AudioLines, Eye, EyeOff, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { unlockSpokenLine } from "@/lib/rimeflow/speakLine";
import { signInWithUsername } from "@/lib/rimeflow/account.functions";

export function AuthScreen() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    // Unlock browser audio while this function is still running
    // directly from the user's Login / Create Account action.
    unlockSpokenLine();

    if (password.length < 6) {
      setMessage("Password must be at least 6 characters.");
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      if (mode === "signup") {
        const cleanUsername = username
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9_]/g, "");

        if (cleanUsername.length < 3) {
          throw new Error(
            "Username must be at least 3 characters (letters, numbers or _).",
          );
        }

        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              display_name: name || cleanUsername,
              username: cleanUsername,
            },
          },
        });

        if (error) throw error;

        setMessage("Account created — signing you in.");
      } else {
        const value = identifier.trim();

        if (value.includes("@")) {
          const { error } = await supabase.auth.signInWithPassword({
            email: value,
            password,
          });

          if (error) throw error;
        } else {
          const result = await signInWithUsername({
            data: { identifier: value, password },
          });

          if (!result.ok) throw new Error(result.error);

          const { error } = await supabase.auth.setSession({
            access_token: result.accessToken,
            refresh_token: result.refreshToken,
          });

          if (error) throw error;
        }
      }
    } catch (caught) {
      setMessage((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };


  return (
    <div className="flex min-h-screen items-center justify-center bg-stage px-4">
      <div className="w-full max-w-md animate-fade-in rounded-3xl border border-border bg-card p-8 shadow-elegant">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-orb text-primary-foreground shadow-orb animate-orb-pulse">
            <AudioLines className="h-7 w-7" />
          </div>

          <h1 className="mt-4 text-2xl font-bold tracking-tight text-gradient-blue">
            RimeFlow
          </h1>

          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to talk with Remi, your real-time voice assistant.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {mode === "signup" && (
            <div className="space-y-2">
              <Label htmlFor="name">Your name</Label>

              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>

            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>

            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="pr-11"
              />

              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={
                  showPassword ? "Hide password" : "Show password"
                }
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground transition-colors hover:text-primary"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              Minimum 6 characters — letters, numbers or symbols.
            </p>
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={busy}
          >
            {busy && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}

            {mode === "signin"
              ? "Sign in"
              : "Create account"}
          </Button>
        </form>

        {message && (
          <p className="mt-4 text-center text-sm text-destructive">
            {message}
          </p>
        )}

        <button
          type="button"
          className="mt-5 w-full text-center text-sm text-primary hover:underline"
          onClick={() =>
            setMode(mode === "signin" ? "signup" : "signin")
          }
        >
          {mode === "signin"
            ? "New here? Create an account"
            : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}