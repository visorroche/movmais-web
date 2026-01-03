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

const TOKEN_KEY = "movmais_token";
const USER_KEY = "movmais_user";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
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

export async function getMe(signal?: AbortSignal): Promise<UserMe> {
  const res = await fetch(buildApiUrl("/users/me"), { headers: { ...authHeaders() }, signal });
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
