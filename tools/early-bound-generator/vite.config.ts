import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8")) as { version: string };

export default defineConfig({
    publicDir: "public",
    plugins: [react()],
    define: {
        __APP_VERSION__: JSON.stringify(pkg.version),
    },
    build: {
        outDir: "dist",
        rollupOptions: {
            output: {
                entryFileNames: "[name].js",
                chunkFileNames: "[name].js",
                assetFileNames: "[name].[ext]",
            },
        },
    },
});
