/**
 * test-no-repetition.mjs - Test de validación de no repetición de estructuras narrativas
 * 
 * Este test valida que el sistema ScriptStructureRandomizer NUNCA permite
 * 3 videos consecutivos con la misma estructura narrativa.
 * 
 * REQ-2.7.5: Detectar estructura repetitiva (si 3 videos seguidos usan misma estructura, forzar cambio)
 * 
 * @see src/generators/ScriptStructureRandomizer.ts
 */

import { ScriptStructureRandomizer, ALL_STRUCTURES } from './dist/generators/ScriptStructureRandomizer.js';

// ===== CONFIGURACIÓN DEL TEST =====
const NUM_VIDEOS_TO_SIMULATE = 1000;
const MAX_CONSECUTIVE_ALLOWED = 2; // Máximo 2 consecutivos permitidos (3 = falla)
const ALL_STRUCTURE_TYPES = [...ALL_STRUCTURES];

// ===== COLORES PARA CONSOLA =====
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    bold: '\x1b[1m'
};

/**
 * Imprime encabezado del test
 */
function printHeader() {
    console.log('\n' + colors.bold + colors.cyan + '═'.repeat(70) + colors.reset);
    console.log(colors.bold + colors.cyan + '  TEST: Validación de No Repetición de Estructuras Narrativas' + colors.reset);
    console.log(colors.bold + colors.cyan + '═'.repeat(70) + colors.reset);
    console.log(`\n${colors.blue}Configuración:${colors.reset}`);
    console.log(`  • Videos a simular: ${colors.yellow}${NUM_VIDEOS_TO_SIMULATE}${colors.reset}`);
    console.log(`  • Máximo consecutivos permitidos: ${colors.yellow}${MAX_CONSECUTIVE_ALLOWED}${colors.reset}`);
    console.log(`  • Estructuras disponibles: ${colors.yellow}${ALL_STRUCTURE_TYPES.length}${colors.reset}`);
    console.log(`  • Estructuras: ${colors.magenta}${ALL_STRUCTURE_TYPES.join(', ')}${colors.reset}\n`);
}

/**
 * Simula la producción de N videos y retorna el historial de estructuras
 * @param {number} numVideos - Número de videos a simular
 * @returns {{ structures: string[], violations: { index: number, structure: string }[] }}
 */
function simulateVideoProduction(numVideos) {
    const structures = [];
    const violations = [];
    
    for (let i = 0; i < numVideos; i++) {
        // selectStructure recibe las últimas estructuras para evitar repetición
        // Pasamos las últimas 2 estructuras (máximo que necesita revisar)
        const recentStructures = structures.slice(-2);
        const selectedStructure = ScriptStructureRandomizer.selectStructure(recentStructures);
        
        structures.push(selectedStructure);
        
        // Verificar si hay violación (3 o más consecutivas iguales)
        if (structures.length >= 3) {
            const last3 = structures.slice(-3);
            if (last3[0] === last3[1] && last3[1] === last3[2]) {
                violations.push({
                    index: i,
                    structure: selectedStructure
                });
            }
        }
    }
    
    return { structures, violations };
}

/**
 * Cuenta la distribución de estructuras usadas
 * @param {string[]} structures - Array de estructuras usadas
 * @returns {Map<string, number>}
 */
function countDistribution(structures) {
    const counts = new Map();
    
    for (const struct of ALL_STRUCTURE_TYPES) {
        counts.set(struct, 0);
    }
    
    for (const struct of structures) {
        counts.set(struct, (counts.get(struct) || 0) + 1);
    }
    
    return counts;
}

/**
 * Encuentra la secuencia más larga de repeticiones consecutivas
 * @param {string[]} structures - Array de estructuras
 * @returns {{ structure: string, count: number, startIndex: number }}
 */
function findLongestConsecutive(structures) {
    let maxCount = 1;
    let maxStructure = structures[0];
    let maxStartIndex = 0;
    
    let currentCount = 1;
    let currentStructure = structures[0];
    let currentStartIndex = 0;
    
    for (let i = 1; i < structures.length; i++) {
        if (structures[i] === currentStructure) {
            currentCount++;
            if (currentCount > maxCount) {
                maxCount = currentCount;
                maxStructure = currentStructure;
                maxStartIndex = currentStartIndex;
            }
        } else {
            currentStructure = structures[i];
            currentCount = 1;
            currentStartIndex = i;
        }
    }
    
    return { structure: maxStructure, count: maxCount, startIndex: maxStartIndex };
}

/**
 * Verifica que todas las estructuras se usen al menos una vez
 * @param {Map<string, number>} distribution - Distribución de estructuras
 * @returns {{ allUsed: boolean, unusedStructures: string[] }}
 */
function verifyAllStructuresUsed(distribution) {
    const unusedStructures = [];
    
    for (const [structure, count] of distribution) {
        if (count === 0) {
            unusedStructures.push(structure);
        }
    }
    
    return {
        allUsed: unusedStructures.length === 0,
        unusedStructures
    };
}

/**
 * Imprime estadísticas de distribución
 * @param {Map<string, number>} distribution - Distribución de estructuras
 * @param {number} total - Total de videos
 */
function printDistributionStats(distribution, total) {
    console.log(`\n${colors.blue}Estadísticas de Distribución:${colors.reset}`);
    console.log('─'.repeat(50));
    
    // Ordenar por cantidad (descendente)
    const sorted = [...distribution.entries()].sort((a, b) => b[1] - a[1]);
    
    // Calcular distribución esperada (uniforme)
    const expectedPercent = (100 / ALL_STRUCTURE_TYPES.length).toFixed(1);
    
    console.log(`  ${'Estructura'.padEnd(20)} ${'Cantidad'.padStart(10)} ${'Porcentaje'.padStart(12)} ${'Barra'.padStart(25)}`);
    console.log('  ' + '─'.repeat(67));
    
    for (const [structure, count] of sorted) {
        const percent = ((count / total) * 100).toFixed(1);
        const barLength = Math.round((count / total) * 40);
        const bar = '█'.repeat(barLength) + '░'.repeat(40 - barLength);
        
        // Color basado en desviación de la distribución esperada
        const deviation = Math.abs(parseFloat(percent) - parseFloat(expectedPercent));
        let color = colors.green;
        if (deviation > 5) color = colors.yellow;
        if (deviation > 10) color = colors.red;
        
        console.log(`  ${structure.padEnd(20)} ${count.toString().padStart(10)} ${color}${(percent + '%').padStart(12)}${colors.reset} ${bar}`);
    }
    
    console.log('  ' + '─'.repeat(67));
    console.log(`  ${'Distribución esperada (uniforme):'.padEnd(33)} ${expectedPercent}% por estructura`);
}

/**
 * Ejecuta el test principal
 */
async function runTest() {
    printHeader();
    
    console.log(`${colors.bold}Ejecutando simulación de ${NUM_VIDEOS_TO_SIMULATE} videos...${colors.reset}\n`);
    
    const startTime = Date.now();
    const { structures, violations } = simulateVideoProduction(NUM_VIDEOS_TO_SIMULATE);
    const endTime = Date.now();
    
    const distribution = countDistribution(structures);
    const longestConsecutive = findLongestConsecutive(structures);
    const { allUsed, unusedStructures } = verifyAllStructuresUsed(distribution);
    
    // ===== RESULTADOS =====
    console.log(`${colors.blue}Resultados del Test:${colors.reset}`);
    console.log('─'.repeat(50));
    
    // Test 1: No repetición de 3 consecutivas
    const test1Passed = violations.length === 0;
    console.log(`\n  ${colors.bold}Test 1: No repetir estructura 3 veces consecutivas${colors.reset}`);
    if (test1Passed) {
        console.log(`  ${colors.green}✓ PASADO${colors.reset} - No se encontraron violaciones`);
    } else {
        console.log(`  ${colors.red}✗ FALLIDO${colors.reset} - Se encontraron ${violations.length} violaciones:`);
        for (const v of violations.slice(0, 5)) { // Mostrar máximo 5
            console.log(`    - Video #${v.index + 1}: estructura "${v.structure}" repetida 3 veces`);
        }
        if (violations.length > 5) {
            console.log(`    ... y ${violations.length - 5} más`);
        }
    }
    
    // Test 2: Máximo de repeticiones consecutivas
    const test2Passed = longestConsecutive.count <= MAX_CONSECUTIVE_ALLOWED;
    console.log(`\n  ${colors.bold}Test 2: Máximo de repeticiones consecutivas ≤ ${MAX_CONSECUTIVE_ALLOWED}${colors.reset}`);
    if (test2Passed) {
        console.log(`  ${colors.green}✓ PASADO${colors.reset} - Máximo encontrado: ${longestConsecutive.count} (${longestConsecutive.structure})`);
    } else {
        console.log(`  ${colors.red}✗ FALLIDO${colors.reset} - Máximo encontrado: ${longestConsecutive.count}`);
        console.log(`    - Estructura: "${longestConsecutive.structure}" en video #${longestConsecutive.startIndex + 1}`);
    }
    
    // Test 3: Todas las estructuras se usan
    const test3Passed = allUsed;
    console.log(`\n  ${colors.bold}Test 3: Todas las 6 estructuras se usan eventualmente${colors.reset}`);
    if (test3Passed) {
        console.log(`  ${colors.green}✓ PASADO${colors.reset} - Todas las ${ALL_STRUCTURE_TYPES.length} estructuras fueron utilizadas`);
    } else {
        console.log(`  ${colors.red}✗ FALLIDO${colors.reset} - Estructuras no usadas: ${unusedStructures.join(', ')}`);
    }
    
    // Estadísticas de distribución
    printDistributionStats(distribution, structures.length);
    
    // Información adicional
    console.log(`\n${colors.blue}Información Adicional:${colors.reset}`);
    console.log('─'.repeat(50));
    console.log(`  • Tiempo de ejecución: ${colors.yellow}${endTime - startTime}ms${colors.reset}`);
    console.log(`  • Secuencia más larga: ${colors.yellow}${longestConsecutive.count}${colors.reset} videos con "${longestConsecutive.structure}"`);
    console.log(`  • Ubicación: videos #${longestConsecutive.startIndex + 1} al #${longestConsecutive.startIndex + longestConsecutive.count}`);
    
    // Muestra de primeros 20 videos
    console.log(`\n${colors.blue}Muestra de Primeros 20 Videos:${colors.reset}`);
    console.log('─'.repeat(50));
    const first20 = structures.slice(0, 20);
    let prevStruct = null;
    let consecutiveCount = 0;
    
    for (let i = 0; i < first20.length; i++) {
        const struct = first20[i];
        if (struct === prevStruct) {
            consecutiveCount++;
        } else {
            consecutiveCount = 1;
            prevStruct = struct;
        }
        
        let marker = '';
        if (consecutiveCount === 2) marker = ` ${colors.yellow}(2 consecutivos)${colors.reset}`;
        if (consecutiveCount >= 3) marker = ` ${colors.red}(¡VIOLACIÓN: ${consecutiveCount} consecutivos!)${colors.reset}`;
        
        console.log(`  Video #${(i + 1).toString().padStart(2)}: ${struct.padEnd(15)}${marker}`);
    }
    
    // ===== RESULTADO FINAL =====
    console.log('\n' + '═'.repeat(70));
    const allTestsPassed = test1Passed && test2Passed && test3Passed;
    
    if (allTestsPassed) {
        console.log(`${colors.bold}${colors.green}  ✓ TODOS LOS TESTS PASARON${colors.reset}`);
        console.log(`${colors.green}  El sistema garantiza que NUNCA se repite una estructura 3 veces consecutivas.${colors.reset}`);
    } else {
        console.log(`${colors.bold}${colors.red}  ✗ ALGUNOS TESTS FALLARON${colors.reset}`);
        const failed = [];
        if (!test1Passed) failed.push('No repetición');
        if (!test2Passed) failed.push('Máximo consecutivos');
        if (!test3Passed) failed.push('Uso de todas las estructuras');
        console.log(`${colors.red}  Tests fallidos: ${failed.join(', ')}${colors.reset}`);
    }
    
    console.log('═'.repeat(70) + '\n');
    
    // Exit code basado en resultado
    process.exit(allTestsPassed ? 0 : 1);
}

// ===== EJECUCIÓN =====
runTest().catch(error => {
    console.error(`${colors.red}Error ejecutando el test:${colors.reset}`, error);
    process.exit(1);
});
