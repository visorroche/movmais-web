import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { buildApiUrl } from "@/lib/config";
import { getAuthHeaders } from "@/lib/auth";
import { DateRangePicker, type DateRangeValue } from "@/components/ui/date-range-picker";
import { marketplaceColorOrFallback, marketplaceTextColor } from "@/lib/marketplaceColors";
import { SlideOver } from "@/components/ui/slideover";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/multi-select";
import { SlidersHorizontal } from "lucide-react";
import { OrderDetailSlideOver } from "@/components/orders/OrderDetailSlideOver";

const DashboardOperacao = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const formatInt = (n: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(Number(n || 0));
  const formatPct1 = (n: number) => `${Number(n || 0).toFixed(1).replace(".", ",")}%`;

  const isIsoYmd = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || "").trim());
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const toISO = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const formatDateBR = (ymd: string | null | undefined): string => {
    const s = String(ymd || "").trim();
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return "-";
    return `${m[3]}/${m[2]}/${m[1]}`;
  };
  const fromISO = (ymd: string): Date | null => {
    const s = String(ymd || "").trim();
    if (!isIsoYmd(s)) return null;
    const [y, m, d] = s.split("-").map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    if (dt.getFullYear() !== y || dt.getMonth() !== (m || 1) - 1 || dt.getDate() !== d) return null;
    return dt;
  };
  const addDays = (ymd: string, days: number): string => {
    const dt = fromISO(ymd);
    if (!dt) return ymd;
    const x = new Date(dt);
    x.setDate(x.getDate() + days);
    return toISO(x);
  };

  const defaultRange = useMemo(() => {
    const now = new Date();
    const end = toISO(now);
    const start = toISO(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
    // últimos 30 dias (inclusive) => end - 29
    return { start: addDays(start, -29), end };
  }, []);

  const [dateRange, setDateRange] = useState<DateRangeValue>(() => {
    const s = String(searchParams.get("start") || "").trim();
    const e = String(searchParams.get("end") || "").trim();
    const start = isIsoYmd(s) ? s : defaultRange.start;
    const end = isIsoYmd(e) ? e : defaultRange.end;
    return { start, end };
  });

  // filtros (somente status + marketplace)
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statusValues, setStatusValues] = useState<string[]>(() => searchParams.getAll("status").map((v) => String(v)).filter(Boolean));
  const [marketplaceValues, setMarketplaceValues] = useState<string[]>(() => searchParams.getAll("channel").map((v) => String(v)).filter(Boolean));
  const [filtersLoading, setFiltersLoading] = useState(false);
  const [filtersError, setFiltersError] = useState<string | null>(null);
  const [statusOptions, setStatusOptions] = useState<MultiSelectOption[]>([]);
  const [marketplaceOptions, setMarketplaceOptions] = useState<MultiSelectOption[]>([]);

  // carrega opções (reusa /me/dashboard/filters, igual Dashboard.tsx)
  useEffect(() => {
    const ac = new AbortController();
    setFiltersLoading(true);
    setFiltersError(null);
    fetch(buildApiUrl("/companies/me/dashboard/filters"), { headers: { ...getAuthHeaders() }, signal: ac.signal })
      .then(async (res) => {
        if (res.status === 401) throw new Error("Não autenticado");
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error((d as any)?.message || "Erro ao carregar filtros");
        }
        return res.json() as Promise<{ statuses: string[]; channels: string[] }>;
      })
      .then((d) => {
        setStatusOptions((d?.statuses || []).map((s) => ({ value: s, label: s })));
        setMarketplaceOptions((d?.channels || []).map((s) => ({ value: s, label: s })));
      })
      .catch((e: any) => {
        if (String(e?.name || "") === "AbortError") return;
        setStatusOptions([]);
        setMarketplaceOptions([]);
        setFiltersError(String(e?.message || "Erro ao carregar filtros"));
      })
      .finally(() => setFiltersLoading(false));
    return () => ac.abort();
  }, []);

  // sincroniza URL com o período selecionado (mantendo outros filtros na query)
  useEffect(() => {
    const start = String(dateRange.start || "").trim();
    const end = String(dateRange.end || "").trim();
    if (!isIsoYmd(start) || !isIsoYmd(end)) return;
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set("start", start);
        p.set("end", end);
        return p;
      },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange.start, dateRange.end]);

  // aplica filtros na URL (mantém start/end)
  const applyFiltersToUrl = () => {
    const start = String(dateRange.start || "").trim();
    const end = String(dateRange.end || "").trim();
    const p = new URLSearchParams();
    if (isIsoYmd(start)) p.set("start", start);
    if (isIsoYmd(end)) p.set("end", end);
    for (const s of statusValues) if (String(s).trim()) p.append("status", String(s).trim());
    for (const c of marketplaceValues) if (String(c).trim()) p.append("channel", String(c).trim());
    setSearchParams(p, { replace: false });
    setFiltersOpen(false);
  };

  const applyMarketplaceQuickFilter = (marketplace: string) => {
    const m = String(marketplace || "").trim();
    if (!m) return;
    setMarketplaceValues([m]);
    const start = String(dateRange.start || "").trim();
    const end = String(dateRange.end || "").trim();
    const p = new URLSearchParams();
    if (isIsoYmd(start)) p.set("start", start);
    if (isIsoYmd(end)) p.set("end", end);
    for (const s of statusValues) if (String(s).trim()) p.append("status", String(s).trim());
    p.append("channel", m);
    setSearchParams(p, { replace: false });
  };

  type Row = {
    marketplace: string;
    totalOrders: number;
    toInvoice: number;
    today: number;
    yesterday: number;
    above3Days: number;
    kanbanNew: number;
    kanbanInvoiced: number;
    kanbanInTransit: number;
    kanbanDelivered: number;
    kanbanCancelled: number;
    cancelled: number;
    returned: number;
  };
  type Response = { start: string; end: string; marketplaces: string[]; rows: Row[] };
  type KanbanCard = {
    id: number;
    orderCode: number;
    marketplace: string;
    orderDate: string | null;
    deliveryDeadline: string | null;
    daysSinceOrder: number;
    isOverdue: boolean;
    status: string;
  };
  type KanbanResponse = {
    start: string;
    end: string;
    limit: number;
    columns: {
      novos: KanbanCard[];
      faturados: KanbanCard[];
      emTransporte: KanbanCard[];
      entregues: KanbanCard[];
      cancelados: KanbanCard[];
    };
  };

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Response | null>(null);
  const [kanban, setKanban] = useState<KanbanResponse | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [visibleByCol, setVisibleByCol] = useState<Record<string, number>>({
    kanbanNew: 50,
    kanbanInvoiced: 50,
    kanbanInTransit: 50,
    kanbanDelivered: 50,
    kanbanCancelled: 50,
  });

  useEffect(() => {
    const start = String(dateRange.start || "").trim();
    const end = String(dateRange.end || "").trim();
    if (!isIsoYmd(start) || !isIsoYmd(end)) return;
    const ac = new AbortController();
    setLoading(true);
    setError(null);

    const qs = new URLSearchParams(searchParams);
    qs.set("start", start);
    qs.set("end", end);

    Promise.all([
      fetch(buildApiUrl(`/companies/me/dashboard/operation/marketplace-table?${qs.toString()}`), { headers: { ...getAuthHeaders() }, signal: ac.signal }).then(async (res) => {
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error((d as any)?.message || "Erro ao carregar operação");
        }
        return res.json() as Promise<Response>;
      }),
      (() => {
        const qk = new URLSearchParams(qs);
        qk.set("limit", "50");
        return fetch(buildApiUrl(`/companies/me/dashboard/operation/kanban?${qk.toString()}`), { headers: { ...getAuthHeaders() }, signal: ac.signal }).then(async (res) => {
          if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            throw new Error((d as any)?.message || "Erro ao carregar kanban");
          }
          return res.json() as Promise<KanbanResponse>;
        });
      })(),
    ])
      .then(([table, kb]) => {
        setData(table);
        setKanban(kb);
        setVisibleByCol({
          kanbanNew: 50,
          kanbanInvoiced: 50,
          kanbanInTransit: 50,
          kanbanDelivered: 50,
          kanbanCancelled: 50,
        });
      })
      .catch((e: any) => {
        if (String(e?.name || "") === "AbortError") return;
        setData(null);
        setKanban(null);
        setError(String(e?.message || "Erro ao carregar operação"));
      })
      .finally(() => setLoading(false));

    return () => ac.abort();
  }, [searchParams, dateRange.start, dateRange.end]);

  const marketplaces = useMemo(() => (data?.marketplaces || []).filter(Boolean), [data]);
  const rows = useMemo(() => (data?.rows || []) as Row[], [data]);

  const totalBy = useMemo(() => {
    const sum = (fn: (r: Row) => number) => rows.reduce((acc, r) => acc + (Number(fn(r)) || 0), 0);
    return {
      totalOrders: sum((r) => r.totalOrders),
      toInvoice: sum((r) => r.toInvoice),
      today: sum((r) => r.today),
      yesterday: sum((r) => r.yesterday),
      above3Days: sum((r) => r.above3Days),
      kanbanNew: sum((r) => r.kanbanNew),
      kanbanInvoiced: sum((r) => r.kanbanInvoiced),
      kanbanInTransit: sum((r) => r.kanbanInTransit),
      kanbanDelivered: sum((r) => r.kanbanDelivered),
      kanbanCancelled: sum((r) => r.kanbanCancelled),
      cancelled: sum((r) => r.cancelled),
      returned: sum((r) => r.returned),
    };
  }, [rows]);

  const rowByMarketplace = useMemo(() => new Map(rows.map((r) => [String(r.marketplace), r])), [rows]);

  const kanbanCols = useMemo(
    () => [
      { key: "kanbanNew" as const, title: "Novos", accent: "#64748B" }, // slate-500
      { key: "kanbanInvoiced" as const, title: "Faturados", accent: "#0EA5E9" }, // sky-500
      { key: "kanbanInTransit" as const, title: "Em Transporte", accent: "#F59E0B" }, // amber-500
      { key: "kanbanDelivered" as const, title: "Entregues", accent: "#10B981" }, // emerald-500
      { key: "kanbanCancelled" as const, title: "Cancelados", accent: "#F43F5E" }, // rose-500
    ],
    [],
  );

  const cardLabelFor = (c: KanbanCard, colKey: (typeof kanbanCols)[number]["key"]) => {
    const st = String(c.status || "").trim().toLowerCase();
    // Nunca mostrar "Prazo de entrega atrasado" em Entregues/Cancelados
    if (c.isOverdue && colKey !== "kanbanDelivered" && colKey !== "kanbanCancelled") {
      return { text: "Prazo de entrega atrasado", tone: "red" as const };
    }
    if (st === "novo" && (Number(c.daysSinceOrder || 0) || 0) > 1) {
      return { text: `${c.daysSinceOrder} dias`, tone: "red" as const };
    }
    return null;
  };

  const pct = (num: number, den: number) => {
    const d = Number(den || 0);
    if (d <= 0) return null;
    return (Number(num || 0) / d) * 100;
  };

  return (
    <div className="w-full">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-sm text-slate-600">
            <Link to="/dashboard" className="font-semibold text-slate-700 hover:text-slate-900 hover:underline">
              Dashboard
            </Link>{" "}
            <span className="text-slate-400">/</span> Operação
          </div>
          <h1 className="mt-2 text-2xl font-extrabold text-slate-900">Detalhes da Operação</h1>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-end">
          <div className="w-full sm:w-[360px]">
            <DateRangePicker
              label="Período"
              value={dateRange}
              onChange={(next) => setDateRange(next)}
              placeholder="Selecionar período..."
            />
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filtros
          </button>
        </div>
      </div>

      {loading ? <div className="mt-2 text-sm text-slate-600">Carregando...</div> : null}
      {!loading && error ? <div className="mt-2 text-sm text-red-600">{error}</div> : null}

      <Card className="mt-4 w-full border-slate-200 bg-white p-5">
        <div className="overflow-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-extrabold text-slate-700">
              <tr>
                <th className="px-4 py-3">Indicador</th>
                {marketplaces.map((m) => (
                  <th key={m} className="px-4 py-3 whitespace-nowrap">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: marketplaceColorOrFallback(m) }} />
                      {m}
                    </span>
                  </th>
                ))}
                <th className="px-4 py-3">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {/* Bloco: antes de faturar */}
              <tr className="bg-white">
                <td className="px-4 py-3 font-semibold text-slate-900">Total de pedidos para faturar</td>
                {marketplaces.map((m) => (
                  <td key={m} className="px-4 py-3 text-slate-700">
                    {formatInt(rowByMarketplace.get(m)?.toInvoice ?? 0)}
                  </td>
                ))}
                <td className="px-4 py-3 font-extrabold text-slate-900">{formatInt(totalBy.toInvoice)}</td>
              </tr>
              <tr className="bg-white">
                <td className="px-4 py-3 font-semibold text-slate-900">Pedidos de Hoje</td>
                {marketplaces.map((m) => (
                  <td key={m} className="px-4 py-3 text-slate-700">
                    {formatInt(rowByMarketplace.get(m)?.today ?? 0)}
                  </td>
                ))}
                <td className="px-4 py-3 font-extrabold text-slate-900">{formatInt(totalBy.today)}</td>
              </tr>
              <tr className="bg-white">
                <td className="px-4 py-3 font-semibold text-slate-900">Pedidos de Ontem</td>
                {marketplaces.map((m) => (
                  <td key={m} className="px-4 py-3 text-slate-700">
                    {formatInt(rowByMarketplace.get(m)?.yesterday ?? 0)}
                  </td>
                ))}
                <td className="px-4 py-3 font-extrabold text-slate-900">{formatInt(totalBy.yesterday)}</td>
              </tr>
              <tr className="bg-white">
                <td className="px-4 py-3 font-semibold text-slate-900">Pedidos acima de 3 dias</td>
                {marketplaces.map((m) => (
                  <td key={m} className="px-4 py-3 text-slate-700">
                    {formatInt(rowByMarketplace.get(m)?.above3Days ?? 0)}
                  </td>
                ))}
                <td className="px-4 py-3 font-extrabold text-slate-900">{formatInt(totalBy.above3Days)}</td>
              </tr>

              {/* separador */}
              <tr className="bg-slate-50">
                <td className="px-4 py-2 text-xs font-semibold text-slate-500" colSpan={marketplaces.length + 2}>
                  &nbsp;
                </td>
              </tr>

              {/* Cancelamentos */}
              <tr className="bg-white">
                <td className="px-4 py-3 font-semibold text-slate-900">Total de Cancelamentos</td>
                {marketplaces.map((m) => (
                  <td key={m} className="px-4 py-3 text-slate-700">
                    {formatInt(rowByMarketplace.get(m)?.cancelled ?? 0)}
                  </td>
                ))}
                <td className="px-4 py-3 font-extrabold text-slate-900">{formatInt(totalBy.cancelled)}</td>
              </tr>
              <tr className="bg-white">
                <td className="px-4 py-3 font-semibold text-slate-900">Percentual em relação ao total de pedidos</td>
                {marketplaces.map((m) => {
                  const r = rowByMarketplace.get(m);
                  const v = pct(r?.cancelled ?? 0, r?.totalOrders ?? 0);
                  return <td key={m} className="px-4 py-3 text-slate-700">{v === null ? "—" : formatPct1(v)}</td>;
                })}
                <td className="px-4 py-3 font-extrabold text-slate-900">
                  {(() => {
                    const v = pct(totalBy.cancelled, totalBy.totalOrders);
                    return v === null ? "—" : formatPct1(v);
                  })()}
                </td>
              </tr>

              {/* separador */}
              <tr className="bg-slate-50">
                <td className="px-4 py-2 text-xs font-semibold text-slate-500" colSpan={marketplaces.length + 2}>
                  &nbsp;
                </td>
              </tr>

              {/* Devoluções */}
              <tr className="bg-white">
                <td className="px-4 py-3 font-semibold text-slate-900">Total de devoluções</td>
                {marketplaces.map((m) => (
                  <td key={m} className="px-4 py-3 text-slate-700">
                    {formatInt(rowByMarketplace.get(m)?.returned ?? 0)}
                  </td>
                ))}
                <td className="px-4 py-3 font-extrabold text-slate-900">{formatInt(totalBy.returned)}</td>
              </tr>
              <tr className="bg-white">
                <td className="px-4 py-3 font-semibold text-slate-900">Percentual em relação ao total de pedidos</td>
                {marketplaces.map((m) => {
                  const r = rowByMarketplace.get(m);
                  const v = pct(r?.returned ?? 0, r?.totalOrders ?? 0);
                  return <td key={m} className="px-4 py-3 text-slate-700">{v === null ? "—" : formatPct1(v)}</td>;
                })}
                <td className="px-4 py-3 font-extrabold text-slate-900">
                  {(() => {
                    const v = pct(totalBy.returned, totalBy.totalOrders);
                    return v === null ? "—" : formatPct1(v);
                  })()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-4 text-lg font-extrabold text-slate-900">Acompanhamento dos Pedidos</div>

      <Card className="mt-3 w-full border-slate-200 bg-white p-5">
        {/* Kanban */}
        <div className="overflow-x-auto">
          <div className="grid min-w-[980px] grid-cols-5 gap-4">
            {kanbanCols.map((col) => {
              const cards =
                col.key === "kanbanNew"
                  ? kanban?.columns?.novos || []
                  : col.key === "kanbanInvoiced"
                    ? kanban?.columns?.faturados || []
                    : col.key === "kanbanInTransit"
                      ? kanban?.columns?.emTransporte || []
                      : col.key === "kanbanDelivered"
                        ? kanban?.columns?.entregues || []
                        : kanban?.columns?.cancelados || [];
              const visible = Math.max(0, Number(visibleByCol[col.key] ?? 50) || 50);
              const shown = cards.slice(0, visible);
              return (
                <Card key={col.key} className="w-full border border-slate-200 bg-white p-0">
                  <div className="h-1 rounded-t-xl" style={{ background: col.accent }} />
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-extrabold text-slate-900">{col.title}</div>
                      <div className="text-sm font-extrabold text-slate-900">{formatInt(cards.length)}</div>
                    </div>

                    <div className="mt-3 space-y-2">
                      {shown.map((c) => {
                        const label = cardLabelFor(c, col.key);
                        const labelCls =
                          label?.tone === "red"
                            ? "border-rose-200 bg-rose-50 text-rose-700"
                            : "border-slate-200 bg-slate-50 text-slate-700";
                        return (
                          <div
                            key={String(c.id)}
                            role="button"
                            tabIndex={0}
                            className="cursor-pointer rounded-xl border border-slate-200 bg-white p-3 hover:bg-slate-50"
                            onClick={() => setSelectedOrderId(c.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") setSelectedOrderId(c.id);
                            }}
                          >
                            <div className="text-xs font-extrabold text-slate-900">#{String(c.orderCode || "")}</div>
                            <div className="mt-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  applyMarketplaceQuickFilter(c.marketplace);
                                }}
                                className="inline-flex max-w-full truncate rounded-full px-2 py-0.5 text-[11px] font-extrabold hover:brightness-95"
                                style={{ background: marketplaceColorOrFallback(c.marketplace), color: marketplaceTextColor(c.marketplace) }}
                                title={c.marketplace}
                              >
                                {c.marketplace}
                              </button>
                            </div>

                            <div className="mt-2 space-y-1 text-[11px] text-slate-600">
                              <div>
                                <span className="font-semibold text-slate-700">Status:</span> {String(c.status || "—")}
                              </div>
                              <div>
                                <span className="font-semibold text-slate-700">Data do Pedido:</span> {formatDateBR(c.orderDate)}
                              </div>
                              <div>
                                <span className="font-semibold text-slate-700">Prazo de Entrega:</span> {formatDateBR(c.deliveryDeadline)}
                              </div>
                              <div>
                                <span className="font-semibold text-slate-700">Dias desde o pedido:</span> {formatInt(c.daysSinceOrder)}
                              </div>
                            </div>

                            {label ? (
                              <div className="mt-2">
                                <span className={["inline-flex rounded-full border px-2 py-0.5 text-[11px] font-extrabold", labelCls].join(" ")}>
                                  {label.text}
                                </span>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                      {!cards.length ? <div className="text-xs text-slate-600">Sem pedidos.</div> : null}
                      {cards.length > shown.length ? (
                        <button
                          type="button"
                          onClick={() =>
                            setVisibleByCol((cur) => ({
                              ...cur,
                              [col.key]: Math.min(cards.length, (Number(cur[col.key] ?? 50) || 50) + 50),
                            }))
                          }
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-800 hover:bg-slate-50"
                        >
                          Ver mais ({cards.length - shown.length})
                        </button>
                      ) : null}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </Card>

      <SlideOver open={filtersOpen} title="Filtros" onClose={() => setFiltersOpen(false)}>
        {filtersLoading ? <div className="text-slate-600">Carregando filtros...</div> : null}
        {!filtersLoading && filtersError ? <div className="text-sm text-red-600">{filtersError}</div> : null}

        <div className="flex h-full flex-col">
          <div className="flex-1 space-y-4">
            <MultiSelect
              label="Status"
              options={statusOptions}
              values={statusValues}
              onChange={setStatusValues}
              placeholder="Todos"
              searchPlaceholder="Buscar status..."
            />
            <MultiSelect
              label="Marketplace"
              options={marketplaceOptions}
              values={marketplaceValues}
              onChange={setMarketplaceValues}
              placeholder="Todos"
              searchPlaceholder="Buscar marketplace..."
            />
          </div>

          <div className="mt-6 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={applyFiltersToUrl}
              className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-extrabold text-white hover:brightness-95"
            >
              Aplicar filtros
            </button>
          </div>
        </div>
      </SlideOver>

      <OrderDetailSlideOver open={!!selectedOrderId} orderId={selectedOrderId} onClose={() => setSelectedOrderId(null)} />
    </div>
  );
};


export default DashboardOperacao;

