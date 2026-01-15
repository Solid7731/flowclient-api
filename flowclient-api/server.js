const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== MIDDLEWARES =====
app.use(helmet()); // Segurança
app.use(cors()); // CORS
app.use(express.json()); // Parse JSON

// Rate limiting - previne spam
const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 100, // 100 requests por minuto
    message: { error: 'Too many requests, please try again later.' }
});

app.use('/ping', limiter);

// ===== ARMAZENAMENTO EM MEMÓRIA (RAM) =====
const onlinePlayers = new Map();
// Map<uuid, { username, client, version, lastPing }>

// ===== CONFIGURAÇÕES =====
const TIMEOUT_MS = 60000; // 60 segundos sem ping = offline
const CLEANUP_INTERVAL_MS = 15000; // Limpeza a cada 15 segundos

// ===== LIMPEZA AUTOMÁTICA =====
setInterval(() => {
    const now = Date.now();
    let removed = 0;

    for (const [uuid, player] of onlinePlayers.entries()) {
        if (now - player.lastPing > TIMEOUT_MS) {
            onlinePlayers.delete(uuid);
            removed++;
        }
    }

    if (removed > 0) {
        console.log(`[Cleanup] Removed ${removed} inactive players. Online: ${onlinePlayers.size}`);
    }
}, CLEANUP_INTERVAL_MS);

// ===== ENDPOINTS =====

/**
 * POST /ping - Atualiza status do jogador
 * Body: { uuid, username, client, version }
 */
app.post('/ping', (req, res) => {
    try {
        const { uuid, username, client, version } = req.body;

        // Validação básica
        if (!uuid || !username) {
            return res.status(400).json({
                error: 'Missing required fields: uuid, username'
            });
        }

        // Valida UUID format (básico)
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)) {
            return res.status(400).json({
                error: 'Invalid UUID format'
            });
        }

        // Valida username (3-16 chars, alfanumérico + underscore)
        if (!/^[a-zA-Z0-9_]{3,16}$/.test(username)) {
            return res.status(400).json({
                error: 'Invalid username format'
            });
        }

        const now = Date.now();
        const wasOnline = onlinePlayers.has(uuid);

        // Atualiza ou adiciona jogador
        onlinePlayers.set(uuid, {
            username: username,
            client: client || 'FlowClient',
            version: version || '1.8.9',
            lastPing: now
        });

        if (!wasOnline) {
            console.log(`[Join] ${username} (${uuid}) - Total: ${onlinePlayers.size}`);
        }

        res.json({
            success: true,
            online: onlinePlayers.size
        });

    } catch (error) {
        console.error('[Error] /ping:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /online - Lista jogadores online
 */
app.get('/online', (req, res) => {
    try {
        const players = Array.from(onlinePlayers.values()).map(p => ({
            username: p.username
        }));

        res.json({
            count: onlinePlayers.size,
            players: players
        });

    } catch (error) {
        console.error('[Error] /online:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /stats - Estatísticas detalhadas (opcional)
 */
app.get('/stats', (req, res) => {
    try {
        const players = Array.from(onlinePlayers.values());

        // Agrupa por versão
        const versionCount = {};
        players.forEach(p => {
            versionCount[p.version] = (versionCount[p.version] || 0) + 1;
        });

        res.json({
            count: onlinePlayers.size,
            versions: versionCount,
            uptime: process.uptime(),
            memory: process.memoryUsage()
        });

    } catch (error) {
        console.error('[Error] /stats:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET / - Health check
 */
app.get('/', (req, res) => {
    res.json({
        name: 'FlowClient API',
        version: '1.0.0',
        status: 'online',
        players: onlinePlayers.size,
        uptime: Math.floor(process.uptime()),
        endpoints: {
            ping: 'POST /ping',
            online: 'GET /online',
            stats: 'GET /stats'
        }
    });
});

/**
 * 404 Handler
 */
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// ===== START SERVER =====
app.listen(PORT, () => {
    console.log('╔════════════════════════════════════════╗');
    console.log('║     FLOWCLIENT API - IN MEMORY         ║');
    console.log('╚════════════════════════════════════════╝');
    console.log(`[Server] Running on port ${PORT}`);
    console.log(`[Mode] Temporary in-memory storage`);
    console.log(`[Timeout] ${TIMEOUT_MS / 1000}s inactivity`);
    console.log(`[Cleanup] Every ${CLEANUP_INTERVAL_MS / 1000}s`);
    console.log('════════════════════════════════════════');
});

// ===== GRACEFUL SHUTDOWN =====
process.on('SIGTERM', () => {
    console.log('[Shutdown] SIGTERM received. Clearing data...');
    onlinePlayers.clear();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('[Shutdown] SIGINT received. Clearing data...');
    onlinePlayers.clear();
    process.exit(0);
});