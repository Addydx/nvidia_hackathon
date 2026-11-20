import { Suspense } from "react";
import LoginPage from "@/components/LoginPage";

export const metadata = { title: "Iniciar sesión · Corte de caja" };

export default function Page() {
  return (
    <Suspense>
      <LoginPage />
    </Suspense>
  );
}
