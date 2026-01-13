import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { buildApiUrl } from "@/lib/config";
import { getAuthHeaders } from "@/lib/auth";
import { Search } from "lucide-react";
import { SlideOver } from "@/components/ui/slideover";

const Produtos = () => {
  type ProductRow = {
    id: number;
    sku: number;
    name: string | null;
    ean: string | null;
    brand: string | null;
    category: string | null;
    model: string | null;
  };

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

  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProductDetail | null>(null);

  const selectedRow = useMemo(() => rows.find((r) => r.id === selectedId) || null, [rows, selectedId]);

  useEffect(() => {
    const t = setTimeout(() => {
      const ac = new AbortController();
      setLoading(true);
      setError(null);
      fetch(buildApiUrl(`/companies/me/products?q=${encodeURIComponent(q.trim())}&limit=100`), {
        headers: { ...getAuthHeaders() },
        signal: ac.signal,
      })
        .then(async (res) => {
          if (res.status === 401) throw new Error("Não autenticado");
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error((data as any)?.message || "Erro ao carregar produtos");
          }
          return res.json() as Promise<ProductRow[]>;
        })
        .then((data) => {
          setRows(Array.isArray(data) ? data : []);
          if (selectedId && !data?.some((r) => r.id === selectedId)) {
            setSelectedId(null);
            setDetail(null);
          }
        })
        .catch((e: any) => {
          setRows([]);
          setError(String(e?.message || "Erro ao carregar produtos"));
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
    fetch(buildApiUrl(`/companies/me/products/${selectedId}`), { headers: { ...getAuthHeaders() }, signal: ac.signal })
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
  };

  return (
    <div className="w-full">
      <h1 className="text-2xl font-extrabold text-slate-900">Produtos</h1>

      <Card className="mt-4 w-full border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por SKU, nome, EAN, referência..."
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
                  <th className="py-2 pr-4">SKU</th>
                  <th className="py-2 pr-4">Nome</th>
                  <th className="py-2 pr-4">EAN</th>
                  <th className="py-2 pr-4">Marca</th>
                  <th className="py-2 pr-4">Categoria</th>
                  <th className="py-2 pr-0">Modelo</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-slate-600">
                      Nenhum produto encontrado.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-t border-slate-200 cursor-pointer hover:bg-slate-50"
                      onClick={() => setSelectedId(r.id)}
                    >
                      <td className="py-3 pr-4 font-semibold text-slate-900">{r.sku}</td>
                      <td className="py-3 pr-4 text-slate-700">{r.name || "-"}</td>
                      <td className="py-3 pr-4 text-slate-700">{r.ean || "-"}</td>
                      <td className="py-3 pr-4 text-slate-700">{r.brand || "-"}</td>
                      <td className="py-3 pr-4 text-slate-700">{r.category || "-"}</td>
                      <td className="py-3 pr-0 text-slate-700">{r.model || "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      <SlideOver
        open={!!selectedId}
        title={selectedRow ? `Produto: ${selectedRow.name || selectedRow.sku}` : "Detalhes"}
        onClose={closeDetail}
      >
        {!selectedRow ? <div className="text-slate-600">Selecione um produto na lista.</div> : null}
        {detailLoading ? <div className="mt-3 text-slate-700">Carregando detalhes...</div> : null}
        {!detailLoading && detailError ? <div className="mt-3 text-sm text-red-600">{detailError}</div> : null}

        {!detailLoading && detail ? (
          <div className="mt-3 space-y-3 text-sm">
            <div>
              <div className="text-slate-500">Nome</div>
              <div className="font-semibold text-slate-900">{detail.name || "-"}</div>
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
              <div className="text-slate-900">{detail.final_category || detail.category || "-"}</div>
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

export default Produtos;


