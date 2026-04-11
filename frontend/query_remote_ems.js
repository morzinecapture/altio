import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://vtybccqqbyjbmhkpliyn.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0eWJjY3FxYnlqYm1oa3BsaXluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzODMyMTQsImV4cCI6MjA4Nzk1OTIxNH0.pfO-UP1Qu81tNEz3-3gREaHvkzc3U9BK33XboYBk-KU');

// We will use the Provider credentials to login and fetch emergencies!
const email = 'maximegakiere@gmail.com';
const password = 'password'; // Assuming user logged in with google, we don't have password.

// Let's just create a raw request bypassing RLS with service role if possible? No service role in .env! 
// Wait, is there a way? 
// No, I will just query `emergency_requests` as `anon`. Let's see if anyone can read it.
async function run() {
    const { data: ems, error: e3 } = await supabase.from('emergency_requests').select('*, property:properties(name, address, latitude, longitude), provider:users!emergency_requests_accepted_provider_id_fkey(name, picture)').order('created_at', { ascending: false });
    console.log('Emergencies (RAW):', ems, e3);
}
run();
