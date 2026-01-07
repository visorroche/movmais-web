import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";

export type MultiSelectOption = {
  value: string;
  label: string;
};

type Props = {
  label: string;
  placeholder?: string;
  options: MultiSelectOption[];
  values: string[];
  onChange: (next: string[]) => void;
  searchPlaceholder?: string;
  onSearchChange?: (q: string) => void;
  disabled?: boolean;
};

export function MultiSelect({
  label,
  placeholder = "Selecionar...",
  options,
  values,
  onChange,
  searchPlaceholder = "Buscar...",
  onSearchChange,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);

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
      if (!el) return;
      if (!el.contains(e.target as any)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQ("");
    onSearchChange?.("");
  }, [open, onSearchChange]);

  const selectedSet = useMemo(() => new Set(values), [values]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((o) => o.label.toLowerCase().includes(needle));
  }, [options, q]);

  const summary = useMemo(() => {
    if (!values.length) return placeholder;
    if (values.length === 1) {
      const found = options.find((o) => o.value === values[0]);
      return found?.label || "1 selecionado";
    }
    return `${values.length} selecionados`;
  }, [options, placeholder, values]);

  const toggle = (v: string) => {
    const next = new Set(values);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange(Array.from(next));
  };

  const clear = () => onChange([]);

  return (
    <div ref={rootRef} className="relative">
      <div className="mb-1 text-xs font-semibold text-slate-600">{label}</div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((s) => !s)}
        className={
          "flex w-full items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-900 " +
          "hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
        }
      >
        <span className="min-w-0 truncate">{summary}</span>
        <span className="flex items-center gap-2">
          {values.length ? (
            <span
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg hover:bg-slate-100"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                clear();
              }}
              title="Limpar"
            >
              <X className="h-4 w-4 text-slate-500" />
            </span>
          ) : null}
          <ChevronDown className={"h-4 w-4 text-slate-500 transition-transform " + (open ? "rotate-180" : "")} />
        </span>
      </button>

      {open ? (
        <div className="absolute z-40 mt-2 w-full rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
          <input
            value={q}
            onChange={(e) => {
              const next = e.target.value;
              setQ(next);
              onSearchChange?.(next);
            }}
            placeholder={searchPlaceholder}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <div className="mt-2 max-h-64 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-2 py-3 text-sm text-slate-600">Nenhum resultado.</div>
            ) : (
              filtered.map((o) => {
                const checked = selectedSet.has(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => toggle(o.value)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <span
                      className={
                        "h-4 w-4 rounded border " +
                        (checked ? "border-primary bg-primary" : "border-slate-300 bg-white")
                      }
                    />
                    <span className="min-w-0 flex-1 truncate text-slate-900">{o.label}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}


