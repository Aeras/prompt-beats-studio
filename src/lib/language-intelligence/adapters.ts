/**
 * Prompt-Agnostic Adapters
 * Connects the transient Language Intelligence prompt block to any generator prompt version.
 */
export function injectPromptLanguage(
  promptVersion: string,
  cleanLanguage: string,
  promptLanguageBlock: string,
  isApplied: boolean,
): string {
  if (!isApplied) return cleanLanguage;
  return promptLanguageBlock;
}
