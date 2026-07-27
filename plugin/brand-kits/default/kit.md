# Deckard default kit — styling directives

A neutral dark theme: anthracite surfaces, very light grey text, one
restrained accent. It follows the craft advice that a dark background keeps
the audience's focus on the speaker.

## Palette

| Token | Value | Use for | Keep away from |
|---|---|---|---|
| background | `#1B1F24` | every slide | — |
| surface | `#242A31` | code blocks, table headers | large filled areas |
| hairline | `#39414A` | borders, rules | text |
| text | `#E8EAED` | body copy | — |
| headings | `#F4F6F8` | headings, strong | body copy (glares at size) |
| muted | `#9AA3AD` | pagination, footers, quotes | primary content |
| accent | `#7FB0D4` | links, the one highlighted element | decoration, bullets |

One accent, used sparingly: contrast is how attention is steered, and an
accent that appears everywhere steers nowhere.

## Directives

- Emphasis comes from size and contrast, not extra colors. The most
  important element on a slide is the biggest or the brightest — one or the
  other is usually enough.
- Light-background media (screenshots, diagrams exported on white) reads
  fine on the dark ground; keep such images visually quiet neighbours —
  avoid ringing them with bright borders.
- Prefer `bg right/left fit` asides for tall light images so the dark
  ground keeps the slide's balance.
- Body text stays `#E8EAED`; reserve pure-white feeling (`#F4F6F8`) for
  headings and `**strong**`.
