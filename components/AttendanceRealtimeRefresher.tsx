"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

/**
 * Subscribes to attendance_records changes scoped to one student and
 * refreshes the server-rendered page when their records change (e.g. a
 * teacher just saved). Realtime push only — no polling, no intervals.
 */
export default function AttendanceRealtimeRefresher({ studentId }: { studentId: string }) {
  const router = useRouter();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    const channel = supabase
      .channel(`attendance-${studentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "attendance_records",
          filter: `student_id=eq.${studentId}`,
        },
        () => router.refresh(),
      )
      .subscribe();

    channelRef.current = channel;
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [studentId, router]);

  return null;
}
