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

export const SegmentProvider: React.FC<{ children: ReactNode }> = ({ children }) => {  const [segments, setSegments] = useState<Segment[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<Segment | null>(null);
  const [error, setError] = useState<Error | null>(null);
  // Query auth status and segments using tanstack query  const { data: authData } = useQuery({
      const { data: authData } = useQuery({
    queryKey: ["authStatus"],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/auth/status');
      return response.json();
    },
    staleTime: 30000, // 30 seconds
  });

  const { data: segmentsData, error: segmentsError, refetch } = useQuery({
    queryKey: ["segments", authData?.user?.company_id],    queryFn: async () => {
      console.log("Fetching segments for company_id:", authData?.user?.company_id);
      
      const response = await apiRequest("GET", '/api/user/segments');
      const data = await response.json();
      console.log("Received segments:", data);
      return data;
    },
    enabled: !!authData?.authenticated && !!authData?.user?.company_id,
    staleTime: 5000, // 5 seconds - shorter for more immediate updates
    refetchOnWindowFocus: true, // Refetch when window gains focus
    refetchOnReconnect: true, // Refetch when reconnecting
  });  // Update segments state when segmentsData changes
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
            console.log("Setting segment from localStorage:", segmentFromStorage);
            setSelectedSegment(segmentFromStorage);
          } else {
            console.log("Stored segment not found, setting first segment:", segmentsData[0]);
            setSelectedSegment(segmentsData[0]);
          }
        } else {
          console.log("No stored segment, setting first segment:", segmentsData[0]);
          setSelectedSegment(segmentsData[0]);
        }
      } else if (segmentsData.length === 0) {
        // Clear selected segment if the user has no segments
        console.log("No segments available, clearing selection");
        setSelectedSegment(null);
        localStorage.removeItem('selectedSegmentId');
      }
      setError(null);
    }
  }, [segmentsData, selectedSegment]);

  // Refetch segments when user changes (after login)
  useEffect(() => {
    if (authData?.user?.company_id) {
      console.log("User company_id changed, refetching segments:", authData.user.company_id);
      refetch();
    }
  }, [authData?.user?.company_id, refetch]);

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
  };  return (
    <SegmentContext.Provider value={{
        segments,
        selectedSegment,
        setSelectedSegment,
        isLoading: !authData || segmentsData === undefined || (segmentsData.length > 0 && !selectedSegment),
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