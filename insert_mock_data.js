#!/usr/bin/env node

// Script to insert mock data into Superbase tables
import { createClient } from '@supabase/supabase-js';

// SECURITY: credentials come from the environment only. Never hardcode a key
// here — anything committed is considered leaked and must be rotated.
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
if (existsSync(join(__dirname, '.env'))) {
  const { config } = await import('dotenv');
  config({ path: join(__dirname, '.env') });
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKeyAnon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKeyAnon) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY. Add them to .env and re-run.');
  process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseKeyAnon);

// Mock data for users
const mockUsers = [
  { id: '1', email: 'user1@example.com', username: 'user1', tier: 'base', email_verified: false, preferences: {} },
  { id: '2', email: 'user2@example.com', username: 'user2', tier: 'premium', email_verified: true, preferences: { theme: 'dark' } }
];

// Mock data for avatars
const mockAvatars = [
  { id: '1', user_id: '1', name: 'avatar1', base: 'default' },
  { id: '2', user_id: '2', name: 'avatar2', base: 'custom' }
];

// Function to insert mock data into tables
async function insertMockData() {
  try {
    // Insert users
    for (const user of mockUsers) {
      const { data, error } = await supabase
        .from('users')
        .upsert(user)
        .select();
      if (error) {
        console.error('Error inserting user:', error);
      } else {
        console.log('Inserted user:', user.id);
      }
    }
    
    // Insert avatars
    for (const avatar of mockAvatars) {
      const { data, error } = await supabase
        .from('avatars')
        .upsert(avatar)
        .select();
      if (error) {
        console.error('Error inserting avatar:', error);
      } else {
        console.log('Inserted avatar:', avatar.id);
      }
    }
    
    console.log('Mock data inserted successfully.');
  } catch (error) {
    console.error('Failed to insert mock data:', error);
  }
}

// Run the script
insertMockData();