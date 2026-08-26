"use client";

import { useEffect, useState } from "react";
import {
  formatRange,
  minutesOf,
  nowMinutes,
  sessionState,
} from "@/lib/timetable";
import { CalendarDays } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";

export interface TodayEntry {
  id: string;
  course_code: string;
  course_title: string;
  teacher_name?: string | null;
  room: string;
  start_time: string;
  end_time: string;
}

const isBreak = (e: TodayEntry) =>
  e.course_code === "LUNCH" || e.course_code === "BREAK";

/**
 * Chronological schedule for today with NOW / NEXT / completed markers.
 * Uses a lightweight local clock tick (client-side only — no network
 * polling); the underlying entries are database-driven.
 */
export default function TodaySchedule({
  entries,
  classNameLabel,
}: {
  entries: TodayEntry[];
  classNameLabel: string;
}) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="No classes scheduled for today."
        description="Sessions will appear here based on the weekly timetable."
      />
    );
  }

  const curMin = now ? nowMinutes(now) : -1;

  // First not-yet-finished entry is "now" if live, otherwise "next".
  let nextIdx = -1;
  let liveIdx = -1;
  if (curMin >= 0) {
    liveIdx = entries.findIndex(
      (e) => sessionState(minutesOf(e.start_time), minutesOf(e.end_time), curMin) === "live",
    );
    nextIdx = entries.findIndex((e) => minutesOf(e.start_time) > curMin);
  }
  const dayOver =
    curMin >= 0 && liveIdx === -1 && nextIdx === -1 && !isBreak(entries[entries.length - 1])
      ? true
      : curMin >= 0 && liveIdx === -1 && nextIdx === -1;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium capitalize">{classNameLabel}</p>
        {dayOver && (
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            Today&apos;s classes completed
          </span>
        )}
        {liveIdx !== -1 && (
          <span className="rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-medium text-success">
            Class in progress
          </span>
        )}
      </div>
      {entries.map((e, i) => {
        const st =
          curMin < 0 ? "upcoming" : sessionState(minutesOf(e.start_time), minutesOf(e.end_time), curMin);
        const breakRow = isBreak(e);
        return (
          <div
            key={e.id}
            className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border bg-card p-3 shadow-card transition-colors ${
              i === liveIdx ? "border-success/50 ring-1 ring-success/25" : ""
            } ${st === "done" && !breakRow ? "opacity-60" : ""}`}
          >
            <span className="font-mono text-xs font-medium text-muted-foreground">
              {formatRange(e.start_time, e.end_time)}
            </span>
            <span className={`text-sm ${breakRow ? "text-muted-foreground italic" : "font-medium"}`}>
              {i === liveIdx && (
                <span aria-hidden className="mr-1.5 inline-flex size-2 translate-y-[-1px] animate-pulse rounded-full bg-success align-middle motion-reduce:animate-none" />
              )}
              {e.course_title}
            </span>
            {!breakRow && (
              <>
                <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-xs font-semibold text-primary">
                  {e.course_code}
                </span>
                {e.teacher_name && (
                  <span className="text-sm text-muted-foreground">{e.teacher_name}</span>
                )}
              </>
            )}
            {i === liveIdx && (
              <StatusBadge tone="success" className="ml-auto">
                <span className="inline-flex items-center gap-1 font-semibold">
                  <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-success motion-reduce:animate-none" />
                  NOW
                </span>
              </StatusBadge>
            )}
            {i === nextIdx && i !== liveIdx && (
              <StatusBadge tone="info" className="ml-auto">Next class</StatusBadge>
            )}
            {!breakRow && e.room && (
              <span className={`${i !== liveIdx && i !== nextIdx ? "ml-auto" : ""} text-xs text-muted-foreground`}>
                Room {e.room}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
