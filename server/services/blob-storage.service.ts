import { BlobServiceClient, ContainerClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions } from '@azure/storage-blob';

export class BlobStorageService {
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
    }

    // Generate a SAS URL for a blob with read access
    generateSasUrl(blobName: string, expiryMinutes: number = 60): string {
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