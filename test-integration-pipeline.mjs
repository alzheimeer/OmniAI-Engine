/**
 * Test de Integración: Pipeline completo video+thumbnail con parámetros compartidos
 * 
 * Tarea 4.4: Crear un test de integración que verifique el pipeline completo donde 
 * video y thumbnail comparten los mismos parámetros de transformación.
 * 
 * REQ-1.4.7: Integrar con VideoTransformer para reutilizar TransformationParams
 * REQ-1.4.8: Exportar interface compartida para sincronización de parámetros video↔thumbnail
 * 
 * Este test verifica:
 * 1. VideoTransformer.generateUniqueParams() genera parámetros únicos
 * 2. Simular generación de video con esos parámetros
 * 3. Simular generación de thumbnail con los MISMOS parámetros
 * 4. Verificar que ambos usan exactamente los mismos valores
 * 5. Verificar que los hashes generados son consistentes para los mismos inputs
 */

// Importar módulos CommonJS en formato ESM
import videoTransformerModule from './dist/generators/VideoTransformer.js';
import thumbnailTransformerModule from './dist/generators/ThumbnailTransformer.js';

const { VideoTransformer, TRANSFORMATION_RANGES } = videoTransformerModule;
const { ThumbnailTransformer, THUMBNAIL_RANGES } = thumbnailTransformerModule;

/**
 * Clase de testing para el pipeline de integración
 */
class IntegrationPipelineTest {
    constructor() {
        this.testsRun = 0;
        this.testsPassed = 0;
        this.testsFailed = 0;
    }

    /**
     * Ejecuta una aserción y reporta resultado
     */
    assert(condition, testName, details = '') {
        this.testsRun++;
        if (condition) {
            this.testsPassed++;
            console.log(`✅ PASS: ${testName}`);
            if (details) console.log(`   Detalles: ${details}`);
        } else {
            this.testsFailed++;
            console.log(`❌ FAIL: ${testName}`);
            if (details) console.log(`   Detalles: ${details}`);
        }
    }

    /**
     * Compara dos valores numéricos con tolerancia
     */
    assertClose(actual, expected, tolerance, testName) {
        const diff = Math.abs(actual - expected);
        const condition = diff <= tolerance;
        const details = `actual=${actual}, expected=${expected}, diff=${diff.toFixed(6)}, tolerance=${tolerance}`;
        this.assert(condition, testName, details);
    }

    /**
     * Verifica igualdad estricta
     */
    assertEqual(actual, expected, testName) {
        const condition = actual === expected;
        const details = `actual=${actual}, expected=${expected}`;
        this.assert(condition, testName, details);
    }

    /**
     * Verifica que un valor está dentro de un rango
     */
    assertInRange(value, min, max, testName) {
        const condition = value >= min && value <= max;
        const details = `value=${value}, rango=[${min}, ${max}]`;
        this.assert(condition, testName, details);
    }

    /**
     * Imprime resumen de tests
     */
    printSummary() {
        console.log('\n' + '='.repeat(70));
        console.log('📊 RESUMEN DE TESTS DE INTEGRACIÓN');
        console.log('='.repeat(70));
        console.log(`Total tests ejecutados: ${this.testsRun}`);
        console.log(`✅ Pasados: ${this.testsPassed}`);
        console.log(`❌ Fallidos: ${this.testsFailed}`);
        console.log('='.repeat(70));
        
        if (this.testsFailed === 0) {
            console.log('🎉 ¡TODOS LOS TESTS DE INTEGRACIÓN PASARON!');
            process.exit(0);
        } else {
            console.log('⚠️  Algunos tests de integración fallaron');
            process.exit(1);
        }
    }
}

/**
 * Simula la generación de un video con los parámetros dados.
 * En el pipeline real, esto llamaría a FFmpeg para procesar el video.
 * Para el test, simulamos el resultado esperado.
 * 
 * @param {string} inputPath - Ruta del video de entrada
 * @param {string} outputPath - Ruta del video de salida
 * @param {object} params - TransformationParams a aplicar
 * @returns {object} - Resultado simulado de la transformación
 */
function simulateVideoGeneration(inputPath, outputPath, params) {
    // Construir el filtro que se aplicaría al video
    const chromaticFilter = VideoTransformer.buildChromaticFilter(params);
    const geometricFilter = VideoTransformer.buildGeometricFilter(params);
    
    // Simular el hash del video (basado en los parámetros)
    const paramsHash = VideoTransformer.getParamsHash(params);
    
    return {
        outputPath,
        appliedParams: params,
        chromaticFilter,
        geometricFilter,
        paramsHash,
        duration: 60 // simulado: 60 segundos
    };
}

/**
 * Simula la generación de un thumbnail con los parámetros dados.
 * En el pipeline real, esto llamaría a FFmpeg para procesar la imagen.
 * Para el test, simulamos el resultado esperado.
 * 
 * @param {string} inputPath - Ruta de la imagen base
 * @param {string} outputPath - Ruta del thumbnail de salida
 * @param {object} params - TransformationParams a aplicar
 * @param {number} grainIntensity - Intensidad del grain
 * @returns {object} - Resultado simulado de la transformación
 */
function simulateThumbnailGeneration(inputPath, outputPath, params, grainIntensity) {
    // Construir el filtro que se aplicaría al thumbnail
    const colorFilter = ThumbnailTransformer.buildColorFilter(params);
    const imageFilter = ThumbnailTransformer.buildImageFilter(params, grainIntensity);
    
    // Simular configuración
    const config = {
        baseImagePath: inputPath,
        transformationParams: params,
        textOverlay: {
            text: 'Test Thumbnail',
            offsetX: 10,
            offsetY: -5,
            style: 'bold'
        },
        grainIntensity
    };
    
    // Calcular hash de la configuración
    const configHash = ThumbnailTransformer.getConfigHash(config);
    
    return {
        outputPath,
        appliedParams: params,
        colorFilter,
        imageFilter,
        configHash,
        config
    };
}

// ============================================================================
// TESTS DE INTEGRACIÓN
// ============================================================================

async function runIntegrationTests() {
    const tester = new IntegrationPipelineTest();
    
    console.log('='.repeat(70));
    console.log('🧪 TEST DE INTEGRACIÓN: Pipeline completo video+thumbnail');
    console.log('   con parámetros de transformación compartidos');
    console.log('='.repeat(70));
    console.log();

    // =========================================================================
    // SECCIÓN 1: Generación de parámetros únicos
    // =========================================================================
    console.log('📦 SECCIÓN 1: Generación de parámetros únicos');
    console.log('='.repeat(70));
    console.log();

    // TEST 1.1: Generar parámetros únicos sin semilla
    console.log('📌 TEST 1.1: Generar parámetros únicos sin semilla');
    console.log('-'.repeat(60));
    
    const params1 = VideoTransformer.generateUniqueParams();
    const params2 = VideoTransformer.generateUniqueParams();
    
    tester.assert(
        params1 !== null && params1 !== undefined,
        'generateUniqueParams() retorna parámetros válidos',
        `Tipo: ${typeof params1}`
    );

    // Verificar que parámetros sin semilla son diferentes
    const hash1 = VideoTransformer.getParamsHash(params1);
    const hash2 = VideoTransformer.getParamsHash(params2);
    
    tester.assert(
        hash1 !== hash2,
        'Dos llamadas sin semilla generan hashes diferentes',
        `Hash1: ${hash1.substring(0, 16)}..., Hash2: ${hash2.substring(0, 16)}...`
    );

    console.log();

    // TEST 1.2: Reproducibilidad con semilla
    console.log('📌 TEST 1.2: Reproducibilidad con semilla');
    console.log('-'.repeat(60));
    
    const seed = 42424242;
    const paramsSeeded1 = VideoTransformer.generateUniqueParams(seed);
    const paramsSeeded2 = VideoTransformer.generateUniqueParams(seed);
    
    const hashSeeded1 = VideoTransformer.getParamsHash(paramsSeeded1);
    const hashSeeded2 = VideoTransformer.getParamsHash(paramsSeeded2);
    
    tester.assertEqual(
        hashSeeded1,
        hashSeeded2,
        'Misma semilla genera mismo hash de parámetros'
    );

    tester.assertEqual(
        paramsSeeded1.hue,
        paramsSeeded2.hue,
        'Misma semilla genera mismo valor de hue'
    );

    tester.assertEqual(
        paramsSeeded1.saturation,
        paramsSeeded2.saturation,
        'Misma semilla genera mismo valor de saturation'
    );

    console.log();

    // =========================================================================
    // SECCIÓN 2: Simulación de Pipeline completo video+thumbnail
    // =========================================================================
    console.log('📦 SECCIÓN 2: Simulación de Pipeline completo video+thumbnail');
    console.log('='.repeat(70));
    console.log();

    // TEST 2.1: Generar parámetros compartidos para video y thumbnail
    console.log('📌 TEST 2.1: Generar parámetros compartidos para video y thumbnail');
    console.log('-'.repeat(60));
    
    const pipelineSeed = 123456789;
    const sharedParams = VideoTransformer.generateUniqueParams(pipelineSeed);
    
    console.log('   Parámetros compartidos generados:');
    console.log(`   - zoom: ${sharedParams.zoom}`);
    console.log(`   - hue: ${sharedParams.hue}`);
    console.log(`   - saturation: ${sharedParams.saturation}`);
    console.log(`   - contrast: ${sharedParams.contrast}`);
    console.log(`   - brightness: ${sharedParams.brightness}`);
    console.log(`   - grainIntensity: ${sharedParams.grainIntensity}`);
    console.log(`   - crf: ${sharedParams.crf}`);
    
    tester.assert(
        sharedParams !== null,
        'Parámetros compartidos generados correctamente',
        `Hash: ${VideoTransformer.getParamsHash(sharedParams)}`
    );

    console.log();

    // TEST 2.2: Simular generación de video
    console.log('📌 TEST 2.2: Simular generación de video con parámetros compartidos');
    console.log('-'.repeat(60));
    
    const videoResult = simulateVideoGeneration(
        'content/input-video.mp4',
        'content/transformed-video.mp4',
        sharedParams
    );
    
    tester.assert(
        videoResult.appliedParams === sharedParams,
        'Video usa referencia directa a parámetros compartidos',
        'Referencia de objeto idéntica'
    );

    console.log(`   Filtro cromático del video: ${videoResult.chromaticFilter.substring(0, 60)}...`);
    
    console.log();

    // TEST 2.3: Simular generación de thumbnail
    console.log('📌 TEST 2.3: Simular generación de thumbnail con MISMOS parámetros');
    console.log('-'.repeat(60));
    
    const grainIntensity = sharedParams.grainIntensity;
    const thumbnailResult = simulateThumbnailGeneration(
        'content/thumbnail-base.png',
        'content/thumbnail-transformed.jpg',
        sharedParams,
        grainIntensity
    );
    
    tester.assert(
        thumbnailResult.appliedParams === sharedParams,
        'Thumbnail usa referencia directa a parámetros compartidos',
        'Referencia de objeto idéntica'
    );

    console.log(`   Filtro de color del thumbnail: ${thumbnailResult.colorFilter}`);
    
    console.log();

    // =========================================================================
    // SECCIÓN 3: Verificación de sincronización video↔thumbnail
    // =========================================================================
    console.log('📦 SECCIÓN 3: Verificación de sincronización video↔thumbnail');
    console.log('='.repeat(70));
    console.log();

    // TEST 3.1: Verificar que ambos usan exactamente los mismos valores cromáticos
    console.log('📌 TEST 3.1: Verificar sincronización de valores cromáticos');
    console.log('-'.repeat(60));
    
    tester.assertEqual(
        videoResult.appliedParams.hue,
        thumbnailResult.appliedParams.hue,
        'Hue sincronizado entre video y thumbnail'
    );

    tester.assertEqual(
        videoResult.appliedParams.saturation,
        thumbnailResult.appliedParams.saturation,
        'Saturation sincronizada entre video y thumbnail'
    );

    tester.assertEqual(
        videoResult.appliedParams.contrast,
        thumbnailResult.appliedParams.contrast,
        'Contrast sincronizado entre video y thumbnail'
    );

    tester.assertEqual(
        videoResult.appliedParams.brightness,
        thumbnailResult.appliedParams.brightness,
        'Brightness sincronizado entre video y thumbnail'
    );

    console.log();

    // TEST 3.2: Verificar que los filtros cromáticos son idénticos
    console.log('📌 TEST 3.2: Verificar que filtros cromáticos son idénticos');
    console.log('-'.repeat(60));
    
    tester.assertEqual(
        videoResult.chromaticFilter,
        thumbnailResult.colorFilter,
        'Filtro cromático del video === filtro de color del thumbnail'
    );

    console.log(`   Video chromaticFilter:    ${videoResult.chromaticFilter}`);
    console.log(`   Thumbnail colorFilter:    ${thumbnailResult.colorFilter}`);
    
    console.log();

    // TEST 3.3: Verificar zoom compartido
    console.log('📌 TEST 3.3: Verificar zoom compartido');
    console.log('-'.repeat(60));
    
    tester.assertEqual(
        videoResult.appliedParams.zoom,
        thumbnailResult.appliedParams.zoom,
        'Zoom sincronizado entre video y thumbnail'
    );

    tester.assertInRange(
        sharedParams.zoom,
        TRANSFORMATION_RANGES.zoom.min,
        TRANSFORMATION_RANGES.zoom.max,
        'Zoom dentro del rango válido (102-108%)'
    );

    console.log();

    // =========================================================================
    // SECCIÓN 4: Verificación de consistencia de hashes
    // =========================================================================
    console.log('📦 SECCIÓN 4: Verificación de consistencia de hashes');
    console.log('='.repeat(70));
    console.log();

    // TEST 4.1: Hash de parámetros es consistente
    console.log('📌 TEST 4.1: Hash de parámetros es consistente para mismos inputs');
    console.log('-'.repeat(60));
    
    const paramsHashA = VideoTransformer.getParamsHash(sharedParams);
    const paramsHashB = VideoTransformer.getParamsHash(sharedParams);
    
    tester.assertEqual(
        paramsHashA,
        paramsHashB,
        'Mismo objeto produce mismo hash de parámetros'
    );

    // Re-generar con misma semilla y verificar hash
    const regeneratedParams = VideoTransformer.generateUniqueParams(pipelineSeed);
    const regeneratedHash = VideoTransformer.getParamsHash(regeneratedParams);
    
    tester.assertEqual(
        paramsHashA,
        regeneratedHash,
        'Parámetros regenerados con misma semilla producen mismo hash'
    );

    console.log(`   Hash de parámetros: ${paramsHashA}`);
    
    console.log();

    // TEST 4.2: Diferentes semillas producen diferentes hashes
    console.log('📌 TEST 4.2: Diferentes semillas producen diferentes hashes');
    console.log('-'.repeat(60));
    
    const params_seed1 = VideoTransformer.generateUniqueParams(11111);
    const params_seed2 = VideoTransformer.generateUniqueParams(22222);
    const params_seed3 = VideoTransformer.generateUniqueParams(33333);
    
    const hash_seed1 = VideoTransformer.getParamsHash(params_seed1);
    const hash_seed2 = VideoTransformer.getParamsHash(params_seed2);
    const hash_seed3 = VideoTransformer.getParamsHash(params_seed3);
    
    tester.assert(
        hash_seed1 !== hash_seed2 && hash_seed2 !== hash_seed3 && hash_seed1 !== hash_seed3,
        'Tres semillas diferentes producen tres hashes diferentes',
        `Hash1: ${hash_seed1.substring(0, 8)}, Hash2: ${hash_seed2.substring(0, 8)}, Hash3: ${hash_seed3.substring(0, 8)}`
    );

    console.log();

    // TEST 4.3: Hash de configuración de thumbnail
    console.log('📌 TEST 4.3: Hash de configuración de thumbnail es consistente');
    console.log('-'.repeat(60));
    
    const configHashA = thumbnailResult.configHash;
    const configHashB = ThumbnailTransformer.getConfigHash(thumbnailResult.config);
    
    tester.assertEqual(
        configHashA,
        configHashB,
        'Misma configuración produce mismo hash de config'
    );

    console.log(`   Hash de configuración thumbnail: ${configHashA}`);
    
    console.log();

    // =========================================================================
    // SECCIÓN 5: Pipeline completo con múltiples videos
    // =========================================================================
    console.log('📦 SECCIÓN 5: Pipeline completo con múltiples videos');
    console.log('='.repeat(70));
    console.log();

    // TEST 5.1: Simular pipeline para 3 videos diferentes
    console.log('📌 TEST 5.1: Simular pipeline para 3 videos diferentes');
    console.log('-'.repeat(60));
    
    const pipelineResults = [];
    
    for (let i = 1; i <= 3; i++) {
        const videoSeed = 1000000 + i * 12345;
        const videoParams = VideoTransformer.generateUniqueParams(videoSeed);
        
        const video = simulateVideoGeneration(
            `content/input-video-${i}.mp4`,
            `content/transformed-video-${i}.mp4`,
            videoParams
        );
        
        const thumbnail = simulateThumbnailGeneration(
            `content/thumbnail-base-${i}.png`,
            `content/thumbnail-${i}.jpg`,
            videoParams,
            videoParams.grainIntensity
        );
        
        pipelineResults.push({ video, thumbnail, params: videoParams });
        
        // Verificar sincronización para cada par video/thumbnail
        tester.assertEqual(
            video.chromaticFilter,
            thumbnail.colorFilter,
            `Video ${i} y Thumbnail ${i} tienen filtro cromático idéntico`
        );
    }

    console.log();

    // TEST 5.2: Verificar que cada video/thumbnail tiene parámetros únicos
    console.log('📌 TEST 5.2: Cada video/thumbnail tiene parámetros únicos');
    console.log('-'.repeat(60));
    
    const allHashes = pipelineResults.map(r => VideoTransformer.getParamsHash(r.params));
    const uniqueHashes = new Set(allHashes);
    
    tester.assertEqual(
        uniqueHashes.size,
        3,
        'Los 3 pipelines tienen hashes de parámetros únicos'
    );

    for (let i = 0; i < pipelineResults.length; i++) {
        console.log(`   Pipeline ${i + 1}: Hash=${allHashes[i].substring(0, 16)}...`);
    }
    
    console.log();

    // TEST 5.3: Verificar rangos válidos para todos los parámetros generados
    console.log('📌 TEST 5.3: Verificar rangos válidos para todos los parámetros');
    console.log('-'.repeat(60));
    
    for (let i = 0; i < pipelineResults.length; i++) {
        const params = pipelineResults[i].params;
        
        tester.assertInRange(
            params.zoom,
            TRANSFORMATION_RANGES.zoom.min,
            TRANSFORMATION_RANGES.zoom.max,
            `Pipeline ${i + 1}: zoom en rango`
        );
        
        tester.assertInRange(
            params.hue,
            TRANSFORMATION_RANGES.hue.min,
            TRANSFORMATION_RANGES.hue.max,
            `Pipeline ${i + 1}: hue en rango`
        );
        
        tester.assertInRange(
            params.saturation,
            TRANSFORMATION_RANGES.saturation.min,
            TRANSFORMATION_RANGES.saturation.max,
            `Pipeline ${i + 1}: saturation en rango`
        );
        
        tester.assertInRange(
            params.contrast,
            TRANSFORMATION_RANGES.contrast.min,
            TRANSFORMATION_RANGES.contrast.max,
            `Pipeline ${i + 1}: contrast en rango`
        );
        
        tester.assertInRange(
            params.brightness,
            TRANSFORMATION_RANGES.brightness.min,
            TRANSFORMATION_RANGES.brightness.max,
            `Pipeline ${i + 1}: brightness en rango`
        );
        
        tester.assertInRange(
            params.grainIntensity,
            TRANSFORMATION_RANGES.grain.min,
            TRANSFORMATION_RANGES.grain.max,
            `Pipeline ${i + 1}: grainIntensity en rango`
        );
        
        tester.assertInRange(
            params.crf,
            TRANSFORMATION_RANGES.crf.min,
            TRANSFORMATION_RANGES.crf.max,
            `Pipeline ${i + 1}: crf en rango`
        );
    }
    
    console.log();

    // =========================================================================
    // SECCIÓN 6: Validación de interface compartida
    // =========================================================================
    console.log('📦 SECCIÓN 6: Validación de interface compartida');
    console.log('='.repeat(70));
    console.log();

    // TEST 6.1: ThumbnailTransformer acepta TransformationParams de VideoTransformer
    console.log('📌 TEST 6.1: ThumbnailTransformer acepta TransformationParams');
    console.log('-'.repeat(60));
    
    const videoGenParams = VideoTransformer.generateUniqueParams(555555);
    
    // Verificar que se puede pasar directamente a buildColorFilter
    let colorFilterSuccess = false;
    try {
        const filter = ThumbnailTransformer.buildColorFilter(videoGenParams);
        colorFilterSuccess = typeof filter === 'string' && filter.length > 0;
    } catch (e) {
        colorFilterSuccess = false;
    }
    
    tester.assert(
        colorFilterSuccess,
        'ThumbnailTransformer.buildColorFilter acepta TransformationParams de VideoTransformer',
        'No hubo errores de tipo'
    );

    // Verificar que se puede pasar directamente a buildImageFilter
    let imageFilterSuccess = false;
    try {
        const filter = ThumbnailTransformer.buildImageFilter(videoGenParams, 5);
        imageFilterSuccess = typeof filter === 'string' && filter.length > 0;
    } catch (e) {
        imageFilterSuccess = false;
    }
    
    tester.assert(
        imageFilterSuccess,
        'ThumbnailTransformer.buildImageFilter acepta TransformationParams de VideoTransformer',
        'No hubo errores de tipo'
    );

    console.log();

    // TEST 6.2: Verificar que TRANSFORMATION_RANGES está exportado correctamente
    console.log('📌 TEST 6.2: TRANSFORMATION_RANGES exportado correctamente');
    console.log('-'.repeat(60));
    
    tester.assert(
        TRANSFORMATION_RANGES !== null && TRANSFORMATION_RANGES !== undefined,
        'TRANSFORMATION_RANGES está exportado desde VideoTransformer',
        `Tipo: ${typeof TRANSFORMATION_RANGES}`
    );

    tester.assert(
        typeof TRANSFORMATION_RANGES.zoom === 'object',
        'TRANSFORMATION_RANGES.zoom existe',
        `min: ${TRANSFORMATION_RANGES.zoom?.min}, max: ${TRANSFORMATION_RANGES.zoom?.max}`
    );

    console.log();

    // TEST 6.3: Verificar que THUMBNAIL_RANGES está exportado correctamente
    console.log('📌 TEST 6.3: THUMBNAIL_RANGES exportado correctamente');
    console.log('-'.repeat(60));
    
    tester.assert(
        THUMBNAIL_RANGES !== null && THUMBNAIL_RANGES !== undefined,
        'THUMBNAIL_RANGES está exportado desde ThumbnailTransformer',
        `Tipo: ${typeof THUMBNAIL_RANGES}`
    );

    tester.assert(
        typeof THUMBNAIL_RANGES.textOffset === 'object',
        'THUMBNAIL_RANGES.textOffset existe',
        `min: ${THUMBNAIL_RANGES.textOffset?.min}, max: ${THUMBNAIL_RANGES.textOffset?.max}`
    );

    console.log();

    // =========================================================================
    // Imprimir resumen final
    // =========================================================================
    tester.printSummary();
}

// Ejecutar tests de integración
console.log('\n🚀 Iniciando tests de integración del pipeline video+thumbnail...\n');
runIntegrationTests().catch(error => {
    console.error('❌ Error al ejecutar tests de integración:', error.message);
    console.error(error.stack);
    process.exit(1);
});
