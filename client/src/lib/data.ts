// Care Categories
export const careCategories = [
  { value: "medical", label: "Medical Care" },
  { value: "mental", label: "Mental Health" },
  { value: "physical", label: "Physical Therapy" },
  { value: "preventive", label: "Preventive Care" },
  { value: "home", label: "Home Health" },
];

// Care Types by Category
const careCategoryTypes = {
  medical: [
    { value: "primary", label: "Primary Care" },
    { value: "specialty", label: "Specialty Care" },
    { value: "emergency", label: "Emergency Care" },
  ],
  mental: [
    { value: "counseling", label: "Counseling" },
    { value: "psychiatry", label: "Psychiatry" },
    { value: "therapy", label: "Therapy" },
  ],
  physical: [
    { value: "rehabilitation", label: "Rehabilitation" },
    { value: "sports", label: "Sports Therapy" },
    { value: "occupational", label: "Occupational Therapy" },
  ],
  preventive: [
    { value: "screenings", label: "Health Screenings" },
    { value: "immunizations", label: "Immunizations" },
    { value: "wellness", label: "Wellness Programs" },
  ],
  home: [
    { value: "nursing", label: "Home Nursing" },
    { value: "assistance", label: "Personal Assistance" },
    { value: "hospice", label: "Hospice Care" },
  ],
};

// Get care types based on selected category
export function getCareTypesByCategory(category: string) {
  return careCategoryTypes[category as keyof typeof careCategoryTypes] || [];
}
