# Analyzer query embedding contract

The FMA corpus and live Song Analyzer query audio must use the exact same embedding contract before Qdrant nearest-neighbour retrieval is valid.

Canonical contract: `promptbeats-mert95-similarity-v1`

- model: `m-a-p/MERT-v1-95M`
- pinned revision: `12af15f`
- mono 24 kHz audio
- non-overlapping 5 second windows
- ignore a final fragment shorter than 1 second
- representation: `last_hidden_state`
- time pooling: mean over the hidden-state time axis for each window
- window pooling: arithmetic mean of the per-window vectors for the track
- final normalization: L2
- vector size: 768
- Qdrant distance: cosine

## Enhanced worker request

The PromptBeats app now sends the existing `analyze_fused` request with:

```json
{
  "include_similarity_embedding": true,
  "similarity_embedding_contract": "promptbeats-mert95-similarity-v1"
}
```

The worker must keep all existing Stage 0 behavior and additionally return:

```json
{
  "similarity_embedding": {
    "contract": "promptbeats-mert95-similarity-v1",
    "vector": [768 finite numbers]
  }
}
```

The vector must be produced from the full-mix source audio with the contract above. A stem vector, a single-window vector, a section-change embedding, a different MERT layer/model, padded-tail pooling, or an unnormalized vector is not compatible with the existing Qdrant corpus.

The application validates both the exact contract ID and vector length. If the field is absent or Qdrant fails, analysis continues without reference-memory retrieval and records that limitation instead of silently using incompatible evidence.

## Retrieval semantics

PromptBeats queries `promptbeats_music_memory_v1` for the top 12 nearest neighbours. Neighbour metadata is attached to Stage 0 as `referenceMemory` and reaches the Final Judge as secondary statistical reference evidence. Direct Stage 0/Stage A audio evidence remains authoritative; neighbour identity must not be treated as track identity or copied into generator output.
