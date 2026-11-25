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

Legg til `?seed=123&genome=alge` i adressen for å spille av akkurat samme skål igjen med en bestemt organisme (`klump`, `alge` eller `blanding`).

**Ytelsestest:** åpne `bench.html` (på nett: `/Morphogen/bench.html`). Den måler hvor raskt simuleringen går med 250–2000 celler, og sjekker at enheten regner nøyaktig likt som alle andre.

## Struktur

```
src/
  engine/       Simuleringen. Ren TypeScript uten DOM – kjører likt overalt.
    model.ts    Datatyper: miljø, celler, mat, bindinger
    world.ts    Standardmiljø og ett tidssteg (stepWorld)
    genome.ts   Genomformatet og normalizeGenome
    bonds.ts    Bindinger mellom celler, deling av næring, organismer
    golden.ts   Fasit-fingeravtrykket for determinisme
    rng.ts      Deterministisk tilfeldighetsgenerator
    fmath.ts    Deterministisk sin/cos
    grid.ts     Rutenett for raske nabooppslag
    hash.ts     Fingeravtrykk av hele tilstanden
  genome/       Ferdiglagde organismer (presets.ts)
  ui/           Tegning, knapper og tekster
  bench/        Ytelsestesten (bench.html)
  challenges/   Utfordringer som JSON (fase 4)
tests/          Vitest-tester, blant annet determinisme
```
