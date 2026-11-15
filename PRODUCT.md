---
register: product
---

# e^x: crew health station

## Product purpose
e^x is health-monitoring software for astronauts on long missions (NASA Space Apps 2026 challenge "Create Health Monitoring Software for Astronauts"). It judges every reading against the astronaut's own baseline, classes alerts with NASA-STD-3001 caution & warning terms (who has to act), guides the daily self-check, and forecasts solar radiation storms from NASA DONKI flare data so the crew can shelter in time. It feeds the flight surgeon; it does not replace them.

## Users
- Astronauts in a lunar habitat (demo mission: Artemis Base Camp, simulated crew), glancing at a wall touchscreen or tablet, sometimes with gloves, often tired, under dimmed cabin light on sleep shifts.
- The flight surgeon on the ground, reading the same status with a delay.
- Hackathon judges watching on a 1920x1080 projector from the back of a room.

## Tone
Calm mission control. Plain words, one sentence per status, never alarmist unless a measured event demands it. Labels 1-3 words.

## Strategic principles
1. Status first: overall state readable from 2 m in one second (shape + word + colour, never colour alone).
2. One primary action per screen, always in the same place.
3. Every value sits on the person's own usual range; no bare numbers, no sigma jargon on the main surface.
4. Honest data: every number comes from the data files or the core logic, with its label (recorded, simulated, estimated). The storm model predicts a storm chance, never a dose.
5. Safety rule: a forecast raises Warning at most; Emergency only from a measured event.
6. Touch targets 64 px or more (gloves); text never under 14 px.

## Brand
Name: e^x (written e with superscript x). Look chosen by the owner on 15 Nov: lit navy sky, light thin type (Inter Tight), sentence case, one white primary button, the Earth / body / Sun as the one visual object per screen.

## Anti-references
- Sci-fi HUD noise, neon on black, glowing everything.
- Pill and badge clutter, gamification (XP, streaks, flames, stars), emojis, celebration effects.
- Rounded card grids, all-caps tracked labels, mixed button styles.
- Agency logos or personal astronaut names in pitch material.
