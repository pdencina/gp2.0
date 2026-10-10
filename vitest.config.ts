import { defineConfig } from "vitest/config";

// Las pruebas de base de datos cargan el esquema completo en un Postgres en memoria: con varios archivos
// en paralelo (y en el CI) pueden pasar de los 5 segundos que Vitest da por defecto.
export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
