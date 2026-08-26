"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FileCheck2, FileText, GraduationCap, Percent, SearchX } from "lucide-react";
import { StatCard } from "@/components/shared/stat-card";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";

interface ExamRecord {
  id: string;
  class_id: string;
  class_name: string;
  name: string;
  description: string | null;
  exam_date: string;
  created_at: string;
}

interface MarkRecord {
  id: string;
  exam_id: string;
  marks_obtained: number;
  max_marks: number;
}

interface ExamWithMark extends ExamRecord {
  marks_obtained: number | null;
  max_marks: number | null;
  percentage: number | null;
}

interface ClassSummary {
  class_id: string;
  class_name: string;
  total_exams: number;
  marked_exams: number;
  total_obtained: number;
  total_max: number;
  percentage: number | null;
}

function roundPct(obtained: number, max: number): number {
  if (max === 0) return 0;
  return Math.round((obtained / max) * 1000) / 10;
}

export default function StudentExams({
  exams,
  marks,
}: {
  exams: ExamRecord[];
  marks: MarkRecord[];
}) {
  const [filterClass, setFilterClass] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");

  // Marks are held in state so Realtime updates can refresh them without
  // a manual browser refresh. Seeded from the server-rendered props;
  // the database stays the single source of truth.
  const [liveMarks, setLiveMarks] = useState<MarkRecord[]>(marks);

  const fetchMarks = async () => {
    // RLS guarantees a student only ever reads their own marks.
    const { data, error } = await supabase
      .from("marks")
      .select("id, exam_id, marks_obtained, max_marks");
    if (!error && data) {
      setLiveMarks(data as MarkRecord[]);
    }
  };

  useEffect(() => {
    setLiveMarks(marks);
  }, [marks]);

  // Realtime: refetch own marks whenever any marks change lands. RLS on
  // realtime delivery ensures only this student's rows are received.
  useEffect(() => {
    const channel = supabase
      .channel("marks-realtime-student")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "marks" },
        () => {
          void fetchMarks();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build a map from exam_id to mark (RLS guarantees at most one per student).
  const markMap = useMemo(() => {
    const map = new Map<string, MarkRecord>();
    liveMarks.forEach((m) => map.set(m.exam_id, m));
    return map;
  }, [liveMarks]);

  // Merge exams with their marks.
  const examsWithMarks = useMemo<ExamWithMark[]>(() => {
    return exams.map((e) => {
      const mark = markMap.get(e.id);
      if (mark) {
        return {
          ...e,
          marks_obtained: mark.marks_obtained,
          max_marks: mark.max_marks,
          percentage: roundPct(mark.marks_obtained, mark.max_marks),
        };
      }
      return {
        ...e,
        marks_obtained: null,
        max_marks: null,
        percentage: null,
      };
    });
  }, [exams, markMap]);

  // Distinct classes for filter dropdown.
  const classes = useMemo(() => {
    const map = new Map<string, string>();
    exams.forEach((e) => map.set(e.class_id, e.class_name));
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [exams]);

  // Filtered exams.
  const filtered = useMemo(() => {
    return examsWithMarks.filter((e) => {
      if (filterClass !== "all" && e.class_id !== filterClass) return false;
      if (filterStatus === "marked" && e.marks_obtained === null) return false;
      if (filterStatus === "unmarked" && e.marks_obtained !== null) return false;
      if (filterDateFrom && e.exam_date < filterDateFrom) return false;
      if (filterDateTo && e.exam_date > filterDateTo) return false;
      return true;
    });
  }, [examsWithMarks, filterClass, filterStatus, filterDateFrom, filterDateTo]);

  // Sorted: exam_date desc, then name asc.
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const dateCmp = b.exam_date.localeCompare(a.exam_date);
      if (dateCmp !== 0) return dateCmp;
      return a.name.localeCompare(b.name);
    });
  }, [filtered]);

  // Overall summary (only exams with marks).
  const overall = useMemo(() => {
    const marked = examsWithMarks.filter((e) => e.marks_obtained !== null);
    const totalExams = examsWithMarks.length;
    const markedCount = marked.length;
    const totalObtained = marked.reduce((sum, e) => sum + (e.marks_obtained ?? 0), 0);
    const totalMax = marked.reduce((sum, e) => sum + (e.max_marks ?? 0), 0);
    const percentage = markedCount > 0 ? roundPct(totalObtained, totalMax) : null;
    return { totalExams, markedCount, totalObtained, totalMax, percentage };
  }, [examsWithMarks]);

  // Class-wise summary (only exams with marks).
  const classSummaries = useMemo<ClassSummary[]>(() => {
    const map = new Map<
      string,
      {
        class_name: string;
        total_exams: number;
        marked_exams: number;
        total_obtained: number;
        total_max: number;
      }
    >();
    examsWithMarks.forEach((e) => {
      const existing = map.get(e.class_id) ?? {
        class_name: e.class_name,
        total_exams: 0,
        marked_exams: 0,
        total_obtained: 0,
        total_max: 0,
      };
      existing.total_exams += 1;
      if (e.marks_obtained !== null && e.max_marks !== null) {
        existing.marked_exams += 1;
        existing.total_obtained += e.marks_obtained;
        existing.total_max += e.max_marks;
      }
      map.set(e.class_id, existing);
    });
    const summaries: ClassSummary[] = [...map.entries()].map(([id, s]) => ({
      class_id: id,
      class_name: s.class_name,
      total_exams: s.total_exams,
      marked_exams: s.marked_exams,
      total_obtained: s.total_obtained,
      total_max: s.total_max,
      percentage:
        s.marked_exams > 0 ? roundPct(s.total_obtained, s.total_max) : null,
    }));
    summaries.sort((a, b) => a.class_name.localeCompare(b.class_name));
    return summaries;
  }, [examsWithMarks]);

  const hasFilters =
    filterClass !== "all" ||
    filterStatus !== "all" ||
    filterDateFrom !== "" ||
    filterDateTo !== "";

  const clearFilters = () => {
    setFilterClass("all");
    setFilterStatus("all");
    setFilterDateFrom("");
    setFilterDateTo("");
  };

  return (
    <div className="w-full max-w-4xl space-y-6">
      {/* Summary cards */}
      <div className="space-y-3 rounded-xl border bg-card p-4 shadow-card md:p-5">
        <h2 className="text-base font-semibold">Overall Summary</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Total Exams" value={String(overall.totalExams)} icon={FileText} />
          <StatCard label="Exams with Marks" value={String(overall.markedCount)} icon={FileCheck2} />
          <StatCard label="Total Obtained" value={String(overall.totalObtained)} icon={GraduationCap} />
          <StatCard label="Total Maximum" value={String(overall.totalMax)} icon={GraduationCap} />
          <StatCard
            label="Overall Percentage"
            value={overall.percentage !== null ? `${overall.percentage}%` : "N/A"}
            icon={Percent}
          />
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-3 rounded-xl border bg-card p-4 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Filters</h2>
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-sm text-primary hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="space-y-1">
            <label
              htmlFor="filter-class"
              className="block text-sm font-medium text-foreground"
            >
              Class
            </label>
            <select
              id="filter-class"
              className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={filterClass}
              onChange={(e) => setFilterClass(e.target.value)}
            >
              <option value="all">All Classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label
              htmlFor="filter-status"
              className="block text-sm font-medium text-foreground"
            >
              Status
            </label>
            <select
              id="filter-status"
              className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">All</option>
              <option value="marked">Marks Available</option>
              <option value="unmarked">Not Marked Yet</option>
            </select>
          </div>
          <div className="space-y-1">
            <label
              htmlFor="filter-date-from"
              className="block text-sm font-medium text-foreground"
            >
              From Date
            </label>
            <input
              id="filter-date-from"
              type="date"
              className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label
              htmlFor="filter-date-to"
              className="block text-sm font-medium text-foreground"
            >
              To Date
            </label>
            <input
              id="filter-date-to"
              type="date"
              className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Class-wise summary */}
      {classSummaries.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Class-wise Summary</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {classSummaries.map((cs) => (
              <div key={cs.class_id} className="rounded-md border p-4 space-y-1">
                <h3 className="font-medium">{cs.class_name}</h3>
                <div className="text-sm text-muted-foreground space-y-0.5">
                  <p>
                    Exams: {cs.total_exams} &middot; Marked: {cs.marked_exams}
                  </p>
                  {cs.marked_exams > 0 && (
                    <p>
                      Obtained: {cs.total_obtained} / {cs.total_max}
                    </p>
                  )}
                  <p className="font-medium">
                    Percentage:{" "}
                    {cs.percentage !== null ? `${cs.percentage}%` : "N/A"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Exam list */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">
          Exams
          {hasFilters && (
            <span className="text-sm font-normal text-muted-foreground">
              {" "}({sorted.length} of {exams.length})
            </span>
          )}
        </h2>

        {exams.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No exams found."
            description="Scheduled exams for your classes will be listed here."
          />
        ) : sorted.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="No exams match the selected filters."
            description="Try adjusting or clearing your filters."
          />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th scope="col">Exam</th>
                <th scope="col">Class</th>
                <th scope="col">Date</th>
                <th scope="col" className="text-center">Marks</th>
                <th scope="col" className="text-center">%</th>
                <th scope="col" className="text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((exam) => (
                <tr key={exam.id}>
                  <td>
                    <div className="font-medium">{exam.name}</div>
                    {exam.description && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {exam.description}
                      </div>
                    )}
                  </td>
                  <td className="text-muted-foreground">{exam.class_name}</td>
                  <td className="font-mono text-muted-foreground">{exam.exam_date}</td>
                  <td className="text-center tabular-nums">
                    {exam.marks_obtained !== null &&
                    exam.max_marks !== null ? (
                      <span>
                        {exam.marks_obtained} / {exam.max_marks}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">&mdash;</span>
                    )}
                  </td>
                  <td className="text-center font-medium tabular-nums">
                    {exam.percentage !== null ? `${exam.percentage}%` : "—"}
                  </td>
                  <td className="text-center">
                    {exam.marks_obtained !== null ? (
                      <StatusBadge tone="success">Marks available</StatusBadge>
                    ) : (
                      <StatusBadge tone="neutral">Not marked yet</StatusBadge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </div>
    </div>
  );
}
