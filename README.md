# Blackbird

A small personal site, built as an old celestial atlas — deep-space ground, gilt
hairline frames, a faint RA/DEC coordinate grid, and a hand-charted constellation
for a mark. No framework and no build step: just static HTML, one stylesheet, and a
little vanilla JavaScript.

## Pages

- **Home** — the plate: a charted **Corvus** and a live time panel.
- **About** — field notes.
- **Resume** — a status plate.
- **Random stuff** — a few small browser games and experiments. No installs, no accounts.

## Features

- **Corvus constellation**, projected from J2000 RA/Dec — the four-star quadrilateral
  ("the Sail": γ Gienah, β Kraz, δ Algorab, ε Minkar), each star sized by apparent magnitude.
- **Three live clocks** beneath the chart: **solar** (mean solar / UTC), **sidereal**
  (Greenwich Mean Sidereal Time), and **dynamical** (Terrestrial Time). Set your
  longitude in the home-page script (`LON`) for true local sidereal time.
- **Responsive** — a single column on phones, two on wider screens.
- **Respects `prefers-reduced-motion`** — entry and twinkle animations stand down.

## Stack

- Static HTML + CSS + vanilla JS
- Type: Marcellus / Marcellus SC / EB Garamond (Google Fonts)
- Deployed as a static site

## Run locally

```bash
python -m http.server 8000
# then open http://localhost:8000
```

Or just open `index.html` directly in a browser.

## Structure

```
index.html     home / the plate
about.html     about
resume.html    resume
games/         the "random stuff" games + listing page
styles.css     the whole look
assets/        logo
```

---

© 2026 Blackbird
