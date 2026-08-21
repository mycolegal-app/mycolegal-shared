// `word-extractor` no publica tipos ni tiene @types. Declaración mínima con lo
// que usamos: extraer texto de .doc/.docx desde un Buffer.
declare module 'word-extractor' {
  interface WordDocument {
    getBody(): string;
    getFootnotes(): string;
    getEndnotes(): string;
    getHeaders(): string;
    getFooters(): string;
    getAnnotations(): string;
  }
  export default class WordExtractor {
    extract(input: string | Buffer): Promise<WordDocument>;
  }
}
