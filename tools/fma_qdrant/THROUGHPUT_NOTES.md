# FMA→MERT→Qdrant throughput notes

The optimized importer preserves the existing `promptbeats-mert95-similarity-v1` embedding contract while improving GPU utilization by batching equal-length five-second MERT windows across multiple decoded tracks.

Default performance-oriented settings:

- `--track-batch 4`
- `--inference-batch 24`
- `--upsert-batch 64`

CUDA out-of-memory errors during a window batch are handled by automatically splitting the batch and retrying, so aggressive defaults degrade safely on smaller GPUs.

For benchmark comparisons, use already-populated Qdrant state so existing IDs are skipped and measure only newly embedded tracks. Record the final `elapsed` and `new_rate` fields from the importer output.
