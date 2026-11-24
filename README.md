# Morphogen

Design organismer med et genom, se dem vokse i en petriskål og la dem kjempe mot andres genomer.

Planen ligger i [ROADMAP.md](ROADMAP.md).

## Kom i gang

Krever Node 22 eller nyere.

```bash
npm install
npm run dev        # utviklingsserver på http://localhost:5173
npm test           # kjør testene
npm run typecheck  # sjekk typer
npm run build      # bygg til dist/
```

Legg til `?seed=123` i adressen for å spille av akkurat samme skål igjen.

## Struktur

```
src/
  engine/       Simuleringen. Ren TypeScript uten DOM – kjører likt overalt.
    world.ts    Verden, miljø og ett tidssteg (stepWorld)
    rng.ts      Deterministisk tilfeldighetsgenerator
    fmath.ts    Deterministisk sin/cos
    grid.ts     Rutenett for raske nabooppslag
    hash.ts     Fingeravtrykk av hele tilstanden
  genome/       Genomformatet (fase 2)
  ui/           Tegning, knapper og tekster
  challenges/   Utfordringer som JSON (fase 4)
tests/          Vitest-tester, blant annet determinisme
```
