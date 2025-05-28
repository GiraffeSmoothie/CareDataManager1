#!/usr/bin/env node

/**
 * CLI Script for creating admin users
 * 
 * This script allows secure creation of admin users without hardcoded credentials.
 * Usage: node create-admin.js
 * 
 * Security features:
 * - Interactive password input (hidden)
 * - Password strength validation
 * - No credentials stored in code
 * - Can be run independently of main application
 */

const readline = require('readline');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
require('dotenv').config({ path: './development.env' });

const SALT_ROUNDS = 12;

// Create database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

function createReadlineInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

function question(rl, prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

function hiddenQuestion(rl, prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    
    let password = '';
    process.stdin.on('data', function(char) {
      char = char + '';
      
      switch (char) {
        case '\n':
        case '\r':
        case '\u0004':
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdout.write('\n');
          resolve(password);
          break;
        case '\u0003':
          process.exit();
          break;
        case '\u007f': // Backspace
          if (password.length > 0) {
            password = password.slice(0, -1);
            process.stdout.write('\b \b');
          }
          break;
        default:
          password += char;
          process.stdout.write('*');
          break;
      }
    });
  });
}

function validatePassword(password) {
  const errors = [];
  
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }
  
  return errors;
}

async function createAdminUser() {
  const rl = createReadlineInterface();
  
  try {
    console.log('=== Admin User Creation Tool ===\n');
    
    // Get username
    const username = await question(rl, 'Enter admin username: ');
    if (!username || username.trim().length < 3) {
      console.log('Error: Username must be at least 3 characters long');
      process.exit(1);
    }
    
    // Check if user already exists
    const existingUser = await pool.query('SELECT id FROM users WHERE username = $1', [username.trim()]);
    if (existingUser.rows.length > 0) {
      console.log(`Error: User '${username}' already exists`);
      process.exit(1);
    }
    
    // Get full name
    const name = await question(rl, 'Enter admin full name: ');
    if (!name || name.trim().length < 1) {
      console.log('Error: Name is required');
      process.exit(1);
    }
    
    // Get password with validation
    let password, confirmPassword;
    let passwordValid = false;
    
    while (!passwordValid) {
      password = await hiddenQuestion(rl, 'Enter admin password: ');
      
      const validationErrors = validatePassword(password);
      if (validationErrors.length > 0) {
        console.log('\nPassword requirements not met:');
        validationErrors.forEach(error => console.log(`- ${error}`));
        console.log('');
        continue;
      }
      
      confirmPassword = await hiddenQuestion(rl, 'Confirm admin password: ');
      
      if (password !== confirmPassword) {
        console.log('Error: Passwords do not match. Please try again.\n');
        continue;
      }
      
      passwordValid = true;
    }
    
    // Hash password and create user
    console.log('\nCreating admin user...');
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    
    const result = await pool.query(
      'INSERT INTO users (username, password, name, role, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING id, username, name, role',
      [username.trim(), hashedPassword, name.trim(), 'admin']
    );
    
    const newUser = result.rows[0];
    console.log('\n✅ Admin user created successfully!');
    console.log(`   ID: ${newUser.id}`);
    console.log(`   Username: ${newUser.username}`);
    console.log(`   Name: ${newUser.name}`);
    console.log(`   Role: ${newUser.role}`);
    
    console.log('\n⚠️  Important Security Notes:');
    console.log('   - Store these credentials securely');
    console.log('   - Consider changing the password after first login');
    console.log('   - Remove or disable this script in production environments');
    
  } catch (error) {
    console.error('Error creating admin user:', error.message);
    process.exit(1);
  } finally {
    rl.close();
    await pool.end();
  }
}

async function main() {
  try {
    // Test database connection
    await pool.query('SELECT 1');
    await createAdminUser();
  } catch (error) {
    console.error('Database connection failed:', error.message);
    console.error('Please ensure the database is running and environment variables are set correctly.');
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\nOperation cancelled by user');
  await pool.end();
  process.exit(0);
});

main();
