// index.ts
import dotenv2 from "dotenv";
import { fileURLToPath as fileURLToPath2 } from "url";
import path4 from "path";
import fs4 from "fs";

// storage.ts
import { Pool } from "pg";
import { parse } from "pg-connection-string";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as dotenv from "dotenv";
import bcrypt from "bcrypt";
import { DefaultAzureCredential } from "@azure/identity";
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
if (!process.env.DATABASE_URL) {
  const envFile2 = process.env.NODE_ENV === "production" ? "production.env" : "development.env";
  const possibleEnvPaths = [
    path.join(__dirname, envFile2),
    // /dist/production.env
    path.join(__dirname, "..", envFile2),
    // ../production.env
    path.join(process.cwd(), envFile2),
    // ./production.env
    path.join(process.cwd(), "server", envFile2)
    // ./server/production.env
  ];
  for (const envPath of possibleEnvPaths) {
    console.log(`Storage.ts - Checking for env file at: ${envPath}`);
    if (fs.existsSync(envPath)) {
      console.log(`Storage.ts - Loading environment variables from: ${envPath}`);
      const envConfig = dotenv.parse(fs.readFileSync(envPath));
      for (const k in envConfig) {
        process.env[k] = envConfig[k];
      }
      break;
    }
  }
}
var azurePostgreSQLServerName = process.env.AZURE_POSTGRESQL_SERVER_NAME;
var azurePostgreSQLDatabaseName = process.env.AZURE_POSTGRESQL_DATABASE_NAME;
var azurePostgreSQLUserName = process.env.AZURE_POSTGRESQL_USER_NAME;
console.log("Storage.ts - Azure PostgreSQL config:", {
  serverName: azurePostgreSQLServerName ? "configured" : "not configured",
  databaseName: azurePostgreSQLDatabaseName ? "configured" : "not configured",
  userName: azurePostgreSQLUserName ? "configured" : "not configured"
});
console.log("Storage.ts - DATABASE_URL configured:", process.env.DATABASE_URL ? "Yes" : "No");
var connectionPool;
var azureCredential = null;
var accessToken = null;
var tokenExpiryTime = null;
async function getAzureAccessToken() {
  if (!azureCredential) {
    azureCredential = new DefaultAzureCredential();
  }
  if (accessToken && tokenExpiryTime && tokenExpiryTime > new Date(Date.now() + 5 * 60 * 1e3)) {
    return accessToken;
  }
  try {
    console.log("Acquiring Azure AD access token for PostgreSQL...");
    const tokenResponse = await azureCredential.getToken("https://ossrdbms-aad.database.windows.net/.default");
    if (!tokenResponse) {
      throw new Error("Failed to acquire access token");
    }
    accessToken = tokenResponse.token;
    tokenExpiryTime = tokenResponse.expiresOnTimestamp ? new Date(tokenResponse.expiresOnTimestamp) : new Date(Date.now() + 60 * 60 * 1e3);
    console.log("Azure AD access token acquired successfully, expires at:", tokenExpiryTime.toISOString());
    return accessToken;
  } catch (error) {
    console.error("Failed to acquire Azure AD access token:", error);
    throw error;
  }
}
async function createConnectionConfig() {
  if (azurePostgreSQLServerName && azurePostgreSQLDatabaseName && azurePostgreSQLUserName) {
    try {
      console.log("Using Azure Managed Identity for PostgreSQL authentication");
      const token = await getAzureAccessToken();
      const config = {
        user: azurePostgreSQLUserName,
        host: `${azurePostgreSQLServerName}.postgres.database.azure.com`,
        database: azurePostgreSQLDatabaseName,
        password: token,
        port: 5432,
        ssl: {
          rejectUnauthorized: false,
          ca: void 0,
          checkServerIdentity: () => void 0
        },
        // Connection pool settings for Azure
        max: 20,
        idleTimeoutMillis: 3e4,
        connectionTimeoutMillis: 1e4,
        // Increased for Azure connectivity
        query_timeout: 1e4,
        statement_timeout: 1e4
      };
      console.log("Azure Managed Identity connection config created:", {
        user: config.user,
        host: config.host,
        database: config.database,
        port: config.port,
        ssl: "enabled"
      });
      return config;
    } catch (error) {
      console.log("Azure Managed Identity failed, falling back to DATABASE_URL:", error instanceof Error ? error.message : String(error));
    }
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("Either Azure Managed Identity configuration (AZURE_POSTGRESQL_SERVER_NAME, AZURE_POSTGRESQL_DATABASE_NAME, AZURE_POSTGRESQL_USER_NAME) or DATABASE_URL must be provided");
  }
  console.log("Using traditional DATABASE_URL authentication");
  try {
    const parsed = parse(process.env.DATABASE_URL);
    const isAzurePostgreSQL = parsed.host?.includes("postgres.database.azure.com");
    const config = {
      user: parsed.user,
      host: parsed.host || "",
      database: parsed.database || "",
      password: parsed.password,
      port: parsed.port ? parseInt(parsed.port) : 5432,
      // Add SSL configuration for Azure PostgreSQL
      ssl: isAzurePostgreSQL ? {
        rejectUnauthorized: false,
        ca: void 0,
        checkServerIdentity: () => void 0
      } : false
    };
    console.log("Traditional connection config created:", {
      user: config.user || "",
      host: config.host,
      database: config.database,
      port: config.port,
      ssl: config.ssl ? "enabled" : "disabled"
    });
    if (!config.host) {
      throw new Error("Invalid hostname in DATABASE_URL. Please verify the configuration.");
    }
    return config;
  } catch (error) {
    console.error("Error parsing DATABASE_URL:", error);
    throw new Error("Invalid DATABASE_URL format. Please check your environment configuration.");
  }
}
async function initializeConnectionPool() {
  const connectionConfig = await createConnectionConfig();
  const pool = new Pool(connectionConfig);
  pool.on("error", (err) => {
    console.error("Unexpected error on idle client", err);
    if (azurePostgreSQLServerName && azureCredential && err.message.includes("authentication")) {
      console.log("Authentication error detected, will refresh token on next connection");
      accessToken = null;
      tokenExpiryTime = null;
    }
  });
  pool.on("connect", () => {
    console.log("Connected to database successfully");
  });
  if (azurePostgreSQLServerName && azureCredential) {
    setInterval(async () => {
      try {
        console.log("Refreshing Azure AD access token...");
        await getAzureAccessToken();
        console.log("Azure AD access token refreshed successfully");
      } catch (error) {
        console.error("Failed to refresh Azure AD access token:", error);
        accessToken = null;
        tokenExpiryTime = null;
      }
    }, 45 * 60 * 1e3);
  }
  return pool;
}
var connectionPoolPromise = null;
async function getConnectionPool() {
  if (!connectionPoolPromise) {
    connectionPoolPromise = initializeConnectionPool();
  }
  return connectionPoolPromise;
}
async function initializeAndTestConnection() {
  const maxRetries = 5;
  const retryDelay = 2e3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Database connection attempt ${attempt}/${maxRetries}...`);
      connectionPool = await getConnectionPool();
      const client = await connectionPool.connect();
      console.log("Database connection test successful");
      if (azurePostgreSQLServerName && azureCredential) {
        console.log("\u2705 Successfully connected to PostgreSQL using Azure Managed Identity");
      } else {
        console.log("\u2705 Successfully connected to PostgreSQL using traditional authentication");
      }
      client.release();
      return;
    } catch (err) {
      console.error(`Database connection attempt ${attempt}/${maxRetries} failed:`, err);
      if (attempt === maxRetries) {
        console.error("\u274C All database connection attempts failed. Application may not function properly.");
        if (err instanceof Error) {
          console.error("Final error details:", err.message);
          console.error("Stack trace:", err.stack);
        }
        return;
      }
      const delayMs = retryDelay * Math.pow(2, attempt - 1);
      console.log(`Retrying in ${delayMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      connectionPoolPromise = null;
    }
  }
}
initializeAndTestConnection().catch(console.error);
function validateInput(input, type) {
  switch (type) {
    case "id":
      return Number.isInteger(input) && input > 0;
    case "string":
      return typeof input === "string" && input.length > 0;
    case "date":
      return !isNaN(Date.parse(input));
    case "boolean":
      return typeof input === "boolean";
    case "array":
      return Array.isArray(input);
    default:
      return false;
  }
}
function handleDatabaseError(error, operation) {
  console.error(`Database error during ${operation}:`, error);
  if (error.code === "23505") {
    throw new Error("Duplicate entry found");
  }
  if (error.code === "23503") {
    if (operation === "createClientService") {
      throw new Error("The selected service combination does not exist in the master data. Please create it in the Master Data section first.");
    } else {
      throw new Error("Referenced record not found");
    }
  }
  throw new Error(`Database error during ${operation}`);
}
var SALT_ROUNDS = 10;
var Storage = class {
  pool;
  /**
   * Constructor for Storage class
   * 
   * Initializes a new Storage instance with a database connection pool.
   * 
   * @param {Pool} pool - PostgreSQL connection pool
   */
  constructor(pool) {
    this.pool = pool;
  }
  /**
   * Execute an operation within a database transaction
   * 
   * Manages transaction lifecycle (BEGIN, COMMIT, ROLLBACK) and client connection.
   * Ensures proper cleanup of database resources even if an error occurs.
   * 
   * @template T - Return type of the operation
   * @param {Function} operation - Async function to execute within the transaction
   * @returns {Promise<T>} Result of the operation
   * @throws {Error} If the transaction fails for any reason
   */
  async withTransaction(operation) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  /**
   * Get all users
   * 
   * Retrieves all users from the database with basic information.
   * Does not include sensitive information like passwords.
   * 
   * @returns {Promise<User[]>} Array of user records
   * @throws {Error} If database query fails
   */
  async getAllUsers() {
    try {
      const result = await this.pool.query(
        "SELECT id, name, username, role, company_id FROM users ORDER BY id"
      );
      return result.rows;
    } catch (error) {
      handleDatabaseError(error, "getAllUsers");
    }
  }
  /**
   * Get user by username
   * 
   * Retrieves a user record by username, including sensitive information like password.
   * Used for authentication and user lookup.
   * 
   * @param {string} username - Username to search for
   * @returns {Promise<User | null>} User record if found, null otherwise
   * @throws {Error} If username format is invalid or database query fails
   */
  async getUserByUsername(username) {
    if (!validateInput(username, "string")) {
      throw new Error("Invalid username format");
    }
    try {
      const result = await this.pool.query(
        "SELECT id, name, username, password, role, company_id FROM users WHERE username = $1",
        [username]
      );
      return result.rows[0] || null;
    } catch (error) {
      handleDatabaseError(error, "getUserByUsername");
    }
  }
  /**
   * Get user by ID
   * 
   * Retrieves a user record by their unique ID.
   * Does not include sensitive information like passwords.
   * 
   * @param {number} id - User ID to search for
   * @returns {Promise<User | null>} User record if found, null otherwise
   * @throws {Error} If ID format is invalid or database query fails
   */
  async getUserById(id) {
    if (!validateInput(id, "id")) {
      throw new Error("Invalid ID format");
    }
    try {
      const result = await this.pool.query(
        "SELECT id, name, username, role, company_id FROM users WHERE id = $1",
        [id]
      );
      return result.rows[0] || null;
    } catch (error) {
      handleDatabaseError(error, "getUserById");
    }
  }
  /**
   * Verify user password
   * 
   * Checks if the provided password matches the stored password for a user.
   * Uses bcrypt to securely compare passwords without exposing the hash.
   * 
   * @param {string} username - Username to verify password for
   * @param {string} password - Plain text password to verify
   * @returns {Promise<boolean>} True if password matches, false otherwise
   * @throws {Error} If username/password format is invalid or database query fails
   */
  async verifyPassword(username, password) {
    if (!validateInput(username, "string") || !validateInput(password, "string")) {
      throw new Error("Invalid username or password format");
    }
    try {
      const result = await this.pool.query(
        "SELECT password FROM users WHERE username = $1",
        [username]
      );
      if (!result.rows[0]) return false;
      return bcrypt.compare(password, result.rows[0].password);
    } catch (error) {
      handleDatabaseError(error, "verifyPassword");
    }
  }
  /**
   * Update user password
   * 
   * Changes the password for a user identified by their ID.
   * Securely hashes the new password before storing it.
   * 
   * @param {number} id - ID of the user whose password to update
   * @param {string} newPassword - New plain text password to set
   * @returns {Promise<void>} Resolves when password is updated
   * @throws {Error} If ID/password format is invalid or database update fails
   */
  async updateUserPassword(id, newPassword) {
    if (!validateInput(id, "id") || !validateInput(newPassword, "string")) {
      throw new Error("Invalid ID or password format");
    }
    try {
      const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
      await this.pool.query(
        "UPDATE users SET password = $1, password_changed_at = NOW(), force_password_change = FALSE WHERE id = $2",
        [hashedPassword, id]
      );
    } catch (error) {
      handleDatabaseError(error, "updateUserPassword");
    }
  }
  /**
   * Reset admin password
   * 
   * Resets the admin user's password back to the default value.
   * Used for system recovery when admin credentials are lost.
   * 
   * @returns {Promise<void>} Resolves when admin password is reset
   * @throws {Error} If the admin user cannot be found or database update fails
   */
  async resetAdminPassword() {
    try {
      const defaultPassword = "password";
      const hashedPassword = await bcrypt.hash(defaultPassword, SALT_ROUNDS);
      await this.pool.query(
        "UPDATE users SET password = $1 WHERE username = $2",
        [hashedPassword, "admin"]
      );
      console.log("Admin password has been reset successfully");
    } catch (error) {
      console.error("Error resetting admin password:", error);
      handleDatabaseError(error, "resetAdminPassword");
    }
  }
  /**
   * Update user force password change flag
   * 
   * Sets whether a user should be forced to change their password on next login.
   * Used during initial admin setup or when password policies require password changes.
   * 
   * @param {string} username - Username of the user to update
   * @param {boolean} forceChange - Whether to force password change on next login
   * @returns {Promise<void>} Resolves when force password change flag is updated
   * @throws {Error} If username format is invalid or database update fails
   */
  async updateUserForcePasswordChange(username, forceChange) {
    if (!validateInput(username, "string")) {
      throw new Error("Invalid username format");
    }
    try {
      await this.pool.query(
        "UPDATE users SET force_password_change = $1 WHERE username = $2",
        [forceChange, username]
      );
    } catch (error) {
      handleDatabaseError(error, "updateUserForcePasswordChange");
    }
  }
  /**
   * Create a new user
   * 
   * Creates a new user in the system with the specified details.
   * Uses transaction to ensure data integrity and prevent duplicate usernames.
   * 
   * @param {object} user - User data object
   * @param {string} user.name - Full name of the user
   * @param {string} user.username - Unique username for login
   * @param {string} user.password - Password in plain text (will be hashed)
   * @param {string} [user.role] - User role (defaults to 'user' if not specified)
   * @param {number} [user.company_id] - Optional company ID to associate with user
   * @returns {Promise<User>} Created user record
   * @throws {Error} If validation fails or username already exists
   */
  async createUser(user) {
    if (!validateInput(user.name, "string") || !validateInput(user.username, "string") || !validateInput(user.password, "string")) {
      throw new Error("Invalid user data format");
    }
    try {
      return await this.withTransaction(async (client) => {
        const existingUser = await client.query(
          "SELECT id FROM users WHERE username = $1",
          [user.username]
        );
        if (existingUser.rows.length > 0) {
          throw new Error("Username already exists");
        }
        const result = await client.query(
          "INSERT INTO users (name, username, password, role, company_id, created_at, password_changed_at, force_password_change) VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), $6) RETURNING id, name, username, role, company_id, created_at, password_changed_at, force_password_change",
          [user.name, user.username, user.password, user.role || "user", user.company_id, false]
        );
        return result.rows[0];
      });
    } catch (error) {
      handleDatabaseError(error, "createUser");
    }
  }
  /**
   * Update user information
   * 
   * Updates one or more fields of a user record.
   * Only updates fields that are provided in the data object.
   * Securely hashes password if it is being updated.
   * 
   * @param {number} id - ID of the user to update
   * @param {object} data - Data fields to update
   * @param {string} [data.name] - Updated user name
   * @param {string} [data.password] - New password (will be hashed)
   * @param {string} [data.role] - Updated user role
   * @param {number} [data.company_id] - Updated company association
   * @returns {Promise<User>} Updated user record
   * @throws {Error} If ID format is invalid or database update fails
   */
  async updateUser(id, data) {
    if (!validateInput(id, "id")) {
      throw new Error("Invalid ID format");
    }
    try {
      const updateFields = [];
      const values = [];
      let paramCount = 1;
      if (data.name) {
        updateFields.push(`name = $${paramCount}`);
        values.push(data.name);
        paramCount++;
      }
      if (data.password) {
        const hashedPassword = await bcrypt.hash(data.password, SALT_ROUNDS);
        updateFields.push(`password = $${paramCount}`);
        values.push(hashedPassword);
        paramCount++;
      }
      if (data.role) {
        updateFields.push(`role = $${paramCount}`);
        values.push(data.role);
        paramCount++;
      }
      if (data.company_id !== void 0) {
        updateFields.push(`company_id = $${paramCount}`);
        values.push(data.company_id);
        paramCount++;
      }
      values.push(id);
      const query2 = `
        UPDATE users 
        SET ${updateFields.join(", ")} 
        WHERE id = $${paramCount}
        RETURNING id, name, username, role, company_id
      `;
      const result = await this.pool.query(query2, values);
      return result.rows[0];
    } catch (error) {
      handleDatabaseError(error, "updateUser");
    }
  }
  /**
   * Delete a user
   * 
   * Permanently removes a user from the system by their ID.
   * 
   * @param {number} id - ID of the user to delete
   * @returns {Promise<void>} Resolves when user is deleted
   * @throws {Error} If ID format is invalid or database delete fails
   */
  async deleteUser(id) {
    if (!validateInput(id, "id")) {
      throw new Error("Invalid ID format");
    }
    try {
      await this.pool.query("DELETE FROM users WHERE id = $1", [id]);
    } catch (error) {
      handleDatabaseError(error, "deleteUser");
    }
  }
  /**
   * Create person information record
   * 
   * Creates a new client/person record with personal information, contact details,
   * address, and other relevant information.
   * 
   * @param {Omit<PersonInfo, 'id'>} data - Complete person information object without ID
   * @returns {Promise<PersonInfo>} Created person record with generated ID
   * @throws {Error} If database insertion fails
   */
  async createPersonInfo(data) {
    try {
      const {
        title,
        firstName,
        middleName,
        lastName,
        dateOfBirth,
        email,
        homePhone,
        mobilePhone,
        addressLine1,
        addressLine2,
        addressLine3,
        postCode,
        mailingAddressLine1,
        mailingAddressLine2,
        mailingAddressLine3,
        mailingPostCode,
        useHomeAddress,
        nextOfKinName,
        nextOfKinRelationship,
        nextOfKinAddress,
        nextOfKinEmail,
        nextOfKinPhone,
        hcpLevel,
        hcpStartDate,
        status,
        createdBy,
        segmentId
      } = data;
      const result = await this.pool.query(
        `INSERT INTO person_info (
          title, first_name, middle_name, last_name, date_of_birth, email,
          home_phone, mobile_phone, address_line1, address_line2, address_line3,
          post_code, mailing_address_line1, mailing_address_line2, mailing_address_line3,
          mailing_post_code, use_home_address, next_of_kin_name, next_of_kin_relationship, next_of_kin_address,
          next_of_kin_email, next_of_kin_phone, hcp_level, hcp_start_date, status, created_by, segment_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
        RETURNING *`,
        [
          title,
          firstName,
          middleName,
          lastName,
          dateOfBirth,
          email,
          homePhone,
          mobilePhone,
          addressLine1,
          addressLine2,
          addressLine3,
          postCode,
          mailingAddressLine1,
          mailingAddressLine2,
          mailingAddressLine3,
          mailingPostCode,
          useHomeAddress,
          nextOfKinName,
          nextOfKinRelationship,
          nextOfKinAddress,
          nextOfKinEmail,
          nextOfKinPhone,
          hcpLevel,
          hcpStartDate,
          status,
          createdBy,
          segmentId
        ]
      );
      return result.rows[0];
    } catch (error) {
      handleDatabaseError(error, "createPersonInfo");
    }
  }
  /**
   * Get all person information records
   * 
   * Retrieves all client/person records from the database.
   * Can be filtered by segment ID if provided.
   * 
   * @param {number} [segmentId] - Optional segment ID to filter by
   * @returns {Promise<PersonInfo[]>} Array of person information records
   * @throws {Error} If database query fails
   */
  async getAllPersonInfo(segmentId) {
    try {
      let query2 = "SELECT * FROM person_info";
      const params = [];
      if (segmentId) {
        query2 += " WHERE segment_id = $1";
        params.push(segmentId);
      }
      const result = await this.pool.query(query2, params);
      return result.rows.map((row) => ({
        id: row.id,
        title: row.title,
        firstName: row.first_name,
        middleName: row.middle_name,
        lastName: row.last_name,
        dateOfBirth: row.date_of_birth,
        email: row.email,
        homePhoneCountryCode: row.home_phone_country_code || null,
        homePhone: row.home_phone || null,
        mobilePhoneCountryCode: row.mobile_phone_country_code || null,
        mobilePhone: row.mobile_phone || null,
        addressLine1: row.address_line1,
        addressLine2: row.address_line2 || null,
        addressLine3: row.address_line3 || null,
        postCode: row.post_code,
        mailingAddressLine1: row.mailing_address_line1 || null,
        mailingAddressLine2: row.mailing_address_line2 || null,
        mailingAddressLine3: row.mailing_address_line3 || null,
        mailingPostCode: row.mailing_post_code || null,
        useHomeAddress: row.use_home_address,
        nextOfKinName: row.next_of_kin_name || null,
        nextOfKinRelationship: row.next_of_kin_relationship || null,
        nextOfKinAddress: row.next_of_kin_address || null,
        nextOfKinEmail: row.next_of_kin_email || null,
        nextOfKinPhoneCountryCode: row.next_of_kin_phone_country_code || null,
        nextOfKinPhone: row.next_of_kin_phone || null,
        hcpLevel: row.hcp_level || null,
        hcpStartDate: row.hcp_start_date || null,
        status: row.status || "New",
        createdBy: row.created_by || null,
        segmentId: row.segment_id || null
      }));
    } catch (error) {
      handleDatabaseError(error, "getAllPersonInfo");
    }
  }
  /**
   * Get person information by ID
   * 
   * Retrieves a specific client/person record by their unique ID.
   * 
   * @param {number} id - ID of the person to retrieve
   * @returns {Promise<PersonInfo | null>} Person record if found, null otherwise
   * @throws {Error} If ID format is invalid or database query fails
   */
  async getPersonInfoById(id) {
    if (!validateInput(id, "id")) {
      throw new Error("Invalid ID format");
    }
    try {
      const result = await this.pool.query("SELECT * FROM person_info WHERE id = $1", [id]);
      if (!result.rows[0]) return null;
      const row = result.rows[0];
      return {
        id: row.id,
        title: row.title,
        firstName: row.first_name,
        middleName: row.middle_name,
        lastName: row.last_name,
        dateOfBirth: row.date_of_birth,
        email: row.email,
        homePhoneCountryCode: row.home_phone_country_code || null,
        homePhone: row.home_phone || null,
        mobilePhoneCountryCode: row.mobile_phone_country_code || null,
        mobilePhone: row.mobile_phone || null,
        addressLine1: row.address_line1,
        addressLine2: row.address_line2 || null,
        addressLine3: row.address_line3 || null,
        postCode: row.post_code,
        mailingAddressLine1: row.mailing_address_line1 || null,
        mailingAddressLine2: row.mailing_address_line2 || null,
        mailingAddressLine3: row.mailing_address_line3 || null,
        mailingPostCode: row.mailing_post_code || null,
        useHomeAddress: row.use_home_address,
        nextOfKinName: row.next_of_kin_name || null,
        nextOfKinRelationship: row.next_of_kin_relationship || null,
        nextOfKinAddress: row.next_of_kin_address || null,
        nextOfKinEmail: row.next_of_kin_email || null,
        nextOfKinPhoneCountryCode: row.next_of_kin_phone_country_code || null,
        nextOfKinPhone: row.next_of_kin_phone || null,
        hcpLevel: row.hcp_level || null,
        hcpStartDate: row.hcp_start_date || null,
        status: row.status || "New",
        createdBy: row.created_by || null,
        segmentId: row.segment_id || null
      };
    } catch (error) {
      handleDatabaseError(error, "getPersonInfoById");
    }
  }
  /**
   * Update person information
   * 
   * Updates an existing client/person record with new information.
   * Performs comprehensive update of all fields.
   * 
   * @param {number} id - ID of the person record to update
   * @param {Omit<PersonInfo, 'id'>} data - Complete updated person information
   * @returns {Promise<PersonInfo>} Updated person record
   * @throws {Error} If ID format is invalid or database update fails
   */
  async updatePersonInfo(id, data) {
    if (!validateInput(id, "id")) {
      throw new Error("Invalid ID format");
    }
    try {
      const {
        title,
        firstName,
        middleName,
        lastName,
        dateOfBirth,
        email,
        homePhone,
        mobilePhone,
        addressLine1,
        addressLine2,
        addressLine3,
        postCode,
        mailingAddressLine1,
        mailingAddressLine2,
        mailingAddressLine3,
        mailingPostCode,
        useHomeAddress,
        nextOfKinName,
        nextOfKinRelationship,
        nextOfKinAddress,
        nextOfKinEmail,
        nextOfKinPhone,
        hcpLevel,
        hcpStartDate,
        status,
        createdBy,
        segmentId
      } = data;
      const result = await this.pool.query(
        `UPDATE person_info SET
          title = $1, first_name = $2, middle_name = $3, last_name = $4,
          date_of_birth = $5, email = $6, home_phone = $7, mobile_phone = $8,
          address_line1 = $9, address_line2 = $10, address_line3 = $11,
          post_code = $12, mailing_address_line1 = $13, mailing_address_line2 = $14,
          mailing_address_line3 = $15, mailing_post_code = $16, use_home_address = $17,
          next_of_kin_name = $18, next_of_kin_relationship = $19, next_of_kin_address = $20, next_of_kin_email = $21,
          next_of_kin_phone = $22, hcp_level = $23, hcp_start_date = $24, status = $25,
          segment_id = $26
        WHERE id = $27
        RETURNING *`,
        [
          title,
          firstName,
          middleName || "",
          lastName,
          dateOfBirth,
          email,
          homePhone || "",
          mobilePhone,
          addressLine1,
          addressLine2 || "",
          addressLine3 || "",
          postCode,
          mailingAddressLine1 || "",
          mailingAddressLine2 || "",
          mailingAddressLine3 || "",
          mailingPostCode || "",
          useHomeAddress,
          nextOfKinName || "",
          nextOfKinRelationship || "",
          nextOfKinAddress || "",
          nextOfKinEmail || "",
          nextOfKinPhone || "",
          hcpLevel || "",
          hcpStartDate || "",
          status || "New",
          segmentId,
          id
        ]
      );
      if (result.rows.length === 0) {
        throw new Error(`Person with ID ${id} not found`);
      }
      const row = result.rows[0];
      return {
        id: row.id,
        title: row.title,
        firstName: row.first_name,
        middleName: row.middle_name,
        lastName: row.last_name,
        dateOfBirth: row.date_of_birth,
        email: row.email,
        homePhone: row.home_phone,
        mobilePhone: row.mobile_phone,
        addressLine1: row.address_line1,
        addressLine2: row.address_line2,
        addressLine3: row.address_line3,
        postCode: row.post_code,
        mailingAddressLine1: row.mailing_address_line1,
        mailingAddressLine2: row.mailing_address_line2,
        mailingAddressLine3: row.mailing_address_line3,
        mailingPostCode: row.mailing_post_code,
        useHomeAddress: row.use_home_address,
        nextOfKinName: row.next_of_kin_name,
        nextOfKinRelationship: row.next_of_kin_relationship,
        nextOfKinAddress: row.next_of_kin_address,
        nextOfKinEmail: row.next_of_kin_email,
        nextOfKinPhone: row.next_of_kin_phone,
        hcpLevel: row.hcp_level,
        hcpStartDate: row.hcp_start_date,
        status: row.status,
        createdBy: row.created_by,
        segmentId: row.segment_id
      };
    } catch (error) {
      handleDatabaseError(error, "updatePersonInfo");
    }
  }
  /**
   * Check for duplicate service
   * 
   * Verifies if a service with the same category, type, and provider already exists.
   * Used to prevent duplicate entries in the master data table.
   * 
   * @param {string} serviceCategory - Service category to check
   * @param {string} serviceType - Service type to check
   * @param {string} serviceProvider - Service provider to check
   * @returns {Promise<boolean>} True if a duplicate exists, false otherwise
   * @throws {Error} If input validation fails or database query fails
   */
  async checkDuplicateService(serviceCategory, serviceType, serviceProvider) {
    if (!validateInput(serviceCategory, "string") || !validateInput(serviceType, "string") || !validateInput(serviceProvider, "string")) {
      throw new Error("Invalid service data format");
    }
    try {
      const result = await this.pool.query(
        "SELECT COUNT(*) FROM master_data WHERE service_category = $1 AND service_type = $2 AND service_provider = $3",
        [serviceCategory, serviceType, serviceProvider || ""]
      );
      return parseInt(result.rows[0].count) > 0;
    } catch (error) {
      handleDatabaseError(error, "checkDuplicateService");
    }
  }
  /**
   * Create master data entry
   * 
   * Creates a new service definition in the master data table.
   * Checks for duplicates before insertion.
   * 
   * @param {Omit<MasterData, 'id'>} data - Master data object without ID
   * @returns {Promise<MasterData>} Created master data record with generated ID
   * @throws {Error} If duplicate service exists or database insertion fails
   */
  async createMasterData(data) {
    try {
      const isDuplicate = await this.checkDuplicateService(
        data.serviceCategory,
        data.serviceType,
        data.serviceProvider || ""
      );
      if (isDuplicate) {
        throw new Error("A service with this combination of category, type, and provider already exists");
      }
      console.log("Creating master data with segmentId:", data.segmentId);
      const result = await this.pool.query(
        "INSERT INTO master_data (service_category, service_type, service_provider, active, created_by, segment_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
        [
          data.serviceCategory,
          data.serviceType,
          data.serviceProvider || "",
          data.active ?? true,
          data.createdBy,
          data.segmentId || null
        ]
      );
      return {
        id: result.rows[0].id,
        serviceCategory: result.rows[0].service_category,
        serviceType: result.rows[0].service_type,
        serviceProvider: result.rows[0].service_provider || void 0,
        active: result.rows[0].active,
        createdBy: result.rows[0].created_by,
        createdAt: result.rows[0].created_at,
        segmentId: result.rows[0].segment_id
      };
    } catch (error) {
      handleDatabaseError(error, "createMasterData");
    }
  }
  /**
   * Get all master data
   * 
   * Retrieves all service definitions from the master data table.
   * Can be filtered by segment ID if provided.
   * 
   * @param {number} [segmentId] - Optional segment ID to filter by
   * @returns {Promise<MasterData[]>} Array of master data records
   * @throws {Error} If database query fails
   */
  async getAllMasterData(segmentId) {
    try {
      let queryText = "SELECT * FROM master_data";
      const params = [];
      if (segmentId !== void 0) {
        queryText += " WHERE segment_id = $1 OR segment_id IS NULL";
        params.push(segmentId);
      }
      queryText += " ORDER BY id DESC";
      const result = await this.pool.query(queryText, params);
      return result.rows.map((row) => ({
        id: row.id,
        serviceCategory: row.service_category,
        serviceType: row.service_type,
        serviceProvider: row.service_provider,
        active: row.active,
        createdBy: row.created_by,
        createdAt: row.created_at,
        segmentId: row.segment_id
      }));
    } catch (error) {
      handleDatabaseError(error, "getAllMasterData");
    }
  }
  /**
   * Get master data by ID
   * 
   * Retrieves a specific master data record by its unique ID.
   * Used for fetching individual service definitions and audit logging.
   * 
   * @param {number} id - ID of the master data record to retrieve
   * @returns {Promise<MasterData | null>} Master data record if found, null otherwise
   * @throws {Error} If ID format is invalid or database query fails
   */
  async getMasterDataById(id) {
    if (!validateInput(id, "id")) {
      throw new Error("Invalid ID format");
    }
    try {
      const result = await this.pool.query("SELECT * FROM master_data WHERE id = $1", [id]);
      if (!result.rows[0]) return null;
      const row = result.rows[0];
      return {
        id: row.id,
        serviceCategory: row.service_category,
        serviceType: row.service_type,
        serviceProvider: row.service_provider,
        active: row.active,
        createdBy: row.created_by,
        createdAt: row.created_at,
        segmentId: row.segment_id
      };
    } catch (error) {
      handleDatabaseError(error, "getMasterDataById");
    }
  }
  /**
   * Update master data status
   * 
   * Updates the status of a master data record.
   * Used to enable/disable services or change their status.
   * 
   * @param {number} id - ID of the master data record to update
   * @param {string} status - New status value
   * @returns {Promise<void>} Resolves when status is updated
   * @throws {Error} If ID or status format is invalid or database update fails
   */
  async updateMasterDataStatus(id, status) {
    if (!validateInput(id, "id") || !validateInput(status, "string")) {
      throw new Error("Invalid ID or status format");
    }
    try {
      await this.pool.query("UPDATE master_data SET status = $1 WHERE id = $2", [status, id]);
    } catch (error) {
      handleDatabaseError(error, "updateMasterDataStatus");
    }
  }
  /**
   * Check if master data exists
   * 
   * Verifies if a specific combination of service category, type, and provider exists
   * in the master data table. Used to validate service assignments before creating
   * client service records.
   * 
   * @param {string} serviceCategory - Service category to check
   * @param {string} serviceType - Service type to check
   * @param {string} serviceProvider - Service provider to check
   * @param {number} [segmentId] - Optional segment ID to filter by
   * @returns {Promise<boolean>} True if the combination exists, false otherwise
   * @throws {Error} If input validation fails or database query fails
   */
  async checkMasterDataExists(serviceCategory, serviceType, serviceProvider, segmentId) {
    if (!validateInput(serviceCategory, "string") || !validateInput(serviceType, "string") || !validateInput(serviceProvider, "string")) {
      throw new Error("Invalid service data format");
    }
    try {
      let queryText = `
        SELECT COUNT(*) 
        FROM master_data 
        WHERE service_category = $1 
        AND service_type = $2 
        AND service_provider = $3
        AND active = true
      `;
      const params = [serviceCategory, serviceType, serviceProvider || ""];
      if (segmentId !== void 0) {
        queryText += " AND (segment_id = $4 OR segment_id IS NULL)";
        params.push(segmentId);
      }
      const result = await this.pool.query(queryText, params);
      return parseInt(result.rows[0].count) > 0;
    } catch (error) {
      handleDatabaseError(error, "checkMasterDataExists");
      throw error;
    }
  }
  /**
   * Update master data record
   * 
   * Updates service definition fields in the master data table.
   * Allows changing category, type, provider, active status, and segment.
   * 
   * @param {number} id - ID of the master data record to update
   * @param {Omit<MasterData, 'id'>} data - Updated master data information
   * @returns {Promise<MasterData>} Updated master data record
   * @throws {Error} If ID format is invalid or database update fails
   */
  async updateMasterData(id, data) {
    if (!validateInput(id, "id")) {
      throw new Error("Invalid ID format");
    }
    try {
      const result = await this.pool.query(
        `UPDATE master_data SET 
          service_category = $1,
          service_type = $2,
          service_provider = $3,
          active = $4,
          segment_id = $5
        WHERE id = $6 RETURNING *`,
        [
          data.serviceCategory,
          data.serviceType,
          data.serviceProvider || "",
          data.active,
          data.segmentId || null,
          id
        ]
      );
      if (result.rows.length === 0) {
        throw new Error("Master data record not found");
      }
      return {
        id: result.rows[0].id,
        serviceCategory: result.rows[0].service_category,
        serviceType: result.rows[0].service_type,
        serviceProvider: result.rows[0].service_provider || void 0,
        active: result.rows[0].active,
        createdBy: result.rows[0].created_by,
        createdAt: result.rows[0].created_at,
        segmentId: result.rows[0].segment_id
      };
    } catch (error) {
      handleDatabaseError(error, "updateMasterData");
    }
  }
  /**
   * Get documents by client ID
   * 
   * Retrieves all documents associated with a specific client.
   * Can be filtered by segment ID if provided.
   * 
   * @param {number} clientId - ID of the client whose documents to retrieve
   * @param {number} [segmentId] - Optional segment ID to filter documents by
   * @returns {Promise<Document[]>} Array of document records
   * @throws {Error} If database query fails
   */
  async getDocumentsByClientId(clientId, segmentId) {
    try {
      let queryText = "SELECT * FROM documents WHERE client_id = $1";
      const params = [clientId];
      if (segmentId !== void 0) {
        queryText += " AND (segment_id = $2 OR segment_id IS NULL)";
        params.push(segmentId);
      }
      const result = await this.pool.query(queryText, params);
      return result.rows.map((row) => ({
        id: row.id,
        clientId: row.client_id,
        documentName: row.document_name,
        documentType: row.document_type,
        filename: row.filename,
        filePath: row.file_path,
        uploadedAt: row.uploaded_at,
        createdBy: row.created_by,
        segmentId: row.segment_id
      }));
    } catch (error) {
      handleDatabaseError(error, "getDocumentsByClientId");
    }
  }
  /**
   * Create document record
   * 
   * Creates a new document record in the database after uploading a file.
   * Associates the document with a client.
   * 
   * @param {object} document - Document data object
   * @param {number} document.clientId - ID of the client the document belongs to
   * @param {string} document.documentName - Display name of the document
   * @param {string} document.documentType - Type/category of the document
   * @param {string} document.filename - Name of the file as stored in the filesystem
   * @param {string} document.filePath - Path to the file in the storage system
   * @param {number} document.createdBy - ID of the user who created the document
   * @param {Date} document.uploadedAt - Timestamp of when the document was uploaded
   * @param {number} [document.segmentId] - Optional segment ID to associate with the document
   * @returns {Promise<Document>} Created document record
   * @throws {Error} If database insertion fails
   */
  async createDocument(document) {
    try {
      const {
        clientId,
        documentName,
        documentType,
        filename,
        filePath,
        createdBy,
        uploadedAt,
        segmentId
      } = document;
      const result = await this.pool.query(
        `INSERT INTO documents (
          client_id, document_name, document_type, filename, file_path, created_by, uploaded_at, segment_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [clientId, documentName, documentType, filename, filePath, createdBy, uploadedAt, segmentId]
      );
      const row = result.rows[0];
      return {
        id: row.id,
        clientId: row.client_id,
        documentName: row.document_name,
        documentType: row.document_type,
        filename: row.filename,
        filePath: row.file_path,
        uploadedAt: row.uploaded_at,
        createdBy: row.created_by,
        segmentId: row.segment_id
      };
    } catch (error) {
      handleDatabaseError(error, "createDocument");
    }
  }
  /**
   * Get document by filename
   * 
   * Retrieves a document record by its filename.
   * Used to check if a file already exists or to fetch document metadata.
   * 
   * @param {string} filename - Name of the file to search for
   * @returns {Promise<Document | null>} Document record if found, null otherwise
   * @throws {Error} If filename format is invalid or database query fails
   */
  async getDocumentByFilename(filename) {
    if (!validateInput(filename, "string")) {
      throw new Error("Invalid filename format");
    }
    try {
      const result = await this.pool.query("SELECT * FROM documents WHERE filename = $1 LIMIT 1", [filename]);
      if (result.rows.length === 0) {
        return null;
      }
      const row = result.rows[0];
      return {
        id: row.id,
        clientId: row.client_id,
        documentName: row.document_name,
        documentType: row.document_type,
        filename: row.filename,
        filePath: row.file_path,
        uploadedAt: row.uploaded_at,
        createdBy: row.created_by
      };
    } catch (error) {
      handleDatabaseError(error, "getDocumentByFilename");
    }
  }
  /**
   * Get document by file path
   * 
   * Retrieves a document record by its file path in the storage system.
   * Used to locate documents based on their storage location.
   * 
   * @param {string} filePath - Path of the file to search for
   * @returns {Promise<Document | null>} Document record if found, null otherwise
   * @throws {Error} If file path format is invalid or database query fails
   */
  async getDocumentByFilePath(filePath) {
    if (!validateInput(filePath, "string")) {
      throw new Error("Invalid file path format");
    }
    try {
      const result = await this.pool.query("SELECT * FROM documents WHERE file_path = $1 LIMIT 1", [filePath]);
      if (result.rows.length === 0) {
        return null;
      }
      const row = result.rows[0];
      return {
        id: row.id,
        clientId: row.client_id,
        documentName: row.document_name,
        documentType: row.document_type,
        filename: row.filename,
        filePath: row.file_path,
        uploadedAt: row.uploaded_at,
        createdBy: row.created_by
      };
    } catch (error) {
      handleDatabaseError(error, "getDocumentByFilePath");
    }
  }
  /**
   * Get document by client ID and filename
   * 
   * Retrieves a document record by its client ID and filename.
   * Used to check if a file with the same name already exists for a specific client.
   * 
   * @param {number} clientId - ID of the client to search documents for
   * @param {string} filename - Name of the file to search for
   * @returns {Promise<Document | null>} Document record if found, null otherwise
   * @throws {Error} If input format is invalid or database query fails
   */
  async getDocumentByClientAndFilename(clientId, filename) {
    if (!validateInput(clientId, "id") || !validateInput(filename, "string")) {
      throw new Error("Invalid client ID or filename format");
    }
    try {
      const result = await this.pool.query(
        "SELECT * FROM documents WHERE client_id = $1 AND filename = $2 LIMIT 1",
        [clientId, filename]
      );
      if (result.rows.length === 0) {
        return null;
      }
      const row = result.rows[0];
      return {
        id: row.id,
        clientId: row.client_id,
        documentName: row.document_name,
        documentType: row.document_type,
        filename: row.filename,
        filePath: row.file_path,
        uploadedAt: row.uploaded_at,
        createdBy: row.created_by,
        segmentId: row.segment_id
      };
    } catch (error) {
      handleDatabaseError(error, "getDocumentByClientAndFilename");
    }
  }
  /**
   * Get client services by client ID
   * 
   * Retrieves all services assigned to a specific client.
   * Includes client name by joining with person_info table.
   * Can be filtered by segment ID if provided.
   * 
   * @param {number} clientId - ID of the client whose services to retrieve
   * @param {number} [segmentId] - Optional segment ID to filter services
   * @returns {Promise<ClientService[]>} Array of client service records
   * @throws {Error} If database query fails
   */
  async getClientServicesByClientId(clientId, segmentId) {
    try {
      let queryText = `
        SELECT cs.*, p.first_name, p.last_name 
        FROM client_services cs
        JOIN person_info p ON cs.client_id = p.id
        WHERE cs.client_id = $1
      `;
      const params = [clientId];
      if (segmentId !== void 0) {
        queryText += " AND (cs.segment_id = $2 OR cs.segment_id IS NULL)";
        console.log("[Storage] Filtering client services by segmentId:", segmentId);
        params.push(segmentId);
      }
      queryText += " ORDER BY cs.created_at DESC";
      console.log("[Storage] getClientServicesByClientId query:", queryText, "params:", params);
      const result = await this.pool.query(queryText, params);
      return result.rows.map((row) => ({
        id: row.id,
        clientId: row.client_id,
        serviceCategory: row.service_category,
        serviceType: row.service_type,
        serviceProvider: row.service_provider,
        serviceStartDate: row.service_start_date,
        serviceDays: row.service_days,
        serviceHours: row.service_hours,
        status: row.status,
        createdAt: row.created_at,
        createdBy: row.created_by,
        segmentId: row.segment_id,
        clientName: `${row.first_name} ${row.last_name}`
      }));
    } catch (error) {
      handleDatabaseError(error, "getClientServicesByClientId");
    }
  }
  /**
   * Get client services that reference specific master data
   * 
   * Retrieves all client services that use a specific combination of service category,
   * type, provider, and segment. Used to provide feedback when master data updates fail
   * due to foreign key constraints.
   * 
   * @param {string} serviceCategory - Service category to check
   * @param {string} serviceType - Service type to check  
   * @param {string} serviceProvider - Service provider to check
   * @param {number | null} segmentId - Segment ID to check (null for global services)
   * @returns {Promise<any[]>} Array of client services that reference this master data
   * @throws {Error} If database query fails
   */
  async getClientServicesReferencingMasterData(serviceCategory, serviceType, serviceProvider, segmentId) {
    if (!validateInput(serviceCategory, "string") || !validateInput(serviceType, "string") || !validateInput(serviceProvider, "string")) {
      throw new Error("Invalid input parameters");
    }
    try {
      const query2 = `
        SELECT cs.id, cs.client_id, p.first_name, p.last_name, cs.service_start_date, cs.status
        FROM client_services cs
        JOIN person_info p ON cs.client_id = p.id
        WHERE cs.service_category = $1 
          AND cs.service_type = $2 
          AND cs.service_provider = $3
          AND (cs.segment_id = $4 OR (cs.segment_id IS NULL AND $4 IS NULL))
        ORDER BY p.first_name, p.last_name
      `;
      const result = await this.pool.query(query2, [serviceCategory, serviceType, serviceProvider, segmentId]);
      return result.rows.map((row) => ({
        id: row.id,
        clientId: row.client_id,
        clientName: `${row.first_name} ${row.last_name}`,
        serviceStartDate: row.service_start_date,
        status: row.status
      }));
    } catch (error) {
      handleDatabaseError(error, "getClientServicesReferencingMasterData");
      throw error;
    }
  }
  /**
   * AUDIT LOGGING METHODS
   * 
   * Methods for tracking user activities, errors, and system events
   * for compliance, debugging, and monitoring purposes.
   */
  /**
   * Log user activity for audit trail
   */
  async logUserActivity(logData) {
    try {
      const query2 = `
        INSERT INTO audit_logs (
          user_id,
          username,
          action,
          resource_type,
          resource_id,
          ip_address,
          user_agent,
          created_at,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `;
      const values = [
        logData.userId || null,
        logData.username || null,
        logData.action,
        logData.resourceType || null,
        logData.resourceId || null,
        logData.ipAddress || null,
        logData.userAgent || null,
        logData.timestamp || /* @__PURE__ */ new Date(),
        logData.details ? JSON.stringify(this.filterSensitiveData(logData.details)) : "{}"
      ];
      await this.pool.query(query2, values);
    } catch (error) {
      console.error("Failed to log user activity:", error);
    }
  }
  /**
   * Log system errors for debugging and monitoring
   */
  async logError(errorData) {
    try {
      const query2 = `
        INSERT INTO error_logs (
          user_id,
          username,
          error_type,
          error_code,
          error_message,
          stack_trace,
          method,
          endpoint,
          ip_address,
          user_agent,
          company_id,
          segment_id,
          request_data,
          request_headers,
          session_id,
          severity,
          resolved,
          resolved_at,
          resolved_by,
          created_at,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
      `;
      const values = [
        errorData.userId || null,
        errorData.username || null,
        errorData.errorType,
        errorData.errorCode || null,
        errorData.errorMessage,
        errorData.stackTrace || null,
        errorData.method || null,
        errorData.endpoint || null,
        errorData.ipAddress || null,
        errorData.userAgent || null,
        errorData.companyId || null,
        errorData.segmentId || null,
        errorData.requestData ? JSON.stringify(this.filterSensitiveData(errorData.requestData)) : null,
        errorData.requestHeaders ? JSON.stringify(this.filterSensitiveHeaders(errorData.requestHeaders)) : null,
        errorData.sessionId || null,
        errorData.severity || "ERROR",
        errorData.resolved || false,
        errorData.resolvedAt || null,
        errorData.resolvedBy || null,
        errorData.timestamp || /* @__PURE__ */ new Date(),
        errorData.metadata ? JSON.stringify(this.filterSensitiveData(errorData.metadata)) : null
      ];
      await this.pool.query(query2, values);
    } catch (error) {
      console.error("Failed to log error:", error);
    }
  }
  /**
   * Log login attempts and authentication events
   */
  async logLogin(loginData) {
    try {
      const query2 = `
        INSERT INTO login_logs (
          username,
          user_id,
          login_type,
          failure_reason,
          ip_address,
          user_agent,
          session_id,
          company_id,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `;
      const values = [
        loginData.username || null,
        loginData.userId || null,
        loginData.loginType,
        loginData.failureReason || null,
        loginData.ipAddress || null,
        loginData.userAgent || null,
        loginData.sessionId || null,
        loginData.companyId || null,
        loginData.timestamp || /* @__PURE__ */ new Date()
      ];
      await this.pool.query(query2, values);
    } catch (error) {
      console.error("Failed to log login attempt:", error);
    }
  }
  /**
   * Log performance metrics
   */
  async logPerformance(perfData) {
    try {
      const query2 = `
        INSERT INTO performance_logs (
          endpoint,
          method,
          user_id,
          company_id,
          response_time_ms,
          response_status,
          memory_usage_mb,
          cpu_usage_percent,
          database_query_count,
          database_time_ms,
          cache_hits,
          cache_misses,
          request_size_bytes,
          response_size_bytes,
          created_at,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      `;
      const values = [
        perfData.endpoint,
        perfData.method,
        perfData.userId || null,
        perfData.companyId || null,
        perfData.responseTimeMs,
        perfData.responseStatus,
        perfData.memoryUsageMb || null,
        perfData.cpuUsagePercent || null,
        perfData.databaseQueryCount || null,
        perfData.databaseTimeMs || null,
        perfData.cacheHits || null,
        perfData.cacheMisses || null,
        perfData.requestSizeBytes || null,
        perfData.responseSizeBytes || null,
        perfData.timestamp || /* @__PURE__ */ new Date(),
        perfData.metadata ? JSON.stringify(this.filterSensitiveData(perfData.metadata)) : null
      ];
      await this.pool.query(query2, values);
    } catch (error) {
      console.error("Failed to log performance data:", error);
    }
  }
  /**
   * Retrieve audit logs with filtering
   */
  async getAuditLogs(filters = {}) {
    try {
      let query2 = "SELECT * FROM audit_logs WHERE 1=1";
      const params = [];
      let paramIndex = 1;
      if (filters.userId) {
        query2 += ` AND user_id = $${paramIndex}`;
        params.push(filters.userId);
        paramIndex++;
      }
      if (filters.username) {
        query2 += ` AND username = $${paramIndex}`;
        params.push(filters.username);
        paramIndex++;
      }
      if (filters.action) {
        query2 += ` AND action = $${paramIndex}`;
        params.push(filters.action);
        paramIndex++;
      }
      if (filters.resourceType) {
        query2 += ` AND resource_type = $${paramIndex}`;
        params.push(filters.resourceType);
        paramIndex++;
      }
      if (filters.startDate) {
        query2 += ` AND timestamp >= $${paramIndex}`;
        params.push(filters.startDate);
        paramIndex++;
      }
      if (filters.endDate) {
        query2 += ` AND timestamp <= $${paramIndex}`;
        params.push(filters.endDate);
        paramIndex++;
      }
      query2 += " ORDER BY timestamp DESC";
      if (filters.limit) {
        query2 += ` LIMIT $${paramIndex}`;
        params.push(filters.limit);
        paramIndex++;
      }
      if (filters.offset) {
        query2 += ` OFFSET $${paramIndex}`;
        params.push(filters.offset);
        paramIndex++;
      }
      const result = await this.pool.query(query2, params);
      return result.rows;
    } catch (error) {
      handleDatabaseError(error, "getAuditLogs");
      return [];
    }
  }
  /**
   * Filter sensitive data from logs
   */
  filterSensitiveData(data) {
    if (!data || typeof data !== "object") {
      return data;
    }
    const filtered = { ...data };
    const sensitiveFields = ["password", "token", "authorization", "secret", "key", "ssn", "creditCard"];
    for (const field of sensitiveFields) {
      if (filtered[field]) {
        filtered[field] = "[REDACTED]";
      }
    }
    return filtered;
  }
  /**
   * Filter sensitive headers from logs
   */
  filterSensitiveHeaders(headers) {
    if (!headers || typeof headers !== "object") {
      return headers;
    }
    const filtered = { ...headers };
    const sensitiveHeaders = ["authorization", "cookie", "x-api-key", "x-auth-token"];
    for (const header of sensitiveHeaders) {
      if (filtered[header]) {
        filtered[header] = "[REDACTED]";
      }
    }
    return filtered;
  }
  /**
   * Get all segments by company
   * 
   * Retrieves all segments belonging to a specific company.
   * Returns segments sorted alphabetically by name.
   * 
   * @param {number} companyId - ID of the company whose segments to retrieve
   * @returns {Promise<Segment[]>} Array of segment records for the company
   * @throws {Error} If database query fails
   */
  async getAllSegmentsByCompany(companyId) {
    if (!validateInput(companyId, "id")) {
      throw new Error("Invalid company ID format");
    }
    try {
      const result = await this.pool.query(
        "SELECT * FROM segments WHERE company_id = $1 ORDER BY segment_name",
        [companyId]
      );
      return result.rows.map((row) => ({
        id: row.id,
        segment_name: row.segment_name,
        company_id: row.company_id,
        created_at: row.created_at,
        created_by: row.created_by
      }));
    } catch (error) {
      handleDatabaseError(error, "getAllSegmentsByCompany");
      throw error;
    }
  }
  /**
   * Get segment by ID
   * 
   * Retrieves a specific segment record by its unique ID.
   * Used for segment access validation and segment management.
   * 
   * @param {number} id - ID of the segment to retrieve
   * @returns {Promise<Segment | null>} Segment record if found, null otherwise
   * @throws {Error} If database query fails
   */
  async getSegmentById(id) {
    if (!validateInput(id, "id")) {
      throw new Error("Invalid segment ID format");
    }
    try {
      const result = await this.pool.query(
        "SELECT * FROM segments WHERE id = $1",
        [id]
      );
      if (result.rows.length === 0) {
        return null;
      }
      const row = result.rows[0];
      return {
        id: row.id,
        segment_name: row.segment_name,
        company_id: row.company_id,
        created_at: row.created_at,
        created_by: row.created_by
      };
    } catch (error) {
      handleDatabaseError(error, "getSegmentById");
      throw error;
    }
  }
  /**
   * Creates a new case note for a service with optional document attachments.
   * Uses a transaction to ensure data consistency when linking documents.
   * 
   * @param {NewServiceCaseNote} caseNoteData - Case note data
   * @returns {Promise<ServiceCaseNote>} Created case note with linked documents
   * @throws {Error} If validation fails or database query fails
   */
  async createServiceCaseNote(caseNoteData) {
    if (!validateInput(caseNoteData.serviceId, "id") || !validateInput(caseNoteData.noteText, "string") || !validateInput(caseNoteData.createdBy, "id")) {
      throw new Error("Invalid case note data format");
    }
    try {
      return await this.withTransaction(async (client) => {
        const caseNoteResult = await client.query(
          `INSERT INTO service_case_notes (service_id, note_text, created_by, updated_by, created_at, updated_at) 
           VALUES ($1, $2, $3, $3, NOW(), NOW()) 
           RETURNING id, service_id, note_text, created_at, updated_at, created_by, updated_by`,
          [caseNoteData.serviceId, caseNoteData.noteText, caseNoteData.createdBy]
        );
        const caseNote = caseNoteResult.rows[0];
        const documents = [];
        if (caseNoteData.documentIds && caseNoteData.documentIds.length > 0) {
          for (const documentId of caseNoteData.documentIds) {
            const docCheck = await client.query(
              "SELECT id FROM documents WHERE id = $1",
              [documentId]
            );
            if (docCheck.rows.length === 0) {
              throw new Error(`Document with ID ${documentId} not found`);
            }
            await client.query(
              `INSERT INTO case_note_documents (case_note_id, document_id, created_by) 
               VALUES ($1, $2, $3)`,
              [caseNote.id, documentId, caseNoteData.createdBy]
            );
            const docResult = await client.query(
              `SELECT id, client_id, document_name, document_type, filename, file_path, uploaded_at, created_by, segment_id 
               FROM documents WHERE id = $1`,
              [documentId]
            );
            if (docResult.rows.length > 0) {
              const docRow = docResult.rows[0];
              documents.push({
                id: docRow.id,
                clientId: docRow.client_id,
                documentName: docRow.document_name,
                documentType: docRow.document_type,
                filename: docRow.filename,
                filePath: docRow.file_path,
                uploadedAt: docRow.uploaded_at,
                createdBy: docRow.created_by,
                segmentId: docRow.segment_id
              });
            }
          }
        }
        return {
          id: caseNote.id,
          serviceId: caseNote.service_id,
          noteText: caseNote.note_text,
          createdAt: caseNote.created_at,
          updatedAt: caseNote.updated_at,
          createdBy: caseNote.created_by,
          updatedBy: caseNote.updated_by,
          documents: documents.length > 0 ? documents : void 0
        };
      });
    } catch (error) {
      handleDatabaseError(error, "createServiceCaseNote");
      throw error;
    }
  }
  /**
   * Get service case notes by service ID
   * 
   * Retrieves all case notes for a specific service, including linked documents.
   * Orders notes by creation date (newest first).
   * 
   * @param {number} serviceId - ID of the service
   * @returns {Promise<ServiceCaseNote[]>} Array of case notes with documents
   * @throws {Error} If validation fails or database query fails
   */
  async getServiceCaseNotesByServiceId(serviceId) {
    if (!validateInput(serviceId, "id")) {
      throw new Error("Invalid service ID format");
    }
    try {
      const notesResult = await this.pool.query(
        `SELECT id, service_id, note_text, created_at, updated_at, created_by, updated_by 
         FROM service_case_notes 
         WHERE service_id = $1 
         ORDER BY created_at DESC`,
        [serviceId]
      );
      const notes = [];
      for (const noteRow of notesResult.rows) {
        const documentsResult = await this.pool.query(
          `SELECT d.id, d.client_id, d.document_name, d.document_type, d.filename, d.file_path, d.uploaded_at, d.created_by, d.segment_id
           FROM documents d
           INNER JOIN case_note_documents cnd ON d.id = cnd.document_id
           WHERE cnd.case_note_id = $1
           ORDER BY cnd.created_at ASC`,
          [noteRow.id]
        );
        const documents = documentsResult.rows.map((docRow) => ({
          id: docRow.id,
          clientId: docRow.client_id,
          documentName: docRow.document_name,
          documentType: docRow.document_type,
          filename: docRow.filename,
          filePath: docRow.file_path,
          uploadedAt: docRow.uploaded_at,
          createdBy: docRow.created_by,
          segmentId: docRow.segment_id
        }));
        notes.push({
          id: noteRow.id,
          serviceId: noteRow.service_id,
          noteText: noteRow.note_text,
          createdAt: noteRow.created_at,
          updatedAt: noteRow.updated_at,
          createdBy: noteRow.created_by,
          updatedBy: noteRow.updated_by,
          documents: documents.length > 0 ? documents : void 0
        });
      }
      return notes;
    } catch (error) {
      handleDatabaseError(error, "getServiceCaseNotesByServiceId");
      throw error;
    }
  }
  // COMPANY MANAGEMENT METHODS
  /**
   * Gets all companies from the database.
   * 
   * @returns {Promise<Company[]>} Array of all companies
   * @throws {Error} Database operation error
   */
  async getAllCompanies() {
    try {
      const result = await this.pool.query(
        `SELECT company_id, company_name, registered_address, postal_address, 
                contact_person_name, contact_person_phone, contact_person_email, 
                created_at, created_by 
         FROM companies ORDER BY company_name`
      );
      return result.rows.map((row) => ({
        company_id: row.company_id,
        company_name: row.company_name,
        registered_address: row.registered_address,
        postal_address: row.postal_address,
        contact_person_name: row.contact_person_name,
        contact_person_phone: row.contact_person_phone,
        contact_person_email: row.contact_person_email,
        created_at: row.created_at,
        created_by: row.created_by
      }));
    } catch (error) {
      handleDatabaseError(error, "getAllCompanies");
      throw error;
    }
  }
  /**
   * Creates a new company.
   * 
   * @param {NewCompany} companyData - Company data to create
   * @returns {Promise<Company>} Created company
   * @throws {Error} Database operation error
   */
  async createCompany(companyData) {
    validateInput(companyData, "Company data is required");
    try {
      const result = await this.pool.query(
        `INSERT INTO companies (company_name, registered_address, postal_address, 
                               contact_person_name, contact_person_phone, contact_person_email, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING company_id, company_name, registered_address, postal_address, 
                   contact_person_name, contact_person_phone, contact_person_email, 
                   created_at, created_by`,
        [
          companyData.company_name,
          companyData.registered_address,
          companyData.postal_address,
          companyData.contact_person_name,
          companyData.contact_person_phone,
          companyData.contact_person_email,
          companyData.created_by || null
        ]
      );
      const row = result.rows[0];
      return {
        company_id: row.company_id,
        company_name: row.company_name,
        registered_address: row.registered_address,
        postal_address: row.postal_address,
        contact_person_name: row.contact_person_name,
        contact_person_phone: row.contact_person_phone,
        contact_person_email: row.contact_person_email,
        created_at: row.created_at,
        created_by: row.created_by
      };
    } catch (error) {
      handleDatabaseError(error, "createCompany");
      throw error;
    }
  }
  /**
   * Gets a company by ID.
   * 
   * @param {number} companyId - Company ID
   * @returns {Promise<Company | null>} Company data or null if not found
   * @throws {Error} Database operation error
   */
  async getCompanyById(companyId) {
    validateInput(companyId, "Company ID is required");
    try {
      const result = await this.pool.query(
        `SELECT company_id, company_name, registered_address, postal_address, 
                contact_person_name, contact_person_phone, contact_person_email, 
                created_at, created_by 
         FROM companies WHERE company_id = $1`,
        [companyId]
      );
      if (result.rows.length === 0) {
        return null;
      }
      const row = result.rows[0];
      return {
        company_id: row.company_id,
        company_name: row.company_name,
        registered_address: row.registered_address,
        postal_address: row.postal_address,
        contact_person_name: row.contact_person_name,
        contact_person_phone: row.contact_person_phone,
        contact_person_email: row.contact_person_email,
        created_at: row.created_at,
        created_by: row.created_by
      };
    } catch (error) {
      handleDatabaseError(error, "getCompanyById");
      throw error;
    }
  }
  /**
   * Updates a company.
   * 
   * @param {number} companyId - Company ID to update
   * @param {Partial<NewCompany>} updates - Company data to update
   * @returns {Promise<Company>} Updated company
   * @throws {Error} Database operation error
   */
  async updateCompany(companyId, updates) {
    validateInput(companyId, "Company ID is required");
    validateInput(updates, "Update data is required");
    const updateFields = [];
    const values = [];
    let paramCount = 1;
    if (updates.company_name !== void 0) {
      updateFields.push(`company_name = $${paramCount}`);
      values.push(updates.company_name);
      paramCount++;
    }
    if (updates.registered_address !== void 0) {
      updateFields.push(`registered_address = $${paramCount}`);
      values.push(updates.registered_address);
      paramCount++;
    }
    if (updates.postal_address !== void 0) {
      updateFields.push(`postal_address = $${paramCount}`);
      values.push(updates.postal_address);
      paramCount++;
    }
    if (updates.contact_person_name !== void 0) {
      updateFields.push(`contact_person_name = $${paramCount}`);
      values.push(updates.contact_person_name);
      paramCount++;
    }
    if (updates.contact_person_phone !== void 0) {
      updateFields.push(`contact_person_phone = $${paramCount}`);
      values.push(updates.contact_person_phone);
      paramCount++;
    }
    if (updates.contact_person_email !== void 0) {
      updateFields.push(`contact_person_email = $${paramCount}`);
      values.push(updates.contact_person_email);
      paramCount++;
    }
    if (updateFields.length === 0) {
      throw new Error("No valid fields to update");
    }
    values.push(companyId);
    try {
      const result = await this.pool.query(
        `UPDATE companies SET ${updateFields.join(", ")} WHERE company_id = $${paramCount}
         RETURNING company_id, company_name, registered_address, postal_address, 
                   contact_person_name, contact_person_phone, contact_person_email, 
                   created_at, created_by`,
        values
      );
      if (result.rows.length === 0) {
        throw new Error("Company not found");
      }
      const row = result.rows[0];
      return {
        company_id: row.company_id,
        company_name: row.company_name,
        registered_address: row.registered_address,
        postal_address: row.postal_address,
        contact_person_name: row.contact_person_name,
        contact_person_phone: row.contact_person_phone,
        contact_person_email: row.contact_person_email,
        created_at: row.created_at,
        created_by: row.created_by
      };
    } catch (error) {
      handleDatabaseError(error, "updateCompany");
      throw error;
    }
  }
  // SEGMENT MANAGEMENT METHODS
  /**
   * Creates a new segment.
   * 
   * @param {NewSegment} segmentData - Segment data to create
   * @returns {Promise<Segment>} Created segment
   * @throws {Error} Database operation error
   */
  async createSegment(segmentData) {
    validateInput(segmentData, "Segment data is required");
    try {
      const result = await this.pool.query(
        `INSERT INTO segments (segment_name, company_id, created_by)
         VALUES ($1, $2, $3)
         RETURNING id, segment_name, company_id, created_at, created_by`,
        [segmentData.segment_name, segmentData.company_id, segmentData.created_by || null]
      );
      const row = result.rows[0];
      return {
        id: row.id,
        segment_name: row.segment_name,
        company_id: row.company_id,
        created_at: row.created_at,
        created_by: row.created_by
      };
    } catch (error) {
      handleDatabaseError(error, "createSegment");
      throw error;
    }
  }
  /**
   * Updates a segment.
   * 
   * @param {number} segmentId - Segment ID to update
   * @param {Partial<NewSegment>} updates - Segment data to update
   * @returns {Promise<Segment>} Updated segment
   * @throws {Error} Database operation error
   */
  async updateSegment(segmentId, updates) {
    validateInput(segmentId, "Segment ID is required");
    validateInput(updates, "Update data is required");
    const updateFields = [];
    const values = [];
    let paramCount = 1;
    if (updates.segment_name !== void 0) {
      updateFields.push(`segment_name = $${paramCount}`);
      values.push(updates.segment_name);
      paramCount++;
    }
    if (updates.company_id !== void 0) {
      updateFields.push(`company_id = $${paramCount}`);
      values.push(updates.company_id);
      paramCount++;
    }
    if (updateFields.length === 0) {
      throw new Error("No valid fields to update");
    }
    values.push(segmentId);
    try {
      const result = await this.pool.query(
        `UPDATE segments SET ${updateFields.join(", ")} WHERE id = $${paramCount}
         RETURNING id, segment_name, company_id, created_at, created_by`,
        values
      );
      if (result.rows.length === 0) {
        throw new Error("Segment not found");
      }
      const row = result.rows[0];
      return {
        id: row.id,
        segment_name: row.segment_name,
        company_id: row.company_id,
        created_at: row.created_at,
        created_by: row.created_by
      };
    } catch (error) {
      handleDatabaseError(error, "updateSegment");
      throw error;
    }
  }
  // CLIENT SERVICE MANAGEMENT METHODS
  /**
   * Updates a client service status.
   * 
   * @param {number} clientServiceId - Client service ID to update
   * @param {string} status - New status
   * @returns {Promise<ClientService>} Updated client service
   * @throws {Error} Database operation error
   */
  async updateClientServiceStatus(clientServiceId, status) {
    validateInput(clientServiceId, "Client service ID is required");
    validateInput(status, "Status is required");
    try {
      const result = await this.pool.query(
        `UPDATE client_services 
         SET status = $1 
         WHERE id = $2
         RETURNING id, client_id, service_category, service_type, service_provider, 
                   service_start_date, service_days, service_hours, status, 
                   created_at, created_by, segment_id`,
        [status, clientServiceId]
      );
      if (result.rows.length === 0) {
        throw new Error("Client service not found");
      }
      const row = result.rows[0];
      return {
        id: row.id,
        clientId: row.client_id,
        serviceCategory: row.service_category,
        serviceType: row.service_type,
        serviceProvider: row.service_provider,
        serviceStartDate: row.service_start_date,
        serviceDays: Array.isArray(row.service_days) ? row.service_days : [],
        serviceHours: row.service_hours,
        status: row.status,
        createdAt: row.created_at,
        createdBy: row.created_by,
        segmentId: row.segment_id
      };
    } catch (error) {
      handleDatabaseError(error, "updateClientServiceStatus");
      throw error;
    }
  }
  /**
   * Gets client services with optional filtering.
   * 
   * @param {number} [clientId] - Optional client ID to filter by
   * @param {number} [serviceId] - Optional service ID to filter by (unused in current schema)
   * @param {string} [status] - Optional status to filter by
   * @returns {Promise<ClientService[]>} Array of client services
   * @throws {Error} Database operation error
   */
  async getClientServices(clientId, serviceId, status) {
    const conditions = [];
    const values = [];
    let paramCount = 1;
    if (clientId !== void 0) {
      conditions.push(`client_id = $${paramCount}`);
      values.push(clientId);
      paramCount++;
    }
    if (status !== void 0) {
      conditions.push(`status = $${paramCount}`);
      values.push(status);
      paramCount++;
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    try {
      const result = await this.pool.query(
        `SELECT id, client_id, service_category, service_type, service_provider, 
                service_start_date, service_days, service_hours, status, 
                created_at, created_by, segment_id
         FROM client_services ${whereClause} ORDER BY created_at DESC`,
        values
      );
      return result.rows.map((row) => ({
        id: row.id,
        clientId: row.client_id,
        serviceCategory: row.service_category,
        serviceType: row.service_type,
        serviceProvider: row.service_provider,
        serviceStartDate: row.service_start_date,
        serviceDays: Array.isArray(row.service_days) ? row.service_days : [],
        serviceHours: row.service_hours,
        status: row.status,
        createdAt: row.created_at,
        createdBy: row.created_by,
        segmentId: row.segment_id
      }));
    } catch (error) {
      handleDatabaseError(error, "getClientServices");
      throw error;
    }
  }
  /**
   * Creates a new client service.
   * 
   * @param {NewClientService} clientServiceData - Client service data to create
   * @returns {Promise<ClientService>} Created client service
   * @throws {Error} Database operation error
   */
  async createClientService(clientServiceData) {
    validateInput(clientServiceData, "Client service data is required");
    try {
      const result = await this.pool.query(
        `INSERT INTO client_services (client_id, service_category, service_type, service_provider, 
                                     service_start_date, service_days, service_hours, status, 
                                     created_by, segment_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, client_id, service_category, service_type, service_provider, 
                   service_start_date, service_days, service_hours, status, 
                   created_at, created_by, segment_id`,
        [
          clientServiceData.clientId,
          clientServiceData.serviceCategory,
          clientServiceData.serviceType,
          clientServiceData.serviceProvider,
          clientServiceData.serviceStartDate,
          clientServiceData.serviceDays,
          clientServiceData.serviceHours,
          clientServiceData.status || "active",
          clientServiceData.createdBy || null,
          clientServiceData.segmentId || null
        ]
      );
      const row = result.rows[0];
      return {
        id: row.id,
        clientId: row.client_id,
        serviceCategory: row.service_category,
        serviceType: row.service_type,
        serviceProvider: row.service_provider,
        serviceStartDate: row.service_start_date,
        serviceDays: Array.isArray(row.service_days) ? row.service_days : [],
        serviceHours: row.service_hours,
        status: row.status,
        createdAt: row.created_at,
        createdBy: row.created_by,
        segmentId: row.segment_id
      };
    } catch (error) {
      handleDatabaseError(error, "createClientService");
      throw error;
    }
  }
  /**
   * Gets the count of case notes for a specific service
   * 
   * @param {number} serviceId - The ID of the service to count notes for
   * @returns {Promise<number>} Number of case notes for the service
   * @throws {Error} If serviceId is invalid or database error occurs
   */
  async getServiceCaseNotesCount(serviceId) {
    if (!validateInput(serviceId, "id")) {
      throw new Error("Invalid service ID format");
    }
    try {
      const result = await this.pool.query(
        `SELECT COUNT(*) as count 
         FROM service_case_notes 
         WHERE service_id = $1`,
        [serviceId]
      );
      return parseInt(result.rows[0].count) || 0;
    } catch (error) {
      console.error(`Error getting case notes count for service ${serviceId}:`, error);
      throw handleDatabaseError(error, `Failed to get case notes count for service ${serviceId}`);
    }
  }
};
var storageInstance = null;
async function getStorage() {
  if (!storageInstance) {
    const pool = await getConnectionPool();
    storageInstance = new Storage(pool);
  }
  return storageInstance;
}
async function getPool() {
  return getConnectionPool();
}

// src/middleware/global-error-handler.ts
process.on("uncaughtException", async (error) => {
  console.error("\u{1F6A8} UNCAUGHT EXCEPTION:", error);
  try {
    const storage2 = await getStorage();
    await storage2.logError({
      errorType: "UNCAUGHT_EXCEPTION",
      errorCode: "UNCAUGHT_EXCEPTION",
      errorMessage: error.message,
      stackTrace: error.stack,
      severity: "CRITICAL",
      metadata: {
        processId: process.pid,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        timestamp: /* @__PURE__ */ new Date()
      },
      timestamp: /* @__PURE__ */ new Date()
    });
  } catch (logError) {
    console.error("Failed to log uncaught exception:", logError);
  }
  setTimeout(() => {
    process.exit(1);
  }, 1e3);
});
process.on("unhandledRejection", async (reason, promise) => {
  console.error("\u{1F6A8} UNHANDLED PROMISE REJECTION:", reason);
  try {
    const errorMessage = reason instanceof Error ? reason.message : String(reason);
    const stackTrace = reason instanceof Error ? reason.stack : void 0;
    const storage2 = await getStorage();
    await storage2.logError({
      errorType: "UNHANDLED_PROMISE_REJECTION",
      errorCode: "UNHANDLED_PROMISE_REJECTION",
      errorMessage,
      stackTrace,
      severity: "CRITICAL",
      metadata: {
        promise: promise.toString(),
        reason: String(reason),
        processId: process.pid,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        timestamp: /* @__PURE__ */ new Date()
      },
      timestamp: /* @__PURE__ */ new Date()
    });
  } catch (logError) {
    console.error("Failed to log unhandled promise rejection:", logError);
  }
});
process.on("warning", async (warning) => {
  console.warn("\u26A0\uFE0F PROCESS WARNING:", warning);
  try {
    const storage2 = await getStorage();
    await storage2.logError({
      errorType: "PROCESS_WARNING",
      errorCode: "PROCESS_WARNING",
      errorMessage: warning.message,
      stackTrace: warning.stack,
      severity: "WARNING",
      metadata: {
        warningName: warning.name,
        processId: process.pid,
        uptime: process.uptime(),
        timestamp: /* @__PURE__ */ new Date()
      },
      timestamp: /* @__PURE__ */ new Date()
    });
  } catch (logError) {
    console.error("Failed to log process warning:", logError);
  }
});

// index.ts
import express from "express";

// src/services/auth.service.ts
import bcrypt2 from "bcrypt";
var SALT_ROUNDS2 = 10;
var AuthService = class {
  static async hashPassword(password) {
    return bcrypt2.hash(password, SALT_ROUNDS2);
  }
  static async validateUser(username, password) {
    try {
      const storage2 = await getStorage();
      const user = await storage2.getUserByUsername(username);
      if (!user) {
        return null;
      }
      const isValid = await bcrypt2.compare(password, user.password);
      if (!isValid) {
        return null;
      }
      const { password: _, ...userWithoutPassword } = user;
      return {
        ...userWithoutPassword,
        requiresPasswordChange: user.force_password_change || false
      };
    } catch (error) {
      console.error("Error in validateUser:", error);
      throw error;
    }
  }
  static async getUserById(id) {
    try {
      const storage2 = await getStorage();
      const user = await storage2.getUserById(id);
      if (!user) {
        return null;
      }
      const { password: _, ...userWithoutPassword } = user;
      let company = null;
      if (user.company_id) {
        try {
          company = await storage2.getCompanyById(user.company_id);
        } catch (error) {
          console.warn("Failed to fetch company details for user:", error);
        }
      }
      return {
        ...userWithoutPassword,
        company
      };
    } catch (error) {
      console.error("Error in getUserById:", error);
      throw error;
    }
  }
  static async createUser(userData) {
    const storage2 = await getStorage();
    return await storage2.createUser({
      ...userData,
      password: await this.hashPassword(userData.password)
    });
  }
};

// src/types/error.ts
var ApiError = class extends Error {
  constructor(statusCode, message, details = null, code = "INTERNAL_SERVER_ERROR") {
    super(message);
    this.statusCode = statusCode;
    this.message = message;
    this.details = details;
    this.code = code;
    this.name = "ApiError";
  }
};

// src/services/jwt.service.ts
import jwt from "jsonwebtoken";
var JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";
var JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "24h";
var JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || "7d";
var JWTService = class {
  /**
  * Generate access token
  */
  static generateAccessToken(user) {
    const payload = {
      id: user.id,
      username: user.username,
      role: user.role,
      company_id: user.company_id,
      type: "access"
    };
    return jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
      issuer: "care-data-manager",
      audience: "care-data-manager-app"
    });
  }
  /**
   * Generate refresh token
   */
  static generateRefreshToken(user) {
    const payload = {
      id: user.id,
      username: user.username,
      role: user.role,
      company_id: user.company_id,
      type: "refresh"
    };
    return jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_REFRESH_EXPIRES_IN,
      issuer: "care-data-manager",
      audience: "care-data-manager-app"
    });
  }
  /**
   * Generate both access and refresh tokens
   */
  static generateTokens(user) {
    return {
      accessToken: this.generateAccessToken(user),
      refreshToken: this.generateRefreshToken(user)
    };
  }
  /**
   * Verify and decode a JWT token
   */
  static verifyToken(token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET, {
        issuer: "care-data-manager",
        audience: "care-data-manager-app"
      });
      return decoded;
    } catch (error) {
      console.error("JWT verification failed:", error);
      return null;
    }
  }
  /**
   * Extract token from request headers or query parameters
   */
  static extractTokenFromRequest(req) {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      if (authHeader.startsWith("Bearer ")) {
        return authHeader.substring(7);
      }
      return authHeader;
    }
    const tokenFromQuery = req.query.token;
    if (tokenFromQuery) {
      return tokenFromQuery;
    }
    return null;
  }
  /**
   * Decode token without verification (for expired token handling)
   */
  static decodeToken(token) {
    try {
      const decoded = jwt.decode(token);
      return decoded;
    } catch (error) {
      console.error("JWT decode failed:", error);
      return null;
    }
  }
  /**
   * Check if token is expired
   */
  static isTokenExpired(token) {
    const decoded = this.decodeToken(token);
    if (!decoded || !decoded.exp) {
      return true;
    }
    return Date.now() >= decoded.exp * 1e3;
  }
  /**
   * Refresh access token using refresh token
   */
  static refreshAccessToken(refreshToken) {
    const decoded = this.verifyToken(refreshToken);
    if (!decoded || decoded.type !== "refresh") {
      return null;
    }
    const user = {
      id: decoded.id,
      username: decoded.username,
      role: decoded.role,
      company_id: decoded.company_id
    };
    return {
      accessToken: this.generateAccessToken(user)
    };
  }
};

// src/controllers/auth.controller.ts
function getClientIP(req) {
  return req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || req.connection.remoteAddress || req.socket.remoteAddress || "127.0.0.1";
}
var AuthController = class {
  /**
   * Login endpoint - validates credentials and returns JWT tokens
   */
  async login(req, res, next) {
    const clientIP = getClientIP(req);
    const userAgent = req.headers["user-agent"] || "Unknown";
    let username;
    try {
      const dbStorage = await getStorage();
      const { username: reqUsername, password } = req.body;
      username = reqUsername;
      if (!username || !password) {
        await dbStorage.logLogin({
          username,
          loginType: "LOGIN_FAILED",
          failureReason: "Missing credentials",
          ipAddress: clientIP,
          userAgent,
          timestamp: /* @__PURE__ */ new Date()
        });
        throw new ApiError(400, "Missing credentials", null, "MISSING_CREDENTIALS");
      }
      const user = await AuthService.validateUser(username, password);
      if (!user) {
        await dbStorage.logLogin({
          username,
          loginType: "LOGIN_FAILED",
          failureReason: "Invalid credentials",
          ipAddress: clientIP,
          userAgent,
          timestamp: /* @__PURE__ */ new Date()
        });
        throw new ApiError(401, "Invalid credentials", null, "INVALID_CREDENTIALS");
      }
      const tokens = JWTService.generateTokens({
        id: user.id,
        username: user.username,
        role: user.role,
        company_id: user.company_id
      });
      await dbStorage.logLogin({
        username: user.username,
        userId: user.id,
        loginType: "LOGIN_SUCCESS",
        ipAddress: clientIP,
        userAgent,
        companyId: user.company_id,
        timestamp: /* @__PURE__ */ new Date()
      });
      return res.json({
        success: true,
        user,
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken
        }
      });
    } catch (error) {
      console.error("Login error:", error);
      if (username && error instanceof ApiError && error.statusCode !== 400) {
        try {
          const dbStorage = await getStorage();
          await dbStorage.logLogin({
            username,
            loginType: "LOGIN_FAILED",
            failureReason: error.message || "Authentication error",
            ipAddress: clientIP,
            userAgent,
            timestamp: /* @__PURE__ */ new Date()
          });
        } catch (logError) {
          console.error("Failed to log login error:", logError);
        }
      }
      next(error);
    }
  }
  /**
   * Logout endpoint - for JWT, this is primarily client-side token removal
   * Server can optionally maintain a blacklist of revoked tokens
   */
  async logout(req, res, next) {
    const clientIP = getClientIP(req);
    const userAgent = req.headers["user-agent"] || "Unknown";
    try {
      const dbStorage = await getStorage();
      if (!req.user) {
        throw new ApiError(401, "Not authenticated", null, "NOT_AUTHENTICATED");
      }
      await dbStorage.logLogin({
        username: req.user.username,
        userId: req.user.id,
        loginType: "LOGOUT",
        ipAddress: clientIP,
        userAgent,
        companyId: req.user.company_id,
        timestamp: /* @__PURE__ */ new Date()
      });
      console.log(`User ${req.user.username} logged out`);
      res.status(200).json({
        success: true,
        message: "Logged out successfully"
      });
    } catch (error) {
      console.error("Logout error:", error);
      next(error);
    }
  }
  /**
   * Validate token endpoint - verifies current JWT token validity
   */
  async validateToken(req, res, next) {
    try {
      if (!req.user) {
        throw new ApiError(401, "Token invalid", null, "TOKEN_INVALID");
      }
      const user = await AuthService.getUserById(req.user.id);
      if (!user) {
        throw new ApiError(401, "User not found", null, "USER_NOT_FOUND");
      }
      res.json({
        valid: true,
        user
      });
    } catch (error) {
      next(error);
    }
  }
  /**
   * Refresh token endpoint - generates new access token using refresh token
   */
  async refreshToken(req, res, next) {
    const clientIP = getClientIP(req);
    const userAgent = req.headers["user-agent"] || "Unknown";
    try {
      const dbStorage = await getStorage();
      const { refreshToken } = req.body;
      if (!refreshToken) {
        throw new ApiError(400, "Refresh token required", null, "REFRESH_TOKEN_REQUIRED");
      }
      const result = JWTService.refreshAccessToken(refreshToken);
      if (!result) {
        await dbStorage.logLogin({
          loginType: "TOKEN_REFRESH",
          failureReason: "Invalid refresh token",
          ipAddress: clientIP,
          userAgent,
          timestamp: /* @__PURE__ */ new Date()
        });
        throw new ApiError(401, "Invalid refresh token", null, "INVALID_REFRESH_TOKEN");
      }
      let userId;
      let username;
      let companyId;
      try {
        const decoded = JWTService.verifyToken(result.accessToken);
        if (decoded) {
          userId = decoded.id;
          username = decoded.username;
          companyId = decoded.company_id;
        }
      } catch (decodeError) {
        console.warn("Could not decode new access token for logging:", decodeError);
      }
      await dbStorage.logLogin({
        username,
        userId,
        loginType: "TOKEN_REFRESH",
        ipAddress: clientIP,
        userAgent,
        companyId,
        timestamp: /* @__PURE__ */ new Date()
      });
      res.json({
        success: true,
        accessToken: result.accessToken
      });
    } catch (error) {
      console.error("Token refresh error:", error);
      next(error);
    }
  }
  // Keep validateSession for backward compatibility, but redirect to validateToken
  async validateSession(req, res, next) {
    return this.validateToken(req, res, next);
  }
};

// routes.ts
import { createServer } from "http";

// ../shared/schema.ts
import { z } from "zod";
var insertUserSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  name: z.string().min(1, "Name is required"),
  role: z.enum(["admin", "user"]).default("user"),
  company_id: z.number().optional()
});
var insertPersonInfoSchema = z.object({
  title: z.string().min(1, "Title is required"),
  firstName: z.string().min(1, "First name is required"),
  middleName: z.string().optional().default(""),
  lastName: z.string().min(1, "Last name is required"),
  dateOfBirth: z.string().regex(/^\d{2}-\d{2}-\d{4}$/, "Date must be in DD-MM-YYYY format").refine((date) => {
    const [day, month, year] = date.split("-").map(Number);
    const parsedDate = new Date(year, month - 1, day);
    return !isNaN(parsedDate.getTime()) && parsedDate.getDate() === day && parsedDate.getMonth() === month - 1 && parsedDate.getFullYear() === year;
  }, "Invalid date format"),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  homePhone: z.string().optional().or(z.literal("")),
  mobilePhone: z.string().optional().or(z.literal("")),
  addressLine1: z.string().min(1, "Address Line 1 is required"),
  addressLine2: z.string().optional().or(z.literal("")),
  addressLine3: z.string().optional().or(z.literal("")),
  postCode: z.string().optional().or(z.literal("")),
  mailingAddressLine1: z.string().optional().or(z.literal("")),
  mailingAddressLine2: z.string().optional().or(z.literal("")),
  mailingAddressLine3: z.string().optional().or(z.literal("")),
  mailingPostCode: z.string().optional().or(z.literal("")),
  useHomeAddress: z.boolean().optional(),
  nextOfKinName: z.string().optional().or(z.literal("")),
  nextOfKinRelationship: z.string().optional().or(z.literal("")),
  nextOfKinAddress: z.string().optional().or(z.literal("")),
  nextOfKinEmail: z.string().email().optional().or(z.literal("")),
  nextOfKinPhone: z.string().optional().or(z.literal("")),
  hcpLevel: z.string().min(1, "HCP Level is required"),
  hcpStartDate: z.string().min(1, "HCP Start Date is required"),
  status: z.string().optional(),
  segmentId: z.number().nullable().optional()
});
var insertDocumentSchema = z.object({
  clientId: z.number({
    required_error: "Client ID is required"
  }),
  documentName: z.string({
    required_error: "Document name is required"
  }).min(1, "Document name is required"),
  documentType: z.string({
    required_error: "Document type is required"
  }).min(1, "Document type is required"),
  filePath: z.string().optional(),
  segmentId: z.number().optional().nullable()
});
var insertClientServiceSchema = z.object({
  clientId: z.number({
    required_error: "Client ID is required"
  }),
  serviceCategory: z.string({
    required_error: "Service Category is required"
  }),
  serviceType: z.string({
    required_error: "Service Type is required"
  }),
  serviceProvider: z.string({
    required_error: "Service Provider is required"
  }),
  serviceStartDate: z.string({
    required_error: "Start date is required"
  }),
  serviceDays: z.array(z.string()).min(1, "At least one service day is required"),
  serviceHours: z.number().refine((val) => val >= 0.5 && val <= 24, {
    message: "Service hours must be between 0.5 and 24"
  }),
  status: z.string().optional(),
  createdBy: z.number().optional(),
  createdAt: z.date().optional(),
  segmentId: z.number().optional().nullable()
});
var insertServiceCaseNoteSchema = z.object({
  serviceId: z.number(),
  noteText: z.string(),
  createdBy: z.number(),
  documentIds: z.array(z.number()).optional()
  // Optional array of document IDs to attach
});
var insertMasterDataSchema = z.object({
  serviceCategory: z.string({ required_error: "Please select a service category" }),
  serviceType: z.string({ required_error: "Please select a service type" }),
  serviceProvider: z.string({ required_error: "Please select or enter a service provider" }),
  active: z.boolean().default(true),
  createdBy: z.number().optional(),
  segmentId: z.number().nullable().optional()
});
var insertCompanySchema = z.object({
  company_name: z.string().min(1, "Company name is required"),
  registered_address: z.string().min(1, "Registered address is required"),
  postal_address: z.string().min(1, "Postal address is required"),
  contact_person_name: z.string().min(1, "Contact person name is required"),
  contact_person_phone: z.string().min(1, "Contact person phone is required").regex(/^\d{10}$/, "Phone number must be exactly 10 digits without any symbols"),
  contact_person_email: z.string().email("Invalid email address"),
  created_by: z.number().optional()
});
var insertSegmentSchema = z.object({
  segment_name: z.string().min(1, "Segment name is required"),
  company_id: z.number({ required_error: "Company ID is required" }),
  created_by: z.number().optional()
});

// routes.ts
import { z as z2 } from "zod";
import { fromZodError } from "zod-validation-error";
import multer from "multer";
import path3 from "path";
import fs3 from "fs";

// services/storage.service.ts
import fs2 from "fs/promises";
import path2 from "path";
import { BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions } from "@azure/storage-blob";
import { DefaultAzureCredential as DefaultAzureCredential2 } from "@azure/identity";
var LocalStorageService = class {
  uploadsDir;
  constructor() {
    this.uploadsDir = process.env.DOCUMENTS_ROOT_PATH || path2.join(process.cwd(), "uploads");
    fs2.mkdir(this.uploadsDir, { recursive: true }).catch(console.error);
  }
  async uploadFile(fileBuffer, filePath, contentType) {
    const fullPath = path2.join(this.uploadsDir, filePath);
    await fs2.mkdir(path2.dirname(fullPath), { recursive: true });
    await fs2.writeFile(fullPath, fileBuffer);
    return filePath;
  }
  async downloadFile(filePath) {
    const fullPath = path2.join(this.uploadsDir, filePath);
    return fs2.readFile(fullPath);
  }
  async deleteFile(filePath) {
    const fullPath = path2.join(this.uploadsDir, filePath);
    await fs2.unlink(fullPath);
  }
  async fileExists(filePath) {
    const fullPath = path2.join(this.uploadsDir, filePath);
    try {
      await fs2.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }
};
var AzureBlobStorageService = class {
  containerClient;
  blobServiceClient;
  accountName;
  accountKey;
  containerName;
  usingManagedIdentity = false;
  fallbackToConnection = false;
  initializationFailed = false;
  constructor() {
    const storageAccountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    this.containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || "documentsroot";
    if (storageAccountName) {
      console.log("Initializing Azure Blob Storage with DefaultAzureCredential (managed identity)");
      this.accountName = storageAccountName;
      this.usingManagedIdentity = true;
      const credential = new DefaultAzureCredential2();
      this.blobServiceClient = new BlobServiceClient(
        `https://${storageAccountName}.blob.core.windows.net`,
        credential
      );
      this.containerClient = this.blobServiceClient.getContainerClient(this.containerName);
      this.initializeContainerWithFallback(connectionString).catch((error) => {
        console.error("\u26A0\uFE0F Blob storage initialization failed completely:", error);
        this.initializationFailed = true;
      });
    } else if (connectionString) {
      console.log("Initializing Azure Blob Storage with connection string authentication");
      this.accountName = this.extractAccountName(connectionString);
      this.accountKey = this.extractAccountKey(connectionString);
      this.blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
      this.containerClient = this.blobServiceClient.getContainerClient(this.containerName);
      this.initializeContainer().catch((error) => {
        console.error("\u26A0\uFE0F Blob storage initialization failed:", error);
        this.initializationFailed = true;
      });
    } else {
      throw new Error("Either AZURE_STORAGE_ACCOUNT_NAME or AZURE_STORAGE_CONNECTION_STRING must be provided");
    }
  }
  extractAccountName(connectionString) {
    const matches = connectionString.match(/AccountName=([^;]+)/i);
    if (!matches || matches.length < 2) {
      throw new Error("Account name not found in connection string");
    }
    return matches[1];
  }
  extractAccountKey(connectionString) {
    const matches = connectionString.match(/AccountKey=([^;]+)/i);
    if (!matches || matches.length < 2) {
      throw new Error("Account key not found in connection string");
    }
    return matches[1];
  }
  async initializeContainer() {
    try {
      await this.containerClient.createIfNotExists();
      console.log(`Container ${this.containerName} initialized`);
    } catch (error) {
      console.error("Error initializing blob container:", error);
      throw error;
    }
  }
  async initializeContainerWithFallback(connectionString) {
    try {
      console.log(`Attempting to initialize container ${this.containerName} with managed identity...`);
      await this.containerClient.createIfNotExists();
      console.log(`\u2705 Container ${this.containerName} initialized successfully with managed identity`);
    } catch (error) {
      console.error("Error initializing blob container:", error);
      console.log(`DefaultAzureCredential failed, falling back to connection string: ${error instanceof Error ? error.message : "Unknown error"}`);
      if (connectionString) {
        try {
          console.log("Using connection string authentication for Azure Blob Storage");
          this.accountName = this.extractAccountName(connectionString);
          this.accountKey = this.extractAccountKey(connectionString);
          this.blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
          this.containerClient = this.blobServiceClient.getContainerClient(this.containerName);
          this.usingManagedIdentity = false;
          this.fallbackToConnection = true;
          await this.containerClient.createIfNotExists();
          console.log(`\u2705 Container ${this.containerName} initialized successfully with connection string`);
        } catch (connectionError) {
          console.error("Error initializing blob storage service with connection string:", connectionError);
          const rejectionError = new Error(
            `Failed to initialize Azure Blob Storage. Both managed identity and connection string authentication failed. Managed Identity Error: ${error instanceof Error ? error.message : "Unknown"}. Connection String Error: ${connectionError instanceof Error ? connectionError.message : "Unknown"}`
          );
          console.log("\u{1F6A8} UNHANDLED PROMISE REJECTION:", rejectionError.message, rejectionError);
          this.initializationFailed = true;
          throw rejectionError;
        }
      } else {
        const noFallbackError = new Error(
          `Failed to initialize Azure Blob Storage with managed identity and no connection string fallback available. Error: ${error instanceof Error ? error.message : "Unknown"}`
        );
        console.log("\u{1F6A8} UNHANDLED PROMISE REJECTION:", noFallbackError.message, noFallbackError);
        this.initializationFailed = true;
        throw noFallbackError;
      }
    }
  }
  async uploadFile(fileBuffer, blobName, contentType) {
    if (this.initializationFailed) {
      throw new Error("Azure Blob Storage service is not available due to initialization failure");
    }
    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.upload(fileBuffer, fileBuffer.length, {
        blobHTTPHeaders: {
          blobContentType: contentType
        }
      });
      return this.generateSasUrl(blobName);
    } catch (error) {
      console.error("Error uploading to blob storage:", error);
      throw error;
    }
  }
  async downloadFile(blobName) {
    if (this.initializationFailed) {
      throw new Error("Azure Blob Storage service is not available due to initialization failure");
    }
    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
      const downloadResponse = await blockBlobClient.download(0);
      const chunks = [];
      for await (const chunk of downloadResponse.readableStreamBody) {
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    } catch (error) {
      console.error("Error downloading from blob storage:", error);
      throw error;
    }
  }
  async deleteFile(blobName) {
    if (this.initializationFailed) {
      throw new Error("Azure Blob Storage service is not available due to initialization failure");
    }
    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.delete();
    } catch (error) {
      console.error("Error deleting from blob storage:", error);
      throw error;
    }
  }
  async fileExists(blobName) {
    if (this.initializationFailed) {
      console.warn("Azure Blob Storage service is not available due to initialization failure - returning false for fileExists");
      return false;
    }
    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
      return await blockBlobClient.exists();
    } catch (error) {
      console.error("Error checking file existence in blob storage:", error);
      throw error;
    }
  }
  generateSasUrl(blobName, expiryMinutes = 60) {
    if (this.usingManagedIdentity || !this.accountKey) {
      console.log("Using direct blob URL (managed identity - no SAS token generation)");
      return `https://${this.accountName}.blob.core.windows.net/${this.containerName}/${blobName}`;
    }
    const sharedKeyCredential = new StorageSharedKeyCredential(
      this.accountName,
      this.accountKey
    );
    const sasOptions = {
      containerName: this.containerName,
      blobName,
      permissions: BlobSASPermissions.parse("r"),
      startsOn: /* @__PURE__ */ new Date(),
      expiresOn: new Date((/* @__PURE__ */ new Date()).valueOf() + expiryMinutes * 60 * 1e3)
    };
    const sasToken = generateBlobSASQueryParameters(
      sasOptions,
      sharedKeyCredential
    ).toString();
    return `https://${this.accountName}.blob.core.windows.net/${this.containerName}/${blobName}?${sasToken}`;
  }
};
function createStorageService() {
  const isDevelopment = process.env.NODE_ENV === "development";
  if (isDevelopment) {
    console.log("Using local file storage for development");
    return new LocalStorageService();
  } else {
    console.log("Using Azure Blob storage for production");
    return new AzureBlobStorageService();
  }
}

// src/middleware/error.ts
import { ZodError } from "zod";
function errorHandler(err, req, res, next) {
  let statusCode = 500;
  let errorResponse = {
    success: false,
    error: {
      message: "Internal Server Error",
      code: "INTERNAL_SERVER_ERROR"
    }
  };
  let errorType = "UNKNOWN_ERROR";
  let errorCode;
  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    errorType = "API_ERROR";
    errorCode = err.code;
    errorResponse.error = {
      message: err.message,
      code: err.code,
      details: err.details
    };
  } else if (err instanceof ZodError) {
    statusCode = 400;
    errorType = "VALIDATION_ERROR";
    errorCode = "VALIDATION_ERROR";
    errorResponse.error = {
      message: "Validation Error",
      code: "VALIDATION_ERROR",
      details: err.errors
    };
  } else if (err instanceof Error) {
    errorType = err.name || "UNKNOWN_ERROR";
    errorResponse.error.message = err.message;
  }
  let severity = "ERROR";
  if (statusCode >= 500) {
    severity = "CRITICAL";
  } else if (statusCode >= 400) {
    severity = "WARNING";
  }
  const clientIP = req.headers["x-forwarded-for"] || req.connection.remoteAddress || "unknown";
  console.error("Error:", {
    path: req.path,
    method: req.method,
    statusCode,
    errorType,
    error: err.message,
    stack: err.stack,
    user: req.user?.username,
    ip: clientIP
  });
  setImmediate(async () => {
    try {
      const storage2 = await getStorage();
      await storage2.logError({
        errorType,
        errorCode,
        errorMessage: err.message,
        stackTrace: err.stack,
        userId: req.user?.id,
        username: req.user?.username,
        method: req.method,
        endpoint: req.path,
        ipAddress: clientIP,
        userAgent: req.headers["user-agent"],
        companyId: req.user?.company_id,
        requestData: {
          query: req.query,
          params: req.params,
          body: req.body
        },
        requestHeaders: req.headers,
        severity,
        metadata: {
          statusCode,
          timestamp: /* @__PURE__ */ new Date(),
          referer: req.headers.referer,
          origin: req.headers.origin
        },
        timestamp: /* @__PURE__ */ new Date()
      });
    } catch (logError) {
      console.error("Failed to log error to database:", logError);
    }
  });
  res.status(statusCode).json(errorResponse);
}

// src/middleware/auth.ts
var authMiddleware = (req, res, next) => {
  try {
    const token = JWTService.extractTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({
        message: "Unauthorized: No token provided",
        code: "NO_TOKEN"
      });
    }
    const decoded = JWTService.verifyToken(token);
    if (!decoded) {
      return res.status(401).json({
        message: "Unauthorized: Invalid token",
        code: "INVALID_TOKEN"
      });
    }
    if (decoded.type !== "access") {
      return res.status(401).json({
        message: "Unauthorized: Invalid token type",
        code: "INVALID_TOKEN_TYPE"
      });
    }
    req.user = {
      id: decoded.id,
      username: decoded.username,
      role: decoded.role,
      company_id: decoded.company_id
    };
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(401).json({
      message: "Unauthorized: Token verification failed",
      code: "TOKEN_VERIFICATION_FAILED"
    });
  }
};
var validateSegmentAccess = async (req, res, next) => {
  try {
    if (req.user?.role === "admin" && !req.user.company_id) {
      return next();
    }
    if (!req.user?.company_id) {
      return res.status(403).json({
        message: "Access denied: User must be assigned to a company"
      });
    }
    let segmentId;
    if (req.query.segmentId) {
      segmentId = parseInt(req.query.segmentId);
    } else if (req.body.segmentId) {
      segmentId = parseInt(req.body.segmentId);
    } else if (req.params.segmentId) {
      segmentId = parseInt(req.params.segmentId);
    }
    if (!segmentId || isNaN(segmentId)) {
      return next();
    }
    const dbStorage = await getStorage();
    const segment = await dbStorage.getSegmentById(segmentId);
    if (!segment) {
      return res.status(404).json({ message: "Segment not found" });
    }
    if (segment.company_id !== req.user.company_id) {
      return res.status(403).json({
        message: "Access denied: Segment does not belong to your company"
      });
    }
    next();
  } catch (error) {
    console.error("Error in validateSegmentAccess middleware:", error);
    return res.status(500).json({ message: "Internal server error during segment validation" });
  }
};
var companyDataFilter = async (req, res, next) => {
  try {
    if (req.user?.role === "admin" && !req.user.company_id) {
      return next();
    }
    if (!req.user?.company_id) {
      return res.status(403).json({
        message: "Access denied: User must be assigned to a company"
      });
    }
    const dbStorage = await getStorage();
    const userSegments = await dbStorage.getAllSegmentsByCompany(req.user.company_id);
    const validSegmentIds = userSegments.map((segment) => segment.id);
    req.userCompanySegments = validSegmentIds;
    req.userCompanyId = req.user.company_id;
    next();
  } catch (error) {
    console.error("Error in companyDataFilter middleware:", error);
    return res.status(500).json({ message: "Internal server error during company data filtering" });
  }
};

// src/middleware/security.ts
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { body, param, query, validationResult } from "express-validator";
import DOMPurify from "isomorphic-dompurify";
var createRateLimit = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message: message || "Too many requests from this IP, please try again later",
    standardHeaders: true,
    legacyHeaders: false,
    // Use a more sophisticated key generator that includes user info when available
    keyGenerator: (req) => {
      const userId = req.user?.id;
      const ip = req.ip || req.connection.remoteAddress || "unknown";
      return userId ? `${ip}:${userId}` : ip;
    },
    // Skip rate limiting for certain conditions
    skip: (req) => {
      return req.path === "/health" || req.path === "/api/health";
    }
  });
};
var authRateLimit = createRateLimit(
  15 * 60 * 1e3,
  // 15 minutes
  5,
  // 5 attempts per window
  "Too many authentication attempts, please try again in 15 minutes"
);
var apiRateLimit = createRateLimit(
  15 * 60 * 1e3,
  // 15 minutes
  200,
  // 200 requests per window for general API
  "API rate limit exceeded, please try again later"
);
var uploadRateLimit = createRateLimit(
  60 * 60 * 1e3,
  // 1 hour
  50,
  // 50 uploads per hour for both production and development
  "Upload rate limit exceeded, please try again in an hour"
);
var strictRateLimit = createRateLimit(
  15 * 60 * 1e3,
  // 15 minutes
  50,
  // Lower limit for sensitive operations
  "Sensitive operation rate limit exceeded"
);
var securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: []
    }
  },
  hsts: {
    maxAge: 31536e3,
    // 1 year
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  xssFilter: true,
  frameguard: { action: "deny" },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" }
});
var sanitizeInput = (req, res, next) => {
  const sanitizeValue = (value) => {
    if (typeof value === "string") {
      const sanitized = DOMPurify.sanitize(value, {
        ALLOWED_TAGS: [],
        ALLOWED_ATTR: []
      });
      return sanitized.replace(/['";\\]/g, "").trim();
    } else if (Array.isArray(value)) {
      return value.map(sanitizeValue);
    } else if (typeof value === "object" && value !== null) {
      const sanitizedObj = {};
      Object.keys(value).forEach((key) => {
        sanitizedObj[key] = sanitizeValue(value[key]);
      });
      return sanitizedObj;
    }
    return value;
  };
  if (req.body) {
    req.body = sanitizeValue(req.body);
  }
  if (req.query) {
    req.query = sanitizeValue(req.query);
  }
  if (req.params) {
    req.params = sanitizeValue(req.params);
  }
  next();
};
var requestSizeLimit = (req, res, next) => {
  const maxSize = 10 * 1024 * 1024;
  const contentLength = req.get("Content-Length");
  if (contentLength && parseInt(contentLength) > maxSize) {
    return res.status(413).json({
      success: false,
      error: {
        message: "Request entity too large",
        code: "REQUEST_TOO_LARGE",
        maxSize: `${maxSize / (1024 * 1024)}MB`
      }
    });
  }
  next();
};
var validateRequest = (validations) => {
  return async (req, res, next) => {
    await Promise.all(validations.map((validation) => validation.run(req)));
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          message: "Validation failed",
          code: "VALIDATION_ERROR",
          details: errors.array()
        }
      });
    }
    next();
  };
};
var idValidation = [
  param("id").custom((value) => {
    console.log(`[DEBUG] idValidation received value: "${value}", type: ${typeof value}`);
    const id = parseInt(value, 10);
    console.log(`[DEBUG] idValidation parsed value: ${id}, isNaN: ${isNaN(id)}`);
    if (isNaN(id) || id <= 0) {
      throw new Error("ID must be a positive integer");
    }
    return true;
  })
];
var companyIdValidation = [
  param("companyId").custom((value) => {
    const id = parseInt(value, 10);
    if (isNaN(id) || id <= 0) {
      throw new Error("Company ID must be a positive integer");
    }
    return true;
  })
];
var clientIdValidation = [
  param("clientId").custom((value) => {
    const id = parseInt(value, 10);
    if (isNaN(id) || id <= 0) {
      throw new Error("Client ID must be a positive integer");
    }
    return true;
  })
];
var serviceIdValidation = [
  param("serviceId").custom((value) => {
    const id = parseInt(value, 10);
    if (isNaN(id) || id <= 0) {
      throw new Error("Service ID must be a positive integer");
    }
    return true;
  })
];
var paginationValidation = [
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be a positive integer"),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be between 1 and 100")
];
var segmentValidation = [
  body("segmentId").optional().isInt({ min: 1 }).withMessage("Segment ID must be a positive integer"),
  query("segmentId").optional().isInt({ min: 1 }).withMessage("Segment ID must be a positive integer")
];
var auditLog = (req, res, next) => {
  const startTime = Date.now();
  const userId = req.user?.id || "anonymous";
  const ip = req.ip || req.connection.remoteAddress || "unknown";
  const userAgent = req.get("User-Agent") || "unknown";
  console.log(`[AUDIT] ${(/* @__PURE__ */ new Date()).toISOString()} - ${req.method} ${req.path} - User: ${userId} - IP: ${ip}`);
  const originalSend = res.send;
  res.send = function(body2) {
    const duration = Date.now() - startTime;
    console.log(`[AUDIT] ${(/* @__PURE__ */ new Date()).toISOString()} - ${req.method} ${req.path} - Status: ${res.statusCode} - Duration: ${duration}ms - User: ${userId} - IP: ${ip}`);
    if (req.method !== "GET" && (req.path.includes("/api/users") || req.path.includes("/api/auth"))) {
      console.log(`[AUDIT-SENSITIVE] ${(/* @__PURE__ */ new Date()).toISOString()} - ${req.method} ${req.path} - User: ${userId} - IP: ${ip} - UserAgent: ${userAgent}`);
    }
    return originalSend.call(this, body2);
  };
  next();
};
var preventSQLInjection = (req, res, next) => {
  const sqlInjectionPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|SCRIPT)\b)/i,
    /(--|\;|\||\/\*|\*\/)/,
    /(script|javascript|vbscript|onload|onerror|onclick)/i
  ];
  const checkForSQLInjection = (value, path5 = "") => {
    if (typeof value === "string") {
      return sqlInjectionPatterns.some((pattern) => pattern.test(value));
    } else if (Array.isArray(value)) {
      return value.some((item, index) => checkForSQLInjection(item, `${path5}[${index}]`));
    } else if (typeof value === "object" && value !== null) {
      return Object.keys(value).some(
        (key) => checkForSQLInjection(value[key], `${path5}.${key}`)
      );
    }
    return false;
  };
  if (req.body && checkForSQLInjection(req.body)) {
    return res.status(400).json({
      success: false,
      error: {
        message: "Invalid input detected",
        code: "INVALID_INPUT"
      }
    });
  }
  if (req.query && checkForSQLInjection(req.query)) {
    return res.status(400).json({
      success: false,
      error: {
        message: "Invalid query parameters detected",
        code: "INVALID_QUERY"
      }
    });
  }
  next();
};
var secureFileUpload = (req, res, next) => {
  if (!req.file && !req.files) {
    return next();
  }
  const allowedMimeTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/jpeg",
    "image/jpg",
    "image/png"
  ];
  const file = req.file || (Array.isArray(req.files) ? req.files[0] : Object.values(req.files || {})[0]);
  if (file && !Array.isArray(file)) {
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return res.status(400).json({
        success: false,
        error: {
          message: "Invalid file type",
          code: "INVALID_FILE_TYPE",
          allowedTypes: allowedMimeTypes
        }
      });
    }
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return res.status(400).json({
        success: false,
        error: {
          message: "File too large",
          code: "FILE_TOO_LARGE",
          maxSize: `${maxSize / (1024 * 1024)}MB`
        }
      });
    }
    if (file.originalname) {
      file.originalname = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "");
    }
  }
  next();
};
var configureCORS = (corsOrigins) => {
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (!origin || corsOrigins.includes(origin)) {
      res.header("Access-Control-Allow-Origin", origin || "*");
      res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
      res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-API-Key");
      res.header("Access-Control-Allow-Credentials", "true");
      res.header("Access-Control-Max-Age", "86400");
    }
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
    } else {
      next();
    }
  };
};
var apiVersioning = (req, res, next) => {
  const version = req.headers["api-version"] || req.query.version || "v1";
  req.apiVersion = version;
  res.setHeader("API-Version", String(version));
  next();
};

// routes.ts
var isAuthenticated = (req) => {
  return "user" in req && req.user !== void 0;
};
var createHandler = (handler) => {
  return async (req, res, next) => {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      await handler(req, res);
    } catch (error) {
      next(error);
    }
  };
};
async function initializeUsers(dbStorage) {
  console.log("Checking admin user initialization settings");
  const autoCreateAdmin = process.env.AUTO_CREATE_ADMIN === "true";
  if (!autoCreateAdmin) {
    console.log("Automatic admin creation is disabled (recommended for production)");
    console.log("To create an admin user, run: node create-admin.js");
    return;
  }
  console.log("\u26A0\uFE0F  WARNING: Automatic admin creation is enabled");
  console.log("   This should be disabled in production environments");
  const admin = await dbStorage.getUserByUsername("admin");
  if (!admin) {
    const initialPassword = process.env.INITIAL_ADMIN_PASSWORD;
    if (!initialPassword) {
      console.log("\u274C Error: INITIAL_ADMIN_PASSWORD not set in environment");
      console.log("   For security, admin password must be provided via environment variable");
      console.log("   Or use the create-admin.js script for interactive setup");
      return;
    }
    if (initialPassword === "password" || initialPassword.length < 8) {
      console.log("\u274C Error: Weak admin password detected");
      console.log("   Please set a strong password in INITIAL_ADMIN_PASSWORD");
      console.log("   Or use the create-admin.js script for guided setup");
      return;
    }
    await AuthService.createUser({
      name: "Initial Admin",
      username: process.env.INITIAL_ADMIN_USERNAME || "admin",
      password: initialPassword,
      role: "admin"
    });
    if (process.env.FORCE_PASSWORD_CHANGE_ON_FIRST_LOGIN === "true") {
      await dbStorage.updateUserForcePasswordChange(
        process.env.INITIAL_ADMIN_USERNAME || "admin",
        true
      );
      console.log("   \u26A0\uFE0F  Admin will be required to change password on first login");
    }
    console.log("\u2705 Initial admin user created");
    console.log("   Username:", process.env.INITIAL_ADMIN_USERNAME || "admin");
    console.log("   \u26A0\uFE0F  Remember to change the password after first login");
    console.log("   \u26A0\uFE0F  Set AUTO_CREATE_ADMIN=false after initial setup");
  }
}
var storageService = null;
function initializeStorageService() {
  try {
    console.log("Initializing storage service...");
    storageService = createStorageService();
    console.log("Storage service initialized successfully");
  } catch (error) {
    console.error("Error initializing storage service:", error);
    console.log("Storage service initialization failed - operations will fail gracefully");
    storageService = null;
  }
}
initializeStorageService();
var uploadsDir = process.env.DOCUMENTS_ROOT_PATH || path3.join(process.cwd(), "uploads");
fs3.mkdirSync(uploadsDir, { recursive: true });
console.log(`Document uploads directory: ${uploadsDir}`);
var storage = multer.memoryStorage();
var upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024
    // 5MB limit
  },
  fileFilter: function(req, file, cb) {
    const allowedTypes = [".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png"];
    const ext = path3.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only PDF, DOC, DOCX, JPG, JPEG, and PNG files are allowed."));
    }
  }
});
var validateInput2 = (schema) => async (req, res, next) => {
  try {
    const validatedBody = await schema.parseAsync(req.body);
    req.body = validatedBody;
    next();
  } catch (error) {
    if (error instanceof z2.ZodError) {
      const validationError = fromZodError(error);
      return res.status(400).json({
        message: validationError.message,
        details: validationError.details
      });
    }
    next(error);
  }
};
var rateLimit2 = {
  windowMs: 15 * 60 * 1e3,
  // 15 minutes
  max: 100
  // limit each IP to 100 requests per windowMs
};
async function registerRoutes(app2) {
  const dbStorage = await getStorage();
  app2.use(securityHeaders);
  app2.use(requestSizeLimit);
  app2.use(sanitizeInput);
  app2.use(preventSQLInjection);
  app2.use(apiVersioning);
  app2.use(auditLog);
  app2.use("/api", apiRateLimit);
  const corsOrigins = (process.env.CORS_ORIGINS || "http://localhost:5173,http://localhost:5174,http://localhost:3000").split(",");
  app2.use(configureCORS(corsOrigins));
  await initializeUsers(dbStorage);
  const authController = new AuthController();
  app2.post("/api/auth/login", authController.login.bind(authController));
  app2.post("/api/auth/logout", authMiddleware, authController.logout.bind(authController));
  app2.get("/api/auth/status", authMiddleware, authController.validateToken.bind(authController));
  app2.post("/api/auth/refresh", authController.refreshToken.bind(authController));
  app2.get("/api/validate-session", authMiddleware, authController.validateSession.bind(authController));
  app2.get("/api/health", async (req, res) => {
    const startTime = Date.now();
    const healthData = {
      status: "healthy",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || "development",
      version: "1.0.0",
      database: {
        connected: false,
        latency: 0
      },
      memory: process.memoryUsage(),
      pid: process.pid,
      platform: process.platform,
      nodeVersion: process.version
    };
    try {
      const dbStartTime = Date.now();
      const pool = await getPool();
      const client = await pool.connect();
      const result = await client.query("SELECT 1 as test");
      client.release();
      healthData.database.connected = true;
      healthData.database.latency = Date.now() - dbStartTime;
      healthData.database.status = "connected";
    } catch (error) {
      healthData.status = "unhealthy";
      healthData.database.connected = false;
      healthData.database.status = "disconnected";
      healthData.database.error = error instanceof Error ? error.message : "Unknown database error";
    }
    healthData.responseTime = Date.now() - startTime;
    const httpStatus = healthData.status === "healthy" ? 200 : 503;
    return res.status(httpStatus).json(healthData);
  });
  app2.use(["/api/auth/login", "/api/auth/logout"], authRateLimit);
  app2.use(["/api/change-password"], authRateLimit);
  app2.use(["/api/documents", "/api/client-assignment"], uploadRateLimit, secureFileUpload);
  app2.use(["/api/users", "/api/companies"], strictRateLimit);
  app2.use(["/api/person-info", "/api/master-data", "/api/client-services"], paginationValidation);
  app2.use(["/api/master-data", "/api/person-info", "/api/client-services", "/api/documents/client"], segmentValidation);
  app2.post("/api/person-info", validateInput2(insertPersonInfoSchema), authMiddleware);
  app2.post("/api/master-data", validateInput2(insertMasterDataSchema), authMiddleware);
  app2.post("/api/client-services", validateInput2(insertClientServiceSchema), authMiddleware);
  app2.post("/api/companies", validateInput2(insertCompanySchema), authMiddleware);
  app2.post("/api/master-data", apiRateLimit, sanitizeInput, preventSQLInjection, validateSegmentAccess, authMiddleware, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "No active session found" });
      }
      console.log("Received master data:", JSON.stringify(req.body));
      const requestData = { ...req.body };
      if (requestData.segmentId === null || requestData.segmentId === void 0) {
        delete requestData.segmentId;
      }
      const validatedData = insertMasterDataSchema.parse(requestData);
      const masterDataWithUser = {
        ...validatedData,
        createdBy: req.user.id,
        active: validatedData.active ?? true,
        segmentId: req.body.segmentId
        // Explicitly use the original segmentId from request body
      };
      console.log("Creating master data with:", JSON.stringify(masterDataWithUser));
      const createdData = await dbStorage.createMasterData(masterDataWithUser);
      console.log("Created master data:", JSON.stringify(createdData));
      const clientIP = req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || req.socket.remoteAddress || req.ip || "unknown";
      await dbStorage.logUserActivity({
        userId: req.user.id,
        username: req.user.username || "unknown",
        action: "CREATE_MASTER_DATA",
        resourceType: "MASTER_DATA",
        resourceId: createdData.id.toString(),
        details: `Created master data: ${createdData.serviceCategory} - ${createdData.serviceType} (${createdData.serviceProvider})`,
        ipAddress: clientIP,
        userAgent: req.headers["user-agent"] || "unknown",
        timestamp: /* @__PURE__ */ new Date()
      });
      return res.status(201).json(createdData);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        const validationError = fromZodError(error);
        console.error("Validation error:", validationError);
        return res.status(400).json({
          message: validationError.message,
          details: validationError.details
        });
      }
      console.error("Error creating master data:", error);
      if (error instanceof Error && error.message.includes("combination of category, type, and provider already exists")) {
        return res.status(409).json({ message: error.message });
      }
      return res.status(500).json({
        message: "Failed to create master data",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  app2.post("/api/service-case-notes", apiRateLimit, sanitizeInput, preventSQLInjection, authMiddleware, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "No active session found" });
      }
      console.log("Received service case note data:", JSON.stringify(req.body));
      const validatedData = insertServiceCaseNoteSchema.parse(req.body);
      const caseNoteWithUser = {
        ...validatedData,
        createdBy: req.user.id
      };
      console.log("Creating service case note with:", JSON.stringify(caseNoteWithUser));
      const createdCaseNote = await dbStorage.createServiceCaseNote(caseNoteWithUser);
      console.log("Created service case note:", JSON.stringify(createdCaseNote));
      const clientIP = req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || req.socket.remoteAddress || req.ip || "unknown";
      await dbStorage.logUserActivity({
        userId: req.user.id,
        username: req.user.username || "unknown",
        action: "CREATE_CASE_NOTE",
        resourceType: "CASE_NOTE",
        resourceId: createdCaseNote.id.toString(),
        details: `Created case note for service ID: ${createdCaseNote.serviceId}${validatedData.documentIds ? ` with ${validatedData.documentIds.length} document(s)` : ""}`,
        ipAddress: clientIP,
        userAgent: req.headers["user-agent"] || "unknown",
        timestamp: /* @__PURE__ */ new Date()
      });
      return res.status(201).json(createdCaseNote);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        const validationError = fromZodError(error);
        console.error("Validation error:", validationError);
        return res.status(400).json({
          message: validationError.message,
          details: validationError.details
        });
      }
      console.error("Error creating service case note:", error);
      return res.status(500).json({
        message: "Failed to create service case note",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  app2.get("/api/master-data", apiRateLimit, sanitizeInput, preventSQLInjection, authMiddleware, validateSegmentAccess, companyDataFilter, async (req, res) => {
    try {
      const segmentId = req.query.segmentId ? parseInt(req.query.segmentId) : void 0;
      console.log(`Fetching master data${segmentId !== void 0 ? ` for segmentId: ${segmentId}` : ""}`);
      const masterData = await dbStorage.getAllMasterData(segmentId);
      console.log("Fetched master data count:", masterData.length);
      return res.status(200).json(masterData);
    } catch (error) {
      console.error("Error fetching master data:", error);
      return res.status(500).json({ message: "Failed to fetch master data" });
    }
  });
  app2.put("/api/master-data/:id", apiRateLimit, validateRequest(idValidation), sanitizeInput, preventSQLInjection, authMiddleware, validateSegmentAccess, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid ID format" });
    }
    try {
      console.log("Updating master data for id:", id, "with data:", req.body);
      const existingData = await dbStorage.getMasterDataById(id);
      if (!existingData) {
        return res.status(404).json({ message: "Master data not found" });
      }
      const requestData = { ...req.body };
      if (requestData.segmentId === null || requestData.segmentId === void 0) {
        delete requestData.segmentId;
      }
      const validatedData = insertMasterDataSchema.parse(requestData);
      const updatedData = await dbStorage.updateMasterData(id, {
        ...validatedData,
        createdBy: req.user.id,
        segmentId: req.body.segmentId
        // Use original value which can be null
      });
      const clientIP = req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || req.socket.remoteAddress || req.ip || "unknown";
      await dbStorage.logUserActivity({
        userId: req.user.id,
        username: req.user.username || "unknown",
        action: "UPDATE_MASTER_DATA",
        resourceType: "MASTER_DATA",
        resourceId: id.toString(),
        details: `Updated master data: ${existingData.serviceCategory} - ${existingData.serviceType} (${existingData.serviceProvider})`,
        ipAddress: clientIP,
        userAgent: req.headers["user-agent"] || "unknown",
        timestamp: /* @__PURE__ */ new Date()
      });
      console.log("Updated master data:", updatedData);
      return res.status(200).json(updatedData);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({
          message: validationError.message,
          details: validationError.details
        });
      }
      if (error instanceof Error && error.message.includes("client_services_master_data_fkey")) {
        try {
          const existingData = await dbStorage.getMasterDataById(id);
          if (existingData) {
            const referencingServices = await dbStorage.getClientServicesReferencingMasterData(
              existingData.serviceCategory,
              existingData.serviceType,
              existingData.serviceProvider || "",
              existingData.segmentId || null
            );
            const clientNames = referencingServices.map((service) => service.clientName);
            const uniqueClientNames = Array.from(new Set(clientNames));
            return res.status(409).json({
              message: "Cannot update master data: Service is currently assigned to clients",
              details: `This service combination (${existingData.serviceCategory} - ${existingData.serviceType} - ${existingData.serviceProvider || "No provider"}) is currently assigned to ${referencingServices.length} service(s) for ${uniqueClientNames.length} client(s): ${uniqueClientNames.join(", ")}. Please remove or reassign these services before updating the master data.`,
              conflictType: "FOREIGN_KEY_CONSTRAINT",
              referencingServices: referencingServices.map((service) => ({
                clientName: service.clientName,
                status: service.status,
                serviceStartDate: service.serviceStartDate
              }))
            });
          }
        } catch (lookupError) {
          console.error("Error getting referencing services:", lookupError);
        }
      }
      console.error("Error updating master data:", error);
      return res.status(500).json({
        message: "Failed to update master data",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  app2.get("/api/master-data/verify", authMiddleware, async (req, res) => {
    try {
      const { category, type, provider, segmentId } = req.query;
      if (!category || !type || !provider) {
        return res.status(400).json({ message: "Missing required parameters: category, type, and provider are required" });
      }
      const exists = await dbStorage.checkMasterDataExists(
        category,
        type,
        provider,
        segmentId ? parseInt(segmentId) : void 0
      );
      if (!exists) {
        return res.status(404).json({
          message: "The selected service combination doesn't exist in the master data. Please use the Master Data page to create it first."
        });
      }
      return res.status(200).json({
        success: true,
        message: "Service combination exists in master data"
      });
    } catch (error) {
      console.error("Error verifying master data:", error);
      return res.status(500).json({ message: "Failed to verify master data" });
    }
  });
  app2.get("/api/master-data/:id", apiRateLimit, validateRequest(idValidation), sanitizeInput, preventSQLInjection, authMiddleware, validateSegmentAccess, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid ID format" });
      }
      console.log("Getting master data for id:", id);
      const masterData = await dbStorage.getMasterDataById(id);
      if (!masterData) {
        return res.status(404).json({ message: "Master data not found" });
      }
      console.log("Found master data:", masterData);
      return res.status(200).json(masterData);
    } catch (error) {
      console.error("Error fetching master data by ID:", error);
      return res.status(500).json({
        message: "Failed to fetch master data",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  app2.post("/api/person-info", apiRateLimit, sanitizeInput, preventSQLInjection, validateSegmentAccess, authMiddleware, async (req, res) => {
    try {
      console.log("Received person info data:", req.body);
      const validatedData = insertPersonInfoSchema.parse(req.body);
      console.log("Validated data:", validatedData);
      const personInfoWithUser = {
        ...validatedData,
        createdBy: req.user.id,
        middleName: validatedData.middleName || "",
        email: validatedData.email || "",
        homePhone: validatedData.homePhone || "",
        mobilePhone: validatedData.mobilePhone || "",
        addressLine2: validatedData.addressLine2 || "",
        addressLine3: validatedData.addressLine3 || "",
        postCode: validatedData.postCode || "",
        mailingAddressLine1: validatedData.mailingAddressLine1 || "",
        mailingAddressLine2: validatedData.mailingAddressLine2 || "",
        mailingAddressLine3: validatedData.mailingAddressLine3 || "",
        mailingPostCode: validatedData.mailingPostCode || "",
        nextOfKinName: validatedData.nextOfKinName || "",
        nextOfKinRelationship: validatedData.nextOfKinRelationship || "",
        nextOfKinAddress: validatedData.nextOfKinAddress || "",
        nextOfKinEmail: validatedData.nextOfKinEmail || "",
        nextOfKinPhone: validatedData.nextOfKinPhone || "",
        hcpLevel: validatedData.hcpLevel || "",
        useHomeAddress: validatedData.useHomeAddress ?? true,
        status: validatedData.status || "New",
        // Handle segmentId to ensure it's either number or undefined, not null
        segmentId: validatedData.segmentId !== null ? validatedData.segmentId : void 0
      };
      console.log("Processed data:", personInfoWithUser);
      const createdData = await dbStorage.createPersonInfo(personInfoWithUser);
      console.log("Created data:", createdData);
      const clientIP = req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || req.socket.remoteAddress || req.ip || "unknown";
      await dbStorage.logUserActivity({
        userId: req.user.id,
        username: req.user.username || "unknown",
        action: "CREATE_CLIENT",
        resourceType: "CLIENT",
        resourceId: createdData.id.toString(),
        details: `Created new client: ${createdData.firstName} ${createdData.lastName}`,
        ipAddress: clientIP,
        userAgent: req.headers["user-agent"] || "unknown",
        timestamp: /* @__PURE__ */ new Date()
      });
      return res.status(201).json(createdData);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        const validationError = fromZodError(error);
        console.error("Validation error:", validationError);
        return res.status(400).json({ message: validationError.message });
      }
      console.error("Error creating person info:", error);
      if (error instanceof Error) {
        console.error("Error details:", error.message, error.stack);
      }
      return res.status(500).json({ message: "Failed to create person info" });
    }
  });
  app2.get("/api/person-info", apiRateLimit, sanitizeInput, preventSQLInjection, authMiddleware, validateSegmentAccess, companyDataFilter, async (req, res) => {
    try {
      const segmentId = req.query.segmentId ? parseInt(req.query.segmentId) : void 0;
      const personInfo = await dbStorage.getAllPersonInfo(segmentId);
      return res.status(200).json(personInfo);
    } catch (error) {
      console.error("Error fetching person info:", error);
      return res.status(500).json({ message: "Failed to fetch person info" });
    }
  });
  app2.get("/api/person-info/:id", apiRateLimit, validateRequest(idValidation), sanitizeInput, preventSQLInjection, authMiddleware, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        throw new ApiError(400, "Invalid ID format", null, "INVALID_ID");
      }
      const personInfo = await dbStorage.getPersonInfoById(id);
      if (!personInfo) {
        throw new ApiError(404, "Person info not found", null, "NOT_FOUND");
      }
      res.status(200).json(personInfo);
    } catch (error) {
      next(error);
    }
  });
  app2.put("/api/person-info/:id", apiRateLimit, validateRequest(idValidation), sanitizeInput, preventSQLInjection, authMiddleware, validateSegmentAccess, companyDataFilter, async (req, res, next) => {
    try {
      console.log("Update request received for id:", req.params.id, "with data:", req.body);
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        throw new ApiError(400, "Invalid ID format", null, "INVALID_ID");
      }
      const existingPerson = await dbStorage.getPersonInfoById(id);
      if (!existingPerson) {
        throw new ApiError(404, "Person not found", null, "NOT_FOUND");
      }
      const validatedData = insertPersonInfoSchema.parse({
        ...req.body,
        status: req.body.status || existingPerson.status || "New"
      });
      console.log("Validated update data:", validatedData);
      const updatedPerson = await dbStorage.updatePersonInfo(id, {
        ...validatedData,
        email: validatedData.email || "",
        mobilePhone: validatedData.mobilePhone || "",
        postCode: validatedData.postCode || "",
        createdBy: existingPerson.createdBy,
        // Preserve the original createdBy value
        segmentId: validatedData.segmentId !== null ? validatedData.segmentId : void 0
        // Handle segmentId properly
      });
      const clientIP = req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || req.socket.remoteAddress || req.ip || "unknown";
      await dbStorage.logUserActivity({
        userId: req.user.id,
        username: req.user.username || "unknown",
        action: "UPDATE_CLIENT",
        resourceType: "CLIENT",
        resourceId: id.toString(),
        details: `Updated client: ${existingPerson.firstName} ${existingPerson.lastName}`,
        ipAddress: clientIP,
        userAgent: req.headers["user-agent"] || "unknown",
        timestamp: /* @__PURE__ */ new Date()
      });
      console.log("Person updated successfully:", updatedPerson);
      res.status(200).json(updatedPerson);
    } catch (error) {
      next(error);
    }
  });
  app2.patch("/api/client-assignment/:id", apiRateLimit, validateRequest(idValidation), sanitizeInput, preventSQLInjection, authMiddleware, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { status } = req.body;
      if (!status || !["Planned", "In Progress", "Closed"].includes(status)) {
        return res.status(400).json({ message: "Invalid status value" });
      }
      await dbStorage.updateClientServiceStatus(id, status);
      return res.status(200).json({ message: "Status updated successfully" });
    } catch (error) {
      console.error("Error updating assignment status:", error);
      return res.status(500).json({ message: "Failed to update status" });
    }
  });
  app2.post("/api/client-assignment", uploadRateLimit, secureFileUpload, sanitizeInput, preventSQLInjection, authMiddleware, upload.single("document"), async (req, res) => {
    try {
      const { clientId, careCategory, careType, notes } = req.body;
      if (!clientId || !careCategory || !careType) {
        return res.status(400).json({ message: "Client ID, care category, and care type are required" });
      }
      const clientIdNum = parseInt(clientId);
      if (isNaN(clientIdNum)) {
        return res.status(400).json({ message: "Invalid client ID format" });
      }
      const client = await dbStorage.getPersonInfoById(clientIdNum);
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
      const masterDataEntry = {
        serviceCategory: careCategory,
        serviceType: careType,
        serviceProvider: "",
        active: true,
        clientId: clientIdNum,
        createdBy: req.user.id,
        notes: notes || ""
      };
      let documentPath = "";
      if (req.file) {
        documentPath = req.file.path;
        masterDataEntry.notes += `
Document: ${req.file.originalname}`;
      }
      const createdData = await dbStorage.createMasterData(masterDataEntry);
      return res.status(201).json({
        ...createdData,
        documentUploaded: !!req.file
      });
    } catch (error) {
      console.error("Error creating client assignment:", error);
      return res.status(500).json({ message: "Failed to create client assignment" });
    }
  });
  app2.post("/api/documents", uploadRateLimit, secureFileUpload, sanitizeInput, preventSQLInjection, authMiddleware, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      const { clientId, documentName, documentType, segmentId } = req.body;
      if (!clientId || !documentName || !documentType) {
        return res.status(400).json({ message: "Missing required fields: clientId, documentName, documentType, and file are required" });
      }
      const client = await dbStorage.getPersonInfoById(parseInt(clientId));
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
      const existingDocument = await dbStorage.getDocumentByClientAndFilename(parseInt(clientId), req.file.originalname);
      if (existingDocument) {
        return res.status(409).json({
          message: `Document with filename "${req.file.originalname}" already exists for this client. Please use the existing document or rename the file.`,
          conflictType: "filename_exists",
          existingDocument: {
            id: existingDocument.id,
            documentName: existingDocument.documentName,
            uploadedAt: existingDocument.uploadedAt
          }
        });
      }
      const clientDirName = `client_${clientId}_${client.firstName}_${client.lastName}`.replace(/[^a-zA-Z0-9_]/g, "_");
      const clientDir = path3.join(uploadsDir, clientDirName);
      const filename = req.file.originalname;
      const fullFilePath = path3.join(clientDir, filename);
      const relativeFilePath = path3.join(clientDirName, filename).replace(/\\/g, "/");
      console.log("Document upload debug - NODE_ENV:", process.env.NODE_ENV);
      console.log("Document upload debug - clientDir:", clientDir);
      console.log("Document upload debug - fullFilePath:", fullFilePath);
      console.log("Document upload debug - relativeFilePath:", relativeFilePath);
      console.log("Document upload debug - req.file.path:", req.file?.path);
      console.log("Document upload debug - req.file.filename:", req.file?.filename);
      let finalFilePath = relativeFilePath;
      if (!req.file.buffer) {
        throw new Error("No file buffer provided by multer");
      }
      if (!storageService) {
        throw new Error("Storage service is not available");
      }
      const fileBuffer = Buffer.isBuffer(req.file.buffer) ? req.file.buffer : Buffer.from(req.file.buffer);
      await storageService.uploadFile(fileBuffer, relativeFilePath, req.file.mimetype);
      console.log("Uploaded file using storage service:", relativeFilePath);
      const documentRecord = await dbStorage.createDocument({
        clientId: parseInt(clientId),
        documentName,
        documentType,
        filename: req.file.originalname,
        // Store the original filename for file access
        filePath: finalFilePath,
        // Use the relative path for database storage
        createdBy: req.user.id,
        uploadedAt: /* @__PURE__ */ new Date(),
        segmentId: segmentId ? parseInt(segmentId) : null
      });
      const clientIP = req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || req.socket.remoteAddress || req.ip || "unknown";
      await dbStorage.logUserActivity({
        userId: req.user.id,
        username: req.user.username || "unknown",
        action: "UPLOAD_DOCUMENT",
        resourceType: "DOCUMENT",
        resourceId: documentRecord.id.toString(),
        details: `Uploaded document: ${documentName} (${documentType}) for client ${client.firstName} ${client.lastName}`,
        ipAddress: clientIP,
        userAgent: req.headers["user-agent"] || "unknown",
        timestamp: /* @__PURE__ */ new Date()
      });
      return res.status(201).json(documentRecord);
    } catch (error) {
      console.error("Error uploading document:", error);
      return res.status(500).json({ message: "Failed to upload document" });
    }
  });
  app2.get("/api/documents/client/:clientId", apiRateLimit, validateRequest(clientIdValidation), sanitizeInput, preventSQLInjection, authMiddleware, validateSegmentAccess, companyDataFilter, createHandler(async (req, res) => {
    try {
      console.log(`Document list requested for client ID: ${req.params.clientId}`);
      const clientId = parseInt(req.params.clientId);
      const segmentId = req.query.segmentId ? parseInt(req.query.segmentId) : void 0;
      if (isNaN(clientId)) {
        return res.status(400).json({ message: "Invalid client ID format" });
      }
      const documents = await dbStorage.getDocumentsByClientId(clientId, segmentId);
      if (!documents || documents.length === 0) {
        console.log(`No documents found for client ${clientId}${segmentId ? ` in segment ${segmentId}` : ""}`);
        return res.status(404).json({ message: "Document not found" });
      }
      const normalizedDocuments = documents.map((doc) => {
        let filePath = doc.filePath;
        const isLocalDev = process.env.NODE_ENV !== "production";
        if (isLocalDev) {
          if (!filePath) {
            console.log(`Missing file path for document ${doc.id}`);
            return {
              ...doc,
              filePath: ""
            };
          }
          let fullPath = filePath;
          if (!fullPath.startsWith("/") && !fullPath.match(/^[A-Za-z]:\\/)) {
            fullPath = path3.join(process.cwd(), filePath);
          }
          if (fs3.existsSync(fullPath)) {
          } else {
            const uploadsDir2 = process.env.DOCUMENTS_ROOT_PATH || path3.join(process.cwd(), "uploads");
            if (filePath.startsWith("uploads/")) {
              const pathWithoutUploads = filePath.substring("uploads/".length);
              fullPath = path3.join(uploadsDir2, pathWithoutUploads);
            } else {
              fullPath = path3.join(uploadsDir2, filePath);
            }
            if (fs3.existsSync(fullPath)) {
              console.log(`Found document at file system path: ${fullPath}, keeping database path: ${filePath}`);
            } else {
              console.log(`Document file not found at: ${fullPath}`);
            }
          }
        }
        return {
          ...doc,
          filePath: filePath ? filePath.replace(/\\/g, "/") : ""
          // Ensure forward slashes, fallback to empty string
        };
      });
      console.log(`Found ${documents.length} documents for client ${clientId}`);
      return res.status(200).json({ data: normalizedDocuments });
    } catch (error) {
      console.error("Error fetching client documents:", error);
      return res.status(500).json({ message: "Failed to fetch client documents" });
    }
  }));
  app2.get("/api/documents/view/:filePath(*)", apiRateLimit, sanitizeInput, preventSQLInjection, authMiddleware, createHandler(async (req, res) => {
    try {
      const filePath = decodeURIComponent(req.params.filePath);
      console.log(`Document view requested for path: ${filePath}`);
      const document = await dbStorage.getDocumentByFilePath(filePath);
      if (!document) {
        console.log(`Document not found in database with path: ${filePath}`);
        return res.status(404).json({ message: "Document not found in database" });
      }
      if (storageService) {
        try {
          if (!document.filePath) {
            return res.status(404).json({ message: "Document file path is missing" });
          }
          const fileBuffer = await storageService.downloadFile(document.filePath);
          const ext = path3.extname(document.filename).toLowerCase();
          const contentType = {
            ".pdf": "application/pdf",
            ".doc": "application/msword",
            ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png"
          }[ext] || "application/octet-stream";
          res.setHeader("Content-Type", contentType);
          res.setHeader("Content-Disposition", `inline; filename="${document.filename}"`);
          return res.end(fileBuffer);
        } catch (error) {
          console.error("Error downloading from storage service:", error);
          return res.status(404).json({ message: "Document not found in storage" });
        }
      } else {
        if (!document.filePath) {
          return res.status(404).json({ message: "Document file path is missing" });
        }
        let fullPath = path3.join(uploadsDir, document.filePath);
        console.log(`Attempting to access file at: ${fullPath}`);
        if (!fs3.existsSync(fullPath)) {
          console.log(`File not found, trying fallback paths...`);
          const basename = path3.basename(document.filePath);
          const fallbackPath1 = path3.join(uploadsDir, basename);
          console.log(`Trying fallback 1 - basename in uploads: ${fallbackPath1}`);
          if (fs3.existsSync(fallbackPath1)) {
            fullPath = fallbackPath1;
          } else {
            let cleanPath = document.filePath;
            if (cleanPath.startsWith("uploads/")) {
              cleanPath = cleanPath.substring("uploads/".length);
            }
            const fallbackPath2 = path3.join(uploadsDir, cleanPath);
            console.log(`Trying fallback 2 - cleaned path: ${fallbackPath2}`);
            if (fs3.existsSync(fallbackPath2)) {
              fullPath = fallbackPath2;
            }
          }
        }
        if (!fs3.existsSync(fullPath)) {
          console.error(`File not found at any attempted path. Last tried: ${fullPath}`);
          return res.status(404).json({ message: "Document file not found on disk" });
        }
        const ext = path3.extname(document.filename).toLowerCase();
        const contentType = {
          ".pdf": "application/pdf",
          ".doc": "application/msword",
          ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".png": "image/png"
        }[ext] || "application/octet-stream";
        res.setHeader("Content-Type", contentType);
        res.setHeader("Content-Disposition", `inline; filename="${document.filename}"`);
        const fileStream = fs3.createReadStream(fullPath);
        fileStream.pipe(res);
      }
    } catch (error) {
      console.error("Error in document view endpoint:", error);
      return res.status(500).json({ message: "Failed to retrieve document" });
    }
  }));
  app2.get("/api/documents/:filePath(*)", apiRateLimit, sanitizeInput, preventSQLInjection, authMiddleware, createHandler(async (req, res) => {
    try {
      const filePath = decodeURIComponent(req.params.filePath);
      console.log(`Document download requested for path: ${filePath}`);
      const document = await dbStorage.getDocumentByFilePath(filePath);
      if (!document) {
        console.log(`Document not found in database with path: ${filePath}`);
        return res.status(404).json({ message: "Document not found in database" });
      }
      if (storageService) {
        try {
          if (!document.filePath) {
            return res.status(404).json({ message: "Document file path is missing" });
          }
          const fileBuffer = await storageService.downloadFile(document.filePath);
          const ext = path3.extname(document.filename).toLowerCase();
          const contentType = {
            ".pdf": "application/pdf",
            ".doc": "application/msword",
            ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png"
          }[ext] || "application/octet-stream";
          res.setHeader("Content-Type", contentType);
          res.setHeader("Content-Disposition", `attachment; filename="${document.filename}"`);
          return res.end(fileBuffer);
        } catch (error) {
          console.error("Error downloading from storage service:", error);
          return res.status(404).json({ message: "Document not found in storage" });
        }
      } else {
        if (!document.filePath) {
          return res.status(404).json({ message: "Document file path is missing" });
        }
        if (!document.filePath) {
          return res.status(404).json({ message: "Document file path is missing" });
        }
        let fullPath = path3.join(uploadsDir, document.filePath);
        console.log(`Attempting to access file at: ${fullPath}`);
        if (!fs3.existsSync(fullPath)) {
          console.log(`File not found, trying fallback paths...`);
          const basename = path3.basename(document.filePath);
          const fallbackPath1 = path3.join(uploadsDir, basename);
          console.log(`Trying fallback 1 - basename in uploads: ${fallbackPath1}`);
          if (fs3.existsSync(fallbackPath1)) {
            fullPath = fallbackPath1;
          } else {
            let cleanPath = document.filePath;
            if (cleanPath.startsWith("uploads/")) {
              cleanPath = cleanPath.substring("uploads/".length);
            }
            const fallbackPath2 = path3.join(uploadsDir, cleanPath);
            console.log(`Trying fallback 2 - cleaned path: ${fallbackPath2}`);
            if (fs3.existsSync(fallbackPath2)) {
              fullPath = fallbackPath2;
            }
          }
        }
        if (!fs3.existsSync(fullPath)) {
          console.error(`File not found at any attempted path. Last tried: ${fullPath}`);
          return res.status(404).json({ message: "Document file not found on disk" });
        }
        const ext = path3.extname(document.filename).toLowerCase();
        const contentType = {
          ".pdf": "application/pdf",
          ".doc": "application/msword",
          ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".png": "image/png"
        }[ext] || "application/octet-stream";
        res.setHeader("Content-Type", contentType);
        res.setHeader("Content-Disposition", `attachment; filename="${document.filename}"`);
        const absolutePath = path3.resolve(fullPath);
        res.sendFile(absolutePath);
      }
    } catch (error) {
      console.error("Error retrieving document:", error);
      return res.status(500).json({ message: "Failed to retrieve document" });
    }
  }));
  app2.get("/api/client-services", apiRateLimit, sanitizeInput, preventSQLInjection, authMiddleware, validateSegmentAccess, companyDataFilter, async (req, res) => {
    try {
      const clientServices = await dbStorage.getClientServices();
      return res.status(200).json(clientServices);
    } catch (error) {
      console.error("Error fetching client services:", error);
      return res.status(500).json({ message: "Failed to fetch client services" });
    }
  });
  app2.post("/api/client-services", apiRateLimit, sanitizeInput, preventSQLInjection, validateSegmentAccess, authMiddleware, async (req, res) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      console.log("[API] Received client service data:", req.body);
      const requestData = {
        ...req.body,
        segmentId: req.body.segmentId === void 0 ? null : req.body.segmentId,
        createdBy: req.user.id
      };
      const validatedData = insertClientServiceSchema.parse(requestData);
      console.log("[API] Validated client service data:", validatedData);
      const exists = await dbStorage.checkMasterDataExists(
        validatedData.serviceCategory,
        validatedData.serviceType,
        validatedData.serviceProvider,
        validatedData.segmentId === null ? void 0 : validatedData.segmentId
      );
      if (!exists) {
        return res.status(400).json({
          message: "The selected service combination doesn't exist in the master data. Please use the Master Data page to create it first."
        });
      }
      const clientServiceWithUser = {
        ...validatedData,
        segmentId: validatedData.segmentId === null ? void 0 : validatedData.segmentId,
        createdBy: req.user.id,
        status: validatedData.status || "Planned",
        createdAt: /* @__PURE__ */ new Date()
      };
      console.log("[API] Creating client service with:", clientServiceWithUser);
      const createdService = await dbStorage.createClientService(clientServiceWithUser);
      console.log("[API] Client service created:", createdService);
      return res.status(201).json(createdService);
    } catch (error) {
      if (error instanceof z2.ZodError) {
        const validationError = fromZodError(error);
        console.error("[API] Validation error:", validationError);
        return res.status(400).json({ message: validationError.message, details: validationError.details });
      }
      console.error("[API] Error creating client service:", error);
      return res.status(500).json({ message: "Failed to create client service" });
    }
  });
  app2.get("/api/client-services/client/:clientId", apiRateLimit, validateRequest(clientIdValidation), sanitizeInput, preventSQLInjection, authMiddleware, validateSegmentAccess, companyDataFilter, async (req, res) => {
    console.log("[API] Getting existing services for client:", req.params.clientId);
    try {
      const clientId = parseInt(req.params.clientId);
      if (isNaN(clientId)) {
        return res.status(400).json({ message: "Invalid client ID format" });
      }
      const segmentId = req.query.segmentId ? parseInt(req.query.segmentId) : void 0;
      console.log(`[API] Fetching client services with segmentId: ${segmentId || "none"}`);
      const services = await dbStorage.getClientServicesByClientId(clientId, segmentId);
      return res.status(200).json(services);
    } catch (error) {
      console.error("Error fetching client services:", error);
      return res.status(500).json({ message: "Failed to fetch client services" });
    }
  });
  app2.patch("/api/client-services/:id", apiRateLimit, validateRequest(idValidation), sanitizeInput, preventSQLInjection, authMiddleware, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid service ID format" });
      }
      const { status } = req.body;
      if (!status || !["Planned", "In Progress", "Closed"].includes(status)) {
        return res.status(400).json({ message: "Invalid status value" });
      }
      await dbStorage.updateClientServiceStatus(id, status);
      return res.status(200).json({ message: "Service status updated successfully" });
    } catch (error) {
      console.error("Error updating service status:", error);
      return res.status(500).json({ message: "Failed to update service status" });
    }
  });
  app2.get("/api/service-case-notes/service/:serviceId", apiRateLimit, validateRequest(serviceIdValidation), sanitizeInput, preventSQLInjection, authMiddleware, async (req, res) => {
    try {
      const serviceId = parseInt(req.params.serviceId);
      if (isNaN(serviceId)) {
        return res.status(400).json({ message: "Invalid service ID format" });
      }
      const notes = await dbStorage.getServiceCaseNotesByServiceId(serviceId);
      return res.status(200).json(notes);
    } catch (error) {
      console.error("Error fetching service case notes:", error);
      return res.status(500).json({ message: "Failed to fetch service case notes" });
    }
  });
  app2.post("/api/service-case-notes/counts", apiRateLimit, sanitizeInput, preventSQLInjection, authMiddleware, async (req, res) => {
    try {
      const { serviceIds } = req.body;
      if (!Array.isArray(serviceIds) || serviceIds.length === 0) {
        return res.status(400).json({ message: "Invalid service IDs format" });
      }
      const validServiceIds = serviceIds.filter((id) => Number.isInteger(id) && id > 0);
      if (validServiceIds.length !== serviceIds.length) {
        return res.status(400).json({ message: "All service IDs must be valid positive integers" });
      }
      const counts = {};
      for (const serviceId of validServiceIds) {
        const count = await dbStorage.getServiceCaseNotesCount(serviceId);
        counts[serviceId] = count;
      }
      return res.status(200).json(counts);
    } catch (error) {
      console.error("Error fetching case notes counts:", error);
      return res.status(500).json({ message: "Failed to fetch case notes counts" });
    }
  });
  app2.post("/api/change-password", authRateLimit, authMiddleware, async (req, res) => {
    try {
      const userId = req.user?.id;
      const username = req.user?.username;
      const { currentPassword, newPassword } = req.body;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current and new password required" });
      }
      if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
        return res.status(400).json({ message: "Invalid password format" });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ message: "New password must be at least 6 characters long" });
      }
      if (newPassword.length > 128) {
        return res.status(400).json({ message: "New password is too long" });
      }
      if (currentPassword === newPassword) {
        return res.status(400).json({ message: "New password must be different from current password" });
      }
      const user = await dbStorage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const isMatch = await dbStorage.verifyPassword(user.username, currentPassword);
      if (!isMatch) {
        console.warn(`Failed password change attempt for user: ${username} (ID: ${userId}) from IP: ${req.ip}`);
        return res.status(400).json({ message: "Current password is incorrect" });
      }
      await dbStorage.updateUserPassword(userId, newPassword);
      console.info(`Password changed successfully for user: ${username} (ID: ${userId}) from IP: ${req.ip}`);
      const clientIP = req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || req.socket.remoteAddress || req.ip || "unknown";
      await dbStorage.logUserActivity({
        userId,
        username: username || "unknown",
        action: "CHANGE_PASSWORD",
        resourceType: "USER",
        resourceId: userId.toString(),
        details: "User changed password",
        ipAddress: clientIP,
        userAgent: req.headers["user-agent"] || "unknown",
        timestamp: /* @__PURE__ */ new Date()
      });
      return res.status(200).json({ message: "Password changed successfully" });
    } catch (err) {
      console.error("Password change error:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to change password";
      return res.status(500).json({ message: errorMessage });
    }
  });
  app2.get("/api/users", apiRateLimit, sanitizeInput, preventSQLInjection, authMiddleware, async (req, res) => {
    const authReq = req;
    try {
      const user = await dbStorage.getUserById(authReq.user.id);
      if (!user || user.role !== "admin") {
        console.log("Request rejected: User is not admin", {
          userId: user?.id,
          userRole: user?.role
        });
        return res.status(403).json({ message: "Forbidden: Admin access required" });
      }
      const users = await dbStorage.getAllUsers();
      return res.status(200).json(users.map((u) => ({
        id: u.id,
        name: u.name,
        username: u.username,
        role: u.role,
        company_id: u.company_id
      })));
    } catch (err) {
      console.error("Error fetching users:", err);
      console.log("[API /api/users] Failed to fetch users");
      return res.status(500).json({ message: "[API /api/users] Failed to fetch users", error: err instanceof Error ? err.message : "Unknown error" });
    }
  });
  app2.get("/api/users/:id", apiRateLimit, sanitizeInput, preventSQLInjection, idValidation, authMiddleware, async (req, res) => {
    try {
      console.log(`[API /api/users/:id] Request received for user with ID: ${req.params.id}`);
      console.log(`[API /api/users/:id] Request headers:`, req.headers);
      const authReq = req;
      const currentUser = await dbStorage.getUserById(authReq.user.id);
      if (!currentUser || currentUser.role !== "admin") {
        console.log("[API /api/users/:id] Request rejected: User is not admin", {
          userId: currentUser?.id,
          userRole: currentUser?.role
        });
        return res.status(403).json({ message: "Forbidden: Admin access required" });
      }
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        console.log(`[API /api/users/:id] Invalid user ID format: ${req.params.id}`);
        return res.status(400).json({ message: "Invalid user ID format" });
      }
      console.log(`[API /api/users/:id] Looking up user with ID: ${userId}`);
      const user = await dbStorage.getUserById(userId);
      if (!user) {
        console.log(`[API /api/users/:id] User not found with ID: ${userId}`);
        return res.status(404).json({ message: "User not found" });
      }
      console.log(`[API /api/users/:id] Found user: ${user.username}`);
      res.setHeader("Content-Type", "application/json");
      return res.status(200).json({
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
        company_id: user.company_id
      });
    } catch (err) {
      console.error("[API /api/users/:id] Error fetching user:", err);
      return res.status(500).json({ message: "Failed to fetch user", error: err instanceof Error ? err.message : "Unknown error" });
    }
  });
  app2.put("/api/users/:id", apiRateLimit, sanitizeInput, preventSQLInjection, idValidation, authMiddleware, async (req, res) => {
    try {
      console.log(`[API PUT /api/users/:id] Update request received for user with ID: ${req.params.id}`);
      const authReq = req;
      const currentUser = await dbStorage.getUserById(authReq.user.id);
      if (!currentUser || currentUser.role !== "admin" && currentUser.id !== parseInt(req.params.id)) {
        console.log("[API PUT /api/users/:id] Request rejected: User is not admin or not updating own account", {
          userId: currentUser?.id,
          userRole: currentUser?.role
        });
        return res.status(403).json({ message: "Forbidden: Admin access required or can only update own account" });
      }
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) {
        console.log(`[API PUT /api/users/:id] Invalid user ID format: ${req.params.id}`);
        return res.status(400).json({ message: "Invalid user ID format" });
      }
      const existingUser = await dbStorage.getUserById(userId);
      if (!existingUser) {
        console.log(`[API PUT /api/users/:id] User not found with ID: ${userId}`);
        return res.status(404).json({ message: "User not found" });
      }
      console.log(`[API PUT /api/users/:id] Updating user with ID: ${userId}`);
      let updateData = req.body;
      if (currentUser.role !== "admin" && currentUser.id === userId) {
        updateData = {
          name: req.body.name
        };
        if (req.body.password) {
          updateData.password = req.body.password;
        }
      }
      const updatedUser = await dbStorage.updateUser(userId, updateData);
      const clientIP = req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || req.socket.remoteAddress || req.ip || "unknown";
      const updatedFields = Object.keys(updateData).filter((key) => key !== "password");
      const details = currentUser.role === "admin" && currentUser.id !== userId ? `Admin updated user ${existingUser.username}. Fields: ${updatedFields.join(", ")}` : `User updated own profile. Fields: ${updatedFields.join(", ")}`;
      await dbStorage.logUserActivity({
        userId: currentUser.id,
        username: currentUser.username,
        action: "UPDATE_USER",
        resourceType: "USER",
        resourceId: userId.toString(),
        details,
        ipAddress: clientIP,
        userAgent: req.headers["user-agent"] || "unknown",
        timestamp: /* @__PURE__ */ new Date()
      });
      res.setHeader("Content-Type", "application/json");
      return res.status(200).json({
        id: updatedUser.id,
        name: updatedUser.name,
        username: updatedUser.username,
        role: updatedUser.role,
        company_id: updatedUser.company_id
      });
    } catch (err) {
      console.error("[API PUT /api/users/:id] Error updating user:", err);
      return res.status(500).json({ message: "Failed to update user", error: err instanceof Error ? err.message : "Unknown error" });
    }
  });
  app2.post("/api/users", apiRateLimit, sanitizeInput, preventSQLInjection, authMiddleware, async (req, res) => {
    try {
      console.log("Received user creation request with body:", {
        ...req.body,
        password: "[REDACTED]"
        // Don't log passwords
      });
      if (!req.user?.id) {
        console.log("Request rejected: No user ID");
        return res.status(401).json({ message: "Unauthorized" });
      }
      const currentUser = await dbStorage.getUserById(req.user.id);
      console.log("Current user attempting operation:", {
        id: currentUser?.id,
        username: currentUser?.username,
        role: currentUser?.role
      });
      if (!currentUser || currentUser.role !== "admin") {
        console.log("Request rejected: User is not admin", {
          userId: currentUser?.id,
          userRole: currentUser?.role
        });
        return res.status(403).json({ message: "Forbidden" });
      }
      try {
        console.log("Validating input data...");
        const validatedData = insertUserSchema.parse(req.body);
        console.log("Input validation successful");
        const existing = await dbStorage.getUserByUsername(validatedData.username);
        if (existing) {
          console.log("Request rejected: Username already exists:", validatedData.username);
          return res.status(409).json({ message: "Username already exists" });
        }
        console.log("Creating new user with username:", validatedData.username);
        const user = await AuthService.createUser({
          name: validatedData.name,
          username: validatedData.username,
          password: validatedData.password,
          role: validatedData.role,
          company_id: validatedData.company_id
        });
        console.log("User created successfully:", {
          id: user.id,
          username: user.username,
          role: user.role,
          company_id: user.company_id
        });
        const clientIP = req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || req.socket.remoteAddress || req.ip || "unknown";
        await dbStorage.logUserActivity({
          userId: currentUser.id,
          username: currentUser.username,
          action: "CREATE_USER",
          resourceType: "USER",
          resourceId: user.id.toString(),
          details: `Created new user: ${user.username} with role: ${user.role}`,
          ipAddress: clientIP,
          userAgent: req.headers["user-agent"] || "unknown",
          timestamp: /* @__PURE__ */ new Date()
        });
        return res.status(201).json(user);
      } catch (validationError) {
        console.error("Validation error:", validationError);
        if (validationError instanceof z2.ZodError) {
          const formattedError = fromZodError(validationError);
          return res.status(400).json({
            message: "Validation failed",
            errors: formattedError.details
          });
        }
        throw validationError;
      }
    } catch (err) {
      console.error("Error creating user:", err);
      if (err instanceof Error) {
        console.error("Error stack:", err.stack);
      }
      return res.status(500).json({ message: "Failed to add user" });
    }
  });
  app2.get(
    "/api/companies",
    apiRateLimit,
    sanitizeInput,
    preventSQLInjection,
    authMiddleware,
    async (req, res) => {
      const authReq = req;
      try {
        const user = await dbStorage.getUserById(authReq.user.id);
        if (!user || user.role !== "admin") {
          return res.status(403).json({ message: "Forbidden: Admin access required" });
        }
        const companies = await dbStorage.getAllCompanies();
        return res.status(200).json(companies);
      } catch (error) {
        console.error("Error fetching companies:", error);
        return res.status(500).json({ message: "Failed to fetch companies" });
      }
    }
  );
  app2.post(
    "/api/companies",
    apiRateLimit,
    sanitizeInput,
    preventSQLInjection,
    authMiddleware,
    async (req, res) => {
      const authReq = req;
      try {
        if (!authReq.user) {
          return res.status(401).json({ error: "Unauthorized" });
        }
        const validatedData = insertCompanySchema.parse({
          ...req.body,
          created_by: authReq.user.id
        });
        const company = await dbStorage.createCompany(validatedData);
        const clientIP = req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || req.socket.remoteAddress || req.ip || "unknown";
        await dbStorage.logUserActivity({
          userId: authReq.user.id,
          username: authReq.user.username || "unknown",
          action: "CREATE_COMPANY",
          resourceType: "COMPANY",
          resourceId: company.company_id.toString(),
          details: `Created new company: ${company.company_name}`,
          ipAddress: clientIP,
          userAgent: req.headers["user-agent"] || "unknown",
          timestamp: /* @__PURE__ */ new Date()
        });
        res.status(201).json(company);
      } catch (error) {
        console.error("Error creating company:", error);
        return res.status(500).json({ message: "Failed to create company" });
      }
    }
  );
  app2.put(
    "/api/companies/:id",
    apiRateLimit,
    validateRequest(idValidation),
    sanitizeInput,
    preventSQLInjection,
    authMiddleware,
    async (req, res) => {
      const authReq = req;
      try {
        if (!authReq.user) {
          return res.status(401).json({ error: "Unauthorized" });
        }
        const user = await dbStorage.getUserById(authReq.user.id);
        if (!user || user.role !== "admin") {
          return res.status(403).json({ message: "Forbidden: Admin access required" });
        }
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
          return res.status(400).json({ message: "Invalid company ID" });
        }
        const existingCompany = await dbStorage.getCompanyById(id);
        if (!existingCompany) {
          return res.status(404).json({ message: "Company not found" });
        }
        const validatedData = insertCompanySchema.parse({
          ...req.body,
          created_by: existingCompany.created_by || authReq.user.id
        });
        const company = await dbStorage.updateCompany(id, validatedData);
        const clientIP = req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || req.socket.remoteAddress || req.ip || "unknown";
        await dbStorage.logUserActivity({
          userId: authReq.user.id,
          username: authReq.user.username || "unknown",
          action: "UPDATE_COMPANY",
          resourceType: "COMPANY",
          resourceId: id.toString(),
          details: `Updated company: ${existingCompany.company_name}`,
          ipAddress: clientIP,
          userAgent: req.headers["user-agent"] || "unknown",
          timestamp: /* @__PURE__ */ new Date()
        });
        return res.status(200).json(company);
      } catch (error) {
        if (error instanceof z2.ZodError) {
          const validationError = fromZodError(error);
          return res.status(400).json({ message: validationError.message });
        }
        console.error("Error updating company:", error);
        return res.status(500).json({ message: "Failed to update company" });
      }
    }
  );
  app2.get(
    "/api/companies/:id",
    apiRateLimit,
    strictRateLimit,
    validateRequest(idValidation),
    sanitizeInput,
    preventSQLInjection,
    authMiddleware,
    async (req, res) => {
      const authReq = req;
      try {
        const user = await dbStorage.getUserById(authReq.user.id);
        if (!user || user.role !== "admin") {
          return res.status(403).json({ message: "Forbidden: Admin access required" });
        }
        const companyId = parseInt(req.params.id);
        if (isNaN(companyId)) {
          return res.status(400).json({ message: "Invalid company ID format" });
        }
        const company = await dbStorage.getCompanyById(companyId);
        if (!company) {
          return res.status(404).json({ message: "Company not found" });
        }
        return res.status(200).json(company);
      } catch (error) {
        console.error("Error fetching company:", error);
        return res.status(500).json({ message: "Failed to fetch company" });
      }
    }
  );
  app2.get(
    "/api/segments/:companyId",
    apiRateLimit,
    strictRateLimit,
    validateRequest(companyIdValidation),
    sanitizeInput,
    preventSQLInjection,
    authMiddleware,
    async (req, res) => {
      const authReq = req;
      try {
        const companyId = parseInt(req.params.companyId);
        if (isNaN(companyId)) {
          return res.status(400).json({ message: "Invalid company ID" });
        }
        const segments = await dbStorage.getAllSegmentsByCompany(companyId);
        return res.status(200).json(segments);
      } catch (error) {
        console.error("Error fetching segments:", error);
        return res.status(500).json({ message: "Failed to fetch segments" });
      }
    }
  );
  app2.post(
    "/api/segments",
    apiRateLimit,
    strictRateLimit,
    sanitizeInput,
    preventSQLInjection,
    authMiddleware,
    async (req, res) => {
      const authReq = req;
      try {
        const { segment_name, company_id } = req.body;
        if (!segment_name || !company_id) {
          return res.status(400).json({ message: "Segment name and company ID are required" });
        }
        const segmentData = {
          segment_name,
          company_id,
          created_by: authReq.user.id
        };
        const newSegment = await dbStorage.createSegment(segmentData);
        return res.status(201).json(newSegment);
      } catch (error) {
        console.error("Error creating segment:", error);
        return res.status(500).json({ message: "Failed to create segment" });
      }
    }
  );
  app2.put(
    "/api/segments/:id",
    apiRateLimit,
    strictRateLimit,
    validateRequest(idValidation),
    sanitizeInput,
    preventSQLInjection,
    authMiddleware,
    async (req, res) => {
      const authReq = req;
      try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
          return res.status(400).json({ message: "Invalid segment ID" });
        }
        const { segment_name } = req.body;
        if (!segment_name) {
          return res.status(400).json({ message: "Segment name is required" });
        }
        const segmentData = {
          segment_name
        };
        const updatedSegment = await dbStorage.updateSegment(id, segmentData);
        if (!updatedSegment) {
          return res.status(404).json({ message: "Segment not found" });
        }
        return res.status(200).json(updatedSegment);
      } catch (error) {
        console.error("Error updating segment:", error);
        return res.status(500).json({ message: "Failed to update segment" });
      }
    }
  );
  app2.get("/api/user/segments", authMiddleware, async (req, res) => {
    const authReq = req;
    try {
      const user = await dbStorage.getUserById(authReq.user.id);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }
      console.log("Fetching segments for user:", {
        userId: user.id,
        username: user.username,
        role: user.role,
        companyId: user.company_id
      });
      if (user.company_id) {
        console.log(`Fetching segments for user's company: ${user.company_id}`);
        const segments = await dbStorage.getAllSegmentsByCompany(user.company_id);
        console.log(`Found ${segments.length} segments for company ${user.company_id}`);
        return res.status(200).json(segments);
      }
      if (!user.company_id) {
        console.log(`user ${user.id} has no company assignment, returning empty array`);
        return res.status(200).json([]);
      }
      console.log("Unhandled user case, returning empty array:", user);
      return res.status(200).json([]);
    } catch (error) {
      console.error("Error fetching user segments:", error);
      return res.status(500).json({ message: "Failed to fetch segments" });
    }
  });
  app2.use(errorHandler);
  const httpServer = createServer(app2);
  return httpServer;
}

// src/middleware/performance.ts
function performanceMiddleware(req, res, next) {
  if (!req.path.startsWith("/api")) {
    return next();
  }
  const startTime = Date.now();
  const memoryUsageStart = process.memoryUsage();
  req.performanceMetrics = {
    startTime,
    memoryUsageStart
  };
  const originalSend = res.send;
  res.send = function(body2) {
    res.send = originalSend;
    setImmediate(async () => {
      try {
        const storage2 = await getStorage();
        const endTime = Date.now();
        const memoryUsageEnd = process.memoryUsage();
        const responseTimeMs = endTime - startTime;
        const memoryUsageMb = (memoryUsageEnd.heapUsed - memoryUsageStart.heapUsed) / 1024 / 1024;
        const requestSizeBytes = req.headers["content-length"] ? parseInt(req.headers["content-length"]) : 0;
        const responseSizeBytes = body2 ? Buffer.byteLength(body2.toString()) : 0;
        const userId = req.user?.id;
        const companyId = req.user?.company_id;
        const clientIP = req.headers["x-forwarded-for"] || req.connection.remoteAddress || "unknown";
        await storage2.logPerformance({
          endpoint: req.path,
          method: req.method,
          userId,
          companyId,
          responseTimeMs,
          responseStatus: res.statusCode,
          memoryUsageMb: Math.round(memoryUsageMb * 100) / 100,
          // Round to 2 decimal places
          requestSizeBytes,
          responseSizeBytes,
          metadata: {
            userAgent: req.headers["user-agent"],
            clientIP,
            query: Object.keys(req.query).length > 0 ? req.query : void 0,
            params: Object.keys(req.params).length > 0 ? req.params : void 0
          },
          timestamp: /* @__PURE__ */ new Date()
        });
        if (responseTimeMs > 1e3) {
          console.warn(`\u{1F40C} SLOW REQUEST: ${req.method} ${req.path} took ${responseTimeMs}ms`);
        }
        if (res.statusCode >= 400) {
          console.warn(`\u26A0\uFE0F ERROR RESPONSE: ${req.method} ${req.path} returned ${res.statusCode} in ${responseTimeMs}ms`);
        }
      } catch (error) {
        console.error("Failed to log performance metrics:", error);
      }
    });
    return originalSend.call(this, body2);
  };
  next();
}

// index.ts
var __filename2 = fileURLToPath2(import.meta.url);
var __dirname2 = path4.dirname(__filename2);
console.log("Current directory:", __dirname2);
console.log("Node Environment:", process.env.NODE_ENV);
var envFile = process.env.NODE_ENV === "production" ? "production.env" : "development.env";
dotenv2.config({ path: envFile });
console.log("Environment:", process.env.NODE_ENV);
console.log("Database connection mode:", process.env.NODE_ENV === "production" ? "Azure Managed Identity" : "DATABASE_URL");
var app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.enable("trust proxy");
app.use(performanceMiddleware);
app.use((req, res, next) => {
  const start = Date.now();
  const path5 = req.path;
  let capturedJsonResponse = void 0;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path5.startsWith("/api")) {
      let logLine = `${req.method} ${path5} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    }
  });
  next();
});
async function initializeDatabase() {
  const maxRetries = 3;
  const retryDelay = 5e3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let client;
    try {
      console.log(`Database initialization attempt ${attempt}/${maxRetries}...`);
      console.log("Attempting to connect to database...");
      const pool = await getPool();
      client = await pool.connect();
      console.log("Database connection established");
      const migrationsPath = path4.resolve(__dirname2, "migrations");
      console.log("Migrations path:", migrationsPath);
      const migrationFiles = fs4.readdirSync(migrationsPath).sort();
      for (const migrationFile of migrationFiles) {
        try {
          console.log(`Running migration: ${migrationFile}`);
          const migrationSQL = fs4.readFileSync(path4.join(migrationsPath, migrationFile), "utf8");
          await client.query("BEGIN");
          await client.query(migrationSQL);
          await client.query("COMMIT");
          console.log(`Successfully completed migration: ${migrationFile}`);
        } catch (err) {
          await client.query("ROLLBACK");
          console.error(`Error running migration ${migrationFile}:`, err);
          if (process.env.NODE_ENV !== "production") {
            throw err;
          }
        }
      }
      console.log("Database migrations completed");
      return;
    } catch (err) {
      console.error(`Database initialization attempt ${attempt}/${maxRetries} failed:`, err);
      if (attempt === maxRetries) {
        console.error("\u274C All database initialization attempts failed.");
        if (process.env.NODE_ENV === "production") {
          console.log("\u{1F680} Starting server without database - some features may be limited");
          return;
        } else {
          throw err;
        }
      }
      console.log(`Retrying database initialization in ${retryDelay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    } finally {
      if (client) {
        client.release();
      }
    }
  }
}
(async () => {
  try {
    console.log("Starting server initialization...");
    await initializeDatabase();
    console.log("Database initialized successfully");
    console.log("Registering routes...");
    const server = await registerRoutes(app);
    console.log("Routes registered successfully");
    app.use(errorHandler);
    if (app.get("env") === "development") {
      const { setupVite } = await import("./vite");
      await setupVite(app, server);
    } else {
      const clientPath = path4.resolve(__dirname2, "client");
      console.log("Serving static files from:", clientPath);
      if (!fs4.existsSync(clientPath)) {
        console.error("Client directory not found at:", clientPath);
        console.error("Creating empty client directory");
        fs4.mkdirSync(clientPath, { recursive: true });
      }
      app.use(express.static(clientPath, {
        maxAge: "1d",
        setHeaders: (res, filePath) => {
          if (filePath.endsWith(".html")) {
            res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
          }
        }
      }));
      app.get("*", (req, res, next) => {
        if (req.path.startsWith("/api")) {
          return next();
        }
        const indexPath = path4.join(clientPath, "index.html");
        if (fs4.existsSync(indexPath)) {
          console.log(`SPA fallback serving index.html for: ${req.path}`);
          res.sendFile(indexPath, (err) => {
            if (err) {
              console.error("Error serving index.html:", err);
              res.status(500).send("Error loading application");
            }
          });
        } else {
          console.error("index.html not found at:", indexPath);
          res.status(404).send("Application files not found. Please check deployment.");
        }
      });
    }
    const port = process.env.WEBSITES_PORT || process.env.PORT || 3e3;
    server.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
})();
export {
  initializeDatabase
};
