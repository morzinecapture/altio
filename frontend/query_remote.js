import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://vtybccqqbyjbmhkpliyn.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0eWJjY3FxYnlqYm1oa3BsaXluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzODMyMTQsImV4cCI6MjA4Nzk1OTIxNH0.pfO-UP1Qu81tNEz3-3gREaHvkzc3U9BK33XboYBk-KU');

async function run() {
    const { data: props, error: e1 } = await supabase.from('properties').select('*');
    console.log('Properties:', props?.length ? props : e1);

    const { data: profs, error: e2 } = await supabase.from('provider_profiles').select('*');
    console.log('Profiles:', profs?.length ? profs : e2);

    const { data: ems, error: e3 } = await supabase.from('emergency_requests').select('*');
    console.log('Emergencies:', ems?.length ? ems : e3);

    const { data: users, error: e4 } = await supabase.from('users').select('id, name, email');
    console.log('Users:', users?.length ? users : e4);
}
run();
