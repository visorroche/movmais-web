import { useEffect, useMemo, useState } from "react";
import { buildApiUrl } from "@/lib/config";
import { getAuthHeaders, throwIfUnauthorized } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateRangePicker, type DateRangeValue } from "@/components/ui/date-range-picker";
import { DatePicker } from "@/components/ui/date-picker";
import { SlideOver } from "@/components/ui/slideover";

type ApiLogRow = {
  id: number;
  processed_at: string;
  date: string | null;
  status?: "PROCESSANDO" | "FINALIZADO" | "ERRO" | null;
  company_id: number;
  company_name: string;
  platform_id: number | null;
  platform_name: string | null;
  platform_slug: string | null;
  command: "Pedidos" | "Cotações" | "Produtos" | string;
  log: any;
  errors: any;
};

type ApiResponse = { total: number; items: ApiLogRow[] };

type Platform = { id: number; slug: string; name: string; type: string };
type CompanyPlatform = {
  id: number;
  company_id: number | null;
  platform_id: number | null;
  config: any;
  platform: Platform | null;
};

type SortKey = "processed_at" | "period";

function toQuery(params: Record<string, string | number | null | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

function todayYmd(): string {
  const d = new Date();
  const pad2 = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function ymdToDateLocal(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}

function diffDaysInclusive(start: string, end: string): number | null {
  const a = ymdToDateLocal(start);
  const b = ymdToDateLocal(end);
  if (!a || !b) return null;
  const dayMs = 24 * 60 * 60 * 1000;
  const diff = Math.floor((b.getTime() - a.getTime()) / dayMs) + 1;
  return Number.isFinite(diff) ? diff : null;
}

export default function LogIntegracoes() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse>({ total: 0, items: [] });

  const [platforms, setPlatforms] = useState<Platform[]>([]);

  const [command, setCommand] = useState<string>("");
  const [platformId, setPlatformId] = useState<string>("");
  const [periodoRegistro, setPeriodoRegistro] = useState<DateRangeValue>({ start: "", end: "" });
  const [processamentoDate, setProcessamentoDate] = useState<string>(() => todayYmd());

  const [sortKey, setSortKey] = useState<SortKey>("processed_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<ApiLogRow | null>(null);

  const [runOpen, setRunOpen] = useState(false);
  const [runPlatform, setRunPlatform] = useState<"tray" | "precode" | "allpost">("tray");
  const [runScript, setRunScript] = useState<string>("orders");
  const [runStartDate, setRunStartDate] = useState<string>(() => todayYmd());
  const [runEndDate, setRunEndDate] = useState<string>(() => todayYmd());
  const [runOnlyInsert, setRunOnlyInsert] = useState(true);
  const [runSubmitting, setRunSubmitting] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const openDetail = (row: ApiLogRow) => {
    setDetailRow(row);
    setDetailOpen(true);
  };

  const query = useMemo(() => {
    const start = String(periodoRegistro.start || "").trim();
    const end = String(periodoRegistro.end || "").trim();
    const hasPeriodo = Boolean(start && end);

    // Regra: se Periodo do Registro for preenchido, ignora Data do Processamento.
    // Se não tiver período, filtra por "processed" (um único dia).
    const processedDate = !hasPeriodo && processamentoDate ? processamentoDate : null;

    return toQuery({
      command: command || null,
      platform_id: platformId || null,
      "start-date": hasPeriodo ? start : null,
      "end-date": hasPeriodo ? end : null,
      "processed-date": processedDate,
      limit: 50,
      offset: 0,
    });
  }, [command, platformId, periodoRegistro.end, periodoRegistro.start, processamentoDate]);

  const maxSelectableYmd = useMemo(() => todayYmd(), []);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const load = async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(buildApiUrl(`/companies/me/integration-logs${query}`), {
        headers: { ...getAuthHeaders() },
        signal,
        cache: "no-store",
      });
      throwIfUnauthorized(res);
      if (!res.ok) throw new Error("Erro ao carregar logs");
      const json = (await res.json()) as ApiResponse;
      setData({ total: Number(json?.total ?? 0) || 0, items: Array.isArray(json?.items) ? json.items : [] });
    } catch (e: any) {
      setError(String(e?.message || "Erro ao carregar logs"));
      setData({ total: 0, items: [] });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const ac = new AbortController();
    load(ac.signal);
    // carrega plataformas configuradas na company ativa
    fetch(buildApiUrl("/companies/me/platforms"), { headers: { ...getAuthHeaders() }, signal: ac.signal })
      .then(async (res) => {
        if (!res.ok) return [];
        const json = (await res.json()) as unknown;
        const rows = Array.isArray(json) ? (json as CompanyPlatform[]) : [];
        const list = rows.map((r) => r?.platform).filter(Boolean) as Platform[];
        // unique por slug
        const seen = new Set<string>();
        return list.filter((p) => {
          const k = String(p.slug || "").trim();
          if (!k || seen.has(k)) return false;
          seen.add(k);
          return true;
        });
      })
      .then((list) => setPlatforms(Array.isArray(list) ? list : []))
      .catch(() => setPlatforms([]));
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Ajusta defaults conforme plataformas configuradas e mapeamento de scripts
    if (platforms.length > 0) {
      const allowed = new Set(platforms.map((p) => p.slug));
      if (!allowed.has(runPlatform)) {
        const first = platforms[0]?.slug as any;
        if (first) setRunPlatform(first);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platforms]);

  const selectedPlatformSlug = useMemo(() => {
    const pid = Number(platformId);
    if (!pid) return null;
    const p = platforms.find((x) => x.id === pid) ?? null;
    return p?.slug ?? null;
  }, [platformId, platforms]);

  const allowedCommandsForPlatform = useMemo(() => {
    // comandos disponíveis por plataforma (mesma regra do modal)
    if (!selectedPlatformSlug) return ["Pedidos", "Cotações", "Produtos"] as const;
    if (selectedPlatformSlug === "allpost") return ["Cotações", "Pedidos"] as const;
    if (selectedPlatformSlug === "precode") return ["Pedidos", "Produtos"] as const;
    if (selectedPlatformSlug === "tray") return ["Pedidos", "Produtos"] as const;
    return ["Pedidos", "Cotações", "Produtos"] as const;
  }, [selectedPlatformSlug]);

  useEffect(() => {
    if (!command) return;
    if (!allowedCommandsForPlatform.includes(command as any)) setCommand("");
  }, [allowedCommandsForPlatform, command]);

  const sortedItems = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const items = Array.isArray(data.items) ? data.items.slice() : [];

    const periodKey = (r: ApiLogRow) => {
      const l = r.log || {};
      const start = typeof l.startDate === "string" ? l.startDate.trim() : "";
      const end = typeof l.endDate === "string" ? l.endDate.trim() : "";
      const startKey = start || end || (r.date ? String(r.date) : "");
      const endKey = end || start || (r.date ? String(r.date) : "");
      return { startKey, endKey };
    };

    const cmpStr = (a: string, b: string) => {
      const aa = String(a || "").trim();
      const bb = String(b || "").trim();
      const aHas = Boolean(aa);
      const bHas = Boolean(bb);
      if (aHas !== bHas) return aHas ? -1 : 1; // vazios sempre por último
      if (!aHas && !bHas) return 0;
      // "YYYY-MM-DD" ordena bem como string; para ISO também mantém.
      return aa.localeCompare(bb);
    };

    const cmpNum = (a: number, b: number) => {
      const aOk = Number.isFinite(a);
      const bOk = Number.isFinite(b);
      if (aOk !== bOk) return aOk ? -1 : 1; // inválidos sempre por último
      if (!aOk && !bOk) return 0;
      return a === b ? 0 : a < b ? -1 : 1;
    };

    items.sort((a, b) => {
      if (sortKey === "period") {
        const pa = periodKey(a);
        const pb = periodKey(b);
        const c1 = cmpStr(pa.startKey, pb.startKey);
        if (c1) return c1 * dir;
        const c2 = cmpStr(pa.endKey, pb.endKey);
        if (c2) return c2 * dir;
      } else {
        const ta = Date.parse(String(a.processed_at || ""));
        const tb = Date.parse(String(b.processed_at || ""));
        const c1 = cmpNum(ta, tb);
        if (c1) return c1 * dir;
      }
      // fallback determinístico
      return cmpNum(Number(a.id), Number(b.id)) * dir;
    });

    return items;
  }, [data.items, sortDir, sortKey]);

  const submitRun = async () => {
    setRunSubmitting(true);
    setRunError(null);
    try {
      if (!runPlatform) throw new Error("platform inválido");
      if (!runScript) throw new Error("script inválido");

      const supportsDate = !(runScript === "products" || (runPlatform === "allpost" && runScript === "quotes"));
      const supportsOnlyInsert = runScript === "orders" && (runPlatform === "tray" || runPlatform === "precode");
      if (supportsDate) {
        if (!runStartDate || !runEndDate) throw new Error("Informe start e end date");
        if (runStartDate > maxSelectableYmd || runEndDate > maxSelectableYmd) throw new Error("Não é permitido selecionar datas no futuro");
        const days = diffDaysInclusive(runStartDate, runEndDate);
        if (days === null) throw new Error("Período inválido");
        if (days > 31) throw new Error("O período máximo permitido é de 31 dias");
      }

      const body = {
        platform: runPlatform,
        script: runScript,
        start_date: supportsDate ? runStartDate || null : null,
        end_date: supportsDate ? runEndDate || null : null,
        only_insert: supportsOnlyInsert ? runOnlyInsert || false : false,
      };

      const res = await fetch(buildApiUrl("/companies/me/integration-run"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(body),
      });
      throwIfUnauthorized(res);
      const text = await res.text().catch(() => "");
      if (!res.ok) throw new Error(text || "Falha ao iniciar comando");
      setRunOpen(false);
      await load();
    } catch (e: any) {
      setRunError(String(e?.message || "Falha ao iniciar comando"));
    } finally {
      setRunSubmitting(false);
    }
  };

  useEffect(() => {
    if (!runOpen) return;
    // defaults ao abrir o modal
    // por padrão, deixa marcado apenas nos comandos de pedidos (tray/precode)
    setRunOnlyInsert(runScript === "orders" && (runPlatform === "tray" || runPlatform === "precode"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runOpen]);

  useEffect(() => {
    // Se mudar para um comando que não suporta onlyInsert, desmarca.
    const supportsOnlyInsert = runScript === "orders" && (runPlatform === "tray" || runPlatform === "precode");
    if (!supportsOnlyInsert && runOnlyInsert) setRunOnlyInsert(false);
  }, [runOnlyInsert, runPlatform, runScript]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-2xl font-extrabold text-slate-900">Log de Integrações</div>
          <div className="text-sm text-slate-600">Execuções dos comandos (Pedidos, Cotações, Produtos) por empresa/plataforma.</div>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => setRunOpen(true)}>
            Forçar comando
          </Button>
        </div>
      </div>

      <Card className="border-slate-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Plataforma</label>
            <select
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-primary/30"
              value={platformId}
              onChange={(e) => setPlatformId(e.target.value)}
            >
              <option value="">Todas</option>
              {platforms
                .slice()
                .sort((a, b) => String(a.name).localeCompare(String(b.name)))
                .map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.name} ({p.slug})
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Comando</label>
            <select
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-primary/30"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
            >
              <option value="">Todos</option>
              {allowedCommandsForPlatform.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-semibold text-slate-700 mb-1">Período do Registro</label>
            <DateRangePicker
              value={periodoRegistro}
              onChange={setPeriodoRegistro}
              placeholder="Selecionar período..."
              max={maxSelectableYmd}
              maxRangeDays={31}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Data do Processamento</label>
            <DatePicker value={processamentoDate} onChange={setProcessamentoDate} placeholder="Selecionar data..." max={maxSelectableYmd} />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                // validações: sem futuro e máximo 31 dias
                const start = String(periodoRegistro.start || "").trim();
                const end = String(periodoRegistro.end || "").trim();
                if (start && start > maxSelectableYmd) return setError("Não é permitido selecionar datas no futuro");
                if (end && end > maxSelectableYmd) return setError("Não é permitido selecionar datas no futuro");
                if (start && end) {
                  const days = diffDaysInclusive(start, end);
                  if (days !== null && days > 31) return setError("O período máximo permitido é de 31 dias");
                }
                setError(null);
                load();
              }}
              disabled={loading}
              className="w-full"
            >
              Aplicar filtros
            </Button>
          </div>
        </div>
        <div className="mt-2 text-xs text-slate-600">
          Se você preencher o <span className="font-bold">Período do Registro</span>, a <span className="font-bold">Data do Processamento</span> será ignorada.
        </div>

        {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
      </Card>

      <Card className="border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-slate-700">
            Total: <span className="font-extrabold text-slate-900">{data.total}</span>
          </div>
        </div>

        <div className="mt-3 overflow-auto rounded-xl border border-slate-200">
          <table className="min-w-[920px] w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left">
                <th className="px-3 py-2 font-extrabold text-slate-700">
                  <button
                    type="button"
                    onClick={() => toggleSort("processed_at")}
                    className="inline-flex items-center gap-2 hover:underline"
                    title="Ordenar por Processado em"
                  >
                    <span>Processado em</span>
                    {sortKey === "processed_at" ? <span className="text-[10px]">{sortDir === "asc" ? "▲" : "▼"}</span> : null}
                  </button>
                </th>
                <th className="px-3 py-2 font-extrabold text-slate-700">Plataforma</th>
                <th className="px-3 py-2 font-extrabold text-slate-700">Comando</th>
                <th className="px-3 py-2 font-extrabold text-slate-700">Status</th>
                <th className="px-3 py-2 font-extrabold text-slate-700">
                  <button
                    type="button"
                    onClick={() => toggleSort("period")}
                    className="inline-flex items-center gap-2 hover:underline"
                    title="Ordenar por Período"
                  >
                    <span>Período</span>
                    {sortKey === "period" ? <span className="text-[10px]">{sortDir === "asc" ? "▲" : "▼"}</span> : null}
                  </button>
                </th>
                <th className="px-3 py-2 font-extrabold text-slate-700">Resumo</th>
                <th className="px-3 py-2 font-extrabold text-slate-700">Erros</th>
              </tr>
            </thead>
            <tbody>
              {sortedItems.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-slate-600" colSpan={7}>
                    {loading ? "Carregando..." : "Nenhum log encontrado."}
                  </td>
                </tr>
              ) : (
                sortedItems.map((r) => {
                  const processedAt = (() => {
                    const dt = new Date(r.processed_at);
                    if (Number.isNaN(dt.getTime())) return r.processed_at;
                    // dd/mm/yyyy hh:mm:ss
                    return dt.toLocaleString("pt-BR", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                      hour12: false,
                    });
                  })();

                  const filterDate = (() => {
                    const l = r.log || {};
                    const start = typeof l.startDate === "string" ? l.startDate.trim() : "";
                    const end = typeof l.endDate === "string" ? l.endDate.trim() : "";
                    const fmt = (raw: string) => {
                      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(raw));
                      if (!m) return String(raw);
                      return `${m[3]}/${m[2]}/${m[1]}`;
                    };
                    if (start && end) return `${fmt(start)} – ${fmt(end)}`;
                    if (start) return fmt(start);
                    if (end) return fmt(end);

                    const raw = r.date;
                    if (!raw) return "-";
                    // Aceita "YYYY-MM-DD" e também ISO datetime (ex.: "YYYY-MM-DDT00:00:00Z")
                    // Sempre formata como dd/mm/yyyy (sem hora) sem depender de timezone.
                    return fmt(String(raw));
                  })();

                  const summary = (() => {
                    const l = r.log || {};
                    const inserted = l.inserted ?? null;
                    const upserted = l.upserted ?? null;
                    const updated = l.updated ?? l.orders_updated ?? l.orders_updated_status ?? null;
                    const ordersProcessed = l.orders_processed ?? null;
                    const customersCreated = l.customers_created ?? null;
                    const orderDatesBackfilled = l.order_dates_backfilled ?? null;
                    const fetched = l.fetched ?? null;
                    const processed = l.processed ?? null;
                    return [
                      inserted !== null || upserted !== null
                        ? `inseridos=${Number(inserted ?? 0) || 0} · upsert=${Number(upserted ?? 0) || 0}`
                        : null,
                      updated !== null ? `atualizados=${Number(updated ?? 0) || 0}` : null,
                      orderDatesBackfilled !== null ? `order_date_preenchido=${Number(orderDatesBackfilled ?? 0) || 0}` : null,
                      ordersProcessed !== null ? `processados=${Number(ordersProcessed ?? 0) || 0}` : null,
                      customersCreated !== null ? `clientes_novos=${Number(customersCreated ?? 0) || 0}` : null,
                      fetched !== null ? `fetched=${Number(fetched ?? 0) || 0}` : null,
                      processed !== null ? `processed=${Number(processed ?? 0) || 0}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ");
                  })();

                  const statusLabel = (() => {
                    if (r.status === "PROCESSANDO") return "Processando...";
                    if (r.status === "ERRO") return "Erro";
                    return "Finalizado";
                  })();

                  const statusClass = (() => {
                    if (r.status === "PROCESSANDO") return "bg-amber-100 text-amber-900 border-amber-200";
                    if (r.status === "ERRO") return "bg-red-100 text-red-900 border-red-200";
                    return "bg-emerald-100 text-emerald-900 border-emerald-200";
                  })();

                  return (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-900 whitespace-nowrap">{processedAt}</td>
                      <td className="px-3 py-2 text-slate-900">
                        <div className="font-bold">{r.platform_name || "-"}</div>
                        <div className="text-xs text-slate-500">
                          {r.platform_slug ? r.platform_slug : "-"} {r.platform_id ? `(#${r.platform_id})` : ""}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-slate-900 font-bold">{r.command}</td>
                      <td className="px-3 py-2">
                        <span className={"inline-flex items-center rounded-full border px-2 py-1 text-xs font-extrabold " + statusClass}>
                          {statusLabel}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{filterDate}</td>
                      <td className="px-3 py-2 text-slate-700">
                        <button
                          type="button"
                          onClick={() => openDetail(r)}
                          className="text-left w-full hover:underline"
                          title="Ver log completo"
                        >
                          <span className="font-bold text-slate-900">{summary || "Ver log"}</span>
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        {r.errors ? (
                          <details className="text-red-700">
                            <summary className="cursor-pointer font-bold">Ver</summary>
                            <pre className="mt-2 max-w-[520px] whitespace-pre-wrap text-xs text-red-700">
                              {JSON.stringify(r.errors, null, 2)}
                            </pre>
                          </details>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <SlideOver
        open={detailOpen}
        title={detailRow ? `Log • ${detailRow.command} • #${detailRow.id}` : "Log"}
        onClose={() => setDetailOpen(false)}
      >
        {!detailRow ? (
          <div className="text-sm text-slate-600">Nenhum log selecionado.</div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              <div>
                <span className="font-extrabold">Processado em:</span> {detailRow.processed_at}
              </div>
              <div>
                <span className="font-extrabold">Plataforma:</span> {detailRow.platform_slug || "-"} {detailRow.platform_id ? `(#${detailRow.platform_id})` : ""}
              </div>
              <div>
                <span className="font-extrabold">Empresa:</span> {detailRow.company_name} (#{detailRow.company_id})
              </div>
              <div>
                <span className="font-extrabold">Data (filtro):</span> {detailRow.date || "-"}
              </div>
            </div>

            <div>
              <div className="text-sm font-extrabold text-slate-900 mb-2">Log (JSON)</div>
              <pre className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-900 whitespace-pre-wrap">
                {JSON.stringify(detailRow.log, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </SlideOver>

      <SlideOver open={runOpen} title="Forçar comando" onClose={() => setRunOpen(false)}>
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Plataforma</label>
              <select
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-primary/30"
                value={runPlatform}
                onChange={(e) => {
                  const next = e.target.value as any;
                  setRunPlatform(next);
                  // defaults de script por plataforma
                  if (next === "allpost") setRunScript("quotes");
                  else setRunScript("orders");
                }}
              >
                {platforms
                  .slice()
                  .sort((a, b) => String(a.name).localeCompare(String(b.name)))
                  .map((p) => (
                    <option key={p.id} value={p.slug}>
                      {p.name} ({p.slug})
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Script</label>
              <select
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-primary/30"
                value={runScript}
                onChange={(e) => setRunScript(e.target.value)}
              >
                {runPlatform === "tray" ? (
                  <>
                    <option value="orders">Pedidos</option>
                    <option value="products">Produtos</option>
                  </>
                ) : null}
                {runPlatform === "precode" ? (
                  <>
                    <option value="orders">Pedidos</option>
                    <option value="products">Produtos</option>
                  </>
                ) : null}
                {runPlatform === "allpost" ? (
                  <>
                    <option value="quotes">Orçamentos</option>
                    <option value="orders">Pedidos</option>
                  </>
                ) : null}
              </select>
            </div>

            {!(runScript === "products" || (runPlatform === "allpost" && runScript === "quotes")) ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Start date</label>
                  <DatePicker value={runStartDate} onChange={setRunStartDate} placeholder="YYYY-MM-DD" max={maxSelectableYmd} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">End date</label>
                  <DatePicker value={runEndDate} onChange={setRunEndDate} placeholder="YYYY-MM-DD" max={maxSelectableYmd} />
                </div>
              </div>
            ) : null}

            {runScript === "orders" && (runPlatform === "tray" || runPlatform === "precode") ? (
              <label className="flex items-center gap-2 text-sm text-slate-800">
                <input type="checkbox" checked={runOnlyInsert} onChange={(e) => setRunOnlyInsert(e.target.checked)} />
                Apenas insere o que não existir
              </label>
            ) : null}
          </div>

          {runError ? <div className="text-sm text-red-600">{runError}</div> : null}

          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setRunOpen(false)} disabled={runSubmitting}>
              Cancelar
            </Button>
            <Button type="button" variant="primary" onClick={submitRun} disabled={runSubmitting}>
              {runSubmitting ? "Iniciando..." : "Iniciar"}
            </Button>
          </div>

          <div className="text-xs text-slate-600">
            Este comando é assíncrono: o sistema retorna “script iniciado” e a execução continua em background.
          </div>
        </div>
      </SlideOver>
    </div>
  );
}

