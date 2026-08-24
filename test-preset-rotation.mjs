/**
 * Test: Presets de Edición Rotan Correctamente Sin Repetición Consecutiva
 * 
 * Verifica que selectRandomPreset() evita repetición en los últimos 3 videos
 * según REQ-1.2.1: Sistema de estilos de edición aleatorios con 5+ presets diferentes
 * 
 * Este test valida:
 * 1. selectRandomPreset() no repite el mismo preset en 3 llamadas consecutivas
 * 2. clearRecentPresets() reinicia correctamente el historial
 * 3. getRecentPresets() retorna el historial correcto
 */

import {
    selectRandomPreset,
    clearRecentPresets,
    getRecentPresets,
    ALL_PRESETS,
    getAllPresetNames
} from './dist/generators/EditingStylePresets.js';

// ============================================================
// UTILIDADES DE TEST
// ============================================================

let testsRun = 0;
let testsPassed = 0;

function assert(condition, message) {
    testsRun++;
    if (condition) {
        testsPassed++;
        console.log(`  ✅ ${message}`);
    } else {
        console.log(`  ❌ ${message}`);
    }
}

function assertEqual(actual, expected, message) {
    testsRun++;
    if (actual === expected) {
        testsPassed++;
        console.log(`  ✅ ${message}`);
    } else {
        console.log(`  ❌ ${message} (esperado: ${expected}, obtenido: ${actual})`);
    }
}

function assertArrayEqual(actual, expected, message) {
    testsRun++;
    const isEqual = actual.length === expected.length && 
                    actual.every((val, idx) => val === expected[idx]);
    if (isEqual) {
        testsPassed++;
        console.log(`  ✅ ${message}`);
    } else {
        console.log(`  ❌ ${message} (esperado: [${expected}], obtenido: [${actual}])`);
    }
}

// ============================================================
// TESTS
// ============================================================

console.log('\n🧪 Test: Presets de Edición Rotan Correctamente\n');
console.log('='.repeat(60));

// Test 1: clearRecentPresets() reinicia el historial
console.log('\n📋 Test 1: clearRecentPresets() reinicia el historial');
clearRecentPresets();
const emptyHistory = getRecentPresets();
assertArrayEqual(emptyHistory, [], 'Historial vacío después de clearRecentPresets()');

// Test 2: getRecentPresets() retorna el historial correcto después de selecciones
console.log('\n📋 Test 2: getRecentPresets() retorna historial correcto');
clearRecentPresets();

const preset1 = selectRandomPreset();
const history1 = getRecentPresets();
assertEqual(history1.length, 1, 'Historial tiene 1 elemento después de 1 selección');
assertEqual(history1[0], preset1.name, 'Historial contiene el preset seleccionado');

const preset2 = selectRandomPreset();
const history2 = getRecentPresets();
assertEqual(history2.length, 2, 'Historial tiene 2 elementos después de 2 selecciones');

const preset3 = selectRandomPreset();
const history3 = getRecentPresets();
assertEqual(history3.length, 3, 'Historial tiene 3 elementos después de 3 selecciones');

// Test 3: El historial se mantiene en máximo 3 elementos (RECENT_HISTORY_SIZE)
console.log('\n📋 Test 3: Historial se mantiene en máximo 3 elementos');
clearRecentPresets();

for (let i = 0; i < 5; i++) {
    selectRandomPreset();
}

const historyAfter5 = getRecentPresets();
assertEqual(historyAfter5.length, 3, 'Historial no excede 3 elementos después de 5 selecciones');

// Test 4: NO se repite el mismo preset en 3 llamadas consecutivas
console.log('\n📋 Test 4: No repetición del mismo preset en 3 llamadas consecutivas');
clearRecentPresets();

// Realizar múltiples series de 3 selecciones y verificar que no hay repetición
let noRepetitionViolation = true;
const iterations = 20; // Suficientes iteraciones para detectar patrones

for (let iteration = 0; iteration < iterations; iteration++) {
    clearRecentPresets();
    
    const selections = [];
    for (let i = 0; i < 3; i++) {
        const preset = selectRandomPreset();
        selections.push(preset.name);
    }
    
    // Verificar que los 3 presets son diferentes entre sí
    const uniquePresets = new Set(selections);
    if (uniquePresets.size !== 3) {
        noRepetitionViolation = false;
        console.log(`    ⚠️ Iteración ${iteration + 1}: Repetición detectada en [${selections.join(', ')}]`);
        break;
    }
}

assert(noRepetitionViolation, `No hay repetición en ${iterations} series de 3 selecciones consecutivas`);

// Test 5: Verificar que selectRandomPreset evita los presets recientes
console.log('\n📋 Test 5: selectRandomPreset evita presets del historial reciente');
clearRecentPresets();

const presetsUsed = [];
for (let i = 0; i < 10; i++) {
    const preset = selectRandomPreset();
    presetsUsed.push(preset.name);
}

// Para cada selección (excepto las primeras 3), verificar que no está en las 3 anteriores
let noRecentRepetition = true;
for (let i = 3; i < presetsUsed.length; i++) {
    const current = presetsUsed[i];
    const recentThree = presetsUsed.slice(i - 3, i);
    
    if (recentThree.includes(current)) {
        noRecentRepetition = false;
        console.log(`    ⚠️ Preset "${current}" repetido en las últimas 3 selecciones en posición ${i}`);
        break;
    }
}

assert(noRecentRepetition, 'Ningún preset se repite en las 3 selecciones anteriores');

// Test 6: Verificar que hay suficientes presets (5+)
console.log('\n📋 Test 6: Verificar que hay 5+ presets disponibles');
const allPresetNames = getAllPresetNames();
assert(allPresetNames.length >= 5, `Hay ${allPresetNames.length} presets disponibles (mínimo requerido: 5)`);
assert(ALL_PRESETS.length >= 5, `ALL_PRESETS contiene ${ALL_PRESETS.length} presets (mínimo requerido: 5)`);

// Test 7: Verificar que clearRecentPresets permite reiniciar y usar cualquier preset
console.log('\n📋 Test 7: clearRecentPresets permite seleccionar cualquier preset nuevamente');
clearRecentPresets();

// Seleccionar 3 presets específicos primero
const firstThree = [];
for (let i = 0; i < 3; i++) {
    const preset = selectRandomPreset();
    firstThree.push(preset.name);
}

// Limpiar historial
clearRecentPresets();

// Verificar que el historial está vacío
const clearedHistory = getRecentPresets();
assertEqual(clearedHistory.length, 0, 'Historial vacío después de limpiar');

// Ahora cualquier preset debería poder ser seleccionado
const afterClearPreset = selectRandomPreset();
assert(afterClearPreset !== null && afterClearPreset !== undefined, 'Puede seleccionar preset después de limpiar historial');

// Test 8: Verificar comportamiento con múltiples llamadas consecutivas
console.log('\n📋 Test 8: Comportamiento con 20 llamadas consecutivas');
clearRecentPresets();

const consecutiveSelections = [];
for (let i = 0; i < 20; i++) {
    const preset = selectRandomPreset();
    consecutiveSelections.push(preset.name);
}

// Contar frecuencias para verificar distribución
const frequencies = {};
consecutiveSelections.forEach(name => {
    frequencies[name] = (frequencies[name] || 0) + 1;
});

const allPresetsUsed = Object.keys(frequencies).length;
assert(allPresetsUsed >= 3, `Se usaron ${allPresetsUsed} presets diferentes en 20 selecciones`);

// Verificar que ningún preset domina excesivamente (máximo ~50% de las selecciones)
const maxFreq = Math.max(...Object.values(frequencies));
assert(maxFreq <= 10, `Frecuencia máxima de un preset es ${maxFreq} (distribución razonable)`);

console.log('\n  📊 Distribución de presets en 20 selecciones:');
Object.entries(frequencies)
    .sort((a, b) => b[1] - a[1])
    .forEach(([name, count]) => {
        const bar = '█'.repeat(count);
        console.log(`     ${name.padEnd(15)} ${bar} (${count})`);
    });

// Test 9: Verificar que todos los presets tienen estructura válida
console.log('\n📋 Test 9: Todos los presets tienen estructura válida');
let allPresetsValid = true;
for (const preset of ALL_PRESETS) {
    if (!preset.name || !preset.description || !preset.cutInterval || 
        !preset.transitionTypes || !preset.colorAdjustments || !preset.textPosition) {
        allPresetsValid = false;
        console.log(`    ⚠️ Preset inválido: ${preset.name || 'sin nombre'}`);
    }
}
assert(allPresetsValid, 'Todos los presets tienen estructura válida');

// ============================================================
// RESUMEN
// ============================================================

console.log('\n' + '='.repeat(60));
console.log('\n📊 RESUMEN DE TESTS');
console.log('='.repeat(60));
console.log(`\n  Tests ejecutados: ${testsRun}`);
console.log(`  Tests pasados:    ${testsPassed}`);
console.log(`  Tests fallidos:   ${testsRun - testsPassed}`);

if (testsPassed === testsRun) {
    console.log('\n✅ ¡TODOS LOS TESTS PASARON!\n');
    console.log('La función selectRandomPreset() evita correctamente la repetición');
    console.log('en los últimos 3 videos según REQ-1.2.1.\n');
    process.exit(0);
} else {
    console.log('\n❌ ALGUNOS TESTS FALLARON\n');
    process.exit(1);
}
