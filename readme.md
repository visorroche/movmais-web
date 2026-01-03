
# MOVMAIS Front

Frontend em React + Vite + Tailwind.

## Requisitos
- Node.js 18+

## 1) Instalação
```bash
npm install
```

## 2) Configurar variáveis de ambiente
Copie o arquivo de exemplo e ajuste se necessário:

```bash
cp .env.example .env
```

Variáveis principais:
- `VITE_API_URL`
  - Desenvolvimento (default): `http://localhost:5003`

Obs: o `vite.config.ts` também configura proxy de `/api` durante o dev.

## 3) Rodar em desenvolvimento
```bash
npm run dev
```

Frontend em:
`http://localhost:5173`

## 4) Fluxo de login
- Tela: `/login`
- Cadastro: `/cadastro`
- Área logada (exemplo): `/dashboard`

## 5) Build / Preview
```bash
npm run build
npm run preview
```
