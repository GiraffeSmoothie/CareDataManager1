import { useRef, useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./dialog";
import { Button } from "./button";
import { Textarea } from "./textarea";
import { Label } from "./label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Paperclip, X, Upload, Plus, Eye, ArrowDown } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { ErrorDisplay } from "./error-display";
import { Checkbox } from "./checkbox";
import { Badge } from "./badge";
import { Input } from "./input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

/**
 * Helper function to view documents securely using the new viewing endpoint
 * @param filePath - The file path of the document to view
 * @param toast - Toast function for error notifications
 */
const viewDocumentSecurely = async (filePath: string, toast?: any) => {
  try {
    // Use the new secure viewing endpoint that handles authentication
    const viewUrl = `/api/documents/view/${encodeURIComponent(filePath)}`;
    
    // Make the request through apiRequest to include authentication headers
    const response = await apiRequest('GET', viewUrl);
    
    // Create a blob URL for viewing
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    
    // Open in a new window
    window.open(blobUrl, '_blank');
    
    // Clean up the blob URL after a short delay
    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
    }, 100);
  } catch (error) {
    console.error('Error viewing document:', error);
    if (toast) {
      toast({
        title: "Error",
        description: "Failed to view document. Please try again.",
        variant: "destructive",
      });
    }
  }
};

/**
 * Helper function to download documents securely
 * @param filePath - The file path of the document to download
 * @param fileName - The suggested filename for download
 * @param toast - Toast function for error notifications
 */
const downloadDocumentSecurely = async (filePath: string, fileName: string, toast?: any) => {
  try {
    // Use the existing download endpoint but with proper authentication
    const downloadUrl = `/api/documents/${encodeURIComponent(filePath)}`;
    
    // Make the request through apiRequest to include authentication headers
    const response = await apiRequest('GET', downloadUrl);
    
    // Create a blob URL for download
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    
    // Create a temporary anchor element to trigger download
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up the blob URL
    URL.revokeObjectURL(blobUrl);
    
    if (toast) {
      toast({
        title: "Success",
        description: "Document downloaded successfully.",
      });
    }
  } catch (error) {
    console.error('Error downloading document:', error);
    if (toast) {
      toast({
        title: "Error",
        description: "Failed to download document. Please try again.",
        variant: "destructive",
      });
    }
  }
};

// Define MemberService interface since it's not exported from schema
interface MemberService {
  id: number;
  clientId: number;
  serviceCategory: string;
  serviceType: string;
  serviceProvider: string;
  serviceStartDate?: string;
  serviceDays?: string[];
  serviceHours?: number;
  notes?: string;
  status: string;
  createdAt?: string;
  createdBy?: number;
  personId?: number;
  serviceName?: string;
  frequency?: string;
}

// Define a type for case notes
interface CaseNote {
  id: number;
  serviceId: number;
  noteText: string;
  createdAt: string;
  createdBy: number;
  createdByName?: string;
  documents?: Document[];
}

// Define a type for documents (matching the schema)
interface Document {
  id: number;
  clientId: number;
  documentName: string;
  documentType: string;
  filename: string;
  filePath: string;
  uploadedAt: string;
  createdBy: number;
  segmentId?: number;
}

export function CaseNotesModal({
  isOpen,
  onClose,
  service,
  onSaved
}: {
  isOpen: boolean;
  onClose: () => void;
  service: MemberService | null;
  onSaved?: () => void;
}) {  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [currentUser, setCurrentUser] = useState<{ id: number; name?: string } | null>(null);
  const [caseNotes, setCaseNotes] = useState<CaseNote[]>([]);
  const [isLoadingNotes, setIsLoadingNotes] = useState(false);
    // Document attachment state
  const [availableDocuments, setAvailableDocuments] = useState<Document[]>([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<number[]>([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  
  // Document upload state
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDocumentName, setUploadDocumentName] = useState("");
  const [uploadDocumentType, setUploadDocumentType] = useState("");
  const [isUploading, setIsUploading] = useState(false);
    // Document types for upload
  const documentTypes = [
    "Identity Document",
    "Medical Record", 
    "Legal Document",
    "Care Plan",
    "Assessment",
    "Invoice",
    "Sign Up Docs",
    "Other"
  ];  // Fetch current user info when component mounts
  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        const response = await apiRequest('GET', '/api/auth/status');
        const data = await response.json();
        if (data.valid && data.user) {
          setCurrentUser(data.user);
        }
      } catch (error) {
        console.error('Failed to fetch user info:', error);
      }
    };

    fetchCurrentUser();
  }, []);
  // Fetch case notes when the service changes or modal opens
  useEffect(() => {
    if (service?.id && isOpen) {
      fetchCaseNotes();
      fetchAvailableDocuments();
    }
  }, [service?.id, isOpen]);
  // Function to fetch available documents for the client
  const fetchAvailableDocuments = async () => {
    if (!service?.clientId) {
      return;
    }

    setIsLoadingDocuments(true);
    try {
      const response = await apiRequest("GET", `/api/documents/client/${service.clientId}`);
      const data = await response.json();
      setAvailableDocuments(data.data || []);
    } catch (error) {
      console.error('Error fetching documents:', error);
      // Don't set error state for documents as it's optional
    } finally {
      setIsLoadingDocuments(false);
    }
  };  // Function to fetch existing case notes
  const fetchCaseNotes = async () => {
    if (!service?.id) {
      setError("No service selected");
      return;
    }
    
    setIsLoadingNotes(true);
    setError(null);
    try {
      const response = await apiRequest("GET", `/api/service-case-notes/service/${service.id}`);
      const data = await response.json();
      setCaseNotes(data);
    } catch (error) {
      console.error('Error fetching case notes:', error);
      setError('Failed to load existing case notes');
    } finally {
      setIsLoadingNotes(false);
    }
  };
  
  // Function to handle document upload
  const handleDocumentUpload = async () => {
    if (!uploadFile || !uploadDocumentName.trim() || !uploadDocumentType) {
      toast({
        title: "Error",
        description: "Please fill all upload fields and select a file",
        variant: "destructive",
      });
      return;
    }

    if (!service?.clientId) {
      toast({
        title: "Error", 
        description: "No client ID available",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);    try {
      const formData = new FormData();
      formData.append("clientId", service.clientId.toString());
      formData.append("documentName", uploadDocumentName);
      formData.append("documentType", uploadDocumentType);
      formData.append("file", uploadFile);
      // Add segmentId to associate the document with this service
      if (service.id) {
        formData.append("segmentId", service.id.toString());
      }

      const response = await apiRequest("POST", "/api/documents", formData, true);
      
      if (!response.ok) {
        throw new Error("Failed to upload document");
      }

      const result = await response.json();
      
      toast({
        title: "Success",
        description: "Document uploaded successfully",
      });

      // Reset upload form
      setUploadFile(null);
      setUploadDocumentName("");
      setUploadDocumentType("");
      setShowUploadForm(false);
      
      // Refresh available documents
      await fetchAvailableDocuments();
        // Auto-select the newly uploaded document
      if (result?.id) {
        setSelectedDocumentIds(prev => [...prev, result.id]);
      }
      
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to upload document",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async () => {
    const notes = textareaRef.current?.value;
    if (!notes?.trim()) {
      setError("Please enter case notes");
      return;
    }

    // Check if user is logged in
    if (!currentUser?.id) {
      setError("You must be logged in to add case notes");
      return;
    }

    // Check if service is available
    if (!service?.id) {
      setError("No service selected");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {      // Use the correct API endpoint for service case notes
      const response = await apiRequest("POST", "/api/service-case-notes", {
        serviceId: service.id,
        noteText: notes,
        createdBy: currentUser.id,
        documentIds: selectedDocumentIds.length > 0 ? selectedDocumentIds : undefined
      });

      if (!response.ok) {
        throw new Error("Failed to save case note");
      }

      toast({
        title: "Success",
        description: "Case note saved successfully",
      });
        // Reset the text area and selected documents
      if (textareaRef.current) {
        textareaRef.current.value = '';
      }
      setSelectedDocumentIds([]);
      
      // Refresh the case notes list
      await fetchCaseNotes();
      
      if (onSaved) {
        onSaved();
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to save case note");
    } finally {
      setIsLoading(false);
    }
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {service ? `Case Notes - ${service.serviceCategory} (${service.serviceType})` : 'Service Case Notes'}
          </DialogTitle>
          <DialogDescription>
            Add new notes and view existing case notes for this service.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <ErrorDisplay
            message={error}
            className="mb-4"
          />
        )}

        <div className="grid gap-4 py-4 overflow-y-auto flex-grow">
          {/* Add new case note - moved to top */}          <div className="space-y-2">
            <Label htmlFor="case-notes">Add New Case Note</Label>
            <Textarea
              id="case-notes"
              ref={textareaRef}
              placeholder="Enter case notes here..."
              className="min-h-[120px]"
            />
          </div>

          {/* Document attachment section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Paperclip className="h-4 w-4" />
              <Label>Attach Documents (Optional)</Label>
            </div>
            
            {isLoadingDocuments ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading available documents...
              </div>
            ) : availableDocuments.length > 0 ? (
              <div className="space-y-2 max-h-32 overflow-y-auto border rounded-md p-3">
                {availableDocuments.map((doc) => (
                  <div key={doc.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`doc-${doc.id}`}
                      checked={selectedDocumentIds.includes(doc.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedDocumentIds(prev => [...prev, doc.id]);
                        } else {
                          setSelectedDocumentIds(prev => prev.filter(id => id !== doc.id));
                        }
                      }}
                    />                    <label
                      htmlFor={`doc-${doc.id}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                    >
                      <div className="flex items-center gap-2">
                        <span>{doc.documentName}</span>
                        <Badge variant="secondary" className="text-xs">
                          {doc.documentType}
                        </Badge>
                      </div>
                    </label>
                    <div className="flex items-center gap-1 ml-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => viewDocumentSecurely(doc.filePath || '', toast)}
                        title="View Document"
                        className="h-6 w-6 p-0 hover:bg-blue-100"
                      >
                        <Eye className="h-3 w-3 text-blue-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => downloadDocumentSecurely(doc.filePath || '', doc.documentName || 'download', toast)}
                        title="Download Document"
                        className="h-6 w-6 p-0 hover:bg-green-100"
                      >
                        <ArrowDown className="h-3 w-3 text-green-600" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 italic">
                No documents available for this client. Upload documents first to attach them to case notes.
              </p>
            )}            {selectedDocumentIds.length > 0 && (
              <div className="flex flex-wrap gap-1">
                <span className="text-sm text-gray-600">Selected:</span>
                {selectedDocumentIds.map((docId) => {
                  const doc = availableDocuments.find(d => d.id === docId);
                  return doc ? (
                    <Badge key={docId} variant="outline" className="text-xs flex items-center gap-1">
                      <span>{doc.documentName}</span>
                      <div className="flex items-center gap-1 ml-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => viewDocumentSecurely(doc.filePath || '', toast)}
                          title="View Document"
                          className="h-4 w-4 p-0 hover:bg-blue-100"
                        >
                          <Eye className="h-3 w-3 text-blue-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => downloadDocumentSecurely(doc.filePath || '', doc.documentName || 'download', toast)}
                          title="Download Document"
                          className="h-4 w-4 p-0 hover:bg-green-100"
                        >
                          <ArrowDown className="h-3 w-3 text-green-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-4 w-4 p-0 hover:bg-red-100"
                          onClick={() => setSelectedDocumentIds(prev => prev.filter(id => id !== docId))}
                          title="Remove from selection"
                        >
                          <X className="h-3 w-3 text-red-600" />
                        </Button>
                      </div>
                    </Badge>
                  ) : null;
                })}
              </div>
            )}
          </div>          {/* Document upload form */}
          <div className="space-y-2 pt-4 border-t">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Upload New Document</h3>
              {!showUploadForm && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowUploadForm(true)}
                  className="flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add Document
                </Button>
              )}
            </div>
            
            {showUploadForm && (
              <div className="space-y-3 p-3 border rounded-md bg-gray-50">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Upload Document</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowUploadForm(false);
                      setUploadFile(null);
                      setUploadDocumentName("");
                      setUploadDocumentType("");
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                
                <div className="grid gap-3">
                  <div>
                    <Label htmlFor="upload-name" className="text-sm">Document Name</Label>
                    <Input
                      id="upload-name"
                      type="text"
                      placeholder="Enter document name"
                      value={uploadDocumentName}
                      onChange={(e) => setUploadDocumentName(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="upload-type" className="text-sm">Document Type</Label>
                    <Select value={uploadDocumentType} onValueChange={setUploadDocumentType}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select document type" />
                      </SelectTrigger>
                      <SelectContent>
                        {documentTypes.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label htmlFor="upload-file" className="text-sm">Select File</Label>
                    <Input
                      id="upload-file"
                      type="file"
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setUploadFile(file);
                          // Auto-fill document name if empty
                          if (!uploadDocumentName) {
                            setUploadDocumentName(file.name.split('.')[0]);
                          }
                        }
                      }}
                      className="mt-1"
                    />
                    {uploadFile && (
                      <p className="text-xs text-gray-500 mt-1">
                        Selected: {uploadFile.name}
                      </p>
                    )}
                  </div>
                  
                  <Button
                    type="button"
                    onClick={handleDocumentUpload}
                    disabled={isUploading || !uploadFile || !uploadDocumentName.trim() || !uploadDocumentType}
                    className="w-full"
                    size="sm"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        Upload Document
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Display existing case notes - moved to bottom */}
          <div className="space-y-2 pt-4 border-t">
            <h3 className="font-medium">Existing Case Notes</h3>
            {isLoadingNotes ? (
              <div className="flex justify-center p-4">
                <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
              </div>
            ) : caseNotes.length > 0 ? (              <div className="space-y-4 max-h-[30vh] overflow-y-auto border rounded-md p-4">
                {caseNotes.map((note) => (
                  <div key={note.id} className="border-b pb-3 last:border-0">
                    <p className="whitespace-pre-wrap">{note.noteText}</p>
                      {/* Show attached documents */}
                    {note.documents && note.documents.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <p className="text-xs font-medium text-gray-600">Attached Documents:</p>
                        <div className="flex flex-wrap gap-2">
                          {note.documents.map((doc) => (
                            <div key={doc.id} className="flex items-center gap-1 bg-gray-50 rounded-md px-2 py-1 border">
                              <Paperclip className="h-3 w-3 text-gray-500" />
                              <span className="text-xs text-gray-700">{doc.documentName}</span>
                              <div className="flex items-center gap-1 ml-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => viewDocumentSecurely(doc.filePath || '')}
                                  title="View Document"
                                  className="h-5 w-5 p-0 hover:bg-blue-100"
                                >
                                  <Eye className="h-3 w-3 text-blue-600" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => downloadDocumentSecurely(doc.filePath || '', doc.documentName || 'download')}
                                  title="Download Document"
                                  className="h-5 w-5 p-0 hover:bg-green-100"
                                >
                                  <ArrowDown className="h-3 w-3 text-green-600" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <p className="text-xs text-gray-500 mt-1">
                      Added on {formatDate(note.createdAt)}
                      {note.createdByName && ` by ${note.createdByName}`}
                    </p>                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm italic">No case notes yet.</p>
            )}
          </div>
        </div>

        <DialogFooter className="sticky bottom-0 bg-white pt-2 border-t">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Note'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}