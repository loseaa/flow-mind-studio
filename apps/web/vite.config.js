import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            "@flowmind/ui": resolve(__dirname, "../../packages/ui/src/index.ts"),
            "@flowmind/shared": resolve(__dirname, "../../packages/shared/src/index.ts")
        }
    },
    server: {
        port: Number(process.env.WEB_PORT ?? 5173)
    },
    test: {
        environment: "jsdom",
        globals: true,
        include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
        setupFiles: ["./src/test/setup.ts"]
    }
});
