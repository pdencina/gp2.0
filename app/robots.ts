import type { MetadataRoute } from "next";

// Es una plataforma privada: no debe aparecer en buscadores.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
