# Search visibility

The public site is https://tld.henhau.online/. All changes in this guide need to
be deployed before Google can see them; a local preview does not update Search.

## What the application provides

- A canonical page and descriptive title for the world map, every region and the
  Interloper loot tables. Singular/plural and TLD/The Long Dark searches share
  these pages rather than duplicating content across keyword-specific routes.
- Region-specific image descriptions that identify the map variant where there
  are separate images. Full-resolution images are included in `/sitemap.xml`.
- No additional on-page descriptions, landmarks, headings or disclosures. The
  map interface is unchanged; the owner chose to keep visible SEO content out.
- Fast, small initial map previews, with the full-resolution image loaded after
  the preview. Existing content-hashed image URLs stay stable across this update
  so returning users keep their cached maps.
- A `/robots.txt` that advertises the sitemap. Notes, chat and admin pages remain
  `noindex` and are excluded from the sitemap. Account data stays behind the API.

Image and search descriptions use public map labels, never private notes.
Map attribution remains in **Map credits & sources** and
[third-party notices](../THIRD_PARTY_NOTICES.md).

## Google Search Console

This step needs the owner's Google account. It cannot be completed by committing code.

1. Open [Search Console](https://search.google.com/search-console) and sign in.
2. Add a **URL prefix** property for `https://tld.henhau.online/`, or select it if
   it already exists. If `henhau.online` is already verified as a Domain property,
   that property also covers this subdomain.
3. Verify ownership using Google's offered method. DNS verification avoids an app
   deployment: add the exact TXT record Google supplies at your DNS provider.
   Keep that verification record after verification succeeds.
4. Alternatively, choose **HTML tag** and copy only the `content` value from the
   `google-site-verification` tag. The app supports it via the optional
   `GOOGLE_SITE_VERIFICATION` Docker build argument (or environment variable for
   a local build). In Dokploy, supply this build argument, rebuild/deploy, check
   the tag in the homepage source, then click **Verify**. Do not paste the entire
   HTML tag as the value. The token is public; never use a password or API secret.
5. In **Sitemaps**, submit `https://tld.henhau.online/sitemap.xml`. It contains both
   normal page entries and full-resolution map images, so a second image sitemap
   is unnecessary.
6. After deploying the SEO changes, use **URL inspection → Test live URL** for:
   - `https://tld.henhau.online/`
   - `https://tld.henhau.online/maps/mystery-lake`
   - `https://tld.henhau.online/loot-tables`
7. Confirm that Google can fetch each page and that the canonical URL is correct.
   Request indexing once for these pages. Submission does not guarantee inclusion
   or a ranking, and repeated requests do not speed up crawling.

Keep `SITE_URL=https://tld.henhau.online` in the production build and runtime.
Self-hosted/offline installations should use their own origin, as documented in
the deployment guides; do not point their canonical URLs at a local preview.

## Measure results

Use **Performance → Search results** to watch impressions, clicks, click-through
rate and average position by page and query. Compare consecutive 28-day periods
once enough data has accumulated. Filter separately for map searches, region
names and loot tables. Check **Page indexing** for unexpected exclusions; private
notes, chat and admin being excluded is intentional.

Also review Search Console's Core Web Vitals report when enough field data is
available, and use [PageSpeed Insights](https://pagespeed.web.dev/) for the home,
Mystery Lake and loot-table URLs after deployment. Lack of field data on a new
site is not itself an error. Preserve fast map previews when making future changes.

## Relevant community links

The README links prominently to the live maps and loot tables. Publishing that
change still needs a GitHub push. Links from other sites have to be earned or
added by their owners; the app cannot create them automatically.

When a community allows sharing tools, share a useful example or ask a relevant
resource maintainer whether the atlas fits their list. Attribute the original
map and loot creators, follow each community's rules, and avoid bulk posts,
purchased links or link exchanges. No outreach has been sent as part of this change.

A short description to adapt for a relevant resource listing:

> The Long Dark interactive maps by henhau: region maps with private notes,
> drawings and markers per survival run, plus Bashrobe's Interloper loot tables
> with set tracking. Guest mode, optional accounts and portable run files.
> https://tld.henhau.online/

## References

- [Google: title links](https://developers.google.com/search/docs/appearance/title-link)
- [Google: image SEO](https://developers.google.com/search/docs/appearance/google-images)
- [Google: image sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/image-sitemaps)
- [Google: request recrawling](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl)
- [Google: helpful content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
