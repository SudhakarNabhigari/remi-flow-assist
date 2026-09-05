import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Username-based sign-in.
 *
 * The username -> email lookup happens with the service-role client so that
 * anonymous callers can never enumerate user emails. The password is verified
 * by Supabase Auth itself; we only return the resulting session tokens.
 */

const signInInput = z.object({
  identifier: z.string().min(1).max(200),
  password: z.string().min(6).max(200),
});

export const signInWithUsername = createServerFn({ method: "POST" })
  .validator((data: unknown) => signInInput.parse(data))
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    const username = data.identifier.trim().toLowerCase();

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("username", username)
      .maybeSingle();

    if (!profile?.id) {
      return { ok: false as const, error: "Invalid login credentials" };
    }

    const { data: userRow, error: userError } =
      await supabaseAdmin.auth.admin.getUserById(profile.id);

    const email = userRow?.user?.email;

    if (userError || !email) {
      return { ok: false as const, error: "Invalid login credentials" };
    }

    const url = process.env["SUPABASE_URL"]!;
    const publishable = process.env["SUPABASE_PUBLISHABLE_KEY"]!;

    const authClient = createClient(url, publishable, {
      auth: {
        storage: undefined,
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        fetch: (input, init) => {
          const headers = new Headers(init?.headers);
          if (
            publishable.startsWith("sb_") &&
            headers.get("Authorization") === `Bearer ${publishable}`
          ) {
            headers.delete("Authorization");
          }
          headers.set("apikey", publishable);
          return fetch(input, { ...init, headers });
        },
      },
    });

    const { data: signIn, error } = await authClient.auth.signInWithPassword({
      email,
      password: data.password,
    });

    if (error || !signIn.session) {
      return {
        ok: false as const,
        error: error?.message ?? "Invalid login credentials",
      };
    }

    return {
      ok: true as const,
      accessToken: signIn.session.access_token,
      refreshToken: signIn.session.refresh_token,
    };
  });

const availabilityInput = z.object({
  username: z.string().min(3).max(30),
});

export const isUsernameAvailable = createServerFn({ method: "POST" })
  .validator((data: unknown) => availabilityInput.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    const { data: row } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("username", data.username.trim().toLowerCase())
      .maybeSingle();

    return { available: !row };
  });
