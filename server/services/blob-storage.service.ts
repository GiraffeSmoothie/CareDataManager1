import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';

export class BlobStorageService {
    private containerClient: ContainerClient;
    private blobServiceClient: BlobServiceClient;

    constructor() {
        const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
        if (!connectionString) {
            throw new Error('Azure Storage connection string not found in environment variables');
        }

        this.blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
        const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'documents';
        this.containerClient = this.blobServiceClient.getContainerClient(containerName);
        this.initializeContainer();
    }

    private async initializeContainer(): Promise<void> {
        try {
            // Create the container if it doesn't exist
            await this.containerClient.createIfNotExists({
                access: 'blob' // This makes the blobs public readable
            });
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

            return blockBlobClient.url;
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
}