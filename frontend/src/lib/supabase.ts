import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Profile = {
  id: string;
  name: string;
  company: string;
  created_at: string;
};

export type Document = {
  id: string;
  user_id: string;
  file_path: string;
  processed: boolean;
  created_at: string;
};

export type ChatMessage = {
  id: string;
  type: 'user' | 'bot';
  content: string;
  timestamp: string;
  images?: Array<{
    url: string;
    caption: string;
    page_number: number;
  }>;
};
