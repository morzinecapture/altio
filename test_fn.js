import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://vtybccqqbyjbmhkpliyn.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0eWJjY3FxYnlqYm1oa3BsaXluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzODMyMTQsImV4cCI6MjA4Nzk1OTIxNH0.pfO-UP1Qu81tNEz3-3gREaHvkzc3U9BK33XboYBk-KU');

async function run() {
    const { data, error } = await supabase.functions.invoke('create-payment-intent', {
        body: { amount: 16500, captureMethod: 'automatic' }
    });
    console.log('Result:', data);
    console.log('Error:', error);
}

run();
