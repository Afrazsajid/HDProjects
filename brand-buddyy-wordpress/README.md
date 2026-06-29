# Brand Buddyy WordPress Theme

Custom classic WordPress theme converted from the `brand-buddyy-exact` static homepage.

## Requirements

- WordPress 6.4 or newer
- PHP 8.0 or newer
- Advanced Custom Fields (free)

The free ACF plugin is sufficient. The theme uses fixed, clearly labelled item
panels instead of Pro-only repeater fields.

## Installation

1. Copy the `brand-buddyy-wordpress` folder into `wp-content/themes/`.
2. Install and activate the free **Advanced Custom Fields** plugin.
3. Activate **Brand Buddyy** in Appearance → Themes.
4. Create a page named **Home** and choose it under Settings → Reading as the
   static homepage.
5. Create a page named **Insights** (or Blog) and choose it as the posts page.
6. Edit the Home page to access the section-by-section ACF tabs.
7. Open Appearance → Menus and assign:
   - Primary Menu
   - Mobile Menu (optional; the primary menu is used as fallback)
   - Footer Quick Navigation
   - Footer Pages
   - Footer Legal Menu
8. Open Appearance → Customize → Site Identity to upload the logo and site icon.
9. Open **Appearance → Customize → Brand Buddyy Settings** to edit:
   - Header CTA
   - Public and form-recipient email addresses
   - Footer content and background
   - Social media links
10. Add featured images, categories, excerpts, and content to posts. The latest
    two posts automatically populate the homepage insights section.

## Homepage editing

The homepage fields are grouped in visual order:

1. Hero
2. About
3. Capabilities
4. Marquee and benefits
5. Partner composition
6. Services
7. Solutions / work
8. Primary CTA
9. Principles / testimonials
10. Engagement models
11. Process
12. FAQs
13. Contact
14. Insights

Existing Brand Buddyy copy is loaded into unsaved ACF fields as the initial
value, so editors can see and change the current content immediately. Images,
links, lists, service cards, solution cards, testimonials, engagement models,
process cards, and FAQs are editable in fixed numbered panels.

The fixed editor provides:

- 3 about features
- 4 capability cards
- 3 benefit cards
- 6 partner logos
- 4 services
- 4 solutions/projects
- 4 testimonials
- 3 engagement models
- 3 process steps
- 15 FAQs
- 8 advanced overrides

The Advanced Overrides tab can target an individual preserved design element
that is not exposed by the main fields.

## Forms

The contact and newsletter forms submit through WordPress `admin-post.php`,
validate nonces, sanitize user input, and send with `wp_mail()`.

For reliable delivery on production hosting, configure an SMTP plugin or a
transactional email provider.

## Design and animation notes

- The original Avista-derived class names and section markup are preserved to
  retain the exact layout and responsive CSS.
- GSAP, ScrollTrigger, SplitText, Lenis, WOW, Swiper, odometer, marquee, popup,
  magnetic button, and cursor dependencies are loaded locally.
- The original Inter, Geist Mono, and Mona Sans fonts are self-hosted.
- Captured GSAP pin wrappers are reset before the animation system initializes,
  preventing saved scroll positions from distorting the WordPress render.
- `prefers-reduced-motion` is respected by the theme stylesheet.

## Templates

- `front-page.php` — exact editable homepage
- `home.php` — posts archive
- `single.php` — premium article layout and related posts
- `archive.php` — category, tag, author, and date archives
- `search.php` — search results
- `page.php` — normal WordPress pages
- `404.php` — not-found page

## Verification performed

- All 36 PHP files parsed successfully with a PHP AST parser.
- All custom JavaScript files pass `node --check`.
- All static section image paths were checked against local theme assets.
- The original remote-only backgrounds and fonts were downloaded and localized.
