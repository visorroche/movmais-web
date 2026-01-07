import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

export type DateRangeValue = { start: string; end: string };

type Props = {
  label?: string;
  value: DateRangeValue;
  onChange: (next: DateRangeValue) => void;
  placeholder?: string;
  disabled?: boolean;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function fromISODate(value: string): Date | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  // valida overflow (ex.: 2025-02-31)
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}

function formatDateBR(value: string): string {
  const dt = fromISODate(value);
  if (!dt) return value || "-";
  return `${pad2(dt.getDate())}/${pad2(dt.getMonth() + 1)}/${dt.getFullYear()}`;
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

// semana começando na segunda-feira
function startOfWeekMonday(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay(); // 0=domingo,1=seg
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}
function endOfWeekSunday(d: Date): Date {
  return addDays(startOfWeekMonday(d), 6);
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function startOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 0, 1);
}
function endOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 11, 31);
}

function addMonths(d: Date, months: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + months, 1);
}

function startOfMonthDate(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

// retorna uma grade de 6 semanas (42 dias), começando na segunda-feira
function monthGrid(d: Date): Date[] {
  const first = startOfMonthDate(d);
  const start = startOfWeekMonday(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isBetweenInclusive(target: Date, start: Date, end: Date): boolean {
  const t = target.getTime();
  return t >= start.getTime() && t <= end.getTime();
}

function formatMonthYearPT(d: Date): string {
  // pt-BR geralmente vem como "dezembro de 2025" — queremos "Dezembro 2025"
  const raw = d.toLocaleString("pt-BR", { month: "long", year: "numeric" });
  const cleaned = raw.replace(/\s+de\s+/i, " ").trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function DateRangePicker({ label, value, onChange, placeholder = "Selecionar período...", disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRangeValue>(value);
  const [month, setMonth] = useState<Date>(() => startOfMonthDate(new Date()));
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [panelStyle, setPanelStyle] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(value);
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const base = fromISODate(value.start) || fromISODate(value.end) || new Date();
    setMonth(startOfMonthDate(base));
  }, [open, value.end, value.start]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const el = rootRef.current;
      const panel = panelRef.current;
      if (!el) return;
      const t = e.target as any;
      if (el.contains(t)) return;
      if (panel && panel.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setPanelStyle(null);
      return;
    }
    const update = () => {
      const btn = buttonRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const margin = 12;
      const desiredWidth = Math.min(900, Math.max(320, vw - margin * 2));
      const left = Math.min(vw - desiredWidth - margin, Math.max(margin, rect.right - desiredWidth));
      const top = rect.bottom + 8;
      const maxHeight = Math.max(240, vh - top - margin);
      setPanelStyle({ top, left, width: desiredWidth, maxHeight });
    };
    update();
    window.addEventListener("resize", update);
    // captura scroll de containers internos também
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  const summary = useMemo(() => {
    if (!value.start && !value.end) return placeholder;
    if (value.start && value.end) return `${formatDateBR(value.start)} – ${formatDateBR(value.end)}`;
    if (value.start) return `A partir de ${formatDateBR(value.start)}`;
    return `Até ${formatDateBR(value.end)}`;
  }, [placeholder, value.end, value.start]);

  const apply = () => {
    const a = fromISODate(draft.start);
    const b = fromISODate(draft.end);
    if (a && b && a.getTime() > b.getTime()) {
      onChange({ start: draft.end, end: draft.start });
    } else {
      onChange(draft);
    }
    setOpen(false);
  };

  const cancel = () => {
    setDraft(value);
    setOpen(false);
  };

  const setPreset = (next: DateRangeValue) => setDraft(next);

  const onPickDay = (day: Date) => {
    const iso = toISODate(day);
    const a = fromISODate(draft.start);
    const b = fromISODate(draft.end);
    if (!a || (a && b)) {
      setDraft({ start: iso, end: "" });
      return;
    }
    // temos start mas não end
    if (a && !b) {
      const end = fromISODate(iso);
      if (end && end.getTime() < a.getTime()) {
        setDraft({ start: iso, end: toISODate(a) });
      } else {
        setDraft({ start: draft.start, end: iso });
      }
    }
  };

  const presets = useMemo(() => {
    const now = new Date();
    const today = toISODate(now);
    const yesterday = toISODate(addDays(now, -1));
    const thisWeekStart = toISODate(startOfWeekMonday(now));
    const thisWeekEnd = toISODate(endOfWeekSunday(now));
    const lastWeekRef = addDays(now, -7);
    const lastWeekStart = toISODate(startOfWeekMonday(lastWeekRef));
    const lastWeekEnd = toISODate(endOfWeekSunday(lastWeekRef));
    const thisMonthStart = toISODate(startOfMonth(now));
    const thisMonthEnd = toISODate(endOfMonth(now));
    const lastMonthRef = new Date(now.getFullYear(), now.getMonth() - 1, 15);
    const lastMonthStart = toISODate(startOfMonth(lastMonthRef));
    const lastMonthEnd = toISODate(endOfMonth(lastMonthRef));
    const thisYearStart = toISODate(startOfYear(now));
    const thisYearEnd = toISODate(endOfYear(now));

    return [
      { key: "today", label: "Hoje", value: { start: today, end: today } },
      { key: "yesterday", label: "Ontem", value: { start: yesterday, end: yesterday } },
      { key: "this_week", label: "Esta semana", value: { start: thisWeekStart, end: thisWeekEnd } },
      { key: "last_week", label: "Semana passada", value: { start: lastWeekStart, end: lastWeekEnd } },
      { key: "this_month", label: "Este mês", value: { start: thisMonthStart, end: thisMonthEnd } },
      { key: "last_month", label: "Mês passado", value: { start: lastMonthStart, end: lastMonthEnd } },
      { key: "last_7", label: "Últimos 7 dias", value: { start: toISODate(addDays(now, -7)), end: today } },
      { key: "last_15", label: "Últimos 15 dias", value: { start: toISODate(addDays(now, -15)), end: today } },
      { key: "last_30", label: "Últimos 30 dias", value: { start: toISODate(addDays(now, -30)), end: today } },
      { key: "this_year", label: "Este ano", value: { start: thisYearStart, end: thisYearEnd } },
      { key: "all", label: "Todo o período", value: { start: "", end: "" } },
    ] as const;
  }, []);

  return (
    <div ref={rootRef} className="relative">
      {label ? <div className="mb-1 text-xs font-semibold text-slate-600">{label}</div> : null}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((s) => !s)}
        ref={buttonRef}
        className={
          "flex w-full items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-900 " +
          "hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
        }
      >
        <span className="flex min-w-0 items-center gap-2 truncate">
          <Calendar className="h-4 w-4 text-slate-500" />
          <span className="truncate">{summary}</span>
        </span>
        <ChevronDown className={"h-4 w-4 text-slate-500 transition-transform " + (open ? "rotate-180" : "")} />
      </button>

      {open && panelStyle && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              className="z-[9999] rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-auto"
              style={{
                position: "fixed",
                top: panelStyle.top,
                left: panelStyle.left,
                width: panelStyle.width,
                maxHeight: panelStyle.maxHeight,
              }}
            >
          <div className="grid grid-cols-1 gap-0 md:grid-cols-[220px_1fr]">
            <div className="border-b border-slate-200 p-3 md:border-b-0 md:border-r">
              <div className="text-xs font-semibold text-slate-600">Presets</div>
              <div className="mt-2 space-y-1">
                {presets.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setPreset(p.value)}
                    className="w-full rounded-lg px-2 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-3">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {[0, 1].map((offset) => {
                  const m = addMonths(month, offset);
                  const grid = monthGrid(m);
                  const monthLabel = formatMonthYearPT(m);
                  const start = fromISODate(draft.start);
                  const end = fromISODate(draft.end);
                  return (
                    <div key={offset}>
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => setMonth((cur) => addMonths(cur, -1))}
                          className={"rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 " + (offset === 0 ? "" : "invisible")}
                          aria-label="Mês anterior"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <div className="text-base font-extrabold text-slate-900">{monthLabel}</div>
                        <button
                          type="button"
                          onClick={() => setMonth((cur) => addMonths(cur, 1))}
                          className={"rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 " + (offset === 1 ? "" : "invisible")}
                          aria-label="Próximo mês"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="mt-3 grid grid-cols-7 text-center text-xs font-semibold text-slate-500">
                        {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((w) => (
                          <div key={w} className="py-2">
                            {w}
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-7 text-center text-sm">
                        {grid.map((day) => {
                          const inMonth = day.getMonth() === m.getMonth();
                          const isStart = start ? isSameDay(day, start) : false;
                          const isEnd = end ? isSameDay(day, end) : false;
                          const inRange = start && end ? isBetweenInclusive(day, start, end) : false;

                          const base =
                            "mx-auto flex h-9 w-9 items-center justify-center rounded-full transition-colors ";
                          const text = inMonth ? "text-slate-900" : "text-slate-400";
                          const rangeBg = inRange ? "bg-primary/10 " : "";
                          const selected = isStart || isEnd ? "bg-primary text-white " : "";
                          const hover = "hover:bg-slate-100";

                          return (
                            <button
                              key={day.toISOString()}
                              type="button"
                              onClick={() => onPickDay(day)}
                              className={"py-1.5 " + (inRange ? "bg-primary/5" : "")}
                            >
                              <span className={base + text + " " + rangeBg + selected + hover}>{day.getDate()}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={draft.start}
                    onChange={(e) => setDraft((s) => ({ ...s, start: e.target.value }))}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <span className="text-slate-400">–</span>
                  <input
                    type="date"
                    value={draft.end}
                    onChange={(e) => setDraft((s) => ({ ...s, end: e.target.value }))}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={cancel}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={apply}
                    className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:brightness-95"
                  >
                    Aplicar
                  </button>
                </div>
              </div>
            </div>
          </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}


