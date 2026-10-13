/** Call only AFTER auth.getUser(token) has verified the signed token. */
export async function requireActiveSession(db: {rpc: (name: string,args: Record<string,string>) => PromiseLike<{data: unknown;error: unknown}>}, verifiedUserId: string, verifiedToken: string) {
  let sessionId: string;
  try {
    const parts=verifiedToken.split('.');
    if(parts.length!==3 || parts[1].length>32768) throw new Error();
    const encoded=parts[1].replace(/-/g,'+').replace(/_/g,'/');
    const claims=JSON.parse(atob(encoded+'='.repeat((4-encoded.length%4)%4)));
    if(claims.sub!==verifiedUserId || typeof claims.session_id!=='string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(claims.session_id)) throw new Error();
    sessionId=claims.session_id;
  } catch {throw new Error('Session inactive. Reconnectez-vous.');}
  const {data,error}=await db.rpc('is_auth_session_active',{p_user_id:verifiedUserId,p_session_id:sessionId});
  if(error || data!==true) throw new Error('Session inactive. Reconnectez-vous.');
}
