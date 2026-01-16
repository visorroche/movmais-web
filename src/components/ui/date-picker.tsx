import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  label?: string;
  value: string; // YYYY-MM-DD
  onChange: (next: string) => void;
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

function startOfWeekMonday(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

function startOfMonthDate(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function monthGrid(d: Date): Date[] {
  const first = startOfMonthDate(d);
  const start = startOfWeekMonday(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatMonthYearPT(d: Date): string {
  const raw = d.toLocaleString("pt-BR", { month: "long", year: "numeric" });
  const cleaned = raw.replace(/\s+de\s+/i, " ").trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function DatePicker({ label, value, onChange, placeholder = "Selecionar data...", disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<Date>(() => startOfMonthDate(new Date()));
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [panelStyle, setPanelStyle] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const base = fromISODate(value) || new Date();
    setMonth(startOfMonthDate(base));
  }, [open, value]);

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
      const desiredWidth = Math.min(360, Math.max(280, rect.width));
      const left = Math.min(vw - desiredWidth - margin, Math.max(margin, rect.left));
      const top = rect.bottom + 8;
      const maxHeight = Math.max(240, vh - top - margin);
      setPanelStyle({ top, left, width: desiredWidth, maxHeight });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  const summary = useMemo(() => {
    if (!value) return placeholder;
    return formatDateBR(value);
  }, [placeholder, value]);

  const grid = useMemo(() => monthGrid(month), [month]);
  const selected = fromISODate(value);

  const panel =
    !open || !panelStyle
      ? null
      : createPortal(
          <div
            ref={panelRef}
            style={{ top: panelStyle.top, left: panelStyle.left, width: panelStyle.width, maxHeight: panelStyle.maxHeight }}
            className="fixed z-[9999] overflow-auto rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="p-3">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100"
                  onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="text-sm font-extrabold text-slate-900">{formatMonthYearPT(month)}</div>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100"
                  onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-3 grid grid-cols-7 gap-1 text-xs font-bold text-slate-500">
                {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
                  <div key={d} className="text-center">
                    {d}
                  </div>
                ))}
              </div>

              <div className="mt-2 grid grid-cols-7 gap-1">
                {grid.map((day) => {
                  const isCurrentMonth = day.getMonth() === month.getMonth();
                  const isSel = selected ? isSameDay(day, selected) : false;
                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      onClick={() => {
                        onChange(toISODate(day));
                        setOpen(false);
                      }}
                      className={
                        "h-9 rounded-lg text-sm font-semibold transition-colors " +
                        (isSel
                          ? "bg-primary text-white"
                          : isCurrentMonth
                            ? "text-slate-900 hover:bg-slate-100"
                            : "text-slate-400 hover:bg-slate-100")
                      }
                    >
                      {day.getDate()}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <button
                  type="button"
                  className="rounded-lg px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100"
                  onClick={() => onChange("")}
                >
                  Limpar
                </button>
                <button
                  type="button"
                  className="rounded-lg px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100"
                  onClick={() => {
                    onChange(toISODate(new Date()));
                    setOpen(false);
                  }}
                >
                  Hoje
                </button>
              </div>
            </div>
          </div>,
          document.body,
        );

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
          (disabled ? "opacity-60 cursor-not-allowed" : "hover:bg-slate-50")
        }
      >
        <span className={"truncate " + (!value ? "text-slate-400" : "")}>{summary}</span>
        <span className="inline-flex items-center gap-1 text-slate-600">
          <Calendar className="h-4 w-4" />
        </span>
      </button>
      {panel}
    </div>
  );
}

