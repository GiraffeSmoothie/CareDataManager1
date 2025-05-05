import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { type UtilityTypes } from "../types/utils"

export function cn(...inputs: UtilityTypes['ClassValue'][]) {
  return twMerge(clsx(inputs))
}
