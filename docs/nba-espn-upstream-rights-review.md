# NBA ESPN upstream rights review (Phase 3E)

Reviewed 2026-10-18. This is an engineering rights assessment, **not legal advice**. Status: **blocked.** `espn` and `hoopr-espn` keep empty `permittedUses`; nothing was downloaded, called or trained.

## 1. The applicable terms

| Item | Record |
|---|---|
| Document | Disney Terms of Use - United States (header: "Disney Terms of Use - United States") |
| URL | https://disneytermsofuse.com/english/ (ESPN's support-center footer links to https://disneytermsofuse.com/ ) |
| Effective date | "Last Updated: May 24, 2024" |
| Scope | "THESE TERMS GOVERN YOUR USE OF THE DISNEY PRODUCTS IN GENERAL." Disney Products are "websites, software, applications, content, products, and services in any media format or channel", branded Disney, ABC, ESPN and others. ESPN has no separate definition and no ESPN-specific terms were found. |
| ESPN site notice | Footer: "All Rights Reserved", "(c) ESPN Internet Ventures" |

**Wording limits.** The page was read through a summarizing fetch tool that returns only short verbatim fragments. Quoted fragments below are exact; everything else is marked as paraphrase. Before anyone relies on this record, capture the full terms (print to PDF or an archive copy, dated) and compare.

| Section | What it says | Relevance |
|---|---|---|
| 2.A | Consumer license is "a limited, non-exclusive, non-sublicensable, non-transferable license", "for your personal, noncommercial use only" (paraphrase of the rest: US only, only while the product is offered; no reproducing, distributing or transforming it, expressly including AI or machine-learning purposes, with training, testing, benchmarking and validation named) | Binds users of ESPN products. Excludes commercial use and AI training/validation. |
| 2.B lead-in | "You agree that you will not nor permit another person to do any of the following without our express written permission" | The only exception route named is express written permission. |
| 2.B.viii | "use the Disney Products for any commercial or business-related use or build a business utilizing the Disney Products" (paraphrase of the rest: or enable others to, profit or not) | JKB is a commercial site. |
| 2.B.x | "access, monitor, copy or extract the Disney Products using a robot, spider, script, or other automated means" (paraphrase of the rest: includes AI tool development, data mining, web scraping and building datasets; exception only for public search-engine spiders obeying robots.txt and NOINDEX/NOFOLLOW) | A daily automated pipeline into ESPN data is squarely the described conduct. |
| 3.H | Heading: "Commercial, Marketing, or Branding Use Prohibited" (paraphrase: bars commercial uses unless Disney expressly licenses them) | Same direction as 2.B.viii. |
| 3.G | Paraphrase: products are for informational and entertainment purposes only | Tension with a betting-analysis product, though not a stated gambling rule. |

**Not found.** Any statement about sports scores or statistics as data; any gambling or betting provision; any ESPN developer or API terms; any data-licensing or syndication program (the support page links only privacy and terms pages). ESPN's robots.txt was not read.

## 2. Is a separate ESPN license or written permission needed?

Judged per intended use, on the terms above:

| JKB use | Direct access to ESPN by JKB | Downstream use of hoopR's CC BY files |
|---|---|---|
| Historical model training and validation | Needs ESPN express written permission (2.A names AI training and validation; 2.B.x) | **Unresolved** |
| Current-season updates | Same, and ongoing automated access is 2.B.x conduct | **Unresolved**; also depends on hoopR continuing its own collection |
| Public player-prop projections (derived, no raw data) | Commercial use: 2.B.viii and 3.H | **Unresolved**; derived outputs are lower exposure than raw files but still commercial and betting-related |
| Redistribution of raw rows | Not intended by JKB; would need explicit permission | Not intended; keep `raw-redistribution` unpermitted regardless |

## 3. Consumer restrictions versus authorized redistribution

- **Consumer access restrictions** (2.A, 2.B, 3.H) bind whoever uses ESPN's sites, apps or content. They are conditions of a personal, noncommercial license and name the remedies for automated collection and AI use.
- **Independently authorized redistribution** would be a separate grant from the rights holder: an ESPN written permission to SportsDataverse (the "express written permission" route in 2.B), a licensed data feed, or a legal conclusion that the facts themselves are free to reuse.
- **What the repository provides is not that.** `LICENSE.md` grants CC BY 4.0 over "data, code, and documentation" and is silent on ESPN. A licensor can license only what it holds, so the CC BY grant is evidence of hoopR's intent, not of ESPN's consent. It may rest on collection conduct the ESPN terms prohibit.
- **JKB's position if it only reads hoopR files** is different from a direct scraper's: JKB would not itself be using an ESPN product. That narrows, but does not remove, the risk: a rights holder's claims against the redistributor can affect continuity (takedown, deletions), and a claim of rights in the content or compilation can reach recipients. Box-score facts are widely treated as less protectable than creative content, but that is a question for counsel, and it is not established here.
- Logos, headshots and team imagery are separate assets and are out of scope for any use.

## 4. Recommended decision: remain blocked

Keep `espn` and `hoopr-espn` at empty `permittedUses`. The origin cap in `effectivePermittedUses` and the ingestion gate then refuse every use, including `private-research`.

**What written evidence would justify changing the gate** (any one, recorded with its date and a link or document id in the license `basis`):

1. **From SportsDataverse:** a statement by someone with authority that names the permission they hold from ESPN (an agreement, written consent or an applicable program), covering redistribution of the player box-score files, commercial use, and derived analytics. A statement that they "believe it is fine", or a restatement of the CC BY license, is not enough.
2. **From ESPN/Disney:** express written permission to JKB, or covering recipients of these files, for the intended uses (the 2.B route).
3. **From JKB's own counsel:** a written conclusion that using the hoopR files for historical validation and derived projections needs no ESPN license, with the residual risk accepted by you as a dated decision.

**What the change would be**, only after one of these and your explicit decision:
- `hoopr-espn`: grant exactly the uses the evidence supports, `private-research` first. `model-development` and `public-display` only if named. Never `raw-redistribution` unless the evidence says so.
- `espn`: the origin record must also permit those uses, citing the same document, or the origin cap will (correctly) still block them.

If SportsDataverse answers that it holds no ESPN authorization, evidence 1 is unavailable and only 2 or 3 remain. Either way, no download should happen before the decision.

**Practical alternatives while blocked:** the free API-NBA historical track (rights still to be confirmed), or a source whose terms explicitly cover the use (BALLDONTLIE ALL-STAR, at $9.99/month).

---

## 5. Proposed public GitHub issue (superseded: a shorter question was posted 2026-10-22 as hoopR-nba-data#24)

**Repository:** sportsdataverse/hoopR-nba-data
**Date:** 2026-10-18

**Title:** Licensing question: authority to license ESPN-derived NBA player box-score files for commercial predictive analytics

**Body:**

Hello SportsDataverse team, and thank you for maintaining these resources.

I'm developing Joe Knows Ball (https://www.joeknowsball.com), a sports analytics website that includes predictive models and betting-related analysis. We're evaluating the NBA player box-score data in this repository, particularly historical and current-season player minutes, points, rebounds and assists. Our intended use is to validate predictive models and publish derived statistical projections. We do not intend to redistribute the raw files. We have not downloaded or used the data and will not until we understand the licensing position.

What I observed on 2026-10-18:

- `LICENSE.md` states that the repository's data, code and documentation are licensed under Creative Commons Attribution 4.0 International (CC BY 4.0).
- The plain `LICENSE` file is a stub (year and copyright holder only), and GitHub does not detect a license automatically.
- The repository labels the data "source: ESPN".
- ESPN's terms (Disney Terms of Use - United States, last updated May 24, 2024, https://disneytermsofuse.com/english/) are restrictive for ESPN's own users. As I read them: section 2.A grants a personal, noncommercial license that excludes AI uses including training and validation; section 2.B bars commercial or business use and automated access or extraction (including data mining, scraping and dataset building) "without our express written permission"; section 3.H prohibits commercial use unless expressly licensed. I found no ESPN-specific terms about sports statistics or data licensing.

I understand that a downstream license cannot grant rights the licensor doesn't hold, and I'm not asking for legal advice. I'd like to understand what SportsDataverse can and cannot state. A clear "we cannot confirm the upstream rights" would also be a useful answer.

**Questions**

1. **License scope:** Is CC BY 4.0 intended to cover the NBA player box-score data files themselves, including the ESPN-derived records? Can you also clarify the relationship between `LICENSE.md` and the `LICENSE` stub?
2. **ESPN upstream rights:** Does SportsDataverse have authorization from ESPN (or The Walt Disney Company) to redistribute these datasets under CC BY 4.0, including for commercial use? Are there written permissions, agreements or applicable terms that establish those rights, and can you point to them?
3. **Predictive modeling and betting analytics:** Do the applicable upstream permissions allow historical model training, current-season updates, and publication of derived NBA player projections, including player-prop analysis on a public website? If you cannot speak for ESPN's terms, a statement to that effect would help.
4. **Attribution:** Beyond the CC BY requirements (credit, a license link, an indication of changes), do you recommend a specific citation or DOI? Should ESPN also be credited?
5. **Data documentation:** Is there a data dictionary for the player box-score fields, particularly minutes, did-not-play records and inactive players?
6. **Reproducibility and identifiers:** Are historical files immutable, or can corrections overwrite previously published data? Are ESPN game IDs and athlete IDs stable across seasons?

Any documentation you can link would be appreciated. I'm opening this as a public issue so the answer is visible to other users with the same question.

Thank you,
Joe Knows Ball
https://www.joeknowsball.com
