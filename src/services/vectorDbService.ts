import { pipeline, env } from '@huggingface/transformers';
import { MODELS } from '../config/models';
import initSqlJs from '@sqlite.org/sqlite-wasm';

// Prefer local models for offline-first operation.
env.useBrowserCache = true;
(env as any).localModelPath = '/models/';
if ('allowRemoteModels' in (env as any)) {
  (env as any).allowRemoteModels = false;
}

export interface VectorDocument {
  id: string;
  documentId: string;
  documentName: string;
  content: string;
  embedding: number[];
  metadata: any;
}

type SqliteDatabase = any;

export class VectorDbService {
  private extractor: any = null;
  private db: SqliteDatabase | null = null;
  private isInitialized: boolean = false;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this._init();
    await this.initPromise;
  }

  private async _init(): Promise<void> {
    const SQL: any = await initSqlJs();

    let data: Uint8Array | null = null;
    try {
      const opfsRoot = await navigator.storage.getDirectory();
      const fileHandle = await opfsRoot.getFileHandle('vector_db.sqlite', { create: true });
      const file = await fileHandle.getFile();
      data = new Uint8Array(await file.arrayBuffer());
    } catch {
      console.log('[VectorDb] No existing OPFS data, starting fresh');
    }

    if (data && data.byteLength > 0) {
      this.db = new SQL.Database(data);
    } else {
      this.db = new SQL.Database();
    }

    this.db.run(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        document_name TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding BLOB NOT NULL,
        metadata TEXT,
        created_at INTEGER DEFAULT (unixepoch())
      )
    `);

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_document_id ON documents(document_id)`);

    this.extractor = await pipeline('feature-extraction', MODELS.embeddings.miniLm as any);
    this.isInitialized = true;
    console.log('[VectorDb] Initialized with OPFS storage');
  }

  private async saveToOpfs(): Promise<void> {
    if (!this.db) return;
    const data = this.db.export();
    const buffer = new Uint8Array(data);
    
    try {
      const opfsRoot = await navigator.storage.getDirectory();
      const fileHandle = await opfsRoot.getFileHandle('vector_db.sqlite', { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(buffer);
      await writable.close();
    } catch (err) {
      console.error('[VectorDb] Failed to save to OPFS:', err);
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.isInitialized) await this.init();
    
    const output = await this.extractor(text, {
      pooling: 'mean',
      normalize: true,
    });
    
    return Array.from(output.data);
  }

  async addDocument(doc: Omit<VectorDocument, 'embedding'>): Promise<void> {
    if (!this.isInitialized) await this.init();
    if (!this.db) throw new Error('Database not initialized');

    const embedding = await this.generateEmbedding(doc.content);
    const embeddingBlob = new Float32Array(embedding);
    
    this.db.run(
      `INSERT INTO documents (id, document_id, document_name, content, embedding, metadata) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        doc.id,
        doc.documentId,
        doc.documentName,
        doc.content,
        embeddingBlob,
        JSON.stringify(doc.metadata || {})
      ]
    );

    await this.saveToOpfs();
  }

  async loadFromStorage(): Promise<void> {
    await this.init();
  }

  removeDocument(documentId: string): void {
    if (!this.db) return;
    this.db.run('DELETE FROM documents WHERE document_id = ?', [documentId]);
    this.saveToOpfs();
  }

  async search(query: string, limit: number = 3): Promise<VectorDocument[]> {
    if (!this.isInitialized) await this.init();
    if (!this.db) throw new Error('Database not initialized');
    
    const queryEmbedding = await this.generateEmbedding(query);
    
    const results = this.db.exec(`
      SELECT id, document_id, document_name, content, embedding, metadata 
      FROM documents
    `);

    if (!results.length || !results[0].values.length) {
      return [];
    }

    const docs: VectorDocument[] = results[0].values.map((row: any) => {
      return {
        id: row[0],
        documentId: row[1],
        documentName: row[2],
        content: row[3],
        embedding: Array.from(new Float32Array(row[4])),
        metadata: JSON.parse(row[5] || '{}')
      };
    });

    return docs
      .map(doc => ({
        ...doc,
        similarity: this.cosineSimilarity(queryEmbedding, doc.embedding)
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  clear(): void {
    if (!this.db) return;
    this.db.run('DELETE FROM documents');
    this.saveToOpfs();
  }

  getDocuments(): VectorDocument[] {
    if (!this.db) return [];
    
    const results = this.db.exec(`SELECT id, document_id, document_name, content, embedding, metadata FROM documents`);
    if (!results.length || !results[0].values.length) return [];

    return results[0].values.map((row: any) => {
      return {
        id: row[0],
        documentId: row[1],
        documentName: row[2],
        content: row[3],
        embedding: Array.from(new Float32Array(row[4])),
        metadata: JSON.parse(row[5] || '{}')
      };
    });
  }
}

export const vectorDbService = new VectorDbService();
