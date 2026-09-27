#!/usr/bin/env python3
from __future__ import annotations
import argparse, ast, io, json, os, queue, shutil, subprocess, sys, threading, time
from collections import deque
from concurrent.futures import Future, ThreadPoolExecutor
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
    if isinstance(value, list): return value
    if value is None or (isinstance(value, float) and np.isnan(value)): return []
    if isinstance(value, str):
        text = value.strip()
        if not text: return []
        try:
            parsed = ast.literal_eval(text)
            return parsed if isinstance(parsed, list) else [parsed]
        except Exception:
            return [text]
    return [value]

def safe_text(value: Any, limit: int = 300) -> str | None:
    if value is None or (isinstance(value, float) and np.isnan(value)): return None
    text = str(value).strip()
    return text[:limit] if text else None

def col(row: pd.Series, group: str, name: str) -> Any:
    key = (group, name)
    return row[key] if key in row.index else None

def load_metadata(metadata_url: str):
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
        ["ffmpeg","-hide_banner","-loglevel","error","-i","pipe:0",
         "-f","f32le","-acodec","pcm_f32le","-ac","1","-ar",str(sample_rate),"pipe:1"],
        input=audio_bytes, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if proc.returncode != 0 or not proc.stdout:
        detail = proc.stderr.decode("utf-8", errors="replace")[-500:]
        raise RuntimeError(f"ffmpeg decode failed: {detail}")
    return np.frombuffer(proc.stdout, dtype=np.float32).copy()

class MertEmbedder:
    def __init__(self, contract: dict[str, Any], device: str, embed_batch: int):
        self.sample_rate = int(contract["sample_rate_hz"])
        self.window_samples = int(contract["window_seconds"] * self.sample_rate)
        self.embed_batch = max(1, int(embed_batch))
        model_name = str(contract["model"])
        revision = str(contract.get("model_revision") or "main")
        print(f"[mert] loading {model_name}@{revision} on {device} (window_batch={self.embed_batch})", flush=True)
        self.processor = Wav2Vec2FeatureExtractor.from_pretrained(model_name, revision=revision)
        self.model = AutoModel.from_pretrained(model_name, revision=revision, trust_remote_code=True)
        self.device = torch.device(device)
        self.model.to(self.device)
        self.model.eval()
        hidden = int(getattr(self.model.config, "hidden_size", 0))
        if hidden != int(contract["vector_size"]):
            raise RuntimeError(f"MERT hidden size {hidden} does not match contract vector size {contract['vector_size']}")

    @torch.inference_mode()
    def _embed_equal_length_batch(self, chunks: list[np.ndarray]) -> list[torch.Tensor]:
        inputs = self.processor(chunks, sampling_rate=self.sample_rate, return_tensors="pt")
        outputs = self.model(input_values=inputs["input_values"].to(self.device))
        pooled = outputs.last_hidden_state.mean(dim=1).float().cpu()
        return [row for row in pooled]

    @torch.inference_mode()
    def _embed_single(self, chunk: np.ndarray) -> torch.Tensor:
        inputs = self.processor(chunk, sampling_rate=self.sample_rate, return_tensors="pt")
        outputs = self.model(input_values=inputs["input_values"].to(self.device))
        return outputs.last_hidden_state.mean(dim=1).squeeze(0).float().cpu()

    def embed(self, waveform: np.ndarray) -> list[float]:
        if waveform.ndim != 1 or waveform.size == 0:
            raise ValueError("Decoded waveform is empty")
        full_chunks, tail_chunks = [], []
        for start in range(0, waveform.size, self.window_samples):
            chunk = waveform[start:start+self.window_samples]
            if chunk.size < self.sample_rate: continue
            (full_chunks if chunk.size == self.window_samples else tail_chunks).append(chunk)
        window_vectors = []
        for start in range(0, len(full_chunks), self.embed_batch):
            window_vectors.extend(self._embed_equal_length_batch(full_chunks[start:start+self.embed_batch]))
        for chunk in tail_chunks:
            window_vectors.append(self._embed_single(chunk))
        if not window_vectors:
            raise ValueError("Audio is too short to create a MERT vector")
        vector = torch.stack(window_vectors).mean(dim=0)
        vector = torch.nn.functional.normalize(vector, p=2, dim=0)
        return vector.numpy().astype(np.float32).tolist()

def ensure_collection(client, contract):
    names = {item.name for item in client.get_collections().collections}
    size = int(contract["vector_size"])
    if COLLECTION not in names:
        client.create_collection(collection_name=COLLECTION, vectors_config=VectorParams(size=size, distance=Distance.COSINE))
        print(f"[qdrant] created {COLLECTION} ({size}D cosine)", flush=True)
        return
    info = client.get_collection(COLLECTION)
    existing_size = getattr(info.config.params.vectors, "size", None)
    if existing_size is not None and int(existing_size) != size:
        raise RuntimeError(f"Qdrant collection is {existing_size}D, expected {size}D")

def existing_ids(client, ids):
    if not ids: return set()
    points = client.retrieve(COLLECTION, ids=ids, with_payload=False, with_vectors=False)
    return {int(point.id) for point in points if isinstance(point.id, int)}

def find_existing_ids(client, ids, batch_size):
    found = set()
    for start in range(0, len(ids), batch_size):
        found.update(existing_ids(client, ids[start:start+batch_size]))
    return found

class AsyncQdrantWriter:
    def __init__(self, client, max_inflight: int):
        self.client = client
        self.max_inflight = max(1, int(max_inflight))
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="qdrant-upsert")
        self.futures = deque()
        self.submitted = 0
        self.committed = 0

    def _write(self, points):
        self.client.upsert(collection_name=COLLECTION, wait=True, points=points)

    def _collect_one(self, block: bool):
        if not self.futures: return False
        future, count = self.futures[0]
        if not block and not future.done(): return False
        future.result()
        self.futures.popleft()
        self.committed += count
        return True

    def collect_ready(self):
        while self._collect_one(False):
            pass

    def submit(self, points):
        if not points: return
        batch = list(points)
        points.clear()
        while len(self.futures) >= self.max_inflight:
            self._collect_one(True)
        self.futures.append((self.executor.submit(self._write, batch), len(batch)))
        self.submitted += len(batch)

    def drain(self):
        while self.futures:
            self._collect_one(True)
        self.executor.shutdown(wait=True)
        return self.committed

def audio_member_candidates(track_id: int):
    tid = f"{track_id:06d}"
    relative = f"{tid[:3]}/{tid}.mp3"
    return [f"fma_large/{relative}", relative]

def build_payload(track_id, row, genre_names, contract):
    genre_ids = [int(x) for x in as_list(col(row,"track","genres")) if str(x).lstrip("-").isdigit()]
    genres = [genre_names.get(gid, str(gid)) for gid in genre_ids][:20]
    tags = [safe_text(x,80) for x in as_list(col(row,"track","tags"))]
    tags = [x for x in tags if x][:20]
    payload = {
        "source":"fma_large","source_track_id":track_id,
        "title":safe_text(col(row,"track","title")),
        "artist":safe_text(col(row,"artist","name")),
        "album":safe_text(col(row,"album","title")),
        "genre_top":safe_text(col(row,"track","genre_top"),120),
        "genres":genres,"tags":tags,
        "license":safe_text(col(row,"track","license"),300),
        "subset":safe_text(col(row,"set","subset"),50),
        "split":safe_text(col(row,"set","split"),50),
        "embedding_contract":contract["contract_id"],
        "embedding_model":contract["model"],
        "embedding_model_revision":contract.get("model_revision"),
    }
    return {k:v for k,v in payload.items() if v not in (None, [], "")}

def audio_producer(audio_url, track_ids, sample_rate, output):
    try:
        with RemoteZip(audio_url) as rz:
            names = set(rz.namelist())
            for track_id in track_ids:
                member = next((c for c in audio_member_candidates(track_id) if c in names), None)
                if member is None:
                    output.put((track_id, None, "audio member missing")); continue
                try:
                    with rz.open(member) as fh:
                        audio_bytes = fh.read()
                    output.put((track_id, ffmpeg_decode_mono_24k(audio_bytes, sample_rate), None))
                except Exception as exc:
                    output.put((track_id, None, str(exc)[:500]))
    except Exception as exc:
        output.put((-1, None, f"audio producer failed: {exc}"))
    finally:
        output.put(None)

def print_progress(seen, new_total, committed, skipped, failed, target_new, started):
    elapsed = max(time.time() - started, 0.001)
    rate = new_total / elapsed
    remaining = max(target_new - new_total, 0)
    eta = remaining / rate if rate > 0 else 0
    print(f"[progress] seen={seen:,} new={new_total:,} committed={committed:,} skipped={skipped:,} failed={failed:,} rate={rate:.2f}/s elapsed={elapsed/60:.1f}m eta={eta/60:.1f}m", flush=True)

def run(args):
    contract = load_contract()
    client = QdrantClient(url=env_required("QDRANT_URL").rstrip("/"), api_key=env_required("QDRANT_API_KEY"), timeout=60)
    ensure_collection(client, contract)

    tracks, genre_names = load_metadata(args.metadata_url)
    ids = sorted(int(i) for i in tracks.index)
    if args.start_id: ids = [i for i in ids if i >= args.start_id]
    if args.limit: ids = ids[:args.limit]
    print(f"[fma] candidate tracks: {len(ids):,}", flush=True)

    done = find_existing_ids(client, ids, args.resume_batch)
    todo_ids = [track_id for track_id in ids if track_id not in done]
    skipped = len(ids) - len(todo_ids)
    if args.max_new: todo_ids = todo_ids[:args.max_new]
    print(f"[resume] existing={skipped:,} new_target={len(todo_ids):,}" + (f" (max_new={args.max_new:,})" if args.max_new else ""), flush=True)
    if not todo_ids:
        print(f"[done] new=0 skipped={skipped:,} failed=0", flush=True); return

    device = args.device
    if device == "auto": device = "cuda" if torch.cuda.is_available() else "cpu"
    embedder = MertEmbedder(contract, device, args.embed_batch)

    print(f"[fma] opening 93 GiB audio archive remotely; no full local download: {args.audio_url}", flush=True)
    print(f"[pipeline] prefetch={args.prefetch} qdrant_batch={args.upsert_batch} qdrant_inflight={args.qdrant_inflight}", flush=True)

    prepared = queue.Queue(maxsize=max(1, args.prefetch))
    producer = threading.Thread(target=audio_producer, args=(args.audio_url, todo_ids, int(contract["sample_rate_hz"]), prepared), name="fma-audio-prefetch", daemon=True)
    writer = AsyncQdrantWriter(client, args.qdrant_inflight)
    pending, failures = [], []
    failed = embedded = 0
    seen = skipped
    started = time.time()
    producer.start()

    try:
        while True:
            item = prepared.get()
            if item is None: break
            track_id, waveform, error = item
            if track_id == -1:
                raise RuntimeError(error or "audio producer failed")
            seen += 1
            if error is not None or waveform is None:
                failed += 1; failures.append((track_id, error or "audio preparation failed"))
                print(f"[warn] track {track_id}: {error}", file=sys.stderr, flush=True)
            else:
                try:
                    vector = embedder.embed(waveform)
                    pending.append(PointStruct(id=track_id, vector=vector, payload=build_payload(track_id, tracks.loc[track_id], genre_names, contract)))
                    embedded += 1
                    if len(pending) >= args.upsert_batch:
                        writer.submit(pending); writer.collect_ready()
                except KeyboardInterrupt:
                    raise
                except Exception as exc:
                    failed += 1; failures.append((track_id, str(exc)[:500]))
                    print(f"[warn] track {track_id}: {exc}", file=sys.stderr, flush=True)
            if seen % args.progress_every == 0 or embedded == len(todo_ids):
                writer.collect_ready()
                print_progress(seen, embedded, writer.committed, skipped, failed, len(todo_ids), started)

        writer.submit(pending)
        committed = writer.drain()
        producer.join(timeout=5)
    except BaseException:
        writer.submit(pending)
        writer.drain()
        raise

    elapsed = max(time.time() - started, 0.001)
    print(f"[done] new={committed:,} skipped={skipped:,} failed={failed:,} elapsed={elapsed/60:.1f}m rate={committed/elapsed:.2f}/s", flush=True)
    if failures:
        Path(args.failure_log).write_text("\n".join(f"{track_id}\t{message}" for track_id,message in failures) + "\n", encoding="utf-8")
        print(f"[done] failure log: {args.failure_log}", flush=True)

def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--metadata-url", default=FMA_METADATA_URL)
    p.add_argument("--audio-url", default=FMA_LARGE_URL)
    p.add_argument("--device", default="auto", choices=["auto","cuda","cpu"])
    p.add_argument("--start-id", type=int, default=0)
    p.add_argument("--limit", type=int, default=0, help="0 means all candidate tracks")
    p.add_argument("--max-new", type=int, default=0, help="hard cap on newly embedded tracks for this run; 0 means no extra cap")
    p.add_argument("--resume-batch", type=int, default=500)
    p.add_argument("--upsert-batch", type=int, default=64)
    p.add_argument("--qdrant-inflight", type=int, default=2)
    p.add_argument("--prefetch", type=int, default=8)
    p.add_argument("--embed-batch", type=int, default=6)
    p.add_argument("--progress-every", type=int, default=50)
    p.add_argument("--failure-log", default="fma_qdrant_failures.tsv")
    return p.parse_args()

if __name__ == "__main__":
    run(parse_args())
