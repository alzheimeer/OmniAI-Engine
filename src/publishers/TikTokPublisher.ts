/**
 * TikTokPublisher.ts
 * 
 * Publicador para TikTok usando Puppeteer stealth automation.
 * Parte de la Fase 5: Expansión Multiplataforma (bloqueada por YPPValidationGate.passed === true)
 * 
 * REQ-3.3.2: Crear TikTokPublisher.ts usando TikTok API o Puppeteer stealth
 * 
 * Funcionalidades:
 * - Autenticación mediante sesión de cookies
 * - Subida de videos con especificaciones TikTok (15s óptimo, máx 60s)
 * - Configuración de caption, hashtags y sonidos
 * - Programación de publicación con delay
 * - Lógica de reintentos para uploads fallidos
 * - Logging y seguimiento de estado
 * 
 * IMPORTANTE: Esta funcionalidad está BLOQUEADA por YPPValidationGate.
 * Solo se activa cuando la monetización de YouTube está aprobada (Regla de Oro #2).
 * 
 * NOTA: TikTok API oficial requiere aprobación.
 * Esta implementación usa Puppeteer stealth para mayor accesibilidad.
 * Cumplir siempre con los Terms of Service de TikTok.
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Logger } from '../infrastructure/Logger';
import { RetryHandler, RetryError } from '../infrastructure/RetryHandler';

// Configurar Puppeteer con plugin stealth para evitar detección
puppeteerExtra.use(StealthPlugin());

// ===== INTERFACES =====

/**
 * Credenciales para autenticación en TikTok.
 * Preferir sesión de cookies sobre login manual por seguridad.
 */
export interface TikTokCredentials {
    /** Username de TikTok (opcional si se usan cookies) */
    username?: string;
    
    /** Password de TikTok (opcional si se usan cookies) */
    password?: string;
    
    /** Ruta al archivo de cookies JSON para sesión persistente */
    cookiesPath?: string;
    
    /** User data directory para reutilizar sesión del navegador */
    userDataDir?: string;
}

/**
 * Metadatos para la publicación del video en TikTok.
 */
export interface TikTokVideoMetadata {
    /** Caption/descripción del video (máx 2200 caracteres) */
    caption: string;
    
    /** Hashtags a incluir (se añaden al caption) */
    hashtags: string[];
    
    /** Ruta al archivo de cover/thumbnail (opcional) */
    coverImagePath?: string;
    
    /** ID del sonido/música a usar (opcional) */
    soundId?: string;
    
    /** Nombre del sonido original (opcional) */
    soundName?: string;
    
    /** Si permitir duetos (default: true) */
    allowDuet?: boolean;
    
    /** Si permitir stitch (default: true) */
    allowStitch?: boolean;
    
    /** Si deshabilitar comentarios (default: false) */
    disableComments?: boolean;
    
    /** Audiencia: everyone, friends, private */
    visibility?: 'everyone' | 'friends' | 'private';
}

/**
 * Opciones para la publicación del video.
 */
export interface TikTokPublishOptions {
    /** Delay en segundos antes de publicar (para scheduling) */
    delaySeconds?: number;
    
    /** Número máximo de reintentos en caso de fallo */
    maxRetries?: number;
    
    /** Si mantener el navegador abierto después de publicar (debug) */
    keepBrowserOpen?: boolean;
    
    /** Timeout en milisegundos para operaciones (default: 120000) */
    timeoutMs?: number;
    
    /** Si hacer screenshot en cada paso (debug) */
    debugScreenshots?: boolean;
    
    /** Directorio para screenshots de debug */
    screenshotsDir?: string;
}

/**
 * Resultado de la publicación del video.
 */
export interface TikTokPublishResult {
    /** Si la publicación fue exitosa */
    success: boolean;
    
    /** URL del video publicado (si disponible) */
    videoUrl?: string;
    
    /** ID del video (si disponible) */
    videoId?: string;
    
    /** Mensaje de error si falló */
    error?: string;
    
    /** Número de intentos realizados */
    attempts: number;
    
    /** Timestamp de publicación */
    publishedAt?: string;
    
    /** Metadatos adicionales del proceso */
    metadata: {
        /** Duración total del proceso en ms */
        durationMs: number;
        /** Si se usó sesión de cookies */
        usedCookieSession: boolean;
        /** Si hubo reintentos */
        hadRetries: boolean;
    };
}

/**
 * Estado del proceso de publicación para tracking.
 */
export type TikTokPublishStatus = 
    | 'pending'         // Esperando iniciar
    | 'authenticating'  // Autenticándose
    | 'uploading'       // Subiendo video
    | 'configuring'     // Configurando metadata
    | 'publishing'      // Publicando
    | 'completed'       // Completado exitosamente
    | 'failed'          // Falló
    | 'retrying';       // Reintentando

/**
 * Callback para notificar cambios de estado durante la publicación.
 */
export type TikTokStatusCallback = (status: TikTokPublishStatus, message: string) => void;

// ===== CONSTANTES =====

/**
 * Especificaciones de TikTok para videos.
 */
export const TIKTOK_SPECS = {
    /** Duración óptima de video en segundos */
    optimalDuration: 15,
    
    /** Duración máxima de video en segundos */
    maxDuration: 60,
    
    /** Resolución recomendada (vertical 9:16) */
    resolution: { width: 1080, height: 1920 },
    
    /** Longitud máxima del caption */
    maxCaptionLength: 2200,
    
    /** Número máximo de hashtags recomendados */
    maxHashtags: 30,
    
    /** Formatos de video soportados */
    supportedFormats: ['mp4', 'mov', 'webm'],
    
    /** Tamaño máximo de archivo en bytes (287MB) */
    maxFileSize: 287 * 1024 * 1024,
    
    /** URLs de TikTok */
    urls: {
        base: 'https://www.tiktok.com',
        login: 'https://www.tiktok.com/login',
        upload: 'https://www.tiktok.com/upload',
        studio: 'https://www.tiktok.com/creator#/upload'
    }
} as const;

/**
 * Selectores CSS para elementos de TikTok (pueden cambiar con actualizaciones).
 * Mantener actualizados según cambios en la UI de TikTok.
 */
const SELECTORS = {
    // Login
    loginWithEmail: 'div[data-e2e="channel-item"]',
    usernameInput: 'input[name="username"]',
    passwordInput: 'input[type="password"]',
    loginButton: 'button[data-e2e="login-button"]',
    loginError: 'div[data-e2e="login-error"]',
    
    // Upload
    uploadInput: 'input[type="file"]',
    captionEditor: 'div[data-text="true"]',
    captionTextarea: 'div[contenteditable="true"]',
    postButton: 'button[data-e2e="post-button"]',
    
    // Configuración
    allowComments: 'div[data-e2e="allow-comment"]',
    allowDuet: 'div[data-e2e="allow-duet"]',
    allowStitch: 'div[data-e2e="allow-stitch"]',
    visibilityDropdown: 'div[data-e2e="visibility-dropdown"]',
    
    // Confirmación
    uploadSuccess: 'div[data-e2e="upload-success"]',
    viewVideoButton: 'a[data-e2e="view-video"]',
    
    // Navegación
    notNowButton: 'button:has-text("Not now")',
    closeButton: 'div[data-e2e="modal-close"]'
} as const;

/**
 * Configuración por defecto de timeouts.
 */
const DEFAULT_TIMEOUTS = {
    navigation: 60000,
    upload: 300000,  // TikTok puede tardar más en procesar
    element: 30000,
    action: 10000
} as const;

// ===== CLASE PRINCIPAL =====

/**
 * TikTokPublisher - Publicador de videos para TikTok.
 * 
 * Implementa la publicación automatizada de videos usando
 * Puppeteer stealth para evitar detección de bots.
 * 
 * IMPORTANTE:
 * - Esta funcionalidad está bloqueada por YPPValidationGate (Regla de Oro #2)
 * - Solo se activa cuando YouTube está monetizado
 * - Cumplir siempre con los Terms of Service de TikTok
 * - Usar con moderación para evitar restricciones de cuenta
 * 
 * Uso básico:
 * ```typescript
 * const publisher = new TikTokPublisher({
 *     cookiesPath: './tiktok-cookies.json'
 * });
 * 
 * const result = await publisher.publishVideo(
 *     './video.mp4',
 *     {
 *         caption: 'Mi nuevo video',
 *         hashtags: ['fyp', 'viral']
 *     }
 * );
 * ```
 */
export class TikTokPublisher {
    /** Credenciales de autenticación */
    private readonly credentials: TikTokCredentials;
    
    /** Logger para trazabilidad */
    private readonly logger: Logger;
    
    /** Handler de reintentos */
    private readonly retryHandler: RetryHandler;
    
    /** Browser de Puppeteer (reutilizable) */
    private browser: Browser | null = null;
    
    /** Callback para notificar cambios de estado */
    private statusCallback?: TikTokStatusCallback;

    /**
     * Crea una nueva instancia de TikTokPublisher.
     * 
     * @param credentials - Credenciales para autenticación
     */
    constructor(credentials: TikTokCredentials) {
        this.credentials = credentials;
        this.logger = new Logger('TikTokPublisher');
        this.retryHandler = new RetryHandler(
            {
                maxRetries: 3,
                baseDelayMs: 5000,
                backoffFactor: 2,
                maxDelayMs: 60000,
                nonRetryableErrors: [401, 403]
            },
            'TikTokPublisher'
        );
    }

    // ===== MÉTODOS PÚBLICOS =====

    /**
     * Publica un video en TikTok.
     * 
     * Pipeline de publicación:
     * 1. Validar video y metadata
     * 2. Iniciar navegador con stealth
     * 3. Autenticar (cookies o login)
     * 4. Navegar a página de upload
     * 5. Subir video
     * 6. Configurar caption, hashtags y opciones
     * 7. Publicar
     * 8. Verificar éxito
     * 
     * @param videoPath - Ruta absoluta al video a publicar
     * @param metadata - Metadatos del video (caption, hashtags, etc.)
     * @param options - Opciones de publicación
     * @returns Resultado de la publicación
     */
    public async publishVideo(
        videoPath: string,
        metadata: TikTokVideoMetadata,
        options: TikTokPublishOptions = {}
    ): Promise<TikTokPublishResult> {
        const startTime = Date.now();
        const correlationId = Logger.generateCorrelationId();
        this.logger.setCorrelationId(correlationId);
        
        this.logger.info('Iniciando publicación de video en TikTok', {
            videoPath,
            captionLength: metadata.caption.length,
            hashtagCount: metadata.hashtags.length
        });

        // Validar entrada
        this.validateInput(videoPath, metadata);

        // Aplicar delay si está configurado
        if (options.delaySeconds && options.delaySeconds > 0) {
            this.updateStatus('pending', `Esperando ${options.delaySeconds}s antes de publicar...`);
            await this.sleep(options.delaySeconds * 1000);
        }

        let browser: Browser | null = null;
        let page: Page | null = null;
        let attempts = 0;
        const maxRetries = options.maxRetries ?? 3;

        try {
            // Ejecutar con reintentos
            const result = await this.retryHandler.executeWithResult(
                async () => {
                    attempts++;
                    this.updateStatus(attempts > 1 ? 'retrying' : 'authenticating', 
                        `Intento ${attempts}/${maxRetries + 1}`);

                    // Iniciar navegador
                    browser = await this.launchBrowser(options);
                    page = await browser.newPage();
                    await this.configurePage(page, options);

                    // Autenticar
                    const authSuccess = await this.authenticate(page, options);
                    if (!authSuccess) {
                        throw new Error('Falló la autenticación en TikTok');
                    }

                    // Subir y publicar
                    const publishResult = await this.uploadAndPublish(
                        page, 
                        videoPath, 
                        metadata, 
                        options
                    );

                    return publishResult;
                },
                'TikTok Video Upload'
            );

            const durationMs = Date.now() - startTime;
            this.updateStatus('completed', 'Video publicado exitosamente');

            this.logger.info('Video publicado exitosamente en TikTok', {
                videoUrl: result.result.videoUrl,
                duration: durationMs,
                attempts
            });

            return {
                success: true,
                videoUrl: result.result.videoUrl,
                videoId: result.result.videoId,
                attempts,
                publishedAt: new Date().toISOString(),
                metadata: {
                    durationMs,
                    usedCookieSession: !!this.credentials.cookiesPath,
                    hadRetries: result.hadRetries
                }
            };

        } catch (error) {
            const durationMs = Date.now() - startTime;
            const err = error instanceof Error ? error : new Error(String(error));
            
            this.updateStatus('failed', err.message);
            this.logger.error('Error publicando video en TikTok', err, {
                duration: durationMs,
                attempts
            });

            // Guardar screenshot de error si está habilitado
            if (options.debugScreenshots && page) {
                await this.takeScreenshot(page, 'error', options.screenshotsDir);
            }

            return {
                success: false,
                error: err.message,
                attempts,
                metadata: {
                    durationMs,
                    usedCookieSession: !!this.credentials.cookiesPath,
                    hadRetries: attempts > 1
                }
            };

        } finally {
            // Cerrar navegador si no está configurado para mantenerse abierto
            if (browser !== null && !options.keepBrowserOpen) {
                await (browser as Browser).close().catch(() => {});
                this.browser = null;
            }
        }
    }

    /**
     * Establece un callback para recibir actualizaciones de estado.
     * 
     * @param callback - Función a llamar cuando cambia el estado
     */
    public onStatusChange(callback: TikTokStatusCallback): void {
        this.statusCallback = callback;
    }

    /**
     * Valida si las credenciales están correctamente configuradas.
     * 
     * @returns true si las credenciales son válidas
     */
    public async validateCredentials(): Promise<boolean> {
        if (this.credentials.cookiesPath) {
            if (!fs.existsSync(this.credentials.cookiesPath)) {
                this.logger.warn('Archivo de cookies no encontrado', {
                    path: this.credentials.cookiesPath
                });
                return false;
            }
            
            try {
                const cookies = JSON.parse(
                    fs.readFileSync(this.credentials.cookiesPath, 'utf-8')
                );
                return Array.isArray(cookies) && cookies.length > 0;
            } catch {
                return false;
            }
        }

        if (this.credentials.username && this.credentials.password) {
            return true;
        }

        this.logger.warn('No hay credenciales válidas configuradas');
        return false;
    }

    /**
     * Guarda las cookies de sesión actuales a un archivo.
     * Útil para reutilizar sesión en futuras publicaciones.
     * 
     * @param page - Página con sesión activa
     * @param outputPath - Ruta donde guardar las cookies
     */
    public async saveCookies(page: Page, outputPath: string): Promise<void> {
        const cookies = await page.cookies();
        fs.writeFileSync(outputPath, JSON.stringify(cookies, null, 2));
        this.logger.info('Cookies guardadas exitosamente', { path: outputPath });
    }

    /**
     * Cierra el navegador si está abierto.
     */
    public async close(): Promise<void> {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.logger.info('Navegador cerrado');
        }
    }

    // ===== MÉTODOS PRIVADOS =====

    /**
     * Valida los parámetros de entrada antes de publicar.
     */
    private validateInput(videoPath: string, metadata: TikTokVideoMetadata): void {
        // Validar que el archivo existe
        if (!fs.existsSync(videoPath)) {
            throw new Error(`Video no encontrado: ${videoPath}`);
        }

        // Validar formato
        const ext = path.extname(videoPath).toLowerCase().replace('.', '');
        if (!(TIKTOK_SPECS.supportedFormats as readonly string[]).includes(ext)) {
            throw new Error(
                `Formato no soportado: ${ext}. Soportados: ${TIKTOK_SPECS.supportedFormats.join(', ')}`
            );
        }

        // Validar tamaño
        const stats = fs.statSync(videoPath);
        if (stats.size > TIKTOK_SPECS.maxFileSize) {
            throw new Error(
                `Archivo demasiado grande: ${(stats.size / 1024 / 1024).toFixed(2)}MB. ` +
                `Máximo: ${TIKTOK_SPECS.maxFileSize / 1024 / 1024}MB`
            );
        }

        // Validar caption
        if (metadata.caption.length > TIKTOK_SPECS.maxCaptionLength) {
            throw new Error(
                `Caption demasiado largo: ${metadata.caption.length} chars. ` +
                `Máximo: ${TIKTOK_SPECS.maxCaptionLength}`
            );
        }

        // Validar hashtags
        if (metadata.hashtags.length > TIKTOK_SPECS.maxHashtags) {
            this.logger.warn('Demasiados hashtags, se truncarán', {
                count: metadata.hashtags.length,
                max: TIKTOK_SPECS.maxHashtags
            });
        }

        // Validar cover si se proporciona
        if (metadata.coverImagePath && !fs.existsSync(metadata.coverImagePath)) {
            this.logger.warn('Cover image no encontrada, se usará frame del video', {
                path: metadata.coverImagePath
            });
        }
    }

    /**
     * Inicia el navegador con configuración stealth.
     */
    private async launchBrowser(options: TikTokPublishOptions): Promise<Browser> {
        if (this.browser) {
            return this.browser;
        }

        const launchOptions: Parameters<typeof puppeteerExtra.launch>[0] = {
            headless: true,  // Usar modo headless para servidores
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--window-size=1920,1080',
                '--disable-blink-features=AutomationControlled',
                '--lang=es-ES,es'
            ],
            defaultViewport: {
                width: 1920,
                height: 1080
            }
        };

        // Usar user data dir para sesión persistente si está configurado
        if (this.credentials.userDataDir) {
            launchOptions.userDataDir = this.credentials.userDataDir;
        }

        this.browser = await puppeteerExtra.launch(launchOptions);
        this.logger.info('Navegador iniciado con stealth mode');

        return this.browser;
    }

    /**
     * Configura la página con headers y comportamiento humano.
     */
    private async configurePage(page: Page, options: TikTokPublishOptions): Promise<void> {
        // Configurar timeout
        const timeout = options.timeoutMs ?? DEFAULT_TIMEOUTS.navigation;
        page.setDefaultTimeout(timeout);
        page.setDefaultNavigationTimeout(timeout);

        // Configurar headers
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
        });

        // Viewport para TikTok desktop
        await page.setViewport({
            width: 1920,
            height: 1080,
            isMobile: false,
            hasTouch: false
        });

        this.logger.debug('Página configurada');
    }

    /**
     * Autentica en TikTok usando cookies o login.
     */
    private async authenticate(page: Page, options: TikTokPublishOptions): Promise<boolean> {
        this.updateStatus('authenticating', 'Autenticando en TikTok...');

        // Intentar con cookies primero
        if (this.credentials.cookiesPath && fs.existsSync(this.credentials.cookiesPath)) {
            try {
                const cookies = JSON.parse(
                    fs.readFileSync(this.credentials.cookiesPath, 'utf-8')
                );
                await page.setCookie(...cookies);
                this.logger.info('Cookies cargadas exitosamente');

                // Verificar si la sesión es válida
                await page.goto(TIKTOK_SPECS.urls.base, {
                    waitUntil: 'networkidle2'
                });

                // Comprobar si estamos logueados
                const isLoggedIn = await this.checkLoginStatus(page);
                if (isLoggedIn) {
                    this.logger.info('Sesión de cookies válida');
                    return true;
                }

                this.logger.warn('Sesión de cookies expirada, intentando login');
            } catch (error) {
                this.logger.warn('Error cargando cookies', { 
                    error: (error as Error).message 
                });
            }
        }

        // Login con credenciales
        if (this.credentials.username && this.credentials.password) {
            return await this.loginWithCredentials(page, options);
        }

        throw new Error(
            'No hay credenciales válidas. Proporcione cookiesPath o username/password'
        );
    }

    /**
     * Verifica si el usuario está logueado.
     */
    private async checkLoginStatus(page: Page): Promise<boolean> {
        try {
            // Buscar elemento que solo aparece cuando está logueado (avatar del usuario)
            const profileIcon = await page.$('div[data-e2e="profile-icon"]');
            if (profileIcon) {
                return true;
            }

            // Alternativa: buscar botón de upload que solo aparece logueado
            const uploadButton = await page.$('a[href*="/upload"]');
            return uploadButton !== null;
        } catch {
            return false;
        }
    }

    /**
     * Realiza login con username/password.
     * NOTA: TikTok tiene múltiples métodos de login, esto es un intento básico.
     */
    private async loginWithCredentials(
        page: Page, 
        options: TikTokPublishOptions
    ): Promise<boolean> {
        this.logger.info('Iniciando login con credenciales');

        await page.goto(TIKTOK_SPECS.urls.login, {
            waitUntil: 'networkidle2'
        });

        // TikTok tiene varios métodos de login, buscar "Log in with email/username"
        try {
            // Esperar que cargue la página de login
            await this.sleep(2000);

            // Buscar opción de login con email/username
            const loginOptions = await page.$$('div[data-e2e="channel-item"]');
            for (const option of loginOptions) {
                const text = await option.evaluate(el => el.textContent || '');
                if (text.toLowerCase().includes('email') || text.toLowerCase().includes('username')) {
                    await option.click();
                    await this.sleep(1000);
                    break;
                }
            }

            // Alternativamente, buscar link directo
            const emailLoginLink = await page.$('a[href*="email"]');
            if (emailLoginLink) {
                await emailLoginLink.click();
                await this.sleep(1000);
            }

        } catch (error) {
            this.logger.warn('Error buscando opción de login con email', { 
                error: (error as Error).message 
            });
        }

        // Esperar a que cargue el formulario
        try {
            await page.waitForSelector('input[name="username"], input[type="text"]', {
                timeout: DEFAULT_TIMEOUTS.element
            });
        } catch {
            this.logger.error('No se encontró formulario de login');
            return false;
        }

        // Simular escritura humana
        const usernameInput = await page.$('input[name="username"]') || 
                             await page.$('input[type="text"]');
        const passwordInput = await page.$('input[type="password"]');

        if (!usernameInput || !passwordInput) {
            this.logger.error('No se encontraron campos de login');
            return false;
        }

        await this.typeWithDelay(usernameInput, this.credentials.username!);
        await this.sleep(500 + Math.random() * 500);
        await this.typeWithDelay(passwordInput, this.credentials.password!);
        
        if (options.debugScreenshots) {
            await this.takeScreenshot(page, 'before-login', options.screenshotsDir);
        }

        // Click en login
        await this.sleep(300 + Math.random() * 300);
        const loginButton = await page.$('button[type="submit"]') ||
                           await page.$('button[data-e2e="login-button"]');
        
        if (loginButton) {
            await loginButton.click();
        }

        // Esperar navegación o error
        try {
            await page.waitForNavigation({
                waitUntil: 'networkidle2',
                timeout: DEFAULT_TIMEOUTS.navigation
            });

            // Cerrar diálogos molestos
            await this.dismissDialogs(page);

            const isLoggedIn = await this.checkLoginStatus(page);
            if (isLoggedIn) {
                this.logger.info('Login exitoso');
                
                // Guardar cookies para futuras sesiones
                if (this.credentials.cookiesPath) {
                    await this.saveCookies(page, this.credentials.cookiesPath);
                }
                
                return true;
            }

        } catch (error) {
            // Verificar si hay error de login
            const errorElement = await page.$('div[data-e2e="login-error"]');
            if (errorElement) {
                const errorText = await errorElement.evaluate(el => el.textContent);
                throw new Error(`Error de login: ${errorText}`);
            }
        }

        return false;
    }

    /**
     * Cierra diálogos modales comunes después del login.
     */
    private async dismissDialogs(page: Page): Promise<void> {
        const dialogSelectors = [
            'button:has-text("Not now")',
            'button:has-text("Not Now")',
            'button:has-text("Skip")',
            'button:has-text("Maybe later")',
            'div[data-e2e="modal-close"]'
        ];

        for (const selector of dialogSelectors) {
            try {
                const button = await page.$(selector);
                if (button) {
                    await button.click();
                    await this.sleep(500);
                }
            } catch {
                // Ignorar errores de diálogos no encontrados
            }
        }
    }

    /**
     * Sube el video y publica en TikTok.
     */
    private async uploadAndPublish(
        page: Page,
        videoPath: string,
        metadata: TikTokVideoMetadata,
        options: TikTokPublishOptions
    ): Promise<{ videoUrl?: string; videoId?: string }> {
        this.updateStatus('uploading', 'Subiendo video...');

        // Navegar a página de upload (Creator Center)
        await page.goto(TIKTOK_SPECS.urls.studio, {
            waitUntil: 'networkidle2'
        });

        // Alternativa si studio no funciona
        if (!page.url().includes('upload')) {
            await page.goto(TIKTOK_SPECS.urls.upload, {
                waitUntil: 'networkidle2'
            });
        }

        if (options.debugScreenshots) {
            await this.takeScreenshot(page, 'upload-page', options.screenshotsDir);
        }

        // Esperar input de archivo
        const fileInput = await page.waitForSelector('input[type="file"]', {
            timeout: DEFAULT_TIMEOUTS.element
        });

        if (!fileInput) {
            throw new Error('No se encontró el input de archivo');
        }

        // Subir el archivo
        await fileInput.uploadFile(videoPath);
        this.logger.info('Archivo de video cargado');

        // Esperar procesamiento del video (TikTok puede tardar)
        await this.waitForUploadProcessing(page);
        this.logger.info('Video procesado por TikTok');

        // Configurar metadata
        this.updateStatus('configuring', 'Configurando caption y hashtags...');
        await this.configureMetadata(page, metadata, options);

        // Configurar opciones adicionales
        await this.configureOptions(page, metadata);

        if (options.debugScreenshots) {
            await this.takeScreenshot(page, 'before-publish', options.screenshotsDir);
        }

        // Publicar
        this.updateStatus('publishing', 'Publicando video...');
        await this.clickPost(page);

        // Esperar confirmación
        await this.waitForPublishConfirmation(page);

        // Extraer URL del video
        const videoUrl = await this.extractVideoUrl(page);

        return {
            videoUrl,
            videoId: videoUrl ? this.extractVideoIdFromUrl(videoUrl) : undefined
        };
    }

    /**
     * Espera a que TikTok procese el video subido.
     */
    private async waitForUploadProcessing(page: Page): Promise<void> {
        const timeout = DEFAULT_TIMEOUTS.upload;
        const startTime = Date.now();

        // Buscar indicadores de procesamiento/completado
        while (Date.now() - startTime < timeout) {
            // Verificar si hay preview del video (indica procesamiento completo)
            const videoPreview = await page.$('video');
            const uploadComplete = await page.$('div[data-e2e="upload-success"]');
            const captionField = await page.$('div[contenteditable="true"]');

            if (videoPreview || uploadComplete || captionField) {
                return;
            }

            // Verificar errores
            const errorMessage = await page.$('div[data-e2e="upload-error"]');
            if (errorMessage) {
                const text = await errorMessage.evaluate(el => el.textContent);
                throw new Error(`Error de upload: ${text}`);
            }

            await this.sleep(2000);
        }

        throw new Error('Timeout esperando procesamiento del video');
    }

    /**
     * Configura el caption y hashtags del video.
     */
    private async configureMetadata(
        page: Page,
        metadata: TikTokVideoMetadata,
        options: TikTokPublishOptions
    ): Promise<void> {
        // Construir caption completo con hashtags
        const hashtags = metadata.hashtags
            .slice(0, TIKTOK_SPECS.maxHashtags)
            .map(h => h.startsWith('#') ? h : `#${h}`)
            .join(' ');
        
        const fullCaption = metadata.caption + 
            (hashtags ? ' ' + hashtags : '');

        // Buscar campo de caption
        const captionSelectors = [
            'div[contenteditable="true"]',
            'div[data-text="true"]',
            'div[data-e2e="caption-container"] div[contenteditable="true"]'
        ];

        for (const selector of captionSelectors) {
            try {
                const captionField = await page.$(selector);
                if (captionField) {
                    // Limpiar contenido existente
                    await captionField.click();
                    await page.keyboard.down('Control');
                    await page.keyboard.press('A');
                    await page.keyboard.up('Control');
                    await this.sleep(100);
                    
                    // Escribir nuevo caption
                    await page.keyboard.type(fullCaption, { delay: 10 });
                    this.logger.info('Caption configurado', { 
                        length: fullCaption.length 
                    });
                    return;
                }
            } catch {
                continue;
            }
        }

        this.logger.warn('No se encontró campo de caption');
    }

    /**
     * Configura opciones adicionales del video.
     */
    private async configureOptions(
        page: Page,
        metadata: TikTokVideoMetadata
    ): Promise<void> {
        try {
            // Configurar visibilidad si se especifica
            if (metadata.visibility && metadata.visibility !== 'everyone') {
                const visibilityDropdown = await page.$('div[data-e2e="visibility-dropdown"]');
                if (visibilityDropdown) {
                    await visibilityDropdown.click();
                    await this.sleep(500);
                    
                    const option = await page.$(`div[data-e2e="${metadata.visibility}"]`);
                    if (option) {
                        await option.click();
                    }
                }
            }

            // Deshabilitar comentarios si se especifica
            if (metadata.disableComments) {
                const commentToggle = await page.$('div[data-e2e="allow-comment"]');
                if (commentToggle) {
                    const isEnabled = await commentToggle.evaluate(el => 
                        el.getAttribute('aria-checked') === 'true'
                    );
                    if (isEnabled) {
                        await commentToggle.click();
                    }
                }
            }

            // Deshabilitar duetos si se especifica
            if (metadata.allowDuet === false) {
                const duetToggle = await page.$('div[data-e2e="allow-duet"]');
                if (duetToggle) {
                    const isEnabled = await duetToggle.evaluate(el => 
                        el.getAttribute('aria-checked') === 'true'
                    );
                    if (isEnabled) {
                        await duetToggle.click();
                    }
                }
            }

            // Deshabilitar stitch si se especifica
            if (metadata.allowStitch === false) {
                const stitchToggle = await page.$('div[data-e2e="allow-stitch"]');
                if (stitchToggle) {
                    const isEnabled = await stitchToggle.evaluate(el => 
                        el.getAttribute('aria-checked') === 'true'
                    );
                    if (isEnabled) {
                        await stitchToggle.click();
                    }
                }
            }

        } catch (error) {
            this.logger.warn('Error configurando opciones adicionales', {
                error: (error as Error).message
            });
        }
    }

    /**
     * Hace click en el botón Post/Publicar.
     */
    private async clickPost(page: Page): Promise<void> {
        const postSelectors = [
            'button[data-e2e="post-button"]',
            'button:has-text("Post")',
            'button:has-text("Publicar")',
            'div[data-e2e="post-button"]'
        ];

        for (const selector of postSelectors) {
            try {
                const button = await page.$(selector);
                if (button) {
                    // Verificar que el botón está habilitado
                    const isDisabled = await button.evaluate(el => 
                        el.hasAttribute('disabled') || 
                        el.classList.contains('disabled')
                    );
                    
                    if (!isDisabled) {
                        await button.click();
                        return;
                    }
                }
            } catch {
                continue;
            }
        }

        throw new Error('No se encontró botón de publicar o está deshabilitado');
    }

    /**
     * Espera confirmación de que el video fue publicado.
     */
    private async waitForPublishConfirmation(page: Page): Promise<void> {
        const confirmationSelectors = [
            'div[data-e2e="upload-success"]',
            'span:has-text("Your video is being uploaded")',
            'span:has-text("Tu video se está subiendo")',
            'a[data-e2e="view-video"]'
        ];

        const timeout = DEFAULT_TIMEOUTS.upload;
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            for (const selector of confirmationSelectors) {
                try {
                    const element = await page.$(selector);
                    if (element) {
                        this.logger.info('Confirmación de publicación recibida');
                        return;
                    }
                } catch {
                    continue;
                }
            }

            // Verificar si hay error
            const errorElement = await page.$('div[data-e2e="upload-error"]');
            if (errorElement) {
                const text = await errorElement.evaluate(el => el.textContent);
                throw new Error(`Error de TikTok: ${text}`);
            }

            await this.sleep(2000);
        }

        // Asumir éxito si no hay error después del timeout
        this.logger.warn('Timeout esperando confirmación, asumiendo éxito');
    }

    /**
     * Extrae la URL del video publicado de la página.
     */
    private async extractVideoUrl(page: Page): Promise<string | undefined> {
        try {
            // Buscar botón "View video" con link
            const viewButton = await page.$('a[data-e2e="view-video"]');
            if (viewButton) {
                const href = await viewButton.evaluate(el => el.getAttribute('href'));
                return href ? `https://www.tiktok.com${href}` : undefined;
            }

            // Buscar cualquier link al video
            const videoLink = await page.$('a[href*="/video/"]');
            if (videoLink) {
                const href = await videoLink.evaluate(el => el.getAttribute('href'));
                return href || undefined;
            }

            return undefined;
        } catch {
            return undefined;
        }
    }

    /**
     * Extrae el ID del video de su URL.
     */
    private extractVideoIdFromUrl(url: string): string | undefined {
        const match = url.match(/\/video\/(\d+)/);
        return match ? match[1] : undefined;
    }

    /**
     * Escribe texto con delay en un elemento para simular comportamiento humano.
     */
    private async typeWithDelay(
        element: Awaited<ReturnType<Page['$']>>,
        text: string
    ): Promise<void> {
        if (!element) return;
        await element.click();
        await this.sleep(100);
        
        // Escribir con delay aleatorio entre caracteres
        for (const char of text) {
            await element.type(char, { delay: 50 + Math.random() * 100 });
        }
    }

    /**
     * Toma un screenshot para debugging.
     */
    private async takeScreenshot(
        page: Page, 
        name: string, 
        dir?: string
    ): Promise<void> {
        try {
            const screenshotsDir = dir || path.join(process.cwd(), 'content', 'debug');
            if (!fs.existsSync(screenshotsDir)) {
                fs.mkdirSync(screenshotsDir, { recursive: true });
            }

            const filename = `tiktok-${name}-${Date.now()}.png`;
            const filepath = path.join(screenshotsDir, filename);
            
            await page.screenshot({ path: filepath, fullPage: true });
            this.logger.debug('Screenshot guardado', { path: filepath });
        } catch (error) {
            this.logger.warn('Error guardando screenshot', { 
                error: (error as Error).message 
            });
        }
    }

    /**
     * Actualiza el estado y notifica al callback si está configurado.
     */
    private updateStatus(status: TikTokPublishStatus, message: string): void {
        this.logger.debug(`Estado: ${status}`, { message });
        if (this.statusCallback) {
            this.statusCallback(status, message);
        }
    }

    /**
     * Espera el tiempo especificado.
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ===== MÉTODOS ESTÁTICOS =====

    /**
     * Genera un hash único para el video basado en el contenido.
     */
    public static generateVideoHash(videoPath: string): string {
        const content = fs.readFileSync(videoPath);
        return crypto.createHash('md5').update(content).digest('hex').substring(0, 12);
    }

    /**
     * Sanitiza hashtags para cumplir con reglas de TikTok.
     */
    public static sanitizeHashtags(hashtags: string[]): string[] {
        return hashtags
            .map(h => h.replace(/[^a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ]/g, ''))
            .filter(h => h.length >= 2 && h.length <= 30)
            .slice(0, TIKTOK_SPECS.maxHashtags);
    }

    /**
     * Valida que un caption cumple con los límites de TikTok.
     */
    public static validateCaption(caption: string): {
        valid: boolean;
        error?: string;
        truncated?: string;
    } {
        if (caption.length <= TIKTOK_SPECS.maxCaptionLength) {
            return { valid: true };
        }

        return {
            valid: false,
            error: `Caption excede ${TIKTOK_SPECS.maxCaptionLength} caracteres`,
            truncated: caption.substring(0, TIKTOK_SPECS.maxCaptionLength - 3) + '...'
        };
    }

    /**
     * Verifica si la duración del video es óptima para TikTok.
     */
    public static checkVideoDuration(durationSeconds: number): {
        valid: boolean;
        optimal: boolean;
        message: string;
    } {
        if (durationSeconds > TIKTOK_SPECS.maxDuration) {
            return {
                valid: false,
                optimal: false,
                message: `Video excede duración máxima (${TIKTOK_SPECS.maxDuration}s)`
            };
        }

        if (durationSeconds <= TIKTOK_SPECS.optimalDuration) {
            return {
                valid: true,
                optimal: true,
                message: `Duración óptima (≤${TIKTOK_SPECS.optimalDuration}s)`
            };
        }

        return {
            valid: true,
            optimal: false,
            message: `Duración válida pero no óptima (recomendado: ≤${TIKTOK_SPECS.optimalDuration}s)`
        };
    }
}

// ===== EXPORTACIONES =====

export default TikTokPublisher;
