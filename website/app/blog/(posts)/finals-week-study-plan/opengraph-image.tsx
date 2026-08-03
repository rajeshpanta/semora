import { generateBlogOgImage, OG_SIZE } from '@/lib/og-image';

export const alt = 'How to Build a Study Plan for Finals Week';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image() {
  return generateBlogOgImage(alt);
}
