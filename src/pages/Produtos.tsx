import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { buildApiUrl } from "@/lib/config";
import { getAuthHeaders } from "@/lib/auth";
import { Search } from "lucide-react";
import { ProductThumb } from "@/components/products/ProductThumb";
import { ProductDetailSlideOver } from "@/components/products/ProductDetailSlideOver";

const Produtos = () => {
  type ProductRow = {
    id: number;
    sku: number;
    name: string | null;
    ean: string | null;
    brand: string | null;
    category: string | null;
    model: string | null;
    photo: string | null;
    url: string | null;
  };

  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

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

  const closeDetail = () => {
    setSelectedId(null);
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
                  <th className="py-2 pr-4">Foto</th>
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
                    <td colSpan={7} className="py-6 text-slate-600">
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
                      <td className="py-3 pr-4">
                        <ProductThumb name={r.name || String(r.sku)} photo={r.photo} size={32} />
                      </td>
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

      <ProductDetailSlideOver open={!!selectedId} productId={selectedId} onClose={closeDetail} />
    </div>
  );
};

export default Produtos;


