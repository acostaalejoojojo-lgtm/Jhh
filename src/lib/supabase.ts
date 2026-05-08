import { createClient } from '@supabase/supabase-js';

// These can be provided via environment variables or dynamically updated via UI
export const getSupabaseConfig = () => {
  if (typeof window === 'undefined') return { url: '', key: '' };

  const storedUrl = localStorage.getItem('VITE_SUPABASE_URL');
  const storedKey = localStorage.getItem('VITE_SUPABASE_ANON_KEY');
  
  // Prioritize localStorage if set, otherwise use environment variables
  const url = storedUrl || import.meta.env.VITE_SUPABASE_URL || '';
  const key = storedKey || import.meta.env.VITE_SUPABASE_ANON_KEY || '';

  return { url, key };
};

let supabaseInstance: any = null;
let currentConfig = { url: '', key: '' };

const isValidUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    return url.includes('supabase.co');
  } catch {
    return false;
  }
};

/**
 * Gets the current Supabase client, re-initializing it if the config has changed
 */
export const getSupabaseClient = () => {
  const config = getSupabaseConfig();
  
  if (config.url !== currentConfig.url || config.key !== currentConfig.key || !supabaseInstance) {
    if (config.url && isValidUrl(config.url) && config.key) {
      supabaseInstance = createClient(config.url, config.key);
      currentConfig = config;
    } else {
      supabaseInstance = null;
    }
  }
  
  return supabaseInstance;
};

// Compatibility export for existing code
export const supabase = getSupabaseClient();

/**
 * Helper to check if Supabase is configured
 */
export const isSupabaseEnabled = () => !!getSupabaseClient();

export const checkSupabaseConnection = async () => {
  const client = getSupabaseClient();
  if (!client) return { connected: false, error: 'No configurado o URL inválida' };
  try {
    // Try to fetch a single row from users to verify connection and keys
    const { error } = await client.from('users').select('username').limit(1);
    if (error) {
      console.error('Supabase connection error:', error);
      return { connected: false, error: error.message };
    }
    return { connected: true, url: currentConfig.url };
  } catch (err: any) {
    console.error('Supabase connection exception:', err);
    return { connected: false, error: err.message || 'Error de red' };
  }
};

/**
 * SQL Schema for Supabase (Run this in Supabase SQL Editor):
 * 
 * -- Create users table
 * CREATE TABLE users (
 *   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 *   username TEXT UNIQUE NOT NULL,
 *   display_name TEXT,
 *   robux INTEGER DEFAULT 0,
 *   drovis INTEGER DEFAULT 0,
 *   rank TEXT DEFAULT 'Standard',
 *   avatar_config JSONB,
 *   settings JSONB,
 *   studio_map JSONB,
 *   created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
 * );
 * 
 * -- Create games table
 * CREATE TABLE games (
 *   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 *   title TEXT NOT NULL,
 *   creator TEXT NOT NULL,
 *   thumbnail TEXT,
 *   likes TEXT DEFAULT '0%',
 *   playing INTEGER DEFAULT 0,
 *   map_data JSONB,
 *   skybox TEXT DEFAULT 'Day',
 *   created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
 * );
 * 
 * -- Create assets table for uploads
 * CREATE TABLE assets (
 *   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 *   name TEXT NOT NULL,
 *   url TEXT NOT NULL,
 *   type TEXT,
 *   owner_id TEXT,
 *   created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
 * );
 * 
 * -- Create global_settings table
 * CREATE TABLE global_settings (
 *   id TEXT PRIMARY KEY DEFAULT 'main',
 *   global_avatar JSONB,
 *   global_avatar_replacement JSONB,
 *   updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
 * );
 * 
 * -- Create studio_data table
 * CREATE TABLE studio_data (
 *   username TEXT PRIMARY KEY,
 *   map_data JSONB,
 *   updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
 * );
 */
