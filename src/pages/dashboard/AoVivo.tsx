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
  const d7Label = "D-7";
  const d14Label = "D-14";
  const d21Label = "D-21";
  const d28Label = "D-28";
  type ComparePeriod = "Ontem" | "D-7" | "D-14" | "D-21" | "D-28";
  const [comparePeriod, setComparePeriod] = useState<ComparePeriod>("D-7");

  // Dados fake baseados no exemplo
  const lastWeekSameDayTotal = 50_000;
  const d14SameDayTotal = 48_000;
  const d21SameDayTotal = 46_000;
  const d28SameDayTotal = 44_000;
  const yesterdayTotal = 60_000;
  const lastWeekYesterdayTotal = 30_000;
  const growth = lastWeekYesterdayTotal > 0 ? yesterdayTotal / lastWeekYesterdayTotal : 1;
  const projectedTodayTotal = Math.round(lastWeekSameDayTotal * growth);
  const todaySoFar = 25_000;

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

  // aplica filtros (fake) como escala determinística: serve só para mostrar interação (depois liga no SQL)
  const scale = useMemo(() => {
    const key = [...channels].sort().join("|") + "||" + [...categories].sort().join("|");
    if (!key) return 1;
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    const v = (h % 60) / 100; // 0.00..0.59
    return 0.35 + v; // 0.35..0.94
  }, [channels, categories]);

  // variação (fake determinística) vs. semana passada, baseada nos filtros atuais
  const weekDeltaFor = useMemo(() => {
    const key =
      [...stores].sort().join("|") +
      "||" +
      [...channels].sort().join("|") +
      "||" +
      [...categories].sort().join("|") +
      "||" +
      [...states].sort().join("|") +
      "||" +
      [...cities].sort().join("|");
    const hash = (s: string) => {
      let h = 2166136261;
      for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
      return h >>> 0;
    };
    return (name: string) => {
      const h = hash(`${key}::${name}`);
      const sign = h % 2 === 0 ? 1 : -1;
      const pct = 0.02 + ((h % 1800) / 10000); // 2%..20%
      return sign * pct;
    };
  }, [stores, channels, categories, states, cities]);

  const compareFactor = useMemo(() => {
    if (comparePeriod === "Ontem") return 0.45;
    if (comparePeriod === "D-7") return 1;
    if (comparePeriod === "D-14") return 1.7;
    if (comparePeriod === "D-21") return 2.2;
    return 2.8; // D-28
  }, [comparePeriod]);

  const prevFor = useMemo(() => {
    const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
    return (cur: number, name: string) => {
      const base = weekDeltaFor(name);
      const scaled = clamp(base * compareFactor, -0.45, 0.65);
      const denom = 1 + scaled;
      if (!Number.isFinite(cur) || denom === 0) return cur;
      return Math.max(1, Math.round(cur / denom));
    };
  }, [compareFactor, weekDeltaFor]);

  const prevPctFor = useMemo(() => {
    const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
    return (cur: number, name: string) => {
      const base = weekDeltaFor(name);
      const scaled = clamp(base * compareFactor, -0.45, 0.65);
      const denom = 1 + scaled;
      if (!Number.isFinite(cur) || denom === 0) return cur;
      return Math.max(0.1, Number((cur / denom).toFixed(1)));
    };
  }, [compareFactor, weekDeltaFor]);

  const todaySoFarF = Math.round(todaySoFar * scale);
  const projectedTodayTotalF = Math.round(projectedTodayTotal * scale);
  const todaySoFarPrev = Math.max(1, Math.round(todaySoFarF / (1 + weekDeltaFor("todaySoFar"))));
  const projectedTodayPrev = Math.max(1, Math.round(projectedTodayTotalF / (1 + weekDeltaFor("projectedToday"))));

  // Distribuição horária (pesos) para simular horários que mais vendem (picos no meio do dia e no começo da noite)
  const hourWeights = useMemo(() => {
    const w: number[] = [];
    for (let h = 0; h < 24; h++) {
      // duas gaussianas simples + baseline
      const p1 = Math.exp(-Math.pow(h - 13, 2) / (2 * 3.2 * 3.2));
      const p2 = Math.exp(-Math.pow(h - 20, 2) / (2 * 2.4 * 2.4));
      const base = 0.12;
      w.push(base + 1.25 * p1 + 0.85 * p2);
    }
    // normaliza
    const sum = w.reduce((a, b) => a + b, 0);
    return w.map((x) => x / sum);
  }, []);

  const makeCumulativeSeries = (total: number) => {
    let acc = 0;
    const points: { x: string; y: number }[] = [];
    for (let h = 0; h < 24; h++) {
      acc += total * hourWeights[h];
      const label = `${String(h).padStart(2, "0")}:00`;
      points.push({ x: label, y: Math.round(acc) });
    }
    return points;
  };

  const lastWeekSameDay = useMemo(() => makeCumulativeSeries(lastWeekSameDayTotal * scale), [hourWeights, scale]);
  const d14SameDay = useMemo(() => makeCumulativeSeries(d14SameDayTotal * scale), [hourWeights, scale]);
  const d21SameDay = useMemo(() => makeCumulativeSeries(d21SameDayTotal * scale), [hourWeights, scale]);
  const d28SameDay = useMemo(() => makeCumulativeSeries(d28SameDayTotal * scale), [hourWeights, scale]);
  const yesterday = useMemo(() => makeCumulativeSeries(yesterdayTotal * scale), [hourWeights, scale]);

  const todayActual = useMemo(() => {
    // curva até a hora atual, escalada para bater todaySoFar
    const base = makeCumulativeSeries(1); // cumulativo em "unidades"
    const denom = base[Math.min(currentHour, 23)]?.y || 1;
    const s = denom > 0 ? todaySoFarF / denom : 0;
    return base.map((p, idx) => ({
      x: p.x,
      y: idx <= currentHour ? Math.round(p.y * s) : null,
    }));
  }, [currentHour, hourWeights, todaySoFarF]);

  const todayProjection = useMemo(() => {
    // curva do dia inteiro com alvo projectedTodayTotal, alinhada para continuar do todaySoFar a partir da hora atual
    const full = makeCumulativeSeries(projectedTodayTotalF);
    const atH = full[Math.min(currentHour, 23)]?.y ?? 0;
    const delta = todaySoFarF - atH;
    return full.map((p, idx) => ({
      x: p.x,
      y: idx >= currentHour ? Math.max(0, p.y + delta) : null,
    }));
  }, [currentHour, projectedTodayTotalF, todaySoFarF, hourWeights]);

  const lineData = useMemo(() => {
    return [
      { id: "Hoje", data: todayActual.filter((p: any) => p.y !== null).map((p: any) => ({ x: p.x, y: p.y })) },
      { id: "Hoje (projeção)", data: todayProjection.filter((p: any) => p.y !== null).map((p: any) => ({ x: p.x, y: p.y })) },
      { id: "Ontem", data: yesterday },
      { id: d7Label, data: lastWeekSameDay },
      { id: d14Label, data: d14SameDay },
      { id: d21Label, data: d21SameDay },
      { id: d28Label, data: d28SameDay },
    ];
  }, [todayActual, todayProjection, yesterday, lastWeekSameDay, d14SameDay, d21SameDay, d28SameDay, d7Label, d14Label, d21Label, d28Label]);

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

  const topProducts = useMemo(
    () =>
      [
        { name: "Cápsulas Premium 10un", qty: 540, revenue: 16200 },
        { name: "Filtro Reutilizável", qty: 210, revenue: 6300 },
        { name: "Cafeteira Espresso X", qty: 120, revenue: 18400 },
        { name: "Caneca Térmica 500ml", qty: 95, revenue: 4750 },
        { name: "Moedor Elétrico", qty: 68, revenue: 9800 },
      ].map((p) => ({ ...p, qty: Math.max(1, Math.round(p.qty * scale)), revenue: Math.max(1, Math.round(p.revenue * scale)) })),
    [scale],
  );

  const kpis = useMemo(
    () => ({
      uniqueCustomers: Math.max(1, Math.round(312 * scale)),
      cartItemsAdded: Math.max(1, Math.round(1840 * scale)),
      orders: Math.max(1, Math.round(228 * scale)),
      conversionPct: 18.4,
      itemsSold: Math.max(1, Math.round(1034 * scale)),
      avgTicket: 433.2,
    }),
    [scale],
  );

  const kpisPrev = useMemo(() => {
    const prev = (cur: number, name: string) => prevFor(cur, name);
    const prevPct = (cur: number, name: string) => prevPctFor(cur, name);
    return {
      uniqueCustomers: prev(kpis.uniqueCustomers, "kpi.uniqueCustomers"),
      cartItemsAdded: prev(kpis.cartItemsAdded, "kpi.cartItemsAdded"),
      orders: prev(kpis.orders, "kpi.orders"),
      conversionPct: prevPct(kpis.conversionPct, "kpi.conversionPct"),
      itemsSold: prev(kpis.itemsSold, "kpi.itemsSold"),
      avgTicket: prev(kpis.avgTicket, "kpi.avgTicket"),
    };
  }, [kpis, prevFor, prevPctFor]);

  const pieByCategory = useMemo(
    () => [
      { id: "Café", label: "Café", value: Math.round(42000 * scale) },
      { id: "Acessórios", label: "Acessórios", value: Math.round(27000 * scale) },
      { id: "Máquinas", label: "Máquinas", value: Math.round(31000 * scale) },
      { id: "Chás", label: "Chás", value: Math.round(14500 * scale) },
      { id: "Cápsulas", label: "Cápsulas", value: Math.round(21500 * scale) },
      { id: "Kits", label: "Kits", value: Math.round(9800 * scale) },
      { id: "Peças", label: "Peças", value: Math.round(7600 * scale) },
      { id: "Moedores", label: "Moedores", value: Math.round(13200 * scale) },
      { id: "Canecas", label: "Canecas", value: Math.round(8900 * scale) },
      { id: "Outros", label: "Outros", value: Math.round(6100 * scale) },
    ],
    [scale],
  );

  const BAR_ORANGE = "#FF751A";

  const pieByMarketplace = useMemo(
    () => [
      { id: "Mercado Livre", label: "Mercado Livre", value: Math.round(38000 * scale) },
      { id: "Shopee", label: "Shopee", value: Math.round(22000 * scale) },
      { id: "Amazon", label: "Amazon", value: Math.round(16000 * scale) },
      { id: "Magalu", label: "Magalu", value: Math.round(12000 * scale) },
    ],
    [scale],
  );

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

  const salesByUF = useMemo(() => {
    // fake determinístico: cada UF recebe um valor base (para o mapa ficar bonito)
    const base: Record<string, number> = {
      SP: 42000,
      RJ: 18000,
      MG: 22000,
      PR: 12000,
      RS: 14000,
      SC: 9000,
      BA: 8000,
      GO: 7000,
      DF: 6000,
      PE: 6500,
      CE: 5000,
      PA: 4500,
      AM: 3500,
      MT: 3200,
      MS: 2800,
      ES: 2600,
      RN: 2100,
      PB: 1900,
      AL: 1700,
      SE: 1600,
      PI: 1500,
      MA: 1400,
      TO: 1200,
      RO: 1100,
      AC: 800,
      AP: 700,
      RR: 650,
    };
    return Object.entries(base).map(([id, v]) => ({ id, value: Math.round(v * scale) }));
  }, [scale]);

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
            Hora atual: <span className="font-extrabold text-slate-900">{String(currentHour).padStart(2, "0")}:00</span>
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
            enablePoints={false}
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
            theme={{
              axis: { ticks: { text: { fill: "#475569" } }, legend: { text: { fill: "#334155", fontWeight: 700 } } },
              grid: { line: { stroke: "#E2E8F0" } },
              legends: { text: { fill: "#334155" } },
              tooltip: { container: { background: "#fff", color: "#0f172a", fontSize: 12, borderRadius: 12 } },
            }}
            layers={["grid", "markers", "areas", "lines", dashedProjectionLayer, "slices", "axes"]}
          />
        </div>
      </Card>

      {/* 2ª linha */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Lista produtos */}
        <Card className="w-full border-slate-200 bg-white p-5 lg:col-span-6">
          <div className="text-lg font-extrabold text-slate-900">Produtos mais vendidos</div>
          <div className="mt-3 space-y-3">
            {topProducts.map((p) => (
              <div key={p.name} className="flex items-start justify-between gap-3 border-t border-slate-200 pt-3 first:border-t-0 first:pt-0">
                <div className="min-w-0 flex items-start gap-3">
                  <div className="h-10 w-10 shrink-0 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center font-extrabold text-slate-700">
                    {String(p.name || "P").trim().charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 truncate">{p.name}</div>
                    <div className="text-xs text-slate-600">{p.qty} vendidos</div>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xs text-slate-500">Faturamento</div>
                  <div className="font-extrabold text-slate-900">{formatBRLNoSpace(p.revenue)}</div>
                </div>
              </div>
            ))}
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
            <div className="pt-2 text-xs text-slate-600">
              Placeholder: depois a gente liga isso nas queries reais (por enquanto só reescala os números fakes para demonstrar a interação).
            </div>
          </div>
        ) : null}
      </SlideOver>
    </div>
  );
};

export default DashboardAoVivo;


