export type SimilarityInput = {
  prompt?: string | null;
  genre?: string | null;
};

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
  "και",
  "με",
  "σε",
  "στο",
  "στη",
  "στην",
  "στον",
  "τα",
  "τη",
  "την",
  "το",
  "των",
]);

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function similarityTokens(value: string | null | undefined) {
  const tokens = normalize(value)
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
  return [...new Set(tokens)];
}

function jaccard(a: string[], b: string[]) {
  if (!a.length || !b.length) return 0;
  const aSet = new Set(a);
  const bSet = new Set(b);
  let intersection = 0;
  for (const token of aSet) if (bSet.has(token)) intersection += 1;
  const union = aSet.size + bSet.size - intersection;
  return union ? intersection / union : 0;
}

function bigrams(tokens: string[]) {
  const result: string[] = [];
  for (let index = 0; index < tokens.length - 1; index += 1) {
    result.push(`${tokens[index]} ${tokens[index + 1]}`);
  }
  return result;
}

export function scoreSimilarSong(source: SimilarityInput, candidate: SimilarityInput) {
  const sourceTokens = similarityTokens(source.prompt);
  const candidateTokens = similarityTokens(candidate.prompt);
  const hasPromptEvidence = sourceTokens.length >= 3 && candidateTokens.length >= 3;
  const tokenScore = hasPromptEvidence ? jaccard(sourceTokens, candidateTokens) : 0;
  const phraseScore = hasPromptEvidence ? jaccard(bigrams(sourceTokens), bigrams(candidateTokens)) : 0;
  const sourceGenre = normalize(source.genre);
  const candidateGenre = normalize(candidate.genre);
  const genreMatch = Boolean(sourceGenre && candidateGenre && sourceGenre === candidateGenre);
  const genreScore = genreMatch ? 1 : 0;

  const score = hasPromptEvidence
    ? Math.min(1, tokenScore * 0.68 + phraseScore * 0.17 + genreScore * 0.15)
    : genreScore * 0.55;

  return {
    score,
    matchedOn: hasPromptEvidence ? (genreMatch ? "prompt_genre" : "prompt") : "genre",
    promptScore: hasPromptEvidence ? tokenScore * 0.8 + phraseScore * 0.2 : 0,
    genreMatch,
  } as const;
}
