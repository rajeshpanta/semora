import { generateBlogOgImage, OG_SIZE } from '@/lib/og-image';

export const alt = 'The Pomodoro Technique Between Classes: A Real Schedule for College Students';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image() {
  return generateBlogOgImage(alt);
}
