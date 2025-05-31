import fs from 'fs/promises';
import path from 'path';
import { BlobServiceClient, ContainerClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions } from '@azure/storage-blob';
import { DefaultAzureCredential } from '@azure/identity';

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
    private accountKey?: string;    private containerName: string;
    private usingManagedIdentity: boolean = false;
    private fallbackToConnection: boolean = false;
    private initializationFailed: boolean = false;constructor() {
        const storageAccountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
        const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;

        this.containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'documentsroot';

        if (storageAccountName) {
            // Try DefaultAzureCredential with managed identity first
            console.log('Initializing Azure Blob Storage with DefaultAzureCredential (managed identity)');
            this.accountName = storageAccountName;
            this.usingManagedIdentity = true;
            const credential = new DefaultAzureCredential();
            this.blobServiceClient = new BlobServiceClient(
                `https://${storageAccountName}.blob.core.windows.net`,
                credential
            );
            this.containerClient = this.blobServiceClient.getContainerClient(this.containerName);
            
            // Try to initialize with managed identity, fallback to connection string if it fails            // Handle this async operation properly to prevent unhandled promise rejections
            this.initializeContainerWithFallback(connectionString).catch(error => {
                console.error('⚠️ Blob storage initialization failed completely:', error);
                this.initializationFailed = true;
                // Don't re-throw here to prevent unhandled promise rejection
                // The service will fail gracefully when methods are called
            });
        } else if (connectionString) {
            // Direct connection string authentication
            console.log('Initializing Azure Blob Storage with connection string authentication');
            this.accountName = this.extractAccountName(connectionString);
            this.accountKey = this.extractAccountKey(connectionString);
            this.blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
            this.containerClient = this.blobServiceClient.getContainerClient(this.containerName);            this.initializeContainer().catch(error => {
                console.error('⚠️ Blob storage initialization failed:', error);
                this.initializationFailed = true;
                // Don't re-throw here to prevent unhandled promise rejection
            });        } else {
            console.log('⚠️ No Azure Storage credentials provided - storage service will fail gracefully');
            console.log('   Set AZURE_STORAGE_ACCOUNT_NAME for managed identity or AZURE_STORAGE_CONNECTION_STRING for connection string auth');
            this.initializationFailed = true;
            // Create minimal placeholder clients to prevent crashes
            this.accountName = 'placeholder';
            this.containerName = 'placeholder';
            this.usingManagedIdentity = false;
        }
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

    private async initializeContainerWithFallback(connectionString?: string): Promise<void> {
        try {
            console.log(`Attempting to initialize container ${this.containerName} with managed identity...`);
            await this.containerClient.createIfNotExists();
            console.log(`✅ Container ${this.containerName} initialized successfully with managed identity`);
        } catch (error) {
            console.error('Error initializing blob container:', error);
            console.log(`DefaultAzureCredential failed, falling back to connection string: ${error instanceof Error ? error.message : 'Unknown error'}`);
            
            if (connectionString) {
                try {
                    console.log('Using connection string authentication for Azure Blob Storage');
                    this.accountName = this.extractAccountName(connectionString);
                    this.accountKey = this.extractAccountKey(connectionString);
                    this.blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
                    this.containerClient = this.blobServiceClient.getContainerClient(this.containerName);
                    this.usingManagedIdentity = false;
                    this.fallbackToConnection = true;
                    
                    await this.containerClient.createIfNotExists();
                    console.log(`✅ Container ${this.containerName} initialized successfully with connection string`);
                } catch (connectionError) {
                    console.error('Error initializing blob storage service with connection string:', connectionError);                    // For unhandled promise rejection, we need to handle this gracefully
                    const rejectionError = new Error(
                        `Failed to initialize Azure Blob Storage. Both managed identity and connection string authentication failed. ` +
                        `Managed Identity Error: ${error instanceof Error ? error.message : 'Unknown'}. ` +
                        `Connection String Error: ${connectionError instanceof Error ? connectionError.message : 'Unknown'}`
                    );
                    
                    // Log as unhandled promise rejection to match the error log format
                    console.log('🚨 UNHANDLED PROMISE REJECTION:', rejectionError.message, rejectionError);
                    this.initializationFailed = true;
                    throw rejectionError;
                }
            } else {                const noFallbackError = new Error(
                    `Failed to initialize Azure Blob Storage with managed identity and no connection string fallback available. ` +
                    `Error: ${error instanceof Error ? error.message : 'Unknown'}`
                );
                console.log('🚨 UNHANDLED PROMISE REJECTION:', noFallbackError.message, noFallbackError);
                this.initializationFailed = true;
                throw noFallbackError;
            }
        }
    }    async uploadFile(fileBuffer: Buffer, blobName: string, contentType: string): Promise<string> {
        if (this.initializationFailed) {
            throw new Error('Azure Blob Storage service is not available due to initialization failure');
        }
        
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
        if (this.initializationFailed) {
            throw new Error('Azure Blob Storage service is not available due to initialization failure');
        }
        
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
        if (this.initializationFailed) {
            throw new Error('Azure Blob Storage service is not available due to initialization failure');
        }
        
        try {
            const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
            await blockBlobClient.delete();
        } catch (error) {
            console.error('Error deleting from blob storage:', error);
            throw error;
        }
    }

    async fileExists(blobName: string): Promise<boolean> {
        if (this.initializationFailed) {
            console.warn('Azure Blob Storage service is not available due to initialization failure - returning false for fileExists');
            return false;
        }
        
        try {
            const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
            return await blockBlobClient.exists();
        } catch (error) {
            console.error('Error checking file existence in blob storage:', error);
            throw error;
        }
    }

    private generateSasUrl(blobName: string, expiryMinutes: number = 60): string {
        if (this.usingManagedIdentity || !this.accountKey) {
            // When using managed identity, we can't generate SAS tokens with account keys
            // Return the direct blob URL instead
            console.log('Using direct blob URL (managed identity - no SAS token generation)');
            return `https://${this.accountName}.blob.core.windows.net/${this.containerName}/${blobName}`;
        }

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