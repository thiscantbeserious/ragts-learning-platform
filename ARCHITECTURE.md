# Architecture

System design for the RAGTS Learning Platform. This is a living document - rough baseline to be refined as the project evolves.

## Core Concepts

### Sessions
Terminal session recordings in asciicast v3 format. Each session captures the full terminal output of an AI agent interaction - commands, responses, errors, and timing.

### Markers
Asciicast v3 native markers embedded in session files. In RAGTS, markers serve as fold anchors - structural boundaries that define collapsible sections.

### Vertical Browsing
Sessions are rendered as scrollable documents rather than time-based video playback. Terminal output is laid out vertically, preserving the full content while allowing random access to any point in the session.

### Folds
Marker-delimited sections that can be collapsed or expanded. Folds enable quick peeks, progressive disclosure, and noise reduction.

### Agent Memory
Sessions contain rich context: what was attempted, what worked, what failed, and why. RAGTS transforms raw sessions into retrievable, indexed artifacts that agents can query to inform future decisions.

## System Components

```
┌─────────────────────────────────────────────────────┐
│                   RAGTS Platform                     │
│                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │  Web UI      │  │  API Server  │  │  Storage   │ │
│  │             │  │              │  │            │ │
│  │ - Session   │  │ - Session    │  │ - .cast    │ │
│  │   browser   │  │   CRUD       │  │   files    │ │
│  │ - Fold/     │  │ - Search     │  │ - Index    │ │
│  │   unfold    │  │ - Transform  │  │ - Metadata │ │
│  │ - Search    │  │   triggers   │  │            │ │
│  │ - Theming   │  │              │  │            │ │
│  └──────┬──────┘  └──────┬───────┘  └─────┬──────┘ │
│         │                │                │        │
│         └────────────────┼────────────────┘        │
│                          │                          │
│                  ┌───────┴────────┐                  │
│                  │ Transform      │                  │
│                  │ Pipeline       │                  │
│                  │                │                  │
│                  │ - AGR service  │                  │
│                  │ - Silence      │                  │
│                  │   removal      │                  │
│                  │ - Memory       │                  │
│                  │   optimization │                  │
│                  │ - Indexing     │                  │
│                  └────────────────┘                  │
└─────────────────────────────────────────────────────┘
```

## Data Flow

### Ingestion
```
.cast file → Validation → Storage → Index → Available for browsing
```

### Browsing
```
User request → API (session + markers) → Web UI (vertical render + folds)
```

### Memory Retrieval
```
Agent query → Search index → Relevant session segments → Context for agent
```

### Transformation
```
Raw session → AGR service (optimize) → Transformed session → Re-index
```

## Design Decisions

### Vertical over Horizontal
Terminal sessions are text. Text is read vertically. Vertical browsing respects the medium.

### Markers as Structure
Asciicast v3 markers were designed for annotation. RAGTS elevates them to structural elements - fold boundaries that define the session's hierarchy.

### AGR as Service
Rather than reimplementing transformation logic, RAGTS delegates to AGR. This keeps the web platform focused on serving and browsing, while AGR handles recording and transformation.

### Sessions as Memory
Traditional RAG retrieves from documents. RAGTS retrieves from experiences - actual agent sessions with full context. This is richer than documentation because it includes the reasoning, failures, and recoveries that documents omit.
