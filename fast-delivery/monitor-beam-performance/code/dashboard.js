import express from 'express';
import cors from 'cors';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get the directory path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(__dirname));

const METRICS_FILE = join(__dirname, 'data', 'metrics.json');
const COST_FILE = join(__dirname, 'data', 'costs.json');
const ALERTS_FILE = join(__dirname, 'data', 'alerts-history.json');

// API Endpoints
app.get('/api/metrics', (req, res) => {
    if (existsSync(METRICS_FILE)) {
        res.json(JSON.parse(readFileSync(METRICS_FILE, 'utf-8')));
    } else {
        res.json({
            summary: {
                successRate: 0,
                avgTTFB: 0,
                totalEgressGB: 0
            },
            operations: []
        });
    }
});

app.get('/api/costs', (req, res) => {
    if (existsSync(COST_FILE)) {
        res.json(JSON.parse(readFileSync(COST_FILE, 'utf-8')));
    } else {
        // Return default empty structure to prevent frontend errors
        res.json({
            snapshots: [],
            analysis: {
                totalSpent: 0,
                costPerGB: 0,
                dailySpendingRate: 0,
                monthlyProjection: 0,
                daysCovered: 0,
                lastUpdated: new Date().toISOString()
            }
        });
    }
});

app.get('/api/alerts', (req, res) => {
    if (existsSync(ALERTS_FILE)) {
        res.json(JSON.parse(readFileSync(ALERTS_FILE, 'utf-8')));
    } else {
        res.json([]);
    }
});

// Serve the dashboard
app.get('/', (req, res) => {
    res.sendFile(join(__dirname, 'dashboard.html'));
});

app.listen(PORT, () => {
    console.log('='.repeat(70));
    console.log('  Filecoin Beam: Monitoring Dashboard Server');
    console.log('='.repeat(70));
    console.log();
    console.log(`🚀 Dashboard running at http://localhost:${PORT}`);
    console.log('   Press Ctrl+C to stop.');
    console.log();
});
