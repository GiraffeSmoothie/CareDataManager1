import { BlobServiceClient } from '@azure/storage-blob';
import { ValidationError } from '../middleware/error';
import crypto from 'crypto';
import path from 'path';

export class BlobStorageService {
  private blobServiceClient: BlobServiceClient;
  private containerName: string;
  private allowedMimeTypes = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png'
  ]);
  private maxFileSize = 5 * 1024 * 1024; // 5MB

  constructor() {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!connectionString) {
      throw new Error('Azure Storage connection string not found');
    }
    this.blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    this.containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'documentsroot';
  }

  private validateFile(buffer: Buffer, mimeType: string): void {
    // Check file size
    if (buffer.length > this.maxFileSize) {
      throw new ValidationError(`File size exceeds maximum limit of ${this.maxFileSize / 1024 / 1024}MB`);
    }

    // Check mime type
    if (!this.allowedMimeTypes.has(mimeType)) {
      throw new ValidationError('Invalid file type');
    }

    // Basic file content validation
    const fileSignature = buffer.slice(0, 4).toString('hex');
    const validSignatures = {
      'application/pdf': '25504446',
      'image/jpeg': 'ffd8ffe0',
      'image/png': '89504e47'
    };

    const expectedSignature = validSignatures[mimeType as keyof typeof validSignatures];
    if (expectedSignature && !fileSignature.startsWith(expectedSignature)) {
      throw new ValidationError('File content does not match declared type');
    }
  }

  private sanitizeFileName(fileName: string): string {
    // Remove any path components and non-alphanumeric characters
    const sanitized = path.basename(fileName).replace(/[^a-zA-Z0-9.-]/g, '_');
    // Add random suffix for uniqueness
    const extension = path.extname(sanitized);
    const name = path.basename(sanitized, extension);
    const randomSuffix = crypto.randomBytes(4).toString('hex');
    return `${name}_${randomSuffix}${extension}`;
  }

  async uploadFile(buffer: Buffer, blobPath: string, mimeType: string): Promise<string> {
    this.validateFile(buffer, mimeType);
    
    const containerClient = this.blobServiceClient.getContainerClient(this.containerName);
    await containerClient.createIfNotExists();

    const sanitizedPath = this.sanitizeFileName(blobPath);
    const blockBlobClient = containerClient.getBlockBlobClient(sanitizedPath);

    await blockBlobClient.uploadData(buffer, {
      blobHTTPHeaders: {
        blobContentType: mimeType,
        blobCacheControl: 'private, no-cache, no-store, must-revalidate'
      }
    });

    return sanitizedPath;
  }

  async downloadFile(blobPath: string): Promise<Buffer> {
    const containerClient = this.blobServiceClient.getContainerClient(this.containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobPath);
    
    const downloadResponse = await blockBlobClient.download(0);
    
    if (!downloadResponse.readableStreamBody) {
      throw new Error('Could not read file stream');
    }

    // Convert stream to buffer
    const chunks: Buffer[] = [];
    for await (const chunk of downloadResponse.readableStreamBody) {
      chunks.push(Buffer.from(chunk));
    }
    
    return Buffer.concat(chunks);
  }
}