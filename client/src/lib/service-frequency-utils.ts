// Service frequency utility functions for visual enhancement

export interface FrequencyPattern {
  type: 'daily' | 'weekdays' | 'weekends' | 'custom';
  label: string;
  badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline';
  color: string;
}

/**
 * Analyzes service days array to determine frequency pattern
 */
export function analyzeServiceFrequency(serviceDays: string[]): FrequencyPattern {
  if (!serviceDays || serviceDays.length === 0) {
    return {
      type: 'custom',
      label: 'No Schedule',
      badgeVariant: 'outline',
      color: 'text-gray-500'
    };
  }

  const normalizedDays = serviceDays.map(day => day.toLowerCase().trim());
  const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
  const weekends = ['saturday', 'sunday'];
  const allDays = [...weekdays, ...weekends];

  // Check for daily (all 7 days)
  if (normalizedDays.length === 7 && allDays.every(day => normalizedDays.includes(day))) {
    return {
      type: 'daily',
      label: 'Daily',
      badgeVariant: 'default',
      color: 'text-blue-700 bg-blue-50'
    };
  }

  // Check for weekdays only
  if (normalizedDays.length === 5 && weekdays.every(day => normalizedDays.includes(day))) {
    return {
      type: 'weekdays',
      label: 'Weekdays',
      badgeVariant: 'secondary',
      color: 'text-green-700 bg-green-50'
    };
  }

  // Check for weekends only
  if (normalizedDays.length === 2 && weekends.every(day => normalizedDays.includes(day))) {
    return {
      type: 'weekends',
      label: 'Weekends',
      badgeVariant: 'secondary',
      color: 'text-purple-700 bg-purple-50'
    };
  }

  // Custom pattern
  return {
    type: 'custom',
    label: `${normalizedDays.length} Days`,
    badgeVariant: 'outline',
    color: 'text-amber-700 bg-amber-50'
  };
}

/**
 * Formats service hours with visual styling
 */
export function formatServiceHours(hours: number): {
  formatted: string;
  intensity: 'low' | 'medium' | 'high';
  color: string;
} {
  const numHours = parseFloat(hours.toString());
  
  if (isNaN(numHours)) {
    return {
      formatted: '0.0',
      intensity: 'low',
      color: 'text-gray-500'
    };
  }

  let intensity: 'low' | 'medium' | 'high';
  let color: string;

  if (numHours <= 2) {
    intensity = 'low';
    color = 'text-green-600';
  } else if (numHours <= 6) {
    intensity = 'medium';
    color = 'text-blue-600';
  } else {
    intensity = 'high';
    color = 'text-orange-600';
  }

  return {
    formatted: numHours.toFixed(1),
    intensity,
    color
  };
}

/**
 * Gets abbreviated day names for compact display
 */
export function getAbbreviatedDays(serviceDays: string[]): string {
  if (!serviceDays || serviceDays.length === 0) return '';
  
  const dayAbbreviations: { [key: string]: string } = {
    'monday': 'Mon',
    'tuesday': 'Tue',
    'wednesday': 'Wed',
    'thursday': 'Thu',
    'friday': 'Fri',
    'saturday': 'Sat',
    'sunday': 'Sun'
  };

  return serviceDays
    .map(day => dayAbbreviations[day.toLowerCase()] || day.substring(0, 3))
    .join(', ');
}

/**
 * Determines activity level based on case notes count
 */
export function getCaseNotesActivity(count: number): {
  level: 'none' | 'low' | 'medium' | 'high';
  color: string;
  label: string;
} {
  if (count === 0) {
    return {
      level: 'none',
      color: 'text-gray-500 bg-gray-100',
      label: 'No Notes'
    };
  } else if (count <= 3) {
    return {
      level: 'low',
      color: 'text-blue-700 bg-blue-100',
      label: `${count} Note${count > 1 ? 's' : ''}`
    };
  } else if (count <= 10) {
    return {
      level: 'medium',
      color: 'text-green-700 bg-green-100',
      label: `${count} Notes`
    };
  } else {
    return {
      level: 'high',
      color: 'text-orange-700 bg-orange-100',
      label: `${count} Notes`
    };
  }
}
