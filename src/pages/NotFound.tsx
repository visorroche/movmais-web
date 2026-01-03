import { Link } from "react-router-dom";

const NotFound = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 p-6">
      <div className="text-center">
        <div className="text-3xl font-semibold">Página não encontrada</div>
        <div className="mt-2 text-slate-300">A rota que você tentou acessar não existe.</div>
        <Link to="/login" className="mt-6 inline-block underline underline-offset-2">
          Ir para login
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
