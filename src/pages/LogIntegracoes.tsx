import { useEffect, useMemo, useState } from "react";
import { buildApiUrl } from "@/lib/config";
import { getAuthHeaders } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateRangePicker, type DateRangeValue } from "@/components/ui/date-range-picker";
import { DatePicker } from "@/components/ui/date-picker";
import { SlideOver } from "@/components/ui/slideover";

type ApiLogRow = {
  id: number;
  processed_at: string;
  date: string | null;
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

export default function LogIntegracoes() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse>({ total: 0, items: [] });

  const [platforms, setPlatforms] = useState<Platform[]>([]);

  const [command, setCommand] = useState<string>("");
  const [platformId, setPlatformId] = useState<string>("");
  const [periodoRegistro, setPeriodoRegistro] = useState<DateRangeValue>({ start: "", end: "" });
  const [processamentoDate, setProcessamentoDate] = useState<string>(() => todayYmd());

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<ApiLogRow | null>(null);

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
    const processedStart = !hasPeriodo && processamentoDate ? `${processamentoDate}T00:00:00Z` : null;
    const processedEnd = !hasPeriodo && processamentoDate ? `${processamentoDate}T23:59:59Z` : null;

    return toQuery({
      command: command || null,
      platform_id: platformId || null,
      "start-date": hasPeriodo ? start : null,
      "end-date": hasPeriodo ? end : null,
      "processed-start": processedStart,
      "processed-end": processedEnd,
      limit: 50,
      offset: 0,
    });
  }, [command, platformId, periodoRegistro.end, periodoRegistro.start, processamentoDate]);

  const load = async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(buildApiUrl(`/companies/me/integration-logs${query}`), { headers: { ...getAuthHeaders() }, signal });
      if (res.status === 401) throw new Error("Não autenticado");
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
    // carrega plataformas para o select (mesmo endpoint usado nas configurações)
    fetch(buildApiUrl("/platforms"), { headers: { ...getAuthHeaders() }, signal: ac.signal })
      .then(async (res) => {
        if (!res.ok) return [];
        const json = (await res.json()) as unknown;
        return Array.isArray(json) ? (json as Platform[]) : [];
      })
      .then((list) => setPlatforms(Array.isArray(list) ? list : []))
      .catch(() => setPlatforms([]));
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-2xl font-extrabold text-slate-900">Log de Integrações</div>
          <div className="text-sm text-slate-600">Execuções dos comandos (Pedidos, Cotações, Produtos) por empresa/plataforma.</div>
        </div>
      </div>

      <Card className="border-slate-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Comando</label>
            <select
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-primary/30"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
            >
              <option value="">Todos</option>
              <option value="Pedidos">Pedidos</option>
              <option value="Cotações">Cotações</option>
              <option value="Produtos">Produtos</option>
            </select>
          </div>
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
          <div className="md:col-span-2">
            <label className="block text-sm font-semibold text-slate-700 mb-1">Período do Registro</label>
            <DateRangePicker value={periodoRegistro} onChange={setPeriodoRegistro} placeholder="Selecionar período..." />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Data do Processamento</label>
            <DatePicker value={processamentoDate} onChange={setProcessamentoDate} placeholder="Selecionar data..." />
          </div>
          <div className="flex items-end">
            <Button type="button" variant="primary" onClick={() => load()} disabled={loading} className="w-full">
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
                <th className="px-3 py-2 font-extrabold text-slate-700">Processado em</th>
                <th className="px-3 py-2 font-extrabold text-slate-700">Plataforma</th>
                <th className="px-3 py-2 font-extrabold text-slate-700">Comando</th>
                <th className="px-3 py-2 font-extrabold text-slate-700">Data (filtro)</th>
                <th className="px-3 py-2 font-extrabold text-slate-700">Resumo</th>
                <th className="px-3 py-2 font-extrabold text-slate-700">Erros</th>
              </tr>
            </thead>
            <tbody>
              {data.items.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-slate-600" colSpan={6}>
                    {loading ? "Carregando..." : "Nenhum log encontrado."}
                  </td>
                </tr>
              ) : (
                data.items.map((r) => {
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
                    const raw = r.date;
                    if (!raw) return "-";
                    // assume YYYY-MM-DD
                    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
                    if (!m) return raw;
                    return `${m[3]}/${m[2]}/${m[1]}`;
                  })();

                  const summary = (() => {
                    const l = r.log || {};
                    const inserted = l.inserted ?? l.upserted ?? l.orders_processed ?? null;
                    const fetched = l.fetched ?? l.processed ?? null;
                    return [
                      inserted !== null ? `insert/upsert=${inserted}` : null,
                      fetched !== null ? `fetched/processed=${fetched}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ");
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
    </div>
  );
}

