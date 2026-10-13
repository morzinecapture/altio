import { mockSupabaseClient, resetAllMocks } from '../../__test-utils__/supabase-mock';
import { signMissionPhoto, signEmergencyPhotos } from '../private-photos';
jest.mock('../../lib/supabase', () => ({ supabase: jest.requireActual('../../__test-utils__/supabase-mock').mockSupabaseClient }));
jest.mock('../../sentry', () => ({ captureError: jest.fn() }));
beforeEach(resetAllMocks);
test('legacy public mission photo URLs are resolved as private object paths', async () => {
  const signed = await signMissionPhoto({photo_url:'https://example.supabase.co/storage/v1/object/public/mission_proofs/mission/provider/photo.jpg',uploaded_at:'now'});
  expect(signed.photo_url).toBe('https://test.supabase.co/storage/signed/test');
  expect(signed.uploaded_at).toBe('now');
  expect(mockSupabaseClient.storage.from).toHaveBeenCalledWith('mission_proofs');
});
test('a failed signature does not expose a public URL fallback', async () => {
  mockSupabaseClient.storage.from.mockReturnValueOnce({createSignedUrl:jest.fn().mockResolvedValue({data:null,error:new Error('Denied')})} as never);
  await expect(signMissionPhoto({photo_url:'mission/provider/photo.jpg'})).resolves.toEqual({photo_url:''});
});

test('emergency attachments are signed from their private bucket', async () => {
  const request = await signEmergencyPhotos({ id: 'demo', photos: ['https://test.supabase.co/storage/v1/object/public/emergency-photos/owner/emergency_1.jpg'] });
  expect(request.id).toBe('demo');
  expect(request.photos).toEqual(['https://test.supabase.co/storage/signed/test']);
  expect(mockSupabaseClient.storage.from).toHaveBeenCalledWith('emergency-photos');
});
test('unknown public emergency attachments are hidden', async () => {
  const request = await signEmergencyPhotos({ photos: ['https://example.com/public.jpg'] });
  expect(request.photos).toEqual([]);
  expect(mockSupabaseClient.storage.from).not.toHaveBeenCalled();
});
