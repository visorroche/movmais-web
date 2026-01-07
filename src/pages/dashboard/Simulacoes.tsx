import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ResponsiveLine } from "@nivo/line";
import { ResponsiveSankey } from "@nivo/sankey";
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

type ProductOption = { id: number; sku: number; name: string | null; brand: string | null; model: string | null; category: string | null };

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

  const [status, setStatus] = useState<string[]>([]);
  const [stores, setStores] = useState<string[]>([]);
  const [channels, setChannels] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);

  const [productValues, setProductValues] = useState<string[]>([]);
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [productLoading, setProductLoading] = useState(false);
  const [productError, setProductError] = useState<string | null>(null);
  const [productQuery, setProductQuery] = useState("");

  const [citiesOverride, setCitiesOverride] = useState<string[] | null>(null);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [citiesError, setCitiesError] = useState<string | null>(null);

  const initialStoresSet = useRef(false);

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
      [...categories].sort().join("|") +
      "||" +
      [...productValues].sort().join("|") +
      "||" +
      [...states].sort().join("|") +
      "||" +
      [...cities].sort().join("|") +
      "||" +
      String(dateRange.start || "") +
      ".." +
      String(dateRange.end || "");
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
    const baseFactor = 0.85 + ((h >>> 0) % 70) / 100; // 0.85..1.54
    return baseFactor;
  }, [categories, channels, cities, dateRange.end, dateRange.start, productValues, states, stores]);

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
    // base simples + hash por UF para espalhar valores
    const baseSims: Record<string, number> = {
      SP: 52000,
      RJ: 21000,
      MG: 24000,
      PR: 14000,
      RS: 16000,
      SC: 11000,
      BA: 9000,
      GO: 8000,
      DF: 7000,
      PE: 7200,
      CE: 6000,
      PA: 5200,
      AM: 4200,
    };
    const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
    const out = new Map<string, { sims: number; orders: number; conv: number; lostBRL: number }>();
    for (const f of geoFeatures) {
      const id = String(f?.id || f?.properties?.id || "");
      if (!id) continue;
      const base = baseSims[id] ?? 3500;
      let h = 0;
      for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
      const wave = 0.75 + ((h % 70) / 100); // 0.75..1.44
      const sims = Math.max(30, Math.round(base * wave * simScale));
      // conv cai levemente com "hash" (pra variar) mas mantém faixa ok
      const conv = clamp(0.42 + (((h >>> 1) % 40) / 100) - ((h % 7) * 0.015), 0.08, 0.72);
      const orders = Math.max(0, Math.min(sims, Math.round(sims * conv)));
      const lostBRL = Math.max(0, sims - orders) * avgTicketBRL;
      out.set(id, { sims, orders, conv: sims > 0 ? orders / sims : 0, lostBRL });
    }
    return out;
  }, [avgTicketBRL, geoFeatures, simScale]);

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
    rows.sort((a, b) => b.lostBRL - a.lostBRL || a.id.localeCompare(b.id));
    return rows;
  }, [stateSimOrders]);

  // sankey: conversão (solicitações de frete -> faixa de frete -> prazo -> pedido/não)
  const sankeyFreteBuckets = useMemo(
    () => [
      "Frete grátis",
      "Frete até R$ 10,00",
      "Frete até R$ 50,00",
      "Frete até R$ 100,00",
      "Frete até R$ 500,00",
      "Frete até R$ 1.000,00",
      "Frete acima de R$ 1.000,00",
    ],
    [],
  );

  const sankeyPrazoBuckets = useMemo(
    () => ["Até 3 dias", "Até 7 dias", "Até 15 dias", "Até 30 dias", "Até 40 dias", "Até 60 dias", "Mais de 60 dias"],
    [],
  );

  const sankeyData = useMemo(() => {
    const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
    const rootId = "Solicitações de frete";
    const pedidosId = "Pedidos";
    const naoId = "Não converteu";

    // matriz (frete -> prazo) com números determinísticos (fakes), caindo com frete e prazo piores
    const mat: number[][] = sankeyFreteBuckets.map((_, fi) =>
      sankeyPrazoBuckets.map((__, pi) => {
        const base = 1900 - fi * 150 - pi * 120;
        const wave = 0.78 + 0.22 * Math.sin((fi + 1) * 0.85 + (pi + 1) * 0.72);
        return Math.max(12, Math.round(base * wave * simScale));
      }),
    );

    const totalPorFrete = mat.map((row) => row.reduce((a, b) => a + b, 0));
    const totalPorPrazo = sankeyPrazoBuckets.map((_, pi) => mat.reduce((sum, row) => sum + (row[pi] ?? 0), 0));
    const totalSolicitacoes = totalPorFrete.reduce((a, b) => a + b, 0);

    // conversão por prazo (cai conforme o prazo aumenta) e também penaliza frete muito alto via alocação
    const convRatePrazo = sankeyPrazoBuckets.map((_, pi) => clamp(0.58 - pi * 0.065, 0.07, 0.7));
    const pedidosPorPrazo = totalPorPrazo.map((t, pi) => Math.max(0, Math.min(t, Math.round(t * convRatePrazo[pi]))));
    const naoPorPrazo = totalPorPrazo.map((t, pi) => Math.max(0, t - pedidosPorPrazo[pi]));

    // aloca os pedidos de cada prazo de volta para cada faixa de frete (para tooltip de conversão por frete)
    const pedidosMat: number[][] = sankeyPrazoBuckets.map((_, pi) => {
      const col = sankeyFreteBuckets.map((__, fi) => mat[fi][pi] ?? 0);
      const colSum = col.reduce((a, b) => a + b, 0);
      const target = pedidosPorPrazo[pi] ?? 0;
      if (!colSum || !target) return sankeyFreteBuckets.map(() => 0);
      const raw = col.map((v) => (v / colSum) * target);
      const flo = raw.map((v) => Math.floor(v));
      let left = target - flo.reduce((a, b) => a + b, 0);
      const order = raw
        .map((v, idx) => ({ idx, rem: v - Math.floor(v) }))
        .sort((a, b) => b.rem - a.rem)
        .map((x) => x.idx);
      for (let i = 0; i < order.length && left > 0; i++) {
        flo[order[i]] += 1;
        left -= 1;
      }
      return flo;
    });

    const pedidosPorFrete = sankeyFreteBuckets.map((_, fi) =>
      sankeyPrazoBuckets.reduce((sum, __, pi) => sum + (pedidosMat[pi]?.[fi] ?? 0), 0),
    );

    const nodes: any[] = [
      { id: rootId, kind: "root" },
      ...sankeyFreteBuckets.map((id) => ({ id, kind: "frete" })),
      ...sankeyPrazoBuckets.map((id) => ({ id, kind: "prazo" })),
      { id: pedidosId, kind: "resultado" },
      { id: naoId, kind: "resultado" },
    ];

    const links: any[] = [
      ...sankeyFreteBuckets.map((f, fi) => ({ source: rootId, target: f, value: totalPorFrete[fi] ?? 0 })),
      ...sankeyFreteBuckets.flatMap((f, fi) => sankeyPrazoBuckets.map((p, pi) => ({ source: f, target: p, value: mat[fi][pi] ?? 0 }))),
      ...sankeyPrazoBuckets.flatMap((p, pi) => [
        { source: p, target: pedidosId, value: pedidosPorPrazo[pi] ?? 0 },
        { source: p, target: naoId, value: naoPorPrazo[pi] ?? 0 },
      ]),
    ].filter((l) => Number(l.value) > 0);

    const meta = {
      rootId,
      pedidosId,
      naoId,
      totalSolicitacoes,
      totalPorFrete,
      pedidosPorFrete,
      totalPorPrazo,
      pedidosPorPrazo,
    };

    return { nodes, links, meta };
  }, [sankeyFreteBuckets, sankeyPrazoBuckets, simScale]);

  const sankeyNodeColor = useMemo(() => {
    const root = CHART_COLORS[0];
    const prazo = CHART_COLORS[5] || CHART_COLORS[0];
    const frete = "#FF751A";
    const pedidos = CHART_COLORS[3] || "#61C9A8";
    const nao = CHART_COLORS[4] || "#BA3B46";
    return (node: any) => {
      const kind = String(node?.kind ?? "");
      const id = String(node?.id ?? "");
      if (kind === "root") return root;
      if (id === sankeyData?.meta?.pedidosId) return pedidos;
      if (id === sankeyData?.meta?.naoId) return nao;
      if (kind === "frete") return frete;
      if (kind === "prazo") return prazo;
      return CHART_COLORS[1] || "#FF751A";
    };
  }, [sankeyData?.meta?.naoId, sankeyData?.meta?.pedidosId]);

  // scatterplot: cada bolha é (faixa frete x prazo), tamanho = % conversão
  const scatterData = useMemo(() => {
    const s = sankeyData as any;
    const links: any[] = Array.isArray(s?.links) ? s.links : [];
    const totalByKey = new Map<string, number>();
    const ordersByKey = new Map<string, number>();

    const rootId = String(s?.meta?.rootId ?? "Solicitações de frete");
    const pedidosId = String(s?.meta?.pedidosId ?? "Pedidos");

    // totals: frete -> prazo
    for (const l of links) {
      const src = String(l?.source?.id ?? l?.source ?? "");
      const tgt = String(l?.target?.id ?? l?.target ?? "");
      const v = Number(l?.value ?? 0);
      if (!v) continue;
      if (src === rootId) continue;
      if (tgt === pedidosId) continue;
      if (sankeyFreteBuckets.includes(src) && sankeyPrazoBuckets.includes(tgt)) {
        totalByKey.set(`${src}||${tgt}`, v);
      }
    }

    // orders: prazo -> Pedidos
    const ordersByPrazo = new Map<string, number>();
    for (const l of links) {
      const src = String(l?.source?.id ?? l?.source ?? "");
      const tgt = String(l?.target?.id ?? l?.target ?? "");
      const v = Number(l?.value ?? 0);
      if (!v) continue;
      if (tgt === pedidosId && sankeyPrazoBuckets.includes(src)) ordersByPrazo.set(src, v);
    }

    // reparte pedidos do prazo pelos fretes proporcionalmente às solicitações
    for (const prazo of sankeyPrazoBuckets) {
      const targetOrders = Number(ordersByPrazo.get(prazo) ?? 0);
      if (!targetOrders) continue;
      const totals = sankeyFreteBuckets.map((f) => Number(totalByKey.get(`${f}||${prazo}`) ?? 0));
      const sum = totals.reduce((a, b) => a + b, 0);
      if (!sum) continue;
      for (let fi = 0; fi < sankeyFreteBuckets.length; fi++) {
        const frete = sankeyFreteBuckets[fi];
        const raw = (totals[fi] / sum) * targetOrders;
        ordersByKey.set(`${frete}||${prazo}`, Math.max(0, Math.round(raw)));
      }
    }

    const freteX: Record<string, number> = {
      "Frete grátis": 0,
      "Frete até R$ 10,00": 10,
      "Frete até R$ 50,00": 50,
      "Frete até R$ 100,00": 100,
      "Frete até R$ 500,00": 500,
      "Frete até R$ 1.000,00": 1000,
      "Frete acima de R$ 1.000,00": 1500,
    };
    const prazoY: Record<string, number> = {
      "Até 3 dias": 3,
      "Até 7 dias": 7,
      "Até 15 dias": 15,
      "Até 30 dias": 30,
      "Até 40 dias": 40,
      "Até 60 dias": 60,
      "Mais de 60 dias": 75,
    };

    const points = sankeyFreteBuckets.flatMap((frete) =>
      sankeyPrazoBuckets.map((prazo) => {
        const total = Number(totalByKey.get(`${frete}||${prazo}`) ?? 0);
        const orders = Number(ordersByKey.get(`${frete}||${prazo}`) ?? 0);
        const conv = total > 0 ? orders / total : 0;
        return {
          id: `${frete} | ${prazo}`,
          x: freteX[frete] ?? 0,
          y: prazoY[prazo] ?? 0,
          frete,
          prazo,
          total,
          orders,
          conv,
          convPct: conv * 100,
        };
      }),
    );

    return [{ id: "Conversão", data: points }];
  }, [sankeyData, sankeyFreteBuckets, sankeyPrazoBuckets]);

  const conversionByPrazo = useMemo(() => {
    const m = (sankeyData as any)?.meta;
    const list = sankeyPrazoBuckets.map((label, idx) => {
      const sims = Number(m?.totalPorPrazo?.[idx] ?? 0);
      const orders = Number(m?.pedidosPorPrazo?.[idx] ?? 0);
      const lostCount = Math.max(0, sims - orders);
      const conv = sims > 0 ? orders / sims : 0;
      const lostBRL = lostCount * avgTicketBRL;
      return { label, sims, orders, conv, lostBRL };
    });
    return list;
  }, [avgTicketBRL, sankeyData, sankeyPrazoBuckets]);

  const conversionByFrete = useMemo(() => {
    const m = (sankeyData as any)?.meta;
    const list = sankeyFreteBuckets.map((label, idx) => {
      const sims = Number(m?.totalPorFrete?.[idx] ?? 0);
      const orders = Number(m?.pedidosPorFrete?.[idx] ?? 0);
      const lostCount = Math.max(0, sims - orders);
      const conv = sims > 0 ? orders / sims : 0;
      const lostBRL = lostCount * avgTicketBRL;
      return { label, sims, orders, conv, lostBRL };
    });
    return list;
  }, [avgTicketBRL, sankeyData, sankeyFreteBuckets]);

  const [prazoSort, setPrazoSort] = useState<SortState>({ key: "conv", dir: "desc" });
  const [freteSort, setFreteSort] = useState<SortState>({ key: "conv", dir: "desc" });

  const sortRows = <T extends { label: string; conv: number; orders: number; sims: number; lostBRL: number }>(
    rows: T[],
    sort: SortState,
  ) => {
    const dirMul = sort.dir === "asc" ? 1 : -1;
    const cmp = (a: T, b: T) => {
      if (sort.key === "label") return String(a.label).localeCompare(String(b.label)) * dirMul;
      const av = Number((a as any)[sort.key] ?? 0);
      const bv = Number((b as any)[sort.key] ?? 0);
      if (av === bv) return String(a.label).localeCompare(String(b.label));
      return (av < bv ? -1 : 1) * dirMul;
    };
    return [...rows].sort(cmp);
  };

  const sortedPrazoRows = useMemo(() => sortRows(conversionByPrazo, prazoSort), [conversionByPrazo, prazoSort]);
  const sortedFreteRows = useMemo(() => sortRows(conversionByFrete, freteSort), [conversionByFrete, freteSort]);

  // série fake (determinística): simulações e pedidos por dia
  const series = useMemo(() => {
    const start = dateRange.start ? new Date(`${dateRange.start}T00:00:00`) : new Date();
    const end = dateRange.end ? new Date(`${dateRange.end}T00:00:00`) : new Date();
    const days = Math.max(1, Math.min(60, Math.floor((end.getTime() - start.getTime()) / 86400000) + 1));

    const key =
      [...stores].sort().join("|") +
      "||" +
      [...channels].sort().join("|") +
      "||" +
      [...categories].sort().join("|") +
      "||" +
      [...productValues].sort().join("|") +
      "||" +
      [...states].sort().join("|") +
      "||" +
      [...cities].sort().join("|");
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
    const baseFactor = 0.8 + ((h >>> 0) % 70) / 100; // 0.8..1.49

    const fmt = (d: Date) => `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
    const sims: { x: string; y: number }[] = [];
    const orders: { x: string; y: number }[] = [];
    const byDay = new Map<string, { sims: number; orders: number }>();

    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const x = fmt(d);
      const wave = 0.7 + 0.3 * Math.sin((i / 4) * Math.PI);
      const s = Math.max(10, Math.round(1200 * baseFactor * wave));
      const conv = 0.12 + 0.06 * Math.sin((i / 9) * Math.PI + 0.7); // 6%..18%
      const o = Math.max(1, Math.round(s * conv));
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
  }, [categories, channels, cities, dateRange.end, dateRange.start, productValues, states, stores]);

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

      {filtersLoading || filtersError || productLoading || productError ? (
        <div className="mt-2 space-y-1">
          {filtersLoading ? <div className="text-sm text-slate-700">Carregando filtros...</div> : null}
          {!filtersLoading && filtersError ? <div className="text-sm text-red-600">{filtersError}</div> : null}
          {productLoading ? <div className="text-xs text-slate-600">Buscando produtos...</div> : null}
          {!productLoading && productError ? <div className="text-xs text-red-600">{productError}</div> : null}
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
                  <div className="mt-1 text-[11px] text-slate-500">
                    Série: <span className="font-semibold">{String(point?.serieId)}</span>
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

      {/* Sankey: conversão (solicitações de frete -> prazo -> pedido) */}
      <Card className="mt-4 w-full border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-lg font-extrabold text-slate-900">Conversão por frete e prazo de entrega</div>
            <div className="mt-1 text-sm text-slate-600">
              Total de solicitações: <span className="font-semibold text-slate-900">{formatBigNumber(sankeyData.meta.totalSolicitacoes)}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <div className="inline-flex items-center gap-2 text-slate-700">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#FF751A" }} />
              <span className="font-semibold">Faixa de frete</span>
            </div>
            <div className="inline-flex items-center gap-2 text-slate-700">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_COLORS[5] || CHART_COLORS[0] }} />
              <span className="font-semibold">Prazo</span>
            </div>
            <div className="inline-flex items-center gap-2 text-slate-700">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_COLORS[3] || "#61C9A8" }} />
              <span className="font-semibold">Pedidos</span>
            </div>
            <div className="inline-flex items-center gap-2 text-slate-700">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_COLORS[4] || "#BA3B46" }} />
              <span className="font-semibold">Não converteu</span>
            </div>
          </div>
        </div>

        <div className="mt-3" style={{ height: 440 }}>
          <ResponsiveSankey
            data={sankeyData as any}
            margin={{ top: 10, right: 20, bottom: 10, left: 20 }}
            align="justify"
            sort="input"
            colors={sankeyNodeColor as any}
            nodeOpacity={1}
            nodeHoverOpacity={1}
            nodeThickness={14}
            nodeInnerPadding={8}
            nodeSpacing={18}
            nodeBorderWidth={0}
            linkOpacity={0.25}
            linkHoverOpacity={0.5}
            linkContract={3}
            enableLabels={true}
            labelPosition="outside"
            labelOrientation="horizontal"
            labelPadding={10}
            labelTextColor="#334155"
            valueFormat={(v: any) => formatBigNumber(Number(v))}
            nodeTooltip={({ node }: any) => {
              const id = String(node?.id ?? "");
              const kind = String((node as any)?.kind ?? "");
              const v = Number(node?.value ?? 0);
              const m = (sankeyData as any)?.meta;
              if (!m) {
                return (
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xl">
                    <div className="font-extrabold">{id}</div>
                    <div>{formatBigNumber(v)}</div>
                  </div>
                );
              }
              let convText: string | null = null;
              if (kind === "frete") {
                const idx = sankeyFreteBuckets.indexOf(id);
                if (idx >= 0) {
                  const tot = Number(m.totalPorFrete?.[idx] ?? 0);
                  const ped = Number(m.pedidosPorFrete?.[idx] ?? 0);
                  convText = tot > 0 ? `Conversão: ${formatPct(ped / tot)} (${formatBigNumber(ped)} pedidos)` : null;
                }
              } else if (kind === "prazo") {
                const idx = sankeyPrazoBuckets.indexOf(id);
                if (idx >= 0) {
                  const tot = Number(m.totalPorPrazo?.[idx] ?? 0);
                  const ped = Number(m.pedidosPorPrazo?.[idx] ?? 0);
                  convText = tot > 0 ? `Conversão: ${formatPct(ped / tot)} (${formatBigNumber(ped)} pedidos)` : null;
                }
              } else if (id === m.rootId) {
                const tot = Number(m.totalSolicitacoes ?? 0);
                const ped = (m.pedidosPorPrazo ?? []).reduce((a: number, b: number) => a + Number(b || 0), 0);
                convText = tot > 0 ? `Conversão geral: ${formatPct(ped / tot)} (${formatBigNumber(ped)} pedidos)` : null;
              }
              return (
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xl">
                  <div className="font-extrabold">{id}</div>
                  <div>{formatBigNumber(v)} solicitações</div>
                  {convText ? <div className="mt-1 text-slate-700">{convText}</div> : null}
                </div>
              );
            }}
            linkTooltip={({ link }: any) => {
              const s = String(link?.source?.id ?? link?.source ?? "");
              const t = String(link?.target?.id ?? link?.target ?? "");
              const v = Number(link?.value ?? 0);
              const total = Number((sankeyData as any)?.meta?.totalSolicitacoes ?? 0);
              const share = total > 0 ? v / total : 0;
              return (
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xl">
                  <div className="font-extrabold">
                    {s} → {t}
                  </div>
                  <div>
                    {formatBigNumber(v)} ({formatPct(share)})
                  </div>
                </div>
              );
            }}
            theme={{
              labels: { text: { fill: "#334155", fontWeight: 600 } },
              tooltip: { container: { background: "#fff", color: "#0f172a", fontSize: 12, borderRadius: 12 } },
            }}
          />
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
            margin={{ top: 16, right: 24, bottom: 56, left: 84 }}
            xScale={{ type: "linear", min: 0, max: "auto" }}
            yScale={{ type: "linear", min: 0, max: "auto" }}
            axisBottom={{
              legend: "Preço do frete (R$)",
              legendOffset: 44,
              legendPosition: "middle",
              format: (v: any) => {
                const n = Number(v);
                if (!Number.isFinite(n)) return String(v);
                return n >= 1000 ? "1000+" : String(n);
              },
            }}
            axisLeft={{
              legend: "Prazo (dias)",
              legendOffset: -56,
              legendPosition: "middle",
              format: (v: any) => String(v),
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
            gridXValues={[0, 10, 50, 100, 500, 1000, 1500]}
            gridYValues={[3, 7, 15, 30, 40, 60, 75]}
            tooltip={({ node }: any) => {
              const d = (node?.data as any) ?? {};
              const conv = Number(d?.conv ?? 0);
              const total = Number(d?.total ?? 0);
              const orders = Number(d?.orders ?? 0);
              return (
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-xl">
                  <div className="font-extrabold">{String(d?.frete ?? "")}</div>
                  <div className="text-slate-600">{String(d?.prazo ?? "")}</div>
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
                      {mapMode === "conv" ? `Conversão: ${formatPct(mapHover.conv)}` : `Perdido: ${formatBRLBig(mapHover.lostBRL)}`}
                    </div>
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
          <div className="mt-1 text-xs text-slate-600">Conversão e R$ perdido por UF</div>
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
                      <td className="px-4 py-3 text-right text-slate-900 tabular-nums">{formatPct(row.conv)}</td>
                      <td className="px-4 py-3 text-right text-slate-900 tabular-nums">{formatBRLBig(row.lostBRL)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      </div>

      {/* Tabelas finais: maiores conversões */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="w-full border-slate-200 bg-white p-5 lg:col-span-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-lg font-extrabold text-slate-900">Melhores conversões por prazo</div>
              <div className="mt-1 text-xs text-slate-600">
                R$ perdido é uma estimativa: (não converteu) × ticket médio ({formatBRLNoSpace(avgTicketBRL)})
              </div>
            </div>
          </div>
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50">
                <tr className="text-xs font-extrabold text-slate-600">
                  <th className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() =>
                        setPrazoSort((cur) => ({ key: "label", dir: cur.key === "label" ? (cur.dir === "asc" ? "desc" : "asc") : "asc" }))
                      }
                      className="inline-flex items-center gap-2 hover:text-slate-900"
                    >
                      Prazo
                      <span className="text-slate-400">{prazoSort.key === "label" ? (prazoSort.dir === "asc" ? "▲" : "▼") : ""}</span>
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() =>
                        setPrazoSort((cur) => ({ key: "conv", dir: cur.key === "conv" ? (cur.dir === "asc" ? "desc" : "asc") : "desc" }))
                      }
                      className="inline-flex items-center gap-2 hover:text-slate-900"
                    >
                      Conversão
                      <span className="text-slate-400">{prazoSort.key === "conv" ? (prazoSort.dir === "asc" ? "▲" : "▼") : ""}</span>
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() =>
                        setPrazoSort((cur) => ({ key: "orders", dir: cur.key === "orders" ? (cur.dir === "asc" ? "desc" : "asc") : "desc" }))
                      }
                      className="inline-flex items-center gap-2 hover:text-slate-900"
                    >
                      Pedidos
                      <span className="text-slate-400">{prazoSort.key === "orders" ? (prazoSort.dir === "asc" ? "▲" : "▼") : ""}</span>
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() =>
                        setPrazoSort((cur) => ({ key: "sims", dir: cur.key === "sims" ? (cur.dir === "asc" ? "desc" : "asc") : "desc" }))
                      }
                      className="inline-flex items-center gap-2 hover:text-slate-900"
                    >
                      Simulações
                      <span className="text-slate-400">{prazoSort.key === "sims" ? (prazoSort.dir === "asc" ? "▲" : "▼") : ""}</span>
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() =>
                        setPrazoSort((cur) => ({ key: "lostBRL", dir: cur.key === "lostBRL" ? (cur.dir === "asc" ? "desc" : "asc") : "desc" }))
                      }
                      className="inline-flex items-center gap-2 hover:text-slate-900"
                    >
                      R$ perdido
                      <span className="text-slate-400">{prazoSort.key === "lostBRL" ? (prazoSort.dir === "asc" ? "▲" : "▼") : ""}</span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedPrazoRows.slice(0, 7).map((row) => (
                  <tr key={row.label} className="border-t border-slate-200">
                    <td className="px-4 py-3 text-slate-900">{row.label}</td>
                    <td className="px-4 py-3 text-right text-slate-900 tabular-nums">{formatPct(row.conv)}</td>
                    <td className="px-4 py-3 text-right text-slate-900 tabular-nums">{formatBigNumber(row.orders)}</td>
                    <td className="px-4 py-3 text-right text-slate-700 tabular-nums">{formatBigNumber(row.sims)}</td>
                    <td className="px-4 py-3 text-right text-slate-900 tabular-nums">{formatBRLBig(row.lostBRL)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="w-full border-slate-200 bg-white p-5 lg:col-span-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-lg font-extrabold text-slate-900">Melhores conversões por faixa de frete</div>
              <div className="mt-1 text-xs text-slate-600">
                R$ perdido é uma estimativa: (não converteu) × ticket médio ({formatBRLNoSpace(avgTicketBRL)})
              </div>
            </div>
          </div>
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50">
                <tr className="text-xs font-extrabold text-slate-600">
                  <th className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() =>
                        setFreteSort((cur) => ({ key: "label", dir: cur.key === "label" ? (cur.dir === "asc" ? "desc" : "asc") : "asc" }))
                      }
                      className="inline-flex items-center gap-2 hover:text-slate-900"
                    >
                      Faixa de frete
                      <span className="text-slate-400">{freteSort.key === "label" ? (freteSort.dir === "asc" ? "▲" : "▼") : ""}</span>
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() =>
                        setFreteSort((cur) => ({ key: "conv", dir: cur.key === "conv" ? (cur.dir === "asc" ? "desc" : "asc") : "desc" }))
                      }
                      className="inline-flex items-center gap-2 hover:text-slate-900"
                    >
                      Conversão
                      <span className="text-slate-400">{freteSort.key === "conv" ? (freteSort.dir === "asc" ? "▲" : "▼") : ""}</span>
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() =>
                        setFreteSort((cur) => ({ key: "orders", dir: cur.key === "orders" ? (cur.dir === "asc" ? "desc" : "asc") : "desc" }))
                      }
                      className="inline-flex items-center gap-2 hover:text-slate-900"
                    >
                      Pedidos
                      <span className="text-slate-400">{freteSort.key === "orders" ? (freteSort.dir === "asc" ? "▲" : "▼") : ""}</span>
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() =>
                        setFreteSort((cur) => ({ key: "sims", dir: cur.key === "sims" ? (cur.dir === "asc" ? "desc" : "asc") : "desc" }))
                      }
                      className="inline-flex items-center gap-2 hover:text-slate-900"
                    >
                      Simulações
                      <span className="text-slate-400">{freteSort.key === "sims" ? (freteSort.dir === "asc" ? "▲" : "▼") : ""}</span>
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() =>
                        setFreteSort((cur) => ({ key: "lostBRL", dir: cur.key === "lostBRL" ? (cur.dir === "asc" ? "desc" : "asc") : "desc" }))
                      }
                      className="inline-flex items-center gap-2 hover:text-slate-900"
                    >
                      R$ perdido
                      <span className="text-slate-400">{freteSort.key === "lostBRL" ? (freteSort.dir === "asc" ? "▲" : "▼") : ""}</span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedFreteRows.slice(0, 7).map((row) => (
                  <tr key={row.label} className="border-t border-slate-200">
                    <td className="px-4 py-3 text-slate-900">{row.label}</td>
                    <td className="px-4 py-3 text-right text-slate-900 tabular-nums">{formatPct(row.conv)}</td>
                    <td className="px-4 py-3 text-right text-slate-900 tabular-nums">{formatBigNumber(row.orders)}</td>
                    <td className="px-4 py-3 text-right text-slate-700 tabular-nums">{formatBigNumber(row.sims)}</td>
                    <td className="px-4 py-3 text-right text-slate-900 tabular-nums">{formatBRLBig(row.lostBRL)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <SlideOver open={filtersOpen} title="Filtros" onClose={() => setFiltersOpen(false)}>
        {filtersLoading ? <div className="text-slate-700">Carregando filtros...</div> : null}
        {!filtersLoading && filtersError ? <div className="text-sm text-red-600">{filtersError}</div> : null}
        {!filtersLoading && !filtersError && filters ? (
          <div className="space-y-4">
            <MultiSelect label="Status" options={statusOptions} values={status} onChange={setStatus} placeholder="Todos" />
            <MultiSelect label="Loja" options={storeOptions} values={stores} onChange={setStores} placeholder="Todas" />
            <MultiSelect label="Canal" options={channelOptions} values={channels} onChange={setChannels} placeholder="Todos" />
            <MultiSelect label="Categoria" options={categoryOptions} values={categories} onChange={setCategories} placeholder="Todas" />
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
            <MultiSelect label="Cidade" options={cityOptions} values={cities} onChange={setCities} placeholder="Todas" />
            {citiesLoading ? <div className="text-xs text-slate-600">Carregando cidades...</div> : null}
            {!citiesLoading && citiesError ? <div className="text-xs text-red-600">{citiesError}</div> : null}
            <div className="pt-2 text-xs text-slate-600">
              Placeholder: depois a gente liga isso nas queries reais (por enquanto só reescala números fakes para demonstrar a interação).
            </div>
          </div>
        ) : null}
      </SlideOver>
    </div>
  );
};

export default DashboardSimulacoes;


