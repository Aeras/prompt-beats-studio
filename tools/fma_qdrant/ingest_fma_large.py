#!/usr/bin/env python3
"""Stream FMA Large, create PromptBeats MERT vectors, and upsert them into Qdrant.

Designed for a temporary RunPod GPU job. The 93 GiB FMA archive is NOT downloaded
as a whole: RemoteZip uses HTTP byte-range requests and each MP3 is processed in
memory, then discarded. Qdrant itself is the resume checkpoint: existing point IDs
are skipped, so restarting the job does not re-embed completed tracks.
"""

from __future__ import annotations

import argparse
import ast
import io
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import torch
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, PointStruct, VectorParams
from remotezip import RemoteZip
from transformers import AutoModel, Wav2Vec2FeatureExtractor

FMA_METADATA_URL = "https://os.unil.cloud.switch.ch/fma/fma_metadata.zip"
FMA_LARGE_URL = "https://os.unil.cloud.switch.ch/fma/fma_large.zip"
COLLECTION = "promptbeats_music_memory_v1"
CONTRACT_PATH = Path(__file__).with_name("embedding_contract.json")


def env_required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def load_contract() -> dict[str, Any]:
    return json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))


def as_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return []
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return []
        try:
            parsed = ast.literal_eval(text)
            return parsed if isinstance(parsed, list) else [parsed]
        except Exception:
            return [text]
    return [value]


def safe_text(value: Any, limit: int = 300) -> str | None:
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return None
    text = str(value).strip()
    return text[:limit] if text else None


def col(row: pd.Series, group: str, name: str) -> Any:
    key = (group, name)
    return row[key] if key in row.index else None


def load_metadata(metadata_url: str) -> tuple[pd.DataFrame, dict[int, str]]:
    print(f"[fma] opening metadata archive by HTTP range: {metadata_url}", flush=True)
    with RemoteZip(metadata_url) as rz:
        names = set(rz.namelist())
        tracks_name = next((n for n in names if n.endswith("tracks.csv")), None)
        genres_name = next((n for n in names if n.endswith("genres.csv")), None)
        if not tracks_name or not genres_name:
            raise RuntimeError("FMA metadata archive does not contain tracks.csv and genres.csv")
        with rz.open(tracks_name) as fh:
            tracks = pd.read_csv(io.BytesIO(fh.read()), index_col=0, header=[0, 1], low_memory=False)
        with rz.open(genres_name) as fh:
            genres = pd.read_csv(io.BytesIO(fh.read()), index_col=0)
    genre_names = {int(idx): str(row.get("title", idx)) for idx, row in genres.iterrows()}
    tracks.index = tracks.index.astype(int)
    return tracks, genre_names


def ffmpeg_decode_mono_24k(audio_bytes: bytes, sample_rate: int) -> np.ndarray:
    if shutil.which("ffmpeg") is None:
        raise RuntimeError("ffmpeg is required on the RunPod image")
    proc = subprocess.run(
        [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", "pipe:0",
            "-f", "f32le", "-acodec", "pcm_f32le", "-ac", "1", "-ar", str(sample_rate), "pipe:1",
        ],
        input=audio_bytes,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if proc.returncode != 0 or not proc.stdout:
        detail = proc.stderr.decode("utf-8", errors="replace")[-500:]
        raise RuntimeError(f"ffmpeg decode failed: {detail}")
    return np.frombuffer(proc.stdout, dtype=np.float32).copy()


class MertEmbedder:
    def __init__(self, contract: dict[str, Any], device: str):
        self.contract = contract
        self.sample_rate = int(contract["sample_rate_hz"])
        self.window_samples = int(contract["window_seconds"] * self.sample_rate)
        model_name = str(contract["model"])
        revision = str(contract.get("model_revision") or "main")
        print(f"[mert] loading {model_name}@{revision} on {device}", flush=True)
        self.processor = Wav2Vec2FeatureExtractor.from_pretrained(model_name, revision=revision)
        self.model = AutoModel.from_pretrained(model_name, revision=revision, trust_remote_code=True)
        self.device = torch.device(device)
        self.model.to(self.device)
        self.model.eval()
        hidden = int(getattr(self.model.config, "hidden_size", 0))
        if hidden != int(contract["vector_size"]):
            raise RuntimeError(f"MERT hidden size {hidden} does not match contract vector size {contract['vector_size']}")

    @torch.inference_mode()
    def embed(self, waveform: np.ndarray) -> list[float]:
        if waveform.ndim != 1 or waveform.size == 0:
            raise ValueError("Decoded waveform is empty")
        window_vectors: list[torch.Tensor] = []
        for start in range(0, waveform.size, self.window_samples):
            chunk = waveform[start : start + self.window_samples]
            if chunk.size < self.sample_rate:  # ignore a final fragment shorter than one second
                continue
            inputs = self.processor(chunk, sampling_rate=self.sample_rate, return_tensors="pt")
            input_values = inputs["input_values"].to(self.device)
            outputs = self.model(input_values=input_values)
            pooled = outputs.last_hidden_state.mean(dim=1).squeeze(0)
            window_vectors.append(pooled.float().cpu())
        if not window_vectors:
            raise ValueError("Audio is too short to create a MERT vector")
        vector = torch.stack(window_vectors).mean(dim=0)
        vector = torch.nn.functional.normalize(vector, p=2, dim=0)
        return vector.numpy().astype(np.float32).tolist()


def ensure_collection(client: QdrantClient, contract: dict[str, Any]) -> None:
    names = {item.name for item in client.get_collections().collections}
    size = int(contract["vector_size"])
    if COLLECTION not in names:
        client.create_collection(
            collection_name=COLLECTION,
            vectors_config=VectorParams(size=size, distance=Distance.COSINE),
        )
        print(f"[qdrant] created {COLLECTION} ({size}D cosine)", flush=True)
        return
    info = client.get_collection(COLLECTION)
    vectors = info.config.params.vectors
    existing_size = getattr(vectors, "size", None)
    if existing_size is not None and int(existing_size) != size:
        raise RuntimeError(f"Qdrant collection is {existing_size}D, expected {size}D")


def existing_ids(client: QdrantClient, ids: list[int]) -> set[int]:
    if not ids:
        return set()
    points = client.retrieve(COLLECTION, ids=ids, with_payload=False, with_vectors=False)
    return {int(point.id) for point in points if isinstance(point.id, int)}


def flush_points(client: QdrantClient, points: list[PointStruct]) -> int:
    if not points:
        return 0
    count = len(points)
    client.upsert(collection_name=COLLECTION, wait=True, points=points)
    points.clear()
    return count


def audio_member_candidates(track_id: int) -> list[str]:
    tid = f"{track_id:06d}"
    relative = f"{tid[:3]}/{tid}.mp3"
    return [f"fma_large/{relative}", relative]


def build_payload(track_id: int, row: pd.Series, genre_names: dict[int, str], contract: dict[str, Any]) -> dict[str, Any]:
    genre_ids = [int(x) for x in as_list(col(row, "track", "genres")) if str(x).lstrip("-").isdigit()]
    genres = [genre_names.get(gid, str(gid)) for gid in genre_ids][:20]
    tags = [safe_text(x, 80) for x in as_list(col(row, "track", "tags"))]
    tags = [x for x in tags if x][:20]
    payload = {
        "source": "fma_large",
        "source_track_id": track_id,
        "title": safe_text(col(row, "track", "title")),
        "artist": safe_text(col(row, "artist", "name")),
        "album": safe_text(col(row, "album", "title")),
        "genre_top": safe_text(col(row, "track", "genre_top"), 120),
        "genres": genres,
        "tags": tags,
        "license": safe_text(col(row, "track", "license"), 300),
        "subset": safe_text(col(row, "set", "subset"), 50),
        "split": safe_text(col(row, "set", "split"), 50),
        "embedding_contract": contract["contract_id"],
        "embedding_model": contract["model"],
        "embedding_model_revision": contract.get("model_revision"),
    }
    return {k: v for k, v in payload.items() if v not in (None, [], "")}


def run(args: argparse.Namespace) -> None:
    contract = load_contract()
    qdrant_url = env_required("QDRANT_URL").rstrip("/")
    qdrant_key = env_required("QDRANT_API_KEY")
    client = QdrantClient(url=qdrant_url, api_key=qdrant_key, timeout=60)
    ensure_collection(client, contract)

    tracks, genre_names = load_metadata(args.metadata_url)
    ids = sorted(int(i) for i in tracks.index)
    if args.start_id:
        ids = [i for i in ids if i >= args.start_id]
    if args.limit:
        ids = ids[: args.limit]
    print(f"[fma] candidate tracks: {len(ids):,}", flush=True)

    device = args.device
    if device == "auto":
        device = "cuda" if torch.cuda.is_available() else "cpu"
    embedder = MertEmbedder(contract, device)

    print(f"[fma] opening 93 GiB audio archive remotely; no full local download: {args.audio_url}", flush=True)
    processed = skipped = failed = 0
    failures: list[tuple[int, str]] = []
    pending: list[PointStruct] = []
    started = time.time()

    with RemoteZip(args.audio_url) as rz:
        names = set(rz.namelist())
        for offset in range(0, len(ids), args.resume_batch):
            batch_ids = ids[offset : offset + args.resume_batch]
            done = existing_ids(client, batch_ids)
            for track_id in batch_ids:
                if track_id in done:
                    skipped += 1
                    continue
                row = tracks.loc[track_id]
                member = next((candidate for candidate in audio_member_candidates(track_id) if candidate in names), None)
                if member is None:
                    failed += 1
                    failures.append((track_id, "audio member missing"))
                    continue
                try:
                    with rz.open(member) as fh:
                        audio_bytes = fh.read()
                    waveform = ffmpeg_decode_mono_24k(audio_bytes, int(contract["sample_rate_hz"]))
                    vector = embedder.embed(waveform)
                    payload = build_payload(track_id, row, genre_names, contract)
                    pending.append(PointStruct(id=track_id, vector=vector, payload=payload))
                    if len(pending) >= args.upsert_batch:
                        processed += flush_points(client, pending)
                except KeyboardInterrupt:
                    raise
                except Exception as exc:
                    failed += 1
                    failures.append((track_id, str(exc)[:500]))
                    print(f"[warn] track {track_id}: {exc}", file=sys.stderr, flush=True)

                total_seen = processed + len(pending) + skipped + failed
                if total_seen % args.progress_every == 0:
                    elapsed = max(time.time() - started, 0.001)
                    new_total = processed + len(pending)
                    print(
                        f"[progress] seen={total_seen:,} new={new_total:,} skipped={skipped:,} failed={failed:,} "
                        f"new_rate={new_total / elapsed:.2f}/s",
                        flush=True,
                    )

            # Persist a partial write batch at each resume boundary. At most one
            # resume_batch needs to be re-checked after an interruption.
            processed += flush_points(client, pending)

        processed += flush_points(client, pending)

    print(f"[done] new={processed:,} skipped={skipped:,} failed={failed:,}", flush=True)
    if failures:
        Path(args.failure_log).write_text(
            "\n".join(f"{track_id}\t{message}" for track_id, message in failures) + "\n",
            encoding="utf-8",
        )
        print(f"[done] failure log: {args.failure_log}", flush=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--metadata-url", default=FMA_METADATA_URL)
    parser.add_argument("--audio-url", default=FMA_LARGE_URL)
    parser.add_argument("--device", default="auto", choices=["auto", "cuda", "cpu"])
    parser.add_argument("--start-id", type=int, default=0)
    parser.add_argument("--limit", type=int, default=0, help="0 means all tracks")
    parser.add_argument("--resume-batch", type=int, default=500)
    parser.add_argument("--upsert-batch", type=int, default=32)
    parser.add_argument("--progress-every", type=int, default=100)
    parser.add_argument("--failure-log", default="fma_qdrant_failures.tsv")
    return parser.parse_args()


if __name__ == "__main__":
    run(parse_args())
