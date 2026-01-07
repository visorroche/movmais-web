import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import type { AreaLogadaOutletContext } from "@/pages/AreaLogada";
import { ResponsiveLine } from "@nivo/line";
import { line as d3Line } from "d3-shape";
import { buildApiUrl } from "@/lib/config";
import { getAuthHeaders } from "@/lib/auth";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/multi-select";
import { DateRangePicker, type DateRangeValue } from "@/components/ui/date-range-picker";
import { SlideOver } from "@/components/ui/slideover";
import { CHART_COLORS } from "@/lib/chartColors";
import { SlidersHorizontal } from "lucide-react";

const Dashboard = () => {
  const { me, meError } = useOutletContext<AreaLogadaOutletContext>();
  const navigate = useNavigate();

  const formatBRLNoSpace = (value: number): string =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value).replace(/\u00A0/g, "");

  const formatBRLCompact = (value: number): string =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 })
      .format(value)
      .replace(/\u00A0/g, "");

  type FiltersResponse = {
    companyId: number;
    groupId: number | null;
    stores: { id: number; name: string }[];
    statuses: string[];
    channels: string[];
    categories: string[];
    states: string[];
    cities: string[];
  };

  type ProductOption = { id: number; sku: number; name: string | null; brand: string | null; model: string | null; category: string | null };

  const [filtersLoading, setFiltersLoading] = useState(true);
  const [filtersError, setFiltersError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FiltersResponse | null>(null);

  const [status, setStatus] = useState<string[]>([]);
  const [stores, setStores] = useState<string[]>([]);
  const [channels, setChannels] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<DateRangeValue>(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const pad2 = (n: number) => String(n).padStart(2, "0");
    const toISO = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    return { start: toISO(start), end: toISO(now) };
  });

  const [productValues, setProductValues] = useState<string[]>([]);
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [productLoading, setProductLoading] = useState(false);
  const [productError, setProductError] = useState<string | null>(null);
  const [productQuery, setProductQuery] = useState("");

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [citiesOverride, setCitiesOverride] = useState<string[] | null>(null);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [citiesError, setCitiesError] = useState<string | null>(null);

  const [searchParams] = useSearchParams();
  const initialFromUrl = useRef(false);
  const initialStoresFromUrl = useRef<string[] | null>(null);

  // Inicializa filtros a partir da URL (link compartilhável)
  useEffect(() => {
    const getAll = (key: string) => searchParams.getAll(key).map((v) => String(v)).filter(Boolean);
    const status = getAll("status");
    const stores = getAll("store");
    const channels = getAll("channel");
    const categories = getAll("category");
    const products = getAll("product");
    const states = getAll("state");
    const cities = getAll("city");
    const start = String(searchParams.get("start") || "");
    const end = String(searchParams.get("end") || "");

    if (
      status.length ||
      stores.length ||
      channels.length ||
      categories.length ||
      products.length ||
      states.length ||
      cities.length ||
      start ||
      end
    ) {
      initialFromUrl.current = true;
    }
    initialStoresFromUrl.current = stores.length ? stores : null;

    if (status.length) setStatus(status);
    if (stores.length) setStores(stores);
    if (channels.length) setChannels(channels);
    if (categories.length) setCategories(categories);
    if (products.length) setProductValues(products);
    if (states.length) setStates(states);
    if (cities.length) setCities(cities);
    if (start || end) setDateRange({ start, end });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    setFiltersLoading(true);
    setFiltersError(null);
    fetch(buildApiUrl("/companies/me/dashboard/filters"), { headers: { ...getAuthHeaders() }, signal: ac.signal })
      .then(async (res) => {
        if (res.status === 401) throw new Error("Não autenticado");
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as any)?.message || "Erro ao carregar filtros");
        }
        return res.json() as Promise<FiltersResponse>;
      })
      .then((d) => {
        setFilters(d);
        // Se não veio da URL, default: todas as lojas do grupo selecionadas.
        if (!initialStoresFromUrl.current) {
          setStores(d.stores?.map((s) => String(s.id)) || []);
        }
      })
      .catch((e: any) => {
        setFilters(null);
        setFiltersError(String(e?.message || "Erro ao carregar filtros"));
      })
      .finally(() => setFiltersLoading(false));

    return () => ac.abort();
  }, []);

  const storeOptions: MultiSelectOption[] = useMemo(
    () => (filters?.stores || []).map((s) => ({ value: String(s.id), label: s.name })),
    [filters],
  );
  const statusOptions: MultiSelectOption[] = useMemo(
    () => (filters?.statuses || []).map((s) => ({ value: s, label: s })),
    [filters],
  );
  const channelOptions: MultiSelectOption[] = useMemo(
    () => (filters?.channels || []).map((s) => ({ value: s, label: s })),
    [filters],
  );
  const categoryOptions: MultiSelectOption[] = useMemo(
    () => (filters?.categories || []).map((s) => ({ value: s, label: s })),
    [filters],
  );
  const stateOptions: MultiSelectOption[] = useMemo(
    () => (filters?.states || []).map((s) => ({ value: s, label: s })),
    [filters],
  );
  const cityOptions: MultiSelectOption[] = useMemo(
    () => ((citiesOverride ?? filters?.cities) || []).map((s) => ({ value: s, label: s })),
    [citiesOverride, filters],
  );

  const productSelectOptions: MultiSelectOption[] = useMemo(() => {
    const map = new Map<string, MultiSelectOption>();
    // inclui selecionados mesmo se não estiverem no resultado atual
    for (const v of productValues) {
      if (!map.has(v)) map.set(v, { value: v, label: v });
    }
    for (const p of productOptions) {
      const label = `${p.sku} — ${p.name || "Sem nome"}`;
      map.set(String(p.sku), { value: String(p.sku), label });
    }
    return Array.from(map.values());
  }, [productOptions, productValues]);

  useEffect(() => {
    const q = productQuery.trim();
    if (!q) {
      setProductOptions([]);
      setProductError(null);
      setProductLoading(false);
      return;
    }
    const ac = new AbortController();
    const t = setTimeout(() => {
      setProductLoading(true);
      setProductError(null);
      fetch(buildApiUrl(`/companies/me/dashboard/products?q=${encodeURIComponent(q)}&limit=50`), {
        headers: { ...getAuthHeaders() },
        signal: ac.signal,
      })
        .then(async (res) => {
          if (res.status === 401) throw new Error("Não autenticado");
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error((data as any)?.message || "Erro ao buscar produtos");
          }
          return res.json() as Promise<ProductOption[]>;
        })
        .then((d) => setProductOptions(Array.isArray(d) ? d : []))
        .catch((e: any) => {
          setProductOptions([]);
          setProductError(String(e?.message || "Erro ao buscar produtos"));
        })
        .finally(() => setProductLoading(false));
    }, 250);

    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [productQuery]);

  // cidades dependem do(s) estado(s) selecionado(s)
  useEffect(() => {
    if (!filters) return;
    if (!states.length) {
      setCitiesOverride(null);
      setCitiesError(null);
      setCitiesLoading(false);
      return;
    }
    const ac = new AbortController();
    setCitiesLoading(true);
    setCitiesError(null);
    const qs = new URLSearchParams();
    for (const st of states) qs.append("state", st);
    fetch(buildApiUrl(`/companies/me/dashboard/cities?${qs.toString()}`), {
      headers: { ...getAuthHeaders() },
      signal: ac.signal,
    })
      .then(async (res) => {
        if (res.status === 401) throw new Error("Não autenticado");
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as any)?.message || "Erro ao carregar cidades");
        }
        return res.json() as Promise<string[]>;
      })
      .then((list) => {
        const next = Array.isArray(list) ? list : [];
        setCitiesOverride(next);
        // remove cidades selecionadas que não pertencem aos estados atuais
        setCities((cur) => cur.filter((c) => next.includes(c)));
      })
      .catch((e: any) => {
        setCitiesOverride([]);
        setCitiesError(String(e?.message || "Erro ao carregar cidades"));
      })
      .finally(() => setCitiesLoading(false));

    return () => ac.abort();
  }, [filters, states]);

  const applyFiltersToUrl = () => {
    const params = new URLSearchParams();
    const appendMany = (key: string, list: string[]) => {
      for (const v of list) {
        const s = String(v ?? "").trim();
        if (s) params.append(key, s);
      }
    };

    if (dateRange.start) params.set("start", dateRange.start);
    if (dateRange.end) params.set("end", dateRange.end);
    appendMany("status", status);
    appendMany("store", stores);
    appendMany("channel", channels);
    appendMany("category", categories);
    appendMany("product", productValues);
    appendMany("state", states);
    appendMany("city", cities);

    const qs = params.toString();
    // Hard reload para garantir URL compartilhável e estado limpo, como você pediu
    window.location.href = qs ? `/dashboard?${qs}` : `/dashboard`;
  };

  // Gráfico: mês atual vs último mês + projeção do mês atual
  const now = new Date();
  const todayDay = now.getDate(); // 1..31
  const curMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const curMonthDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthDays = new Date(now.getFullYear(), now.getMonth(), 0).getDate();

  const monthLineData = useMemo(() => {
    const pad2 = (n: number) => String(n).padStart(2, "0");
    const labels = Array.from({ length: curMonthDays }, (_, i) => pad2(i + 1));

    // Base (fake) do mês anterior: série diária com tendência + ondulação
    const lastDaily = Array.from({ length: lastMonthDays }, (_, i) => {
      const day = i + 1;
      const trend = 1 + day / Math.max(1, lastMonthDays) * 0.35; // cresce ao longo do mês
      const wave = 0.85 + 0.15 * Math.sin((day / 6) * Math.PI); // pequenas variações
      const base = 4200;
      return Math.max(0, Math.round(base * trend * wave));
    });

    // Cumulativo do mês anterior (para servir de "inclinação")
    const lastCum = lastDaily.reduce<number[]>((acc, v, idx) => {
      const prev = idx ? acc[idx - 1] : 0;
      acc.push(prev + v);
      return acc;
    }, []);

    // "Fato" até hoje no mês atual: mesmo formato do mês anterior, mas escalado (e pequeno ruído)
    const sameDayIdx = Math.min(todayDay, lastCum.length) - 1;
    const lastSoFar = Math.max(1, lastCum[sameDayIdx] ?? lastCum[lastCum.length - 1] ?? 1);
    const factor = 1.08; // placeholder: crescimento do mês atual vs. último mês (depois liga em dados reais)
    const curSoFarTarget = Math.round(lastSoFar * factor);

    // Faz uma curva base do mês atual usando o cumulativo do mês anterior como shape,
    // e escala pela performance até hoje.
    const scaleToSoFar = curSoFarTarget / lastSoFar;
    const curCum = Array.from({ length: curMonthDays }, (_, i) => {
      const day = i + 1;
      const refIdx = Math.min(day, lastMonthDays) - 1;
      const ref = lastCum[refIdx] ?? lastCum[lastCum.length - 1] ?? 0;
      const raw = ref * scaleToSoFar;
      // ruído só no trecho "já passado"
      if (day <= todayDay) {
        const jitter = 1 + (Math.sin(day * 1.7) * 0.01); // ±1%
        return Math.round(raw * jitter);
      }
      return Math.round(raw);
    });

    const curActual = labels.map((x, i) => ({ x, y: i + 1 <= todayDay ? curCum[i] : null }));
    const curProjection = labels.map((x, i) => ({ x, y: i + 1 >= todayDay ? curCum[i] : null }));

    // Mês anterior: ajusta para o mesmo eixo X (1..curMonthDays), truncando/repetindo último valor se necessário
    const lastSeries = labels.map((x, i) => {
      const refIdx = Math.min(i, lastCum.length - 1);
      return { x, y: lastCum[refIdx] ?? lastCum[lastCum.length - 1] ?? 0 };
    });

    return [
      { id: "Mês atual", data: curActual.filter((p: any) => p.y !== null) },
      { id: "Mês atual (projeção)", data: curProjection.filter((p: any) => p.y !== null) },
      { id: "Último mês", data: lastSeries },
    ];
  }, [curMonthDays, lastMonthDays, todayDay]);

  const dashedProjectionLayer = (props: any) => {
    const serie = props.series?.find((s: any) => s.id === "Mês atual (projeção)");
    if (!serie) return null;
    const pts = (serie.data || []).map((d: any) => d.position);
    const gen = d3Line<any>()
      .x((d) => d.x)
      .y((d) => d.y);
    const d = gen(pts);
    if (!d) return null;
    return <path d={d} fill="none" stroke={CHART_COLORS[6]} strokeWidth={2.5} strokeDasharray="6 6" opacity={0.95} />;
  };

  return (
    <div className="w-full">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <h1 className="text-2xl font-extrabold text-slate-900">Dashboard</h1>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-end">
          <div className="w-full sm:w-[360px]">
            <DateRangePicker value={dateRange} onChange={setDateRange} placeholder="Selecionar período..." />
            </div>
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filtros
            </button>
          </div>
      </div>

      {meError || filtersLoading || filtersError || productLoading || productError ? (
        <div className="mt-2 space-y-1">
          {meError ? <div className="text-sm text-red-600">{meError}</div> : null}
          {filtersLoading ? <div className="text-sm text-slate-700">Carregando filtros...</div> : null}
          {!filtersLoading && filtersError ? <div className="text-sm text-red-600">{filtersError}</div> : null}
          {productLoading ? <div className="text-xs text-slate-600">Buscando produtos...</div> : null}
          {!productLoading && productError ? <div className="text-xs text-red-600">{productError}</div> : null}
        </div>
        ) : null}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="w-full border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-600">Faturamento de hoje</div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-extrabold text-emerald-700">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-600" />
              </span>
              AO VIVO
            </div>
          </div>
          <div className="mt-2 text-3xl font-extrabold text-slate-900">R$ 12.345,67</div>
          <button
            type="button"
            onClick={() => navigate("/dashboard/ao-vivo")}
            className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-extrabold text-slate-800 hover:bg-slate-50"
          >
            Acompanhe suas vendas ao vivo
          </button>
        </Card>

        <Card className="w-full border-slate-200 bg-white p-5">
          <div className="text-sm font-semibold text-slate-600">Faturado do período</div>
          <div className="mt-2 text-3xl font-extrabold text-slate-900">R$ 98.765,43</div>
          <button
            type="button"
            onClick={() => navigate("/dashboard/itens")}
            className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-extrabold text-slate-800 hover:bg-slate-50"
          >
            Detalhamento dos itens vendidos
          </button>
        </Card>

        <Card className="w-full border-slate-200 bg-white p-5">
          <div className="text-sm font-semibold text-slate-600">Taxa de conversão</div>
          <div className="mt-2 flex items-start justify-between gap-4">
            <div className="text-3xl font-extrabold text-slate-900">18,4%</div>
            <div className="text-sm text-slate-700 text-left">
              <div>
                <span className="font-extrabold text-slate-900">1.240</span> simulações
              </div>
              <div>
                <span className="font-extrabold text-slate-900">228</span> pedidos
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate("/dashboard/simulacoes")}
            className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-extrabold text-slate-800 hover:bg-slate-50"
          >
            Ver simulações de frete
          </button>
        </Card>
      </div>

      {/* Linha do faturamento: mês atual vs último mês + projeção */}
      <Card className="mt-4 w-full border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-lg font-extrabold text-slate-900">Faturamento dia a dia (mês atual vs último mês)</div>
          <div className="text-xs text-slate-600">
            Mês atual:{" "}
            <span className="font-extrabold text-slate-900">
              {curMonthStart.toLocaleDateString("pt-BR")} – {now.toLocaleDateString("pt-BR")}
            </span>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <div className="inline-flex items-center gap-2 text-slate-700">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_COLORS[1] }} />
            <span className="font-semibold">Mês atual</span>
          </div>
          <div className="inline-flex items-center gap-2 text-slate-700">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_COLORS[6] }} />
            <span className="font-semibold">Mês atual (projeção)</span>
          </div>
          <div className="inline-flex items-center gap-2 text-slate-700">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_COLORS[0] }} />
            <span className="font-semibold">Último mês</span>
          </div>
        </div>

        <div className="mt-3" style={{ height: 380 }}>
          <ResponsiveLine
            data={monthLineData as any}
            margin={{ top: 10, right: 24, bottom: 56, left: 92 }}
            xScale={{ type: "point" }}
            yScale={{ type: "linear", min: 0, max: "auto", stacked: false }}
            axisBottom={{
              tickRotation: -45,
              legend: "Dia do mês",
              legendOffset: 46,
              legendPosition: "middle",
            }}
            axisLeft={{
              format: (v) => formatBRLCompact(Number(v)),
            }}
            enablePoints={false}
            useMesh={true}
            colors={(d) => {
              const id = String(d.id);
              if (id === "Mês atual") return CHART_COLORS[1];
              if (id === "Mês atual (projeção)") return "transparent"; // desenhado via layer pontilhada
              return CHART_COLORS[0]; // último mês
            }}
            legends={[]}
            theme={{
              axis: { ticks: { text: { fill: "#475569" } }, legend: { text: { fill: "#334155", fontWeight: 700 } } },
              grid: { line: { stroke: "#E2E8F0" } },
              tooltip: { container: { background: "#fff", color: "#0f172a", fontSize: 12, borderRadius: 12 } },
            }}
            layers={["grid", "markers", "areas", "lines", dashedProjectionLayer, "slices", "axes"]}
            tooltip={({ point }: any) => (
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xl">
                <div className="font-extrabold">{String(point?.serieId)}</div>
                <div className="text-slate-600">Dia {String(point?.data?.xFormatted ?? point?.data?.x)}</div>
                <div>{formatBRLNoSpace(Number(point?.data?.yFormatted ?? point?.data?.y ?? 0))}</div>
              </div>
            )}
          />
        </div>

        <div className="mt-2 text-xs text-slate-600">
          Projeção: segue a mesma “inclinação” do mês anterior, escalada pelo desempenho até o dia {String(todayDay).padStart(2, "0")}.
        </div>
      </Card>

      <SlideOver open={filtersOpen} title="Filtros" onClose={() => setFiltersOpen(false)}>
        {!filters ? <div className="text-slate-600">Carregando...</div> : null}
        {filters ? (
          <div className="flex h-full flex-col">
            <div className="flex-1 space-y-4">
              <MultiSelect
                label="Status"
                options={statusOptions}
                values={status}
                onChange={setStatus}
                placeholder="Todos"
                searchPlaceholder="Buscar status..."
              />
              <MultiSelect
                label="Loja"
                options={storeOptions}
                values={stores}
                onChange={setStores}
                placeholder="Todas"
                searchPlaceholder="Buscar loja..."
              />
              <MultiSelect
                label="Canal"
                options={channelOptions}
                values={channels}
                onChange={setChannels}
                placeholder="Todos"
                searchPlaceholder="Buscar canal..."
              />
              <MultiSelect
                label="Categoria"
                options={categoryOptions}
                values={categories}
                onChange={setCategories}
                placeholder="Todas"
                searchPlaceholder="Buscar categoria..."
              />
              <MultiSelect
                label="Produto"
                options={productSelectOptions}
                values={productValues}
                onChange={setProductValues}
                placeholder="Buscar por SKU ou nome"
                searchPlaceholder="Digite para buscar..."
                onSearchChange={setProductQuery}
              />
              <MultiSelect
                label="Estado"
                options={stateOptions}
                values={states}
                onChange={setStates}
                placeholder="Todos"
                searchPlaceholder="Buscar UF..."
              />
              <MultiSelect
                label="Cidade"
                options={cityOptions}
                values={cities}
                onChange={setCities}
                placeholder="Todas"
                searchPlaceholder="Buscar cidade..."
              />
              {citiesLoading ? <div className="text-xs text-slate-600">Carregando cidades...</div> : null}
              {!citiesLoading && citiesError ? <div className="text-xs text-red-600">{citiesError}</div> : null}
            </div>

            <div className="mt-6 border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={applyFiltersToUrl}
                className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-extrabold text-white hover:brightness-95"
              >
                Aplicar filtros
              </button>
            </div>
          </div>
        ) : null}
      </SlideOver>
    </div>
  );
};

export default Dashboard;
