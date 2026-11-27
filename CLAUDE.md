# Morphogen 2 – regler for kodeassistenter

Et lite terrarium i pikselgrafikk sett fra siden. Spilleren steller glasset med noen få verktøy og ser et kretsløp leve: planter, visne blader og skrukketroll. Dette er versjon 2 (grenen `v2`), bygget **så enkelt som mulig, i lag**. Den første versjonen ligger på `main`. Se ROADMAP.md.

## Kommandoer

- `npm run dev` – utviklingsserver
- `npm test` – to tester (må alltid passere)
- `npm run typecheck` – typesjekk
- `npm run build` – produksjonsbygg

## Lagene

Verden er noen få lag oppå hverandre, hvert i sin egen korte fil i `src/sim/`, med sine egne regler:

- `ground.ts` – bakken: rutenett med luft, jord og stein. Jord faller og glir som sand; stein ligger. `world.top` er bakkehøyden i hver kolonne.
- `water.ts` – vannet: ett tall, vannlinja (`world.waterLine`, i 1/256 rader). Under linja er luft dam og jord våt. Vannkanna hever den (dråper som faller), og den synker sakte (fordamping).
- `litter.ts` – visne blader: ett tall per kolonne, tegnet som en haug. Råtner sakte.
- `plants.ts` (+ `forms.ts`, `species.ts`) – planter og frø: lister. Hver plante har en **fast form** laget fra id-en, som vises mer og mer etter hvert som planten vokser. Planten vokser når røttene når vannlinja, ellers visner den. Frø spirer når vannet er nær (busker og blomster bare i en grop eller mellom visne blader).
- `animals.ts` – skrukketroll: en liste. De står i en kolonne på bakken, spiser visne blader der, formerer seg, dør og blir til løv.
- `step.ts` – klokka: raske steg (`TICKS_PER_SECOND`) for det som faller, og et livssteg hvert femte minutt (`LIFE_EVERY`) for alt som lever. `skip` spoler fram og hopper rett fra livssteg til livssteg.

Lagene leser hverandre, men hvert lag endrer bare sitt eget (bortsett fra at planter og dyr legger visne blader i løvlaget, og verktøyene i `tools.ts`).

## Regler for koden

- **Deterministisk:** bare heltall i `src/sim/`, tilfeldighet bare fra `world.rng`, ingen sanntid og ingen DOM. Gå gjennom lister og rutenett i fast rekkefølge.
- Endrer du reglene med vilje: øk `SIM_VERSION` og oppdater gullhashen i `tests/sim.test.ts`.
- `src/view/` tegner lag for lag og endrer aldri verden. Det skrukketrollene gjør mellom livsstegene (rusler rundt), er bare tegning.
- All tekst spilleren ser ligger i `src/ui/strings.ts` (norsk). Kode og kommentarer på engelsk. TypeScript strict.
- Hold det enkelt: ingen balansetester og ingen store testsuiter. Legg heller til et nytt lag eller en ny kort regel enn å gjøre et lag komplisert.
- Minimalt grensesnitt: ingen tekst på knappene, verktøy som oppfører seg som ekte ting.
