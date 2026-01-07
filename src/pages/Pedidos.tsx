import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { buildApiUrl } from "@/lib/config";
import { getAuthHeaders } from "@/lib/auth";
import { Search } from "lucide-react";
import { SlideOver } from "@/components/ui/slideover";
import { useNavigate, useSearchParams } from "react-router-dom";

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
    const n =
      typeof value === "number"
        ? value
        : Number(String(value).replace(/\./g, "").replace(",", "."));
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
    customer: { id: number; name: string | null; email: string | null; tax_id: string | null } | null;
  };

  type OrderItem = {
    id: number;
    product_id: number | null;
    product?: {
      id: number;
      name: string | null;
      sku: number | null;
      brand: string | null;
      model: string | null;
      category: string | null;
    } | null;
    sku: number | null;
    quantity: number | null;
    unit_price: string | null;
    net_unit_price: string | null;
    item_type: string | null;
    service_ref_sku: string | null;
  };

  type OrderDetail = {
    id: number;
    order_code: number;
    order_date: string | null;
    partner_order_id: string | null;
    current_status: string | null;
    current_status_code: string | null;
    total_amount: string | null;
    shipping_amount: string | null;
    marketplace_name: string | null;
    channel: string | null;
    payment_date: string | null;
    delivery_date: string | null;
    delivery_days: number | null;
    delivery_city: string | null;
    delivery_state: string | null;
    delivery_zip: string | null;
    delivery_address: string | null;
    delivery_number: string | null;
    delivery_neighborhood: string | null;
    delivery_complement: string | null;
    customer: { id: number; tax_id: string; legal_name: string | null; trade_name: string | null; email: string | null } | null;
    platform: { id: number; name: string; slug: string; type: string } | null;
    items: OrderItem[];
    raw: unknown;
  };

  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrderDetail | null>(null);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const selectedRow = useMemo(() => rows.find((r) => r.id === selectedId) || null, [rows, selectedId]);

  // abre o drawer automaticamente quando vem de outra tela (ex.: /pedidos?orderId=123)
  useEffect(() => {
    const raw = searchParams.get("orderId");
    if (!raw) return;
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) return;
    setSelectedId(id);
  }, [searchParams]);

  useEffect(() => {
    const t = setTimeout(() => {
      const ac = new AbortController();
      setLoading(true);
      setError(null);
      fetch(buildApiUrl(`/companies/me/orders?q=${encodeURIComponent(q.trim())}&limit=100`), {
        headers: { ...getAuthHeaders() },
        signal: ac.signal,
      })
        .then(async (res) => {
          if (res.status === 401) throw new Error("Não autenticado");
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error((data as any)?.message || "Erro ao carregar pedidos");
          }
          return res.json() as Promise<OrderRow[]>;
        })
        .then((data) => {
          setRows(Array.isArray(data) ? data : []);
          // se o selecionado sumiu do filtro, limpa (mas não quando é deep-link via ?orderId)
          if (selectedId && !data?.some((r) => r.id === selectedId) && !searchParams.get("orderId")) {
            setSelectedId(null);
            setDetail(null);
          }
        })
        .catch((e: any) => {
          setRows([]);
          setError(String(e?.message || "Erro ao carregar pedidos"));
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
    fetch(buildApiUrl(`/companies/me/orders/${selectedId}`), { headers: { ...getAuthHeaders() }, signal: ac.signal })
      .then(async (res) => {
        if (res.status === 401) throw new Error("Não autenticado");
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as any)?.message || "Erro ao carregar detalhes");
        }
        return res.json() as Promise<OrderDetail>;
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
    if (searchParams.get("orderId")) navigate("/pedidos", { replace: true });
  };

  return (
    <div className="w-full">
      <h1 className="text-2xl font-extrabold text-slate-900">Pedidos</h1>

      <Card className="mt-4 w-full border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por número, status, marketplace, cliente..."
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
                  <th className="py-2 pr-4">Pedido</th>
                  <th className="py-2 pr-4">Data</th>
                  <th className="py-2 pr-4">Cliente</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-0 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-slate-600">
                      Nenhum pedido encontrado.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const customerName = r.customer?.name || "-";
                    return (
                      <tr
                        key={r.id}
                        className="border-t border-slate-200 cursor-pointer hover:bg-slate-50"
                        onClick={() => setSelectedId(r.id)}
                      >
                        <td className="py-3 pr-4 font-semibold text-slate-900">#{r.order_code}</td>
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
                              {customerName}
                            </button>
                          ) : (
                            customerName
                          )}
                        </td>
                        <td className="py-3 pr-4 text-slate-700">{r.current_status || "-"}</td>
                        <td className="py-3 pr-0 text-right text-slate-900">{formatBRL(r.total_amount)}</td>
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
            ? `Pedido #${selectedRow.order_code}`
            : detail
              ? `Pedido #${detail.order_code}`
              : "Detalhes"
        }
        onClose={closeDetail}
      >
        {!selectedRow ? <div className="text-slate-600">Selecione um pedido na lista.</div> : null}
        {detailLoading ? <div className="mt-3 text-slate-700">Carregando detalhes...</div> : null}
        {!detailLoading && detailError ? <div className="mt-3 text-sm text-red-600">{detailError}</div> : null}

        {!detailLoading && detail ? (
          <div className="mt-3 space-y-3 text-sm">
            <div>
              <div className="text-slate-500">Pedido</div>
              <div className="font-semibold text-slate-900">#{detail.order_code}</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-slate-500">Data</div>
                <div className="text-slate-900">{formatDateBR(detail.order_date)}</div>
              </div>
              <div>
                <div className="text-slate-500">Status</div>
                <div className="text-slate-900">{detail.current_status || "-"}</div>
              </div>
            </div>
            <div>
              <div className="text-slate-500">Cliente</div>
              {detail.customer?.id ? (
                <button
                  type="button"
                  className="text-left text-primary hover:underline"
                  onClick={() => navigate(`/clientes?customerId=${detail.customer!.id}`)}
                >
                  {detail.customer?.trade_name || detail.customer?.legal_name || "-"}
                </button>
              ) : (
                <div className="text-slate-900">{detail.customer?.trade_name || detail.customer?.legal_name || "-"}</div>
              )}
              <div className="text-xs text-slate-600">{detail.customer?.email || ""}</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-slate-500">Total</div>
                <div className="text-slate-900">{formatBRL(detail.total_amount)}</div>
              </div>
              <div>
                <div className="text-slate-500">Frete</div>
                <div className="text-slate-900">{formatBRL(detail.shipping_amount)}</div>
              </div>
            </div>

            <div>
              <div className="text-slate-500">Itens</div>
              {detail.items?.length ? (
                <div className="mt-2 space-y-2">
                  {detail.items.map((it) => (
                    <div key={it.id} className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900">
                          {it.product?.name || "Produto"}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-700">
                          SKU: {it.product?.sku ?? it.sku ?? "-"} • ID: {it.product_id ?? "-"}
                        </div>
                        {(() => {
                          const meta = [it.product?.brand, it.product?.model, it.product?.category]
                            .filter((v) => !!v)
                            .join(" • ");
                          return meta ? <div className="mt-0.5 text-xs text-slate-700">{meta}</div> : null;
                        })()}
                        <div className="mt-2 text-xs text-slate-700">
                          <span className="text-slate-500">Valor:</span>{" "}
                          <span className="font-semibold text-slate-900">{formatBRL(it.unit_price)}</span>
                          <span className="mx-2 text-slate-300">•</span>
                          <span className="text-slate-500">Qtd:</span> {it.quantity ?? "-"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-slate-600">Nenhum item.</div>
              )}
            </div>

            <details className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <summary className="cursor-pointer font-semibold text-slate-800">Dados brutos</summary>
              <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-slate-700">
                {JSON.stringify(detail.raw ?? {}, null, 2)}
              </pre>
            </details>
          </div>
        ) : null}
      </SlideOver>
    </div>
  );
};

export default Pedidos;


