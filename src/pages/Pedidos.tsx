import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { buildApiUrl } from "@/lib/config";
import { getAuthHeaders } from "@/lib/auth";
import { Search } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { OrderDetailSlideOver } from "@/components/orders/OrderDetailSlideOver";
import { marketplaceColorOrFallback, marketplaceTextColor } from "@/lib/marketplaceColors";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { formatTaxIdBR } from "@/lib/formatTaxId";

const Pedidos = () => {
  const formatDateBR = (value: string | null): string => {
    if (!value) return "-";
    // date-only (YYYY-MM-DD)
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split("-").map(Number);
      if (!y || !m || !d) return value;
      return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
    }
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return value;
    const dd = String(dt.getDate()).padStart(2, "0");
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const yyyy = dt.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  const formatBRL = (value: string | number | null): string => {
    if (value === null || value === undefined || value === "") return "-";
    const parseMoney = (v: string): number => {
      let s = String(v || "").trim();
      s = s.replace(/[^\d,.\-]/g, "");
      const hasDot = s.includes(".");
      const hasComma = s.includes(",");
      if (hasDot && hasComma) {
        if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
          s = s.replace(/\./g, "").replace(",", ".");
        } else {
          s = s.replace(/,/g, "");
        }
      } else if (hasComma) {
        s = s.replace(/\./g, "").replace(",", ".");
      }
      const n = Number(s);
      return Number.isFinite(n) ? n : NaN;
    };
    const n = typeof value === "number" ? value : parseMoney(String(value));
    if (!Number.isFinite(n)) return String(value);
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
      .format(n)
      .replace(/\u00A0/g, " ");
  };

  type OrderRow = {
    id: number;
    order_code: number;
    order_date: string | null;
    current_status: string | null;
    total_amount: string | null;
    marketplace_name: string | null;
    channel: string | null;
    customer: { id: number; name: string | null; email: string | null; tax_id: string | null } | null;
  };

  // Busca por ação: texto + data (opcional). Sem autocomplete.
  const [qDraft, setQDraft] = useState<string>("");
  const [q, setQ] = useState<string>("");
  const [dayDraft, setDayDraft] = useState<string>("");
  const [day, setDay] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(false);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const selectedRow = useMemo(() => rows.find((r) => r.id === selectedId) || null, [rows, selectedId]);

  const isIsoYmd = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || "").trim());
  const runSearch = () => {
    const nextQ = String(qDraft || "").trim();
    const nextDay = String(dayDraft || "").trim();
    setQ(nextQ);
    setDay(isIsoYmd(nextDay) ? nextDay : "");
    setPage(1);
  };

  // abre o drawer automaticamente quando vem de outra tela (ex.: /pedidos?orderId=123)
  useEffect(() => {
    const raw = searchParams.get("orderId");
    if (!raw) return;
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) return;
    setSelectedId(id);
  }, [searchParams]);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams();
    qs.set("limit", "100");
    qs.set("page", String(page));
    if (q.trim()) qs.set("q", q.trim());
    if (day && isIsoYmd(day)) qs.set("day", day);

    fetch(buildApiUrl(`/companies/me/orders?${qs.toString()}`), {
      headers: { ...getAuthHeaders() },
      signal: ac.signal,
    })
      .then(async (res) => {
        if (res.status === 401) throw new Error("Não autenticado");
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as any)?.message || "Erro ao carregar pedidos");
        }
        return res.json() as Promise<{ page: number; limit: number; hasMore: boolean; rows: OrderRow[] }>;
      })
      .then((data) => {
        const list = Array.isArray((data as any)?.rows) ? (data as any).rows : [];
        setRows(list);
        setHasMore(Boolean((data as any)?.hasMore));
        // se o selecionado sumiu do filtro, limpa (mas não quando é deep-link via ?orderId)
        if (selectedId && !list?.some((r: any) => r.id === selectedId) && !searchParams.get("orderId")) {
          setSelectedId(null);
        }
      })
      .catch((e: any) => {
        if (String(e?.name || "") === "AbortError") return;
        setRows([]);
        setHasMore(false);
        setError(String(e?.message || "Erro ao carregar pedidos"));
      })
      .finally(() => setLoading(false));

    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, day, page]);

  const closeDetail = () => {
    setSelectedId(null);
    if (searchParams.get("orderId")) navigate("/pedidos", { replace: true });
  };

  return (
    <div className="w-full">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-extrabold text-slate-900">Pedidos</h1>
        <button
          type="button"
          onClick={() => navigate("/dashboard/operacao")}
          className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-extrabold text-slate-800 hover:bg-slate-50"
        >
          Ver Kamban Operacional
        </button>
      </div>

      <Card className="mt-4 w-full border-slate-200 bg-white p-4">
        <div className="flex items-center gap-3 flex-nowrap">
          <div className="relative min-w-0 flex-1 max-w-[680px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <Input
              value={qDraft}
              onChange={(e) => setQDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  runSearch();
                }
              }}
              placeholder="Buscar por número, status, marketplace, cliente..."
              className="pl-9 border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-primary/30"
            />
          </div>
          <div className="w-full sm:w-[280px] shrink-0">
            <DatePicker label="Data" value={dayDraft} onChange={setDayDraft} placeholder="Selecionar data (opcional)..." disabled={loading} />
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0 rounded-xl"
            onClick={runSearch}
            disabled={loading}
            title="Executar busca"
          >
            <Search className="h-4 w-4" />
            <span className="ml-2">Buscar</span>
          </Button>
        </div>

        {loading ? <div className="mt-4 text-slate-700">Carregando...</div> : null}
        {!loading && error ? <div className="mt-4 text-sm text-red-600">{error}</div> : null}

        {!loading && !error ? (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-600">
                  <th className="py-2 pr-4">Pedido</th>
                  <th className="py-2 pr-4">Canal</th>
                  <th className="py-2 pr-4">Data</th>
                  <th className="py-2 pr-4">Cliente</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-0 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-slate-600">
                      Nenhum pedido encontrado.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const name = String(r.customer?.name ?? "").trim();
                    const taxId = String(r.customer?.tax_id ?? "").trim();
                    const primary = name || "-";
                    const channelLabel = r.marketplace_name || r.channel || "-";
                    return (
                      <tr
                        key={r.id}
                        className="border-t border-slate-200 cursor-pointer hover:bg-slate-50"
                        onClick={() => setSelectedId(r.id)}
                      >
                        <td className="py-3 pr-4 font-semibold text-slate-900">#{r.order_code}</td>
                        <td className="py-3 pr-4">
                          {channelLabel === "-" ? (
                            <span className="text-slate-500">-</span>
                          ) : (
                            <span
                              className="inline-flex max-w-[220px] truncate rounded-full px-2 py-0.5 text-[11px] font-extrabold"
                              style={{
                                background: marketplaceColorOrFallback(channelLabel),
                                color: marketplaceTextColor(channelLabel),
                              }}
                              title={channelLabel}
                            >
                              {channelLabel}
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-slate-700">{formatDateBR(r.order_date)}</td>
                        <td className="py-3 pr-4 text-slate-700">
                          {r.customer?.id ? (
                            <button
                              type="button"
                              className="text-primary hover:underline"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                navigate(`/clientes?customerId=${r.customer!.id}`);
                              }}
                            >
                              {primary}
                            </button>
                          ) : (
                            primary
                          )}
                          {taxId ? <div className="text-xs text-slate-600">CPF: {formatTaxIdBR(taxId)}</div> : null}
                        </td>
                        <td className="py-3 pr-4 text-slate-700">{r.current_status || "-"}</td>
                        <td className="py-3 pr-0 text-right text-slate-900">{formatBRL(r.total_amount)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                type="button"
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-extrabold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </button>
              <div className="text-sm font-semibold text-slate-700">Página {page}</div>
              <button
                type="button"
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-extrabold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!hasMore || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </button>
            </div>
          </div>
        ) : null}
      </Card>

      <OrderDetailSlideOver open={!!selectedId} orderId={selectedId} onClose={closeDetail} />
    </div>
  );
};

export default Pedidos;


