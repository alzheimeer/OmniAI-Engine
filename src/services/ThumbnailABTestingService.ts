/**
 * ThumbnailABTestingService.ts
 * 
 * Sistema de A/B testing para thumbnails que permite generar versiones alternativas,
 * trackear cual versión se usa, e integrar con métricas para medir rendimiento.
 * 
 * REQ-5.1.3: Implementar A/B testing de thumbnails guardando versiones alternativas
 * 
 * Características:
 * - Genera versiones A y B de cada thumbnail con variaciones controladas
 * - Almacena metadata de tests en SQLite para tracking
 * - Integra con YouTube Analytics para medir CTR por versión
 * - Selección automática de versión ganadora basada en rendimiento
 * - Reportes de resultados de A/B tests por Telegram
 */

import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { ThumbnailService, ThumbnailGenerationConfig, ThumbnailGenerationResult } from './ThumbnailService';
import { ThumbnailTemplate, ALL_TEMPLATES, TEMPLATES_BY_ID } from './ThumbnailTemplates';
import { Logger } from '../infrastructure/Logger';
import { MetricsCollector, metricsCollector } from '../infrastructure/MetricsCollector';

// ===== INTERFACES =====

/**
 * Variante de thumbnail para A/B testing
 */
export type ThumbnailVariant = 'A' | 'B';

/**
 * Tipos de variación para generar alternativas
 */
export type VariationType = 
    | 'template'           // Cambiar la plantilla base
    | 'color_scheme'       // Variar esquema de colores
    | 'text_position'      // Cambiar posición del texto
    | 'dynamic_elements'   // Diferentes elementos dinámicos
    | 'style_intensity';   // Variar intensidad de efectos

/**
 * Configuración de un A/B test de thumbnail
 */
export interface ThumbnailABTestConfig {
    /** Título del video */
    title: string;
    
    /** ID del video en YouTube (una vez publicado) */
    videoId?: string;
    
    /** Identificador del canal */
    channelId: string;
    
    /** Si es un Short */
    isShort: boolean;
    
    /** Prompt visual para imágenes de fondo */
    visualPrompt?: string;
    
    /** Tipo de variación a aplicar para la versión B */
    variationType: VariationType;
    
    /** Plantilla específica para versión A (opcional) */
    templateIdA?: string;
    
    /** Plantilla específica para versión B (opcional) */
    templateIdB?: string;
    
    /** Tags de mood para selección automática de plantillas */
    moodTags?: string[];
    
    /** Aplicar transformación anti-detección */
    applyAntiDetection?: boolean;
}

/**
 * Resultado de generación de A/B test
 */
export interface ThumbnailABTestResult {
    /** ID único del test */
    testId: string;
    
    /** Resultado de thumbnail versión A */
    variantA: ThumbnailGenerationResult & {
        variant: 'A';
        variationApplied: string;
    };
    
    /** Resultado de thumbnail versión B */
    variantB: ThumbnailGenerationResult & {
        variant: 'B';
        variationApplied: string;
    };
    
    /** Variante actualmente activa (la que está en YouTube) */
    activeVariant: ThumbnailVariant;
    
    /** Timestamp de creación del test */
    createdAt: Date;
}

/**
 * Registro de A/B test en base de datos
 */
export interface ABTestRecord {
    /** ID único del test */
    id?: number;
    
    /** Test ID generado */
    testId: string;
    
    /** ID del video en YouTube */
    videoId?: string;
    
    /** ID del canal */
    channelId: string;
    
    /** Título del video */
    title: string;
    
    /** Variante activa actualmente */
    activeVariant: ThumbnailVariant;
    
    /** Tipo de variación aplicada */
    variationType: VariationType;
    
    /** Ruta al thumbnail A */
    pathVariantA: string;
    
    /** Ruta al thumbnail B */
    pathVariantB: string;
    
    /** Template ID usado para A */
    templateIdA: string;
    
    /** Template ID usado para B */
    templateIdB: string;
    
    /** Hash del thumbnail A */
    hashA?: string;
    
    /** Hash del thumbnail B */
    hashB?: string;
    
    /** CTR medido para variante A (de YouTube Analytics) */
    ctrVariantA?: number;
    
    /** CTR medido para variante B (de YouTube Analytics) */
    ctrVariantB?: number;
    
    /** Impresiones de variante A */
    impressionsA?: number;
    
    /** Impresiones de variante B */
    impressionsB?: number;
    
    /** Clicks de variante A */
    clicksA?: number;
    
    /** Clicks de variante B */
    clicksB?: number;
    
    /** Variante ganadora (determinada después de suficientes datos) */
    winner?: ThumbnailVariant;
    
    /** Estado del test */
    status: 'active' | 'completed' | 'inconclusive';
    
    /** Fecha de creación */
    createdAt: Date;
    
    /** Fecha de última actualización */
    updatedAt: Date;
    
    /** Fecha de finalización (cuando se declara ganador) */
    completedAt?: Date;
}

/**
 * Métricas de rendimiento de una variante
 */
export interface VariantPerformance {
    variant: ThumbnailVariant;
    ctr: number;
    impressions: number;
    clicks: number;
    confidenceLevel: number;
}

/**
 * Resultado de análisis de A/B test
 */
export interface ABTestAnalysis {
    testId: string;
    variantA: VariantPerformance;
    variantB: VariantPerformance;
    winner?: ThumbnailVariant;
    uplift: number; // Mejora porcentual del ganador sobre el perdedor
    isStatisticallySignificant: boolean;
    recommendedAction: 'continue_test' | 'select_winner' | 'inconclusive';
    message: string;
}

// ===== CONSTANTES =====

/**
 * Mínimo de impresiones necesarias para declarar un ganador
 */
const MIN_IMPRESSIONS_FOR_DECISION = 100;

/**
 * Diferencia mínima de CTR para considerar significativa (5%)
 */
const MIN_CTR_DIFFERENCE = 0.05;

/**
 * Nivel de confianza requerido (95%)
 */
const CONFIDENCE_THRESHOLD = 0.95;

// ===== CLASE PRINCIPAL =====

/**
 * ThumbnailABTestingService - Sistema de A/B testing para thumbnails
 * 
 * Esta clase implementa:
 * - Generación de versiones A/B de thumbnails
 * - Tracking de métricas por variante
 * - Análisis estadístico para seleccionar ganador
 * - Integración con YouTube Analytics
 */
export class ThumbnailABTestingService {
    /** Conexión a SQLite */
    private db: sqlite3.Database | null = null;
    
    /** Logger para trazabilidad */
    private logger: Logger;
    
    /** Flag de inicialización */
    private initialized: boolean = false;
    
    /** Ruta a la base de datos */
    private dbPath: string;

    /**
     * Crea una nueva instancia del servicio de A/B testing
     */
    constructor(dbPath?: string) {
        this.dbPath = dbPath || path.join(process.cwd(), 'content/ab_testing.sqlite');
        this.logger = new Logger('ThumbnailABTesting');
        this.initialize();
    }

    // ===== INICIALIZACIÓN =====

    /**
     * Inicializa la conexión a la base de datos y crea tablas
     */
    public initialize(): void {
        if (this.initialized) {
            return;
        }

        // Asegurar que el directorio existe
        const dbDir = path.dirname(this.dbPath);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }

        // Crear conexión
        this.db = new sqlite3.Database(this.dbPath, (err) => {
            if (err) {
                this.logger.error('Error conectando a base de datos de A/B testing', err);
            } else {
                this.logger.info('Conexión a base de datos de A/B testing establecida', { path: this.dbPath });
            }
        });

        // Crear tablas
        this.initTables();
        this.initialized = true;
    }

    /**
     * Inicializa las tablas de la base de datos
     */
    private initTables(): void {
        if (!this.db) return;

        this.db.serialize(() => {
            // Tabla principal de A/B tests
            this.db?.run(`
                CREATE TABLE IF NOT EXISTS ab_tests (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    test_id TEXT UNIQUE NOT NULL,
                    video_id TEXT,
                    channel_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    active_variant TEXT NOT NULL DEFAULT 'A',
                    variation_type TEXT NOT NULL,
                    path_variant_a TEXT NOT NULL,
                    path_variant_b TEXT NOT NULL,
                    template_id_a TEXT NOT NULL,
                    template_id_b TEXT NOT NULL,
                    hash_a TEXT,
                    hash_b TEXT,
                    ctr_variant_a REAL,
                    ctr_variant_b REAL,
                    impressions_a INTEGER DEFAULT 0,
                    impressions_b INTEGER DEFAULT 0,
                    clicks_a INTEGER DEFAULT 0,
                    clicks_b INTEGER DEFAULT 0,
                    winner TEXT,
                    status TEXT NOT NULL DEFAULT 'active',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    completed_at DATETIME
                )
            `);

            // Índices para consultas eficientes
            this.db?.run(`CREATE INDEX IF NOT EXISTS idx_ab_tests_video ON ab_tests(video_id)`);
            this.db?.run(`CREATE INDEX IF NOT EXISTS idx_ab_tests_channel ON ab_tests(channel_id)`);
            this.db?.run(`CREATE INDEX IF NOT EXISTS idx_ab_tests_status ON ab_tests(status)`);
            this.db?.run(`CREATE INDEX IF NOT EXISTS idx_ab_tests_created ON ab_tests(created_at)`);

            // Tabla de historial de cambios de variante
            this.db?.run(`
                CREATE TABLE IF NOT EXISTS ab_test_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    test_id TEXT NOT NULL,
                    from_variant TEXT NOT NULL,
                    to_variant TEXT NOT NULL,
                    reason TEXT,
                    changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (test_id) REFERENCES ab_tests(test_id)
                )
            `);
        });
    }

    // ===== GENERACIÓN DE A/B TESTS =====

    /**
     * Genera un A/B test completo con dos variantes de thumbnail
     * 
     * @param config Configuración del A/B test
     * @returns Resultado con ambas variantes generadas
     */
    public async generateABTest(config: ThumbnailABTestConfig): Promise<ThumbnailABTestResult> {
        this.logger.info(`🧪 Generando A/B test para: "${config.title}"`);

        const testId = this.generateTestId();
        const timestamp = Date.now();
        
        // Determinar plantillas para cada variante
        const { templateA, templateB, variationDescription } = this.selectVariantTemplates(config);

        // Generar nombres de archivo
        const baseFilename = this.sanitizeFilename(config.title);
        const filenameA = `${baseFilename}_${testId}_A_${timestamp}.jpg`;
        const filenameB = `${baseFilename}_${testId}_B_${timestamp}.jpg`;

        // Generar variante A
        this.logger.info(`📸 Generando variante A con plantilla: ${templateA.name}`);
        const configA: ThumbnailGenerationConfig = {
            title: config.title,
            isShort: config.isShort,
            visualPrompt: config.visualPrompt,
            outputFilename: filenameA,
            templateId: templateA.id,
            moodTags: config.moodTags,
            channelName: this.getChannelName(config.channelId),
            applyAntiDetection: config.applyAntiDetection ?? true,
            enableDynamicElements: true
        };
        const resultA = await ThumbnailService.generateThumbnail(configA);

        // Generar variante B con configuración diferente según tipo de variación
        this.logger.info(`📸 Generando variante B con plantilla: ${templateB.name}`);
        const configB = this.buildVariantBConfig(config, templateB, filenameB);
        const resultB = await ThumbnailService.generateThumbnail(configB);

        // Guardar test en base de datos
        const record: Omit<ABTestRecord, 'id'> = {
            testId,
            videoId: config.videoId,
            channelId: config.channelId,
            title: config.title,
            activeVariant: 'A', // Por defecto empieza con A
            variationType: config.variationType,
            pathVariantA: resultA.outputPath,
            pathVariantB: resultB.outputPath,
            templateIdA: templateA.id,
            templateIdB: templateB.id,
            hashA: resultA.hash,
            hashB: resultB.hash,
            status: 'active',
            createdAt: new Date(),
            updatedAt: new Date()
        };

        await this.saveABTest(record);

        // Registrar métricas
        await metricsCollector.record({
            operationType: 'thumbnail_transform',
            status: 'success',
            durationMs: 0,
            metadata: {
                testId,
                variationType: config.variationType,
                templateA: templateA.id,
                templateB: templateB.id,
                action: 'ab_test_created'
            }
        });

        this.logger.info(`✅ A/B test creado: ${testId}`);

        return {
            testId,
            variantA: {
                ...resultA,
                variant: 'A',
                variationApplied: `Template: ${templateA.name}`
            },
            variantB: {
                ...resultB,
                variant: 'B',
                variationApplied: variationDescription
            },
            activeVariant: 'A',
            createdAt: new Date()
        };
    }

    /**
     * Selecciona plantillas para las variantes A y B según el tipo de variación
     */
    private selectVariantTemplates(config: ThumbnailABTestConfig): {
        templateA: ThumbnailTemplate;
        templateB: ThumbnailTemplate;
        variationDescription: string;
    } {
        let templateA: ThumbnailTemplate;
        let templateB: ThumbnailTemplate;
        let variationDescription: string;

        switch (config.variationType) {
            case 'template':
                // Usar dos plantillas completamente diferentes
                templateA = config.templateIdA 
                    ? TEMPLATES_BY_ID[config.templateIdA] || ThumbnailService.selectTemplateRandom()
                    : ThumbnailService.selectTemplateByMood(config.moodTags || []);
                
                // Asegurar que B es diferente de A
                do {
                    templateB = config.templateIdB
                        ? TEMPLATES_BY_ID[config.templateIdB] || ThumbnailService.selectTemplateRandom()
                        : ThumbnailService.selectTemplateRandom();
                } while (templateB.id === templateA.id && ALL_TEMPLATES.length > 1);
                
                variationDescription = `Template diferente: ${templateB.name}`;
                break;

            case 'color_scheme':
                // Misma plantilla base, pero buscar una con esquema de color contrastante
                templateA = this.getTemplateForTest(config);
                templateB = this.selectContrastingTemplate(templateA);
                variationDescription = `Esquema de color: ${templateB.colors.accent}`;
                break;

            case 'text_position':
                // Misma plantilla pero cambiar posición de texto
                templateA = this.getTemplateForTest(config);
                templateB = this.selectDifferentTextPositionTemplate(templateA);
                variationDescription = `Posición de texto: ${templateB.layout.titlePosition}`;
                break;

            case 'dynamic_elements':
                // Misma plantilla base, diferentes elementos dinámicos
                templateA = this.getTemplateForTest(config);
                templateB = { ...templateA }; // Misma plantilla, elementos se varían en config
                variationDescription = 'Elementos dinámicos diferentes';
                break;

            case 'style_intensity':
                // Variar intensidad de efectos (viñeta, glow, etc)
                templateA = this.getTemplateForTest(config);
                templateB = this.selectDifferentIntensityTemplate(templateA);
                variationDescription = `Intensidad de estilo: ${templateB.effects.vignette ? 'Con viñeta' : 'Sin viñeta'}`;
                break;

            default:
                templateA = this.getTemplateForTest(config);
                templateB = ThumbnailService.selectTemplateRandom();
                variationDescription = 'Variación aleatoria';
        }

        return { templateA, templateB, variationDescription };
    }

    /**
     * Obtiene la plantilla inicial para el test
     */
    private getTemplateForTest(config: ThumbnailABTestConfig): ThumbnailTemplate {
        if (config.templateIdA) {
            return TEMPLATES_BY_ID[config.templateIdA] || ThumbnailService.selectTemplateRandom();
        }
        if (config.moodTags && config.moodTags.length > 0) {
            return ThumbnailService.selectTemplateByMood(config.moodTags);
        }
        return ThumbnailService.selectTemplateRandom();
    }

    /**
     * Selecciona una plantilla con colores contrastantes
     */
    private selectContrastingTemplate(baseTemplate: ThumbnailTemplate): ThumbnailTemplate {
        // Buscar plantilla con color de acento diferente
        const baseAccent = baseTemplate.colors.accent.toLowerCase();
        
        for (const template of ALL_TEMPLATES) {
            if (template.id !== baseTemplate.id) {
                const templateAccent = template.colors.accent.toLowerCase();
                // Considerar diferente si el color de acento es distinto
                if (templateAccent !== baseAccent) {
                    return template;
                }
            }
        }
        
        // Si no encuentra, retornar cualquier otra
        return ALL_TEMPLATES.find(t => t.id !== baseTemplate.id) || baseTemplate;
    }

    /**
     * Selecciona plantilla con diferente posición de texto
     */
    private selectDifferentTextPositionTemplate(baseTemplate: ThumbnailTemplate): ThumbnailTemplate {
        const basePosition = baseTemplate.layout.titlePosition;
        
        for (const template of ALL_TEMPLATES) {
            if (template.layout.titlePosition !== basePosition) {
                return template;
            }
        }
        
        return ALL_TEMPLATES.find(t => t.id !== baseTemplate.id) || baseTemplate;
    }

    /**
     * Selecciona plantilla con diferente intensidad de efectos
     */
    private selectDifferentIntensityTemplate(baseTemplate: ThumbnailTemplate): ThumbnailTemplate {
        const baseVignette = baseTemplate.effects.vignette;
        
        for (const template of ALL_TEMPLATES) {
            if (template.effects.vignette !== baseVignette) {
                return template;
            }
        }
        
        return ALL_TEMPLATES.find(t => t.id !== baseTemplate.id) || baseTemplate;
    }

    /**
     * Construye la configuración para la variante B
     */
    private buildVariantBConfig(
        config: ThumbnailABTestConfig,
        templateB: ThumbnailTemplate,
        filename: string
    ): ThumbnailGenerationConfig {
        const baseConfig: ThumbnailGenerationConfig = {
            title: config.title,
            isShort: config.isShort,
            visualPrompt: config.visualPrompt,
            outputFilename: filename,
            templateId: templateB.id,
            moodTags: config.moodTags,
            channelName: this.getChannelName(config.channelId),
            applyAntiDetection: config.applyAntiDetection ?? true,
            enableDynamicElements: true
        };

        // Si la variación es de elementos dinámicos, generar diferentes
        if (config.variationType === 'dynamic_elements') {
            // Usar semilla diferente para generar elementos distintos
            baseConfig.dynamicElementsSeed = Date.now() + Math.random() * 10000;
        }

        return baseConfig;
    }

    // ===== TRACKING Y MÉTRICAS =====

    /**
     * Actualiza las métricas de un A/B test desde YouTube Analytics
     */
    public async updateTestMetrics(
        testId: string,
        metricsA: { impressions: number; clicks: number },
        metricsB: { impressions: number; clicks: number }
    ): Promise<void> {
        const ctrA = metricsA.impressions > 0 ? metricsA.clicks / metricsA.impressions : 0;
        const ctrB = metricsB.impressions > 0 ? metricsB.clicks / metricsB.impressions : 0;

        await this.runSQL(
            `UPDATE ab_tests SET 
                impressions_a = ?, clicks_a = ?, ctr_variant_a = ?,
                impressions_b = ?, clicks_b = ?, ctr_variant_b = ?,
                updated_at = CURRENT_TIMESTAMP
             WHERE test_id = ?`,
            [metricsA.impressions, metricsA.clicks, ctrA, 
             metricsB.impressions, metricsB.clicks, ctrB, testId]
        );

        this.logger.info(`📊 Métricas actualizadas para test ${testId}`, {
            ctrA: (ctrA * 100).toFixed(2) + '%',
            ctrB: (ctrB * 100).toFixed(2) + '%'
        });
    }

    /**
     * Cambia la variante activa de un A/B test
     */
    public async switchActiveVariant(
        testId: string,
        newVariant: ThumbnailVariant,
        reason: string
    ): Promise<void> {
        const test = await this.getABTest(testId);
        if (!test) {
            throw new Error(`Test ${testId} no encontrado`);
        }

        const oldVariant = test.activeVariant;
        
        // Actualizar variante activa
        await this.runSQL(
            `UPDATE ab_tests SET 
                active_variant = ?, 
                updated_at = CURRENT_TIMESTAMP 
             WHERE test_id = ?`,
            [newVariant, testId]
        );

        // Registrar en historial
        await this.runSQL(
            `INSERT INTO ab_test_history (test_id, from_variant, to_variant, reason)
             VALUES (?, ?, ?, ?)`,
            [testId, oldVariant, newVariant, reason]
        );

        this.logger.info(`🔄 Cambio de variante: ${testId}`, {
            from: oldVariant,
            to: newVariant,
            reason
        });
    }

    /**
     * Analiza un A/B test y determina si hay un ganador
     */
    public async analyzeTest(testId: string): Promise<ABTestAnalysis> {
        const test = await this.getABTest(testId);
        if (!test) {
            throw new Error(`Test ${testId} no encontrado`);
        }

        const perfA: VariantPerformance = {
            variant: 'A',
            ctr: test.ctrVariantA || 0,
            impressions: test.impressionsA || 0,
            clicks: test.clicksA || 0,
            confidenceLevel: this.calculateConfidence(test.impressionsA || 0)
        };

        const perfB: VariantPerformance = {
            variant: 'B',
            ctr: test.ctrVariantB || 0,
            impressions: test.impressionsB || 0,
            clicks: test.clicksB || 0,
            confidenceLevel: this.calculateConfidence(test.impressionsB || 0)
        };

        // Calcular diferencia de CTR
        const ctrDifference = Math.abs(perfA.ctr - perfB.ctr);
        const totalImpressions = perfA.impressions + perfB.impressions;
        
        // Determinar si el test tiene suficientes datos
        const hasEnoughData = perfA.impressions >= MIN_IMPRESSIONS_FOR_DECISION && 
                             perfB.impressions >= MIN_IMPRESSIONS_FOR_DECISION;
        
        // Determinar si la diferencia es significativa
        const isSignificant = ctrDifference >= MIN_CTR_DIFFERENCE && hasEnoughData;

        let winner: ThumbnailVariant | undefined;
        let uplift = 0;
        let recommendedAction: ABTestAnalysis['recommendedAction'];
        let message: string;

        if (!hasEnoughData) {
            recommendedAction = 'continue_test';
            message = `Necesitas más datos. Impresiones actuales: A=${perfA.impressions}, B=${perfB.impressions}. Mínimo requerido: ${MIN_IMPRESSIONS_FOR_DECISION} por variante.`;
        } else if (isSignificant) {
            winner = perfA.ctr > perfB.ctr ? 'A' : 'B';
            const winnerCtr = winner === 'A' ? perfA.ctr : perfB.ctr;
            const loserCtr = winner === 'A' ? perfB.ctr : perfA.ctr;
            uplift = loserCtr > 0 ? ((winnerCtr - loserCtr) / loserCtr) * 100 : 0;
            
            recommendedAction = 'select_winner';
            message = `Variante ${winner} es ganadora con CTR ${(winnerCtr * 100).toFixed(2)}% vs ${(loserCtr * 100).toFixed(2)}% (mejora de ${uplift.toFixed(1)}%)`;
        } else {
            recommendedAction = 'inconclusive';
            message = `La diferencia de CTR (${(ctrDifference * 100).toFixed(2)}%) no es estadísticamente significativa. Considera continuar el test o usar la variante preferida.`;
        }

        return {
            testId,
            variantA: perfA,
            variantB: perfB,
            winner,
            uplift,
            isStatisticallySignificant: isSignificant,
            recommendedAction,
            message
        };
    }

    /**
     * Marca un test como completado con un ganador
     */
    public async completeTest(testId: string, winner: ThumbnailVariant): Promise<void> {
        await this.runSQL(
            `UPDATE ab_tests SET 
                winner = ?, 
                status = 'completed',
                completed_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
             WHERE test_id = ?`,
            [winner, testId]
        );

        this.logger.info(`🏆 Test completado: ${testId}, ganador: Variante ${winner}`);
    }

    // ===== CONSULTAS =====

    /**
     * Obtiene un A/B test por su ID
     */
    public async getABTest(testId: string): Promise<ABTestRecord | null> {
        return new Promise((resolve, reject) => {
            this.db?.get(
                `SELECT * FROM ab_tests WHERE test_id = ?`,
                [testId],
                (err, row: any) => {
                    if (err) reject(err);
                    else if (!row) resolve(null);
                    else resolve(this.rowToRecord(row));
                }
            );
        });
    }

    /**
     * Obtiene un A/B test por el ID del video
     */
    public async getABTestByVideoId(videoId: string): Promise<ABTestRecord | null> {
        return new Promise((resolve, reject) => {
            this.db?.get(
                `SELECT * FROM ab_tests WHERE video_id = ?`,
                [videoId],
                (err, row: any) => {
                    if (err) reject(err);
                    else if (!row) resolve(null);
                    else resolve(this.rowToRecord(row));
                }
            );
        });
    }

    /**
     * Obtiene todos los tests activos
     */
    public async getActiveTests(): Promise<ABTestRecord[]> {
        return new Promise((resolve, reject) => {
            this.db?.all(
                `SELECT * FROM ab_tests WHERE status = 'active' ORDER BY created_at DESC`,
                (err, rows: any[]) => {
                    if (err) reject(err);
                    else resolve(rows.map(row => this.rowToRecord(row)));
                }
            );
        });
    }

    /**
     * Obtiene tests por canal
     */
    public async getTestsByChannel(channelId: string): Promise<ABTestRecord[]> {
        return new Promise((resolve, reject) => {
            this.db?.all(
                `SELECT * FROM ab_tests WHERE channel_id = ? ORDER BY created_at DESC`,
                [channelId],
                (err, rows: any[]) => {
                    if (err) reject(err);
                    else resolve(rows.map(row => this.rowToRecord(row)));
                }
            );
        });
    }

    /**
     * Obtiene la ruta del thumbnail activo para un test
     */
    public async getActiveThumbnailPath(testId: string): Promise<string | null> {
        const test = await this.getABTest(testId);
        if (!test) return null;
        
        return test.activeVariant === 'A' ? test.pathVariantA : test.pathVariantB;
    }

    /**
     * Vincula un test a un video de YouTube
     */
    public async linkTestToVideo(testId: string, videoId: string): Promise<void> {
        await this.runSQL(
            `UPDATE ab_tests SET video_id = ?, updated_at = CURRENT_TIMESTAMP WHERE test_id = ?`,
            [videoId, testId]
        );
        
        this.logger.info(`🔗 Test ${testId} vinculado a video ${videoId}`);
    }

    // ===== REPORTES =====

    /**
     * Genera un reporte de todos los A/B tests activos
     */
    public async generateReport(): Promise<string> {
        const activeTests = await this.getActiveTests();
        const completedTests = await this.getCompletedTests(30); // Últimos 30 días
        
        const lines: string[] = [
            '🧪 *REPORTE DE A/B TESTING DE THUMBNAILS*',
            '',
            '═══════════════════════════════',
            '',
            `📊 *TESTS ACTIVOS: ${activeTests.length}*`,
            ''
        ];

        for (const test of activeTests) {
            const analysis = await this.analyzeTest(test.testId);
            lines.push(`• *${test.title.substring(0, 30)}...*`);
            lines.push(`  Variante activa: ${test.activeVariant}`);
            lines.push(`  CTR A: ${((test.ctrVariantA || 0) * 100).toFixed(2)}% (${test.impressionsA || 0} imp)`);
            lines.push(`  CTR B: ${((test.ctrVariantB || 0) * 100).toFixed(2)}% (${test.impressionsB || 0} imp)`);
            lines.push(`  Estado: ${analysis.recommendedAction}`);
            lines.push('');
        }

        lines.push('═══════════════════════════════');
        lines.push('');
        lines.push(`🏆 *TESTS COMPLETADOS (30 días): ${completedTests.length}*`);
        lines.push('');

        const winnersA = completedTests.filter(t => t.winner === 'A').length;
        const winnersB = completedTests.filter(t => t.winner === 'B').length;
        
        lines.push(`  Ganadores variante A: ${winnersA}`);
        lines.push(`  Ganadores variante B: ${winnersB}`);
        lines.push('');
        lines.push('═══════════════════════════════');
        lines.push('');
        lines.push('🤖 _OmniAI-Engine - A/B Testing_');

        return lines.join('\n');
    }

    /**
     * Obtiene tests completados en los últimos N días
     */
    private async getCompletedTests(days: number): Promise<ABTestRecord[]> {
        return new Promise((resolve, reject) => {
            const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
            this.db?.all(
                `SELECT * FROM ab_tests 
                 WHERE status = 'completed' AND completed_at >= ?
                 ORDER BY completed_at DESC`,
                [cutoff],
                (err, rows: any[]) => {
                    if (err) reject(err);
                    else resolve(rows.map(row => this.rowToRecord(row)));
                }
            );
        });
    }

    // ===== HELPERS PRIVADOS =====

    /**
     * Guarda un nuevo A/B test en la base de datos
     */
    private async saveABTest(record: Omit<ABTestRecord, 'id'>): Promise<void> {
        await this.runSQL(
            `INSERT INTO ab_tests (
                test_id, video_id, channel_id, title, active_variant, variation_type,
                path_variant_a, path_variant_b, template_id_a, template_id_b,
                hash_a, hash_b, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                record.testId, record.videoId || null, record.channelId, record.title,
                record.activeVariant, record.variationType, record.pathVariantA,
                record.pathVariantB, record.templateIdA, record.templateIdB,
                record.hashA || null, record.hashB || null, record.status,
                record.createdAt.toISOString(), record.updatedAt.toISOString()
            ]
        );
    }

    /**
     * Ejecuta una consulta SQL
     */
    private runSQL(sql: string, params: any[]): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db?.run(sql, params, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    /**
     * Convierte una fila de SQLite a ABTestRecord
     */
    private rowToRecord(row: any): ABTestRecord {
        return {
            id: row.id,
            testId: row.test_id,
            videoId: row.video_id || undefined,
            channelId: row.channel_id,
            title: row.title,
            activeVariant: row.active_variant as ThumbnailVariant,
            variationType: row.variation_type as VariationType,
            pathVariantA: row.path_variant_a,
            pathVariantB: row.path_variant_b,
            templateIdA: row.template_id_a,
            templateIdB: row.template_id_b,
            hashA: row.hash_a || undefined,
            hashB: row.hash_b || undefined,
            ctrVariantA: row.ctr_variant_a || undefined,
            ctrVariantB: row.ctr_variant_b || undefined,
            impressionsA: row.impressions_a || undefined,
            impressionsB: row.impressions_b || undefined,
            clicksA: row.clicks_a || undefined,
            clicksB: row.clicks_b || undefined,
            winner: row.winner as ThumbnailVariant | undefined,
            status: row.status as 'active' | 'completed' | 'inconclusive',
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at),
            completedAt: row.completed_at ? new Date(row.completed_at) : undefined
        };
    }

    /**
     * Genera un ID único para el test
     */
    private generateTestId(): string {
        return `abt_${crypto.randomBytes(8).toString('hex')}`;
    }

    /**
     * Sanitiza un nombre de archivo
     */
    private sanitizeFilename(title: string): string {
        return title
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, '_')
            .substring(0, 50);
    }

    /**
     * Obtiene el nombre del canal
     */
    private getChannelName(channelId: string): string {
        const channelNames: Record<string, string> = {
            'channel1': 'NeuroSync AI',
            'channel2': 'NeuroTech AI'
        };
        return channelNames[channelId] || 'OmniAI';
    }

    /**
     * Calcula nivel de confianza basado en impresiones
     */
    private calculateConfidence(impressions: number): number {
        // Fórmula simplificada: mayor confianza con más impresiones
        if (impressions < 50) return 0.5;
        if (impressions < 100) return 0.7;
        if (impressions < 500) return 0.85;
        if (impressions < 1000) return 0.92;
        return CONFIDENCE_THRESHOLD;
    }

    /**
     * Cierra la conexión a la base de datos
     */
    public close(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.db) {
                this.db.close((err) => {
                    if (err) reject(err);
                    else {
                        this.db = null;
                        this.initialized = false;
                        resolve();
                    }
                });
            } else {
                resolve();
            }
        });
    }
}

// ===== INSTANCIA SINGLETON =====

/**
 * Instancia singleton del ThumbnailABTestingService
 */
export const thumbnailABTestingService = new ThumbnailABTestingService();

// ===== EXPORT POR DEFECTO =====

export default ThumbnailABTestingService;
