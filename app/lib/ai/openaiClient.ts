export interface EmbeddingResult {
  embedding: number[];
  text: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: any;
  };
}

export async function generateEmbedding(text: string): Promise<number[]> {
  throw new Error("Not implemented yet");
}

export async function generateEmbeddings(texts: string[]): Promise<EmbeddingResult[]> {
  throw new Error("Not implemented yet");
}

export async function chatCompletion(
  messages: ChatMessage[],
  tools?: ChatTool[],
  temperature: number = 0.7
): Promise<any> {
  throw new Error("Not implemented yet");
}

export const openai = null;
