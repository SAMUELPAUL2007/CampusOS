import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser‑side Supabase client.
 * This uses the public anon key and automatically manages cookies via
 * `document.cookie` – no extra configuration is required.
 */
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
);
