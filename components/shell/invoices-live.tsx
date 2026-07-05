"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { INVOICES_CHANNEL, INVOICES_CHANGED_EVENT } from "@/lib/realtime";

// Realtime invoice list (task 6.3, R-5): subscribe to the lightweight
// broadcast and refetch via router.refresh() — the server component
// re-queries through the caller's own RLS. Debounced so a burst of
// mutations causes one refetch.
export function InvoicesLive() {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(INVOICES_CHANNEL)
      .on("broadcast", { event: INVOICES_CHANGED_EVENT }, () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => router.refresh(), 400);
      })
      .subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
