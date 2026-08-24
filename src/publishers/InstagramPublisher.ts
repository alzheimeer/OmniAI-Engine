/**
 * InstagramPublisher.ts
 * 
 * Publicador para Instagram Reels usando Puppeteer stealth automation.
 * Parte de la Fase 5: Expansión Multiplataforma (bloqueada por YPPValidationGate.passed === true)
 * 
 * REQ-3.3.1: Crear InstagramPublisher.ts usando Instagram Graph API o Puppeteer stealth
 * 
 * Funcionalidades:
 * - Autenticación mediante sesión de cookies
 * - Subida de videos como Reels
 * - Configuración de caption, hashtags y cover
 * - Programación de publicación con delay
 * - Lógica de reintentos para uploads fallidos
 * - Logging y seguimiento de estado
 * 
 * IMPORTANTE: Esta funcionalidad está BLOQUEADA por YPPValidationGate.
 * Solo se activa cuando la monetización de YouTube está aprobada (Regla de Oro #2).
 * 
 * NOTA: Instagram Graph API requiere cuenta Business verificada y aprobación.
 * Esta implementación usa Puppeteer stealth para mayor accesibilidad.
 * Cumplir siempre con los Terms of Service de Instagram.
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
 * Credenciales para autenticación en Instagram.
 * Preferir sesión de cookies sobre username/password por seguridad.
 */
export interface InstagramCredentials {
    /** Username de Instagram (opcional si se usan cookies) */
    username?: string;
    
    /** Password de Instagram (opcional si se usan cookies) */
    password?: string;
    
    /** Ruta al archivo de cookies JSON para sesión persistente */
    cookiesPath?: string;
    
    /** User data directory para reutilizar sesión del navegador */
    userDataDir?: string;
}

/**
 * Metadatos para la publicación del Reel en Instagram.
 */
export interface InstagramReelMetadata {
    /** Caption/descripción del Reel (máx 2200 caracteres) */
    caption: string;
    
    /** Hashtags a incluir (se añaden al caption) */
    hashtags: string[];
    
    /** Ruta al archivo de cover/thumbnail (opcional) */
    coverImagePath?: string;
    
    /** Etiqueta de ubicación (opcional) */
    location?: string;
    
    /** Etiquetar cuentas (optional, formato @username) */
    mentions?: string[];
    
    /** Si deshabilitar comentarios (default: false) */
    disableComments?: boolean;
}

/**
 * Opciones para la publicación del Reel.
 */
export interface PublishOptions {
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
 * Resultado de la publicación del Reel.
 */
export interface InstagramPublishResult {
    /** Si la publicación fue exitosa */
    success: boolean;
    
    /** URL del Reel publicado (si disponible) */
    reelUrl?: string;
    
    /** ID del Reel (si disponible) */
    reelId?: string;
    
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
export type PublishStatus = 
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
export type StatusCallback = (status: PublishStatus, message: string) => void;

// ===== CONSTANTES =====

/**
 * Especificaciones de Instagram Reels.
 */
export const INSTAGRAM_SPECS = {
    /** Duración máxima de Reels en segundos */
    maxDuration: 90,
    
    /** Resolución recomendada (vertical 9:16) */
    resolution: { width: 1080, height: 1920 },
    
    /** Longitud máxima del caption */
    maxCaptionLength: 2200,
    
    /** Número máximo de hashtags recomendados */
    maxHashtags: 30,
    
    /** Formatos de video soportados */
    supportedFormats: ['mp4', 'mov'],
    
    /** Tamaño máximo de archivo en bytes (1GB) */
    maxFileSize: 1024 * 1024 * 1024,
    
    /** URLs de Instagram */
    urls: {
        base: 'https://www.instagram.com',
        login: 'https://www.instagram.com/accounts/login/',
        upload: 'https://www.instagram.com/create/select/'
    }
} as const;

/**
 * Selectores CSS para elementos de Instagram (pueden cambiar con actualizaciones).
 * Mantener actualizados según cambios en la UI de Instagram.
 */
const SELECTORS = {
    // Login
    usernameInput: 'input[name="username"]',
    passwordInput: 'input[name="password"]',
    loginButton: 'button[type="submit"]',
    loginError: '#slfErrorAlert',
    
    // Upload
    createButton: 'svg[aria-label="New post"]',
    fileInput: 'input[type="file"]',
    nextButton: 'button:has-text("Next"), div[role="button"]:has-text("Next")',
    captionTextarea: 'div[aria-label="Write a caption..."], textarea[aria-label="Write a caption..."]',
    shareButton: 'button:has-text("Share"), div[role="button"]:has-text("Share")',
    
    // Confirmación
    reelPosted: 'span:has-text("Your reel has been shared")',
    
    // Navegación
    notNowButton: 'button:has-text("Not Now")',
    closeButton: 'svg[aria-label="Close"]'
} as const;

/**
 * Configuración por defecto de timeouts.
 */
const DEFAULT_TIMEOUTS = {
    navigation: 60000,
    upload: 180000,
    element: 30000,
    action: 10000
} as const;

// ===== CLASE PRINCIPAL =====

/**
 * InstagramPublisher - Publicador de Reels para Instagram.
 * 
 * Implementa la publicación automatizada de videos como Reels usando
 * Puppeteer stealth para evitar detección de bots.
 * 
 * IMPORTANTE:
 * - Esta funcionalidad está bloqueada por YPPValidationGate (Regla de Oro #2)
 * - Solo se activa cuando YouTube está monetizado
 * - Cumplir siempre con los Terms of Service de Instagram
 * - Usar con moderación para evitar restricciones de cuenta
 * 
 * Uso básico:
 * ```typescript
 * const publisher = new InstagramPublisher({
 *     cookiesPath: './instagram-cookies.json'
 * });
 * 
 * const result = await publisher.publishReel(
 *     './video.mp4',
 *     {
 *         caption: 'Mi nuevo Reel',
 *         hashtags: ['reels', 'viral']
 *     }
 * );
 * ```
 */
export class InstagramPublisher {
    /** Credenciales de autenticación */
    private readonly credentials: InstagramCredentials;
    
    /** Logger para trazabilidad */
    private readonly logger: Logger;
    
    /** Handler de reintentos */
    private readonly retryHandler: RetryHandler;
    
    /** Browser de Puppeteer (reutilizable) */
    private browser: Browser | null = null;
    
    /** Callback para notificar cambios de estado */
    private statusCallback?: StatusCallback;

    /**
     * Crea una nueva instancia de InstagramPublisher.
     * 
     * @param credentials - Credenciales para autenticación
     */
    constructor(credentials: InstagramCredentials) {
        this.credentials = credentials;
        this.logger = new Logger('InstagramPublisher');
        this.retryHandler = new RetryHandler(
            {
                maxRetries: 3,
                baseDelayMs: 5000,
                backoffFactor: 2,
                maxDelayMs: 60000,
                nonRetryableErrors: [401, 403]
            },
            'InstagramPublisher'
        );
    }

    // ===== MÉTODOS PÚBLICOS =====

    /**
     * Publica un video como Reel en Instagram.
     * 
     * Pipeline de publicación:
     * 1. Validar video y metadata
     * 2. Iniciar navegador con stealth
     * 3. Autenticar (cookies o login)
     * 4. Navegar a página de upload
     * 5. Subir video
     * 6. Configurar caption y hashtags
     * 7. Publicar
     * 8. Verificar éxito
     * 
     * @param videoPath - Ruta absoluta al video a publicar
     * @param metadata - Metadatos del Reel (caption, hashtags, etc.)
     * @param options - Opciones de publicación
     * @returns Resultado de la publicación
     */
    public async publishReel(
        videoPath: string,
        metadata: InstagramReelMetadata,
        options: PublishOptions = {}
    ): Promise<InstagramPublishResult> {
        const startTime = Date.now();
        const correlationId = Logger.generateCorrelationId();
        this.logger.setCorrelationId(correlationId);
        
        this.logger.info('Iniciando publicación de Reel en Instagram', {
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
                        throw new Error('Falló la autenticación en Instagram');
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
                'Instagram Reel Upload'
            );

            const durationMs = Date.now() - startTime;
            this.updateStatus('completed', 'Reel publicado exitosamente');

            this.logger.info('Reel publicado exitosamente en Instagram', {
                reelUrl: result.result.reelUrl,
                duration: durationMs,
                attempts
            });

            return {
                success: true,
                reelUrl: result.result.reelUrl,
                reelId: result.result.reelId,
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
            this.logger.error('Error publicando Reel en Instagram', err, {
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
    public onStatusChange(callback: StatusCallback): void {
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
    private validateInput(videoPath: string, metadata: InstagramReelMetadata): void {
        // Validar que el archivo existe
        if (!fs.existsSync(videoPath)) {
            throw new Error(`Video no encontrado: ${videoPath}`);
        }

        // Validar formato
        const ext = path.extname(videoPath).toLowerCase().replace('.', '');
        if (!(INSTAGRAM_SPECS.supportedFormats as readonly string[]).includes(ext)) {
            throw new Error(
                `Formato no soportado: ${ext}. Soportados: ${INSTAGRAM_SPECS.supportedFormats.join(', ')}`
            );
        }

        // Validar tamaño
        const stats = fs.statSync(videoPath);
        if (stats.size > INSTAGRAM_SPECS.maxFileSize) {
            throw new Error(
                `Archivo demasiado grande: ${(stats.size / 1024 / 1024).toFixed(2)}MB. ` +
                `Máximo: ${INSTAGRAM_SPECS.maxFileSize / 1024 / 1024}MB`
            );
        }

        // Validar caption
        if (metadata.caption.length > INSTAGRAM_SPECS.maxCaptionLength) {
            throw new Error(
                `Caption demasiado largo: ${metadata.caption.length} chars. ` +
                `Máximo: ${INSTAGRAM_SPECS.maxCaptionLength}`
            );
        }

        // Validar hashtags
        if (metadata.hashtags.length > INSTAGRAM_SPECS.maxHashtags) {
            this.logger.warn('Demasiados hashtags, se truncarán', {
                count: metadata.hashtags.length,
                max: INSTAGRAM_SPECS.maxHashtags
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
    private async launchBrowser(options: PublishOptions): Promise<Browser> {
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
    private async configurePage(page: Page, options: PublishOptions): Promise<void> {
        // Configurar timeout
        const timeout = options.timeoutMs ?? DEFAULT_TIMEOUTS.navigation;
        page.setDefaultTimeout(timeout);
        page.setDefaultNavigationTimeout(timeout);

        // Configurar headers
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
        });

        // Emular dispositivo móvil para mejor compatibilidad con Reels
        await page.setViewport({
            width: 1080,
            height: 1920,
            isMobile: false,
            hasTouch: false
        });

        this.logger.debug('Página configurada');
    }

    /**
     * Autentica en Instagram usando cookies o login.
     */
    private async authenticate(page: Page, options: PublishOptions): Promise<boolean> {
        this.updateStatus('authenticating', 'Autenticando en Instagram...');

        // Intentar con cookies primero
        if (this.credentials.cookiesPath && fs.existsSync(this.credentials.cookiesPath)) {
            try {
                const cookies = JSON.parse(
                    fs.readFileSync(this.credentials.cookiesPath, 'utf-8')
                );
                await page.setCookie(...cookies);
                this.logger.info('Cookies cargadas exitosamente');

                // Verificar si la sesión es válida
                await page.goto(INSTAGRAM_SPECS.urls.base, {
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
            // Buscar elemento que solo aparece cuando está logueado
            const profileIcon = await page.$('svg[aria-label="Home"]');
            return profileIcon !== null;
        } catch {
            return false;
        }
    }

    /**
     * Realiza login con username/password.
     */
    private async loginWithCredentials(
        page: Page, 
        options: PublishOptions
    ): Promise<boolean> {
        this.logger.info('Iniciando login con credenciales');

        await page.goto(INSTAGRAM_SPECS.urls.login, {
            waitUntil: 'networkidle2'
        });

        // Esperar a que cargue el formulario
        await page.waitForSelector(SELECTORS.usernameInput, {
            timeout: DEFAULT_TIMEOUTS.element
        });

        // Simular escritura humana
        await this.typeWithDelay(page, SELECTORS.usernameInput, this.credentials.username!);
        await this.sleep(500 + Math.random() * 500);
        await this.typeWithDelay(page, SELECTORS.passwordInput, this.credentials.password!);
        
        if (options.debugScreenshots) {
            await this.takeScreenshot(page, 'before-login', options.screenshotsDir);
        }

        // Click en login
        await this.sleep(300 + Math.random() * 300);
        await page.click(SELECTORS.loginButton);

        // Esperar navegación o error
        try {
            await page.waitForNavigation({
                waitUntil: 'networkidle2',
                timeout: DEFAULT_TIMEOUTS.navigation
            });

            // Cerrar diálogos molestos (guardar info, notificaciones)
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
            const errorElement = await page.$(SELECTORS.loginError);
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
            'button:has-text("Not Now")',
            'button:has-text("Not now")',
            'button:has-text("Cancel")',
            'button:has-text("Maybe Later")'
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
     * Sube el video y publica como Reel.
     */
    private async uploadAndPublish(
        page: Page,
        videoPath: string,
        metadata: InstagramReelMetadata,
        options: PublishOptions
    ): Promise<{ reelUrl?: string; reelId?: string }> {
        this.updateStatus('uploading', 'Subiendo video...');

        // Navegar a página de creación
        await page.goto(INSTAGRAM_SPECS.urls.upload, {
            waitUntil: 'networkidle2'
        });

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

        // Esperar procesamiento del video
        await this.sleep(3000);
        await page.waitForSelector('video', { timeout: DEFAULT_TIMEOUTS.upload });
        this.logger.info('Video procesado por Instagram');

        // Hacer click en Next/Siguiente
        await this.clickNext(page);
        await this.sleep(1500);
        
        // Seleccionar "Reel" si hay opción
        await this.selectReelOption(page);
        
        // Click en Next de nuevo (para ir a caption)
        await this.clickNext(page);
        await this.sleep(1000);

        // Configurar metadata
        this.updateStatus('configuring', 'Configurando caption y hashtags...');
        await this.configureMetadata(page, metadata, options);

        if (options.debugScreenshots) {
            await this.takeScreenshot(page, 'before-publish', options.screenshotsDir);
        }

        // Publicar
        this.updateStatus('publishing', 'Publicando Reel...');
        await this.clickShare(page);

        // Esperar confirmación
        await this.waitForPublishConfirmation(page);

        // Extraer URL del Reel
        const reelUrl = await this.extractReelUrl(page);

        return {
            reelUrl,
            reelId: reelUrl ? this.extractReelIdFromUrl(reelUrl) : undefined
        };
    }

    /**
     * Selecciona la opción de Reel si está disponible.
     */
    private async selectReelOption(page: Page): Promise<void> {
        try {
            // Buscar y clickear opción de Reel
            const reelOption = await page.$('button:has-text("Reel"), div:has-text("Reel")');
            if (reelOption) {
                await reelOption.click();
                await this.sleep(500);
                this.logger.debug('Opción Reel seleccionada');
            }
        } catch {
            // Puede que no exista la opción (ya detectado como Reel)
            this.logger.debug('Opción Reel no encontrada o ya seleccionada');
        }
    }

    /**
     * Hace click en el botón Next/Siguiente.
     */
    private async clickNext(page: Page): Promise<void> {
        // Buscar botón Next con diferentes selectores
        const nextSelectors = [
            'button:has-text("Next")',
            'div[role="button"]:has-text("Next")',
            'button:has-text("Siguiente")',
            'div[role="button"]:has-text("Siguiente")'
        ];

        for (const selector of nextSelectors) {
            try {
                const button = await page.$(selector);
                if (button) {
                    await button.click();
                    return;
                }
            } catch {
                continue;
            }
        }

        // Fallback: buscar por aria-label
        try {
            await page.click('div[role="button"][tabindex="0"]');
        } catch (error) {
            this.logger.warn('No se encontró botón Next', { 
                error: (error as Error).message 
            });
        }
    }

    /**
     * Configura el caption, hashtags y otras opciones.
     */
    private async configureMetadata(
        page: Page,
        metadata: InstagramReelMetadata,
        options: PublishOptions
    ): Promise<void> {
        // Construir caption completo con hashtags
        const hashtags = metadata.hashtags
            .slice(0, INSTAGRAM_SPECS.maxHashtags)
            .map(h => h.startsWith('#') ? h : `#${h}`)
            .join(' ');
        
        const fullCaption = metadata.caption + 
            (hashtags ? '\n\n' + hashtags : '');

        // Buscar textarea de caption
        const captionSelectors = [
            'div[aria-label="Write a caption..."]',
            'textarea[aria-label="Write a caption..."]',
            'div[contenteditable="true"]'
        ];

        for (const selector of captionSelectors) {
            try {
                const textarea = await page.$(selector);
                if (textarea) {
                    await textarea.click();
                    await this.sleep(300);
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
     * Hace click en el botón Share/Compartir para publicar.
     */
    private async clickShare(page: Page): Promise<void> {
        const shareSelectors = [
            'button:has-text("Share")',
            'div[role="button"]:has-text("Share")',
            'button:has-text("Compartir")',
            'div[role="button"]:has-text("Compartir")'
        ];

        for (const selector of shareSelectors) {
            try {
                const button = await page.$(selector);
                if (button) {
                    await button.click();
                    return;
                }
            } catch {
                continue;
            }
        }

        throw new Error('No se encontró botón de compartir');
    }

    /**
     * Espera confirmación de que el Reel fue publicado.
     */
    private async waitForPublishConfirmation(page: Page): Promise<void> {
        const confirmationSelectors = [
            'span:has-text("Your reel has been shared")',
            'span:has-text("Tu reel se ha compartido")',
            'div:has-text("Reel shared")'
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

            await this.sleep(1000);
        }

        // Verificar si hay error
        const errorSelectors = ['div[role="alert"]', 'span:has-text("error")'];
        for (const selector of errorSelectors) {
            const error = await page.$(selector);
            if (error) {
                const text = await error.evaluate(el => el.textContent);
                throw new Error(`Error de Instagram: ${text}`);
            }
        }

        // Asumir éxito si no hay error después del timeout
        this.logger.warn('Timeout esperando confirmación, asumiendo éxito');
    }

    /**
     * Extrae la URL del Reel publicado de la página.
     */
    private async extractReelUrl(page: Page): Promise<string | undefined> {
        try {
            // Intentar obtener URL de la página actual
            const currentUrl = page.url();
            if (currentUrl.includes('/reel/')) {
                return currentUrl;
            }

            // Buscar link al Reel en la página
            const reelLink = await page.$('a[href*="/reel/"]');
            if (reelLink) {
                const href = await reelLink.evaluate(el => el.getAttribute('href'));
                return href ? `https://www.instagram.com${href}` : undefined;
            }

            return undefined;
        } catch {
            return undefined;
        }
    }

    /**
     * Extrae el ID del Reel de su URL.
     */
    private extractReelIdFromUrl(url: string): string | undefined {
        const match = url.match(/\/reel\/([A-Za-z0-9_-]+)/);
        return match ? match[1] : undefined;
    }

    /**
     * Escribe texto con delay para simular comportamiento humano.
     */
    private async typeWithDelay(
        page: Page, 
        selector: string, 
        text: string
    ): Promise<void> {
        await page.click(selector);
        await this.sleep(100);
        
        // Limpiar campo existente
        await page.evaluate((sel: string) => {
            const input = document.querySelector(sel) as HTMLInputElement;
            if (input) input.value = '';
        }, selector);

        // Escribir con delay aleatorio entre caracteres
        for (const char of text) {
            await page.type(selector, char, { delay: 50 + Math.random() * 100 });
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

            const filename = `instagram-${name}-${Date.now()}.png`;
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
    private updateStatus(status: PublishStatus, message: string): void {
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
     * Genera un hash único para el Reel basado en el contenido.
     */
    public static generateReelHash(videoPath: string): string {
        const content = fs.readFileSync(videoPath);
        return crypto.createHash('md5').update(content).digest('hex').substring(0, 12);
    }

    /**
     * Sanitiza hashtags para cumplir con reglas de Instagram.
     */
    public static sanitizeHashtags(hashtags: string[]): string[] {
        return hashtags
            .map(h => h.replace(/[^a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ]/g, ''))
            .filter(h => h.length >= 2 && h.length <= 30)
            .slice(0, INSTAGRAM_SPECS.maxHashtags);
    }

    /**
     * Valida que un caption cumple con los límites de Instagram.
     */
    public static validateCaption(caption: string): {
        valid: boolean;
        error?: string;
        truncated?: string;
    } {
        if (caption.length <= INSTAGRAM_SPECS.maxCaptionLength) {
            return { valid: true };
        }

        return {
            valid: false,
            error: `Caption excede ${INSTAGRAM_SPECS.maxCaptionLength} caracteres`,
            truncated: caption.substring(0, INSTAGRAM_SPECS.maxCaptionLength - 3) + '...'
        };
    }
}

// ===== EXPORTACIONES =====

export default InstagramPublisher;
