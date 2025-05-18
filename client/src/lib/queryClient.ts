import { QueryClient, QueryFunction } from "@tanstack/react-query";

// Session timeout handling
let isRedirectingToLogin = false;
const handleSessionTimeout = () => {
  if (!isRedirectingToLogin && typeof window !== 'undefined') {
    isRedirectingToLogin = true;
    
    // Store the current URL to redirect back after login
    const currentPath = window.location.pathname;
    if (currentPath !== '/login') {
      sessionStorage.setItem('redirectAfterLogin', currentPath);
      
      // Show toast notification instead of an alert
      // We can use a temporary div for notification if toast system isn't available
      const notificationDiv = document.createElement('div');
      notificationDiv.style.position = 'fixed';
      notificationDiv.style.top = '20px';
      notificationDiv.style.right = '20px';
      notificationDiv.style.background = 'rgb(239, 68, 68)';
      notificationDiv.style.color = 'white';
      notificationDiv.style.padding = '12px 16px';
      notificationDiv.style.borderRadius = '4px';
      notificationDiv.style.zIndex = '9999';
      notificationDiv.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
      notificationDiv.innerText = 'Your session has expired. Please log in again.';
      
      document.body.appendChild(notificationDiv);
      
      setTimeout(() => {
        // Redirect to login page after a short delay to show the notification
        window.location.href = '/login';
      }, 1500);
    } else {
      // Already on login page, just reset the flag
      isRedirectingToLogin = false;
    }
  }
};

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    // Handle unauthorized (session timeout) specially
    if (res.status === 401) {
      handleSessionTimeout();
    }
    
    try {
      const errorData = await res.json();
      throw new Error(errorData.message || `${res.status}: ${res.statusText}`);
    } catch (e) {
      // If parsing JSON fails, use text or status
      const text = await res.text() || res.statusText;
      throw new Error(`${res.status}: ${text}`);
    }
  }
}

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

  // Clone the response before checking status and reading body
  const responseClone = response.clone();
  
  if (!response.ok) {
    // Check for unauthorized error (session timeout)
    if (response.status === 401) {
      handleSessionTimeout();
      throw new Error('Your session has expired. Please log in again.');
    }
    
    try {
      const errorData = await responseClone.json();
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    } catch (e) {
      if (e instanceof Error) {
        throw e;
      }
      // If JSON parsing fails, try to get text content
      const errorText = await responseClone.text();
      throw new Error(errorText || `HTTP error! status: ${response.status}`);
    }
  }

  return response;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey[0] as string;
    
    const res = await fetch(url, {
      credentials: "include",
    });

    if (res.status === 401) {
      if (unauthorizedBehavior === "returnNull") {
        return null;
      } else {
        // This will only trigger for endpoints that aren't auth related
        // For auth status checks, we use "returnNull" behavior
        handleSessionTimeout();
      }
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
