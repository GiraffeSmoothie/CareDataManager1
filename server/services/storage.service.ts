import fs from 'fs/promises';
import path from 'path';
import { BlobServiceClient, ContainerClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions } from '@azure/storage-blob';

export interface IStorageService {
    uploadFile(fileBuffer: Buffer, filePath: string, contentType: string): Promise<string>;
    downloadFile(filePath: string): Promise<Buffer>;
    deleteFile(filePath: string): Promise<void>;
    fileExists(filePath: string): Promise<boolean>;
}

export class LocalStorageService implements IStorageService {
    private uploadsDir: string;

    constructor() {
        // Use DOCUMENTS_ROOT_PATH from env or default to 'uploads' in current directory
        this.uploadsDir = process.env.DOCUMENTS_ROOT_PATH || path.join(process.cwd(), 'uploads');
        // Ensure uploads directory exists
        fs.mkdir(this.uploadsDir, { recursive: true }).catch(console.error);
    }

    async uploadFile(fileBuffer: Buffer, filePath: string, contentType: string): Promise<string> {
        const fullPath = path.join(this.uploadsDir, filePath);
        // Ensure directory exists
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, fileBuffer);
        return filePath;
    }

    async downloadFile(filePath: string): Promise<Buffer> {
        const fullPath = path.join(this.uploadsDir, filePath);
        return fs.readFile(fullPath);
    }

    async deleteFile(filePath: string): Promise<void> {
        const fullPath = path.join(this.uploadsDir, filePath);
        await fs.unlink(fullPath);
    }

    async fileExists(filePath: string): Promise<boolean> {
        const fullPath = path.join(this.uploadsDir, filePath);
        try {
            await fs.access(fullPath);
            return true;
        } catch {
            return false;
        }
    }
}

export class AzureBlobStorageService implements IStorageService {
    private containerClient: ContainerClient;
    private blobServiceClient: BlobServiceClient;
    private accountName: string;
    private accountKey: string;
    private containerName: string;

    constructor() {
        const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
        if (!connectionString) {
            throw new Error('Azure Storage connection string not found in environment variables');
        }

        this.accountName = this.extractAccountName(connectionString);
        this.accountKey = this.extractAccountKey(connectionString);
        this.blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
        this.containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'documents';
        this.containerClient = this.blobServiceClient.getContainerClient(this.containerName);
        this.initializeContainer();
    }

    private extractAccountName(connectionString: string): string {
        const matches = connectionString.match(/AccountName=([^;]+)/i);
        if (!matches || matches.length < 2) {
            throw new Error('Account name not found in connection string');
        }
        return matches[1];
    }

    private extractAccountKey(connectionString: string): string {
        const matches = connectionString.match(/AccountKey=([^;]+)/i);
        if (!matches || matches.length < 2) {
            throw new Error('Account key not found in connection string');
        }
        return matches[1];
    }

    private async initializeContainer(): Promise<void> {
        try {
            await this.containerClient.createIfNotExists();
            console.log(`Container ${this.containerName} initialized`);
        } catch (error) {
            console.error('Error initializing blob container:', error);
            throw error;
        }
    }

    async uploadFile(fileBuffer: Buffer, blobName: string, contentType: string): Promise<string> {
        try {
            const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
            await blockBlobClient.upload(fileBuffer, fileBuffer.length, {
                blobHTTPHeaders: {
                    blobContentType: contentType
                }
            });
            return this.generateSasUrl(blobName);
        } catch (error) {
            console.error('Error uploading to blob storage:', error);
            throw error;
        }
    }

    async downloadFile(blobName: string): Promise<Buffer> {
        try {
            const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
            const downloadResponse = await blockBlobClient.download(0);
            const chunks: Buffer[] = [];
            for await (const chunk of downloadResponse.readableStreamBody!) {
                chunks.push(Buffer.from(chunk));
            }
            return Buffer.concat(chunks);
        } catch (error) {
            console.error('Error downloading from blob storage:', error);
            throw error;
        }
    }

    async deleteFile(blobName: string): Promise<void> {
        try {
            const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
            await blockBlobClient.delete();
        } catch (error) {
            console.error('Error deleting from blob storage:', error);
            throw error;
        }
    }

    async fileExists(blobName: string): Promise<boolean> {
        try {
            const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
            return await blockBlobClient.exists();
        } catch (error) {
            console.error('Error checking file existence in blob storage:', error);
            throw error;
        }
    }

    private generateSasUrl(blobName: string, expiryMinutes: number = 60): string {
        const sharedKeyCredential = new StorageSharedKeyCredential(
            this.accountName,
            this.accountKey
        );
        
        const sasOptions = {
            containerName: this.containerName,
            blobName: blobName,
            permissions: BlobSASPermissions.parse("r"),
            startsOn: new Date(),
            expiresOn: new Date(new Date().valueOf() + expiryMinutes * 60 * 1000),
        };
        
        const sasToken = generateBlobSASQueryParameters(
            sasOptions,
            sharedKeyCredential
        ).toString();
        
        return `https://${this.accountName}.blob.core.windows.net/${this.containerName}/${blobName}?${sasToken}`;
    }
}

// Factory function to create the appropriate storage service
export function createStorageService(): IStorageService {
    const isDevelopment = process.env.NODE_ENV === 'development';
    if (isDevelopment) {
        console.log('Using local file storage for development');
        return new LocalStorageService();
    } else {
        console.log('Using Azure Blob storage for production');
        return new AzureBlobStorageService();
    }
}