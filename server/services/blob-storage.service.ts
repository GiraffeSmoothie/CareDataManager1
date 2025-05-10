import { BlobServiceClient, ContainerClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions } from '@azure/storage-blob';
import fs from 'fs';
import path from 'path';

export class BlobStorageService {
    private containerClient: ContainerClient | null = null;
    private blobServiceClient: BlobServiceClient | null = null;
    private accountName: string = '';
    private accountKey: string = '';
    private containerName: string = '';
    private isDevelopment: boolean;
    private localStoragePath: string;

    constructor() {
        this.isDevelopment = process.env.NODE_ENV === 'development';
        this.localStoragePath = path.join(process.cwd(), 'uploads');

        if (this.isDevelopment) {
            // Ensure local storage directory exists
            if (!fs.existsSync(this.localStoragePath)) {
                fs.mkdirSync(this.localStoragePath, { recursive: true });
            }
            console.log('Running in development mode with local file storage');
            return;
        }

        const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
        if (!connectionString) {
            throw new Error('Azure Storage connection string not found in environment variables');
        }

        // Extract account name and key from connection string
        this.accountName = this.extractAccountName(connectionString);
        this.accountKey = this.extractAccountKey(connectionString);

        this.blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
        this.containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'documents';
        this.containerClient = this.blobServiceClient.getContainerClient(this.containerName);
        this.initializeContainer();
    }

    // Extract account name from connection string
    private extractAccountName(connectionString: string): string {
        const matches = connectionString.match(/AccountName=([^;]+)/i);
        if (!matches || matches.length < 2) {
            throw new Error('Account name not found in connection string');
        }
        return matches[1];
    }

    // Extract account key from connection string
    private extractAccountKey(connectionString: string): string {
        const matches = connectionString.match(/AccountKey=([^;]+)/i);
        if (!matches || matches.length < 2) {
            throw new Error('Account key not found in connection string');
        }
        return matches[1];
    }

    private async initializeContainer(): Promise<void> {
        if (this.isDevelopment) return;

        try {
            // Create the container if it doesn't exist, with no public access
            await this.containerClient!.createIfNotExists();
            console.log(`Container ${this.containerName} initialized without public access`);
        } catch (error) {
            console.error('Error initializing blob container:', error);
            throw error;
        }
    }

    async uploadFile(fileBuffer: Buffer, blobName: string, contentType: string): Promise<string> {
        if (this.isDevelopment) {
            try {
                const filePath = path.join(this.localStoragePath, blobName);
                const dirPath = path.dirname(filePath);
                
                // Ensure directory exists
                if (!fs.existsSync(dirPath)) {
                    fs.mkdirSync(dirPath, { recursive: true });
                }
                
                fs.writeFileSync(filePath, fileBuffer);
                return `file://${filePath}`;
            } catch (error) {
                console.error('Error saving file locally:', error);
                throw error;
            }
        }

        try {
            const blockBlobClient = this.containerClient!.getBlockBlobClient(blobName);
            
            await blockBlobClient.upload(fileBuffer, fileBuffer.length, {
                blobHTTPHeaders: {
                    blobContentType: contentType
                }
            });

            // Generate a SAS URL with read access for 1 hour
            const sasUrl = this.generateSasUrl(blobName);
            return sasUrl;
        } catch (error) {
            console.error('Error uploading to blob storage:', error);
            throw error;
        }
    }

    async downloadFile(blobName: string): Promise<Buffer> {
        if (this.isDevelopment) {
            try {
                const filePath = path.join(this.localStoragePath, blobName);
                return fs.readFileSync(filePath);
            } catch (error) {
                console.error('Error reading file locally:', error);
                throw error;
            }
        }

        try {
            const blockBlobClient = this.containerClient!.getBlockBlobClient(blobName);
            const downloadResponse = await blockBlobClient.download(0);
            
            // Convert stream to buffer
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
        if (this.isDevelopment) {
            try {
                const filePath = path.join(this.localStoragePath, blobName);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
                return;
            } catch (error) {
                console.error('Error deleting file locally:', error);
                throw error;
            }
        }

        try {
            const blockBlobClient = this.containerClient!.getBlockBlobClient(blobName);
            await blockBlobClient.delete();
        } catch (error) {
            console.error('Error deleting from blob storage:', error);
            throw error;
        }
    }

    async fileExists(blobName: string): Promise<boolean> {
        if (this.isDevelopment) {
            const filePath = path.join(this.localStoragePath, blobName);
            return fs.existsSync(filePath);
        }

        try {
            const blockBlobClient = this.containerClient!.getBlockBlobClient(blobName);
            return await blockBlobClient.exists();
        } catch (error) {
            console.error('Error checking file existence in blob storage:', error);
            throw error;
        }
    }

    // Generate a SAS URL for a blob with read access
    generateSasUrl(blobName: string, expiryMinutes: number = 60): string {
        if (this.isDevelopment) {
            const filePath = path.join(this.localStoragePath, blobName);
            return `file://${filePath}`;
        }

        const sharedKeyCredential = new StorageSharedKeyCredential(
            this.accountName,
            this.accountKey
        );
        
        const sasOptions = {
            containerName: this.containerName,
            blobName: blobName,
            permissions: BlobSASPermissions.parse("r"), // Read permission only
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