import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { buildApiUrl } from "@/lib/config";
import { getAuthHeaders, throwIfUnauthorized } from "@/lib/auth";
import { Bot, Pencil, Search, Store } from "lucide-react";
import { ProductThumb } from "@/components/products/ProductThumb";
import { ProductDetailSlideOver } from "@/components/products/ProductDetailSlideOver";
import { SlideOver } from "@/components/ui/slideover";
import { Button } from "@/components/ui/button";

const Produtos = () => {
  type ProductRow = {
    id: number;
    sku: string;
    name: string | null;
    ean: string | null;
    brand: string | null;
    category: string | null;
    subcategory?: string | null;
    final_category?: string | null;
    model: string | null;
    photo: string | null;
    url: string | null;
  };

  type MarketplaceStatusRow = {
    id: number;
    sku: string;
    name: string | null;
    photo: string | null;
    status: Record<string, number>; // marketplace -> days_without_sales
  };

  // Busca por ação (não a cada tecla): qDraft é o input, q é o termo efetivo da busca.
  const [qDraft, setQDraft] = useState("");
  const [q, setQ] = useState("");
  type AdvancedField = "sku" | "brand" | "category" | "subcategory" | "final_category";
  const [advField, setAdvField] = useState<AdvancedField>("sku");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [marketplaceMode, setMarketplaceMode] = useState(false);
  const [marketplaces, setMarketplaces] = useState<string[]>([]);
  const [marketplaceRows, setMarketplaceRows] = useState<MarketplaceStatusRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkBrand, setBulkBrand] = useState("");
  const [bulkModel, setBulkModel] = useState("");
  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkSubcategory, setBulkSubcategory] = useState("");
  const [bulkFinalCategory, setBulkFinalCategory] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMsg, setAiMsg] = useState<string | null>(null);
  const [distinctLoading, setDistinctLoading] = useState(false);
  const [distinctError, setDistinctError] = useState<string | null>(null);
  const [distinct, setDistinct] = useState<{
    brands: string[];
    models: string[];
    categories: string[];
    subcategories: string[];
    finalCategories: string[];
  } | null>(null);

  const selectedRow = useMemo(() => rows.find((r) => r.id === selectedId) || null, [rows, selectedId]);

  const truncate50 = (value: string | null) => {
    const s = String(value ?? "");
    if (s.length <= 50) return s;
    return `${s.slice(0, 47)}...`;
  };

  const categoryPath = (r: ProductRow) => {
    const parts = [r.category, r.subcategory, r.final_category].map((x) => String(x ?? "").trim()).filter((x) => x.length > 0);
    return parts.length ? parts.join(" > ") : "-";
  };

  const colonIdx = qDraft.indexOf(":");
  const isAdvanced = colonIdx >= 0;
  const advValue = (isAdvanced ? qDraft.slice(colonIdx + 1) : "").trim();

  useEffect(() => {
      const ac = new AbortController();
      setLoading(true);
      setError(null);

    const path = marketplaceMode ? "/companies/me/products/marketplace-status" : "/companies/me/products";
    const qs = new URLSearchParams();
    qs.set("limit", "100");
    if ((q as any)?.startsWith?.("__FIELD__")) {
      const parts = String(q).split("|"); // __FIELD__|field|value
      const field = parts[1] || "";
      const value = parts.slice(2).join("|") || "";
      if (field && value) {
        qs.set("field", field);
        qs.set("value", value);
      }
    } else if (q.trim()) {
      qs.set("q", q.trim());
    }

    fetch(buildApiUrl(`${path}?${qs.toString()}`), {
        headers: { ...getAuthHeaders() },
        signal: ac.signal,
      })
        .then(async (res) => {
          throwIfUnauthorized(res);
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error((data as any)?.message || "Erro ao carregar produtos");
          }
        return res.json() as Promise<any>;
        })
        .then((data) => {
        if (marketplaceMode) {
          const ms = Array.isArray((data as any)?.marketplaces) ? (data as any).marketplaces : [];
          const rs = Array.isArray((data as any)?.rows) ? (data as any).rows : [];
          const mk = ms.map((s: any) => String(s ?? "").trim()).filter((s: string) => s.length > 0);
          const list = rs.map((r: any) => ({
            id: Number(r?.id ?? 0),
            sku: String(r?.sku ?? ""),
            name: r?.name ?? null,
            photo: r?.photo ?? null,
            status: (r?.status && typeof r.status === "object" ? r.status : {}) as Record<string, number>,
          }));

          setMarketplaces(mk);
          setMarketplaceRows(list);
          setRows([]);

          const allowed = new Set<number>(list.map((r: any) => Number(r.id)));
          setSelectedIds((cur) => cur.filter((id) => allowed.has(id)));
          if (selectedId && !allowed.has(selectedId)) setSelectedId(null);
        } else {
          const listRaw = Array.isArray(data) ? data : [];
          const list = listRaw.map((r: any) => ({
            id: Number(r?.id ?? 0),
            sku: String(r?.sku ?? ""),
            name: r?.name ?? null,
            ean: r?.ean ?? null,
            brand: r?.brand ?? null,
            model: r?.model ?? null,
            category: r?.category ?? null,
            subcategory: r?.subcategory ?? null,
            final_category: r?.final_category ?? null,
            photo: r?.photo ?? null,
            url: r?.url ?? null,
          }));

          setRows(list);
          setMarketplaces([]);
          setMarketplaceRows([]);

          const allowed = new Set<number>(list.map((r: any) => Number(r.id)));
          setSelectedIds((cur) => cur.filter((id) => allowed.has(id)));
          if (selectedId && !allowed.has(selectedId)) setSelectedId(null);
          }
        })
        .catch((e: any) => {
        if (String(e?.name || "") === "AbortError") return;
          setRows([]);
        setMarketplaces([]);
        setMarketplaceRows([]);
          setError(String(e?.message || "Erro ao carregar produtos"));
        })
        .finally(() => setLoading(false));

      return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, reloadKey, marketplaceMode]);

  const closeDetail = () => {
    setSelectedId(null);
  };

  const visibleRows = marketplaceMode ? marketplaceRows : rows;
  const allSelectedOnPage = visibleRows.length > 0 && visibleRows.every((r) => selectedIds.includes(r.id));

  const toggleRow = (id: number) => {
    setSelectedIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };

  const toggleAllOnPage = () => {
    setSelectedIds((cur) => {
      if (allSelectedOnPage) return cur.filter((id) => !visibleRows.some((r) => r.id === id));
      const add = visibleRows.map((r) => r.id).filter((id) => !cur.includes(id));
      return [...cur, ...add];
    });
  };

  const openBulk = () => {
    setBulkError(null);
    setBulkOpen(true);
  };

  const closeBulk = () => {
    setBulkOpen(false);
    setBulkError(null);
    setBulkSaving(false);
  };

  useEffect(() => {
    if (!bulkOpen) return;
    if (distinctLoading) return;
    if (distinct) return;
    const ac = new AbortController();
    setDistinctLoading(true);
    setDistinctError(null);
    fetch(buildApiUrl(`/companies/me/products/distinct-values`), { headers: { ...getAuthHeaders() }, signal: ac.signal })
      .then(async (res) => {
        throwIfUnauthorized(res);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as any)?.message || "Erro ao carregar opções");
        }
        return res.json() as Promise<any>;
      })
      .then((d) => {
        setDistinct({
          brands: Array.isArray(d?.brands) ? d.brands.map((s: any) => String(s ?? "")).filter(Boolean) : [],
          models: Array.isArray(d?.models) ? d.models.map((s: any) => String(s ?? "")).filter(Boolean) : [],
          categories: Array.isArray(d?.categories) ? d.categories.map((s: any) => String(s ?? "")).filter(Boolean) : [],
          subcategories: Array.isArray(d?.subcategories) ? d.subcategories.map((s: any) => String(s ?? "")).filter(Boolean) : [],
          finalCategories: Array.isArray(d?.finalCategories) ? d.finalCategories.map((s: any) => String(s ?? "")).filter(Boolean) : [],
        });
      })
      .catch((e: any) => {
        if (String(e?.name || "") === "AbortError") return;
        setDistinct(null);
        setDistinctError(String(e?.message || "Erro ao carregar opções"));
      })
      .finally(() => setDistinctLoading(false));
    return () => ac.abort();
  }, [bulkOpen, distinct, distinctLoading]);

  const saveBulk = async () => {
    if (!selectedIds.length) return;
    setBulkSaving(true);
    setBulkError(null);
    try {
      const fields: any = {};
      const norm = (s: string) => {
        const v = String(s || "").trim();
        return v ? v : undefined;
      };
      const brand = norm(bulkBrand);
      const model = norm(bulkModel);
      const category = norm(bulkCategory);
      const subcategory = norm(bulkSubcategory);
      const final_category = norm(bulkFinalCategory);
      if (brand !== undefined) fields.brand = brand;
      if (model !== undefined) fields.model = model;
      if (category !== undefined) fields.category = category;
      if (subcategory !== undefined) fields.subcategory = subcategory;
      if (final_category !== undefined) fields.final_category = final_category;

      const resp = await fetch(buildApiUrl(`/companies/me/products/bulk-update`), {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ ids: selectedIds, fields, lock: true }),
      });
      throwIfUnauthorized(resp);
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error((data as any)?.message || "Erro ao salvar alterações");
      }

      closeBulk();
      setSelectedIds([]);
      setReloadKey((k) => k + 1);
    } catch (e: any) {
      setBulkError(String(e?.message || "Erro ao salvar alterações"));
    } finally {
      setBulkSaving(false);
    }
  };

  const classifyWithAI = async () => {
    if (!selectedIds.length) return;
    setAiLoading(true);
    setAiMsg("Classificando... (lotes de 20)");
    try {
      const resp = await fetch(buildApiUrl(`/companies/me/products/classify-ai`), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ ids: selectedIds }),
      });
      throwIfUnauthorized(resp);
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error((data as any)?.message || "Erro ao classificar com IA");
      }
      const data = (await resp.json().catch(() => ({}))) as any;
      const processed = Number(data?.processed ?? 0) || 0;
      const updated = Number(data?.updated ?? 0) || 0;
      const batches = Number(data?.batches ?? 0) || 0;
      const errs = Array.isArray(data?.errors) ? data.errors.length : 0;
      setAiMsg(`IA finalizada: ${updated}/${processed} atualizados (${batches} lotes).${errs ? ` Erros: ${errs}` : ""}`);
      setSelectedIds([]);
      setReloadKey((k) => k + 1);
    } catch (e: any) {
      setAiMsg(String(e?.message || "Erro ao classificar com IA"));
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="w-full">
      <h1 className="text-2xl font-extrabold text-slate-900">Produtos</h1>

      <Card className="mt-4 w-full border-slate-200 bg-white p-4">
        <div className="flex items-center gap-3 flex-nowrap">
          <div className="relative min-w-0 flex-1 max-w-[680px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <Input
              value={qDraft}
              onChange={(e) => setQDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setSelectedIds([]);
                  if (isAdvanced) setQ(`__FIELD__|${advField}|${advValue}`);
                  else setQ(qDraft.trim());
                }
              }}
              placeholder='Buscar... (dica: digite ":" para busca avançada)'
              className="pl-9 border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-primary/30"
            />
          </div>
          {isAdvanced ? (
            <select
              value={advField}
              onChange={(e) => setAdvField(e.target.value as AdvancedField)}
              className="h-10 shrink-0 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900"
              title="Campo da busca avançada (filtra apenas esse campo)"
            >
              <option value="sku">SKU</option>
              <option value="brand">Marca</option>
              <option value="category">Categoria</option>
              <option value="subcategory">Subcategoria</option>
              <option value="final_category">Categoria Final</option>
            </select>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0 rounded-xl"
            onClick={() => {
              setSelectedIds([]);
              if (isAdvanced) setQ(`__FIELD__|${advField}|${advValue}`);
              else setQ(qDraft.trim());
            }}
            disabled={loading}
            title="Executar busca"
          >
            <Search className="h-4 w-4" />
            <span className="ml-2">Buscar</span>
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={!selectedIds.length} onClick={openBulk} className="shrink-0 rounded-xl">
            <Pencil className="h-4 w-4" />
            <span className="ml-2">Editar em massa{selectedIds.length ? ` (${selectedIds.length})` : ""}</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={aiLoading || !selectedIds.length}
            onClick={classifyWithAI}
            className="shrink-0 rounded-xl"
            title={!selectedIds.length ? "Selecione produtos no checkbox para classificar" : "Classifica os selecionados (lotes de 20)"}
          >
            <Bot className="h-4 w-4" />
            <span className="ml-2">
              {aiLoading ? "Classificando..." : `Classificar com IA${selectedIds.length ? ` (${selectedIds.length})` : ""}`}
            </span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setSelectedIds([]);
              setMarketplaceMode((s) => !s);
            }}
            className="shrink-0 rounded-xl"
            title="Alterna as colunas para mostrar dias sem vendas por marketplace"
          >
            <Store className="h-4 w-4" />
            <span className="ml-2">{marketplaceMode ? "Ver detalhes" : "Ver status nos Marketplaces"}</span>
          </Button>
        </div>

        {aiMsg ? <div className="mt-3 text-xs text-slate-600">{aiMsg}</div> : null}
        {loading ? <div className="mt-4 text-slate-700">Carregando...</div> : null}
        {!loading && error ? <div className="mt-4 text-sm text-red-600">{error}</div> : null}

        {!loading && !error ? (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-600">
                  <th className="py-2 pr-4">
                    <input type="checkbox" checked={allSelectedOnPage} onChange={toggleAllOnPage} />
                  </th>
                  <th className="py-2 pr-4">Foto</th>
                  <th className="py-2 pr-4">SKU</th>
                  <th className="py-2 pr-4">Nome</th>
                  {marketplaceMode ? (
                    (marketplaces.length ? marketplaces : ["—"]).map((mk) => (
                      <th key={mk} className="py-2 pr-4 whitespace-nowrap">
                        {mk}
                      </th>
                    ))
                  ) : (
                    <>
                  <th className="py-2 pr-4">EAN</th>
                  <th className="py-2 pr-4">Marca</th>
                  <th className="py-2 pr-4">Categoria</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={marketplaceMode ? 4 + Math.max(1, marketplaces.length) : 7} className="py-6 text-slate-600">
                      Nenhum produto encontrado.
                    </td>
                  </tr>
                ) : (
                  visibleRows.map((r: any) => (
                    <tr
                      key={r.id}
                      className="border-t border-slate-200 cursor-pointer hover:bg-slate-50"
                      onClick={() => setSelectedId(r.id)}
                    >
                      <td className="py-3 pr-4" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selectedIds.includes(r.id)} onChange={() => toggleRow(r.id)} />
                      </td>
                      <td className="py-3 pr-4">
                        <ProductThumb name={r.name || String(r.sku)} photo={r.photo} size={32} />
                      </td>
                      <td className="py-3 pr-4 font-semibold text-slate-900">{String(r.sku)}</td>
                      <td className="py-3 pr-4 text-slate-700 max-w-[320px] truncate" title={String(r.name ?? "")}>
                        {truncate50(r.name) || "-"}
                      </td>
                      {marketplaceMode ? (
                        (marketplaces.length ? marketplaces : ["—"]).map((mk) => {
                          const days = Number((r as MarketplaceStatusRow)?.status?.[mk] ?? NaN);
                          const has = Number.isFinite(days);
                          const danger = has && days > 7;
                          const cls = danger ? "bg-rose-50 text-rose-800" : has ? "bg-white text-slate-700" : "bg-white text-slate-400";
                          return (
                            <td key={`${r.id}-${mk}`} className={["py-3 pr-4 whitespace-nowrap rounded-md", cls].join(" ")}>
                              {has ? `${days} dias` : "—"}
                            </td>
                          );
                        })
                      ) : (
                        <>
                      <td className="py-3 pr-4 text-slate-700">{r.ean || "-"}</td>
                      <td className="py-3 pr-4 text-slate-700">{r.brand || "-"}</td>
                          <td className="py-3 pr-4 text-slate-700 max-w-[360px] truncate" title={categoryPath(r as any)}>
                            {categoryPath(r as any)}
                          </td>
                        </>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      <ProductDetailSlideOver open={!!selectedId} productId={selectedId} onClose={closeDetail} />

      <SlideOver open={bulkOpen} title={`Editar em massa (${selectedIds.length})`} onClose={closeBulk}>
        <div className="space-y-4">
          <div className="text-xs text-slate-600">
            Preencha apenas os campos que deseja alterar. As integrações não irão sobrescrever estes campos quando “Travar atributos” estiver ativo.
            </div>
          {bulkError ? <div className="text-sm text-red-600">{bulkError}</div> : null}
          {distinctLoading ? <div className="text-xs text-slate-600">Carregando sugestões...</div> : null}
          {!distinctLoading && distinctError ? <div className="text-xs text-red-600">{distinctError}</div> : null}

          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-600">Categoria</div>
            <Input
              value={bulkCategory}
              onChange={(e) => setBulkCategory(e.target.value)}
              placeholder="Ex.: Eletrônicos"
              list="products-distinct-categories"
            />
              </div>
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-600">Subcategoria</div>
            <Input
              value={bulkSubcategory}
              onChange={(e) => setBulkSubcategory(e.target.value)}
              placeholder="Ex.: Acessórios"
              list="products-distinct-subcategories"
            />
              </div>
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-600">Categoria final</div>
            <Input
              value={bulkFinalCategory}
              onChange={(e) => setBulkFinalCategory(e.target.value)}
              placeholder="Ex.: Cabos"
              list="products-distinct-finalCategories"
            />
            </div>
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-600">Marca</div>
            <Input
              value={bulkBrand}
              onChange={(e) => setBulkBrand(e.target.value)}
              placeholder="Ex.: Samsung"
              list="products-distinct-brands"
            />
              </div>
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-600">Modelo</div>
            <Input
              value={bulkModel}
              onChange={(e) => setBulkModel(e.target.value)}
              placeholder="Ex.: A15"
              list="products-distinct-models"
            />
            </div>

          {/* datalists (autocomplete nativo do browser) */}
          <datalist id="products-distinct-brands">
            {(distinct?.brands || []).map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <datalist id="products-distinct-models">
            {(distinct?.models || []).map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <datalist id="products-distinct-categories">
            {(distinct?.categories || []).map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <datalist id="products-distinct-subcategories">
            {(distinct?.subcategories || []).map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <datalist id="products-distinct-finalCategories">
            {(distinct?.finalCategories || []).map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>

          <div className="pt-2">
            <Button type="button" variant="primary" disabled={!selectedIds.length || bulkSaving} onClick={saveBulk} className="w-full rounded-xl">
              {bulkSaving ? "Salvando..." : "Salvar alterações"}
            </Button>
          </div>
        </div>
      </SlideOver>
    </div>
  );
};

export default Produtos;


