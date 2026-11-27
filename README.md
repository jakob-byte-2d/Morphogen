# Morphogen 2

Et lite terrarium i pikselgrafikk, sett fra siden, bygget så enkelt som mulig i lag: bakke, vann, visne blader, planter og skrukketroll. Du steller glasset med noen få verktøy og ser et kretsløp leve.

Spill på nett: https://jakob-byte-2d.github.io/Morphogen/v2/ (den første versjonen ligger fortsatt på https://jakob-byte-2d.github.io/Morphogen/).

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

Glasset lagres i nettleseren og spoles fram (opptil tre måneder) når du åpner appen igjen. `?fresh` eller `?seed=123` starter et nytt glass, `?dev` slår på utviklermodus. Appen kan legges på hjemskjermen og virker uten nett når den er åpnet én gang.

## Struktur

```
src/
  sim/       Simuleringen, ett lag per fil. Ren TypeScript med bare heltall, uten DOM.
  view/      Tegning og kamera. Leser verden, endrer den aldri.
  ui/        Knapper, velgere, meny og all tekst (strings.ts).
  main.ts    Starter appen og kjører løkka.
tests/       To tester: determinisme og lagring.
```
