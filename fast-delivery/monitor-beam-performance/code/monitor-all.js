import 'dotenv/config';
import { spawn } from 'child_process';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Monitor All script
 * 
 * Orchestrates the monitoring pipeline:
 * 1. Runs metrics collection
 * 2. Runs cost analysis
 * 3. Checks alerts
 * 4. (Optional) Could be set up as a loop or cron job
 */

async function runStep(name, file) {
    console.log(`\\n[Monitor] Running ${name}...`);
    return new Promise((resolve) => {
        const child = spawn('node', [file], { stdio: 'inherit' });
        child.on('close', resolve);
    });
}

async function main() {
    console.log('='.repeat(70));
    console.log('  Filecoin Beam: Integrated Monitoring Routine');
    console.log('='.repeat(70));

    // Ensure data dir
    if (!existsSync(join(__dirname, 'data'))) {
        mkdirSync(join(__dirname, 'data'));
    }

    await runStep('Metrics Collection', 'metrics-collector.js');
    await runStep('Cost Analysis', 'cost-tracker.js');
    await runStep('Alert Validation', 'alert-system.js');

    console.log('\\n' + '='.repeat(70));
    console.log('  Routine Complete');
    console.log('='.repeat(70));
    console.log('\\nTo view the dashboard, run: npm run dashboard');
}

main().catch(console.error);
