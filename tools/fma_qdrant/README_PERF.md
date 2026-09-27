# Performance benchmark procedure

1. Ensure the target Qdrant collection already contains the previous benchmark corpus so resume/skip behavior is exercised.
2. Run the importer against a larger `--limit` so approximately 1,000 new tracks are embedded.
3. Compare the final `elapsed` and `new_rate` values with the prior baseline.
4. If CUDA memory is insufficient for the default window batch, the importer automatically retries with smaller batches.

The optimization does not alter model revision, sample rate, five-second windows, time pooling, window pooling, L2 normalization, vector size, or cosine distance.
