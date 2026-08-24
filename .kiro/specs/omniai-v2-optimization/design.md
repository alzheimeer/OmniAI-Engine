# Technical Design: OmniAI-Engine V2 - Optimización Integral

## Overview

Este documento detalla el diseño técnico para la optimización integral del motor OmniAI-Engine V2, enfocado en:

1. **Anti-detección completa** (video + thumbnails + música)
2. **Humanización profunda** con variabilidad estructural narrativa
3. **Validación de monetización** antes de escalar
4. **Expansión multiplataforma** controlada por gates

**Deployment:** Local (Node.js directo) - Docker PAUSADO
**Stack:** TypeScript, FFmpeg, BullMQ, SQLite, Winston, Google Cloud TTS

---

## 🏆 Las 8 Reglas de Oro (INMUTABLES)

| # | Regla | Justificación |
|---|-------|---------------|
| 1 | **NO crear canal 3 hasta que canal 1 o 2 esté monetizado (YPP aprobado)** | Evita dispersión de recursos sin validar modelo |
| 2 | **NO expandir a IG/TikTok hasta que YouTube pague el primer dólar** | Monetización primero, alcance después |
| 3 | **NO usar la misma firma de producción en múltiples canales** | Evita detección cruzada por YouTube |
| 4 | **NO automatizar 100% sin supervisión humana en el bucle** | Revisión manual antes de publicar |
| 5 | **SIEMPRE aplicar transformaciones a videos, thumbnails Y música** | Triple capa de anti-detección |
| 6 | **SIEMPRE humanizar guiones con variabilidad estructural** | Evita patrones detectables por algoritmo |
| 7 | **SIEMPRE validar que el contenido pasa revisión manual antes de publicar** | Human-in-the-loop obligatorio |
| 8 | **La publicación de videos debe hacerse en horarios diferentes cada vez, siempre aleatorios** | Evita patrones temporales detectables |

---

## Guardrails de Nicho (INMUTABLE)

- **Canal 1 (NeuroSync AI):** Autismo + Inteligencia Artificial
- **Canal 2 (NeuroTech AI):** Productividad/TDAH + IA para Neurodivergentes

Todos los módulos DEBEN respetar estos nichos sin excepción.

---

## Restricciones Técnicas

- **Deployment:** Local (Node.js directo). Docker PAUSADO.
- **Stack:** TypeScript, FFmpeg, BullMQ, SQLite, Winston, Google Cloud TTS
- **APIs:** DeepSeek (guiones), Google TTS (voz), Pexels (stock footage), YouTube Data API
- **Código:** 100% TypeScript con tipos estrictos, máximo 300 líneas por archivo

---

## 📅 Cronograma de Fases (PRIORIZADO)

| Fase | Semanas | Enfoque | Prioridad |
|------|---------|---------|-----------|
| **1** | 1-2 | Anti-Detección Total (VideoTransformer + ThumbnailTransformer) | ⭐⭐⭐ |
| **2** | 3-4 | Humanización Profunda (ScriptStructureRandomizer, MusicTransformer, SSML Subtitles, AudioMixer) | ⭐⭐⭐ |
| **3** | 5-6 | Infraestructura Básica (Caché, Winston, RetryHandler, Cola BullMQ SIMPLIFICADA) | ⭐⭐ |
| **4** | 7-8 | Validación de Monetización (YPPValidationGate, Analytics, iterar sobre retención) | ⭐⭐⭐ |
| **5** | 9-12 | Expansión Multiplataforma (**SOLO SI YPP está aprobado**) | ⭐⭐ |
| **6** | 13+ | Infraestructura Avanzada (Dead-letter queue, Dashboard HTTP, Circuit Breaker) | ⭐ |

---

## ❌ Eliminaciones por Over-Engineering (Documentadas)

| Componente | Estado | Justificación |
|------------|--------|---------------|
| CircuitBreaker | → Fase 6 | Over-engineering para 2 canales con 30 vistas |
| Dead-letter queue avanzada | → Fase 6 | Solo necesario con volumen alto |
| Dashboard HTTP `/metrics` | → Fase 6 | Telegram es suficiente por ahora |
| TikTokTrendingAudio.ts | ❌ ELIMINADO | No viable sin API oficial de TikTok |
| RenderQueueManager complejo | ✅ Simplificado | 1-2 workers, sin SQLite compleja |

---

## Architecture

### Arquitectura Actual (AS-IS)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ARQUITECTURA ACTUAL                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────┐    ┌─────────────┐    ┌──────────────┐    ┌────────────┐  │
│  │  Cron   │───▶│  SEOAgent   │───▶│ScriptGenerator│───▶│AudioGenerator│
│  │ (node-  │    │ (DeepSeek)  │    │  (DeepSeek)   │    │(Google TTS)│  │
│  │  cron)  │    └─────────────┘    └──────────────┘    └────────────┘  │
│  └─────────┘                                                   │        │
│       │                                                        ▼        │
│       │         ┌─────────────┐    ┌──────────────┐    ┌────────────┐  │
│       │         │  Thumbnail  │◀───│VideoRenderer │◀───│   Pexels   │  │
│       │         │  Generator  │    │  (FFmpeg)    │    │    API     │  │
│       │         └─────────────┘    └──────────────┘    └────────────┘  │
│       │                │                  │                            │
│       ▼                ▼                  ▼                            │
│  ┌─────────┐    ┌─────────────┐                                        │
│  │ BullMQ  │    │  YouTube    │                                        │
│  │  Queue  │    │  Publisher  │                                        │
│  └─────────┘    └─────────────┘                                        │
│                                                                         │
│  PROBLEMAS:                                                            │
│  ❌ Videos de Pexels sin transformación = Content ID match            │
│  ❌ Thumbnails idénticos entre videos = detección de producción masiva│
│  ❌ Música de bancos gratuitos indexada en Content ID                 │
│  ❌ Estructura de guiones repetitiva (siempre Hook→3 puntos→CTA)      │
│  ❌ Voces TTS detectables                                              │
│  ❌ Solo YouTube, sin IG/TikTok                                        │
│  ❌ Sin validación de monetización antes de escalar                   │
└─────────────────────────────────────────────────────────────────────────┘
```

### Arquitectura Propuesta (TO-BE) con 4 Nuevos Componentes

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                         ARQUITECTURA V2 OPTIMIZADA - 4 GAPS CRÍTICOS                     │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│  ┌──────────────────────────── CAPA DE ORQUESTACIÓN ────────────────────────────┐      │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │      │
│  │  │  Scheduler  │  │   Health    │  │   Metrics   │  │    Alert    │         │      │
│  │  │   (Cron)    │  │   Monitor   │  │  Collector  │  │   Manager   │         │      │
│  │  └──────┬──────┘  └─────────────┘  └─────────────┘  └─────────────┘         │      │
│  └─────────┼────────────────────────────────────────────────────────────────────┘      │
│            ▼                                                                            │
│  ┌──────────────────────────── CAPA DE CONTENIDO ───────────────────────────────┐      │
│  │                                                                               │      │
│  │  ┌─────────────┐    ┌─────────────────────┐    ┌─────────────┐              │      │
│  │  │  SEOAgent   │───▶│ ScriptStructure     │───▶│   Script    │              │      │
│  │  │ (DeepSeek)  │    │ Randomizer ⭐ NUEVO │    │  Humanizer  │              │      │
│  │  └─────────────┘    └─────────────────────┘    └──────┬──────┘              │      │
│  │                                                        │                     │      │
│  │         ┌──────────────────────────────────────────────┘                     │      │
│  │         ▼                                                                    │      │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                      │      │
│  │  │   Audio     │───▶│    Audio    │───▶│  Subtitle   │                      │      │
│  │  │  Generator  │    │  Humanizer  │    │  Generator  │                      │      │
│  │  └─────────────┘    └─────────────┘    └──────┬──────┘                      │      │
│  │                                               │                              │      │
│  └───────────────────────────────────────────────┼──────────────────────────────┘      │
│                                                  ▼                                      │
│  ┌──────────────────────────── CAPA DE AUDIO ───────────────────────────────────┐      │
│  │                                                                               │      │
│  │  ┌─────────────┐    ┌─────────────────────┐    ┌─────────────┐              │      │
│  │  │ Music Bank  │───▶│  MusicTransformer   │───▶│  AudioMixer │              │      │
│  │  │ (Royalty-   │    │    ⭐ NUEVO         │    │  (Ducking)  │              │      │
│  │  │    Free)    │    │  Pitch/Tempo/EQ/    │    └─────────────┘              │      │
│  │  └─────────────┘    │  Reverb ±2-3%       │                                 │      │
│  │                     └─────────────────────┘                                  │      │
│  └──────────────────────────────────────────────────────────────────────────────┘      │
│                                                  │                                      │
│                                                  ▼                                      │
│  ┌──────────────────────────── CAPA DE VIDEO ───────────────────────────────────┐      │
│  │                                                                               │      │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌───────────────┐ │      │
│  │  │   Pexels    │───▶│    Video    │───▶│    Video    │    │  Thumbnail    │ │      │
│  │  │   Fetcher   │    │ Transformer │    │  Renderer   │    │  Transformer  │ │      │
│  │  └─────────────┘    └─────────────┘    └─────────────┘    │   ⭐ NUEVO    │ │      │
│  │                            │                               │               │ │      │
│  │                            │    ┌──────────────────────────┤  Sincronizado │ │      │
│  │                            └───▶│  TransformationParams   │◀── con Video  │ │      │
│  │                                 │  (Compartido Video↔     │               │ │      │
│  │                                 │   Thumbnail)            │               │ │      │
│  │                                 └──────────────────────────┴───────────────┘ │      │
│  │        ▼                                                                     │      │
│  │  ┌─────────────┐                                                            │      │
│  │  │    Cache    │                                                            │      │
│  │  │   Manager   │                                                            │      │
│  │  └─────────────┘                                                            │      │
│  └──────────────────────────────────────────────────────────────────────────────┘      │
│                                       │                                                 │
│                                       ▼                                                 │
│  ┌──────────────────────── CAPA DE VALIDACIÓN ⭐ NUEVA ─────────────────────────┐      │
│  │                                                                               │      │
│  │  ┌───────────────────────────────────────────────────────────────────────┐   │      │
│  │  │                      YPPValidationGate ⭐ NUEVO                        │   │      │
│  │  │  ┌─────────────────────────────────────────────────────────────────┐  │   │      │
│  │  │  │ Verifica ANTES de publicar/escalar:                             │  │   │      │
│  │  │  │ • 1,000 subs + 4,000h watch time (o 10M Shorts views)          │  │   │      │
│  │  │  │ • YPP aprobado oficialmente                                     │  │   │      │
│  │  │  │ • Retención 30s > 50%, CTR > 4%, Watch Time > 40%              │  │   │      │
│  │  │  └─────────────────────────────────────────────────────────────────┘  │   │      │
│  │  │                                                                        │   │      │
│  │  │  BLOQUEA:                                                             │   │      │
│  │  │  ❌ Crear canal 3 → hasta que canal 1 o 2 monetice                   │   │      │
│  │  │  ❌ Expandir a IG/TikTok → hasta que YouTube pague $1                │   │      │
│  │  └───────────────────────────────────────────────────────────────────────┘   │      │
│  │                                                                               │      │
│  └───────────────────────────────────────────────────────────────────────────────┘      │
│                                       │                                                 │
│                          ┌────────────┴────────────┐                                   │
│                          │   GATE PASSED?          │                                   │
│                          │   ✅ YES    ❌ NO       │                                   │
│                          └────────────┬────────────┘                                   │
│                                       │                                                 │
│                          ┌────────────▼────────────┐                                   │
│  ┌───────────────────────┤  MultiPlatformDispatcher │───────────────────────────┐      │
│  │                       │  (BLOQUEADO hasta gate)  │                           │      │
│  │                       └──────────────────────────┘                           │      │
│  │  CAPA DE PUBLICACIÓN                                                         │      │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                      │      │
│  │  │   YouTube   │    │  Instagram  │    │   TikTok    │                      │      │
│  │  │  Publisher  │    │  Publisher  │    │  Publisher  │                      │      │
│  │  │   ✅ AHORA  │    │   🔒 FASE 5  │    │   🔒 FASE 5  │                      │      │
│  │  └─────────────┘    └─────────────┘    └─────────────┘                      │      │
│  │                                                                              │      │
│  └──────────────────────────────────────────────────────────────────────────────┘      │
│                                       │                                                 │
│                                       ▼                                                 │
│  ┌──────────────────────────── CAPA DE PERSISTENCIA ────────────────────────────┐      │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐   │      │
│  │  │   SQLite    │    │    Redis    │    │   Winston   │    │   Config    │   │      │
│  │  │  (Analytics)│    │   (Queue)   │    │   (Logs)    │    │  (Convict)  │   │      │
│  │  └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘   │      │
│  └──────────────────────────────────────────────────────────────────────────────┘      │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Components and Interfaces

### Componente 1: ThumbnailTransformer (Anti-Detección Visual de Thumbnails) ⭐ NUEVO

> **Justificación:** YouTube indexa thumbnails por hash visual. Si 60 videos comparten plantilla base, te marca como "producción en masa".

```typescript
// src/generators/ThumbnailTransformer.ts

// Reutiliza TransformationParams de VideoTransformer para sincronización
import { TransformationParams } from './VideoTransformer';

interface TextOverlayConfig {
    text: string;
    offsetX: number;  // ±20px aleatorio
    offsetY: number;  // ±20px aleatorio
    style: 'bold' | 'glow' | 'minimal';
}

interface ThumbnailTransformerConfig {
    baseImagePath: string;
    transformationParams: TransformationParams; // Sincronizado con video
    textOverlay: TextOverlayConfig;
    grainIntensity: number;  // 3-8
}

interface ThumbnailTransformResult {
    outputPath: string;
    hash: string;
    appliedParams: TransformationParams;
}

export class ThumbnailTransformer {
    /**
     * Transforma un thumbnail aplicando las MISMAS transformaciones cromáticas que el video
     * Garantiza consistencia visual video↔thumbnail mientras evita detección
     */
    public static async transform(
        config: ThumbnailTransformerConfig,
        outputPath: string
    ): Promise<ThumbnailTransformResult>;

    /**
     * Genera parámetros de texto overlay aleatorios
     * Offset ±20px para evitar posicionamiento repetitivo
     */
    public static generateTextOverlayOffset(): { offsetX: number; offsetY: number };

    /**
     * Aplica transformaciones cromáticas sincronizadas con video
     * Usa los mismos valores de hue, saturación, contraste
     */
    private static applyColorTransformations(
        inputPath: string,
        outputPath: string,
        params: TransformationParams
    ): Promise<void>;

    /**
     * Añade grain de película sutil al thumbnail
     */
    private static applyGrain(
        inputPath: string,
        outputPath: string,
        intensity: number
    ): Promise<void>;

    /**
     * Genera hash único del thumbnail transformado
     */
    public static generateThumbnailHash(imagePath: string): Promise<string>;

    /**
     * Construye filtro FFmpeg para transformación de imagen
     */
    private static buildImageFilter(params: TransformationParams, grain: number): string;
}
```

**Comando FFmpeg de referencia para thumbnail:**
```bash
ffmpeg -i thumbnail_base.png \
  -vf "scale=iw*1.05:ih*1.05,crop=1280:720,\
       eq=saturation=1.1:contrast=1.05,hue=h=5,\
       noise=alls=5:allf=t+u" \
  -q:v 2 \
  thumbnail_transformed.jpg
```

---

### Componente 2: ScriptStructureRandomizer (Variabilidad Narrativa) ⭐ NUEVO

> **Justificación:** YouTube detecta patrones de estructura (siempre Hook→3 puntos→CTA). Hay que variar la estructura.

```typescript
// src/generators/ScriptStructureRandomizer.ts

/**
 * 6 estructuras narrativas rotables para evitar detección de patrones
 */
type NarrativeStructure = 
    | 'storytelling'      // anécdota → lección → aplicación
    | 'inverted-list'     // conclusión primero → evidencia
    | 'rhetorical'        // pregunta → investigación → respuesta
    | 'debate'            // tesis vs antítesis → síntesis
    | 'error-tutorial'    // error común → análisis → solución
    | 'case-study';       // problema → análisis → resolución

interface StructureConfig {
    structure: NarrativeStructure;
    sentenceLengthVariation: number;  // ±30% respecto al promedio
    keywordDensity: 'low' | 'medium' | 'high';
    ctaPosition: 'start' | 'middle' | 'end';
}

interface StructuredScript {
    originalScript: string;
    structuredScript: string;
    appliedStructure: NarrativeStructure;
    sentenceCount: number;
    avgSentenceLength: number;
    ctaPosition: string;
}

interface ScriptStructureRandomizer {
    /**
     * Selecciona estructura evitando repetición en últimos 3 videos
     * @param recentStructures Estructuras usadas recientemente
     * @returns Estructura que NO se usó en los últimos 3 videos
     */
    selectStructure(recentStructures: NarrativeStructure[]): NarrativeStructure;

    /**
     * Aplica la estructura narrativa al guión raw
     * Reorganiza secciones según el patrón seleccionado
     */
    applyStructure(rawScript: string, config: StructureConfig): StructuredScript;

    /**
     * Detecta si hay repetición excesiva de estructuras
     * @returns true si misma estructura usada 3+ veces consecutivas
     */
    detectRepetition(structures: NarrativeStructure[]): boolean;

    /**
     * Varía longitud de oraciones según configuración
     * @param variation Porcentaje de variación (ej: 0.30 = ±30%)
     */
    varySentenceLength(text: string, variation: number): string;

    /**
     * Ajusta densidad de keywords en el texto
     */
    adjustKeywordDensity(
        text: string, 
        keywords: string[], 
        density: 'low' | 'medium' | 'high'
    ): string;

    /**
     * Reposiciona CTA según configuración
     */
    repositionCTA(text: string, position: 'start' | 'middle' | 'end'): string;
}

export class ScriptStructureRandomizerImpl implements ScriptStructureRandomizer {
    /**
     * Templates de estructura para cada tipo narrativo
     */
    private static readonly STRUCTURE_TEMPLATES: Record<NarrativeStructure, string[]> = {
        'storytelling': [
            '{{anecdote}}',
            '{{lesson}}', 
            '{{application}}'
        ],
        'inverted-list': [
            '{{conclusion}}',
            '{{evidence_1}}',
            '{{evidence_2}}',
            '{{evidence_3}}'
        ],
        'rhetorical': [
            '{{intriguing_question}}',
            '{{investigation}}',
            '{{answer}}'
        ],
        'debate': [
            '{{thesis}}',
            '{{antithesis}}',
            '{{synthesis}}'
        ],
        'error-tutorial': [
            '{{common_error}}',
            '{{why_it_fails}}',
            '{{correct_solution}}'
        ],
        'case-study': [
            '{{real_problem}}',
            '{{detailed_analysis}}',
            '{{resolution}}'
        ]
    };

    selectStructure(recentStructures: NarrativeStructure[]): NarrativeStructure;
    applyStructure(rawScript: string, config: StructureConfig): StructuredScript;
    detectRepetition(structures: NarrativeStructure[]): boolean;
    varySentenceLength(text: string, variation: number): string;
    adjustKeywordDensity(text: string, keywords: string[], density: 'low' | 'medium' | 'high'): string;
    repositionCTA(text: string, position: 'start' | 'middle' | 'end'): string;
}
```

---

### Componente 3: MusicTransformer (Evasión de Content ID) ⭐ NUEVO

> **Justificación:** Pistas de bancos gratuitos (Pixabay, Free Music Archive) están indexadas en Content ID de YouTube.

```typescript
// src/generators/MusicTransformer.ts

interface MusicTransformationParams {
    pitchShiftPercent: number;   // ±2% (equivale a ±0.35 semitonos)
    tempoShiftPercent: number;   // ±3% sin distorsión audible
    eqBoosts: {
        freq1kHz: number;  // ±2dB
        freq4kHz: number;  // ±2dB
        freq8kHz: number;  // ±2dB
    };
    reverbRoomSize: number;  // 0.05-0.15 (sutil)
}

interface MusicTransformResult {
    outputPath: string;
    hash: string;
    appliedParams: MusicTransformationParams;
    originalDuration: number;
    transformedDuration: number;
}

interface MusicTransformer {
    /**
     * Genera parámetros únicos de transformación
     * @param seed Semilla opcional para reproducibilidad en tests
     */
    generateUniqueParams(seed?: number): MusicTransformationParams;

    /**
     * Transforma pista de música para evadir Content ID
     * Aplica: pitch shift, tempo shift, EQ único, reverb sutil
     */
    transform(
        inputPath: string, 
        outputPath: string, 
        params: MusicTransformationParams
    ): Promise<MusicTransformResult>;

    /**
     * Construye filtro FFmpeg para transformación de audio
     */
    buildFFmpegFilter(params: MusicTransformationParams): string;

    /**
     * Genera hash único de la pista transformada
     * Usado para verificar unicidad y cacheo
     */
    getTransformedHash(params: MusicTransformationParams): string;
}

export class MusicTransformerImpl implements MusicTransformer {
    /**
     * Rangos de transformación (suficientes para evadir, imperceptibles al oído)
     */
    private static readonly RANGES = {
        pitch: { min: -2, max: 2 },       // ±2%
        tempo: { min: -3, max: 3 },       // ±3%
        eq: { min: -2, max: 2 },          // ±2dB
        reverb: { min: 0.05, max: 0.15 }  // Room size
    };

    generateUniqueParams(seed?: number): MusicTransformationParams {
        const random = seed ? this.seededRandom(seed) : Math.random;
        return {
            pitchShiftPercent: this.randomInRange(MusicTransformerImpl.RANGES.pitch, random),
            tempoShiftPercent: this.randomInRange(MusicTransformerImpl.RANGES.tempo, random),
            eqBoosts: {
                freq1kHz: this.randomInRange(MusicTransformerImpl.RANGES.eq, random),
                freq4kHz: this.randomInRange(MusicTransformerImpl.RANGES.eq, random),
                freq8kHz: this.randomInRange(MusicTransformerImpl.RANGES.eq, random)
            },
            reverbRoomSize: this.randomInRange(MusicTransformerImpl.RANGES.reverb, random)
        };
    }

    async transform(
        inputPath: string, 
        outputPath: string, 
        params: MusicTransformationParams
    ): Promise<MusicTransformResult>;

    buildFFmpegFilter(params: MusicTransformationParams): string;
    getTransformedHash(params: MusicTransformationParams): string;

    private randomInRange(range: { min: number; max: number }, random: () => number): number;
    private seededRandom(seed: number): () => number;
}
```

**Comando FFmpeg de referencia para música:**
```bash
ffmpeg -i music.mp3 \
  -af "asetrate=44100*1.02,aresample=44100,\
       equalizer=f=1000:t=q:w=2:g=2,\
       equalizer=f=4000:t=q:w=2:g=-1,\
       equalizer=f=8000:t=q:w=2:g=1,\
       areverb=reverberance=10:room_scale=0.1" \
  -c:a libmp3lame -q:a 2 \
  music_transformed.mp3
```

---

### Componente 4: YPPValidationGate (Gate de Monetización) ⭐ NUEVO CRÍTICO

> **Justificación:** NO escalar a más canales ni expandir a IG/TikTok hasta monetizar YouTube. Monetización primero, alcance después.

```typescript
// src/validation/YPPValidationGate.ts

/**
 * Métricas de YouTube Partner Program
 */
interface YPPMetrics {
    subscribers: number;           // Objetivo: 1,000
    watchTimeHours: number;        // Objetivo: 4,000 (últimos 12 meses)
    shortsViews: number;           // Alternativa: 10M (últimos 90 días)
    yppApproved: boolean;          // Estado oficial de YPP
    lastChecked: Date;
}

/**
 * Métricas de calidad de contenido
 */
interface QualityMetrics {
    bestRetention30s: number;      // >50% requerido
    avgCTRLast10: number;          // >4% requerido
    avgWatchTimePercent: number;   // >40% requerido
    lastChecked: Date;
}

interface ValidationResult {
    passed: boolean;
    metrics: YPPMetrics | QualityMetrics;
    blockedBy: string[];
    progressPercent: number;
}

interface YPPValidationGate {
    /**
     * Verifica si el canal cumple requisitos de YPP
     * @param channelId ID del canal de YouTube
     */
    checkYPPRequirements(channelId: string): Promise<ValidationResult>;

    /**
     * Verifica métricas de calidad de contenido
     */
    checkQualityRequirements(channelId: string): Promise<ValidationResult>;

    /**
     * Determina si se puede crear un nuevo canal
     * Bloqueado hasta que canal 1 o 2 esté monetizado (Regla de Oro #1)
     */
    canCreateNewChannel(): Promise<{
        allowed: boolean;
        blockedBy: string[];
        reason: string;
    }>;

    /**
     * Determina si se puede expandir a una plataforma
     * Bloqueado hasta que YouTube pague el primer dólar (Regla de Oro #2)
     */
    canExpandToPlatform(platform: 'instagram' | 'tiktok'): Promise<{
        allowed: boolean;
        blockedBy: string[];
        reason: string;
    }>;

    /**
     * Genera reporte de progreso hacia monetización
     * Enviado semanalmente por Telegram
     */
    generateProgressReport(): Promise<string>;

    /**
     * Override manual con doble confirmación
     * Requiere confirmación explícita y log de quién/cuándo
     */
    manualOverride(adminConfirmation: string, reason: string): Promise<boolean>;
}

export class YPPValidationGateImpl implements YPPValidationGate {
    /**
     * Umbrales de YPP (YouTube Partner Program)
     */
    private static readonly YPP_THRESHOLDS = {
        subscribers: 1000,
        watchTimeHours: 4000,      // Últimos 12 meses
        shortsViews: 10_000_000,   // Alternativa: 10M en 90 días
        retention30s: 0.50,        // >50%
        ctr: 0.04,                 // >4%
        watchTimePercent: 0.40    // >40%
    };

    /**
     * Mensajes de bloqueo para cada regla
     */
    private static readonly BLOCK_MESSAGES = {
        newChannel: 'No se puede crear canal 3 hasta que canal 1 o 2 esté monetizado (Regla de Oro #1)',
        instagram: 'No se puede expandir a Instagram hasta que YouTube pague el primer dólar (Regla de Oro #2)',
        tiktok: 'No se puede expandir a TikTok hasta que YouTube pague el primer dólar (Regla de Oro #2)'
    };

    async checkYPPRequirements(channelId: string): Promise<ValidationResult>;
    async checkQualityRequirements(channelId: string): Promise<ValidationResult>;
    async canCreateNewChannel(): Promise<{ allowed: boolean; blockedBy: string[]; reason: string }>;
    async canExpandToPlatform(platform: 'instagram' | 'tiktok'): Promise<{ allowed: boolean; blockedBy: string[]; reason: string }>;
    async generateProgressReport(): Promise<string>;
    async manualOverride(adminConfirmation: string, reason: string): Promise<boolean>;

    /**
     * Consulta YouTube Analytics API para obtener métricas
     */
    private async fetchYouTubeMetrics(channelId: string): Promise<YPPMetrics>;

    /**
     * Calcula porcentaje de progreso hacia objetivo
     */
    private calculateProgress(current: number, target: number): number;

    /**
     * Guarda histórico de progreso en SQLite
     */
    private async saveProgressHistory(channelId: string, metrics: YPPMetrics): Promise<void>;

    /**
     * Envía alerta por Telegram cuando se acerca a objetivo (80%)
     */
    private async sendApproachingAlert(metric: string, progress: number): Promise<void>;
}
```

**Ejemplo de uso del Gate:**
```typescript
const gate = new YPPValidationGateImpl();

// Antes de crear canal 3
const canCreate = await gate.canCreateNewChannel();
if (!canCreate.allowed) {
    console.log(`❌ Bloqueado: ${canCreate.reason}`);
    console.log(`   Bloqueado por: ${canCreate.blockedBy.join(', ')}`);
    // Notificar por Telegram
    return;
}

// Antes de expandir a Instagram
const canExpand = await gate.canExpandToPlatform('instagram');
if (!canExpand.allowed) {
    console.log(`❌ Expansión bloqueada: ${canExpand.reason}`);
    return;
}

// Reporte semanal de progreso
const report = await gate.generateProgressReport();
await telegramReporter.send(report);
```

---

### Componente 5: VideoTransformer (Anti-Detección) - Existente

```typescript
// src/generators/VideoTransformer.ts

interface TransformationParams {
    // Geométricos
    zoomFactor: number;      // 1.02 - 1.08
    rotationDegrees: number; // -0.5 to +0.5
    cropPx: { top: number; right: number; bottom: number; left: number };
    mirrorHorizontal: boolean;
    
    // Cromáticos (COMPARTIDO con ThumbnailTransformer)
    saturation: number;      // 0.85 - 1.15
    contrast: number;        // 0.92 - 1.08
    hue: number;             // -10 to +10
    brightness: number;      // 0.95 - 1.05
    
    // Temporales
    speedFactor: number;     // 0.95 - 1.05
    
    // Overlays
    grainIntensity: number;  // 3 - 8
    vignetteStrength: number; // 0.1 - 0.3
    
    // Encoding
    crf: number;             // 18 - 23
    preset: 'slow' | 'medium' | 'fast';
}

export class VideoTransformer {
    /**
     * Genera parámetros de transformación únicos (aleatorios pero deterministas por seed)
     */
    public static generateUniqueParams(seed?: number): TransformationParams;
    
    /**
     * Aplica todas las transformaciones a un video
     * Retorna path del video transformado
     */
    public static async transform(
        inputPath: string, 
        outputPath: string, 
        params: TransformationParams
    ): Promise<string>;
    
    /**
     * Genera el filtro complejo de FFmpeg para todas las transformaciones
     */
    private static buildComplexFilter(params: TransformationParams): string;
    
    /**
     * Genera metadatos únicos para el video
     */
    private static generateUniqueMetadata(): Record<string, string>;
}
```

---

### Componente 6: ScriptHumanizer (Humanización de Guiones) - Existente

```typescript
// src/generators/ScriptHumanizer.ts

interface HumanizationConfig {
    language: 'Spanish' | 'English' | 'Portuguese';
    fillerFrequency: 'low' | 'medium' | 'high';
    pauseFrequency: 'low' | 'medium' | 'high';
    emotionalHooks: boolean;
    rhetoricalQuestions: boolean;
    selfCorrections: boolean;
}

interface HumanizedScript {
    text: string;
    ssmlText: string;
    pauseMarkers: { position: number; durationMs: number }[];
    emphasisWords: string[];
}

export class ScriptHumanizer {
    private static readonly FILLERS = {
        Spanish: ['o sea', 'bueno', 'mira', 'la verdad', 'digamos', 'claro'],
        English: ['you know', 'like', 'actually', 'I mean', 'basically', 'right'],
        Portuguese: ['tipo', 'né', 'olha', 'sabe', 'assim', 'então']
    };

    public static async humanize(
        rawScript: string, 
        config: HumanizationConfig
    ): Promise<HumanizedScript>;
    
    private static addFillers(text: string, language: string, frequency: string): string;
    private static addPauses(text: string): string;
    private static addSelfCorrections(text: string, language: string): string;
    private static toSSML(text: string, emphasisWords: string[]): string;
}
```

---

### Componente 7: AudioMixer (Mezcla Profesional) - Existente

```typescript
// src/generators/AudioMixer.ts

type MusicMood = 'ambient' | 'upbeat' | 'cinematic' | 'calm' | 'dramatic';

interface AudioMixConfig {
    voiceLevel: number;        // -1 a -3 dB
    musicLevel: number;        // -20 a -25 dB
    duckingEnabled: boolean;
    duckingAmount: number;     // -6 dB
    duckingAttack: number;     // 200 ms
    duckingRelease: number;    // 500 ms
    fadeInDuration: number;    // 2 segundos
    fadeOutDuration: number;   // 2 segundos
    targetLoudness: number;    // -16 LUFS
    truePeak: number;          // -1.5 dB
}

export class AudioMixer {
    public static async mixVoiceWithMusic(
        voicePath: string,
        mood: MusicMood | 'auto',
        outputPath: string,
        config?: Partial<AudioMixConfig>
    ): Promise<string>;

    public static selectMusicTrack(mood: MusicMood): MusicTrack;
    public static detectMoodFromScript(script: string, language: string): MusicMood;
    private static buildMixCommand(...): string;
}
```

---

### Componente 8: SubtitleGenerator (SSML Timestamps) - Existente

```typescript
// src/generators/SubtitleGenerator.ts

interface WordTimestamp {
    word: string;
    startTimeMs: number;
    endTimeMs: number;
}

interface SubtitleStyle {
    name: string;
    fontname: string;
    fontsize: number;
    primaryColor: string;
    outlineColor: string;
    bold: boolean;
    outline: number;
    shadow: number;
    marginV: number;
}

export class SubtitleGenerator {
    private static readonly STYLES: Record<string, SubtitleStyle> = {
        minimal: { /* ... */ },
        bold: { /* ... */ },
        glow: { /* ... */ }
    };

    public static async generateFromSSML(
        ssmlText: string,
        language: string,
        outputPath: string,
        style: 'minimal' | 'bold' | 'glow'
    ): Promise<{ assPath: string; audioPath: string; timestamps: WordTimestamp[] }>;

    public static prepareSSMLWithMarks(text: string): string;
    public static async generateFromWhisper(audioPath: string, outputPath: string, style: string): Promise<string>;
}
```

---

## Data Models

### Nuevas Tablas SQLite

```sql
-- Tracking de estructuras narrativas usadas (ScriptStructureRandomizer)
CREATE TABLE script_structures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_key TEXT NOT NULL,
    video_id TEXT NOT NULL,
    structure_type TEXT NOT NULL,  -- 'storytelling', 'inverted-list', etc.
    cta_position TEXT NOT NULL,    -- 'start', 'middle', 'end'
    keyword_density TEXT NOT NULL, -- 'low', 'medium', 'high'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tracking de transformaciones de música (MusicTransformer)
CREATE TABLE music_transformations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_track TEXT NOT NULL,
    transformed_hash TEXT UNIQUE NOT NULL,
    params_json TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Progreso hacia monetización (YPPValidationGate)
CREATE TABLE ypp_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id TEXT NOT NULL,
    channel_key TEXT NOT NULL,
    subscribers INTEGER NOT NULL,
    watch_time_hours REAL NOT NULL,
    shorts_views INTEGER NOT NULL,
    ypp_approved BOOLEAN DEFAULT FALSE,
    best_retention_30s REAL,
    avg_ctr_last_10 REAL,
    avg_watch_time_percent REAL,
    checked_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Overrides manuales de validación (auditoría)
CREATE TABLE ypp_overrides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id TEXT NOT NULL,
    override_type TEXT NOT NULL,  -- 'new_channel', 'expand_instagram', 'expand_tiktok'
    reason TEXT NOT NULL,
    confirmation_code TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Índices
CREATE INDEX idx_script_structures_channel ON script_structures(channel_key, created_at DESC);
CREATE INDEX idx_ypp_progress_channel ON ypp_progress(channel_id, checked_at DESC);
CREATE INDEX idx_music_transformations_hash ON music_transformations(transformed_hash);
```

---

## Flujos de Datos Actualizados

### Pipeline de Video Short V2 (Con 4 Nuevos Componentes)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    PIPELINE DE SHORT V2 (CON GAPS CRÍTICOS)                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  1. SEO Strategy                                                                │
│  ┌─────────────┐                                                               │
│  │  SEOAgent   │──▶ { rawTopic, viralTitle, keywords, mood }                   │
│  └─────────────┘                                                               │
│         │                                                                       │
│         ▼                                                                       │
│  2. Script Generation + STRUCTURE RANDOMIZATION ⭐ NUEVO                        │
│  ┌─────────────┐    ┌───────────────────┐    ┌─────────────┐                   │
│  │ScriptGen    │───▶│ ScriptStructure   │───▶│ScriptHuman  │                   │
│  │(DeepSeek)   │    │  Randomizer ⭐    │    │izer        │                   │
│  └─────────────┘    │ (6 estructuras)   │    └─────────────┘                   │
│                     └───────────────────┘                                      │
│         │                                                                       │
│         ▼                                                                       │
│  3. Audio Generation + MUSIC TRANSFORMATION ⭐ NUEVO                            │
│  ┌─────────────┐    ┌─────────────┐                                            │
│  │ VoicePool   │───▶│ AudioGen    │──▶ voice.mp3                               │
│  └─────────────┘    │(Google TTS) │                                            │
│                     └─────────────┘                                            │
│         │                                                                       │
│         │            ┌───────────────────┐    ┌─────────────┐                  │
│         │            │ MusicTransformer  │───▶│ AudioMixer  │──▶ final.mp3    │
│         └───────────▶│      ⭐ NUEVO     │    │  (Ducking)  │                  │
│                      │ Pitch/Tempo/EQ    │    └─────────────┘                  │
│                      └───────────────────┘                                     │
│         │                                                                       │
│         ▼                                                                       │
│  4. Video Fetch + Transform + THUMBNAIL TRANSFORM ⭐ NUEVO                      │
│  ┌─────────────┐    ┌─────────────┐                                            │
│  │PexelsFetch  │───▶│VideoTrans   │──▶ video_transformed.mp4                   │
│  └─────────────┘    │former       │                                            │
│                     └──────┬──────┘                                            │
│                            │                                                    │
│                            │  TransformationParams (COMPARTIDO)                │
│                            │                                                    │
│                            ▼                                                    │
│                     ┌───────────────────┐                                      │
│                     │ ThumbnailTrans    │──▶ thumb_transformed.jpg             │
│                     │   former ⭐ NUEVO │                                      │
│                     │ (Mismos params)   │                                      │
│                     └───────────────────┘                                      │
│         │                                                                       │
│         ▼                                                                       │
│  5. Final Render + Subtitles                                                    │
│  ┌─────────────┐    ┌─────────────┐                                            │
│  │SubtitleGen  │───▶│VideoRenderer│──▶ final_short.mp4                         │
│  │(SSML marks) │    └─────────────┘                                            │
│  └─────────────┘                                                               │
│         │                                                                       │
│         ▼                                                                       │
│  6. YPP VALIDATION GATE ⭐ NUEVO CRÍTICO                                        │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │                       YPPValidationGate                                    │ │
│  │  ┌─────────────────────────────────────────────────────────────────────┐  │ │
│  │  │ ✅ Verificar: Subs > 1000, WatchTime > 4000h, Retención > 50%      │  │ │
│  │  │ ❌ Si NO cumple: Solo YouTube Publisher (no expandir)               │  │ │
│  │  │ ✅ Si cumple: Desbloquear MultiPlatformDispatcher                   │  │ │
│  │  └─────────────────────────────────────────────────────────────────────┘  │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
│         │                                                                       │
│         ▼                                                                       │
│  7. Platform Publish (CONTROLADO POR GATE)                                      │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                         │
│  │YouTube      │    │ReelsAdapter │    │TikTokAdapter│                         │
│  │Publisher    │    │🔒 BLOQUEADO │    │🔒 BLOQUEADO │                         │
│  │   ✅        │    │hasta gate   │    │hasta gate   │                         │
│  └─────────────┘    └─────────────┘    └─────────────┘                         │
│         │                                                                       │
│         ▼                                                                       │
│  8. Analytics & Logging                                                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                         │
│  │  SQLite     │    │   Winston   │    │  Telegram   │                         │
│  │(save data)  │    │(log file)   │    │(alert only) │                         │
│  └─────────────┘    └─────────────┘    └─────────────┘                         │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Estructura de Archivos Propuesta

```
OmniAI-Engine/
├── src/
│   ├── adapters/
│   │   ├── ReelsAdapter.ts          # Fase 5
│   │   ├── TikTokAdapter.ts         # Fase 5
│   │   └── index.ts
│   │
│   ├── generators/
│   │   ├── AudioGenerator.ts
│   │   ├── AudioHumanizer.ts
│   │   ├── AudioMixer.ts            # Existente
│   │   ├── MusicTransformer.ts      # ⭐ NUEVO - Fase 2
│   │   ├── ScriptGenerator.ts
│   │   ├── ScriptHumanizer.ts
│   │   ├── ScriptStructureRandomizer.ts  # ⭐ NUEVO - Fase 2
│   │   ├── SubtitleGenerator.ts
│   │   ├── ThumbnailGenerator.ts
│   │   ├── ThumbnailTransformer.ts  # ⭐ NUEVO - Fase 1
│   │   ├── VideoRenderer.ts
│   │   ├── VideoTransformer.ts      # Existente - Fase 1
│   │   ├── VoicePool.ts
│   │   └── index.ts
│   │
│   ├── validation/                  # ⭐ NUEVO
│   │   ├── YPPValidationGate.ts     # ⭐ NUEVO - Fase 4
│   │   └── index.ts
│   │
│   ├── cache/
│   │   ├── CacheManager.ts          # Fase 3
│   │   └── index.ts
│   │
│   ├── publishers/
│   │   ├── YouTubePublisher.ts
│   │   ├── InstagramPublisher.ts    # Fase 5 (bloqueado por gate)
│   │   ├── TikTokPublisher.ts       # Fase 5 (bloqueado por gate)
│   │   ├── MultiPlatformDispatcher.ts
│   │   └── index.ts
│   │
│   ├── queue/
│   │   └── RenderQueueManager.ts    # Simplificado - Fase 3
│   │
│   ├── logging/
│   │   ├── Logger.ts                # Winston - Fase 3
│   │   └── index.ts
│   │
│   ├── resilience/
│   │   ├── RetryHandler.ts          # Fase 3
│   │   ├── CircuitBreaker.ts        # Fase 6 (diferido)
│   │   └── index.ts
│   │
│   └── config/
│       ├── ConfigManager.ts
│       └── index.ts
│
├── content/
│   ├── cache/
│   │   ├── videos/
│   │   ├── audio/
│   │   ├── thumbnails/
│   │   └── music/                   # ⭐ NUEVO - cache de música transformada
│   ├── music/                       # ⭐ Banco de música royalty-free
│   │   ├── ambient/
│   │   ├── upbeat/
│   │   ├── cinematic/
│   │   ├── calm/
│   │   └── dramatic/
│   └── database.sqlite
│
└── logs/
    └── omniai-YYYY-MM-DD.log
```

---

## Error Handling

### Estrategia de Manejo de Errores por Componente

| Componente | Error | Acción | Fallback |
|------------|-------|--------|----------|
| VideoTransformer | FFmpeg crash | Retry 3x con backoff | Reducir CRF, simplificar filtros |
| ThumbnailTransformer | Imagen corrupta | Log + skip | Usar thumbnail sin transformar |
| MusicTransformer | Pista no encontrada | Buscar alternativa | Usar pista sin transformar |
| ScriptStructureRandomizer | Parsing falla | Log warning | Usar estructura 'storytelling' default |
| YPPValidationGate | API timeout | Cache de última verificación | Bloquear expansión por precaución |
| AudioMixer | Ducking falla | Log warning | Mezcla simple sin ducking |

### Códigos de Error Específicos

```typescript
enum OmniAIErrorCode {
    // Transformación (1xxx)
    VIDEO_TRANSFORM_FAILED = 1001,
    THUMBNAIL_TRANSFORM_FAILED = 1002,
    MUSIC_TRANSFORM_FAILED = 1003,
    
    // Validación (2xxx)
    YPP_CHECK_FAILED = 2001,
    YPP_GATE_BLOCKED = 2002,
    YPP_OVERRIDE_DENIED = 2003,
    
    // Contenido (3xxx)
    SCRIPT_STRUCTURE_INVALID = 3001,
    SCRIPT_HUMANIZATION_FAILED = 3002,
    
    // APIs (4xxx)
    YOUTUBE_API_ERROR = 4001,
    PEXELS_API_ERROR = 4002,
    DEEPSEEK_API_ERROR = 4003,
    GOOGLE_TTS_ERROR = 4004
}
```

---

## Testing Strategy

### Tests Unitarios por Componente Nuevo

```typescript
// __tests__/ThumbnailTransformer.test.ts
describe('ThumbnailTransformer', () => {
    it('debe aplicar mismos parámetros cromáticos que VideoTransformer');
    it('debe generar hash único por thumbnail');
    it('debe variar posición de texto ±20px');
    it('debe aplicar grain con intensidad 3-8');
});

// __tests__/ScriptStructureRandomizer.test.ts
describe('ScriptStructureRandomizer', () => {
    it('no debe repetir estructura en 3 videos consecutivos');
    it('debe variar longitud de oraciones ±30%');
    it('debe reposicionar CTA correctamente');
    it('debe detectar repetición excesiva');
});

// __tests__/MusicTransformer.test.ts
describe('MusicTransformer', () => {
    it('debe aplicar pitch shift ±2%');
    it('debe aplicar tempo shift ±3%');
    it('debe generar hash único por transformación');
    it('debe construir filtro FFmpeg válido');
});

// __tests__/YPPValidationGate.test.ts
describe('YPPValidationGate', () => {
    it('debe bloquear canal 3 si canal 1 y 2 no monetizados');
    it('debe bloquear Instagram si YPP no aprobado');
    it('debe permitir override manual con doble confirmación');
    it('debe calcular progreso correctamente');
    it('debe enviar alerta al 80% del objetivo');
});
```

### Tests de Integración

```typescript
// __tests__/integration/FullPipeline.test.ts
describe('Pipeline Completo con Nuevos Componentes', () => {
    it('debe completar pipeline Short en < 5 minutos');
    it('debe aplicar transformación a video Y thumbnail');
    it('debe transformar música antes de mezclar');
    it('debe variar estructura entre videos');
    it('debe respetar YPPValidationGate');
});
```

---

## Configuración de Ejemplo

### config/default.json (Actualizado)

```json
{
  "environment": "development",
  "logLevel": "debug",
  
  "features": {
    "antiDetection": true,
    "thumbnailTransformation": true,
    "musicTransformation": true,
    "scriptStructureRandomization": true,
    "yppValidationGate": true,
    "scriptHumanization": true,
    "audioHumanization": true,
    "subtitles": true,
    "instagram": false,
    "tiktok": false,
    "caching": true
  },
  
  "yppGate": {
    "enabled": true,
    "thresholds": {
      "subscribers": 1000,
      "watchTimeHours": 4000,
      "shortsViews": 10000000,
      "retention30s": 0.50,
      "ctr": 0.04,
      "watchTimePercent": 0.40
    },
    "alertAtPercent": 80,
    "weeklyReportEnabled": true
  },
  
  "transformation": {
    "video": {
      "zoom": { "min": 1.02, "max": 1.08 },
      "rotation": { "min": -0.5, "max": 0.5 },
      "saturation": { "min": 0.85, "max": 1.15 },
      "contrast": { "min": 0.92, "max": 1.08 },
      "hue": { "min": -10, "max": 10 },
      "grain": { "min": 3, "max": 8 },
      "crf": { "min": 18, "max": 23 }
    },
    "thumbnail": {
      "textOffset": { "min": -20, "max": 20 },
      "syncWithVideo": true
    },
    "music": {
      "pitchShift": { "min": -2, "max": 2 },
      "tempoShift": { "min": -3, "max": 3 },
      "eq": { "min": -2, "max": 2 },
      "reverb": { "min": 0.05, "max": 0.15 }
    }
  },
  
  "scriptStructure": {
    "avoidRepetitionCount": 3,
    "structures": ["storytelling", "inverted-list", "rhetorical", "debate", "error-tutorial", "case-study"],
    "sentenceLengthVariation": 0.30,
    "keywordDensities": ["low", "medium", "high"],
    "ctaPositions": ["start", "middle", "end"]
  },
  
  "cache": {
    "enabled": true,
    "basePath": "./content/cache",
    "maxSizeGB": 10,
    "ttl": {
      "videos": 30,
      "audio": 7,
      "thumbnails": 3,
      "music": 14
    }
  }
}
```

---

## Comandos FFmpeg de Referencia

### Transformación de Thumbnail (ThumbnailTransformer)

```bash
ffmpeg -i thumbnail_base.png \
  -vf "scale=iw*1.05:ih*1.05,crop=1280:720,\
       eq=saturation=1.1:contrast=1.05,hue=h=5,\
       noise=alls=5:allf=t+u" \
  -q:v 2 \
  thumbnail_transformed.jpg
```

### Transformación de Música (MusicTransformer)

```bash
ffmpeg -i music.mp3 \
  -af "asetrate=44100*1.02,aresample=44100,\
       equalizer=f=1000:t=q:w=2:g=2,\
       equalizer=f=4000:t=q:w=2:g=-1,\
       equalizer=f=8000:t=q:w=2:g=1,\
       areverb=reverberance=10:room_scale=0.1" \
  -c:a libmp3lame -q:a 2 \
  music_transformed.mp3
```

### Transformación de Video (VideoTransformer)

```bash
ffmpeg -i input.mp4 \
  -vf "scale=iw*1.05:ih*1.05,rotate=0.003*PI,crop=1080:1920,\
       eq=saturation=1.1:contrast=1.05,hue=h=5,\
       noise=alls=5:allf=t+u,vignette=PI/5,format=yuv420p" \
  -c:v libx264 -preset slow -crf 20 \
  -metadata creation_time="2026-08-21T10:30:45" \
  output.mp4
```

### Mezcla de Audio con Ducking (AudioMixer)

```bash
ffmpeg -i voice.mp3 -i music_transformed.mp3 \
  -filter_complex "
    [0:a]volume=-1dB[voice];
    [1:a]volume=-22dB,afade=t=in:st=0:d=2,afade=t=out:st=58:d=2[music_faded];
    [music_faded][voice]sidechaincompress=threshold=0.02:ratio=6:attack=200:release=500[music_ducked];
    [voice][music_ducked]amix=inputs=2:duration=first:dropout_transition=2[mixed];
    [mixed]loudnorm=I=-16:TP=-1.5:LRA=11[final]
  " \
  -map "[final]" -c:a libmp3lame -q:a 2 output_mixed.mp3
```

---

## Correctness Properties

*Las propiedades de corrección no aplican para este diseño ya que es principalmente Infrastructure as Code (IaC), configuración de pipelines y orquestación de componentes. En lugar de property-based testing, se utilizan:*

- **Tests de integración** con ejemplos representativos
- **Tests de regresión** para transformaciones FFmpeg
- **Tests de contrato** para APIs externas (YouTube, Pexels)
- **Tests de humo** para validar configuración

*Ver sección "Testing Strategy" para detalles de los tests específicos.*
