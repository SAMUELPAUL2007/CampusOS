"use client";

import { useMemo, useState } from "react";
import { formatRange } from "@/lib/timetable";
import { CalendarCheck, CalendarX, SearchX } from "lucide-react";
import { StatCard } from "@/components/shared/stat-card";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";

export interface StudentRecord {
  id: string;
  status: string;
  session_date: string;
  course_code: string;
  course_title: string;
  start_time: string;
  end_time: string;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function prettyDate(d: string): string {
  const dt = new Date(d + "T00:00:00");
  return `${DAY_NAMES[dt.getDay()]} — ${dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}`;
}

export default function StudentAttendanceView({ records }: { records: StudentRecord[] }) {
  const [subject, setSubject] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("");
  const [expandedSubject, setExpandedSubject] = useState<string | null>(null);

  // ---- Overall + per-subject stats (computed from actual conducted sessions) ----
  const { total, present, pct, subjects } = useMemo(() => {
    const p = records.filter((r) => r.status === "present").length;
    const map = new Map<string, { title: string; present: number; total: number; history: StudentRecord[] }>();
    for (const r of records) {
      const s = map.get(r.course_code) ?? {
        title: r.course_title,
        present: 0,
        total: 0,
        history: [] as StudentRecord[],
      };
      s.total += 1;
      if (r.status === "present") s.present += 1;
      s.history.push(r);
      map.set(r.course_code, s);
    }
    return {
      total: records.length,
      present: p,
      pct: records.length > 0 ? Math.round((p / records.length) * 100) : null,
      subjects: [...map.entries()],
    };
  }, [records]);

  // ---- Daily history grouped by date desc ----
  const filtered = useMemo(
    () =>
      records.filter(
        (r) =>
          (subject === "all" || r.course_code === subject) &&
          (status === "all" || r.status === status) &&
          (!dateFilter || r.session_date === dateFilter),
      ),
    [records, subject, status, dateFilter],
  );
  const byDate = useMemo(() => {
    const m = new Map<string, StudentRecord[]>();
    for (const r of filtered) {
      (m.get(r.session_date) ?? m.set(r.session_date, []).get(r.session_date)!).push(r);
    }
    for (const list of m.values()) list.sort((a, b) => a.start_time.localeCompare(b.start_time));
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  if (records.length === 0) {
    return (
      <EmptyState
        icon={CalendarCheck}
        title="No attendance recorded yet."
        description="Attendance records will appear here once they are recorded."
      />
    );
  }

  return (
    <div className="space-y-8">
      {/* Overall */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold tracking-tight">Overall Attendance</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Present" value={String(present)} tone="success" icon={CalendarCheck} />
          <StatCard label="Absent" value={String(total - present)} tone="destructive" icon={CalendarX} />
          <StatCard label="Total Sessions" value={String(total)} icon={CalendarCheck} />
          <StatCard
            label="Attendance"
            value={pct !== null ? `${pct}%` : "—"}
            tone={pct !== null && pct < 75 ? "destructive" : "success"}
            icon={CalendarCheck}
          />
        </div>
      </section>

      {/* Subject-wise */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold tracking-tight">Subject Attendance</h2>
        <DataTable>
          <thead>
            <tr>
              <th scope="col">Subject</th>
              <th scope="col" className="text-center">Present / Conducted</th>
              <th scope="col" className="text-center">Attendance</th>
              <th scope="col" className="text-right">History</th>
            </tr>
          </thead>
          <tbody>
            {subjects.map(([code, s]) => (
              <tr key={code}>
                <td>
                  <span className="mr-2 rounded bg-primary/10 px-1.5 py-0.5 font-mono text-xs font-semibold text-primary">
                    {code}
                  </span>
                  {s.title}
                </td>
                <td className="text-center tabular-nums">
                  {s.present} / {s.total}
                </td>
                <td className="text-center">
                  <StatusBadge
                    tone={s.present / s.total < 0.75 ? "destructive" : "success"}
                  >
                    {Math.round((s.present / s.total) * 100)}%
                  </StatusBadge>
                </td>
                <td className="text-right">
                  <button
                    type="button"
                    onClick={() => setExpandedSubject(expandedSubject === code ? null : code)}
                    className="min-h-11 rounded-md border px-4 text-sm font-medium transition-colors hover:bg-accent"
                  >
                    {expandedSubject === code ? "Hide" : "View"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>

        {/* Expanded subject history */}
        {subjects
          .filter(([code]) => code === expandedSubject)
          .map(([code, s]) => (
            <div key={code} className="rounded-xl border bg-card p-4 shadow-card">
              <h3 className="mb-2 text-sm font-semibold">
                {s.title} ({code}) — {s.present}/{s.total},{" "}
                {Math.round((s.present / s.total) * 100)}%
              </h3>
              <ul className="divide-y">
                {[...s.history]
                  .sort((a, b) => b.session_date.localeCompare(a.session_date))
                  .map((r) => (
                    <li key={r.id} className="flex items-center justify-between py-1.5 text-sm">
                      <span className="text-muted-foreground">{prettyDate(r.session_date)}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {formatRange(r.start_time, r.end_time)}
                      </span>
                      <StatusBadge status={r.status === "present" ? "present" : "absent"} />
                    </li>
                  ))}
              </ul>
            </div>
          ))}
      </section>

      {/* History with filters */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold tracking-tight">Attendance History</h2>
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Filter by subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="all">All subjects</option>
            {subjects.map(([code, s]) => (
              <option key={code} value={code}>
                {s.title}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="all">All statuses</option>
            <option value="present">Present only</option>
            <option value="absent">Absent only</option>
          </select>
          <input
            type="date"
            aria-label="Filter by date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          />
          {(subject !== "all" || status !== "all" || dateFilter) && (
            <button
              type="button"
              onClick={() => {
                setSubject("all");
                setStatus("all");
                setDateFilter("");
              }}
              className="h-9 rounded-md border px-3 text-sm transition-colors hover:bg-accent"
            >
              Clear filters
            </button>
          )}
        </div>

        {byDate.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="No records match the selected filters."
            description="Try adjusting or clearing your filters."
          />
        ) : (
          <div className="space-y-3">
            {byDate.map(([date, items]) => (
              <details key={date} className="rounded-xl border bg-card p-4 shadow-sm" open>
                <summary className="cursor-pointer text-sm font-semibold">{prettyDate(date)}</summary>
                <ul className="mt-2 divide-y">
                  {items.map((r) => (
                    <li key={r.id} className="flex items-center justify-between py-1.5 text-sm">
                      <span className="font-mono text-xs text-muted-foreground">
                        {formatRange(r.start_time, r.end_time)}
                      </span>
                      <span className="mx-4 flex-1 truncate">
                        <span className="mr-1.5 rounded bg-primary/10 px-1.5 py-0.5 font-mono text-xs font-semibold text-primary">
                          {r.course_code}
                        </span>
                        {r.course_title}
                      </span>
                      <span className={r.status === "present" ? "font-medium text-success" : "font-medium text-destructive"}>
                        {r.status === "present" ? "Present" : "Absent"}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
