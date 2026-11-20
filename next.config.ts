import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // imagen de contenedor mínima (Dockerfile)
  cacheComponents: true,
  // La pantalla independiente de Cierre se retiró: contar monedas vive en «/». Los enlaces viejos siguen funcionando.
  async redirects() {
    return [{ source: "/cierre", destination: "/", permanent: false }];
  },
  partialPrefetching: true,
};

export default nextConfig;
