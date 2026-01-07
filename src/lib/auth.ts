import { buildApiUrl } from "@/lib/config";

export type UserMe = {
  id: number;
  email: string;
  name?: string | null;
  phone?: string | null;
  roles: string[];
  company_id?: number | null;
  company?: { id: number; name: string } | null;
};

export type CompanyAccess = {
  id: number;
  name: string;
  site: string;
  group_id: number | null;
  group: { id: number; name: string } | null;
};

const TOKEN_KEY = "movmais_token";
const USER_KEY = "movmais_user";
const ACTIVE_COMPANY_KEY = "movmais_company_id";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(ACTIVE_COMPANY_KEY);
}

export function getActiveCompanyId(): number | null {
  try {
    const raw = localStorage.getItem(ACTIVE_COMPANY_KEY);
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) return null;
    return n;
  } catch {
    return null;
  }
}

export function setActiveCompanyId(companyId: number | null) {
  if (!companyId) {
    localStorage.removeItem(ACTIVE_COMPANY_KEY);
    return;
  }
  localStorage.setItem(ACTIVE_COMPANY_KEY, String(companyId));
}

export function getAuthHeaders(): Record<string, string> {
  const token = getToken();
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const companyId = getActiveCompanyId();
  if (companyId) headers["X-Company-Id"] = String(companyId);
  return headers;
}

export async function login(email: string, password: string): Promise<string> {
  const body = { email: String(email).trim().toLowerCase(), password };
  const res = await fetch(buildApiUrl("/users/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Credenciais inválidas");
  const data = await res.json();
  if (!data?.token) throw new Error("Resposta inválida do servidor");
  setToken(data.token);
  if (data.user) {
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    } catch {}
  }
  return data.token as string;
}

export async function fetchMyCompanies(signal?: AbortSignal): Promise<CompanyAccess[]> {
  const res = await fetch(buildApiUrl("/companies/my"), { headers: { ...getAuthHeaders() }, signal });
  if (res.status === 401) throw new Error("Não autenticado");
  if (!res.ok) throw new Error("Erro ao carregar empresas");
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data as CompanyAccess[]) : [];
}

export async function ensureDefaultCompanySelected(signal?: AbortSignal): Promise<number | null> {
  const current = getActiveCompanyId();
  if (current) return current;
  const companies = await fetchMyCompanies(signal);
  const first = companies?.[0];
  if (first?.id) {
    setActiveCompanyId(first.id);
    return first.id;
  }
  return null;
}

export async function getMe(signal?: AbortSignal): Promise<UserMe> {
  const res = await fetch(buildApiUrl("/users/me"), { headers: { ...getAuthHeaders() }, signal });
  if (res.status === 401) throw new Error("Não autenticado");
  if (!res.ok) throw new Error("Erro ao carregar usuário");
  return res.json();
}

export function logout() {
  clearToken();
}

export function getStoredUser(): UserMe | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as UserMe) : null;
  } catch {
    return null;
  }
}
