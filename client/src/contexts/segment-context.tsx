import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { Segment } from '@shared/schema';
import { useQuery } from '@tanstack/react-query';

interface SegmentContextType {
  segments: Segment[];
  selectedSegment: Segment | null;
  setSelectedSegment: (segment: Segment | null) => void;
  isLoading: boolean;
  error: Error | null;
  refetchSegments: () => void;
}

const SegmentContext = createContext<SegmentContextType | undefined>(undefined);

export const SegmentProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<Segment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Query auth status to react to login/logout
  const { data: authData } = useQuery({
    queryKey: ["authStatus"],
    queryFn: async () => {
      const response = await fetch('/api/auth/status', { 
        credentials: 'include'
      });
      if (!response.ok) {
        return { authenticated: false };
      }
      return response.json();
    },
    staleTime: 30000, // 30 seconds
  });

  const fetchSegments = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Check if user is authenticated first
      const authResponse = await fetch('/api/auth/status', { 
        credentials: 'include'
      });
      
      if (!authResponse.ok) {
        // If not authenticated, don't try to fetch segments yet
        setIsLoading(false);
        return;
      }
      
      console.log("Fetching segments for user");
      const response = await apiRequest('GET', '/api/user/segments');
      const data = await response.json();
      console.log("Fetched segments:", data);
      setSegments(data);
        // Set the first segment as selected by default if available
      if (data.length > 0 && !selectedSegment) {
        // Check if there's a stored segment preference
        const storedSegmentId = localStorage.getItem('selectedSegmentId');        
        if (storedSegmentId) {
          const segmentFromStorage = data.find((s: Segment) => s.id.toString() === storedSegmentId);
          if (segmentFromStorage) {
            setSelectedSegment(segmentFromStorage);
          } else {
            setSelectedSegment(data[0]);
          }
        } else {
          setSelectedSegment(data[0]);
        }
      } else if (data.length === 0) {
        // Clear selected segment if the user has no segments (e.g., admin without company assignment)
        setSelectedSegment(null);
        localStorage.removeItem('selectedSegmentId');
      }
      // Reset retry count on success
      setRetryCount(0);
    } catch (err) {
      console.error('Error fetching segments:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch segments'));
      
      // Implement retry logic with exponential backoff
      if (retryCount < 3) {
        const nextRetry = setTimeout(() => {
          setRetryCount(prev => prev + 1);
          fetchSegments();
        }, Math.pow(2, retryCount) * 1000); // 1s, 2s, 4s backoff
        
        return () => clearTimeout(nextRetry);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch segments on component mount and when retryCount changes
  useEffect(() => {
    fetchSegments();
  }, [retryCount]);

  // Refetch segments when authentication status changes
  useEffect(() => {
    if (authData?.authenticated) {
      console.log("Authentication detected, fetching segments");
      fetchSegments();
    } else {
      // Clear segments when logged out
      setSegments([]);
      setSelectedSegment(null);
    }
  }, [authData?.authenticated]);

  // Save selected segment to localStorage when it changes
  useEffect(() => {
    if (selectedSegment) {
      localStorage.setItem('selectedSegmentId', selectedSegment.id.toString());
    }
  }, [selectedSegment]);

  const refetchSegments = () => {
    setRetryCount(0); // Reset retry count
    fetchSegments();
  };

  return (
    <SegmentContext.Provider
      value={{
        segments,
        selectedSegment,
        setSelectedSegment,
        isLoading,
        error,
        refetchSegments
      }}
    >
      {children}
    </SegmentContext.Provider>
  );
};

export const useSegment = (): SegmentContextType => {
  const context = useContext(SegmentContext);
  if (context === undefined) {
    throw new Error('useSegment must be used within a SegmentProvider');
  }
  return context;
};