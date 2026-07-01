# Wordly vocabulary website

A fast, responsive, dependency-free flash-card website for English vocabulary.

## Word data

The complete browser-ready library is stored in `words.json` and generated from
`word-data.csv`. After changing the CSV, rebuild the JSON file with:

```powershell
node build-words.mjs
```

The generator preserves every valid CSV row, including alternate meanings for the
same spelling. The JSON uses a compact array format, while the site uses progressive
rendering so the full 1,000+ entry library remains responsive.

## Preview locally

From this folder, run:

```powershell
python -m http.server 4173
```

Then open `http://127.0.0.1:4173/`.

## Before publishing

Replace `https://example.com/` in `index.html`, `robots.txt`, and `sitemap.xml` with the final website address. Upload the complete folder to any static host such as Netlify, Cloudflare Pages, GitHub Pages, or traditional web hosting.

## Included features

- Audio pronunciation using the browser's built-in speech engine
- Flash-card reveal, next/previous, shuffle, swipe, and keyboard controls
- Search across words, definitions, examples, grammar types, and synonyms
- Noun, pronoun, verb, adjective, and adverb filters
- Saved words and learned progress stored on the user's device
- Responsive mobile, tablet, and desktop layouts
- Dark theme, accessible labels, reduced-motion support, and keyboard navigation
- SEO metadata, Open Graph image, structured data, sitemap, robots file, and semantic HTML
- Offline support after the first visit
