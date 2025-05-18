import * as React from "react"
import { DayPicker } from "react-day-picker"

import { cn } from "@/lib/utils"

export const buttonVariants = cn(
  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background",
  {
    "hover:bg-primary/90": true,
  }
);

export const styles = {
  nav: cn(
    "space-x-1 flex items-center",
    {
      "justify-between": true,
    }
  )
};

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function CustomCaption({ displayMonth, onMonthChange }: { displayMonth: Date; onMonthChange: (date: Date) => void }) {
  const currentYear = displayMonth.getFullYear();
  const currentMonth = displayMonth.getMonth();

  // Generate years (starting from 1900 to current year)
  const years = Array.from(
    { length: new Date().getFullYear() - 1899 }, 
    (_, i) => 1900 + i
  );
  
  // Generate all months
  const months = Array.from({ length: 12 }, (_, i) => {
    return {
      value: i,
      label: new Date(2000, i).toLocaleString('default', { month: 'long' })
    };
  });

  return (
    <div className="flex justify-center gap-2 items-center">
      <select
        className="px-2 py-1 text-sm border rounded bg-background"
        value={currentMonth}
        onChange={(e) => {
          const newDate = new Date(currentYear, parseInt(e.target.value, 10));
          onMonthChange(newDate);
        }}
      >
        {months.map((month) => (
          <option key={month.value} value={month.value}>
            {month.label}
          </option>
        ))}
      </select>
      <select
        className="px-2 py-1 text-sm border rounded bg-background"
        value={currentYear}
        onChange={(e) => {
          const newDate = new Date(parseInt(e.target.value, 10), currentMonth);
          onMonthChange(newDate);
        }}
      >
        {years.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
    </div>
  );
}

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  const [month, setMonth] = React.useState<Date>(() => {
    if (props.selected instanceof Date) {
      return props.selected;
    }
    return new Date();
  });

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      month={month}
      onMonthChange={setMonth}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-medium hidden",
        nav: "hidden",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
        row: "flex w-full mt-2",
        cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
        day: cn(
          buttonVariants,
          "h-9 w-9 p-0 font-normal aria-selected:opacity-100"
        ),
        day_range_end: "day-range-end",
        day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_today: "bg-accent text-accent-foreground",
        day_outside: "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
        day_disabled: "text-muted-foreground opacity-50",
        day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        Caption: ({ displayMonth }) => (
          <CustomCaption 
            displayMonth={displayMonth} 
            onMonthChange={setMonth} 
          />
        )
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
