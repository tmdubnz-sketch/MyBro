import * as pdfjsLib from 'pdfjs-dist';

// Set worker path for pdfjs-dist
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export interface DocumentChunk {
  id: string;
  documentId: string;
  documentName: string;
  content: string;
  metadata: any;
}

export class DocumentService {
  async parseFile(file: File): Promise<{ content: string; name: string }> {
    if (file.type === 'application/pdf') {
      return this.parsePdf(file);
    } else if (file.type === 'text/plain' || file.type === 'text/markdown') {
      return this.parseText(file);
    } else {
      throw new Error('Unsupported file type');
    }
  }

  private async parseText(file: File): Promise<{ content: string; name: string }> {
    const content = await file.text();
    return { content, name: file.name };
  }

  private async parsePdf(file: File): Promise<{ content: string; name: string }> {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      fullText += pageText + '\n';
    }
    
    return { content: fullText, name: file.name };
  }

  chunkDocument(content: string, documentId: string, documentName: string): DocumentChunk[] {
    const chunkSize = 1000;
    const chunkOverlap = 200;
    const chunks: DocumentChunk[] = [];
    
    let start = 0;
    while (start < content.length) {
      const end = Math.min(start + chunkSize, content.length);
      const chunkContent = content.substring(start, end);
      
      chunks.push({
        id: crypto.randomUUID(),
        documentId,
        documentName,
        content: chunkContent,
        metadata: {
          start,
          end
        }
      });
      
      start += chunkSize - chunkOverlap;
    }
    
    return chunks;
  }
}

export const documentService = new DocumentService();
