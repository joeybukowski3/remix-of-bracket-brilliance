# JoeKnowsBall SEO Audit Checklist

## Canonical URL Policy

- Preferred protocol: `https`
- Preferred host: `www.joeknowsball.com`
- Preferred path format: lowercase, no trailing slash except `/`
- Canonical tags must point directly to the final preferred URL
- Internal links should point to canonical URLs, not redirecting aliases
- Sitemap should list only canonical URLs that return `200`

## Indexable Page Rules

Index these page types:

- `/`
- `/mlb`
- `/ncaa`
- `/ncaa/schedule`
- `/ncaa/matchup`
- `/ncaa/betting-edge`
- `/ncaa/bracket`
- featured PGA tournament picks page
- `/pga/model`
- evergreen PGA content pages intended for search

Do not index these page types unless there is a deliberate SEO decision:

- `/ncaa/schedule/:gameId`
- `/team/:teamId`
- `/ncaa/matchup/:matchupId`
- `/pga/:tournamentSlug/model/table`
- sample or scaffold PGA tournament pages
- 404 pages

## Redirect Rules

- Non-`www` host must redirect permanently to `https://www.joeknowsball.com`
- `/rankings` should redirect permanently to `/ncaa`
- Legacy NCAA root routes should redirect permanently to `/ncaa/...`
- Legacy PGA aliases should redirect to `/pga/...`
- `/pga/rbc-heritage-2026-picks/model` should redirect permanently to `/pga/model`
- `/pga` should redirect permanently to the featured tournament picks route
- Old content aliases must redirect to the closest live replacement, not the homepage unless there is no better fit

## Sitemap Rules

- Include only canonical URLs
- Exclude redirects
- Exclude noindex pages
- Exclude 404 pages
- Exclude dev, localhost, and test-only URLs
- Exclude sample PGA tournament scaffolds unless they are explicitly meant to rank

## Metadata Rules

Every indexable page should have:

- one H1
- unique `<title>`
- unique meta description
- self-canonical
- crawlable robots directive

Every non-indexable page should have:

- `noindex, follow`
- a canonical matching its real route

## Internal Linking Rules

- Homepage should link directly to live sport hubs and the featured PGA tournament page
- PGA pages should link directly between picks and the correct model route
- NCAA internal links should use `/ncaa/...` canonicals, not root aliases
- Do not link internally to redirecting URLs
- Do not link internally to known dead URLs

## PGA Publish Checklist

Before publishing a new PGA tournament page:

1. Confirm the picks page route returns `200`
2. Confirm `/pga/model` returns `200`
3. Confirm both pages self-canonicalize
4. Confirm the page is linked from a crawlable hub or homepage module
5. Confirm the page is included in the sitemap only if it should be indexed
6. Confirm sample or placeholder tournaments are marked `noindex`
7. Confirm the featured slug-model alias redirects to `/pga/model`
8. Confirm Search Console URL Inspection is ready after deploy

## Post-Deploy Verification

Check these first after every SEO-sensitive deploy:

- `/`
- `/mlb`
- `/ncaa`
- `/ncaa/schedule`
- `/ncaa/matchup`
- `/ncaa/betting-edge`
- `/ncaa/bracket`
- `/pga/model`
- featured PGA picks page
- `/robots.txt`
- `/sitemap.xml`
