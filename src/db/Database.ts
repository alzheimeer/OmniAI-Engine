import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { StructureUsageRecord, NarrativeStructure, CTAPosition, KeywordDensity } from '../generators/ScriptStructureRandomizer';

export interface PublishedVideoRecord {
    id?: number;
    youtubeId: string;
    title: string;
    language: string;
    views: number;
    likes: number;
    comments: number;
    publishedAt: string;
    // Nuevos campos para deduplicación
    rawTopic?: string;
    topicHash?: string;
    keywords?: string;
    videoType?: 'short' | 'long';
    channelKey?: 'channel1' | 'channel2';
}

export interface PublishedBlogRecord {
    id?: number;
    title: string;
    hashnodeUrl?: string;
    mediumUrl?: string;
    devToUrl?: string;
    publishedAt: string;
    // Nuevos campos para deduplicación
    rawTopic?: string;
    topicHash?: string;
    keywords?: string;
}

/**
 * Normaliza un tema para comparación de similitud
 * - Lowercase, sin puntuación, sin palabras comunes
 */
function normalizeTopicForHash(topic: string): string {
    const stopWords = ['el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'en', 'con', 'para', 'por', 'que', 'como', 
                       'the', 'a', 'an', 'of', 'in', 'with', 'for', 'by', 'how', 'why', 'what',
                       'o', 'um', 'uma', 'do', 'da', 'dos', 'das', 'em', 'com', 'para', 'por'];
    
    return topic
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Quitar acentos
        .replace(/[^a-z0-9\s]/g, ' ') // Solo alfanuméricos
        .split(/\s+/)
        .filter(word => word.length > 2 && !stopWords.includes(word))
        .sort() // Ordenar para que "IA y autismo" == "autismo y IA"
        .join(' ')
        .trim();
}

/**
 * Genera un hash corto del tema normalizado
 */
function generateTopicHash(topic: string): string {
    const normalized = normalizeTopicForHash(topic);
    return crypto.createHash('md5').update(normalized).digest('hex').substring(0, 12);
}

export class Database {
    private static dbPath = path.join(__dirname, '../../content/database.sqlite');
    private static db: sqlite3.Database | null = null;

    public static getDB(): sqlite3.Database {
        if (!this.db) {
            const dir = path.dirname(this.dbPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            this.db = new sqlite3.Database(this.dbPath);
            this.initTables();
        }
        return this.db;
    }

    private static initTables() {
        if (!this.db) return;

        this.db.serialize(() => {
            // Tabla de Videos de YouTube (ACTUALIZADA con campos de deduplicación)
            this.db?.run(`
                CREATE TABLE IF NOT EXISTS published_videos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    youtubeId TEXT UNIQUE,
                    title TEXT,
                    language TEXT,
                    views INTEGER DEFAULT 0,
                    likes INTEGER DEFAULT 0,
                    comments INTEGER DEFAULT 0,
                    publishedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    rawTopic TEXT,
                    topicHash TEXT,
                    keywords TEXT,
                    videoType TEXT DEFAULT 'short',
                    channelKey TEXT DEFAULT 'channel1'
                )
            `);
            
            // Migración: añadir columnas si no existen (para DBs existentes)
            this.db?.run(`ALTER TABLE published_videos ADD COLUMN rawTopic TEXT`, () => {});
            this.db?.run(`ALTER TABLE published_videos ADD COLUMN topicHash TEXT`, () => {});
            this.db?.run(`ALTER TABLE published_videos ADD COLUMN keywords TEXT`, () => {});
            this.db?.run(`ALTER TABLE published_videos ADD COLUMN videoType TEXT DEFAULT 'short'`, () => {});
            this.db?.run(`ALTER TABLE published_videos ADD COLUMN channelKey TEXT DEFAULT 'channel1'`, () => {});
            
            // Crear índice para búsqueda rápida de duplicados por canal
            this.db?.run(`CREATE INDEX IF NOT EXISTS idx_topic_hash_channel ON published_videos(topicHash, channelKey)`);

            // Tabla de Artículos de Blog (ACTUALIZADA)
            this.db?.run(`
                CREATE TABLE IF NOT EXISTS published_blogs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT,
                    hashnodeUrl TEXT,
                    mediumUrl TEXT,
                    devToUrl TEXT,
                    publishedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    rawTopic TEXT,
                    topicHash TEXT,
                    keywords TEXT
                )
            `);
            
            // Migración para blogs
            this.db?.run(`ALTER TABLE published_blogs ADD COLUMN rawTopic TEXT`, () => {});
            this.db?.run(`ALTER TABLE published_blogs ADD COLUMN topicHash TEXT`, () => {});
            this.db?.run(`ALTER TABLE published_blogs ADD COLUMN keywords TEXT`, () => {});
            
            this.db?.run(`CREATE INDEX IF NOT EXISTS idx_blog_topic_hash ON published_blogs(topicHash)`);

            // Tabla de registros de uso de estructura narrativa (REQ-2.7.6)
            this.db?.run(`
                CREATE TABLE IF NOT EXISTS structure_usage (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    videoId TEXT NOT NULL,
                    channelId TEXT NOT NULL,
                    structure TEXT NOT NULL,
                    ctaPosition TEXT NOT NULL,
                    keywordDensity TEXT NOT NULL,
                    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
            
            // Índice para consultar estructuras recientes por canal
            this.db?.run(`CREATE INDEX IF NOT EXISTS idx_structure_channel ON structure_usage(channelId, createdAt DESC)`);

            // Tabla de Ideas Virales detectadas por el SEO Daemon
            this.db?.run(`
                CREATE TABLE IF NOT EXISTS trending_ideas (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    topic TEXT NOT NULL,
                    title TEXT NOT NULL,
                    keywords TEXT NOT NULL,
                    score INTEGER DEFAULT 0,
                    source TEXT DEFAULT 'google-trends',
                    status TEXT DEFAULT 'pending',
                    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
        });
    }

    /**
     * Guarda un video recién publicado en YouTube (ACTUALIZADO con canal aislado)
     */
    public static saveVideo(
        youtubeId: string, 
        title: string, 
        language: string,
        rawTopic?: string,
        keywords?: string[],
        videoType: 'short' | 'long' = 'short',
        channelKey: 'channel1' | 'channel2' = 'channel1'
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const db = this.getDB();
            const topicHash = rawTopic ? generateTopicHash(rawTopic) : null;
            const keywordsJson = keywords ? JSON.stringify(keywords) : null;
            
            db.run(
                `INSERT OR REPLACE INTO published_videos 
                 (youtubeId, title, language, rawTopic, topicHash, keywords, videoType, channelKey) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [youtubeId, title, language, rawTopic || null, topicHash, keywordsJson, videoType, channelKey],
                (err) => {
                    if (err) reject(err);
                    else {
                        console.log(`📊 Database: Video guardado en ${channelKey} con topicHash=${topicHash}`);
                        resolve();
                    }
                }
            );
        });
    }

    /**
     * Verifica si un tema ya fue usado en un CANAL ESPECÍFICO (para evitar duplicados)
     * Retorna el video existente si hay duplicado en ese canal, null si es tema nuevo
     */
    public static async checkTopicDuplicate(rawTopic: string, channelKey: 'channel1' | 'channel2' = 'channel1'): Promise<PublishedVideoRecord | null> {
        return new Promise((resolve, reject) => {
            const db = this.getDB();
            const topicHash = generateTopicHash(rawTopic);
            
            db.get(
                `SELECT * FROM published_videos WHERE topicHash = ? AND channelKey = ? ORDER BY publishedAt DESC LIMIT 1`,
                [topicHash, channelKey],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row as PublishedVideoRecord | null);
                }
            );
        });
    }

    /**
     * Obtiene los últimos N temas usados EN UN CANAL ESPECÍFICO para contexto del LLM
     */
    public static async getRecentTopics(limit: number = 50, channelKey: 'channel1' | 'channel2' = 'channel1'): Promise<string[]> {
        return new Promise((resolve, reject) => {
            const db = this.getDB();
            db.all(
                `SELECT DISTINCT rawTopic FROM published_videos 
                 WHERE rawTopic IS NOT NULL AND channelKey = ?
                 ORDER BY publishedAt DESC LIMIT ?`,
                [channelKey, limit],
                (err, rows) => {
                    if (err) reject(err);
                    else {
                        const topics = (rows as any[]).map(r => r.rawTopic).filter(Boolean);
                        resolve(topics);
                    }
                }
            );
        });
    }

    /**
     * Obtiene los últimos N temas de blogs para evitar duplicados
     */
    public static async getRecentBlogTopics(limit: number = 30): Promise<string[]> {
        return new Promise((resolve, reject) => {
            const db = this.getDB();
            db.all(
                `SELECT DISTINCT rawTopic FROM published_blogs 
                 WHERE rawTopic IS NOT NULL 
                 ORDER BY publishedAt DESC LIMIT ?`,
                [limit],
                (err, rows) => {
                    if (err) reject(err);
                    else {
                        const topics = (rows as any[]).map(r => r.rawTopic).filter(Boolean);
                        resolve(topics);
                    }
                }
            );
        });
    }

    /**
     * Actualiza las analíticas de un video de YouTube
     */
    public static updateVideoMetrics(youtubeId: string, views: number, likes: number, comments: number): Promise<void> {
        return new Promise((resolve, reject) => {
            const db = this.getDB();
            db.run(
                `UPDATE published_videos SET views = ?, likes = ?, comments = ? WHERE youtubeId = ?`,
                [views, likes, comments, youtubeId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    /**
     * Guarda una publicación de Blog multi-plataforma (ACTUALIZADO)
     */
    public static saveBlog(
        title: string, 
        hashnodeUrl?: string, 
        mediumUrl?: string, 
        devToUrl?: string,
        rawTopic?: string,
        keywords?: string[]
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const db = this.getDB();
            const topicHash = rawTopic ? generateTopicHash(rawTopic) : null;
            const keywordsJson = keywords ? JSON.stringify(keywords) : null;
            
            db.run(
                `INSERT INTO published_blogs 
                 (title, hashnodeUrl, mediumUrl, devToUrl, rawTopic, topicHash, keywords) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [title, hashnodeUrl || null, mediumUrl || null, devToUrl || null, rawTopic || null, topicHash, keywordsJson],
                (err) => {
                    if (err) reject(err);
                    else {
                        console.log(`📊 Database: Blog guardado con topicHash=${topicHash}`);
                        resolve();
                    }
                }
            );
        });
    }

    /**
     * Verifica si un tema de blog ya fue usado
     */
    public static async checkBlogTopicDuplicate(rawTopic: string): Promise<PublishedBlogRecord | null> {
        return new Promise((resolve, reject) => {
            const db = this.getDB();
            const topicHash = generateTopicHash(rawTopic);
            
            db.get(
                `SELECT * FROM published_blogs WHERE topicHash = ? ORDER BY publishedAt DESC LIMIT 1`,
                [topicHash],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row as PublishedBlogRecord | null);
                }
            );
        });
    }

    /**
     * Obtiene los N videos con mejor rendimiento (vistas)
     */
    public static getTopVideos(limit: number = 5): Promise<PublishedVideoRecord[]> {
        return new Promise((resolve, reject) => {
            const db = this.getDB();
            db.all(
                `SELECT * FROM published_videos ORDER BY views DESC LIMIT ?`,
                [limit],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows as PublishedVideoRecord[]);
                }
            );
        });
    }

    /**
     * Obtiene todos los videos registrados
     */
    public static getAllVideos(): Promise<PublishedVideoRecord[]> {
        return new Promise((resolve, reject) => {
            const db = this.getDB();
            db.all(`SELECT * FROM published_videos`, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows as PublishedVideoRecord[]);
            });
        });
    }

    /**
     * Obtiene videos de UN CANAL ESPECÍFICO (para sincronización de métricas)
     * IMPORTANTE: Usar este método en AnalyticsEngine para evitar mezclar videos de canales
     */
    public static getVideosByChannel(channelKey: 'channel1' | 'channel2'): Promise<PublishedVideoRecord[]> {
        return new Promise((resolve, reject) => {
            const db = this.getDB();
            db.all(
                `SELECT * FROM published_videos WHERE channelKey = ?`,
                [channelKey],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows as PublishedVideoRecord[]);
                }
            );
        });
    }

    /**
     * Obtiene estadísticas generales de la base de datos
     */
    public static async getStats(): Promise<{
        totalVideos: number;
        shorts: number;
        longs: number;
        totalBlogs: number;
        uniqueTopics: number;
    }> {
        return new Promise((resolve, reject) => {
            const db = this.getDB();
            
            db.serialize(() => {
                let stats = {
                    totalVideos: 0,
                    shorts: 0,
                    longs: 0,
                    totalBlogs: 0,
                    uniqueTopics: 0
                };

                db.get(`SELECT COUNT(*) as count FROM published_videos`, (err, row: any) => {
                    if (!err && row) stats.totalVideos = row.count;
                });

                db.get(`SELECT COUNT(*) as count FROM published_videos WHERE videoType = 'short'`, (err, row: any) => {
                    if (!err && row) stats.shorts = row.count;
                });

                db.get(`SELECT COUNT(*) as count FROM published_videos WHERE videoType = 'long'`, (err, row: any) => {
                    if (!err && row) stats.longs = row.count;
                });

                db.get(`SELECT COUNT(*) as count FROM published_blogs`, (err, row: any) => {
                    if (!err && row) stats.totalBlogs = row.count;
                });

                db.get(`SELECT COUNT(DISTINCT topicHash) as count FROM published_videos WHERE topicHash IS NOT NULL`, (err, row: any) => {
                    if (!err && row) stats.uniqueTopics = row.count;
                    resolve(stats);
                });
            });
        });
    }

    // ===== FUNCIONES DE REPOSITORIO PARA STRUCTURE USAGE (REQ-2.7.6) =====

    /**
     * Guarda un registro de uso de estructura narrativa en SQLite (REQ-2.7.6)
     * @param record El registro de uso de estructura a guardar
     * @returns El ID del registro insertado
     */
    public static saveStructureUsage(record: StructureUsageRecord): Promise<number> {
        return new Promise((resolve, reject) => {
            const db = this.getDB();
            const createdAt = record.createdAt instanceof Date 
                ? record.createdAt.toISOString() 
                : record.createdAt;
            
            db.run(
                `INSERT INTO structure_usage (videoId, channelId, structure, ctaPosition, keywordDensity, createdAt)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [record.videoId, record.channelId, record.structure, record.ctaPosition, record.keywordDensity, createdAt],
                function(err) {
                    if (err) reject(err);
                    else {
                        console.log(`📊 Database: Estructura '${record.structure}' guardada para video ${record.videoId}`);
                        resolve(this.lastID);
                    }
                }
            );
        });
    }

    /**
     * Obtiene las últimas N estructuras usadas por un canal (REQ-2.7.6)
     * Usado por ScriptStructureRandomizer para evitar repetición
     * @param channelId ID del canal
     * @param limit Número máximo de estructuras a retornar (default 3)
     * @returns Array de estructuras narrativas ordenadas por fecha descendente
     */
    public static getRecentStructures(channelId: string, limit: number = 3): Promise<NarrativeStructure[]> {
        return new Promise((resolve, reject) => {
            const db = this.getDB();
            db.all(
                `SELECT structure FROM structure_usage 
                 WHERE channelId = ? 
                 ORDER BY createdAt DESC 
                 LIMIT ?`,
                [channelId, limit],
                (err, rows) => {
                    if (err) reject(err);
                    else {
                        const structures = (rows as any[]).map(r => r.structure as NarrativeStructure);
                        resolve(structures);
                    }
                }
            );
        });
    }

    /**
     * Obtiene un registro de uso de estructura por videoId (REQ-2.7.6)
     * @param videoId ID del video
     * @returns El registro de uso de estructura o null si no existe
     */
    public static getStructureUsageByVideoId(videoId: string): Promise<StructureUsageRecord | null> {
        return new Promise((resolve, reject) => {
            const db = this.getDB();
            db.get(
                `SELECT * FROM structure_usage WHERE videoId = ?`,
                [videoId],
                (err, row: any) => {
                    if (err) reject(err);
                    else if (!row) resolve(null);
                    else {
                        resolve({
                            id: row.id,
                            videoId: row.videoId,
                            channelId: row.channelId,
                            structure: row.structure as NarrativeStructure,
                            ctaPosition: row.ctaPosition as CTAPosition,
                            keywordDensity: row.keywordDensity as KeywordDensity,
                            createdAt: new Date(row.createdAt)
                        });
                    }
                }
            );
        });
    }

    /**
     * Obtiene todos los registros de uso de estructura de un canal (REQ-2.7.6)
     * Útil para análisis y reporting
     * @param channelId ID del canal
     * @returns Array de registros de uso de estructura
     */
    public static getStructureUsageByChannel(channelId: string): Promise<StructureUsageRecord[]> {
        return new Promise((resolve, reject) => {
            const db = this.getDB();
            db.all(
                `SELECT * FROM structure_usage 
                 WHERE channelId = ? 
                 ORDER BY createdAt DESC`,
                [channelId],
                (err, rows) => {
                    if (err) reject(err);
                    else {
                        const records = (rows as any[]).map(row => ({
                            id: row.id,
                            videoId: row.videoId,
                            channelId: row.channelId,
                            structure: row.structure as NarrativeStructure,
                            ctaPosition: row.ctaPosition as CTAPosition,
                            keywordDensity: row.keywordDensity as KeywordDensity,
                            createdAt: new Date(row.createdAt)
                        }));
                        resolve(records);
                    }
                }
            );
        });
    }

    /**
     * Obtiene estadísticas de uso de estructuras por canal (REQ-2.7.6)
     * @param channelId ID del canal
     * @returns Conteo de uso por cada tipo de estructura
     */
    public static getStructureUsageStats(channelId: string): Promise<Record<NarrativeStructure, number>> {
        return new Promise((resolve, reject) => {
            const db = this.getDB();
            db.all(
                `SELECT structure, COUNT(*) as count 
                 FROM structure_usage 
                 WHERE channelId = ? 
                 GROUP BY structure`,
                [channelId],
                (err, rows) => {
                    if (err) reject(err);
                    else {
                        const stats: Record<NarrativeStructure, number> = {
                            'storytelling': 0,
                            'inverted-list': 0,
                            'rhetorical': 0,
                            'debate': 0,
                            'error-tutorial': 0,
                            'case-study': 0
                        };
                        (rows as any[]).forEach(row => {
                            stats[row.structure as NarrativeStructure] = row.count;
                        });
                        resolve(stats);
                    }
                }
            );
        });
    }

    // ===== FUNCIONES PARA SEO DAEMON =====

    public static saveTrendingIdea(topic: string, title: string, keywords: string[], score: number, source: string): Promise<number> {
        return new Promise((resolve, reject) => {
            const db = this.getDB();
            db.run(
                `INSERT INTO trending_ideas (topic, title, keywords, score, source, status) VALUES (?, ?, ?, ?, ?, 'pending')`,
                [topic, title, JSON.stringify(keywords), score, source],
                function(err) {
                    if (err) reject(err);
                    else {
                        console.log(`📊 Database: Nueva idea viral guardada: ${title} (Score: ${score})`);
                        resolve(this.lastID);
                    }
                }
            );
        });
    }

    public static getPendingTrendingIdeas(limit: number = 1): Promise<any[]> {
        return new Promise((resolve, reject) => {
            const db = this.getDB();
            db.all(
                `SELECT * FROM trending_ideas WHERE status = 'pending' ORDER BY score DESC LIMIT ?`,
                [limit],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    public static markTrendingIdeaAsUsed(id: number): Promise<void> {
        return new Promise((resolve, reject) => {
            const db = this.getDB();
            db.run(`UPDATE trending_ideas SET status = 'used' WHERE id = ?`, [id], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }
}

