import { supabase } from '@/lib/supabase';

const STORAGE_BUCKETS = ['syllabi', 'course-notes'] as const;
const LIST_PAGE_SIZE = 100;
const REMOVE_BATCH_SIZE = 100;

async function listFilesRecursively(bucket: string, folder: string): Promise<string[]> {
  const files: string[] = [];

  for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(folder, { limit: LIST_PAGE_SIZE, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw error;

    for (const entry of data ?? []) {
      const path = `${folder}/${entry.name}`;
      if (entry.id) {
        files.push(path);
      } else {
        // Storage returns folders as entries without an object id. Current
        // uploads are flat, but recursion prevents future nested files from
        // becoming orphaned when an account is deleted.
        files.push(...await listFilesRecursively(bucket, path));
      }
    }

    if (!data || data.length < LIST_PAGE_SIZE) break;
  }

  return files;
}

/** Remove all private uploads while the user's authenticated RLS still applies. */
export async function deleteAccountStorage(userId: string) {
  for (const bucket of STORAGE_BUCKETS) {
    const paths = await listFilesRecursively(bucket, userId);
    for (let index = 0; index < paths.length; index += REMOVE_BATCH_SIZE) {
      const { error } = await supabase.storage
        .from(bucket)
        .remove(paths.slice(index, index + REMOVE_BATCH_SIZE));
      if (error) throw error;
    }
  }
}
