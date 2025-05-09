// Application-wide constants
export const APP_CONFIG = {
    API_BASE_URL: '/api',
    APP_NAME: 'Care Data Manager',
    VERSION: '1.0.0'
};

// Route constants
export const ROUTES = {
    HOME: '/',
    DASHBOARD: '/dashboard',
    LOGIN: '/login',
    SETTINGS: '/settings',
    MANAGE_USERS: '/manage-users',
    MANAGE_CLIENTS: '/manage-client',
    PERSON_INFO: '/person-info',
    DOCUMENT_UPLOAD: '/document-upload'
};

// Status constants
export const CLIENT_STATUSES = {
  NEW: "New",
  ACTIVE: "Active",
  PAUSED: "Paused",
  CLOSED: "Closed",
} as const;

export const SERVICE_STATUSES = {
  PLANNED: "Planned",
  IN_PROGRESS: "In Progress",
  CLOSED: "Closed",
} as const;

export const STATUS_STYLES = {
  [CLIENT_STATUSES.ACTIVE]: "bg-green-100 text-green-800",
  [CLIENT_STATUSES.NEW]: "bg-blue-100 text-blue-800",
  [CLIENT_STATUSES.PAUSED]: "bg-amber-100 text-amber-800",
  [CLIENT_STATUSES.CLOSED]: "bg-gray-100 text-gray-800",
  [SERVICE_STATUSES.PLANNED]: "bg-blue-100 text-blue-800",
  [SERVICE_STATUSES.IN_PROGRESS]: "bg-green-100 text-green-800",
  [SERVICE_STATUSES.CLOSED]: "bg-gray-100 text-gray-800",
} as const;

export type ClientStatus = typeof CLIENT_STATUSES[keyof typeof CLIENT_STATUSES];
export type ServiceStatus = typeof SERVICE_STATUSES[keyof typeof SERVICE_STATUSES];