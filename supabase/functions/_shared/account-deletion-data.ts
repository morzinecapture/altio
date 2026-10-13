type Database = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{data: any; error: unknown}>;
  auth: {admin: {deleteUser: (id: string) => PromiseLike<{error: unknown}>}} };

export async function assertAccountDeletionReady(db: Database, userId: string) {
  const {data,error}=await db.rpc('check_account_deletion',{p_user_id:userId});
  if(error || data?.protocol!==1 || typeof data?.ready!=='boolean') {
    throw new Error('La suppression est momentanément indisponible. Votre compte est conservé.');
  }
  if(!data.ready) {
    throw new Error('La suppression de ce compte nécessite encore le traitement de ses données liées. Aucune donnée n’a été supprimée.');
  }
}

export async function deleteAccountAtomically(db: Database, userId: string) {
  // No table or storage mutation before Auth. The database trigger repeats the
  // prerequisite checks inside the same transaction as the Auth FK cascade.
  await assertAccountDeletionReady(db,userId);
  const {error}=await db.auth.admin.deleteUser(userId);
  if(error) throw new Error('La suppression n’a pas abouti. Réessayez dans quelques instants.');
  return {success:true as const};
}
