

# Flexibility Check: External Landing Pages → Checkout

The current implementation is already fully flexible for any external site (Framer, Webflow, HTML/CSS, WordPress, etc.).

## How it works today

The checkout page is simply a URL: `/checkout/:slug`

Any external site just needs to link to it — e.g. `https://levelup-india-spark.lovable.app/checkout/my-course-slug`. There are no Framer-specific integrations, no SDK dependencies, no special embed logic. It's a plain URL route that:

1. Loads the course by slug from the database
2. Shows the course summary card
3. Prompts sign-up/login if unauthenticated
4. Auto-enrolls and redirects to the dashboard

This works identically whether the link comes from Framer, Webflow, a static HTML page, a social media bio link, a QR code, or an email campaign.

## No changes needed

The architecture is already platform-agnostic. No modifications required.

