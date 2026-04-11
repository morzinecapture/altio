import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://vtybccqqbyjbmhkpliyn.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0eWJjY3FxYnlqYm1oa3BsaXluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzODMyMTQsImV4cCI6MjA4Nzk1OTIxNH0.pfO-UP1Qu81tNEz3-3gREaHvkzc3U9BK33XboYBk-KU');

async function run() {
    const { data, error } = await supabase.rpc('get_fkeys');
    // Wait, no rpc exists. I will use postgres via the CLI on the local if it was the same, but the user is remote!
    // How to check foreign keys remotely? I can only rely on what I know. What did the user execute when they created this table?
}
run();
