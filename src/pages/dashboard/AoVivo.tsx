import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { ResponsiveLine } from "@nivo/line";
import { ResponsivePie } from "@nivo/pie";
import { ResponsiveBar } from "@nivo/bar";
import { line as d3Line } from "d3-shape";
import { geoMercator, geoPath } from "d3-geo";
import { scaleQuantize } from "d3-scale";
import { SlideOver } from "@/components/ui/slideover";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/multi-select";
import { CHART_COLORS } from "@/lib/chartColors";
import { buildApiUrl } from "@/lib/config";
import { getAuthHeaders } from "@/lib/auth";
import { TrendingDown, TrendingUp, SlidersHorizontal } from "lucide-react";
import brStates from "@/assets/geo/br_states.json";

const DashboardAoVivo = () => {
  const formatBRLNoSpace = (value: number): string =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value).replace(/\u00A0/g, "");

  const formatInt = (value: number): string => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);

  const formatBRLCompact = (value: number): string =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 })
      .format(value)
      .replace(/\u00A0/g, "");

  const formatPct1 = (value: number): string => `${value.toFixed(1).replace(".", ",")}%`;

  const truncate10 = (value: string): string => {
    const s = String(value ?? "");
    if (s.length <= 10) return s;
    return `${s.slice(0, 7)}...`;
  };

  const hexToRgba = (hex: string, alpha: number): string => {
    const h = String(hex || "").replace("#", "").trim();
    if (h.length !== 6) return hex;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const a = Math.max(0, Math.min(1, alpha));
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  };

  const DeltaBadge = ({
    current,
    previous,
    compareLabel,
    formatValue,
  }: {
    current: number;
    previous: number;
    compareLabel: string;
    formatValue: (n: number) => string;
  }) => {
    if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
    const ratio = current / previous;
    const delta = ratio - 1;
    const pct = Math.abs(delta) * 100;
    const up = delta >= 0;

    return (
      <span
        className={[
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-extrabold",
          up ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700",
        ].join(" ")}
        title={`${compareLabel}: ${formatValue(previous)} | Hoje: ${formatValue(current)}`}
      >
        {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
        {formatPct1(pct)}
      </span>
    );
  };

  const now = new Date();
  const currentHour = now.getHours();
  type HourlyRow = { day: string; hour: number; revenue: number };
  type LiveKpis = {
    revenueSoFar: number;
    revenueDay: number;
    orders: number;
    uniqueCustomers: number;
    itemsSold: number;
    avgTicket: number;
    cartItemsAdded: number;
    conversionPct: number;
  };
  type LiveResponse = {
    today: string;
    currentHour: number;
    projection: { projectedTodayTotal: number };
    kpis: {
      today: LiveKpis;
      yesterday: LiveKpis;
      d7: LiveKpis;
      d14: LiveKpis;
      d21: LiveKpis;
      d28: LiveKpis;
    };
    hourly: HourlyRow[];
    topProducts: { sku: string; name: string | null; qty: number; revenue: number }[];
    byMarketplace: { id: string; value: number }[];
    byCategory: { id: string; value: number }[];
    byState: { id: string; value: number }[];
  };
  const [live, setLive] = useState<LiveResponse | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const d7Label = "D-7";
  const d14Label = "D-14";
  const d21Label = "D-21";
  const d28Label = "D-28";
  type ComparePeriod = "Ontem" | "D-7" | "D-14" | "D-21" | "D-28";
  const [comparePeriod, setComparePeriod] = useState<ComparePeriod>("D-7");

  const projectedTodayTotal = live?.projection?.projectedTodayTotal ?? 0;
  const todaySoFar = live?.kpis?.today?.revenueSoFar ?? 0;

  // filtros (mesma base do dashboard, sem data)
  type FiltersResponse = {
    stores: { id: number; name: string }[];
    statuses: string[];
    channels: string[];
    categories: string[];
    states: string[];
    cities: string[];
  };
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtersLoading, setFiltersLoading] = useState(true);
  const [filtersError, setFiltersError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FiltersResponse | null>(null);

  const [stores, setStores] = useState<string[]>([]);
  const [channels, setChannels] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);

  const [citiesOverride, setCitiesOverride] = useState<string[] | null>(null);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [citiesError, setCitiesError] = useState<string | null>(null);

  const initialStoresSet = useRef(false);

  // Mapa: evita o "ResponsiveWrapper" do Nivo (que pode medir width/height como 0 e renderizar em branco)
  const mapWrapRef = useRef<HTMLDivElement | null>(null);
  const [mapWidth, setMapWidth] = useState(0);
  const mapHeight = 360;
  const [mapHover, setMapHover] = useState<{ id: string; value: number | null; x: number; y: number } | null>(null);

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
  }, [geoFeatures, mapWidth, mapHeight]);

  const mapPath = useMemo(() => (mapProjection ? geoPath(mapProjection) : null), [mapProjection]);
  const mapUnknownColor = "#E2E8F0";

  useEffect(() => {
    const ac = new AbortController();
    setFiltersLoading(true);
    setFiltersError(null);
    fetch(buildApiUrl("/companies/me/dashboard/filters"), { headers: { ...getAuthHeaders() }, signal: ac.signal })
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
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as any)?.message || "Erro ao carregar cidades");
        }
        return res.json() as Promise<string[]>;
      })
      .then((list) => {
        const next = Array.isArray(list) ? list : [];
        setCitiesOverride(next);
        setCities((cur) => cur.filter((c) => next.includes(c)));
      })
      .catch((e: any) => {
        setCitiesOverride([]);
        setCitiesError(String(e?.message || "Erro ao carregar cidades"));
      })
      .finally(() => setCitiesLoading(false));

    return () => ac.abort();
  }, [filters, states]);

  const storeOptions: MultiSelectOption[] = useMemo(
    () => (filters?.stores || []).map((s) => ({ value: String(s.id), label: s.name })),
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

  const todaySoFarF = todaySoFar;
  const projectedTodayTotalF = projectedTodayTotal;

  useEffect(() => {
    if (!filters) return;
    if (!initialStoresSet.current) return;

    const ac = new AbortController();
    setLiveLoading(true);
    setLiveError(null);

    const qs = new URLSearchParams();
    for (const s of stores) qs.append("company_id", s);
    for (const c of channels) qs.append("channel", c);
    for (const c of categories) qs.append("category", c);
    for (const st of states) qs.append("state", st);
    for (const city of cities) qs.append("city", city);

    fetch(buildApiUrl(`/companies/me/dashboard/live/overview?${qs.toString()}`), {
      headers: { ...getAuthHeaders() },
      signal: ac.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as any)?.message || "Erro ao carregar Ao Vivo");
        }
        return res.json() as Promise<LiveResponse>;
      })
      .then((d) => setLive(d))
      .catch((e: any) => {
        if (String(e?.name || "") === "AbortError") return;
        setLive(null);
        setLiveError(String(e?.message || "Erro ao carregar Ao Vivo"));
      })
      .finally(() => setLiveLoading(false));

    return () => ac.abort();
  }, [filters, stores, channels, categories, states, cities]);

  const apiHour = live?.currentHour;
  const currentHourLabel = String(Number.isInteger(apiHour) ? apiHour : currentHour).padStart(2, "0");

  const buildHourly = (rows: HourlyRow[], day: string): { x: string; y: number }[] => {
    const map = new Map<number, number>();
    for (const r of rows) {
      if (r.day === day) map.set(Number(r.hour), Number(r.revenue) || 0);
    }
    const pts: { x: string; y: number }[] = [];
    for (let h = 0; h < 24; h++) {
      pts.push({ x: `${String(h).padStart(2, "0")}:00`, y: Number(map.get(h) ?? 0) || 0 });
    }
    return pts;
  };

  const lineData = useMemo(() => {
    const rows = live?.hourly || [];
    const today = live?.today || "";
    const y = today ? new Date(`${today}T00:00:00`) : new Date();
    const ymd = (d: Date) => d.toISOString().slice(0, 10);
    const yesterday = today ? ymd(new Date(y.getTime() - 1 * 86400000)) : "";
    const d7 = today ? ymd(new Date(y.getTime() - 7 * 86400000)) : "";
    const d14 = today ? ymd(new Date(y.getTime() - 14 * 86400000)) : "";
    const d21 = today ? ymd(new Date(y.getTime() - 21 * 86400000)) : "";
    const d28 = today ? ymd(new Date(y.getTime() - 28 * 86400000)) : "";
    const hNow = Number.isInteger(apiHour) ? (apiHour as number) : currentHour;

    const todayFull = today
      ? buildHourly(rows, today)
      : Array.from({ length: 24 }, (_, h) => ({ x: `${String(h).padStart(2, "0")}:00`, y: 0 }));
    const lastWeekSameDay = d7 ? buildHourly(rows, d7) : todayFull.map((p) => ({ ...p, y: 0 }));

    // Projeção por hora: usa a "distribuição" do D-7 e escala pelo total projetado do dia.
    const projTotal = projectedTodayTotalF;
    const d7Total = lastWeekSameDay.reduce((a, b) => a + (Number(b.y) || 0), 0);
    const projScaled =
      projTotal > 0 && d7Total > 0
        ? lastWeekSameDay.map((p) => ({ ...p, y: (Number(p.y) || 0) * (projTotal / d7Total) }))
        : lastWeekSameDay.map((p) => ({ ...p, y: 0 }));

    const todayActual = todayFull.map((p, idx) => ({ x: p.x, y: idx <= hNow ? p.y : null }));
    const todayProjection = projScaled.map((p, idx) => ({ x: p.x, y: idx >= hNow ? p.y : null }));

    return [
      { id: "Hoje", data: todayActual },
      { id: "Hoje (projeção)", data: todayProjection },
      { id: "Ontem", data: yesterday ? buildHourly(rows, yesterday) : todayFull.map((p) => ({ ...p, y: 0 })) },
      { id: d7Label, data: d7 ? lastWeekSameDay : todayFull.map((p) => ({ ...p, y: 0 })) },
      { id: d14Label, data: d14 ? buildHourly(rows, d14) : todayFull.map((p) => ({ ...p, y: 0 })) },
      { id: d21Label, data: d21 ? buildHourly(rows, d21) : todayFull.map((p) => ({ ...p, y: 0 })) },
      { id: d28Label, data: d28 ? buildHourly(rows, d28) : todayFull.map((p) => ({ ...p, y: 0 })) },
    ];
  }, [live, apiHour, currentHour, d7Label, d14Label, d21Label, d28Label, projectedTodayTotalF, todaySoFarF]);

  const dashedProjectionLayer = (props: any) => {
    const serie = props.series?.find((s: any) => s.id === "Hoje (projeção)");
    if (!serie) return null;
    const pts = (serie.data || []).map((d: any) => d.position);
    const gen = d3Line<any>()
      .x((d) => d.x)
      .y((d) => d.y);
    const d = gen(pts);
    if (!d) return null;
    return (
      <path
        d={d}
        fill="none"
        stroke={CHART_COLORS[6]}
        strokeWidth={2.5}
        strokeDasharray="6 6"
        opacity={0.95}
      />
    );
  };

  const topProducts = useMemo(() => {
    const rows = live?.topProducts || [];
    return rows.map((r) => ({ name: String(r.name ?? r.sku ?? ""), qty: Number(r.qty ?? 0) || 0, revenue: Number(r.revenue ?? 0) || 0 }));
  }, [live]);

  const kpis = useMemo(() => {
    const t = live?.kpis?.today;
    return {
      uniqueCustomers: Number(t?.uniqueCustomers ?? 0) || 0,
      cartItemsAdded: Number(t?.cartItemsAdded ?? 0) || 0,
      orders: Number(t?.orders ?? 0) || 0,
      conversionPct: Number(t?.conversionPct ?? 0) || 0,
      itemsSold: Number(t?.itemsSold ?? 0) || 0,
      avgTicket: Number(t?.avgTicket ?? 0) || 0,
    };
  }, [live]);

  const kpisPrev = useMemo(() => {
    const src =
      comparePeriod === "Ontem"
        ? live?.kpis?.yesterday
        : comparePeriod === "D-7"
          ? live?.kpis?.d7
          : comparePeriod === "D-14"
            ? live?.kpis?.d14
            : comparePeriod === "D-21"
              ? live?.kpis?.d21
              : live?.kpis?.d28;
    return {
      uniqueCustomers: Number(src?.uniqueCustomers ?? 0) || 0,
      cartItemsAdded: Number(src?.cartItemsAdded ?? 0) || 0,
      orders: Number(src?.orders ?? 0) || 0,
      conversionPct: Number(src?.conversionPct ?? 0) || 0,
      itemsSold: Number(src?.itemsSold ?? 0) || 0,
      avgTicket: Number(src?.avgTicket ?? 0) || 0,
    };
  }, [live, comparePeriod]);

  const pieByCategory = useMemo(() => (live?.byCategory || []).map((d) => ({ id: d.id, label: d.id, value: d.value })), [live]);

  const BAR_ORANGE = "#FF751A";

  const pieByMarketplace = useMemo(() => (live?.byMarketplace || []).map((d) => ({ id: d.id, label: d.id, value: d.value })), [live]);

  const marketplaceColorById = useMemo(() => {
    const map = new Map<string, string>();
    for (let i = 0; i < pieByMarketplace.length; i++) {
      map.set(String((pieByMarketplace as any)[i]?.id ?? ""), CHART_COLORS[i % CHART_COLORS.length]);
    }
    return map;
  }, [pieByMarketplace]);

  const toggleSingle = (setter: (v: string[]) => void, current: string[], next: string) => {
    if (current.length === 1 && current[0] === next) setter([]);
    else setter([next]);
  };

  const salesByUF = useMemo(() => (live?.byState || []).map((d) => ({ id: d.id, value: d.value })), [live]);

  const salesByUFMap = useMemo(() => new Map(salesByUF.map((d) => [String(d.id), d.value])), [salesByUF]);
  const mapMax = useMemo(() => Math.max(1, ...salesByUF.map((d) => d.value)), [salesByUF]);
  const MAP_ORANGE_TONES = useMemo(
    () => [
      "#FFF3EA",
      "#FFE4D1",
      "#FFD2B0",
      "#FFB885",
      "#FF9A52",
      "#FF751A",
      "#E65F00",
      "#CC4F00",
    ],
    [],
  );
  const mapScale = useMemo(() => scaleQuantize<string>().domain([0, mapMax]).range(MAP_ORANGE_TONES), [mapMax, MAP_ORANGE_TONES]);


  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-slate-600">
          <Link to="/dashboard" className="font-semibold text-slate-700 hover:text-slate-900 hover:underline">
            Dashboard
          </Link>{" "}
          <span className="text-slate-400">/</span> Vendas ao vivo
        </div>
        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filtros
        </button>
      </div>
      <h1 className="text-2xl font-extrabold text-slate-900">Vendas ao vivo (Hoje)</h1>
      {liveLoading ? <div className="mt-2 text-sm text-slate-600">Carregando dados ao vivo...</div> : null}
      {!liveLoading && liveError ? <div className="mt-2 text-sm text-red-600">{liveError}</div> : null}

      {/* Topo: totalizador */}
      <Card className="mt-3 w-full border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="text-sm font-semibold text-slate-600">Faturamento de hoje</div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-extrabold text-emerald-700">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-600" />
                </span>
                AO VIVO
              </div>
            </div>
            <div className="mt-2 text-3xl font-extrabold text-slate-900">{formatBRLNoSpace(todaySoFarF)}</div>
            <div className="mt-1 text-xs text-slate-600">
              Projeção de hoje: <span className="font-extrabold text-slate-900">{formatBRLNoSpace(projectedTodayTotalF)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <div className="text-xs font-semibold text-slate-500">Clientes únicos</div>
              <div className="mt-1 flex items-center justify-between gap-2">
              <div className="text-lg font-extrabold text-slate-900">{kpis.uniqueCustomers}</div>
                <span className="shrink-0">
                  <DeltaBadge
                    current={kpis.uniqueCustomers}
                    previous={kpisPrev.uniqueCustomers}
                    compareLabel={comparePeriod}
                    formatValue={(n) => formatInt(Number(n))}
                  />
                </span>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <div className="text-xs font-semibold text-slate-500">Pedidos</div>
              <div className="mt-1 flex items-center justify-between gap-2">
              <div className="text-lg font-extrabold text-slate-900">{kpis.orders}</div>
                <span className="shrink-0">
                  <DeltaBadge current={kpis.orders} previous={kpisPrev.orders} compareLabel={comparePeriod} formatValue={(n) => formatInt(Number(n))} />
                </span>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <div className="text-xs font-semibold text-slate-500">Ticket médio</div>
              <div className="mt-1 flex items-center justify-between gap-2">
              <div className="text-lg font-extrabold text-slate-900">{formatBRLNoSpace(kpis.avgTicket)}</div>
                <span className="shrink-0">
                  <DeltaBadge
                    current={kpis.avgTicket}
                    previous={kpisPrev.avgTicket}
                    compareLabel={comparePeriod}
                    formatValue={(n) => formatBRLNoSpace(Number(n))}
                  />
                </span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Linha: vendas por hora */}
      <Card className="mt-4 w-full border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-lg font-extrabold text-slate-900">Venda hora a hora</div>
          </div>
          <div className="text-xs text-slate-600">
            Hora atual: <span className="font-extrabold text-slate-900">{currentHourLabel}:00</span>
          </div>
        </div>

        {/* legenda (fora do gráfico) */}
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <div className="inline-flex items-center gap-2 text-slate-700">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_COLORS[1] }} />
            <span className="font-semibold">Hoje</span>
          </div>
          <button
            type="button"
            onClick={() => setComparePeriod("Ontem")}
            className={[
              "inline-flex items-center gap-2 text-slate-700 hover:text-slate-900",
              comparePeriod === "Ontem" ? "font-extrabold" : "font-semibold",
            ].join(" ")}
            aria-pressed={comparePeriod === "Ontem"}
            title="Comparar os KPIs com Ontem"
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_COLORS[0] }} />
            <span>Ontem</span>
          </button>
          <button
            type="button"
            onClick={() => setComparePeriod("D-7")}
            className={[
              "inline-flex items-center gap-2 text-slate-700 hover:text-slate-900",
              comparePeriod === "D-7" ? "font-extrabold" : "font-semibold",
            ].join(" ")}
            aria-pressed={comparePeriod === "D-7"}
            title="Comparar os KPIs com D-7"
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_COLORS[5] }} />
            <span>{d7Label}</span>
          </button>
          <button
            type="button"
            onClick={() => setComparePeriod("D-14")}
            className={[
              "inline-flex items-center gap-2 text-slate-700 hover:text-slate-900",
              comparePeriod === "D-14" ? "font-extrabold" : "font-semibold",
            ].join(" ")}
            aria-pressed={comparePeriod === "D-14"}
            title="Comparar os KPIs com D-14"
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_COLORS[2] }} />
            <span>{d14Label}</span>
          </button>
          <button
            type="button"
            onClick={() => setComparePeriod("D-21")}
            className={[
              "inline-flex items-center gap-2 text-slate-700 hover:text-slate-900",
              comparePeriod === "D-21" ? "font-extrabold" : "font-semibold",
            ].join(" ")}
            aria-pressed={comparePeriod === "D-21"}
            title="Comparar os KPIs com D-21"
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_COLORS[3] }} />
            <span>{d21Label}</span>
          </button>
          <button
            type="button"
            onClick={() => setComparePeriod("D-28")}
            className={[
              "inline-flex items-center gap-2 text-slate-700 hover:text-slate-900",
              comparePeriod === "D-28" ? "font-extrabold" : "font-semibold",
            ].join(" ")}
            aria-pressed={comparePeriod === "D-28"}
            title="Comparar os KPIs com D-28"
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_COLORS[4] }} />
            <span>{d28Label}</span>
          </button>
          <div className="inline-flex items-center gap-2 text-slate-700">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_COLORS[6] }} />
            <span className="font-semibold">Hoje (projeção)</span>
          </div>
          <div className="text-xs text-slate-500">
            KPIs comparando com: <span className="font-semibold text-slate-700">{comparePeriod}</span>
          </div>
        </div>

        <div className="mt-3" style={{ height: 360 }}>
          <ResponsiveLine
            data={lineData as any}
            margin={{ top: 10, right: 24, bottom: 48, left: 88 }}
            xScale={{ type: "point" }}
            yScale={{ type: "linear", min: 0, max: "auto", stacked: false }}
            axisBottom={{
              tickRotation: -45,
              legend: "Hora",
              legendOffset: 40,
              legendPosition: "middle",
            }}
            axisLeft={{
              format: (v) => formatBRLCompact(Number(v)),
            }}
            enablePoints={true}
            pointSize={6}
            pointBorderWidth={1}
            pointBorderColor={{ from: "color", modifiers: [["darker", 0.3]] }}
            useMesh={true}
            colors={(d) => {
              const id = String(d.id);
              if (id === "Hoje") return CHART_COLORS[1];
              if (id === "Hoje (projeção)") return "transparent"; // desenhado via layer pontilhada
              if (id === "Ontem") return CHART_COLORS[0];
              if (id === d7Label) return CHART_COLORS[5];
              if (id === d14Label) return CHART_COLORS[2];
              if (id === d21Label) return CHART_COLORS[3];
              if (id === d28Label) return CHART_COLORS[4];
              return CHART_COLORS[5];
            }}
            legends={[]}
            tooltip={({ point }: any) => {
              const serieLabel =
                point?.serieId ??
                point?.serie?.id ??
                point?.data?.serieId ??
                point?.data?.id ??
                point?.id ??
                "";
              return (
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xl">
                  <div className="font-extrabold">{String(serieLabel || "-")}</div>
                  <div className="text-slate-700">{String(point?.data?.x ?? "")}</div>
                  <div className="mt-0.5">{formatBRLNoSpace(Number(point?.data?.y ?? 0))}</div>
                </div>
              );
            }}
            theme={{
              axis: { ticks: { text: { fill: "#475569" } }, legend: { text: { fill: "#334155", fontWeight: 700 } } },
              grid: { line: { stroke: "#E2E8F0" } },
              legends: { text: { fill: "#334155" } },
              tooltip: { container: { background: "#fff", color: "#0f172a", fontSize: 12, borderRadius: 12 } },
            }}
            layers={["grid", "markers", "areas", "lines", "points", dashedProjectionLayer, "slices", "mesh", "axes"]}
          />
        </div>
      </Card>

      {/* 2ª linha */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Lista produtos */}
        <Card className="w-full border-slate-200 bg-white p-5 lg:col-span-6">
          <div className="text-lg font-extrabold text-slate-900">Produtos mais vendidos</div>
          <div className="mt-3 space-y-3">
            {topProducts.length ? (
              topProducts.map((p) => (
              <div key={p.name} className="flex items-start justify-between gap-3 border-t border-slate-200 pt-3 first:border-t-0 first:pt-0">
                <div className="min-w-0 flex items-start gap-3">
                  <div className="h-10 w-10 shrink-0 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center font-extrabold text-slate-700">
                    {String(p.name || "P").trim().charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                      <div className="font-semibold text-slate-900 truncate" title={p.name}>
                        {truncate10(p.name)}
                      </div>
                    <div className="text-xs text-slate-600">{p.qty} vendidos</div>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xs text-slate-500">Faturamento</div>
                  <div className="font-extrabold text-slate-900">{formatBRLNoSpace(p.revenue)}</div>
                </div>
              </div>
              ))
            ) : (
              <div className="text-sm text-slate-500">Sem dados.</div>
            )}
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:col-span-6 lg:grid-cols-2">
        {/* Pedidos x Frete */}
          <Card className="w-full border-slate-200 bg-white p-5">
          <div className="text-lg font-extrabold text-slate-900">Pedidos x Frete</div>
          <div className="mt-3 space-y-3 text-sm">
            <div>
              <div className="text-xs font-semibold text-slate-500">Itens no carrinho</div>
                <div className="mt-1 flex items-center justify-between gap-2">
              <div className="text-2xl font-extrabold text-slate-900">{kpis.cartItemsAdded}</div>
                  <span className="shrink-0">
                    <DeltaBadge
                      current={kpis.cartItemsAdded}
                      previous={kpisPrev.cartItemsAdded}
                      compareLabel={comparePeriod}
                      formatValue={(n) => formatInt(Number(n))}
                    />
                  </span>
                </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-500">Itens vendidos</div>
                <div className="mt-1 flex items-center justify-between gap-2">
              <div className="text-2xl font-extrabold text-slate-900">{kpis.itemsSold}</div>
                  <span className="shrink-0">
                    <DeltaBadge
                      current={kpis.itemsSold}
                      previous={kpisPrev.itemsSold}
                      compareLabel={comparePeriod}
                      formatValue={(n) => formatInt(Number(n))}
                    />
                  </span>
                </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-500">Conversão</div>
                <div className="mt-1 flex items-center justify-between gap-2">
              <div className="text-2xl font-extrabold text-slate-900">{String(kpis.conversionPct).replace(".", ",")}%</div>
                  <span className="shrink-0">
                    <DeltaBadge
                      current={kpis.conversionPct}
                      previous={kpisPrev.conversionPct}
                      compareLabel={comparePeriod}
                      formatValue={(n) => `${String(Number(n).toFixed(1)).replace(".", ",")}%`}
                    />
                  </span>
                </div>
            </div>
          </div>
        </Card>

        {/* Pizza por marketplace */}
          <Card className="w-full border-slate-200 bg-white p-5">
          <div className="text-lg font-extrabold text-slate-900">Faturamento por marketplace</div>
          <div className="mt-3" style={{ height: 280 }}>
            {pieByMarketplace.length ? (
            <ResponsivePie
              data={pieByMarketplace as any}
              margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
              innerRadius={0.55}
              padAngle={0.8}
              cornerRadius={6}
              activeOuterRadiusOffset={8}
                colors={(d: any) => {
                  const id = String(d?.id ?? "");
                  const base = marketplaceColorById.get(id) || CHART_COLORS[0];
                  const hasActive = channels.length === 1;
                  if (hasActive && channels[0] !== id) return hexToRgba(base, 0.2);
                  return base;
                }}
              enableArcLinkLabels={false}
              arcLabelsSkipAngle={10}
              arcLabelsTextColor="#0f172a"
              onClick={(d: any) => toggleSingle(setChannels, channels, String(d.id))}
              valueFormat={(v: any) => formatBRLNoSpace(Number(v))}
              arcLabel={(d: any) => formatBRLNoSpace(Number(d.value))}
              tooltip={({ datum }: any) => (
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xl">
                  <div className="font-extrabold">{datum.label}</div>
                  <div>{formatBRLNoSpace(datum.value)}</div>
                </div>
              )}
            />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">Sem dados.</div>
            )}
          </div>
          {channels.length ? (
            <div className="mt-2 text-xs text-slate-600">
              Marketplace ativo: <span className="font-semibold text-slate-900">{channels.join(", ")}</span>
            </div>
          ) : null}
        </Card>
        </div>
      </div>

      {/* 3ª linha */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Barras por categoria (clicável) */}
        <Card className="w-full border-slate-200 bg-white p-5 lg:col-span-6">
          <div className="text-lg font-extrabold text-slate-900">Faturamento por categoria</div>
          <div className="mt-3" style={{ height: 320 }}>
            {pieByCategory.length ? (
            <ResponsiveBar
              data={pieByCategory.map((d) => ({ categoria: String(d.id), faturamento: Number(d.value) })) as any}
              keys={["faturamento"]}
              indexBy="categoria"
              margin={{ top: 10, right: 16, bottom: 70, left: 92 }}
              padding={0.35}
              colors={({ indexValue }: any) => {
                const id = String(indexValue ?? "");
                const hasActive = categories.length === 1;
                if (hasActive && categories[0] !== id) return hexToRgba(BAR_ORANGE, 0.2);
                return BAR_ORANGE;
              }}
              borderRadius={6}
              enableGridX={false}
              enableGridY={true}
              axisLeft={{
                format: (v) => formatBRLCompact(Number(v)),
                legend: "",
              }}
              axisBottom={{
                tickRotation: -25,
                tickPadding: 10,
              }}
              enableLabel={false}
              tooltip={({ indexValue, value }: any) => (
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xl">
                  <div className="font-extrabold">{String(indexValue)}</div>
                  <div>{formatBRLNoSpace(Number(value))}</div>
                </div>
              )}
              theme={{
                axis: { ticks: { text: { fill: "#475569" } }, legend: { text: { fill: "#334155", fontWeight: 700 } } },
                grid: { line: { stroke: "#E2E8F0" } },
                tooltip: { container: { background: "#fff", color: "#0f172a", fontSize: 12, borderRadius: 12 } },
              }}
              onClick={(bar: any) => toggleSingle(setCategories, categories, String(bar?.indexValue ?? ""))}
            />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">Sem dados.</div>
            )}
          </div>
          {categories.length ? (
            <div className="mt-2 text-xs text-slate-600">
              Categoria ativa: <span className="font-semibold text-slate-900">{categories.join(", ")}</span>
            </div>
          ) : null}
        </Card>

      {/* Mapa por estado */}
        <Card className="w-full border-slate-200 bg-white p-5 lg:col-span-6">
        <div className="text-lg font-extrabold text-slate-900">Vendas por estado</div>
          <div className="mt-3 relative w-full" style={{ height: mapHeight }} ref={mapWrapRef}>
            {geoFeatures.length > 0 && mapWidth > 0 && mapPath ? (
              <>
                <svg width={mapWidth} height={mapHeight} role="img" aria-label="Mapa do Brasil por estado">
                  {geoFeatures.map((f: any) => {
                    const id = String(f?.id || f?.properties?.id || "");
                    const v = salesByUFMap.get(id);
                    const selectedOne = states.length === 1;
                    const dim = selectedOne && states[0] !== id;
                    const active = selectedOne && states[0] === id;
                    const fill = v == null ? mapUnknownColor : mapScale(v);
                    const d = mapPath(f);
                    if (!d) return null;
              return (
                      <path
                        key={id}
                        d={d}
                        fill={fill}
                        opacity={dim ? 0.2 : 1}
                        stroke={active ? "#0f172a" : "#CBD5E1"}
                        strokeWidth={active ? 1.25 : 0.6}
                        onClick={() => toggleSingle(setStates, states, id)}
                        onMouseLeave={() => setMapHover(null)}
                        onMouseMove={(e) => {
                          const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement | null)?.getBoundingClientRect();
                          const x = rect ? e.clientX - rect.left : 0;
                          const y = rect ? e.clientY - rect.top : 0;
                          setMapHover({ id, value: v ?? null, x, y });
                        }}
                        style={{ cursor: "pointer" }}
                      />
                    );
                  })}
                </svg>

                {mapHover ? (
                  <div
                    className="pointer-events-none absolute z-10 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xl"
                    style={{
                      left: Math.min(mapWidth - 160, Math.max(8, mapHover.x + 12)),
                      top: Math.min(mapHeight - 48, Math.max(8, mapHover.y - 12)),
                      width: 160,
                    }}
                  >
                    <div className="font-extrabold">{mapHover.id}</div>
                    <div>{formatBRLNoSpace(mapHover.value ?? 0)}</div>
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
      </div>

      {/* Drawer de filtros (sem data) */}
      <SlideOver open={filtersOpen} title="Filtros (Ao vivo)" onClose={() => setFiltersOpen(false)}>
        {filtersLoading ? <div className="text-slate-700">Carregando filtros...</div> : null}
        {!filtersLoading && filtersError ? <div className="text-sm text-red-600">{filtersError}</div> : null}
        {!filtersLoading && !filtersError && filters ? (
          <div className="space-y-4">
            <MultiSelect label="Loja" options={storeOptions} values={stores} onChange={setStores} placeholder="Todas" />
            <MultiSelect label="Marketplace" options={channelOptions} values={channels} onChange={setChannels} placeholder="Todos" />
            <MultiSelect label="Categoria" options={categoryOptions} values={categories} onChange={setCategories} placeholder="Todas" />
            <MultiSelect label="Estado" options={stateOptions} values={states} onChange={setStates} placeholder="Todos" />
            <MultiSelect label="Cidade" options={cityOptions} values={cities} onChange={setCities} placeholder="Todas" />
            {citiesLoading ? <div className="text-xs text-slate-600">Carregando cidades...</div> : null}
            {!citiesLoading && citiesError ? <div className="text-xs text-red-600">{citiesError}</div> : null}
          </div>
        ) : null}
      </SlideOver>
    </div>
  );
};

export default DashboardAoVivo;


