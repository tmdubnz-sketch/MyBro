import { pipeline, env } from '@xenova/transformers';

// Configure transformers.js for local use
env.allowLocalModels = false;
env.useBrowserCache = true;

export interface VectorDocument {
  id: string;
  documentId: string;
  documentName: string;
  content: string;
  embedding: number[];
  metadata: any;
}

export class VectorDbService {
  private extractor: any = null;
  private documents: VectorDocument[] = [];
  private isInitialized: boolean = false;

  async init() {
    if (this.isInitialized) return;
    
    // Use a small, efficient model for embeddings
    this.extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    this.isInitialized = true;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.isInitialized) await this.init();
    
    const output = await this.extractor(text, {
      pooling: 'mean',
      normalize: true,
    });
    
    return Array.from(output.data);
  }

  async addDocument(doc: Omit<VectorDocument, 'embedding'>) {
    const embedding = await this.generateEmbedding(doc.content);
    const fullDoc = { ...doc, embedding };
    this.documents.push(fullDoc);
    
    // In a real app with OPFS-backed SQLite, we would save to SQLite here.
    // For this demo, we'll keep it in memory but simulate the interface.
    this.saveToStorage();
  }

  private saveToStorage() {
    // Simulate saving to OPFS/SQLite
    localStorage.setItem('vector_db_docs', JSON.stringify(this.documents));
  }

  async loadFromStorage() {
    const saved = localStorage.getItem('vector_db_docs');
    if (saved) {
      this.documents = JSON.parse(saved);
    }
  }

  removeDocument(documentId: string) {
    this.documents = this.documents.filter(doc => doc.documentId !== documentId);
    this.saveToStorage();
  }

  async search(query: string, limit: number = 3): Promise<VectorDocument[]> {
    if (!this.isInitialized) await this.init();
    
    const queryEmbedding = await this.generateEmbedding(query);
    
    const results = this.documents
      .map(doc => ({
        ...doc,
        similarity: this.cosineSimilarity(queryEmbedding, doc.embedding)
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
      
    return results;
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

  clear() {
    this.documents = [];
    localStorage.removeItem('vector_db_docs');
  }

  getDocuments() {
    return this.documents;
  }
}

export const vectorDbService = new VectorDbService();
