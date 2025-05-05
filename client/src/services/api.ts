// API endpoints
export const API_ENDPOINTS = {
    AUTH: '/auth',
    USERS: '/users',
    CLIENTS: '/clients',
    DOCUMENTS: '/documents'
};

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown,
  isFormData = false
): Promise<Response> {
  const headers: Record<string, string> = {};
  let body: any = undefined;
  
  if (data) {
    if (isFormData) {
      body = data;
    } else {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(data);
    }
  }

  const response = await fetch(url, {
    method,
    headers,
    body,
    credentials: "include",
  });

  const responseClone = response.clone();
  
  if (!response.ok) {
    let errorMessage;
    try {
      const errorData = await responseClone.json();
      errorMessage = errorData.message || response.statusText;
    } catch (e) {
      errorMessage = await responseClone.text() || response.statusText;
    }
    throw new Error(errorMessage);
  }

  return response;
}