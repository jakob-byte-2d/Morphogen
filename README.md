# Morphogen

Et lite terrarium i pikselgrafikk, sett fra siden. Hver rute er én celle: jord, sand, vann, plantedeler og kryp. Du steller glasset med noen få verktøy og ser et lukket kretsløp leve.

Spill på nett: https://jakob-byte-2d.github.io/Morphogen/

Planen ligger i [ROADMAP.md](ROADMAP.md). Den første versjonen, med sirkelceller og genomer, ligger på grenen `v0-sirkler`.

## Kom i gang

Krever Node 22 eller nyere.

```bash
npm install
npm run dev        # utviklingsserver på http://localhost:5173
npm test           # kjør testene
npm run typecheck  # sjekk typer
npm run build      # bygg til dist/
```

## Struktur

```
src/
  sim/       Simuleringen. Ren TypeScript med bare heltall, uten DOM.
  view/      Tegning og kamera. Leser verden, endrer den aldri.
  ui/        Knapper, velgere, meny og all tekst (strings.ts).
  main.ts    Starter appen og kjører løkka.
tests/       Tester for reglene og for determinisme.
```
