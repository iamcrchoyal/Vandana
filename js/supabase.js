// js/supabase.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const supabaseUrl = 'https://prfdqzhpxuewmarutmyf.supabase.co';
const supabaseKey = 'sb_publishable_RhD0daGsqYeMkc8waqqfLQ_Xbi7wXUH';

// Supabase Connection Export
export const supabase = createClient(supabaseUrl, supabaseKey);

// Global Access (ताकि पुराने फंक्शन्स बिना एरर के काम करें)
window.supabaseClient = supabase;
window.db = supabase;
window.auth = supabase.auth;
window.storage = supabase.storage;
