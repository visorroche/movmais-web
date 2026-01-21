import { useEffect, useMemo, useState } from "react";
import { SlideOver } from "@/components/ui/slideover";
import { buildApiUrl } from "@/lib/config";
import { getAuthHeaders } from "@/lib/auth";
import { ProductThumb } from "./ProductThumb";

type ProductDetail = {
  id: number;
  company_id: number;
  sku: number;
  ecommerce_id: number | null;
  ean: string | null;
  slug: string | null;
  name: string | null;
  store_reference: string | null;
  external_reference: string | null;
  brand_id: number | null;
  brand: string | null;
  model: string | null;
  weight: string | null;
  width: string | null;
  height: string | null;
  length_cm: string | null;
  ncm: string | null;
  category: string | null;
  category_id: number | null;
  subcategory: string | null;
  final_category: string | null;
  photo: string | null;
  url: string | null;
  raw: unknown;
};

type Props = {
  open: boolean;
  productId: number | null;
  onClose: () => void;
};

export function ProductDetailSlideOver({ open, productId, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProductDetail | null>(null);

  const title = useMemo(() => {
    if (!productId) return "Detalhes do produto";
    if (detail?.name) return `Produto: ${detail.name}`;
    if (detail?.sku) return `Produto: ${detail.sku}`;
    return `Produto: #${productId}`;
  }, [detail, productId]);

  useEffect(() => {
    if (!open) return;
    if (!productId) return;
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    setDetail(null);

    fetch(buildApiUrl(`/companies/me/products/${productId}`), { headers: { ...getAuthHeaders() }, signal: ac.signal })
      .then(async (res) => {
        if (res.status === 401) throw new Error("Não autenticado");
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as any)?.message || "Erro ao carregar detalhes");
        }
        return res.json() as Promise<ProductDetail>;
      })
      .then((d) => setDetail(d))
      .catch((e: any) => {
        if (String(e?.name || "") === "AbortError") return;
        setError(String(e?.message || "Erro ao carregar detalhes"));
        setDetail(null);
      })
      .finally(() => setLoading(false));

    return () => ac.abort();
  }, [open, productId]);

  return (
    <SlideOver open={open} title={title} onClose={onClose}>
      {!productId ? <div className="text-slate-600">Selecione um produto.</div> : null}
      {loading ? <div className="mt-3 text-slate-700">Carregando detalhes...</div> : null}
      {!loading && error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}

      {!loading && !error && detail ? (
        <div className="mt-3 space-y-4 text-sm">
          <div className="w-full">
            {detail.photo ? (
              <img
                src={detail.photo}
                alt={detail.name || String(detail.sku)}
                className="w-full rounded-xl border border-slate-200 bg-white object-contain"
                style={{ maxHeight: 320 }}
                loading="lazy"
              />
            ) : (
              <div className="w-full rounded-xl border border-slate-200 bg-slate-50 p-6">
                <div className="flex justify-center">
                  <ProductThumb name={detail.name || String(detail.sku)} photo={null} size={88} onClick={() => undefined} />
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="text-slate-500">Nome</div>
            <div className="font-semibold text-slate-900 break-words">{detail.name || "-"}</div>
            {detail.url ? (
              <a href={detail.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-semibold text-primary hover:underline">
                Abrir produto
              </a>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-slate-500">SKU</div>
              <div className="text-slate-900">{detail.sku}</div>
            </div>
            <div>
              <div className="text-slate-500">EAN</div>
              <div className="text-slate-900">{detail.ean || "-"}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-slate-500">Marca</div>
              <div className="text-slate-900">{detail.brand || "-"}</div>
            </div>
            <div>
              <div className="text-slate-500">Modelo</div>
              <div className="text-slate-900">{detail.model || "-"}</div>
            </div>
          </div>

          <div>
            <div className="text-slate-500">Categoria</div>
            <div className="text-slate-900">{detail.category || "-"}</div>
          </div>

          <div>
            <div className="text-slate-500">Subcategoria</div>
            <div className="text-slate-900">{detail.subcategory || "-"}</div>
          </div>

          <div>
            <div className="text-slate-500">Categoria final</div>
            <div className="text-slate-900">{detail.final_category || "-"}</div>
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

