# Deckard kitchen sink

## Overview

A deliberately exhaustive deck. Every construct the §2 format allows appears
here at least once, so the golden test documents the format by example and the
brand kits get one slide per class to style.

## Audience

The transform, the linter, and whoever next changes either.

## Narrative

Meta sections like this one sit above the anchor and never reach the deck.

## Followups

- [ ] Nothing outstanding.

## Slides

### Deckard

<!--
media: none
layout: lead
-->

A cover slide: the lead layout, no media, and a subtitle in the body.

**One source of truth, everything else generated.**

### What the format gives you

Ordinary bullets, the most common slide there is:

- A slide per `###` heading, in document order
- Metadata in an HTML comment, so a plain preview stays readable
- Presenter notes that ride along into the deck

### Screenshot as an aside

<!--
media: done
media-type: screenshot
-->

![bg right:40% fit](assets/screenshot.png)

A tall image belongs in the margin rather than inline, so the prose keeps the
left half of the slide.

### Terminal capture pending

<!--
media: pending
media-type: terminal
-->

The capture lands here once it is produced, and this line goes away with it.

#### deck: Media

A scripted terminal capture: run `deck build` on a two-slide deck and let the
render finish, so the timing is real rather than staged.

#### deck: Notes

- Point out that the render is genuinely that fast, no cutting.

### Waiting on a human

<!--
media: handoff
-->

The slide reserves room for a photograph of the room during the workshop.

#### deck: MEDIA

Photograph the room from the back during the exercise. Section names match
case-insensitively, which is why this one shouts.

### Code and tables

<!--
media: none
-->

Content headings live in the body and shift up two levels with the title.

#### Fenced code keeps its hashes

```bash
# This comment starts with a hash and is not a heading.
deck build --lint
#### Neither is this one.
```

##### Five deep

Promoted to an H3.

###### Six deep

Promoted to an H4, which is as deep as the budget goes.

| State | Who resolves it |
| ------- | --------------- |
| pending | the agent |
| handoff | the presenter |

### Raw Marp passthrough

<!--
media: none
marp: transition: fade
marp: paginate: false
-->

Rare layout needs reach Marp verbatim through the `marp:` key, so no downstream
file ever needs a hand edit.

### Notes and knowledge

<!-- media: none -->

Single-line metadata comments work too.

#### deck: notes

- Spoken words only, and this section name is lowercase on purpose.
- Presenter notes stay out of the rendered slide.

#### deck: Knowledge

- Marp collects any comment it does not recognize as that slide's note.
- Verified against marp-team/marp-cli#1000 on 2026-07-24.

### The finished capture

<!--
media: done
media-type: terminal
-->

![width:900px](output/demo.gif)

Once produced, the asset moves into the body and the state becomes `done`.
