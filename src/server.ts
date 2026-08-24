import express from 'express';
import fs from 'fs';
import path from 'path';
import { marked } from 'marked';
import { Logger } from './utils/Logger';
import queueRoutes from './routes/queueRoutes';
import metricsRoutes from './routes/metricsRoutes';
import { deadLetterQueue } from './infrastructure/DeadLetterQueue';
import { queueStatePersistence } from './infrastructure/QueueStatePersistence';

const app = express();
const PORT = 3003;

// Middleware para parsear JSON
app.use(express.json());

const contentDir = path.join(__dirname, '../content');

// Ensure content directory exists
if (!fs.existsSync(contentDir)) {
    fs.mkdirSync(contentDir);
}

// Minimal CSS for a clean reading experience
const CSS = `
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 2rem; color: #333; background: #fdfdfd; }
        h1, h2, h3 { color: #111; }
        a { color: #0366d6; text-decoration: none; }
        a:hover { text-decoration: underline; }
        code { background: #f0f0f0; padding: 2px 5px; border-radius: 4px; font-family: monospace; }
        pre { background: #f6f8fa; padding: 16px; border-radius: 6px; overflow-x: auto; }
        blockquote { border-left: 4px solid #dfe2e5; padding-left: 1rem; color: #6a737d; margin-left: 0; }
        .date { color: #888; font-size: 0.9em; margin-bottom: 2rem; }
    </style>
`;

app.get('/', (req, res) => {
    try {
        const files = fs.readdirSync(contentDir).filter(f => f.endsWith('.md')).sort().reverse();
        
        let html = `<!DOCTYPE html><html><head><title>Niklauss Blog</title>${CSS}</head><body>`;
        html += `<h1>Niklauss AI Blog</h1>`;
        
        if (files.length === 0) {
            html += `<p>No articles published yet.</p>`;
        } else {
            html += `<ul>`;
            files.forEach(file => {
                const title = file.replace('.md', '').replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/-/g, ' ');
                html += `<li><a href="/post/${file}">${title}</a></li>`;
            });
            html += `</ul>`;
        }
        
        html += `</body></html>`;
        res.send(html);
    } catch (err) {
        res.status(500).send('Error reading content directory');
    }
});

app.get('/post/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        if (!filename.endsWith('.md')) {
            return res.status(400).send('Invalid file format');
        }

        const filePath = path.join(contentDir, filename);
        if (!fs.existsSync(filePath)) {
            return res.status(404).send('Article not found');
        }

        const markdownContent = fs.readFileSync(filePath, 'utf-8');
        const htmlContent = marked.parse(markdownContent);
        
        const title = filename.replace('.md', '').replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/-/g, ' ');

        let html = `<!DOCTYPE html><html><head><title>${title}</title>${CSS}</head><body>`;
        html += `<p><a href="/">&larr; Back to Home</a></p>`;
        html += htmlContent;
        html += `</body></html>`;
        
        res.send(html);
    } catch (err) {
        res.status(500).send('Error rendering article');
    }
});

// Endpoint para inspeccionar logs en vivo desde la web / Docker
app.get('/logs', (req, res) => {
    const logs = Logger.getRecentAppLogs(200);
    let html = `<!DOCTYPE html><html><head><title>System Logs</title>${CSS}</head><body>`;
    html += `<h1>📑 OmniAI System Logs</h1>`;
    html += `<p><a href="/">&larr; Volver al Blog</a> | <a href="/logs/errors">🔴 Ver Solo Errores</a></p>`;
    html += `<pre style="background: #1e1e1e; color: #00ff66; padding: 15px;">${logs}</pre>`;
    html += `</body></html>`;
    res.send(html);
});

app.get('/logs/errors', (req, res) => {
    const logs = Logger.getRecentErrorLogs(200);
    let html = `<!DOCTYPE html><html><head><title>Error Logs</title>${CSS}</head><body>`;
    html += `<h1>🔴 OmniAI Error Logs</h1>`;
    html += `<p><a href="/">&larr; Volver al Blog</a> | <a href="/logs">📑 Ver Todos los Logs</a></p>`;
    html += `<pre style="background: #1e1e1e; color: #ff5555; padding: 15px;">${logs}</pre>`;
    html += `</body></html>`;
    res.send(html);
});

// Montar rutas de queue (REQ-6.2.4)
app.use('/queue', queueRoutes);

// Montar rutas de métricas (REQ-6.3.1)
app.use('/metrics', metricsRoutes);

export async function startBlogServer(port: number = 3003) {
    // Inicializar DeadLetterQueue antes de iniciar el servidor
    try {
        await deadLetterQueue.initialize();
        console.log('✅ DeadLetterQueue inicializada');
    } catch (err) {
        console.error('⚠️ Error inicializando DeadLetterQueue (continuando sin ella):', err);
    }

    // Inicializar QueueStatePersistence (REQ-6.3.4)
    try {
        await queueStatePersistence.initialize();
        console.log('✅ QueueStatePersistence inicializada');
        
        // Verificar si hay jobs que necesitan recuperación tras reinicio
        const recoverable = await queueStatePersistence.getRecoverableJobs();
        if (recoverable.processing.length > 0) {
            console.log(`⚠️ Detectados ${recoverable.processing.length} jobs que estaban en proceso antes del reinicio`);
            console.log('   Usa POST /queue/persisted/recover para reencolarlos');
        }
        if (recoverable.pending.length > 0) {
            console.log(`ℹ️ ${recoverable.pending.length} jobs pendientes encontrados en estado persistido`);
        }
    } catch (err) {
        console.error('⚠️ Error inicializando QueueStatePersistence (continuando sin ella):', err);
    }

    app.listen(port, () => {
        console.log(`🚀 Blog Server is running on http://localhost:${port}`);
        console.log(`🌐 Accessible via Cloudflare Tunnel at your configured domain.`);
        console.log(`📋 Queue API disponible en http://localhost:${port}/queue/dead-letter`);
        console.log(`📊 Metrics API disponible en http://localhost:${port}/metrics`);
        console.log(`💾 Persisted State API disponible en http://localhost:${port}/queue/persisted`);
    });
}

if (require.main === module) {
    startBlogServer(PORT).catch(err => {
        console.error('Error iniciando servidor:', err);
        process.exit(1);
    });
}
