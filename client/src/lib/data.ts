
import { z } from "zod";

export const serviceCategories = [
  { value: "personal_care", label: "Personal Care" },
  { value: "domestic_assistance", label: "Domestic Assistance" },
  { value: "social_support", label: "Social Support" },
  { value: "nursing", label: "Nursing" },
  { value: "allied_health", label: "Allied Health" }
];

const serviceTypes = {
  personal_care: [
    { value: "showering", label: "Showering" },
    { value: "dressing", label: "Dressing" },
    { value: "grooming", label: "Grooming" }
  ],
  domestic_assistance: [
    { value: "cleaning", label: "Cleaning" },
    { value: "laundry", label: "Laundry" },
    { value: "meal_prep", label: "Meal Preparation" }
  ],
  social_support: [
    { value: "companionship", label: "Companionship" },
    { value: "transport", label: "Transport" },
    { value: "shopping", label: "Shopping" }
  ],
  nursing: [
    { value: "medication", label: "Medication Management" },
    { value: "wound_care", label: "Wound Care" },
    { value: "health_monitoring", label: "Health Monitoring" }
  ],
  allied_health: [
    { value: "physiotherapy", label: "Physiotherapy" },
    { value: "occupational_therapy", label: "Occupational Therapy" },
    { value: "podiatry", label: "Podiatry" }
  ]
};

export const getServiceTypesByCategory = (category: string) => {
  return serviceTypes[category as keyof typeof serviceTypes] || [];
};
