import { Navigate, Outlet } from "react-router-dom";
import { getToken } from "@/lib/auth";

const AreaLogada = () => {
  const token = getToken();
  if (!token) return <Navigate to="/login" replace />;
  return <Outlet />;
};

export default AreaLogada;
