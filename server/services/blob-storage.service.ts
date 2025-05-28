import { BlobServiceClient, ContainerClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions } from '@azure/storage-blob';
import { DefaultAzureCredential } from '@azure/identity';

export class BlobStorageService {
    private containerClient!: ContainerClient;
    private blobServiceClient!: BlobServiceClient;
    private accountName!: string;
    private accountKey!: string;
    private containerName!: string;constructor() {
        this.initializeService();
    }

    private async initializeService(): Promise<void> {
        // Try to use DefaultAzureCredential first (for managed identity)
        const storageAccountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
        
        if (storageAccountName) {
            try {
                // Use DefaultAzureCredential for managed identity authentication
                console.log('Attempting DefaultAzureCredential for Azure Blob Storage authentication (managed identity)');
                const credential = new DefaultAzureCredential();
                const blobServiceUrl = `https://${storageAccountName}.blob.core.windows.net`;
                this.blobServiceClient = new BlobServiceClient(blobServiceUrl, credential);
                this.accountName = storageAccountName;
                this.accountKey = ''; // Not needed with managed identity
                
                this.containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'documents';
                this.containerClient = this.blobServiceClient.getContainerClient(this.containerName);
                
                // Test the connection by trying to initialize container
                await this.initializeContainer();
                console.log('Successfully initialized Azure Blob Storage with DefaultAzureCredential');
                return;            } catch (error) {
                console.log('DefaultAzureCredential failed, falling back to connection string:', error instanceof Error ? error.message : String(error));
                // Fall through to connection string fallback
            }
        }
        
        // Fallback to connection string
        console.log('Using connection string authentication for Azure Blob Storage');
        const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
        if (!connectionString) {
            throw new Error('Neither DefaultAzureCredential nor AZURE_STORAGE_CONNECTION_STRING are available');
        }
        
        try {
            // Extract account name and key from connection string
            this.accountName = this.extractAccountName(connectionString);
            this.accountKey = this.extractAccountKey(connectionString);
            this.blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
            
            this.containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'documents';
            this.containerClient = this.blobServiceClient.getContainerClient(this.containerName);
            await this.initializeContainer();
            console.log('Successfully initialized Azure Blob Storage with connection string');
        } catch (error) {
            console.error('Error initializing blob storage service with connection string:', error);
            throw error;
        }
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
        try {
            // Create the container if it doesn't exist, with no public access
            await this.containerClient.createIfNotExists();
            console.log(`Container ${this.containerName} initialized without public access`);
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

            // Generate a SAS URL with read access for 1 hour
            const sasUrl = this.generateSasUrl(blobName);
            return sasUrl;
        } catch (error) {
            console.error('Error uploading to blob storage:', error);
            throw error;
        }
    }

    async downloadFile(blobName: string): Promise<Buffer> {
        try {
            const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
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
    }    // Generate a SAS URL for a blob with read access
    generateSasUrl(blobName: string, expiryMinutes: number = 60): string {
        // If using managed identity (no account key), return the blob URL directly
        // Note: In production with managed identity, you might want to implement
        // a different approach for secure access, such as using user delegation SAS
        if (!this.accountKey) {
            console.log('Using managed identity - returning direct blob URL (ensure container has appropriate access policies)');
            return `https://${this.accountName}.blob.core.windows.net/${this.containerName}/${blobName}`;
        }
        
        // Original SAS URL generation using account key
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