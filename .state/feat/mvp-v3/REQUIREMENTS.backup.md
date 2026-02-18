# Requirements - RAGTS MVP v3

Branch: feat/mvp-v3
Date: 2026-02-17
Status: Blocked (waiting for MVP v2)
Depends on: feat/mvp-v2

## 1. Overview

MVP v3 delivers scale handling, organization, and search — the features originally scoped for MVP v2 that were deferred when the terminal rendering problem was discovered.

**Prerequisites:** MVP v2 must be merged first (correct TUI rendering + section detection).

**Full specifications are in `.state/feat/mvp-v2/REQUIREMENTS.md` Section 18.**

## 2. Features

| Feature | Reference |
|---------|-----------|
| Server-side pagination | FR-v3-1 in v2 REQUIREMENTS Section 18 |
| Virtual scrolling (@tanstack/vue-virtual) | FR-v3-2 |
| Agent type metadata | FR-v3-3 |
| Search and filter sessions | FR-v3-4 |
| 250MB upload limit | FR-v3-5 |
| Edit session metadata | FR-v3-6 |

## 3. Data Model

Shared with MVP v2. The schema (sessions table additions, sections table, indexes) is defined in `.state/feat/mvp-v2/REQUIREMENTS.md` Section 6. MVP v2 creates the schema; MVP v3 adds agent_type usage, search/filter queries, and pagination.

## 4. API

Full API specs in `.state/feat/mvp-v2/REQUIREMENTS.md` Section 18 "MVP v3 API". Key changes:
- `GET /api/sessions` response shape changes from array to paginated object (breaking, acceptable)
- `GET /api/sessions/:id` adds pagination params
- `PUT /api/sessions/:id` — NEW endpoint
- Search/filter query params on session list

## 5. Coordinate System

Event index is the canonical coordinate system. See `.state/feat/mvp-v2/REQUIREMENTS.md` Section 5.

## 6. Next Steps

Once MVP v2 is merged:
1. Create branch `feat/mvp-v3` from main
2. Start SDLC cycle (PO sign-off on this doc, then Architect for pagination/virtual-scroll architecture)
3. The rendering approach from MVP v2 determines how pagination and virtual scrolling integrate
