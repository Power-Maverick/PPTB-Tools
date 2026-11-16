import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

/**
 * Plugin to fix HTML for PPTB compatibility
 * - Removes type="module" and crossorigin attributes since we're using IIFE format
 * - Moves script tags from head to end of body so DOM is ready when IIFE executes
 */
function fixHtmlForPPTB(): Plugin {
    return {
        name: 'fix-html-for-pptb',
        enforce: 'post',
        transformIndexHtml(html) {
            // Remove type="module" and crossorigin from script tags
            // IIFE format doesn't need module type, and file:// URLs don't need crossorigin
            html = html.replace(/\s*type="module"/g, '');
            html = html.replace(/\s*crossorigin/g, '');
            // Clean up extra spaces around attributes
            html = html.replace(/\s+>/g, '>');

            // Move script tags from head to end of body
            // IIFE executes immediately, so DOM must be ready
            const scriptRegex = /(<script[^>]*src="[^"]*"[^>]*><\/script>)/g;
            const scripts: string[] = [];

            // Extract all script tags
            html = html.replace(scriptRegex, (match) => {
                scripts.push(match);
                return ''; // Remove from current position
            });

            // Insert scripts before closing body tag
            if (scripts.length > 0) {
                const scriptsHtml = '\n  ' + scripts.join('\n  ');
                html = html.replace('</body>', scriptsHtml + '\n</body>');
            }

            return html;
        },
    };
}

function inlinePlayground(): Plugin {
    return {
        name: 'inline-offline-playground',
        enforce: 'post',
        generateBundle: {
            order: 'post',
            handler(_, bundle) {
                const html = bundle['index.html'];
                if (!html || html.type !== 'asset' || typeof html.source !== 'string') {
                    throw new Error('Playground HTML output was not generated.');
                }
                for (const [fileName, output] of Object.entries(bundle)) {
                    if (output.type === 'chunk') {
                        const tag = `<script src="./${fileName}"></script>`;
                        if (!html.source.includes(tag)) throw new Error(`Missing playground script tag for ${fileName}.`);
                        html.source = html.source.replace(tag, () => `<script>${output.code.replace(/<\/script/gi, '<\\/script')}</script>`);
                        delete bundle[fileName];
                    } else if (fileName.endsWith('.css')) {
                        html.source = html.source.replace(/<link[^>]*rel="stylesheet"[^>]*>/g, () => `<style>${String(output.source)}</style>`);
                        delete bundle[fileName];
                    }
                }
            },
        },
    };
}

// https://vitejs.dev/config/
export default defineConfig((configEnv) => {
    const playground = configEnv.mode === 'playground';
    return {
        root: playground ? 'src/playground' : '.',
        plugins: [react(), fixHtmlForPPTB(), ...(playground ? [inlinePlayground()] : [])],
        base: './',
        build: {
            outDir: playground ? '../../playground' : 'dist',
            emptyOutDir: !playground,
            assetsDir: 'assets',
            sourcemap: configEnv.mode === 'development',
            rollupOptions: {
                output: {
                    // Use IIFE format for compatibility with iframe srcdoc loading
                    // ES modules can have issues when loaded via file:// URLs in iframes
                    format: 'iife',
                    // Bundle everything into a single file to avoid module loading issues
                    inlineDynamicImports: true,
                    // Disable chunking since we're bundling everything
                    manualChunks: undefined,
                },
            },
        },
    };
});
