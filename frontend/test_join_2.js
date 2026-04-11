import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://vtybccqqbyjbmhkpliyn.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0eWJjY3FxYnlqYm1oa3BsaXluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzODMyMTQsImV4cCI6MjA4Nzk1OTIxNH0.pfO-UP1Qu81tNEz3-3gREaHvkzc3U9BK33XboYBk-KU');

async function run() {
    const { data: bids1, error: e1 } = await supabase
        .from('emergency_bids')
        .select('*, provider:users(*)')
        .limit(1);
    console.log('users(*):', e1?.message || bids1);

    const { data: bids2, error: e2 } = await supabase
        .from('emergency_bids')
        .select('*, users(*)')
        .limit(1);
    console.log('users(*):', e2?.message || bids2);
}
run();
