import { useSegment } from '@/contexts/segment-context';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, Loader2, RefreshCcw } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export default function SegmentSelector() {
  const { segments, selectedSegment, setSelectedSegment, isLoading, error, refetchSegments } = useSegment();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading segments...</span>
      </div>
    );
  }

  if (error) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-red-500">Error loading segments</span>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6" 
                onClick={() => refetchSegments()}
              >
                <RefreshCcw className="h-3 w-3" />
              </Button>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Click to retry loading segments</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (segments.length === 0) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <span>No segments available</span>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6" 
                onClick={() => refetchSegments()}
              >
                <RefreshCcw className="h-3 w-3" />
              </Button>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>No segments found for your account. Click to refresh.</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="flex items-center gap-2">
          <span>Segment: </span>
          <span className="font-medium">
            {selectedSegment?.segment_name || 'Select Segment'}
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {segments.map((segment) => (
          <DropdownMenuItem
            key={segment.id}
            className="cursor-pointer"
            onClick={() => setSelectedSegment(segment)}
          >
            <span className={segment.id === selectedSegment?.id ? 'font-medium' : ''}>
              {segment.segment_name}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}