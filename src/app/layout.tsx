import type { Metadata, Viewport } from "next";
import Nav from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Corte de caja",
  description: "Caja diaria para vendedores ambulantes",
  appleWebApp: { capable: true, title: "Corte de caja", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#1c1d1f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX">
      <body>
        <Nav />
        {children}
      </body>
    </html>
  );
}
