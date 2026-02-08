export function hasOpenAIKey(): boolean {
    return Boolean(process.env.OPENAI_API_KEY);
  }
  