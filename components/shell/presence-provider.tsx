"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { PRESENCE_CHANNEL } from "@/lib/realtime";

export type OnlinePerson = { userId: string; fullName: string; role: "admin" | "staff" };

type PresenceState = { fullName: string; role: "admin" | "staff" };

const PresenceContext = React.createContext<OnlinePerson[]>([]);

// The single owner of PRESENCE_CHANNEL — mounted once in the shell layout
// (every authenticated page), tracks the current user's presence, and
// republishes the live roster via context so any component (the dashboard's
// admin-only online-employees card) can read it with usePresence() instead
// of opening a second subscription to the same channel.
export function PresenceProvider({
  userId,
  fullName,
  role,
  children,
}: {
  userId: string;
  fullName: string;
  role: "admin" | "staff";
  children: React.ReactNode;
}) {
  const [people, setPeople] = React.useState<OnlinePerson[]>([]);

  React.useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(PRESENCE_CHANNEL, {
      config: { presence: { key: userId } },
    });

    const sync = () => {
      const state = channel.presenceState<PresenceState>();
      const list: OnlinePerson[] = Object.entries(state)
        .filter(([, presences]) => presences.length > 0)
        .map(([id, presences]) => ({
          userId: id,
          fullName: presences[0].fullName,
          role: presences[0].role,
        }));
      setPeople(list);
    };

    channel.on("presence", { event: "sync" }, sync).subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({ fullName, role } satisfies PresenceState);
      }
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, fullName, role]);

  return <PresenceContext.Provider value={people}>{children}</PresenceContext.Provider>;
}

export function usePresence(): OnlinePerson[] {
  return React.useContext(PresenceContext);
}
