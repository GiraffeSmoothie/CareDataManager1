import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
// Removed apiRequest import since we're using fetch directly
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

export const SegmentProvider: React.FC<{ children: ReactNode }> = ({ children }) => {  const [segments, setSegments] = useState<Segment[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<Segment | null>(null);
  const [error, setError] = useState<Error | null>(null);
  // Query auth status and segments using tanstack query
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
  const { data: segmentsData, error: segmentsError, refetch } = useQuery({
    queryKey: ["segments", authData?.user?.company_id],
    queryFn: async () => {
      console.log("Fetching segments for company_id:", authData?.user?.company_id);
      const response = await fetch('/api/user/segments', {
        credentials: 'include',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch segments: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      console.log("Received segments:", data);
      return data;
    },
    enabled: !!authData?.authenticated,
    staleTime: 10000, // 10 seconds
  });
  // Update segments state when segmentsData changes
  useEffect(() => {
    if (segmentsData) {
      console.log("Fetched segments:", segmentsData);
      setSegments(segmentsData);
      
      // Set the first segment as selected by default if available
      if (segmentsData.length > 0 && !selectedSegment) {
        // Check if there's a stored segment preference
        const storedSegmentId = localStorage.getItem('selectedSegmentId');
        if (storedSegmentId) {
          const segmentFromStorage = segmentsData.find((s: Segment) => s.id.toString() === storedSegmentId);
          if (segmentFromStorage) {
            setSelectedSegment(segmentFromStorage);
          } else {
            setSelectedSegment(segmentsData[0]);
          }
        } else {
          setSelectedSegment(segmentsData[0]);
        }
      } else if (segmentsData.length === 0) {
        // Clear selected segment if the user has no segments
        setSelectedSegment(null);
        localStorage.removeItem('selectedSegmentId');
      }
      setError(null);
    }
  }, [segmentsData]);

  // Update error state when segmentsError changes
  useEffect(() => {
    if (segmentsError) {
      setError(segmentsError instanceof Error ? segmentsError : new Error('Failed to fetch segments'));
    }
  }, [segmentsError]);

  // Save selected segment to localStorage when it changes
  useEffect(() => {
    if (selectedSegment) {
      localStorage.setItem('selectedSegmentId', selectedSegment.id.toString());
    }
  }, [selectedSegment]);

  const refetchSegments = () => {
    refetch();
  };
  return (
    <SegmentContext.Provider value={{
        segments,
        selectedSegment,
        setSelectedSegment,
        isLoading: !authData || segmentsData === undefined,
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