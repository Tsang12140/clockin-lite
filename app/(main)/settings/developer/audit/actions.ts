'use server';

import { updateAuditFingerprintNote } from '@/lib/audit';
import { requireAuth } from '@/lib/requireAuth';
import { revalidatePath } from 'next/cache';

export async function saveAuditNote(formData: FormData) {
  await requireAuth();
  const id = String(formData.get('id') ?? '');
  const note = String(formData.get('note') ?? '');
  if (!id) return;
  await updateAuditFingerprintNote(id, note);
  revalidatePath('/settings/developer/audit');
}
