import { generateBlogOgImage, OG_SIZE } from '@/lib/og-image';

export const alt = 'How to Calculate a Weighted GPA (With Real Examples)';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image() {
  return generateBlogOgImage(alt);
}
