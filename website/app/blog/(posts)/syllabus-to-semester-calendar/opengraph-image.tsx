import { generateBlogOgImage, OG_SIZE } from '@/lib/og-image';

export const alt = 'How to Turn a Syllabus Into a Semester Calendar';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image() {
  return generateBlogOgImage(alt);
}
