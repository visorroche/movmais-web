import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ResponsiveLine } from "@nivo/line";
import { ResponsiveScatterPlot } from "@nivo/scatterplot";
import { geoMercator, geoPath } from "d3-geo";
import { scaleQuantize } from "d3-scale";
import { SlidersHorizontal } from "lucide-react";
import brStates from "@/assets/geo/br_states.json";
import { Card } from "@/components/ui/card";
import { DateRangePicker, type DateRangeValue } from "@/components/ui/date-range-picker";
import { SlideOver } from "@/components/ui/slideover";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/multi-select";
import { buildApiUrl } from "@/lib/config";
import { getAuthHeaders } from "@/lib/auth";
import { CHART_COLORS } from "@/lib/chartColors";

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

type ProductOption = { id: number; sku: string; name: string | null; brand: string | null; model: string | null; category: string | null };

type SimsDailyResponse = {
  companyId: number;
  groupId: number | null;
  start: string;
  end: string;
  daily: { date: string; sims: number; orders: number }[];
};

type SimsByStateResponse = {
  companyId: number;
  groupId: number | null;
  start: string;
  end: string;
  states: { state: string; sims: number; orders: number; conversion: number }[];
};

type FreightScatterPoint = {
  rangeValue: string;
  rangeDeadline: string;
  total: number;
  orders: number;
  conversion: number;
};
type FreightScatterResponse = {
  companyId: number;
  groupId: number | null;
  start: string;
  end: string;
  points: FreightScatterPoint[];
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatPct1(value: number): string {
  return `${value.toFixed(1).replace(".", ",")}%`;
}

const DashboardSimulacoes = () => {
  const formatInt = (value: number): string => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);
  const formatBigNumber = (value: number): string => {
    const n = Number(value ?? 0);
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")}M`;
    return formatInt(n);
  };
  const formatPct = (value01: number): string => `${(value01 * 100).toFixed(1).replace(".", ",")}%`;
  const formatBRLNoSpace = (value: number): string =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value).replace(/\u00A0/g, "");
  const formatBRLBig = (value: number): string => {
    const n = Number(value ?? 0);
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1).replace(".", ",")}M`;
    return formatBRLNoSpace(n);
  };

  type SortKey = "label" | "conv" | "orders" | "sims" | "lostBRL";
  type SortState = { key: SortKey; dir: "asc" | "desc" };

  const [dateRange, setDateRange] = useState<DateRangeValue>(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const toISO = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    return { start: toISO(start), end: toISO(now) };
  });

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtersLoading, setFiltersLoading] = useState(true);
  const [filtersError, setFiltersError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FiltersResponse | null>(null);

  const [stores, setStores] = useState<string[]>([]);
  const [channels, setChannels] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);

  const [productValues, setProductValues] = useState<string[]>([]);
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [productLoading, setProductLoading] = useState(false);
  const [productError, setProductError] = useState<string | null>(null);
  const [productQuery, setProductQuery] = useState("");

  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyError, setDailyError] = useState<string | null>(null);
  const [dailySeries, setDailySeries] = useState<{ date: string; sims: number; orders: number }[]>([]);

  const [freightScatterLoading, setFreightScatterLoading] = useState(false);
  const [freightScatterError, setFreightScatterError] = useState<string | null>(null);
  const [freightScatterPoints, setFreightScatterPoints] = useState<FreightScatterPoint[]>([]);

  const [stateLoading, setStateLoading] = useState(false);
  const [stateError, setStateError] = useState<string | null>(null);
  const [stateSeries, setStateSeries] = useState<{ state: string; sims: number; orders: number; conversion: number }[]>([]);

  const initialStoresSet = useRef(false);

  useEffect(() => {
    const ac = new AbortController();
    setFiltersLoading(true);
    setFiltersError(null);
    fetch(buildApiUrl("/companies/me/dashboard/filters?channelsFrom=freight_quotes"), { headers: { ...getAuthHeaders() }, signal: ac.signal })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as any)?.message || "Erro ao carregar filtros");
        }
        return res.json() as Promise<any>;
      })
      .then((d) => {
        setFilters(d);
        if (!initialStoresSet.current) {
          setStores((d?.stores || []).map((s: any) => String(s.id)));
          initialStoresSet.current = true;
        }
      })
      .catch((e: any) => {
        setFilters(null);
        setFiltersError(String(e?.message || "Erro ao carregar filtros"));
      })
      .finally(() => setFiltersLoading(false));

    return () => ac.abort();
  }, []);

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

  // Série diária real (simulações e pedidos) — mesma lógica do Dashboard (company/grupo + período).
  useEffect(() => {
    const ac = new AbortController();
    const start = String(dateRange.start || "").trim();
    const end = String(dateRange.end || "").trim();
    if (!start || !end) return;

    const qs = new URLSearchParams();
    qs.set("start", start);
    qs.set("end", end);
    for (const ch of channels) qs.append("channel", ch);
    for (const st of states) qs.append("state", st);
    for (const sku of productValues) qs.append("sku", sku);
    for (const id of stores) qs.append("company_id", id);

    setDailyLoading(true);
    setDailyError(null);
    fetch(buildApiUrl(`/companies/me/dashboard/simulations/daily?${qs.toString()}`), {
      headers: { ...getAuthHeaders() },
      signal: ac.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as any)?.message || "Erro ao carregar simulações");
        }
        return res.json() as Promise<SimsDailyResponse>;
      })
      .then((d) => setDailySeries(Array.isArray(d?.daily) ? d.daily : []))
      .catch((e: any) => {
        setDailySeries([]);
        setDailyError(String(e?.message || "Erro ao carregar simulações"));
      })
      .finally(() => setDailyLoading(false));

    return () => ac.abort();
  }, [channels, dateRange.start, dateRange.end, productValues, states, stores]);

  // Scatter (frete × prazo) — dados reais
  useEffect(() => {
    const ac = new AbortController();
    const start = String(dateRange.start || "").trim();
    const end = String(dateRange.end || "").trim();
    if (!start || !end) return;

    const qs = new URLSearchParams();
    qs.set("start", start);
    qs.set("end", end);
    qs.set("limit", "800");
    for (const ch of channels) qs.append("channel", ch);
    for (const st of states) qs.append("state", st);
    for (const sku of productValues) qs.append("sku", sku);
    for (const id of stores) qs.append("company_id", id);

    setFreightScatterLoading(true);
    setFreightScatterError(null);
    fetch(buildApiUrl(`/companies/me/dashboard/simulations/freight-scatter?${qs.toString()}`), {
      headers: { ...getAuthHeaders() },
      signal: ac.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as any)?.message || "Erro ao carregar mapa de conversão");
        }
        return res.json() as Promise<FreightScatterResponse>;
      })
      .then((d) => setFreightScatterPoints(Array.isArray(d?.points) ? d.points : []))
      .catch((e: any) => {
        setFreightScatterPoints([]);
        setFreightScatterError(String(e?.message || "Erro ao carregar mapa de conversão"));
      })
      .finally(() => setFreightScatterLoading(false));

    return () => ac.abort();
  }, [channels, dateRange.start, dateRange.end, productValues, states, stores]);

  // Mapa por estado — dados reais (freight_quotes.destination_state)
  useEffect(() => {
    const ac = new AbortController();
    const start = String(dateRange.start || "").trim();
    const end = String(dateRange.end || "").trim();
    if (!start || !end) return;

    const qs = new URLSearchParams();
    qs.set("start", start);
    qs.set("end", end);
    for (const ch of channels) qs.append("channel", ch);
    for (const st of states) qs.append("state", st);
    for (const sku of productValues) qs.append("sku", sku);
    for (const id of stores) qs.append("company_id", id);

    setStateLoading(true);
    setStateError(null);
    fetch(buildApiUrl(`/companies/me/dashboard/simulations/by-state?${qs.toString()}`), {
      headers: { ...getAuthHeaders() },
      signal: ac.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as any)?.message || "Erro ao carregar mapa por estado");
        }
        return res.json() as Promise<SimsByStateResponse>;
      })
      .then((d) => setStateSeries(Array.isArray(d?.states) ? d.states : []))
      .catch((e: any) => {
        setStateSeries([]);
        setStateError(String(e?.message || "Erro ao carregar mapa por estado"));
      })
      .finally(() => setStateLoading(false));

    return () => ac.abort();
  }, [channels, dateRange.start, dateRange.end, productValues, states, stores]);

  // cidades removidas (filtro não será exibido nesta tela)

  const storeOptions: MultiSelectOption[] = useMemo(
    () => (filters?.stores || []).map((s) => ({ value: String(s.id), label: s.name })),
    [filters],
  );
  const channelOptions: MultiSelectOption[] = useMemo(
    () => (filters?.channels || []).map((s) => ({ value: s, label: s })),
    [filters],
  );
  const stateOptions: MultiSelectOption[] = useMemo(
    () => (filters?.states || []).map((s) => ({ value: s, label: s })),
    [filters],
  );
  const productSelectOptions: MultiSelectOption[] = useMemo(() => {
    const map = new Map<string, MultiSelectOption>();
    for (const v of productValues) {
      if (!map.has(v)) map.set(v, { value: v, label: v });
    }
    for (const p of productOptions) {
      const label = `${p.sku} — ${p.name || "Sem nome"}`;
      map.set(String(p.sku), { value: String(p.sku), label });
    }
    return Array.from(map.values());
  }, [productOptions, productValues]);

  // fator determinístico para os gráficos (reage aos filtros)
  const simScale = useMemo(() => {
    const key =
      [...stores].sort().join("|") +
      "||" +
      [...channels].sort().join("|") +
      "||" +
      [...productValues].sort().join("|") +
      "||" +
      [...states].sort().join("|") +
      "||" +
      String(dateRange.start || "") +
      ".." +
      String(dateRange.end || "");
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
    const baseFactor = 0.85 + ((h >>> 0) % 70) / 100; // 0.85..1.54
    return baseFactor;
  }, [channels, dateRange.end, dateRange.start, productValues, states, stores]);

  const avgTicketBRL = useMemo(() => {
    // ticket médio fake (determinístico), usado só para estimar "R$ perdido"
    // Mantém valores numa faixa realista e reage aos filtros.
    const ticket = 690 * simScale;
    return Math.max(120, Math.round(ticket));
  }, [simScale]);

  // --- mapa: simulações por estado (fakes determinísticos) ---
  const [mapMode, setMapMode] = useState<"conv" | "lost">("conv"); // % | R$
  const mapWrapRef = useRef<HTMLDivElement | null>(null);
  const [mapWidth, setMapWidth] = useState(0);
  const mapHeight = 360;

  const [mapHover, setMapHover] = useState<{
    id: string;
    conv: number;
    sims: number;
    orders: number;
    lostBRL: number;
    revenueBRL: number;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    const el = mapWrapRef.current;
    if (!el) return;
    const measure = () => setMapWidth(el.clientWidth || 0);
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geoFeatures = useMemo(() => ((brStates as any)?.features || []) as any[], []);

  const mapProjection = useMemo(() => {
    if (!mapWidth || !mapHeight) return null;
    if (!Array.isArray(geoFeatures) || geoFeatures.length === 0) return null;
    const fc = { type: "FeatureCollection", features: geoFeatures } as any;
    const pad = 10;
    return geoMercator().fitExtent(
      [
        [pad, pad],
        [Math.max(pad + 1, mapWidth - pad), Math.max(pad + 1, mapHeight - pad)],
      ],
      fc,
    );
  }, [geoFeatures, mapWidth]);

  const mapPath = useMemo(() => (mapProjection ? geoPath(mapProjection) : null), [mapProjection]);

  const stateSimOrders = useMemo(() => {
    const out = new Map<string, { sims: number; orders: number; conv: number; lostBRL: number; revenueBRL: number }>();
    // inicializa com 0 para todos os estados do mapa
    for (const f of geoFeatures) {
      const id = String(f?.id || f?.properties?.id || "");
      if (!id) continue;
      out.set(id, { sims: 0, orders: 0, conv: 0, lostBRL: 0, revenueBRL: 0 });
    }
    for (const r of stateSeries) {
      const uf = String(r.state || "").trim().toUpperCase();
      if (!uf) continue;
      const sims = Number(r.sims ?? 0) || 0;
      const orders = Number(r.orders ?? 0) || 0;
      const conv = sims > 0 ? orders / sims : 0;
      const lostBRL = Math.max(0, sims - orders) * avgTicketBRL; // estimativa (mantém UI atual)
      const revenueBRL = orders * avgTicketBRL; // estimativa de faturamento por UF
      out.set(uf, { sims, orders, conv, lostBRL, revenueBRL });
    }
    return out;
  }, [avgTicketBRL, geoFeatures, stateSeries]);

  const lostMax = useMemo(() => Math.max(1, ...Array.from(stateSimOrders.values()).map((x) => x.lostBRL)), [stateSimOrders]);
  const convMax = useMemo(() => Math.max(0.01, ...Array.from(stateSimOrders.values()).map((x) => x.conv)), [stateSimOrders]);

  const MAP_ORANGE_TONES = useMemo(
    () => ["#FFF3EA", "#FFE4D1", "#FFD2B0", "#FFB885", "#FF9A52", "#FF751A", "#E65F00", "#CC4F00"],
    [],
  );
  const mapUnknownColor = "#E2E8F0";
  const lostScale = useMemo(() => scaleQuantize<string>().domain([0, lostMax]).range(MAP_ORANGE_TONES), [MAP_ORANGE_TONES, lostMax]);
  const convScale = useMemo(() => scaleQuantize<string>().domain([0, convMax]).range(MAP_ORANGE_TONES), [MAP_ORANGE_TONES, convMax]);

  const stateRows = useMemo(() => {
    const rows = Array.from(stateSimOrders.entries()).map(([id, v]) => ({
      id,
      conv: v.conv,
      lostBRL: v.lostBRL,
      sims: v.sims,
      orders: v.orders,
    }));
    rows.sort((a, b) => {
      if (mapMode === "conv") {
        return b.conv - a.conv || b.sims - a.sims || a.id.localeCompare(b.id);
      }
      return b.lostBRL - a.lostBRL || b.sims - a.sims || a.id.localeCompare(b.id);
    });
    return rows;
  }, [mapMode, stateSimOrders]);

  // Buckets do scatter (discretos)
  const FREIGHT_RANGE_VALUES = useMemo(
    () => [
      "R$0,00 (FREE)",
      "entre R$ 0,01 e R$ 100,00",
      "entre R$ 100,01 e R$ 200,00",
      "entre R$ 200,01 e R$ 300,00",
      "entre R$ 300,01 e R$ 500,00",
      "entre R$ 500,01 e R$ 1.000,00",
      "entre R$ 1.000,01 e R$ 10.000,00",
      "acima de R$ 10.000,00",
    ],
    [],
  );
  const DEADLINE_BUCKETS = useMemo(() => [">0", ">5", ">10", ">15", ">20", ">25", ">30", ">35", ">40", ">45", ">60"], []);

  const freightRangeIndex = useMemo(() => {
    const m = new Map<string, number>();
    FREIGHT_RANGE_VALUES.forEach((label, idx) => m.set(label, idx));
    return m;
  }, [FREIGHT_RANGE_VALUES]);

  const deadlineBucketIndex = useMemo(() => {
    const m = new Map<string, number>();
    DEADLINE_BUCKETS.forEach((label, idx) => m.set(label, idx));
    return m;
  }, [DEADLINE_BUCKETS]);


  // scatterplot real: cada bolha é (range_value x range_deadline), tamanho = taxa de conversão
  const scatterData = useMemo(() => {
    const points = freightScatterPoints.map((p, idx) => ({
      id: `p${idx}`,
      x: freightRangeIndex.get(String(p.rangeValue ?? "")) ?? -1,
      y: deadlineBucketIndex.get(String(p.rangeDeadline ?? "")) ?? -1,
      rangeValue: String(p.rangeValue ?? ""),
      rangeDeadline: String(p.rangeDeadline ?? ""),
      total: Number(p.total ?? 0),
      orders: Number(p.orders ?? 0),
      conv: Number(p.conversion ?? 0),
      convPct: (Number(p.conversion ?? 0) || 0) * 100,
    }));
    return [{ id: "Conversão", data: points }];
  }, [deadlineBucketIndex, freightRangeIndex, freightScatterPoints]);

  // (Sankey removido) - removemos também os blocos/tabelas que dependiam dele.

  // série real: simulações e pedidos por dia (DD/MM/YYYY)
  const series = useMemo(() => {
    const sims: { x: string; y: number }[] = [];
    const orders: { x: string; y: number }[] = [];
    const byDay = new Map<string, { sims: number; orders: number }>();

    for (const r of dailySeries) {
      const x = String(r.date);
      const s = Number(r.sims ?? 0) || 0;
      const o = Number(r.orders ?? 0) || 0;
      sims.push({ x, y: s });
      orders.push({ x, y: o });
      byDay.set(x, { sims: s, orders: o });
    }

    return {
      lineData: [
        { id: "Simulações", data: sims },
        { id: "Pedidos", data: orders },
      ],
      byDay,
    };
  }, [dailySeries]);

  return (
    <div className="w-full">
      <div className="text-sm text-slate-600">
        <Link to="/dashboard" className="font-semibold text-slate-700 hover:text-slate-900 hover:underline">
          Dashboard
        </Link>{" "}
        <span className="text-slate-400">/</span> Simulações
      </div>

      <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <h1 className="text-2xl font-extrabold text-slate-900">Simulações de frete</h1>
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

      {filtersLoading || filtersError || productLoading || productError || dailyLoading || dailyError || stateLoading || stateError ? (
        <div className="mt-2 space-y-1">
          {filtersLoading ? <div className="text-sm text-slate-700">Carregando filtros...</div> : null}
          {!filtersLoading && filtersError ? <div className="text-sm text-red-600">{filtersError}</div> : null}
          {productLoading ? <div className="text-xs text-slate-600">Buscando produtos...</div> : null}
          {!productLoading && productError ? <div className="text-xs text-red-600">{productError}</div> : null}
          {dailyLoading ? <div className="text-sm text-slate-700">Carregando série diária...</div> : null}
          {!dailyLoading && dailyError ? <div className="text-sm text-red-600">{dailyError}</div> : null}
          {freightScatterLoading ? <div className="text-sm text-slate-700">Carregando mapa de conversão (frete × prazo)...</div> : null}
          {!freightScatterLoading && freightScatterError ? <div className="text-sm text-red-600">{freightScatterError}</div> : null}
          {stateLoading ? <div className="text-sm text-slate-700">Carregando mapa por estado...</div> : null}
          {!stateLoading && stateError ? <div className="text-sm text-red-600">{stateError}</div> : null}
        </div>
      ) : null}

      <Card className="mt-4 w-full border-slate-200 bg-white p-5">
        <div className="text-lg font-extrabold text-slate-900">Simulações x Pedidos (dia a dia)</div>
        <div className="mt-3" style={{ height: 380 }}>
          <ResponsiveLine
            data={series.lineData as any}
            margin={{ top: 10, right: 24, bottom: 56, left: 80 }}
            xScale={{ type: "point" }}
            yScale={{ type: "linear", min: 0, max: "auto", stacked: false }}
            axisBottom={{ tickRotation: -35, legend: "Dia", legendOffset: 46, legendPosition: "middle" }}
            axisLeft={{ legend: "", legendOffset: -60, legendPosition: "middle" }}
            enablePoints={false}
            useMesh={true}
            colors={(d) => {
              const id = String(d.id);
              if (id === "Simulações") return CHART_COLORS[1];
              return CHART_COLORS[0];
            }}
            legends={[]}
            theme={{
              axis: { ticks: { text: { fill: "#475569" } }, legend: { text: { fill: "#334155", fontWeight: 700 } } },
              grid: { line: { stroke: "#E2E8F0" } },
              tooltip: { container: { background: "#fff", color: "#0f172a", fontSize: 12, borderRadius: 12 } },
            }}
            tooltip={({ point }: any) => {
              const day = String(point?.data?.xFormatted ?? point?.data?.x ?? "");
              const row = series.byDay.get(day);
              const sims = row?.sims ?? 0;
              const orders = row?.orders ?? 0;
              const conv = sims > 0 ? (orders / sims) * 100 : 0;
              return (
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xl">
                  <div className="font-extrabold">{day}</div>
                  <div className="mt-1 flex items-center justify-between gap-6">
                    <span className="text-slate-600">Simulações</span>
                    <span className="font-extrabold text-slate-900 tabular-nums">{sims}</span>
                  </div>
                  <div className="flex items-center justify-between gap-6">
                    <span className="text-slate-600">Pedidos</span>
                    <span className="font-extrabold text-slate-900 tabular-nums">{orders}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-6">
                    <span className="text-slate-600">Conversão</span>
                    <span className="font-extrabold text-slate-900 tabular-nums">{formatPct1(conv)}</span>
                  </div>
                </div>
              );
            }}
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <div className="inline-flex items-center gap-2 text-slate-700">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_COLORS[1] }} />
            <span className="font-semibold">Simulações</span>
          </div>
          <div className="inline-flex items-center gap-2 text-slate-700">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_COLORS[0] }} />
            <span className="font-semibold">Pedidos</span>
          </div>
        </div>
      </Card>


      {/* ScatterPlot: conversão como bolhas (X=preço frete, Y=prazo) */}
      <Card className="mt-4 w-full border-slate-200 bg-white p-5">
        <div className="text-lg font-extrabold text-slate-900">Mapa de conversão (frete × prazo)</div>
        <div className="mt-1 text-sm text-slate-600">
          Cada bolha é uma combinação de <span className="font-semibold text-slate-900">faixa de frete</span> e{" "}
          <span className="font-semibold text-slate-900">prazo</span>. O tamanho representa o{" "}
          <span className="font-semibold text-slate-900">% de conversão</span>.
        </div>
        <div className="mt-3" style={{ height: 420 }}>
          <ResponsiveScatterPlot
            data={scatterData as any}
            margin={{ top: 16, right: 24, bottom: 120, left: 84 }}
            xScale={{ type: "linear", min: 0, max: FREIGHT_RANGE_VALUES.length - 1 }}
            yScale={{ type: "linear", min: 0, max: DEADLINE_BUCKETS.length - 1 }}
            axisBottom={{
              legend: "",
              legendOffset: 44,
              legendPosition: "middle",
              tickRotation: -35,
              tickPadding: 6,
              tickValues: FREIGHT_RANGE_VALUES.map((_, i) => i) as any,
              format: (v: any) => FREIGHT_RANGE_VALUES[Math.round(Number(v))] ?? "",
            }}
            axisLeft={{
              legend: "Prazo (dias)",
              legendOffset: -56,
              legendPosition: "middle",
              tickValues: DEADLINE_BUCKETS.map((_, i) => i) as any,
              format: (v: any) => DEADLINE_BUCKETS[Math.round(Number(v))] ?? "",
            }}
            colors={() => "#FF751A"}
            blendMode="multiply"
            useMesh={true}
            nodeSize={(node: any) => {
              // @nivo/scatterplot pode variar o shape do node; garantimos sempre um número válido aqui
              const raw = Number((node?.data as any)?.convPct ?? (node?.data as any)?.data?.convPct ?? 0);
              const v = Number.isFinite(raw) ? raw : 0;
              const clamped = Math.max(0, Math.min(70, v));
              return 6 + (clamped / 70) * (28 - 6);
            }}
            gridXValues={FREIGHT_RANGE_VALUES.map((_, i) => i) as any}
            gridYValues={DEADLINE_BUCKETS.map((_, i) => i) as any}
            tooltip={({ node }: any) => {
              const d = (node?.data as any) ?? {};
              const conv = Number(d?.conv ?? 0);
              const total = Number(d?.total ?? 0);
              const orders = Number(d?.orders ?? 0);
              return (
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xl">
                  <div className="font-extrabold">{String(d?.rangeValue ?? "")}</div>
                  <div className="text-slate-600">Prazo: {String(d?.rangeDeadline ?? "")}</div>
                  <div className="mt-1">
                    Conversão: <span className="font-extrabold">{formatPct(conv)}</span>
                  </div>
                  <div>
                    Pedidos: <span className="font-extrabold">{formatBigNumber(orders)}</span>
                  </div>
                  <div>
                    Solicitações: <span className="font-extrabold">{formatBigNumber(total)}</span>
                  </div>
                </div>
              );
            }}
            theme={{
              axis: { ticks: { text: { fill: "#475569" } }, legend: { text: { fill: "#334155", fontWeight: 700 } } },
              grid: { line: { stroke: "#E2E8F0" } },
              tooltip: { container: { background: "#fff", color: "#0f172a", fontSize: 12, borderRadius: 12 } },
            }}
          />
        </div>
      </Card>

      {/* Mapa (toggle %/R$) + tabela por estado */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="w-full border-slate-200 bg-white p-5 lg:col-span-7">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-lg font-extrabold text-slate-900">Mapa por estado</div>
              <div className="mt-1 text-xs text-slate-600">
                {mapMode === "conv"
                  ? "Conversão = pedidos ÷ simulações"
                  : `Estimativa: (simulações − pedidos) × ticket médio (${formatBRLNoSpace(avgTicketBRL)})`}
              </div>
            </div>
            <div className="inline-flex overflow-hidden rounded-xl border border-slate-200 bg-white">
              <button
                type="button"
                onClick={() => setMapMode("conv")}
                className={[
                  "px-3 py-1.5 text-sm font-semibold",
                  mapMode === "conv" ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50",
                ].join(" ")}
              >
                %
              </button>
              <button
                type="button"
                onClick={() => setMapMode("lost")}
                className={[
                  "px-3 py-1.5 text-sm font-semibold border-l border-slate-200",
                  mapMode === "lost" ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50",
                ].join(" ")}
              >
                R$
              </button>
            </div>
          </div>

          <div className="mt-3 relative w-full" style={{ height: mapHeight }} ref={mapWrapRef}>
            {geoFeatures.length > 0 && mapWidth > 0 && mapPath ? (
              <>
                <svg width={mapWidth} height={mapHeight} role="img" aria-label="Mapa do Brasil por estado">
                  {geoFeatures.map((f: any) => {
                    const id = String(f?.id || f?.properties?.id || "");
                    const d = mapPath(f);
                    if (!id || !d) return null;
                    const row = stateSimOrders.get(id);
                    const conv = Number(row?.conv ?? 0);
                    const lostBRL = Number(row?.lostBRL ?? 0);
                    const revenueBRL = Number(row?.revenueBRL ?? 0);
                    const fill =
                      !row ? mapUnknownColor : mapMode === "conv" ? convScale(conv) : lostScale(lostBRL);
                    return (
                      <path
                        key={id}
                        d={d}
                        fill={fill}
                        stroke="#CBD5E1"
                        strokeWidth={0.6}
                        onMouseLeave={() => setMapHover(null)}
                        onMouseMove={(e) => {
                          const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement | null)?.getBoundingClientRect();
                          const x = rect ? e.clientX - rect.left : 0;
                          const y = rect ? e.clientY - rect.top : 0;
                          setMapHover({
                            id,
                            conv,
                            lostBRL,
                            revenueBRL,
                            sims: Number(row?.sims ?? 0),
                            orders: Number(row?.orders ?? 0),
                            x,
                            y,
                          });
                        }}
                        style={{ cursor: "default" }}
                      />
                    );
                  })}
                </svg>

                {mapHover ? (
                  <div
                    className="pointer-events-none absolute z-10 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xl"
                    style={{
                      left: Math.min(mapWidth - 210, Math.max(8, mapHover.x + 12)),
                      top: Math.min(mapHeight - 76, Math.max(8, mapHover.y - 12)),
                      width: 210,
                    }}
                  >
                    <div className="font-extrabold">{mapHover.id}</div>
                    <div className="mt-1 text-slate-700">
                      Conversão: {formatPct(mapHover.conv)}
                    </div>
                    <div className="text-slate-700">Faturamento: {formatBRLBig(mapHover.revenueBRL)}</div>
                    <div className="text-slate-600">
                      Pedidos: {formatBigNumber(mapHover.orders)} • Simulações: {formatBigNumber(mapHover.sims)}
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                {!geoFeatures.length ? "GeoJSON inválido (sem features)" : !mapWidth ? "Carregando largura do container..." : "Carregando mapa..."}
              </div>
            )}
          </div>
        </Card>

        <Card className="w-full border-slate-200 bg-white p-5 lg:col-span-5">
          <div className="text-lg font-extrabold text-slate-900">Estados</div>
          <div className="mt-1 text-xs text-slate-600">
            {mapMode === "conv" ? "Ordenado por conversão (pedidos ÷ simulações)" : "Ordenado por R$ perdido (estimativa)"}
          </div>
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
            <div className="max-h-[360px] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr className="text-xs font-extrabold text-slate-600">
                    <th className="px-4 py-3">UF</th>
                    <th className="px-4 py-3 text-right">Pedidos</th>
                    <th className="px-4 py-3 text-right">Simulações</th>
                    <th className="px-4 py-3 text-right">Conversão</th>
                    <th className="px-4 py-3 text-right">R$ perdido</th>
                  </tr>
                </thead>
                <tbody>
                  {stateRows.map((row) => (
                    <tr key={row.id} className="border-t border-slate-200">
                      <td className="px-4 py-3 text-slate-900">{row.id}</td>
                      <td className="px-4 py-3 text-right text-slate-900 tabular-nums">{formatBigNumber(row.orders)}</td>
                      <td className="px-4 py-3 text-right text-slate-700 tabular-nums">{formatBigNumber(row.sims)}</td>
                      <td
                        className={[
                          "px-4 py-3 text-right tabular-nums",
                          mapMode === "conv" ? "text-slate-900 font-extrabold" : "text-slate-600",
                        ].join(" ")}
                      >
                        {formatPct(row.conv)}
                      </td>
                      <td
                        className={[
                          "px-4 py-3 text-right tabular-nums",
                          mapMode === "lost" ? "text-slate-900 font-extrabold" : "text-slate-600",
                        ].join(" ")}
                      >
                        {formatBRLBig(row.lostBRL)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      </div>

      {/* (Sankey removido) */}

      <SlideOver open={filtersOpen} title="Filtros" onClose={() => setFiltersOpen(false)}>
        {filtersLoading ? <div className="text-slate-700">Carregando filtros...</div> : null}
        {!filtersLoading && filtersError ? <div className="text-sm text-red-600">{filtersError}</div> : null}
        {!filtersLoading && !filtersError && filters ? (
          <div className="space-y-4">
            <MultiSelect label="Loja" options={storeOptions} values={stores} onChange={setStores} placeholder="Todas" />
            <MultiSelect label="Canal" options={channelOptions} values={channels} onChange={setChannels} placeholder="Todos" />
            <MultiSelect
              label="Produto"
              options={productSelectOptions}
              values={productValues}
              onChange={setProductValues}
              placeholder="Buscar por SKU ou nome"
              onSearchChange={setProductQuery}
              searchPlaceholder="Digite para buscar..."
            />
            <MultiSelect label="Estado" options={stateOptions} values={states} onChange={setStates} placeholder="Todos" />
            <div className="pt-2 text-xs text-slate-600">
              Os filtros desta tela afetam os gráficos usando dados do AllPost (freight quotes / freight orders).
            </div>
          </div>
        ) : null}
      </SlideOver>
    </div>
  );
};

export default DashboardSimulacoes;


