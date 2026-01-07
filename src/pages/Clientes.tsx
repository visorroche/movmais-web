import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { buildApiUrl } from "@/lib/config";
import { getAuthHeaders } from "@/lib/auth";
import { Search } from "lucide-react";
import { SlideOver } from "@/components/ui/slideover";
import { useNavigate, useSearchParams } from "react-router-dom";

const Clientes = () => {
  type CustomerRow = {
    id: number;
    tax_id: string;
    legal_name: string | null;
    trade_name: string | null;
    email: string | null;
    status: string | null;
    external_id: string | null;
  };

  type CustomerDetail = {
    id: number;
    tax_id: string;
    state_registration: string | null;
    person_type: string | null;
    legal_name: string | null;
    trade_name: string | null;
    gender: string | null;
    birth_date: string | null;
    email: string | null;
    status: string | null;
    delivery_address: unknown;
    phones: unknown;
    external_id: string | null;
    company_id: number;
    raw: unknown;
  };

  type CustomerOrderCard = {
    id: number;
    order_code: number;
    order_date: string | null;
    current_status: string | null;
    total_amount: string | null;
    marketplace_name: string | null;
  };

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
    const n =
      typeof value === "number"
        ? value
        : Number(String(value).replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(n)) return String(value);
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
      .format(n)
      .replace(/\u00A0/g, " ");
  };

  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [tab, setTab] = useState<"cadastro" | "pedidos">("cadastro");
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [orders, setOrders] = useState<CustomerOrderCard[]>([]);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const selectedRow = useMemo(() => rows.find((r) => r.id === selectedId) || null, [rows, selectedId]);

  // abre o drawer automaticamente quando vem de outra tela (ex.: /clientes?customerId=123)
  useEffect(() => {
    const raw = searchParams.get("customerId");
    if (!raw) return;
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) return;
    setSelectedId(id);
  }, [searchParams]);

  useEffect(() => {
    setTab("cadastro");
    setOrders([]);
    setOrdersError(null);
  }, [selectedId]);

  useEffect(() => {
    const t = setTimeout(() => {
      const ac = new AbortController();
      setLoading(true);
      setError(null);
      fetch(buildApiUrl(`/companies/me/customers?q=${encodeURIComponent(q.trim())}&limit=100`), {
        headers: { ...getAuthHeaders() },
        signal: ac.signal,
      })
        .then(async (res) => {
          if (res.status === 401) throw new Error("Não autenticado");
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error((data as any)?.message || "Erro ao carregar clientes");
          }
          return res.json() as Promise<CustomerRow[]>;
        })
        .then((data) => {
          setRows(Array.isArray(data) ? data : []);
          // se o selecionado sumiu do filtro, limpa
          if (selectedId && !data?.some((r) => r.id === selectedId)) {
            setSelectedId(null);
            setDetail(null);
          }
        })
        .catch((e: any) => {
          setRows([]);
          setError(String(e?.message || "Erro ao carregar clientes"));
        })
        .finally(() => setLoading(false));

      return () => ac.abort();
    }, 250);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => {
    if (!selectedId) return;
    const ac = new AbortController();
    setDetailLoading(true);
    setDetailError(null);
    fetch(buildApiUrl(`/companies/me/customers/${selectedId}`), { headers: { ...getAuthHeaders() }, signal: ac.signal })
      .then(async (res) => {
        if (res.status === 401) throw new Error("Não autenticado");
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as any)?.message || "Erro ao carregar detalhes");
        }
        return res.json() as Promise<CustomerDetail>;
      })
      .then((d) => setDetail(d))
      .catch((e: any) => {
        setDetail(null);
        setDetailError(String(e?.message || "Erro ao carregar detalhes"));
      })
      .finally(() => setDetailLoading(false));

    return () => ac.abort();
  }, [selectedId]);

  const closeDetail = () => {
    setSelectedId(null);
    setDetail(null);
    setDetailError(null);
    setOrders([]);
    setOrdersError(null);
    if (searchParams.get("customerId")) navigate("/clientes", { replace: true });
  };

  useEffect(() => {
    if (tab !== "pedidos") return;
    if (!selectedId) return;
    const ac = new AbortController();
    setOrdersLoading(true);
    setOrdersError(null);
    fetch(buildApiUrl(`/companies/me/customers/${selectedId}/orders?limit=200`), {
      headers: { ...getAuthHeaders() },
      signal: ac.signal,
    })
      .then(async (res) => {
        if (res.status === 401) throw new Error("Não autenticado");
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as any)?.message || "Erro ao carregar pedidos do cliente");
        }
        return res.json() as Promise<CustomerOrderCard[]>;
      })
      .then((data) => setOrders(Array.isArray(data) ? data : []))
      .catch((e: any) => {
        setOrders([]);
        setOrdersError(String(e?.message || "Erro ao carregar pedidos do cliente"));
      })
      .finally(() => setOrdersLoading(false));

    return () => ac.abort();
  }, [tab, selectedId]);

  return (
    <div className="w-full">
      <h1 className="text-2xl font-extrabold text-slate-900">Clientes</h1>

      <Card className="mt-4 w-full border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nome, email, CPF/CNPJ, external_id..."
              className="pl-9 border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-primary/30"
            />
          </div>
        </div>

        {loading ? <div className="mt-4 text-slate-700">Carregando...</div> : null}
        {!loading && error ? <div className="mt-4 text-sm text-red-600">{error}</div> : null}

        {!loading && !error ? (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-600">
                  <th className="py-2 pr-4">Nome</th>
                  <th className="py-2 pr-4">Documento</th>
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-0">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-slate-600">
                      Nenhum cliente encontrado.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const name = r.trade_name || r.legal_name || "(sem nome)";
                    return (
                      <tr
                        key={r.id}
                        className="border-t border-slate-200 cursor-pointer hover:bg-slate-50"
                        onClick={() => setSelectedId(r.id)}
                      >
                        <td className="py-3 pr-4 font-semibold text-slate-900">{name}</td>
                        <td className="py-3 pr-4 text-slate-700">{r.tax_id}</td>
                        <td className="py-3 pr-4 text-slate-700">{r.email || "-"}</td>
                        <td className="py-3 pr-0 text-slate-700">{r.status || "-"}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      <SlideOver
        open={!!selectedId}
        title={
          selectedRow
            ? `${selectedRow.trade_name || selectedRow.legal_name || selectedRow.tax_id}`
            : detail
              ? `${detail.trade_name || detail.legal_name || detail.tax_id}`
              : "Detalhes"
        }
        onClose={closeDetail}
      >
        <div className="mb-4 flex gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => setTab("cadastro")}
            className={
              "flex-1 rounded-lg px-3 py-2 text-sm font-semibold " +
              (tab === "cadastro"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900")
            }
          >
            Cadastro
          </button>
          <button
            type="button"
            onClick={() => setTab("pedidos")}
            className={
              "flex-1 rounded-lg px-3 py-2 text-sm font-semibold " +
              (tab === "pedidos"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900")
            }
          >
            Pedidos
          </button>
        </div>

        {!selectedRow ? <div className="text-slate-600">Selecione um cliente na lista.</div> : null}
        {detailLoading ? <div className="mt-3 text-slate-700">Carregando detalhes...</div> : null}
        {!detailLoading && detailError ? <div className="mt-3 text-sm text-red-600">{detailError}</div> : null}

        {!detailLoading && detail && tab === "cadastro" ? (
          <div className="mt-3 space-y-3 text-sm">
            <div>
              <div className="text-slate-500">Nome</div>
              <div className="font-semibold text-slate-900">{detail.trade_name || detail.legal_name || "-"}</div>
            </div>
            <div>
              <div className="text-slate-500">CPF/CNPJ</div>
              <div className="text-slate-900">{detail.tax_id}</div>
            </div>
            <div>
              <div className="text-slate-500">Email</div>
              <div className="text-slate-900">{detail.email || "-"}</div>
            </div>
            <div>
              <div className="text-slate-500">Status</div>
              <div className="text-slate-900">{detail.status || "-"}</div>
            </div>
            <div>
              <div className="text-slate-500">External ID</div>
              <div className="text-slate-900">{detail.external_id || "-"}</div>
            </div>

            <details className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <summary className="cursor-pointer font-semibold text-slate-800">Dados brutos</summary>
              <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-slate-700">
                {JSON.stringify(detail.raw ?? {}, null, 2)}
              </pre>
            </details>
          </div>
        ) : null}

        {tab === "pedidos" ? (
          <div>
            {ordersLoading ? <div className="text-slate-700">Carregando pedidos...</div> : null}
            {!ordersLoading && ordersError ? <div className="text-sm text-red-600">{ordersError}</div> : null}
            {!ordersLoading && !ordersError ? (
              <div className="space-y-2">
                {orders.length === 0 ? (
                  <div className="text-slate-600">Nenhum pedido encontrado para este cliente.</div>
                ) : (
                  orders.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => navigate(`/pedidos?orderId=${o.id}`)}
                      className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left hover:bg-slate-50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-extrabold text-slate-900">Pedido #{o.order_code}</div>
                          <div className="mt-1 text-xs text-slate-700">
                            {formatDateBR(o.order_date)} • {o.current_status || "-"}
                          </div>
                          {o.marketplace_name ? (
                            <div className="mt-1 text-xs text-slate-600 truncate">{o.marketplace_name}</div>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-xs text-slate-500">Total</div>
                          <div className="font-semibold text-slate-900">{formatBRL(o.total_amount)}</div>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </SlideOver>
    </div>
  );
};

export default Clientes;


