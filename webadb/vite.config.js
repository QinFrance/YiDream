import { defineConfig } from "vite";

// Le site sera servi à https://TONPSEUDO.github.io/YiDream/
// Si tu renommes le repo, change cette base en conséquence.
export default defineConfig({
  base: "/YiDream/",
  build: {
    outDir: "dist",
  },
});
