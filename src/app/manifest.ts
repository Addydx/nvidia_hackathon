import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Corte de caja",
    short_name: "Caja",
    description: "Caja diaria para vendedores ambulantes",
    start_url: "/",
    display: "standalone",
    background_color: "#1c1d1f",
    theme_color: "#1c1d1f",
    lang: "es-MX",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
