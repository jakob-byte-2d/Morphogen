# Morphogen – regler for kodeassistenter

Spill der spilleren designer organismer med et genom. Simuleringen må være **bit-for-bit deterministisk**, fordi flerspillerkamper kjøres på spillernes egne enheter og sammenlignes. Se ROADMAP.md for planen.

## Kommandoer

- `npm run dev` – utviklingsserver
- `npm test` – tester (må alltid passere)
- `npm run typecheck` – typesjekk
- `npm run build` – produksjonsbygg

## Determinisme (viktigst)

All kode i `src/engine/` må følge dette:

- Ingen `Math.random()`. Bruk `world.rng` (`src/engine/rng.ts`).
- Ingen `Math.sin/cos/tan/atan2/exp/log/pow/hypot`. Bruk `src/engine/fmath.ts`, og legg til nye funksjoner der, bygget av `+ - * /`, `Math.sqrt`, `Math.floor/round/abs/min/max`.
- Ingen avhengighet av sanntid (`Date`, `performance.now()`). Motoren går kun i faste steg på `DT`.
- Gå gjennom lister i fast rekkefølge. Fjern elementer ved å bygge ny liste i samme rekkefølge.
- Ingen DOM eller nettleser-API-er i motoren.
- Genomer kommer fra andre spillere og er upålitelige: kjør dem alltid gjennom `normalizeGenome()` (det gjør `createWorld`). Nye celletyper legges til sist i `CELL_TYPES`, aldri i midten.
- Bindinger peker på celle-id, ikke indeks, fordi cellelisten bygges på nytt ved deling og død. Bruk `world.scratch.indexById` (bygges av `indexCells`) for oppslag.

Endrer du simuleringsreglene med vilje: øk `ENGINE_VERSION` i `src/engine/world.ts` og oppdater gullhashen i `src/engine/golden.ts`. Endres gullhashen uten at du mente å endre reglene, er det en feil.

## Kode

- TypeScript, strict. Kode og kommentarer på engelsk.
- All tekst spilleren ser, ligger i `src/ui/strings.ts` (norsk foreløpig).
- Renderer leser verden, men endrer den aldri.
- Hold motoren rask: bruk rutenettet (`grid.ts`) til nabooppslag, unngå å lage nye objekter i hvert steg der det er lett å unngå.
