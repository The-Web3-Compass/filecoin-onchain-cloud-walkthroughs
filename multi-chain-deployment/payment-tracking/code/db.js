import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Database module for payment tracking and quota management.
 * Uses SQLite for simplicity - in production, use PostgreSQL or similar.
 */

const DB_PATH = path.join(__dirname, 'storage.db');

export function initDatabase() {
    const db = new Database(DB_PATH);

    // Enable WAL mode for better concurrent performance
    db.pragma('journal_mode = WAL');

    // Create users table
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            address TEXT UNIQUE NOT NULL,
            email TEXT,
            chain TEXT NOT NULL,
            quota_bytes INTEGER DEFAULT 0,
            used_bytes INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Create payments table
    db.exec(`
        CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            chain TEXT NOT NULL,
            tx_hash TEXT UNIQUE NOT NULL,
            amount_usd REAL NOT NULL,
            quota_bytes_granted INTEGER NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    // Create uploads table
    db.exec(`
        CREATE TABLE IF NOT EXISTS uploads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            piece_cid TEXT NOT NULL,
            size_bytes INTEGER NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    return db;
}

export function createUser(db, address, chain, email = null) {
    const stmt = db.prepare(`
        INSERT OR IGNORE INTO users (address, chain, email)
        VALUES (?, ?, ?)
    `);
    stmt.run(address, chain, email);

    return db.prepare('SELECT * FROM users WHERE address = ?').get(address);
}

export function getUser(db, address) {
    return db.prepare('SELECT * FROM users WHERE address = ?').get(address);
}

export function recordPayment(db, userId, chain, txHash, amountUsd, quotaBytesGranted) {
    const stmt = db.prepare(`
        INSERT INTO payments (user_id, chain, tx_hash, amount_usd, quota_bytes_granted)
        VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(userId, chain, txHash, amountUsd, quotaBytesGranted);

    // Update user quota
    db.prepare('UPDATE users SET quota_bytes = quota_bytes + ? WHERE id = ?')
        .run(quotaBytesGranted, userId);
}

export function recordUpload(db, userId, pieceCid, sizeBytes) {
    const stmt = db.prepare(`
        INSERT INTO uploads (user_id, piece_cid, size_bytes)
        VALUES (?, ?, ?)
    `);
    stmt.run(userId, pieceCid, sizeBytes);

    // Update used bytes
    db.prepare('UPDATE users SET used_bytes = used_bytes + ? WHERE id = ?')
        .run(sizeBytes, userId);
}

export function getUserQuota(db, userId) {
    const user = db.prepare('SELECT quota_bytes, used_bytes FROM users WHERE id = ?').get(userId);
    if (!user) return null;

    return {
        quotaBytes: user.quota_bytes,
        usedBytes: user.used_bytes,
        remainingBytes: user.quota_bytes - user.used_bytes
    };
}

export function canUpload(db, userId, sizeBytes) {
    const quota = getUserQuota(db, userId);
    if (!quota) return false;
    return quota.remainingBytes >= sizeBytes;
}

export function getUserUploads(db, userId) {
    return db.prepare('SELECT * FROM uploads WHERE user_id = ? ORDER BY created_at DESC').all(userId);
}

export function getUserPayments(db, userId) {
    return db.prepare('SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC').all(userId);
}
