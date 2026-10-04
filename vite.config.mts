import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  // vinext's cross-environment SSR loaders address index.js explicitly.
  // Vite defaults to .mjs in a CommonJS package, which works under its local
  // resolver but leaves missing module references in a deployed Worker.
  environments: {
    rsc: { build: { rolldownOptions: { output: { entryFileNames: "[name].js" } } } },
    ssr: { build: { rolldownOptions: { output: { entryFileNames: "[name].js" } } } },
  },
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});
