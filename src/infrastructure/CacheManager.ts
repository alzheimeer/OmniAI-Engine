/**
 * CacheManager.ts
 * 
 * Sistema centralizado de gestión de caché para todos los assets del motor OmniAI-Engine.
 * Maneja caché de archivos (videos, audio, thumbnails, música) con TTL configurables
 * por tipo de archivo, hash para identificación única y limpieza automática de expirados.
 * 
 * REQ-4.1.1: Crear CacheManager.ts centralizado para todos los assets
 * REQ-4.1.2: Implementar caché de videos Pexels por query+transformación
 * REQ-4.1.3: Implementar caché de audios TTS por texto+voz+parámetros
 * REQ-4.1.4: Implementar caché de música transformada por pista+parámetros
 * REQ-4.1.5: Almacenar en content/cache/ con estructura: /videos/, /audio/, /thumbnails/, /music/
 * REQ-4.1.6: TTL por tipo: videos 30d, audio 7d, thumbnails 3d, música 14d
 * REQ-4.1.7: Job de limpieza que corra diario
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// ===== TIPOS =====

/**
 * Tipos de caché soportados por el sistema.
 * Cada tipo tiene un TTL diferente según su frecuencia de uso y tamaño.
 */
export type CacheType = 'video' | 'audio' | 'thumbnail' | 'music';

/**
 * Entrada de caché que representa un archivo almacenado.
 * Contiene metadatos para gestión del ciclo de vida del archivo.
 */
export interface CacheEntry {
    /** Hash único de identificación (generado a partir de parámetros) */
    key: string;
    
    /** Tipo de archivo cacheado */
    type: CacheType;
    
    /** Ruta absoluta al archivo cacheado */
    path: string;
    
    /** Tamaño del archivo en bytes */
    size: number;
    
    /** Fecha de creación de la entrada de caché */
    createdAt: Date;
    
    /** Fecha de expiración según TTL del tipo */
    expiresAt: Date;
    
    /** Metadatos adicionales específicos del tipo de caché */
    metadata?: Record<string, unknown>;
}

/**
 * Configuración del sistema de caché.
 * Define directorio base, TTLs por tipo y límites opcionales.
 */
export interface CacheConfig {
    /** Directorio base para almacenar archivos cacheados */
    baseDir: string;
    
    /** TTL en días por tipo de archivo */
    ttl: Record<CacheType, number>;
    
    /** Tamaño máximo total del caché en bytes (opcional) */
    maxSize?: number;
}

/**
 * Metadatos almacenados junto con cada entrada de caché.
 * Formato JSON para persistencia en disco.
 */
interface CacheMetadata {
    /** Clave única del caché */
    key: string;
    
    /** Tipo de archivo */
    type: CacheType;
    
    /** Ruta al archivo de datos */
    dataPath: string;
    
    /** Tamaño en bytes */
    size: number;
    
    /** Timestamp de creación (ISO 8601) */
    createdAt: string;
    
    /** Timestamp de expiración (ISO 8601) */
    expiresAt: string;
    
    /** Metadatos adicionales del usuario */
    metadata?: Record<string, unknown>;
}

/**
 * Estadísticas del sistema de caché.
 * Útil para métricas y monitoreo.
 */
export interface CacheStats {
    /** Número total de hits de caché */
    hits: number;
    
    /** Número total de misses de caché */
    misses: number;
    
    /** Número de entradas por tipo */
    entriesByType: Record<CacheType, number>;
    
    /** Tamaño total por tipo en bytes */
    sizeByType: Record<CacheType, number>;
    
    /** Tamaño total del caché en bytes */
    totalSize: number;
    
    /** Número total de entradas */
    totalEntries: number;
}

// ===== CONSTANTES =====

/**
 * Configuración por defecto del sistema de caché.
 * REQ-4.1.5: Estructura de carpetas videos, audio, thumbnails, music
 * REQ-4.1.6: TTL por tipo de asset
 */
export const DEFAULT_CACHE_CONFIG: CacheConfig = {
    baseDir: 'content/cache',
    ttl: {
        video: 30,      // 30 días para videos de Pexels transformados
        audio: 7,       // 7 días para audios TTS
        thumbnail: 3,   // 3 días para thumbnails (se regeneran frecuentemente)
        music: 14       // 14 días para música transformada
    },
    maxSize: 10 * 1024 * 1024 * 1024  // 10GB límite por defecto
};

/**
 * Mapeo de tipos de caché a subdirectorios.
 */
const TYPE_DIRECTORIES: Record<CacheType, string> = {
    video: 'videos',
    audio: 'audio',
    thumbnail: 'thumbnails',
    music: 'music'
};

/**
 * Extensión para archivos de metadatos.
 */
const METADATA_EXTENSION = '.cache.json';

// ===== CLASE PRINCIPAL =====

/**
 * CacheManager - Gestor centralizado de caché para assets de OmniAI-Engine.
 * 
 * Esta clase implementa:
 * - Almacenamiento de archivos por tipo (video, audio, thumbnail, music)
 * - TTL configurable por tipo de archivo
 * - Generación de claves únicas mediante hash
 * - Limpieza automática de entradas expiradas
 * - Estadísticas de uso para métricas
 * 
 * Estructura de directorios:
 * content/cache/
 * ├── videos/
 * ├── audio/
 * ├── thumbnails/
 * └── music/
 */
export class CacheManager {
    /** Configuración activa del caché */
    private config: CacheConfig;
    
    /** Estadísticas en memoria (se reinician al reiniciar la aplicación) */
    private stats: CacheStats;

    /**
     * Crea una nueva instancia de CacheManager.
     * 
     * @param config - Configuración personalizada (opcional, usa DEFAULT_CACHE_CONFIG si no se proporciona)
     */
    constructor(config?: Partial<CacheConfig>) {
        this.config = {
            ...DEFAULT_CACHE_CONFIG,
            ...config,
            ttl: {
                ...DEFAULT_CACHE_CONFIG.ttl,
                ...config?.ttl
            }
        };
        
        this.stats = {
            hits: 0,
            misses: 0,
            entriesByType: { video: 0, audio: 0, thumbnail: 0, music: 0 },
            sizeByType: { video: 0, audio: 0, thumbnail: 0, music: 0 },
            totalSize: 0,
            totalEntries: 0
        };
        
        // Asegurar que los directorios existan
        this.ensureDirectories();
    }

    // ===== MÉTODOS PÚBLICOS =====

    /**
     * Obtiene una entrada del caché si existe y no ha expirado.
     * 
     * @param key - Clave única de la entrada
     * @returns CacheEntry si existe y es válida, null si no existe o expiró
     */
    public get(key: string): CacheEntry | null {
        const metadataPath = this.findMetadataPath(key);
        
        if (!metadataPath) {
            this.stats.misses++;
            return null;
        }
        
        try {
            const metadata = this.readMetadata(metadataPath);
            
            if (!metadata) {
                this.stats.misses++;
                return null;
            }
            
            // Verificar si el archivo de datos existe
            if (!fs.existsSync(metadata.dataPath)) {
                // Limpiar metadatos huérfanos
                this.deleteMetadata(metadataPath);
                this.stats.misses++;
                return null;
            }
            
            // Verificar expiración
            const expiresAt = new Date(metadata.expiresAt);
            if (new Date() > expiresAt) {
                // Entrada expirada, eliminarla
                this.deleteEntry(key, metadata.type);
                this.stats.misses++;
                return null;
            }
            
            this.stats.hits++;
            
            return {
                key: metadata.key,
                type: metadata.type,
                path: metadata.dataPath,
                size: metadata.size,
                createdAt: new Date(metadata.createdAt),
                expiresAt: new Date(metadata.expiresAt),
                metadata: metadata.metadata
            };
        } catch (error) {
            console.warn(`Error leyendo caché para key ${key}:`, error);
            this.stats.misses++;
            return null;
        }
    }

    /**
     * Guarda una nueva entrada en el caché.
     * 
     * @param key - Clave única de identificación
     * @param type - Tipo de archivo (video, audio, thumbnail, music)
     * @param sourcePath - Ruta al archivo fuente a cachear
     * @param metadata - Metadatos adicionales opcionales
     * @returns CacheEntry con la información de la entrada creada
     */
    public set(
        key: string,
        type: CacheType,
        sourcePath: string,
        metadata?: Record<string, unknown>
    ): CacheEntry {
        // Verificar que el archivo fuente existe
        if (!fs.existsSync(sourcePath)) {
            throw new Error(`Archivo fuente no existe: ${sourcePath}`);
        }
        
        // Obtener estadísticas del archivo
        const fileStats = fs.statSync(sourcePath);
        const size = fileStats.size;
        
        // Calcular fechas
        const now = new Date();
        const ttlDays = this.config.ttl[type];
        const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);
        
        // Determinar rutas de destino
        const typeDir = this.getTypeDirectory(type);
        const extension = path.extname(sourcePath);
        const dataFileName = `${key}${extension}`;
        const dataPath = path.join(typeDir, dataFileName);
        const metadataFileName = `${key}${METADATA_EXTENSION}`;
        const metadataPath = path.join(typeDir, metadataFileName);
        
        // Copiar archivo al caché
        fs.copyFileSync(sourcePath, dataPath);
        
        // Crear y guardar metadatos
        const cacheMetadata: CacheMetadata = {
            key,
            type,
            dataPath: path.resolve(dataPath),
            size,
            createdAt: now.toISOString(),
            expiresAt: expiresAt.toISOString(),
            metadata
        };
        
        fs.writeFileSync(metadataPath, JSON.stringify(cacheMetadata, null, 2), 'utf-8');
        
        // Actualizar estadísticas
        this.stats.entriesByType[type]++;
        this.stats.sizeByType[type] += size;
        this.stats.totalSize += size;
        this.stats.totalEntries++;
        
        return {
            key,
            type,
            path: path.resolve(dataPath),
            size,
            createdAt: now,
            expiresAt,
            metadata
        };
    }

    /**
     * Verifica si existe una entrada válida (no expirada) en el caché.
     * 
     * @param key - Clave única de la entrada
     * @returns true si existe y no ha expirado, false en caso contrario
     */
    public has(key: string): boolean {
        return this.get(key) !== null;
    }

    /**
     * Elimina una entrada del caché.
     * 
     * @param key - Clave única de la entrada a eliminar
     * @returns true si se eliminó correctamente, false si no existía
     */
    public delete(key: string): boolean {
        const metadataPath = this.findMetadataPath(key);
        
        if (!metadataPath) {
            return false;
        }
        
        try {
            const metadata = this.readMetadata(metadataPath);
            if (metadata) {
                return this.deleteEntry(key, metadata.type);
            }
            return false;
        } catch {
            return false;
        }
    }

    /**
     * Elimina todas las entradas expiradas del caché.
     * REQ-4.1.7: Job de limpieza automática
     * 
     * @returns Número de entradas eliminadas
     */
    public cleanup(): number {
        let removedCount = 0;
        const now = new Date();
        
        // Iterar sobre cada tipo de caché
        for (const type of Object.keys(TYPE_DIRECTORIES) as CacheType[]) {
            const typeDir = this.getTypeDirectory(type);
            
            if (!fs.existsSync(typeDir)) {
                continue;
            }
            
            try {
                const files = fs.readdirSync(typeDir);
                const metadataFiles = files.filter(f => f.endsWith(METADATA_EXTENSION));
                
                for (const metaFile of metadataFiles) {
                    const metadataPath = path.join(typeDir, metaFile);
                    
                    try {
                        const metadata = this.readMetadata(metadataPath);
                        
                        if (!metadata) {
                            // Metadatos corruptos, eliminar
                            fs.unlinkSync(metadataPath);
                            removedCount++;
                            continue;
                        }
                        
                        const expiresAt = new Date(metadata.expiresAt);
                        
                        if (now > expiresAt) {
                            // Entrada expirada, eliminar
                            if (this.deleteEntry(metadata.key, metadata.type)) {
                                removedCount++;
                            }
                        } else if (!fs.existsSync(metadata.dataPath)) {
                            // Archivo de datos faltante, eliminar metadatos huérfanos
                            fs.unlinkSync(metadataPath);
                            removedCount++;
                        }
                    } catch (error) {
                        console.warn(`Error procesando ${metaFile} durante limpieza:`, error);
                        // Intentar eliminar metadatos corruptos
                        try {
                            fs.unlinkSync(metadataPath);
                            removedCount++;
                        } catch { /* ignorar */ }
                    }
                }
            } catch (error) {
                console.error(`Error limpiando directorio ${typeDir}:`, error);
            }
        }
        
        return removedCount;
    }

    /**
     * Genera una clave hash única basada en un objeto de parámetros.
     * Útil para identificar cachés de videos transformados, audios TTS, etc.
     * 
     * @param params - Objeto con los parámetros a hashear
     * @returns Hash MD5 de 32 caracteres
     */
    public generateKey(params: object): string {
        // Serializar de forma determinística (ordenar claves)
        const sortedParams = this.sortObjectKeys(params);
        const data = JSON.stringify(sortedParams);
        return crypto.createHash('md5').update(data).digest('hex');
    }

    /**
     * Obtiene las estadísticas actuales del caché.
     * 
     * @returns Estadísticas de uso del caché
     */
    public getStats(): CacheStats {
        return { ...this.stats };
    }

    /**
     * Recalcula las estadísticas escaneando el directorio de caché.
     * Útil después de operaciones externas o al iniciar.
     * 
     * @returns Estadísticas actualizadas
     */
    public recalculateStats(): CacheStats {
        this.stats = {
            hits: this.stats.hits,
            misses: this.stats.misses,
            entriesByType: { video: 0, audio: 0, thumbnail: 0, music: 0 },
            sizeByType: { video: 0, audio: 0, thumbnail: 0, music: 0 },
            totalSize: 0,
            totalEntries: 0
        };
        
        for (const type of Object.keys(TYPE_DIRECTORIES) as CacheType[]) {
            const typeDir = this.getTypeDirectory(type);
            
            if (!fs.existsSync(typeDir)) {
                continue;
            }
            
            const files = fs.readdirSync(typeDir);
            const metadataFiles = files.filter(f => f.endsWith(METADATA_EXTENSION));
            
            for (const metaFile of metadataFiles) {
                const metadataPath = path.join(typeDir, metaFile);
                const metadata = this.readMetadata(metadataPath);
                
                if (metadata && fs.existsSync(metadata.dataPath)) {
                    this.stats.entriesByType[type]++;
                    this.stats.sizeByType[type] += metadata.size;
                    this.stats.totalSize += metadata.size;
                    this.stats.totalEntries++;
                }
            }
        }
        
        return this.getStats();
    }

    /**
     * Obtiene la configuración actual del caché.
     * 
     * @returns Configuración activa
     */
    public getConfig(): CacheConfig {
        return { ...this.config };
    }

    // ===== MÉTODOS PRIVADOS =====

    /**
     * Asegura que todos los directorios de caché existan.
     */
    private ensureDirectories(): void {
        const baseDir = this.getBaseDirectory();
        
        if (!fs.existsSync(baseDir)) {
            fs.mkdirSync(baseDir, { recursive: true });
        }
        
        for (const type of Object.keys(TYPE_DIRECTORIES) as CacheType[]) {
            const typeDir = this.getTypeDirectory(type);
            if (!fs.existsSync(typeDir)) {
                fs.mkdirSync(typeDir, { recursive: true });
            }
        }
    }

    /**
     * Obtiene la ruta absoluta al directorio base de caché.
     */
    private getBaseDirectory(): string {
        return path.resolve(process.cwd(), this.config.baseDir);
    }

    /**
     * Obtiene la ruta absoluta al directorio de un tipo específico.
     */
    private getTypeDirectory(type: CacheType): string {
        return path.join(this.getBaseDirectory(), TYPE_DIRECTORIES[type]);
    }

    /**
     * Busca la ruta al archivo de metadatos de una clave en todos los directorios.
     */
    private findMetadataPath(key: string): string | null {
        for (const type of Object.keys(TYPE_DIRECTORIES) as CacheType[]) {
            const typeDir = this.getTypeDirectory(type);
            const metadataPath = path.join(typeDir, `${key}${METADATA_EXTENSION}`);
            
            if (fs.existsSync(metadataPath)) {
                return metadataPath;
            }
        }
        return null;
    }

    /**
     * Lee y parsea un archivo de metadatos.
     */
    private readMetadata(metadataPath: string): CacheMetadata | null {
        try {
            const content = fs.readFileSync(metadataPath, 'utf-8');
            return JSON.parse(content) as CacheMetadata;
        } catch {
            return null;
        }
    }

    /**
     * Elimina un archivo de metadatos.
     */
    private deleteMetadata(metadataPath: string): void {
        if (fs.existsSync(metadataPath)) {
            fs.unlinkSync(metadataPath);
        }
    }

    /**
     * Elimina una entrada completa (datos + metadatos) del caché.
     */
    private deleteEntry(key: string, type: CacheType): boolean {
        const typeDir = this.getTypeDirectory(type);
        const metadataPath = path.join(typeDir, `${key}${METADATA_EXTENSION}`);
        
        try {
            const metadata = this.readMetadata(metadataPath);
            
            if (metadata) {
                // Actualizar estadísticas
                if (fs.existsSync(metadata.dataPath)) {
                    this.stats.entriesByType[type] = Math.max(0, this.stats.entriesByType[type] - 1);
                    this.stats.sizeByType[type] = Math.max(0, this.stats.sizeByType[type] - metadata.size);
                    this.stats.totalSize = Math.max(0, this.stats.totalSize - metadata.size);
                    this.stats.totalEntries = Math.max(0, this.stats.totalEntries - 1);
                    
                    // Eliminar archivo de datos
                    fs.unlinkSync(metadata.dataPath);
                }
            }
            
            // Eliminar metadatos
            if (fs.existsSync(metadataPath)) {
                fs.unlinkSync(metadataPath);
            }
            
            return true;
        } catch (error) {
            console.warn(`Error eliminando entrada ${key}:`, error);
            return false;
        }
    }

    /**
     * Ordena recursivamente las claves de un objeto para serialización determinística.
     */
    private sortObjectKeys(obj: unknown): unknown {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }
        
        if (Array.isArray(obj)) {
            return obj.map(item => this.sortObjectKeys(item));
        }
        
        const sorted: Record<string, unknown> = {};
        const keys = Object.keys(obj as Record<string, unknown>).sort();
        
        for (const key of keys) {
            sorted[key] = this.sortObjectKeys((obj as Record<string, unknown>)[key]);
        }
        
        return sorted;
    }
}

// ===== INSTANCIA SINGLETON =====

/**
 * Instancia singleton del CacheManager con configuración por defecto.
 * Usar esta instancia para operaciones de caché en toda la aplicación.
 */
export const cacheManager = new CacheManager();

// ===== EXPORTAR POR DEFECTO =====

export default CacheManager;
