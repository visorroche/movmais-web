import { useEffect, useMemo, useState } from "react";
import { SlideOver } from "@/components/ui/slideover";
import { buildApiUrl } from "@/lib/config";
import { getAuthHeaders } from "@/lib/auth";
import { useNavigate } from "react-router-dom";
import { formatTaxIdBR } from "@/lib/formatTaxId";

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

type Props = {
  open: boolean;
  orderId: number | null;
  onClose: () => void;
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
  const parseMoney = (v: string): number => {
    let s = String(v || "").trim();
    s = s.replace(/[^\d,.\-]/g, ""); // remove moeda/espacos
    const hasDot = s.includes(".");
    const hasComma = s.includes(",");
    if (hasDot && hasComma) {
      // decide pelo último separador como decimal
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
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n).replace(/\u00A0/g, " ");
};

export function OrderDetailSlideOver({ open, orderId, onClose }: Props) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrderDetail | null>(null);

  const title = useMemo(() => {
    if (!orderId) return "Detalhes do pedido";
    if (detail?.order_code) return `Pedido #${detail.order_code}`;
    return `Pedido #${orderId}`;
  }, [detail, orderId]);

  useEffect(() => {
    if (!open) return;
    if (!orderId) return;
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    setDetail(null);

    fetch(buildApiUrl(`/companies/me/orders/${orderId}`), { headers: { ...getAuthHeaders() }, signal: ac.signal })
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
        if (String(e?.name || "") === "AbortError") return;
        setError(String(e?.message || "Erro ao carregar detalhes"));
        setDetail(null);
      })
      .finally(() => setLoading(false));

    return () => ac.abort();
  }, [open, orderId]);

  return (
    <SlideOver open={open} title={title} onClose={onClose}>
      {!orderId ? <div className="text-slate-600">Selecione um pedido.</div> : null}
      {loading ? <div className="mt-3 text-slate-700">Carregando detalhes...</div> : null}
      {!loading && error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}

      {!loading && !error && detail ? (
        <div className="mt-3 space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-slate-500">Data do pedido</div>
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
                className="text-left font-semibold text-primary hover:underline"
                onClick={() => navigate(`/clientes?customerId=${detail.customer!.id}`)}
              >
                {detail.customer?.trade_name || detail.customer?.legal_name || "-"}
              </button>
            ) : (
              <div className="text-slate-900">{detail.customer?.trade_name || detail.customer?.legal_name || "-"}</div>
            )}
            {detail.customer?.email ? <div className="text-xs text-slate-600">Email: {detail.customer.email}</div> : null}
            {detail.customer?.tax_id ? <div className="text-xs text-slate-600">CPF: {formatTaxIdBR(detail.customer.tax_id)}</div> : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-slate-500">Marketplace</div>
              <div className="text-slate-900">{detail.marketplace_name || detail.channel || "-"}</div>
            </div>
            <div>
              <div className="text-slate-500">Pedido parceiro</div>
              <div className="text-slate-900 break-words">{detail.partner_order_id || "-"}</div>
            </div>
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-slate-500">Pagamento</div>
              <div className="text-slate-900">{formatDateBR(detail.payment_date)}</div>
            </div>
            <div>
              <div className="text-slate-500">Entrega</div>
              <div className="text-slate-900">{formatDateBR(detail.delivery_date)}</div>
              {detail.delivery_days !== null && detail.delivery_days !== undefined ? (
                <div className="text-xs text-slate-600">{detail.delivery_days} dias</div>
              ) : null}
            </div>
          </div>

          <div>
            <div className="text-slate-500">Endereço</div>
            <div className="text-slate-900">
              {[detail.delivery_address, detail.delivery_number].filter(Boolean).join(", ") || "-"}
            </div>
            <div className="text-xs text-slate-600">
              {[detail.delivery_neighborhood, detail.delivery_city, detail.delivery_state].filter(Boolean).join(" • ")}
            </div>
            <div className="text-xs text-slate-600">{detail.delivery_zip || ""}</div>
            {detail.delivery_complement ? <div className="text-xs text-slate-600">{detail.delivery_complement}</div> : null}
          </div>

          <div>
            <div className="text-slate-500">Itens</div>
            {detail.items?.length ? (
              <div className="mt-2 space-y-2">
                {detail.items.map((it) => (
                  <div key={it.id} className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                    <div className="font-semibold text-slate-900">{it.product?.name || "Produto"}</div>
                    <div className="mt-0.5 text-xs text-slate-700">
                      SKU: {it.product?.sku ?? it.sku ?? "-"} • Qtd: {it.quantity ?? "-"}
                    </div>
                    {(() => {
                      const meta = [it.product?.brand, it.product?.model, it.product?.category].filter(Boolean).join(" • ");
                      return meta ? <div className="mt-0.5 text-xs text-slate-700">{meta}</div> : null;
                    })()}
                    <div className="mt-2 text-xs text-slate-700">
                      <span className="text-slate-500">Valor:</span>{" "}
                      <span className="font-semibold text-slate-900">{formatBRL(it.unit_price)}</span>
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
            <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-slate-700">{JSON.stringify(detail.raw ?? {}, null, 2)}</pre>
          </details>
        </div>
      ) : null}
    </SlideOver>
  );
}

