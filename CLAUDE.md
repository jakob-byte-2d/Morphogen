# Morphogen – regler for kodeassistenter

Et lite terrarium i pikselgrafikk sett fra siden, der hver rute i et rutenett er én celle. Spilleren steller glasset med noen få verktøy og ser et lukket kretsløp leve. Simuleringen må være **bit-for-bit deterministisk**, fordi glass lagres, spoles fram når appen åpnes igjen, og senere deles. Se ROADMAP.md for planen.

## Kommandoer

- `npm run dev` – utviklingsserver
- `npm test` – tester (må alltid passere)
- `npm run typecheck` – typesjekk
- `npm run build` – produksjonsbygg

## Struktur

- `src/sim/` – simuleringen. Ren TypeScript uten DOM.
- `src/view/` – tegning og kamera. Leser verden, endrer den aldri.
- `src/ui/` – knapper, velgere og meny. All tekst spilleren ser ligger i `src/ui/strings.ts` (norsk).
- `src/main.ts` – starter appen og kjører løkka.

## Determinisme (viktigst)

All kode i `src/sim/` må følge dette:

- Bare heltall i alt som påvirker tilstanden. Ingen `Math.random()`, ingen `Math.sin` og liknende. Bruk `world.rng` (`src/sim/rng.ts`).
- Ingen avhengighet av sanntid (`Date`, `performance.now()`). Motoren går kun i faste steg.
- Gå gjennom rutenettet og listene i fast rekkefølge. En rute som er flyttet i et steg, merkes så den ikke flyttes to ganger.
- Ingen DOM eller nettleser-API-er i motoren.
- Nye rutetyper legges til sist i `src/sim/cells.ts`, aldri i midten: lagrede glass bruker tallene.
- Endrer du reglene med vilje: øk `SIM_VERSION` og oppdater gullhashen. Endres gullhashen uten at du mente å endre reglene, er det en feil.

## Kode

- TypeScript, strict. Kode og kommentarer på engelsk.
- Tilfeldighet i tegningen (støv, glitter) er greit, så lenge den ikke påvirker verden.
- Hold motoren rask: hvert steg går gjennom alle ruter, så unngå å lage objekter per rute.
- Minimalt grensesnitt: ingen tekst på knappene, verktøy som oppfører seg som ekte ting.
