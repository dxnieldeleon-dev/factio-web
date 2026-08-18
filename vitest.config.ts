// Config separada de vite.config.ts a propósito: ese archivo envuelve
// defineConfig de @lovable.dev/vite-tanstack-config, que arma internamente
// tanstackStart/nitro/SSR — mezclar eso con el runner de Vitest agrega
// riesgo sin necesidad, ya que esta fase 1 solo prueba lógica pura en
// entorno `node`, sin componentes ni SSR. Se reusa vite-tsconfig-paths
// (ya en dependencies) para resolver el alias `@/*` igual que el resto
// del proyecto.
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
