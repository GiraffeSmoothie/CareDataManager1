// Care Categories
export const careCategories = [
  { value: "cleaning", label: "Cleaning Services" },
  { value: "gardening", label: "Gardening Services" },
  { value: "meals", label: "Meal Preparation" },
  { value: "exercise", label: "Exercise and Rehabilitation Support" },
  { value: "maintenance", label: "Home Maintenance" },
  { value: "transport", label: "Transport Services" },
];

// Care Types by Category
const careCategoryTypes = {
  cleaning: [
    { value: "regular", label: "Regular Cleaning" },
    { value: "deep", label: "Deep Cleaning" },
    { value: "specialized", label: "Specialized Cleaning" },
  ],
  gardening: [
    { value: "lawn", label: "Lawn Care" },
    { value: "planting", label: "Planting & Cultivation" },
    { value: "maintenance", label: "Garden Maintenance" },
  ],
  meals: [
    { value: "daily", label: "Daily Meal Preparation" },
    { value: "special", label: "Special Diet Meals" },
    { value: "bulk", label: "Bulk Meal Preparation" },
  ],
  exercise: [
    { value: "physical", label: "Physical Therapy" },
    { value: "fitness", label: "Fitness Programs" },
    { value: "mobility", label: "Mobility Assistance" },
  ],
  maintenance: [
    { value: "repairs", label: "General Repairs" },
    { value: "plumbing", label: "Plumbing Services" },
    { value: "electrical", label: "Electrical Services" },
  ],
  transport: [
    { value: "medical", label: "Medical Appointments" },
    { value: "shopping", label: "Shopping Trips" },
    { value: "social", label: "Social Activities" },
  ],
};

// Get care types based on selected category
export function getCareTypesByCategory(category: string) {
  return careCategoryTypes[category as keyof typeof careCategoryTypes] || [];
}
