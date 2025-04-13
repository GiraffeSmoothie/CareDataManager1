import { z } from "zod";

export const serviceCategories = [
  { value: "personal-care", label: "Personal Care" },
  { value: "domestic-assistance", label: "Domestic Assistance" },
  { value: "nursing", label: "Nursing" },
  { value: "allied-health", label: "Allied Health" },
] as const;

export const serviceTypes = {
  "personal-care": [
    { value: "showering", label: "Showering" },
    { value: "dressing", label: "Dressing" },
    { value: "mobility", label: "Mobility" },
  ],
  "domestic-assistance": [
    { value: "cleaning", label: "Cleaning" },
    { value: "laundry", label: "Laundry" },
    { value: "meal-prep", label: "Meal Preparation" },
  ],
  "nursing": [
    { value: "medication", label: "Medication Management" },
    { value: "wound-care", label: "Wound Care" },
    { value: "health-monitoring", label: "Health Monitoring" },
  ],
  "allied-health": [
    { value: "physiotherapy", label: "Physiotherapy" },
    { value: "occupational-therapy", label: "Occupational Therapy" },
    { value: "podiatry", label: "Podiatry" },
  ],
} as const;

export const getServiceTypesByCategory = (category: string) => {
  return serviceTypes[category as keyof typeof serviceTypes] || [];
};