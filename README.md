# Blackbird

A small personal site, built as a mix of both old and new astrophysics aesthetics.

## Pages

- **Home** — the plate: a charted **Corvus** constellation and a live time panel
- **About** — basic notes about me
- **Resume** — a status plate, as I don't want to put my information on the web as of now
- **Random stuff** — a few small browser games and experiments that I've made in the past

## Features

- **Corvus constellation**, projected from J2000 RA/Dec, the four-star quadrilateral
  ("the Sail": γ Gienah, β Kraz, δ Algorab, ε Minkar), each star sized by apparent magnitude.
- **Three live clocks** beneath the chart: **solar** (mean solar / UTC), **sidereal**
  (Greenwich Mean Sidereal Time), and **dynamical** (Terrestrial Time). Set your
  longitude in the home-page script (`LON`) for true local sidereal time
- **Responsive** — a single column on phones, two on wider screens

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
