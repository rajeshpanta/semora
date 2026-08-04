import { generateBlogOgImage, OG_SIZE } from '@/lib/og-image';

export const alt = "Canvas Doesn't Remind You Before Deadlines: Here's How to Fix That";
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image() {
  return generateBlogOgImage(alt);
}
