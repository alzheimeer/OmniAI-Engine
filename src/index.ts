import { AutonomousOrchestrator } from './generators/AutonomousOrchestrator';
import { startBlogServer } from './server';
import dotenv from 'dotenv';

dotenv.config();

console.log('==================================================');
console.log('🌟 INICIANDO OMNIAI ENGINE - MODO AUTÓNOMO 🌟');
console.log('==================================================');

// Arrancamos el servidor de lectura del blog
startBlogServer();

import { WorkerManager } from './queue/WorkerManager';

// Arrancamos el Worker de BullMQ para procesar tareas asíncronas de FFmpeg
WorkerManager.start();

// Arrancamos el cerebro principal de cronjobs
AutonomousOrchestrator.start();

// Mantener el proceso vivo
process.stdin.resume();
