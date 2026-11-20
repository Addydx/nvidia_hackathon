import { redirect } from "next/navigation";
import RecuperarForm from "@/components/RecuperarForm";
import { RECOVERY_ENABLED } from "@/lib/features";

export default function Recuperar() {
  // Sin SMTP la recuperación no funciona: quien abra la ruta directamente vuelve al acceso.
  if (!RECOVERY_ENABLED) redirect("/acceso");
  return <RecuperarForm />;
}
