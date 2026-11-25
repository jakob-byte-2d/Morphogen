# Morphogen – plan

Et spill der du designer organismer med et genom, ser dem vokse i en petriskål og lar dem kjempe mot andre spilleres genomer på nett. Inspirert av Cell Lab (spillmekanikk) og Gladiabots/Robocode (du lager «AI-en», ikke styrer selv).

## Prinsipper

Lærdom fra tilbakemeldingene på Cell Lab:

- **Én ny ting om gangen.** Cell Lab ble for bratt da nye celletyper kom. Hver utfordring introduserer én ting, med hint.
- **Ingen skjulte funksjoner.** Ingen lange trykk eller hemmelige knapper. Lås heller opp innstillinger gradvis.
- **Likt resultat i alle hastigheter.** Simuleringen er deterministisk: samme genomer + samme seed = samme resultat, på alle enheter.
- **Rask på mobil.** Simuleringen i Web Worker, tegning separat, tak på antall celler.
- **Enkel deling.** Genomer og kamper deles med kode eller lenke, ikke filer.

Tekniske regler for determinisme står i [CLAUDE.md](CLAUDE.md).

## Fase 0 – Oppsett ✅

- [x] Vite + TypeScript, mappene `src/engine`, `src/genome`, `src/ui`, `src/challenges`
- [x] Deterministisk tilfeldighetsgenerator (sfc32) og egne `sin`/`cos`
- [x] Test som sjekker at samme seed gir nøyaktig samme verden etter 10 000 steg
- [x] GitHub Actions: tester og bygger ved hver push
- [x] Automatisk publisering til GitHub Pages (krever at repoet er offentlig eller GitHub Pro)

## Fase 1 – Simuleringen ✅

- [x] Faste tidssteg, celler som runde baller, kollisjon med rutenett
- [x] Mat som driver rundt, celler som spiser, vokser og deler seg, celler som dør
- [x] Bindinger mellom celler: døtrene holder sammen etter deling, arver morens bindinger og ryker hvis de strekkes for langt
- [x] Celler i samme organisme deler næring
- [x] Knoppskyting: organismer slipper fri celler som starter nye organismer (nå styrt av genomet)
- [x] Lys som energikilde: lyssamlere vokser av lys, og naboer som berører dem skygger
- [x] Tak på antall celler (`maxCells`, 1000) og på cellemasse (`maxCellMass`)
- [x] Ytelsestest på `bench.html`: måler fart med 250–2000 celler og sjekker fingeravtrykket mot fasit
  - PC med CPU strupet 4× (omtrent en middels telefon): 1000 celler ≈ 2,4 ms per steg ≈ 9× fart
  - [ ] Kjør testen på en ekte Android-telefon
- **Ferdig når:** én celle spiser og deler seg ✅ – og bindinger fungerer ✅

## Fase 2 – Genom og celletyper

- [x] Genomet som JSON med versjon (`src/engine/genome.ts`). `normalizeGenome()` gjør ethvert genom fra andre spillere gyldig
- [x] Oppskrifter (moduser): celletype, deler seg eller ikke, delingsmasse, delingsvinkel, barnas oppskrifter og vridning, binding mellom døtrene, om hver datter beholder bindingene
- [x] De midlertidige reglene `daughtersStick` og `budEvery` er erstattet av valg i genomet
- [x] Flere arter i samme skål, hver med sitt genom, startet speilvendt (grunnlaget for flerspiller)
- [x] Celletyper: spiser, lyssamler og svømmer
- [x] Cellene snur seg med organismen: hver binding husker hvor på cellen den sitter, så delingsvinkler og svømmere peker riktig vei når organismen roterer
- [x] Ensomme svømmere spretter av veggen
- [ ] Svømmende organismer samler seg ofte ved kanten. Vurder å la hele organismen snu ved veggen
- [x] Ferdiglagde organismer å velge mellom: Spiserklump, Alge, Blanding og Svømmer (`src/genome/presets.ts`)
- **Ferdig når:** en organisme med flere celler klarer å overleve ✅

## Fase 3 – Spillbart på mobil

- [ ] Simuleringen i Web Worker
- [ ] Zoom og panorering med fingrene
- [x] Genomeditor (knappen «Genom»): hver oppskrift er et kort med sammendrag («Spiser · → 2 + 3»), celletype, deling, døtrene og bindinger
- [ ] Vis oppskriftene som et tre eller diagram i tillegg til listen
- [x] Forhåndsvisning av hvordan én organisme vokser (kjøres med samme motor, så den stemmer)
- [x] Egne organismer lagres på enheten og deles med lenke (`?genome=custom&g=…`)
- [ ] PWA, så spillet kan legges på hjemskjermen
- **Ferdig når:** sandkassen fungerer godt på telefonen

## Fase 4 – Utfordringer for én spiller

- [ ] Format for utfordringer (se `src/challenges/README.md`)
- [ ] De 10 første utfordringene, én ny ting i hver
- [ ] Hint-knapp og stjerner
- [ ] «Hvis–så»-regler: sanser (ser mat, berøres av fremmed celle, alder) → handlinger (bytt oppskrift, del deg, slipp binding)
- [ ] Lagring av fremgang lokalt

## Fase 5 – Flerspiller

- [ ] Supabase: brukere, genomer, kamper, rangering
- [ ] Arena: begge arter starter speilvendt i samme skål
- [ ] Tre moduser: utrydd motstanderen, kontroller flest soner, spis mest
- [ ] Kamp = to genomer + seed + motorversjon. Ny sesong når motoren endres
- [ ] Kamper uten at begge er pålogget: kampen kjøres på utfordrerens telefon
- [ ] Elo-rangering, og sjekk av resultat med to telefoner mot juks
- [ ] Budsjett per genom og ny arena hver uke
- [ ] Repriser som kan deles med lenke

## Fase 6 – Google Play

- [ ] Pakk nettappen inn (TWA eller Capacitor), samme vei som Hagefugler
- [ ] Personvernerklæring (spillet har brukerkontoer)
- [ ] Ikon, skjermbilder og butikktekst

## Åpne spørsmål

- Språk: norsk først, engelsk senere? (all tekst ligger i `src/ui/strings.ts`)
- Navn på celletypene (nå: spiser, lyssamler og svømmer)
- Skal repoet være offentlig (gratis GitHub Pages) eller privat?
