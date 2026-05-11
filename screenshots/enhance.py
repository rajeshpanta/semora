"""
Enhance App Store screenshot scaffolds using Gemini Imagen 4.0.
Uses edit_image-style workflow: scaffold in, enhanced image out.
"""
from google import genai
from google.genai import types
from PIL import Image
import sys, os, io, time

API_KEY = os.environ.get("GEMINI_API_KEY")
if not API_KEY:
    sys.exit("GEMINI_API_KEY env var is required. Export it before running this script — never hardcode the key here. (The previous hardcoded key was auto-revoked by Google after it was pushed to GitHub.)")
client = genai.Client(api_key=API_KEY)

SCREENSHOTS = [
    {
        "slug": "01-scan-your-syllabus",
        "verb": "SCAN",
        "desc": "YOUR SYLLABUS",
        "benefit": "Snap a photo or upload a PDF and AI extracts every deadline instantly",
    },
    {
        "slug": "02-never-miss-a-deadline",
        "verb": "NEVER MISS",
        "desc": "A DEADLINE",
        "benefit": "See overdue tasks, today's due items, and your weekly workload at a glance",
    },
    {
        "slug": "03-track-your-grades",
        "verb": "TRACK",
        "desc": "YOUR GRADES",
        "benefit": "Live grade percentage and letter grade with progress tracking",
    },
    {
        "slug": "04-plan-your-semester",
        "verb": "PLAN",
        "desc": "YOUR SEMESTER",
        "benefit": "Month calendar view with color-coded course deadlines",
    },
    {
        "slug": "05-go-pro",
        "verb": "GO",
        "desc": "PRO",
        "benefit": "Unlimited scans, grade forecasts, advanced reminders, and calendar sync",
    },
]

BASE_DIR = "/Users/smile/Desktop/SyllabusSnap/screenshots"

PROMPT_TEMPLATE = """A professional, polished App Store screenshot for an iPhone app.
The image has a solid purple (#6B46C1) background. At the top, large bold white text reads "{verb}" on the first line and "{desc}" on the second line in a heavy sans-serif font.
Below the text is a photorealistic modern iPhone with dynamic island, showing an app screen about {benefit}.
The phone has a subtle drop shadow giving it depth and a premium floating effect.
The bottom of the phone bleeds off the canvas edge.
Clean, minimal, professional App Store listing style. No gradients, no extra text, no watermarks."""


def enhance_screenshot(slug, verb, desc, benefit, version):
    output_path = os.path.join(BASE_DIR, slug, f"v{version}.png")

    if os.path.exists(output_path):
        print(f"  Skipping {slug} v{version} (already exists)")
        return True

    print(f"  Generating {slug} v{version}...")

    try:
        prompt = PROMPT_TEMPLATE.format(verb=verb, desc=desc, benefit=benefit)

        # Use Imagen 4.0 for generation
        result = client.models.generate_images(
            model="imagen-4.0-generate-001",
            prompt=prompt,
            config=types.GenerateImagesConfig(
                number_of_images=1,
                aspect_ratio="9:16",
                output_mime_type="image/png",
            ),
        )

        if result.generated_images:
            img_data = result.generated_images[0].image.image_bytes
            img = Image.open(io.BytesIO(img_data))
            # Resize to exact App Store dimensions
            img = img.resize((1290, 2796), Image.LANCZOS)
            img.save(output_path, "PNG")
            print(f"  ✓ {output_path} ({img.size[0]}x{img.size[1]})")
            return True
        else:
            print(f"  ✗ {slug} v{version}: No images returned")
            return False

    except Exception as e:
        print(f"  ✗ {slug} v{version}: {e}")
        return False


def main():
    target = sys.argv[1] if len(sys.argv) > 1 else "all"
    versions = int(sys.argv[2]) if len(sys.argv) > 2 else 3

    for ss in SCREENSHOTS:
        if target != "all" and ss["slug"] != target:
            continue

        print(f"\n{'='*50}")
        print(f"Processing: {ss['verb']} {ss['desc']}")
        print(f"{'='*50}")

        for v in range(1, versions + 1):
            success = enhance_screenshot(
                ss["slug"], ss["verb"], ss["desc"], ss["benefit"], v
            )
            if not success:
                print(f"  Retrying in 5s...")
                time.sleep(5)
                enhance_screenshot(
                    ss["slug"], ss["verb"], ss["desc"], ss["benefit"], v
                )
            time.sleep(2)

    print("\nDone!")


if __name__ == "__main__":
    main()
