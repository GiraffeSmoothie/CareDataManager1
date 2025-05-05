import { ClassValue } from "clsx";

export interface User {
  id: number;
  username: string;
  name: string;
  role: string;
}

export interface TableHeadProps extends React.ThHTMLAttributes<HTMLTableCellElement> {}

export type ServiceCategory = {
  value: string;
  label: string;
}

export type ServiceType = {
  value: string;
  label: string;
}

// Utility type exports
export type { ClassValue };