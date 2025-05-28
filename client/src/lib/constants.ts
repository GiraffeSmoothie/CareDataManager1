// Application-wide constants
export const APP_CONFIG = {
    API_BASE_URL: '/api',
    APP_NAME: 'Care Data Manager',
    VERSION: '1.0.0'
};

// Route constants
export const ROUTES = {
    HOME: '/',
    LOGIN: '/login',
    SETTINGS: '/settings',
    MANAGE_USERS: '/manage-users',
    MANAGE_CLIENTS: '/manage-client',
    PERSON_INFO: '/person-info',
    DOCUMENT_UPLOAD: '/document-upload'
};

// Status configurations
export const STATUS_CONFIGS = {
  Active: {
    label: "Active",
    color: "bg-green-100 text-green-800",
    badge: "default",
    order: 0
  },
  New: {
    label: "New",
    color: "bg-blue-100 text-blue-800",
    badge: "secondary",
    order: 1
  },
  Planned: {
    label: "Planned",
    color: "bg-blue-100 text-blue-800",
    badge: "secondary",
    order: 2
  },
  "In Progress": {
    label: "In Progress",
    color: "bg-purple-100 text-purple-800",
    badge: "secondary",
    order: 3
  },
  Paused: {
    label: "Paused",
    color: "bg-amber-100 text-amber-800",
    badge: "secondary",
    order: 4
  },
  Closed: {
    label: "Closed",
    color: "bg-gray-100 text-gray-800",
    badge: "secondary",
    order: 5
  }
} as const;

export type StatusType = keyof typeof STATUS_CONFIGS;

export const getStatusConfig = (status: string) => {
  return STATUS_CONFIGS[status as StatusType] || STATUS_CONFIGS.Closed;
};

export const getStatusBadgeColors = (status: string) => {
  return getStatusConfig(status).color;
};