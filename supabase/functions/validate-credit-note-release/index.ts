// Validation completed and fixtures removed. Permanently inert endpoint.
Deno.serve(() => new Response(JSON.stringify({error:'validation_completed'}), {status:410,headers:{'Content-Type':'application/json'}}));
