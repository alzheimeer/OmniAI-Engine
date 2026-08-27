/**
 * ClipDatabase - Base de datos SQLite para control de clips generados
 * 
 * Almacena metadata de clips y registros de uso para auditoría,
 * optimización y evitar repeticiones en videos.
 * 
 * Funcionalidades:
 * - CRUD de clips con metadata completa
 * - Tracking de uso por video, segmento y plataforma
 * - Queries optimizadas para selección de clips (por categoría, keywords, uso)
 * - Estadísticas del pool para monitoreo y optimización
 * - Migraciones automáticas de esquema
 * 
 * @see Requirements: 12.1-12.7
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import * as path from 'path';
import * as fs from 'fs';

// ============================================================================
// TIPOS E INTERFACES (Tarea 7.1)
// ============================================================================

/**
 * Categorías de clips disponibles.
 * Usadas para clasificar y buscar clips en el pool.
 * @see Requirement 12.1
 */
export type ClipCategory = 'nature' | 'technology' | 'business' | 'abstract' | 'lifestyle' | 'urban';

/**
 * Estado de un clip en el pool.
 * - active: disponible para uso
 * - retired: excluido de selección futura (muy usado)
 * - deleted: marcado para eliminación
 * @see Requirement 12.1
 */
export type ClipStatus = 'active' | 'retired' | 'deleted';

/**
 * Registro de clip en la base de datos.
 * Contiene toda la metadata necesaria para gestionar clips.
 * @see Requirement 12.1
 */
export interface Clip {
    /** Identificador único del clip (UUID) */
    id: string;
    /** Ruta al archivo de video */
    filepath: string;
    /** Prompt usado para generar el clip */
    prompt: string;
    /** Prompt negativo usado (opcional) */
    negativePrompt?: string;
    /** Nombre del modelo usado para generar */
    modelUsed: string;
    /** Preset de calidad usado (optional) */
    presetUsed?: string;
    /** Estilo visual aplicado (optional) */
    visualStyle?: string;
    /** Tiempo de generación en segundos */
    generationTimeSeconds?: number;
    /** Fecha de creación del clip */
    createdAt: Date;
    /** Categoría del clip */
    category: ClipCategory;
    /** Tags para búsqueda */
    tags: string[];
    /** Resolución en formato "WxH" */
    resolution: string;
    /** Número de frames del clip */
    frames: number;
    /** Duración en segundos */
    durationSeconds: number;
    /** Tipo de video: short (vertical) o long (horizontal) */
    videoType: 'short' | 'long';
    /** Veces que se ha usado el clip */
    timesUsed: number;
    /** Estado actual del clip */
    status: ClipStatus;
}

/**
 * Datos para insertar un nuevo clip.
 * Excluye campos auto-generados: id, createdAt, timesUsed, status.
 */
export type ClipInsert = Omit<Clip, 'id' | 'createdAt' | 'timesUsed' | 'status'>;

/**
 * Registro de uso de clip.
 * Permite tracking detallado de cuándo y dónde se usa cada clip.
 * @see Requirement 12.2
 */
export interface ClipUsage {
    /** ID auto-incrementado del registro de uso */
    id: number;
    /** ID del clip utilizado */
    clipId: string;
    /** ID del video donde se usó */
    videoId: string;
    /** Tipo de video donde se usó */
    videoType: 'short' | 'long';
    /** Tipo de segmento (key o filler) */
    segmentType?: 'key' | 'filler';
    /** Fecha y hora del uso */
    usedAt: Date;
    /** Plataforma donde se publicó (youtube, tiktok, instagram) */
    platform?: string;
}

/**
 * Datos para registrar uso de un clip.
 * Excluye campos auto-generados: id, usedAt.
 */
export type ClipUsageInsert = Omit<ClipUsage, 'id' | 'usedAt'>;

/**
 * Estadísticas del pool de clips.
 * Proporciona métricas para monitoreo y optimización.
 * @see Requirement 12.5
 */
export interface ClipStatistics {
    /** Total de clips en la base de datos */
    totalClips: number;
    /** Clips por categoría */
    clipsByCategory: Record<ClipCategory, number>;
    /** Clips por estado */
    clipsByStatus: Record<ClipStatus, number>;
    /** Top 10 clips más usados */
    mostUsedClips: Array<{ clipId: string; timesUsed: number }>;
    /** Número de clips nunca usados */
    unusedClips: number;
    /** Promedio de usos por clip */
    averageUsage: number;
}

/**
 * Configuración de la base de datos.
 * @see Requirement 12.6
 */
export interface ClipDatabaseConfig {
    /** Ruta al archivo SQLite (default: data/clips.db) */
    databasePath: string;
}

// ============================================================================
// CONSTANTES
// ============================================================================

/** Ruta por defecto para la base de datos SQLite */
const DEFAULT_DATABASE_PATH = path.join(process.cwd(), 'data', 'clips.db');

/** Lista de todas las categorías de clips */
const ALL_CATEGORIES: ClipCategory[] = ['nature', 'technology', 'business', 'abstract', 'lifestyle', 'urban'];

/** Lista de todos los estados de clips */
const ALL_STATUSES: ClipStatus[] = ['active', 'retired', 'deleted'];

// ============================================================================
// CLASE CLIPDATABASE (Tareas 7.2-7.5)
// ============================================================================

/**
 * Clase para gestionar la base de datos SQLite de clips.
 * 
 * Proporciona:
 * - Inicialización con migraciones automáticas
 * - CRUD completo de clips
 * - Tracking de uso
 * - Queries optimizadas para selección
 * - Estadísticas del pool
 * 
 * @example
 * ```typescript
 * const db = new ClipDatabase();
 * db.initialize();
 * 
 * // Insertar un clip
 * const clipId = db.insertClip({
 *   filepath: '/path/to/clip.mp4',
 *   prompt: 'serene forest scene',
 *   modelUsed: 'wan22_5B',
 *   category: 'nature',
 *   tags: ['forest', 'calm', 'nature'],
 *   resolution: '576x1024',
 *   frames: 49,
 *   durationSeconds: 2.04,
 *   videoType: 'short'
 * });
 * 
 * // Registrar uso
 * db.recordUsage({
 *   clipId,
 *   videoId: 'video_123',
 *   videoType: 'short',
 *   segmentType: 'filler',
 *   platform: 'youtube'
 * });
 * 
 * // Cerrar conexión
 * db.close();
 * ```
 */
export class ClipDatabase {
    private db: Database.Database;
    private config: ClipDatabaseConfig;

    /**
     * Crea una nueva instancia de ClipDatabase.
     * @param config Configuración opcional de la base de datos
     */
    constructor(config?: Partial<ClipDatabaseConfig>) {
        this.config = {
            databasePath: config?.databasePath || DEFAULT_DATABASE_PATH,
        };
        
        // Asegurar que el directorio existe
        const dir = path.dirname(this.config.databasePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`[ClipDatabase] Directorio creado: ${dir}`);
        }
        
        // Inicializar conexión a SQLite con WAL mode para mejor performance
        this.db = new Database(this.config.databasePath);
        this.db.pragma('journal_mode = WAL');
    }

    // ========================================================================
    // INICIALIZACIÓN Y MIGRACIONES (Tarea 7.2)
    // ========================================================================

    /**
     * Inicializa la base de datos y ejecuta migraciones pendientes.
     * Crea las tablas clips, clip_usages y migrations si no existen.
     * @see Requirement 12.6, 12.7
     */
    public initialize(): void {
        this.runMigrations();
        console.log(`[ClipDatabase] Base de datos inicializada en ${this.config.databasePath}`);
    }

    /**
     * Ejecuta migraciones de esquema de forma incremental.
     * Las migraciones ya aplicadas se registran en la tabla migrations.
     * @see Requirement 12.7
     */
    private runMigrations(): void {
        // Crear tabla de migraciones para tracking
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS migrations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Definir migraciones con nombres únicos
        const migrations = [
            {
                name: '001_create_clips_table',
                sql: `
                    -- Tabla principal de clips generados (Requirement 12.1)
                    CREATE TABLE IF NOT EXISTS clips (
                        id TEXT PRIMARY KEY,
                        filepath TEXT NOT NULL UNIQUE,
                        prompt TEXT NOT NULL,
                        negative_prompt TEXT,
                        model_used TEXT NOT NULL,
                        preset_used TEXT,
                        visual_style TEXT,
                        generation_time_seconds REAL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        category TEXT NOT NULL CHECK (category IN ('nature', 'technology', 'business', 'abstract', 'lifestyle', 'urban')),
                        tags TEXT,
                        resolution TEXT NOT NULL,
                        frames INTEGER NOT NULL,
                        duration_seconds REAL NOT NULL,
                        video_type TEXT NOT NULL CHECK (video_type IN ('short', 'long')),
                        times_used INTEGER DEFAULT 0,
                        status TEXT DEFAULT 'active' CHECK (status IN ('active', 'retired', 'deleted'))
                    );
                    
                    -- Índices para búsquedas frecuentes
                    CREATE INDEX IF NOT EXISTS idx_clips_category ON clips(category);
                    CREATE INDEX IF NOT EXISTS idx_clips_status ON clips(status);
                    CREATE INDEX IF NOT EXISTS idx_clips_times_used ON clips(times_used);
                    CREATE INDEX IF NOT EXISTS idx_clips_created_at ON clips(created_at);
                    CREATE INDEX IF NOT EXISTS idx_clips_video_type ON clips(video_type);
                `
            },
            {
                name: '002_create_clip_usages_table',
                sql: `
                    -- Tabla de registro de uso de clips (Requirement 12.2)
                    CREATE TABLE IF NOT EXISTS clip_usages (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        clip_id TEXT NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
                        video_id TEXT NOT NULL,
                        video_type TEXT NOT NULL CHECK (video_type IN ('short', 'long')),
                        segment_type TEXT CHECK (segment_type IN ('key', 'filler')),
                        used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        platform TEXT
                    );
                    
                    -- Índices para queries frecuentes
                    CREATE INDEX IF NOT EXISTS idx_clip_usages_clip_id ON clip_usages(clip_id);
                    CREATE INDEX IF NOT EXISTS idx_clip_usages_used_at ON clip_usages(used_at);
                    CREATE INDEX IF NOT EXISTS idx_clip_usages_video_id ON clip_usages(video_id);
                    CREATE INDEX IF NOT EXISTS idx_clip_usages_platform ON clip_usages(platform);
                `
            }
        ];
        
        // Obtener migraciones ya aplicadas
        const appliedMigrations = this.db.prepare('SELECT name FROM migrations').all() as { name: string }[];
        const appliedNames = new Set(appliedMigrations.map(m => m.name));
        
        // Aplicar migraciones pendientes
        for (const migration of migrations) {
            if (!appliedNames.has(migration.name)) {
                console.log(`[ClipDatabase] Aplicando migración: ${migration.name}`);
                this.db.exec(migration.sql);
                this.db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migration.name);
            }
        }
    }

    // ========================================================================
    // CRUD DE CLIPS (Tarea 7.3)
    // ========================================================================

    /**
     * Inserta un nuevo clip en la base de datos.
     * Genera UUID automáticamente y establece times_used=0, status='active'.
     * @param clip Datos del clip a insertar (sin id, createdAt, timesUsed, status)
     * @returns ID del clip insertado (UUID)
     * @see Requirement 12.1
     */
    public insertClip(clip: ClipInsert): string {
        const id = randomUUID();
        const stmt = this.db.prepare(`
            INSERT INTO clips (
                id, filepath, prompt, negative_prompt, model_used, preset_used,
                visual_style, generation_time_seconds, category, tags, resolution,
                frames, duration_seconds, video_type, times_used, status
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'active'
            )
        `);
        
        stmt.run(
            id,
            clip.filepath,
            clip.prompt,
            clip.negativePrompt || null,
            clip.modelUsed,
            clip.presetUsed || null,
            clip.visualStyle || null,
            clip.generationTimeSeconds || null,
            clip.category,
            JSON.stringify(clip.tags),
            clip.resolution,
            clip.frames,
            clip.durationSeconds,
            clip.videoType
        );
        
        console.log(`[ClipDatabase] Clip insertado: ${id} (categoría: ${clip.category})`);
        return id;
    }

    /**
     * Obtiene un clip por su ID.
     * @param id ID del clip a obtener
     * @returns Clip completo o null si no existe
     * @see Requirement 12.1
     */
    public getClip(id: string): Clip | null {
        const row = this.db.prepare('SELECT * FROM clips WHERE id = ?').get(id) as any;
        return row ? this.rowToClip(row) : null;
    }

    /**
     * Busca clips activos que coincidan con keywords en prompt o tags.
     * Los resultados se ordenan por menor uso (para distribuir uso uniforme).
     * @param keywords Palabras clave a buscar
     * @param category Categoría opcional para filtrar
     * @returns Lista de clips que coinciden (máximo 20)
     * @see Requirement 12.1
     */
    public findClipsByKeywords(keywords: string[], category?: ClipCategory): Clip[] {
        let sql = `SELECT * FROM clips WHERE status = 'active'`;
        const params: any[] = [];
        
        // Filtrar por categoría si se especifica
        if (category) {
            sql += ` AND category = ?`;
            params.push(category);
        }
        
        // Buscar en prompt y tags por coincidencia parcial
        if (keywords.length > 0) {
            const keywordConditions = keywords.map(() => `(prompt LIKE ? OR tags LIKE ?)`).join(' OR ');
            sql += ` AND (${keywordConditions})`;
            for (const kw of keywords) {
                params.push(`%${kw}%`, `%${kw}%`);
            }
        }
        
        // Ordenar por menor uso y limitar resultados
        sql += ` ORDER BY times_used ASC LIMIT 20`;
        
        const rows = this.db.prepare(sql).all(...params) as any[];
        return rows.map(row => this.rowToClip(row));
    }

    // ========================================================================
    // TRACKING DE USO (Tarea 7.4)
    // ========================================================================

    /**
     * Registra el uso de un clip e incrementa su contador.
     * @param usage Datos del uso (clipId, videoId, videoType, segmentType, platform)
     * @see Requirement 12.2, 11.6
     */
    public recordUsage(usage: ClipUsageInsert): void {
        const stmt = this.db.prepare(`
            INSERT INTO clip_usages (clip_id, video_id, video_type, segment_type, platform)
            VALUES (?, ?, ?, ?, ?)
        `);
        
        stmt.run(
            usage.clipId,
            usage.videoId,
            usage.videoType,
            usage.segmentType || null,
            usage.platform || null
        );
        
        // Incrementar contador de uso automáticamente
        this.incrementUsageCount(usage.clipId);
        
        console.log(`[ClipDatabase] Uso registrado para clip ${usage.clipId} en video ${usage.videoId}`);
    }

    /**
     * Incrementa el contador times_used de un clip.
     * @param clipId ID del clip
     * @see Requirement 11.6
     */
    public incrementUsageCount(clipId: string): void {
        this.db.prepare('UPDATE clips SET times_used = times_used + 1 WHERE id = ?').run(clipId);
    }

    /**
     * Marca un clip como 'retired' para excluirlo de selección futura.
     * Se usa cuando un clip ha sido usado más de 10 veces.
     * @param clipId ID del clip a retirar
     * @see Requirement 11.7
     */
    public retireClip(clipId: string): void {
        this.db.prepare(`UPDATE clips SET status = 'retired' WHERE id = ?`).run(clipId);
        console.log(`[ClipDatabase] Clip retirado: ${clipId}`);
    }

    // ========================================================================
    // QUERIES DE CONSULTA (Tarea 7.5)
    // ========================================================================

    /**
     * Obtiene clips activos no usados en los últimos N días.
     * Útil para identificar clips subutilizados o para limpieza.
     * @param days Número de días sin uso
     * @returns Lista de clips no usados en el período
     * @see Requirement 12.3
     */
    public getClipsNotUsedSince(days: number): Clip[] {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        
        // Query que encuentra clips sin uso reciente o nunca usados
        const rows = this.db.prepare(`
            SELECT c.* FROM clips c
            LEFT JOIN (
                SELECT clip_id, MAX(used_at) as last_used
                FROM clip_usages
                GROUP BY clip_id
            ) u ON c.id = u.clip_id
            WHERE c.status = 'active'
            AND (u.last_used IS NULL OR u.last_used < ?)
            ORDER BY u.last_used ASC NULLS FIRST
        `).all(cutoffDate.toISOString()) as any[];
        
        return rows.map(row => this.rowToClip(row));
    }

    /**
     * Obtiene clips activos por categoría, ordenados por menor uso o fecha.
     * Permite obtener clips menos usados para distribución uniforme.
     * @param category Categoría de clips
     * @param orderBy Criterio de ordenamiento (least_used o newest)
     * @returns Lista de clips de la categoría
     * @see Requirement 12.4
     */
    public getClipsByCategory(category: ClipCategory, orderBy: 'least_used' | 'newest' = 'least_used'): Clip[] {
        const orderClause = orderBy === 'least_used' ? 'times_used ASC, created_at DESC' : 'created_at DESC';
        const rows = this.db.prepare(`
            SELECT * FROM clips
            WHERE category = ? AND status = 'active'
            ORDER BY ${orderClause}
        `).all(category) as any[];
        
        return rows.map(row => this.rowToClip(row));
    }

    /**
     * Obtiene estadísticas completas del pool de clips.
     * Incluye totales, distribución por categoría/estado, clips más usados, etc.
     * @returns Objeto con métricas completas del pool
     * @see Requirement 12.5
     */
    public getStatistics(): ClipStatistics {
        // Total de clips
        const total = (this.db.prepare('SELECT COUNT(*) as count FROM clips').get() as any).count;
        
        // Clips por categoría
        const byCategory: Record<ClipCategory, number> = {} as any;
        for (const cat of ALL_CATEGORIES) {
            byCategory[cat] = (this.db.prepare(
                'SELECT COUNT(*) as count FROM clips WHERE category = ?'
            ).get(cat) as any).count;
        }
        
        // Clips por estado
        const byStatus: Record<ClipStatus, number> = {} as any;
        for (const status of ALL_STATUSES) {
            byStatus[status] = (this.db.prepare(
                'SELECT COUNT(*) as count FROM clips WHERE status = ?'
            ).get(status) as any).count;
        }
        
        // Top 10 clips más usados
        const mostUsed = this.db.prepare(`
            SELECT id as clipId, times_used as timesUsed
            FROM clips 
            WHERE times_used > 0
            ORDER BY times_used DESC 
            LIMIT 10
        `).all() as Array<{ clipId: string; timesUsed: number }>;
        
        // Clips nunca usados
        const unusedCount = (this.db.prepare(
            'SELECT COUNT(*) as count FROM clips WHERE times_used = 0'
        ).get() as any).count;
        
        // Promedio de usos
        const avgResult = this.db.prepare('SELECT AVG(times_used) as avg FROM clips').get() as any;
        const avgUsage = avgResult.avg || 0;
        
        return {
            totalClips: total,
            clipsByCategory: byCategory,
            clipsByStatus: byStatus,
            mostUsedClips: mostUsed,
            unusedClips: unusedCount,
            averageUsage: Math.round(avgUsage * 100) / 100
        };
    }

    /**
     * Cuenta clips activos por categoría.
     * Útil para verificar niveles del pool y priorizar pre-generación.
     * @returns Mapa de categoría a número de clips activos
     */
    public countByCategory(): Record<ClipCategory, number> {
        const result: Record<ClipCategory, number> = {} as any;
        for (const cat of ALL_CATEGORIES) {
            result[cat] = (this.db.prepare(
                `SELECT COUNT(*) as count FROM clips WHERE category = ? AND status = 'active'`
            ).get(cat) as any).count;
        }
        return result;
    }

    /**
     * Obtiene el último uso de un clip específico.
     * Útil para verificar si un clip fue usado recientemente.
     * @param clipId ID del clip
     * @returns Fecha del último uso o null si nunca fue usado
     */
    public getLastUsage(clipId: string): Date | null {
        const row = this.db.prepare(`
            SELECT used_at FROM clip_usages
            WHERE clip_id = ?
            ORDER BY used_at DESC
            LIMIT 1
        `).get(clipId) as { used_at: string } | undefined;
        
        return row ? new Date(row.used_at) : null;
    }

    /**
     * Verifica si un clip fue usado en los últimos N días.
     * Útil para implementar la regla de no repetición (Requirement 11.3).
     * @param clipId ID del clip
     * @param days Número de días a verificar
     * @returns true si fue usado en el período
     */
    public wasUsedInLastDays(clipId: string, days: number): boolean {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        
        const row = this.db.prepare(`
            SELECT COUNT(*) as count FROM clip_usages
            WHERE clip_id = ? AND used_at > ?
        `).get(clipId, cutoffDate.toISOString()) as { count: number };
        
        return row.count > 0;
    }

    /**
     * Obtiene los IDs de clips usados en un video específico.
     * Útil para evitar repeticiones dentro del mismo video.
     * @param videoId ID del video
     * @returns Lista de IDs de clips usados en el video
     */
    public getClipsUsedInVideo(videoId: string): string[] {
        const rows = this.db.prepare(`
            SELECT DISTINCT clip_id FROM clip_usages
            WHERE video_id = ?
        `).all(videoId) as Array<{ clip_id: string }>;
        
        return rows.map(r => r.clip_id);
    }

    // ========================================================================
    // UTILIDADES
    // ========================================================================

    /**
     * Cierra la conexión a la base de datos.
     * Debe llamarse al finalizar para liberar recursos.
     */
    public close(): void {
        this.db.close();
        console.log('[ClipDatabase] Conexión cerrada');
    }

    /**
     * Convierte una fila de la DB a objeto Clip.
     * Maneja la deserialización de JSON para el campo tags.
     * @param row Fila de la base de datos
     * @returns Objeto Clip tipado
     */
    private rowToClip(row: any): Clip {
        return {
            id: row.id,
            filepath: row.filepath,
            prompt: row.prompt,
            negativePrompt: row.negative_prompt || undefined,
            modelUsed: row.model_used,
            presetUsed: row.preset_used || undefined,
            visualStyle: row.visual_style || undefined,
            generationTimeSeconds: row.generation_time_seconds || undefined,
            createdAt: new Date(row.created_at),
            category: row.category as ClipCategory,
            tags: JSON.parse(row.tags || '[]'),
            resolution: row.resolution,
            frames: row.frames,
            durationSeconds: row.duration_seconds,
            videoType: row.video_type as 'short' | 'long',
            timesUsed: row.times_used,
            status: row.status as ClipStatus
        };
    }

    /**
     * Obtiene la ruta de la base de datos.
     * Útil para debugging y tests.
     * @returns Ruta al archivo SQLite
     */
    public getDatabasePath(): string {
        return this.config.databasePath;
    }

    /**
     * Verifica si la base de datos está inicializada.
     * @returns true si las tablas principales existen
     */
    public isInitialized(): boolean {
        try {
            const result = this.db.prepare(`
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name='clips'
            `).get();
            return !!result;
        } catch {
            return false;
        }
    }

    /**
     * Elimina todos los datos de prueba (solo para testing).
     * NO usar en producción.
     */
    public clearAllData(): void {
        this.db.exec('DELETE FROM clip_usages');
        this.db.exec('DELETE FROM clips');
        console.log('[ClipDatabase] Todos los datos han sido eliminados (modo test)');
    }
}
