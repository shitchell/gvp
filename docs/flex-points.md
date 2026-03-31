# GVP v1 Flex Points

This document tracks architectural flex points — places where the design explicitly supports future extension without requiring major rework.

## Validation Pass Injection (DEC-5.2)

**Current:** User-defined rules run as a dedicated `user_rules` pass, only during `cairn validate`.

**Flex point:** Each pass has a stable name (schema, structural, traceability, semantic, user_rules). In the future, user rules could be injected into specific passes rather than running as a separate pass. The naming convention enables this.

## Embedding Provider (DEC-10.8)

**Current:** Abstract `EmbeddingProvider` class with a stub implementation. Local model by default.

**Flex point:** New providers (OpenAI, Anthropic API) can be added as plugins. The `EmbeddingProvider` interface is the extension point.

## Exporter Plugins (DEC-7.8)

**Current:** Built-in exporters (JSON, CSV, Markdown) + optional (DOT, SQLite).

**Flex point:** New exporters can be added by extending the `Exporter` base class. Plugin discovery (auto-detecting `gvp-exporter-*` npm packages) is a natural future extension.

## RefParser Plugins (DEC-10.3)

**Current:** Built-in parsers for Markdown, TypeScript/JS, YAML.

**Flex point:** New parsers (Python, Go, Rust) added by extending `RefParser`. Extension-based dispatch makes registration trivial.

## LLM-Powered Conflict Detection (DEC-10.9)

**Current:** Similarity-based relationship detection using embeddings only.

**Flex point:** An `AnalysisProvider` interface (similar to `EmbeddingProvider`) could send element pairs to an LLM for deeper contradiction analysis. The `cairn analyze` command is the integration point.

## Git Source Resolution (DEC-1.9)

**Current:** `GitSourceResolver` is a stub that validates commit-ish format but doesn't clone.

**Flex point:** Full git integration (clone to cache, checkout commit-ish) follows the same `SourceResolver` interface.
