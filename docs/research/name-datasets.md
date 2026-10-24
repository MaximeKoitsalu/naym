# Open name datasets: gender, origin, meaning, pronunciation

Research for [#12](https://github.com/MaximeKoitsalu/naym/issues/12) (map [#11](https://github.com/MaximeKoitsalu/naym/issues/11)). Checked 2026-10-24.

## Answer

No open source matches today's hand-written cards. Our cards carry `say` (a respelling like "AH-strid") and `meaning` (often editorial, e.g. "pearl, small and certain of itself"). That richness is curation, and the curation is the product.

- **Gender usage** is easy to get, with clean licenses. Government birth registers give exact counts by sex. Wikidata types each given-name item as female, male or unisex (CC0).
- **Origin** is only weakly available. Wikidata's `language of work or name` (P407) records a language, not a cultural origin.
- **Meaning** has no openly licensed, structured source of any quality. Behind the Name has the best meanings, but they are copyrighted and reuse needs permission. Wiktionary etymologies are CC BY-SA and patchy.
- **Pronunciation** is scarce. Wikidata IPA appears on 17 of our 250 names. Wiktionary has IPA for some languages, under CC BY-SA. Nothing open gives English-reader respellings like our `say` field.

## Per-source findings

| Source | Gives | License / commercial use | Coverage and size | Access |
|---|---|---|---|---|
| **US SSA baby names** | name, sex, count per year (national and per state) | CC0 on data.gov ([catalog](https://catalog.data.gov/dataset/baby-names-from-social-security-card-applications-national-data)) | US from 1880. A name must occur at least 5 times to be listed ([background](https://www.ssa.gov/oact/babynames/background.html)). Spelling variants are separate names. | Bulk zip, `names.zip`, about 8 MB ([limits page](https://www.ssa.gov/oact/babynames/limits.html)) |
| **UK ONS baby names, England and Wales** | name, sex, rank, count | OGL v3: commercial use allowed, attribution required ([dataset](https://www.ons.gov.uk/peoplepopulationandcommunity/birthsdeathsandmarriages/livebirths/datasets/babynamesinenglandandwalesfrom1996), [OGL](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/)) | England and Wales, 1996–2025 | XLSX download |
| **INSEE Fichier des prénoms** | SEXE, PRENOM, year, count (rounded to 5), department and region | Licence Ouverte 2.0: commercial reuse free, cite "Source : Insee" and the update date ([legal notice](https://www.insee.fr/fr/information/2008466)) | France, 1900–2025. The name list keeps names given at least 3 times since 1900 ([file](https://www.insee.fr/fr/statistiques/8595130)). | CSV and Parquet |
| **Statistics Norway (SSB), table 10501** | persons by girls' and boys' name | CC BY 4.0 for site content, commercial use allowed ([license](https://www.ssb.no/en/diverse/lisens)). The page doesn't say the license covers StatBank tables; a [data.norge.no entry](https://data.norge.no/en/datasets/e74957b7-d052-4d93-9afb-4a2fce65882f) lists StatBank as CC BY 4.0. | Norway, 2013–2025. Only names with 200 or more bearers ([table](https://www.ssb.no/en/statbank1/table/10501/)). | StatBank, with JSON API and CSV |
| **Statistics Sweden (SCB)** | first names by sex, newborns and population | No license stated on the page | Discontinued in 2024: the releases are archived and Skatteverket now runs name search ([SCB](https://www.scb.se/en/finding-statistics/sverige-i-siffror/namesearch/)) | Excel and web tables |
| **Statistics Denmark (DST)** | first names by sex, population and newborns | Not found | Not in StatBank; microdata only for researchers ([access](https://www.dst.dk/da/Statistik/dokumentation/statistikdokumentation/navne/tilgaengelighed)) | Not practical |
| **Finland DVV** "Finnish names" | first names by sex (DVV population register) | CC BY 4.0 per the avoindata.suomi.fi listing (seen in search results only; the page returned 403 to the fetch) | Finland | Open-data portal download |
| **Wikidata** given-name items | gender as item type (female Q11879590, male Q12308941, unisex Q3409032), P407 language, P282 script, P443 audio, rare P898 IPA, P460 "said to be the same as", P4284 Behind the Name ID | **CC0** for all structured data ([licensing](https://www.wikidata.org/wiki/Wikidata:Licensing)) | Global, uneven | SPARQL (query.wikidata.org), dumps, REST |
| **Wiktionary** | gender ("a female given name"), etymology, some IPA. For example, Nynorsk "Astrid" gives the Proto-Germanic roots for "god" and "beautiful" ([entry](https://en.wiktionary.org/wiki/Astrid)) | CC BY-SA 4.0: share-alike would apply to our deck data | Global, inconsistent from one language section to the next | Dumps; parsing needed (e.g. a Wiktextract-style dump) |
| **Behind the Name** | best-quality meaning, usage (origin) and gender | Site content is © Mike Campbell. No republishing, copying or scraping without permission; a few definitions with a link back are allowed ([copyright](https://www.behindthename.com/info/copyright), [terms](https://www.behindthename.com/info/terms)). The downloadable data files are CC BY-SA 4.0 ([API page](https://www.behindthename.com/api/)) but cover names with genders, related names and ratings, not meanings. The download form has a CAPTCHA ([download](https://www.behindthename.com/api/download.php)). | Global, curated, high quality | API (gender and usage, plus random name and related names). Free with a key; limits 2/s, 400/h, 4,000/day. Commercial terms unstated. |

## Measured: Wikidata against our 250 deck names

I queried SPARQL by exact English label plus the given-name item types:

- **247 of 250 matched.** Missing: Elektra, Hjalmar, Noemi.
- Types found: 116 F only, 117 M only, 7 U only, plus 7 names with several types: Aris (M,U), Jonas (M,U), Luca (F,M,U), Leni (F,M), Nico (M,U), Romy (F,M), Pierre (M,U).
- IPA (P898): 17. Pronunciation audio (P443, Commons files with per-file licenses): 152. Behind the Name ID: 117.
- Caveat: Wikidata often splits one spelling into separate items per gender and language. Andrea, for example, has unisex, male and female items. The *set* of types is the signal, and it is not regional: it can't say that Andrea is male in Italy and female in Germany. National registers can, through per-country sex ratios.

## Recommendations

**1. Gender-tag the ~250 curated names now: hand-tag, machine-checked.**
Run a one-off script that proposes a tag from the Wikidata item types (CC0, no attribution needed). Then put a human eye on the exceptions: the 7 multi-typed names, the 3 misses, and any name whose deck region implies a different usage (check against that country's register sex ratio, e.g. INSEE for French names, SSB for Nordic). The register data is only a cross-check and none of it ships, so its license doesn't matter. Store the tag in the deck JSON as a new field. Deck pinning (invariant 4) means live sessions keep their old snapshot.

**2. Wider catalog with random draws: registers for the name pool and gender, curation for the card face.**
- Build the pool from national registers: SSA (CC0), INSEE (Licence Ouverte), ONS (OGL), SSB and DVV (CC BY 4.0). They give popularity, which keeps random draws sensible, plus regional sex ratios for gender. Attribution lines are needed for all except SSA.
- Use Wikidata (CC0) for unisex hints, script and audio links. Never treat P407 as "origin" without review.
- Meaning and `say` cannot be sourced openly at any useful quality. Either launch wider-catalog cards without them (name, gender, region only), or write them ourselves, LLM-drafted and human-reviewed, for names that make a curated deck. Avoid Wiktionary text in shipped data unless the deck data is acceptable under CC BY-SA. Behind the Name meanings need a written licence from its owner.

## Not verified

- SSA and Finland DVV pages returned 403 to the fetcher. SSA facts come from the data.gov catalog and the SSA background page via search snippets; DVV facts come from the portal listing in search results.
- Whether SSB's CC BY 4.0 explicitly covers StatBank tables, not just site content.
- Behind the Name download file columns (download is behind a CAPTCHA; not attempted).
- The Wikidata match is by English label only; I did not check per name that the matched item is the intended name.
