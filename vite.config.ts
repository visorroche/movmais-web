import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { fileURLToPath } from "url";

export default defineConfig(() => {
  const apiUrl = process.env.VITE_API_URL || "http://localhost:5003";

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  return {
    server: {
      host: "::",
      port: 5173,
      proxy: {
        "/api": {
          target: apiUrl,
          changeOrigin: true,
          rewrite: (p: string) => p.replace(/^\/api/, ""),
        },
        // Permite chamar a API diretamente via mesmas rotas (ex.: /users/register)
        // Isso evita 404 no Vite quando o front faz request para o mesmo host:5173.
        "/users": { target: apiUrl, changeOrigin: true },
        "/companies": { target: apiUrl, changeOrigin: true },
        "/health": { target: apiUrl, changeOrigin: true },
        "/api-docs": { target: apiUrl, changeOrigin: true },
      },
    },
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
