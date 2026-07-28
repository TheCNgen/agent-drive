import mammoth from 'mammoth';
import { Mistral } from '@mistralai/mistralai';

// Constants
const TEXT_PROCESSING_CONFIG = {
  CHUNK_SIZE: {
    DEFAULT: 1000,
    MIN_LENGTH: 50
  },
  TOPIC_EXTRACTION: {
    MIN_WORD_LENGTH: 4,
    MAX_TOPICS: 5
  },
  PDF_PROCESSING: {
    ENCODING: 'utf-8' as const,
    FALLBACK_MESSAGE: '[PDF Document] This PDF was successfully parsed but contains no extractable text. It may be an image-based PDF or contain only graphics and forms. The document is available for download and manual review.'
  }
} as const;

const SUPPORTED_MIME_TYPES = {
  PDF: 'application/pdf',
  DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  TEXT: 'text/plain'
} as const;

const ERROR_MESSAGES = {
  PDF_PARSE_FAILED: 'PDF parsing failed',
  PDF_PROCESSING_FAILED: 'Failed to process PDF content',
  PDF_EXTRACTION_FAILED: 'PDF extraction failed',
  TEXT_EXTRACTION_FAILED: 'Failed to extract text from file type',
  UNKNOWN_ERROR: 'Unknown error'
} as const;

const LOG_MESSAGES = {
  PDF_PARSE_ERROR: 'PDF parsing error:',
  PDF_PROCESSING_ERROR: 'Error processing PDF data:',
  PDF_EXTRACTION_SETUP_ERROR: 'PDF extraction setup error:',
  PDF_PARSED_SUCCESS: 'PDF parsed successfully. Pages:',
  TEXT_LENGTH: 'Total extracted text length:',
  TEXT_CHARACTERS: 'characters',
  NO_TEXT_FOUND: 'No text content found in PDF',
  TEXT_EXTRACTION_ERROR: 'Error extracting text:',
  PROCESSING_ERROR: 'Error processing text file:',
  UNSUPPORTED_MIME_WARNING: 'Unsupported MIME type:',
  ATTEMPTING_PLAIN_TEXT: 'attempting plain text extraction',
} as const;

// Types
export interface ProcessedText {
  content: string;
  chunks: string[];
  wordCount: number;
  topics: string[];
}

interface ChunkingOptions {
  maxChunkSize?: number;
  minChunkLength?: number;
}

interface TopicExtractionOptions {
  minWordLength?: number;
  maxTopics?: number;
}

type SupportedMimeType = typeof SUPPORTED_MIME_TYPES[keyof typeof SUPPORTED_MIME_TYPES];

// Helper Functions
function createPDFError(message: string, originalError?: any): Error {
  const errorMessage = originalError instanceof Error 
    ? originalError.message 
    : String(originalError);
  return new Error(`${message}: ${errorMessage}`);
}


async function extractPDFText(fileBuffer: Buffer): Promise<string> {
  if (!process.env.MISTRAL_API_KEY) {
    throw new Error('MISTRAL_API_KEY is missing');
  }
  
  const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
  let uploadedFileId: string | null = null;
  
  try {
    const uploadRes = await client.files.upload({
      file: { fileName: "document.pdf", content: fileBuffer },
      purpose: "ocr"
    });
    
    uploadedFileId = uploadRes.id;
    
    const signedUrlRes = await client.files.getSignedUrl({ fileId: uploadedFileId });
    
    const ocrRes = await client.ocr.process({
      model: "mistral-ocr-latest",
      document: { type: "document_url", documentUrl: signedUrlRes.url }
    });
    
    let extractedText = "";
    if (ocrRes.pages && Array.isArray(ocrRes.pages)) {
      for (const page of ocrRes.pages) {
        if (page.markdown) {
          extractedText += page.markdown + "\n\n";
        }
      }
    }
    
    return extractedText.trim() || TEXT_PROCESSING_CONFIG.PDF_PROCESSING.FALLBACK_MESSAGE;
  } catch (error) {
    console.error(LOG_MESSAGES.PDF_PROCESSING_ERROR, error);
    throw createPDFError(ERROR_MESSAGES.PDF_EXTRACTION_FAILED, error);
  } finally {
    if (uploadedFileId) {
      try {
        await client.files.delete({ fileId: uploadedFileId });
      } catch (e) {
        console.error("Failed to delete mistral file:", e);
      }
    }
  }
}

async function extractDOCXText(fileBuffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    return result.value;
  } catch (error) {
    throw new Error(`DOCX extraction failed: ${error instanceof Error ? error.message : ERROR_MESSAGES.UNKNOWN_ERROR}`);
  }
}

function extractPlainText(fileBuffer: Buffer): string {
  try {
    return fileBuffer.toString(TEXT_PROCESSING_CONFIG.PDF_PROCESSING.ENCODING);
  } catch (error) {
    throw new Error(`Plain text extraction failed: ${error instanceof Error ? error.message : ERROR_MESSAGES.UNKNOWN_ERROR}`);
  }
}

export async function extractTextFromFile(fileBuffer: Buffer, mimeType: string): Promise<string> {
  try {
    const normalizedMimeType = mimeType.toLowerCase().trim() as SupportedMimeType;

    switch (normalizedMimeType) {
      case SUPPORTED_MIME_TYPES.PDF:
        return await extractPDFText(fileBuffer);
      
      case SUPPORTED_MIME_TYPES.DOCX:
        return await extractDOCXText(fileBuffer);
      
      case SUPPORTED_MIME_TYPES.TEXT:
        return extractPlainText(fileBuffer);
      
      default:
        console.warn(`${LOG_MESSAGES.UNSUPPORTED_MIME_WARNING} ${mimeType}, ${LOG_MESSAGES.ATTEMPTING_PLAIN_TEXT}`);
        return extractPlainText(fileBuffer);
    }
  } catch (error) {
    console.error(LOG_MESSAGES.TEXT_EXTRACTION_ERROR, error);
    const errorMessage = error instanceof Error ? error.message : ERROR_MESSAGES.UNKNOWN_ERROR;
    throw new Error(`${ERROR_MESSAGES.TEXT_EXTRACTION_FAILED}: ${mimeType} - ${errorMessage}`);
  }
}

function splitTextIntoParagraphs(text: string): string[] {
  return text
    .split('\n\n')
    .map(p => p.trim())
    .filter(p => p.length > 0);
}

function shouldStartNewChunk(currentChunk: string, paragraph: string, maxChunkSize: number): boolean {
  return (currentChunk + paragraph).length > maxChunkSize && currentChunk.length > 0;
}

function combineTextSegments(currentChunk: string, paragraph: string): string {
  return currentChunk + (currentChunk ? '\n\n' : '') + paragraph;
}

export function chunkText(text: string, options: ChunkingOptions = {}): string[] {
  const {
    maxChunkSize = TEXT_PROCESSING_CONFIG.CHUNK_SIZE.DEFAULT,
    minChunkLength = TEXT_PROCESSING_CONFIG.CHUNK_SIZE.MIN_LENGTH
  } = options;

  // Safety check: ensure text is a string
  if (typeof text !== 'string') {
    console.error('chunkText received non-string input:', typeof text, text);
    return [];
  }

  if (!text.trim()) return [];

  const paragraphs = splitTextIntoParagraphs(text);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    if (shouldStartNewChunk(currentChunk, paragraph, maxChunkSize)) {
      chunks.push(currentChunk.trim());
      currentChunk = paragraph;
    } else {
      currentChunk = combineTextSegments(currentChunk, paragraph);
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  // Filter out chunks that are too short
  return chunks.filter(chunk => chunk.length >= minChunkLength);
}

function extractWordsFromText(text: string, minWordLength: number): string[] {
  const pattern = new RegExp(`\\b\\w{${minWordLength},}\\b`, 'g');
  return text.toLowerCase().match(pattern) || [];
}

function countWordFrequencies(words: string[]): Record<string, number> {
  return words.reduce((wordCount, word) => {
    wordCount[word] = (wordCount[word] || 0) + 1;
    return wordCount;
  }, {} as Record<string, number>);
}

function getTopFrequentWords(wordCount: Record<string, number>, maxTopics: number): string[] {
  return Object.entries(wordCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, maxTopics)
    .map(([word]) => word);
}

export function extractTopics(text: string, options: TopicExtractionOptions = {}): string[] {
  const {
    minWordLength = TEXT_PROCESSING_CONFIG.TOPIC_EXTRACTION.MIN_WORD_LENGTH,
    maxTopics = TEXT_PROCESSING_CONFIG.TOPIC_EXTRACTION.MAX_TOPICS
  } = options;

  // Safety check: ensure text is a string
  if (typeof text !== 'string') {
    console.error('extractTopics received non-string input:', typeof text, text);
    return [];
  }

  if (!text.trim()) return [];

  const words = extractWordsFromText(text, minWordLength);
  const wordCount = countWordFrequencies(words);
  return getTopFrequentWords(wordCount, maxTopics);
}

function calculateWordCount(text: string): number {
  // Safety check: ensure text is a string
  if (typeof text !== 'string') {
    console.error('calculateWordCount received non-string input:', typeof text, text);
    return 0;
  }
  
  if (!text.trim()) return 0;
  return text.trim().split(/\s+/).length;
}

export async function processTextFile(
  fileBuffer: Buffer, 
  mimeType: string,
  options: {
    chunking?: ChunkingOptions;
    topicExtraction?: TopicExtractionOptions;
  } = {}
): Promise<ProcessedText> {
  try {
    const content = await extractTextFromFile(fileBuffer, mimeType);
    
    const [chunks, topics, wordCount] = await Promise.all([
      Promise.resolve(chunkText(content, options.chunking)),
      Promise.resolve(extractTopics(content, options.topicExtraction)),
      Promise.resolve(calculateWordCount(content))
    ]);

    return {
      content,
      chunks,
      wordCount,
      topics
    };
  } catch (error) {
    console.error(LOG_MESSAGES.PROCESSING_ERROR, error);
    throw error;
  }
} 