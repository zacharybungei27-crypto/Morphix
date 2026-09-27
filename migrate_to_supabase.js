#!/usr/bin/env node

// Migrate data from local IndexedDB to Superbase using mock data
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

// Mock data for testing
const mockUsers = [
  { id: '1', email: 'user1@example.com', username: 'user1', tier: 'base', email_verified: false, preferences: {} },
  { id: '2', email: 'user2@example.com', username: 'user2', tier: 'premium', email_verified: true, preferences: { theme: 'dark' } }
];

const mockAvatars = [
  { id: '1', user_id: '1', name: 'avatar1', base: 'default', customization: {}, metadata: {} },
  { id: '2', user_id: '2', name: 'avatar2', base: 'custom', customization: {}, metadata: {} }
];

// Function to migrate data from mock data to Superbase
async function migrateData() {
  try {
    // Migrate users
    for (const user of mockUsers) {
      const { data, error } = await supabase
        .from('users')
        .upsert({
          id: user.id.toString(),
          email: user.email,
          username: user.username,
          tier: user.tier,
          email_verified: user.email_verified,
          preferences: user.preferences,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select();
      if (error) {
        console.error('Error migrating user:', error);
      } else {
        console.log('Migrated user:', user.id);
      }
    }
    
    // Migrate avatars
    for (const avatar of mockAvatars) {
      const { data, error } = await supabase
        .from('avatars')
        .upsert({
          id: avatar.id.toString(),
          user_id: avatar.user_id.toString(),
          name: avatar.name,
          base: avatar.base,
          customization: avatar.customization,
          metadata: avatar.metadata,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select();
      if (error) {
        console.error('Error migrating avatar:', error);
      } else {
        console.log('Migrated avatar:', avatar.id);
      }
    }
    
    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
  }
}

// Run migration
migrateData();