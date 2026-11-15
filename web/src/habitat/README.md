# Habitat UI (drop-in)
Self-contained: React + Tailwind + plain SVG, no new dependencies. Reads only public/data/habitat_telemetry.json.
- `useHabitat()` loads the file (base-path aware, works offline)
- `<HabitatPanel data focusAnomalyId />`: the Habitat tab
- `<HabitatStatusPill data onClick />`: mission header pill
- `<EnvironmentalCauseChip data crewId metric onOpen />`: astronaut panel chip; renders nothing if there's no link
Guardrails are built in: thresholds come from meta, there's no "before the limit" text unless lead_time_h > 0, missed/false-alarm tags are shown, and the "simulated" footer is always rendered.
Type-checked (tsc strict) and render-tested against v1-shaped data.
