// API endpoints
export const API_ENDPOINTS = {
    AUTH: '/api/auth',
    USERS: '/api/users',
    CLIENTS: '/api/clients',
    DOCUMENTS: '/api/documents',
    COMPANY_SEGMENTS: '/api/company-segments',
    COMPANIES: '/api/companies'
};

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown,
  isFormData = false
): Promise<Response> {
    const options: RequestInit = {
        method,
        headers: !isFormData ? { 'Content-Type': 'application/json' } : undefined,
        credentials: 'include',
        body: data ? (isFormData ? data as FormData : JSON.stringify(data)) : undefined,
    };

    const response = await fetch(url, options);
    return response;
}