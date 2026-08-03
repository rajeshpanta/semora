import { generateBlogOgImage, OG_SIZE } from '@/lib/og-image';

export const alt = 'Best Apps for Tracking College Deadlines in 2026';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image() {
  return generateBlogOgImage(alt);
}
