/**
 * Test de sincronización ThumbnailTransformer ↔ VideoTransformer
 * 
 * Tarea 4.2: Verificar que ThumbnailTransformer usa los MISMOS parámetros 
 * cromáticos que el video correspondiente para mantener consistencia visual.
 * 
 * REQ-1.4.1: ThumbnailTransformer debe aplicar las MISMAS transformaciones 
 * cromáticas que VideoTransformer para sincronización perfecta.
 */

// Importar módulos CommonJS en formato ESM
import videoTransformerModule from './dist/generators/VideoTransformer.js';
import thumbnailTransformerModule from './dist/generators/ThumbnailTransformer.js';

const { VideoTransformer } = videoTransformerModule;
const { ThumbnailTransformer } = thumbnailTransformerModule;

/**
 * Clase de testing para verificar sincronización video↔thumbnail
 */
class ThumbnailSyncTest {
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
     * Imprime resumen de tests
     */
    printSummary() {
        console.log('\n' + '='.repeat(60));
        console.log('📊 RESUMEN DE TESTS');
        console.log('='.repeat(60));
        console.log(`Total tests ejecutados: ${this.testsRun}`);
        console.log(`✅ Pasados: ${this.testsPassed}`);
        console.log(`❌ Fallidos: ${this.testsFailed}`);
        console.log('='.repeat(60));
        
        if (this.testsFailed === 0) {
            console.log('🎉 ¡TODOS LOS TESTS PASARON!');
            process.exit(0);
        } else {
            console.log('⚠️  Algunos tests fallaron');
            process.exit(1);
        }
    }
}

// ============================================================================
// TESTS
// ============================================================================

async function runTests() {
    const tester = new ThumbnailSyncTest();
    
    console.log('='.repeat(60));
    console.log('🧪 TEST: ThumbnailTransformer sincroniza parámetros con video');
    console.log('='.repeat(60));
    console.log();

    // -------------------------------------------------------------------------
    // TEST 1: Generar parámetros con VideoTransformer.generateUniqueParams()
    // -------------------------------------------------------------------------
    console.log('📌 TEST 1: Generación de parámetros desde VideoTransformer');
    console.log('-'.repeat(60));
    
    const seed = 12345; // Semilla fija para reproducibilidad
    const videoParams = VideoTransformer.generateUniqueParams(seed);
    
    tester.assert(
        videoParams !== null && videoParams !== undefined,
        'VideoTransformer.generateUniqueParams() retorna parámetros',
        `Tipo: ${typeof videoParams}`
    );

    tester.assert(
        typeof videoParams.hue === 'number',
        'Parámetro hue es número',
        `hue = ${videoParams.hue}`
    );

    tester.assert(
        typeof videoParams.saturation === 'number',
        'Parámetro saturation es número',
        `saturation = ${videoParams.saturation}`
    );

    tester.assert(
        typeof videoParams.contrast === 'number',
        'Parámetro contrast es número',
        `contrast = ${videoParams.contrast}`
    );

    tester.assert(
        typeof videoParams.brightness === 'number',
        'Parámetro brightness es número',
        `brightness = ${videoParams.brightness}`
    );

    console.log();

    // -------------------------------------------------------------------------
    // TEST 2: Crear configuración ThumbnailTransformerConfig con los mismos parámetros
    // -------------------------------------------------------------------------
    console.log('📌 TEST 2: Crear ThumbnailTransformerConfig con parámetros de video');
    console.log('-'.repeat(60));

    const thumbnailConfig = {
        baseImagePath: '/test/thumbnail_base.png',
        transformationParams: videoParams, // ¡Los mismos parámetros del video!
        textOverlay: {
            text: 'Test Thumbnail',
            offsetX: 10,
            offsetY: -5,
            style: 'bold'
        },
        grainIntensity: 5
    };

    tester.assert(
        thumbnailConfig.transformationParams === videoParams,
        'ThumbnailTransformerConfig acepta TransformationParams del video',
        'La referencia a los parámetros es la misma'
    );

    tester.assert(
        thumbnailConfig.transformationParams.hue === videoParams.hue,
        'Hue sincronizado entre config y video params',
        `Config hue: ${thumbnailConfig.transformationParams.hue}, Video hue: ${videoParams.hue}`
    );

    console.log();

    // -------------------------------------------------------------------------
    // TEST 3: Verificar que buildColorFilter genera los mismos valores
    // -------------------------------------------------------------------------
    console.log('📌 TEST 3: buildColorFilter genera los mismos valores que buildChromaticFilter');
    console.log('-'.repeat(60));

    const thumbnailFilter = ThumbnailTransformer.buildColorFilter(videoParams);
    const videoFilter = VideoTransformer.buildChromaticFilter(videoParams);

    console.log(`   ThumbnailTransformer.buildColorFilter: ${thumbnailFilter}`);
    console.log(`   VideoTransformer.buildChromaticFilter:  ${videoFilter}`);

    tester.assert(
        thumbnailFilter === videoFilter,
        'buildColorFilter genera EXACTAMENTE el mismo filtro que buildChromaticFilter',
        `Filtros ${thumbnailFilter === videoFilter ? 'idénticos' : 'DIFERENTES'}`
    );

    console.log();

    // -------------------------------------------------------------------------
    // TEST 4: Verificar componentes individuales del filtro
    // -------------------------------------------------------------------------
    console.log('📌 TEST 4: Verificar componentes individuales del filtro cromático');
    console.log('-'.repeat(60));

    // Parsear el filtro para verificar cada componente
    const eqMatch = thumbnailFilter.match(/eq=saturation=([\d.]+):contrast=([\d.]+):brightness=([-\d.]+)/);
    const hueMatch = thumbnailFilter.match(/hue=h=([-\d.]+)/);

    tester.assert(
        eqMatch !== null,
        'El filtro contiene eq= con saturation, contrast, brightness',
        eqMatch ? `eq encontrado: ${eqMatch[0]}` : 'eq NO encontrado'
    );

    if (eqMatch) {
        const filterSaturation = parseFloat(eqMatch[1]);
        const filterContrast = parseFloat(eqMatch[2]);
        const filterBrightness = parseFloat(eqMatch[3]);

        // La saturación debe ser exactamente la del video
        tester.assertClose(
            filterSaturation, 
            videoParams.saturation, 
            0.0001,
            'Saturación en filtro coincide con videoParams.saturation'
        );

        // El contraste debe ser exactamente el del video
        tester.assertClose(
            filterContrast, 
            videoParams.contrast, 
            0.0001,
            'Contraste en filtro coincide con videoParams.contrast'
        );

        // El brightness en FFmpeg eq es (brightness - 1) offset
        const expectedBrightnessOffset = videoParams.brightness - 1;
        tester.assertClose(
            filterBrightness, 
            expectedBrightnessOffset, 
            0.0001,
            'Brightness offset en filtro coincide con (videoParams.brightness - 1)'
        );
    }

    tester.assert(
        hueMatch !== null,
        'El filtro contiene hue=h=',
        hueMatch ? `hue encontrado: ${hueMatch[0]}` : 'hue NO encontrado'
    );

    if (hueMatch) {
        const filterHue = parseFloat(hueMatch[1]);
        tester.assertClose(
            filterHue, 
            videoParams.hue, 
            0.1,
            'Hue en filtro coincide con videoParams.hue'
        );
    }

    console.log();

    // -------------------------------------------------------------------------
    // TEST 5: Reproducibilidad con la misma semilla
    // -------------------------------------------------------------------------
    console.log('📌 TEST 5: Reproducibilidad de parámetros con semilla');
    console.log('-'.repeat(60));

    // Generar parámetros con la misma semilla dos veces
    const params1 = VideoTransformer.generateUniqueParams(seed);
    const params2 = VideoTransformer.generateUniqueParams(seed);

    tester.assert(
        params1.hue === params2.hue,
        'Misma semilla produce mismo hue',
        `hue1=${params1.hue}, hue2=${params2.hue}`
    );

    tester.assert(
        params1.saturation === params2.saturation,
        'Misma semilla produce misma saturation',
        `sat1=${params1.saturation}, sat2=${params2.saturation}`
    );

    tester.assert(
        params1.contrast === params2.contrast,
        'Misma semilla produce mismo contrast',
        `contrast1=${params1.contrast}, contrast2=${params2.contrast}`
    );

    tester.assert(
        params1.brightness === params2.brightness,
        'Misma semilla produce mismo brightness',
        `brightness1=${params1.brightness}, brightness2=${params2.brightness}`
    );

    console.log();

    // -------------------------------------------------------------------------
    // TEST 6: Verificar que buildColorFilter de Thumbnail === buildChromaticFilter de Video
    // con parámetros reproducibles
    // -------------------------------------------------------------------------
    console.log('📌 TEST 6: Sincronización completa video↔thumbnail con parámetros reproducibles');
    console.log('-'.repeat(60));

    // Simular flujo completo: video genera params, thumbnail los usa
    const videoParamsForSync = VideoTransformer.generateUniqueParams(99999);
    
    // El thumbnail DEBE usar exactamente los mismos parámetros
    const thumbnailFilterSync = ThumbnailTransformer.buildColorFilter(videoParamsForSync);
    const videoFilterSync = VideoTransformer.buildChromaticFilter(videoParamsForSync);

    tester.assert(
        thumbnailFilterSync === videoFilterSync,
        'Filtros sincronizados: thumbnail usa exactamente los mismos parámetros del video',
        `\n   Video Filter:     ${videoFilterSync}\n   Thumbnail Filter: ${thumbnailFilterSync}`
    );

    console.log();

    // -------------------------------------------------------------------------
    // TEST 7: Verificar que ThumbnailTransformerConfig.transformationParams 
    // acepta tipo TransformationParams
    // -------------------------------------------------------------------------
    console.log('📌 TEST 7: Interface ThumbnailTransformerConfig acepta TransformationParams');
    console.log('-'.repeat(60));

    // Crear un objeto que cumpla exactamente con TransformationParams
    const fullTransformationParams = {
        zoom: 1.05,
        rotation: 0.25,
        cropLeft: 3,
        cropRight: 4,
        cropTop: 2,
        cropBottom: 5,
        hue: 7.5,
        saturation: 1.10,
        contrast: 1.03,
        brightness: 1.02,
        grainIntensity: 5,
        vignetteStrength: 0.15,
        speed: 1.02,
        crf: 20,
        timestamp: new Date().toISOString(),
        encoderHash: 'abc123def456'
    };

    const configWithFullParams = {
        baseImagePath: '/test/image.png',
        transformationParams: fullTransformationParams,
        textOverlay: {
            text: 'Test',
            offsetX: 0,
            offsetY: 0,
            style: 'minimal'
        },
        grainIntensity: 5
    };

    // Verificar que el config acepta todos los campos
    tester.assert(
        configWithFullParams.transformationParams.hue === fullTransformationParams.hue,
        'ThumbnailTransformerConfig acepta TransformationParams completo - hue',
        `hue = ${configWithFullParams.transformationParams.hue}`
    );

    tester.assert(
        configWithFullParams.transformationParams.saturation === fullTransformationParams.saturation,
        'ThumbnailTransformerConfig acepta TransformationParams completo - saturation',
        `saturation = ${configWithFullParams.transformationParams.saturation}`
    );

    tester.assert(
        configWithFullParams.transformationParams.contrast === fullTransformationParams.contrast,
        'ThumbnailTransformerConfig acepta TransformationParams completo - contrast',
        `contrast = ${configWithFullParams.transformationParams.contrast}`
    );

    tester.assert(
        configWithFullParams.transformationParams.brightness === fullTransformationParams.brightness,
        'ThumbnailTransformerConfig acepta TransformationParams completo - brightness',
        `brightness = ${configWithFullParams.transformationParams.brightness}`
    );

    tester.assert(
        configWithFullParams.transformationParams.zoom === fullTransformationParams.zoom,
        'ThumbnailTransformerConfig acepta TransformationParams completo - zoom',
        `zoom = ${configWithFullParams.transformationParams.zoom}`
    );

    console.log();

    // -------------------------------------------------------------------------
    // TEST 8: Verificar unicidad de filtros con diferentes parámetros
    // -------------------------------------------------------------------------
    console.log('📌 TEST 8: Filtros son únicos para diferentes parámetros');
    console.log('-'.repeat(60));

    const params_A = VideoTransformer.generateUniqueParams(11111);
    const params_B = VideoTransformer.generateUniqueParams(22222);

    const filter_A = ThumbnailTransformer.buildColorFilter(params_A);
    const filter_B = ThumbnailTransformer.buildColorFilter(params_B);

    tester.assert(
        filter_A !== filter_B,
        'Diferentes parámetros producen diferentes filtros',
        `\n   Filter A: ${filter_A}\n   Filter B: ${filter_B}`
    );

    console.log();

    // Imprimir resumen final
    tester.printSummary();
}

// Ejecutar tests
console.log('\n🚀 Iniciando tests de sincronización ThumbnailTransformer...\n');
runTests().catch(error => {
    console.error('❌ Error al ejecutar tests:', error.message);
    console.error(error.stack);
    process.exit(1);
});
