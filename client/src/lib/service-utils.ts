// Utility functions for service frequency calculations and display

export interface FrequencyPattern {
  pattern: string;
  description: string;
  weeklyHours: number;
  badge: string;
  variant: "default" | "secondary" | "destructive" | "outline";
}

/**
 * Calculate service frequency pattern from service days and hours
 */
export function calculateServiceFrequency(serviceDays: string[], serviceHours: number): FrequencyPattern {
  const dayCount = serviceDays.length;
  const weeklyHours = dayCount * serviceHours;
  
  // Determine pattern based on days
  let pattern: string;
  let description: string;
  let badge: string;
  let variant: "default" | "secondary" | "destructive" | "outline" = "default";
  
  if (dayCount === 7) {
    pattern = "Daily";
    description = "Every day";
    badge = "7x/week";
    variant = "default";
  } else if (dayCount === 5 && isWeekdays(serviceDays)) {
    pattern = "Weekdays";
    description = "Monday to Friday";
    badge = "5x/week";
    variant = "secondary";
  } else if (dayCount === 2 && isWeekends(serviceDays)) {
    pattern = "Weekends";
    description = "Saturday & Sunday";
    badge = "2x/week";
    variant = "outline";
  } else if (dayCount >= 4) {
    pattern = "Frequent";
    description = `${dayCount} days per week`;
    badge = `${dayCount}x/week`;
    variant = "default";
  } else if (dayCount === 3) {
    pattern = "Regular";
    description = "3 times per week";
    badge = "3x/week";
    variant = "secondary";
  } else if (dayCount === 2) {
    pattern = "Bi-weekly";
    description = "Twice per week";
    badge = "2x/week";
    variant = "outline";
  } else if (dayCount === 1) {
    pattern = "Weekly";
    description = "Once per week";
    badge = "1x/week";
    variant = "outline";
  } else {
    pattern = "Custom";
    description = "Custom schedule";
    badge = `${dayCount}x/week`;
    variant = "outline";
  }
  
  return {
    pattern,
    description,
    weeklyHours,
    badge,
    variant
  };
}

/**
 * Check if service days are weekdays only
 */
function isWeekdays(serviceDays: string[]): boolean {
  const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  return serviceDays.length === 5 && 
         serviceDays.every(day => weekdays.includes(day)) &&
         weekdays.every(day => serviceDays.includes(day));
}

/**
 * Check if service days are weekends only
 */
function isWeekends(serviceDays: string[]): boolean {
  const weekends = ["Saturday", "Sunday"];
  return serviceDays.length === 2 && 
         serviceDays.every(day => weekends.includes(day)) &&
         weekends.every(day => serviceDays.includes(day));
}

/**
 * Format service days for compact display
 */
export function formatServiceDaysCompact(serviceDays: string[]): string {
  const dayAbbreviations: Record<string, string> = {
    "Monday": "Mon",
    "Tuesday": "Tue", 
    "Wednesday": "Wed",
    "Thursday": "Thu",
    "Friday": "Fri",
    "Saturday": "Sat",
    "Sunday": "Sun"
  };
  
  return serviceDays.map(day => dayAbbreviations[day] || day).join(", ");
}

/**
 * Get service hours display with weekly total
 */
export function formatServiceHours(dailyHours: number, dayCount: number): string {
  const weeklyHours = dailyHours * dayCount;
  if (weeklyHours === dailyHours) {
    return `${dailyHours.toFixed(1)}h/day`;
  }
  return `${dailyHours.toFixed(1)}h/day (${weeklyHours.toFixed(1)}h/week)`;
}
