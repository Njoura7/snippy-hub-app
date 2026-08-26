# Caption fonts

All four are open-licensed and bundled directly (no runtime download, no
attribution required for this kind of use) — sourced from Google Fonts'
canonical repo (github.com/google/fonts).

| File | Family | License |
|---|---|---|
| Anton-Regular.ttf | Anton | SIL Open Font License 1.1 |
| BebasNeue-Regular.ttf | Bebas Neue | SIL Open Font License 1.1 |
| Poppins-ExtraBold.ttf | Poppins ExtraBold | SIL Open Font License 1.1 |
| Ubuntu-Bold.ttf | Ubuntu | Ubuntu Font Licence 1.0 |

Exact registered family name (what goes in ass.ts's FONT_MAP) is confirmed
via `fc-list` inside the built worker image, not assumed from the filename —
static-weight Google Fonts files sometimes register the weight as part of
the family name (e.g. "Poppins ExtraBold") rather than as a separate style.
