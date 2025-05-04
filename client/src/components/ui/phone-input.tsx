import React, { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "../../lib/utils";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "../ui/command";
import { Input } from "./input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./popover";
import { Button } from "./button";
import { FormControl, FormItem, FormLabel, FormMessage } from "./form";

// Define country codes with flags
export const countryCodes = [
  { value: "61", label: "Australia", flag: "🇦🇺" },
  { value: "64", label: "New Zealand", flag: "🇳🇿" },
  { value: "1", label: "United States", flag: "🇺🇸" },
  { value: "44", label: "United Kingdom", flag: "🇬🇧" },
  { value: "91", label: "India", flag: "🇮🇳" },
  { value: "86", label: "China", flag: "🇨🇳" },
  { value: "81", label: "Japan", flag: "🇯🇵" },
  { value: "82", label: "South Korea", flag: "🇰🇷" },
  { value: "49", label: "Germany", flag: "🇩🇪" },
  { value: "33", label: "France", flag: "🇫🇷" },
  { value: "39", label: "Italy", flag: "🇮🇹" },
  { value: "34", label: "Spain", flag: "🇪🇸" },
  { value: "65", label: "Singapore", flag: "🇸🇬" },
  { value: "60", label: "Malaysia", flag: "🇲🇾" },
  { value: "62", label: "Indonesia", flag: "🇮🇩" },
  { value: "63", label: "Philippines", flag: "🇵🇭" },
  { value: "66", label: "Thailand", flag: "🇹🇭" },
  { value: "84", label: "Vietnam", flag: "🇻🇳" },
  { value: "27", label: "South Africa", flag: "🇿🇦" },
  { value: "55", label: "Brazil", flag: "🇧🇷" },
];

interface PhoneInputProps {
  value: string;
  countryCode: string;
  onValueChange: (value: string) => void;
  onCountryCodeChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  label?: string;
  error?: string;
}

export function PhoneInput({
  value,
  countryCode,
  onValueChange,
  onCountryCodeChange,
  placeholder,
  disabled,
  className,
  label,
  error,
}: PhoneInputProps) {
  const [open, setOpen] = useState(false);
  
  // Find the selected country from its code
  const selectedCountry = countryCodes.find(
    (country) => country.value === countryCode
  ) || countryCodes[0]; // Default to Australia (first in the list)

  return (
    <FormItem className="flex flex-col space-y-2">
      {label && <FormLabel>{label}</FormLabel>}
      <div className="flex">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-[110px] justify-between border-r-0 rounded-r-none"
              disabled={disabled}
            >
              <span className="mr-1">{selectedCountry.flag}</span>
              <span>+{selectedCountry.value}</span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[200px] p-0">
            <Command>
              <CommandInput placeholder="Search country..." />
              <CommandEmpty>No country found.</CommandEmpty>
              <CommandGroup>
                {countryCodes.map((country) => (
                  <CommandItem
                    key={country.value}
                    value={country.value}
                    onSelect={(currentValue) => {
                      onCountryCodeChange(currentValue);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        countryCode === country.value ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="mr-2">{country.flag}</span>
                    {country.label} (+{country.value})
                  </CommandItem>
                ))}
              </CommandGroup>
            </Command>
          </PopoverContent>
        </Popover>
        <FormControl>
          <Input
            placeholder={placeholder || "Phone number"}
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            className={cn("flex-1 rounded-l-none", className)}
            disabled={disabled}
          />
        </FormControl>
      </div>
      {error && <FormMessage>{error}</FormMessage>}
    </FormItem>
  );
}