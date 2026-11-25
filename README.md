# Morphogen

Et virtuelt terrarium: et glass med vann sett fra siden, der enkle cellebaserte organismer lever i et lukket kretsløp. Du designer artene med et genom og steller glasset så livet holder seg i balanse.

Akkurat nå er spillet fortsatt en petriskål der du kan teste organismer; glasset kommer i fase 4.

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

Legg til `?seed=123&genome=alge` i adressen for å spille av akkurat samme skål igjen med en bestemt organisme (`klump`, `alge`, `blanding` eller `svommer`).

**Egne organismer:** trykk «Genom» for å redigere genomet, se en forhåndsvisning og bruke det i skålen. «Kopier lenke» gir en lenke andre kan åpne.

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
  genome/       Ferdiglagde organismer (presets.ts), redigering (edit.ts) og lenker (codec.ts)
  ui/           Tegning, knapper, tekster, genomeditor og forhåndsvisning
  bench/        Ytelsestesten (bench.html)
  challenges/   Utfordringer som JSON (fase 4)
tests/          Vitest-tester, blant annet determinisme
```
