export const getApiUrl = (): string => {
  if (import.meta.env.VITE_API_URL) {
    return String(import.meta.env.VITE_API_URL).replace(/\/+$|\s+$/g, "").replace(/\/+$/, "");
  }
  if (import.meta.env.DEV) {
    return "http://localhost:5003";
  }
  return "/api";
};

export const API_BASE = getApiUrl();

export const buildApiUrl = (path: string): string => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!API_BASE) return normalizedPath;
  return `${API_BASE}${normalizedPath}`;
};
