# FMA Large → MERT → Qdrant proof of concept

This tool prepares the full FMA Large reference corpus for PromptBeats music-similarity experiments without storing the 93 GiB audio archive in PromptBeats/Supabase.

## Architecture

`FMA Large remote ZIP → one MP3 in memory → ffmpeg 24 kHz mono → MERT-v1-95M → 768D vector → Qdrant → discard MP3 bytes`

The importer uses HTTP byte-range access (`RemoteZip`). It does **not** intentionally download `fma_large.zip` as a whole. If the upstream host does not support range access, initialization should fail instead of silently allocating 93 GiB locally.

Qdrant is also the resume checkpoint. FMA track IDs are deterministic Qdrant point IDs. On restart, the importer asks Qdrant which IDs already exist and skips them, so no local checkpoint or persistent RunPod disk is required.

## Embedding contract

The canonical POC contract is `embedding_contract.json`:

- model: `m-a-p/MERT-v1-95M`
- 24 kHz mono
- 30-second non-overlapping windows
- last hidden state
- mean over time
- mean across windows for longer query audio
- L2 normalization
- 768 dimensions
- cosine distance

**Corpus and query audio must use exactly the same contract.** The existing PromptBeats enhanced RunPod worker currently uses MERT internally for representation evidence, but its source is not stored in this repository and it does not currently return this pooled 768D vector. Do not connect Analyzer retrieval until the worker/query path emits this exact contract.

## RunPod one-off job

Use a temporary GPU Pod/job with Python 3.11+ and `ffmpeg` installed. No paid persistent volume is required.

```bash
git clone https://github.com/Aeras/prompt-beats-studio.git
cd prompt-beats-studio
git checkout feat/fma-qdrant-ingest

python -m venv .venv
source .venv/bin/activate
pip install -r tools/fma_qdrant/requirements.txt

export QDRANT_URL='https://...cloud.qdrant.io'
export QDRANT_API_KEY='...'

# Smoke test only: process up to 10 tracks.
python tools/fma_qdrant/ingest_fma_large.py --limit 10

# Then a larger validation batch.
python tools/fma_qdrant/ingest_fma_large.py --limit 1000

# Full corpus. Safe to stop/restart; existing Qdrant points are skipped.
python tools/fma_qdrant/ingest_fma_large.py
```

Do not put the Qdrant API key in GitHub, logs, screenshots, or command-line arguments. Use environment variables only.

## Before the full 106k run

1. Verify `/qdrant-test` shows the cluster as connected.
2. Run 10 tracks and confirm points appear in `promptbeats_music_memory_v1`.
3. Run 1,000 tracks and inspect Qdrant disk/RAM growth and retrieval quality.
4. Only then continue to all 106,574 tracks.

This staged validation is intentional. The free Qdrant cluster has limited resources, and actual index/payload overhead should be measured instead of estimated.

## FMA metadata stored in payload

The importer keeps compact metadata only: FMA track ID, title, artist, album, top genre, genre list, tags, license, split/subset, and embedding contract/model identifiers. Audio is not stored in Qdrant.

## Licensing / production warning

FMA tracks use Creative Commons licenses on a per-track basis. MERT-v1-95M is published under CC-BY-NC-4.0. This pipeline is therefore an internal/non-commercial POC until licensing is reviewed for any future commercial PromptBeats use.

## Failure behavior

Bad/missing/corrupt FMA tracks are logged to `fma_qdrant_failures.tsv` and do not abort the full run. Re-running is idempotent because successfully ingested track IDs already exist in Qdrant.
