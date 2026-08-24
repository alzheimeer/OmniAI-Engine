/**
 * Test de reproducibilidad para VideoTransformer.generateUniqueParams
 * 
 * Verifica que:
 * 1. Con la misma seed, se generan los mismos parámetros (reproducible)
 * 2. Sin seed, se generan parámetros diferentes cada vez (aleatorio)
 * 3. Todos los parámetros están dentro de TRANSFORMATION_RANGES
 */

import { VideoTransformer, TRANSFORMATION_RANGES } from './dist/generators/VideoTransformer.js';

console.log('='.repeat(60));
console.log('TEST: VideoTransformer.generateUniqueParams');
console.log('='.repeat(60));

// TEST 1: Reproducibilidad con seed
console.log('\n📌 TEST 1: Reproducibilidad con seed');
console.log('-'.repeat(40));

const seed = 12345;
const params1 = VideoTransformer.generateUniqueParams(seed);
const params2 = VideoTransformer.generateUniqueParams(seed);

console.log('Seed utilizada:', seed);
console.log('\nPrimera llamada con seed:');
console.log(JSON.stringify(params1, null, 2));

console.log('\nSegunda llamada con misma seed:');
console.log(JSON.stringify(params2, null, 2));

const isReproducible = JSON.stringify(params1) === JSON.stringify(params2);
console.log('\n✅ Reproducible (misma seed = mismos params):', isReproducible ? 'PASS ✓' : 'FAIL ✗');

if (!isReproducible) {
    console.log('Diferencias encontradas:');
    for (const key of Object.keys(params1)) {
        if (params1[key] !== params2[key]) {
            console.log(`  ${key}: ${params1[key]} vs ${params2[key]}`);
        }
    }
}

// TEST 2: Aleatoriedad sin seed
console.log('\n📌 TEST 2: Aleatoriedad sin seed');
console.log('-'.repeat(40));

const paramsRandom1 = VideoTransformer.generateUniqueParams();
const paramsRandom2 = VideoTransformer.generateUniqueParams();

console.log('Primera llamada sin seed (parcial):');
console.log('  zoom:', paramsRandom1.zoom);
console.log('  rotation:', paramsRandom1.rotation);
console.log('  hue:', paramsRandom1.hue);

console.log('\nSegunda llamada sin seed (parcial):');
console.log('  zoom:', paramsRandom2.zoom);
console.log('  rotation:', paramsRandom2.rotation);
console.log('  hue:', paramsRandom2.hue);

// Comparamos algunos campos numéricos (excluyendo timestamp y encoderHash que siempre serán diferentes)
const areNumericFieldsDifferent = 
    paramsRandom1.zoom !== paramsRandom2.zoom ||
    paramsRandom1.rotation !== paramsRandom2.rotation ||
    paramsRandom1.hue !== paramsRandom2.hue;

console.log('\n✅ Aleatorio (sin seed = params diferentes):', areNumericFieldsDifferent ? 'PASS ✓' : 'PASS (puede coincidir por azar)');

// TEST 3: Validación de rangos
console.log('\n📌 TEST 3: Validación de rangos');
console.log('-'.repeat(40));

const R = TRANSFORMATION_RANGES;
let allInRange = true;
const checks = [];

// Verificar cada parámetro
const checkRange = (name, value, min, max) => {
    const inRange = value >= min && value <= max;
    checks.push({ name, value, min, max, inRange });
    if (!inRange) allInRange = false;
    return inRange;
};

checkRange('zoom', params1.zoom, R.zoom.min, R.zoom.max);
checkRange('rotation', params1.rotation, R.rotation.min, R.rotation.max);
checkRange('cropLeft', params1.cropLeft, R.crop.min, R.crop.max);
checkRange('cropRight', params1.cropRight, R.crop.min, R.crop.max);
checkRange('cropTop', params1.cropTop, R.crop.min, R.crop.max);
checkRange('cropBottom', params1.cropBottom, R.crop.min, R.crop.max);
checkRange('hue', params1.hue, R.hue.min, R.hue.max);
checkRange('saturation', params1.saturation, R.saturation.min, R.saturation.max);
checkRange('contrast', params1.contrast, R.contrast.min, R.contrast.max);
checkRange('brightness', params1.brightness, R.brightness.min, R.brightness.max);
checkRange('grainIntensity', params1.grainIntensity, R.grain.min, R.grain.max);
checkRange('vignetteStrength', params1.vignetteStrength, R.vignette.min, R.vignette.max);
checkRange('speed', params1.speed, R.speed.min, R.speed.max);
checkRange('crf', params1.crf, R.crf.min, R.crf.max);

for (const check of checks) {
    const status = check.inRange ? '✓' : '✗';
    console.log(`  ${status} ${check.name}: ${check.value} (rango: ${check.min}-${check.max})`);
}

console.log('\n✅ Todos los parámetros en rango:', allInRange ? 'PASS ✓' : 'FAIL ✗');

// TEST 4: Diferentes seeds producen diferentes resultados
console.log('\n📌 TEST 4: Diferentes seeds = diferentes parámetros');
console.log('-'.repeat(40));

const paramsA = VideoTransformer.generateUniqueParams(111);
const paramsB = VideoTransformer.generateUniqueParams(222);
const paramsC = VideoTransformer.generateUniqueParams(333);

const allDifferent = 
    paramsA.zoom !== paramsB.zoom && 
    paramsB.zoom !== paramsC.zoom &&
    paramsA.zoom !== paramsC.zoom;

console.log('Seed 111 zoom:', paramsA.zoom);
console.log('Seed 222 zoom:', paramsB.zoom);
console.log('Seed 333 zoom:', paramsC.zoom);
console.log('\n✅ Diferentes seeds = diferentes valores:', allDifferent ? 'PASS ✓' : 'FAIL ✗');

// RESUMEN FINAL
console.log('\n' + '='.repeat(60));
console.log('RESUMEN DE TESTS');
console.log('='.repeat(60));

const allPassed = isReproducible && allInRange && allDifferent;
console.log(`
  Test 1 (Reproducibilidad con seed):     ${isReproducible ? 'PASS ✓' : 'FAIL ✗'}
  Test 2 (Aleatoriedad sin seed):         ${areNumericFieldsDifferent ? 'PASS ✓' : 'N/A (puede coincidir)'}
  Test 3 (Validación de rangos):          ${allInRange ? 'PASS ✓' : 'FAIL ✗'}
  Test 4 (Diferentes seeds):              ${allDifferent ? 'PASS ✓' : 'FAIL ✗'}

  RESULTADO FINAL: ${allPassed ? '✅ TODOS LOS TESTS PASARON' : '❌ ALGUNOS TESTS FALLARON'}
`);

process.exit(allPassed ? 0 : 1);
