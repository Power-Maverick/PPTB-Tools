import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
    publicDir: "public",
    plugins: [react()],
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
