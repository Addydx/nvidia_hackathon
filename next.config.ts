import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // imagen de contenedor mínima (Dockerfile)
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
