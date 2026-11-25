# Morphogen – plan

Et virtuelt terrarium i lomma: et glass med vann sett rett fra siden, i ren 2D, der enkle cellebaserte organismer lever i et lukket kretsløp. Du designer artene selv med genomet, slipper dem ut i glasset og må stelle det – fôre, styre lyset, rengjøre og tilsette nye arter – slik at livet holder seg i balanse.

Inspirert av Cell Lab (organismer av celler med genom), lukkede økosystemer i glass og Tamagotchi (noe du må passe på).

## Prinsipper

- **Ett lukket kretsløp.** Stoff forsvinner aldri og oppstår aldri av seg selv. Det går i ring mellom celler, dødt materiale og næring i vannet. Bare lyset kommer utenfra, og bare spilleren kan tilsette eller fjerne stoff.
- **Glasset forteller selv hvordan det har det.** Grumsete vann, algebelegg og slam synes. Målerne bekrefter det du ser.
- **Forsømmelse synes, men kan repareres.** Et glass som har forfalt, skal kunne reddes med stell. Mer omsorg, mindre skyldfølelse.
- **Én ny ting om gangen.** Nye celletyper og verktøy låses opp gradvis, med forklaring.
- **Ingen skjulte funksjoner.** Ingen lange trykk eller hemmelige knapper.
- **Alltid samme resultat.** Simuleringen er deterministisk: samme glass, seed og handlinger gir nøyaktig samme utvikling på alle enheter. Det gjør at glass kan lagres, spilles av og deles.
- **Rask på mobil.** Simulering i Web Worker, tegning separat, tak på antall celler.

Tekniske regler for determinisme står i [CLAUDE.md](CLAUDE.md).

## Tekniske hovedgrep

- **Én verden: glasset.** Den runde petriskålen erstattes av et stående, rektangulært glass med vannflate øverst og bunn nederst. Laboratoriet (sandkassen og genomeditoren) bruker et lite glass, så det du tester er det samme som du slipper ut.
- **Massebalanse.** All masse ligger i ett av tre lagre: celler, dødt materiale eller næring i vannet. Hver prosess flytter masse fra ett lager til et annet. En test summerer alle lagrene og sjekker at totalen aldri endres.
- **Næring i et rutenett.** Vannet deles i et grovt rutenett, for eksempel 20 × 30 ruter, der næringen sprer seg litt hvert steg. Celler tar opp og slipper ut næring i ruten de er i.
- **Lys i kolonner.** Lyset kommer ovenfra, svekkes nedover i vannet, og hver celle skygger for dem under seg i samme kolonne. Lyssamlere må konkurrere om plassen nær overflaten.
- **Tyngdekraft og oppdrift per celletype.** Lyssamlere flyter litt, spisere synker litt, dødt materiale synker og blir til bunnslam. Svømmere kan motvirke det. Lagdelingen oppstår av seg selv.
- **Organisme-id per celle.** Døtre som henger sammen arver morens organisme-id, en knopp får ny. Jegere spiser bare celler fra andre organismer.
- **Handlinger som hendelser.** Alt spilleren gjør (fôre, rengjøre, tilsette en art) lagres som en hendelse med tidspunkt (steg). Glasset er dermed fullt beskrevet av start-seed, genomer og hendelseslogg, og kan spilles av og deles nøyaktig.
- **Lagring.** Øyeblikksbilde av hele tilstanden pluss hendelsesloggen, merket med `ENGINE_VERSION`. Et lagret glass fortsetter også etter en oppdatering, men da med de nye reglene.
- **Tiden mens du er borte.** Når appen åpnes, regner Web Workeren glasset fremover. Fordi en telefon ikke kan regne gjennom mange timer på sekunder, får borte-tiden et tak (noen sekunders regning) og en kort oppsummering av hva som skjedde.

## Ferdig: grunnmuren ✅

Fasene 0–3 i den opprinnelige planen:

- [x] Vite + TypeScript, testing og publisering med GitHub Actions og GitHub Pages
- [x] Deterministisk motor: egen tilfeldighetsgenerator, egne `sin`/`cos`/`atan2`, faste tidssteg, fingeravtrykk (gullhash)
- [x] Celler med kollisjon, mat, vekst, deling og død
- [x] Bindinger mellom celler, deling av næring og knoppskyting. Cellene snur seg med organismen
- [x] Genomet: oppskrifter med celletype, deling, døtre og bindinger, og `normalizeGenome()` for genomer fra andre
- [x] Celletyper: spiser, lyssamler og svømmer
- [x] Flere arter i samme verden
- [x] Genomeditor med forhåndsvisning, lagring på enheten og deling med lenke
- [x] Ytelsestest på `bench.html`
  - [ ] Kjør testen på en ekte Android-telefon

## Fase 4 – Glasset fra siden

- [ ] Stående rektangulært glass (omtrent 2:3) med vegger, vannflate og bunn, i stedet for den runde skålen
- [ ] Tyngdekraft og oppdrift per celletype
- [ ] Lys ovenfra i kolonner: svekkes nedover og skygges av celler over
- [ ] Dødt materiale synker og legger seg som bunnslam
- [ ] Tegnet rett fra siden: vann, vannflate, bunn og glasskanter
- [ ] Forhåndsvisningen i genomeditoren bruker et lite glass
- [ ] Ferdiglagde organismer justert til glasset
- **Ferdig når:** alger holder seg øverst og spisere nær bunnen, uten egne regler for det

## Fase 5 – Kretsløpet

- [ ] Næring i vannet som rutenett som sprer seg
- [ ] Massebalanse: tre lagre (celler, dødt materiale, næring), og en test som sjekker at summen aldri endres
- [ ] Lyssamlere trenger både lys og næring fra ruten de er i
- [ ] Forbrenning: alle celler slipper ut næring der de er
- [ ] Døde celler blir dødt materiale. Ingen mat dukker opp av seg selv lenger
- [ ] Nedbrytere (dagens spiser) spiser dødt materiale. Dødt materiale løses også sakte opp av seg selv, så kretsløpet aldri stopper helt
- [ ] Jegere: ny celletype som tar masse fra celler i andre organismer
- [ ] Organisme-id per celle
- **Ferdig når:** et lukket glass med alge, nedbryter og jeger lever i 24 timer spilltid med 20 ulike seeds (automatisk test)

## Fase 6 – Stell

- [ ] Handlinger: tilsett organisme, fôr (næring ved overflaten), lampe (timer per døgn), rengjør glasset (fjerner algebelegg), sug opp slam, bytt vann (fortynner næring og avfall)
- [ ] Handlinger lagres som hendelser med tidspunkt
- [ ] Døgn: dag og natt styrt av lampen
- [ ] Målere: næring, slam, grumsete vann, biomasse per gruppe, antall arter
- [ ] Synlige tegn: grønt eller grumsete vann, algebelegg på glasset, tykt bunnslam
- [ ] Vurder oksygen: lyssamlere lager, alle bruker, og for lite oksygen gir massedød (særlig om natten)
- **Ferdig når:** et forsømt glass forfaller synlig og kan reddes med stell

## Fase 7 – Tiden går

- [ ] Simuleringen i Web Worker
- [ ] Lagring på enheten: øyeblikksbilde + hendelseslogg
- [ ] Glasset regner seg frem gjennom tiden du var borte, med tak og oppsummering («Algene vokste, 2 arter døde ut»)
- [ ] PWA, så spillet kan legges på hjemskjermen
- [ ] Varsler («Algene tar over») – senere, krever server
- **Ferdig når:** du lukker appen om kvelden, åpner den neste dag, og glasset har levd videre

## Fase 8 – Utseende og berøring

- [ ] Lys som faller inn ovenfra, bobler, partikler som synker, bunnslam med tekstur, refleks i glasset
- [ ] Farger for dag og natt
- [ ] Zoom og panorering med fingrene
- [ ] Trykk på en celle eller organisme for å se art, alder og masse

## Fase 9 – Mål og evolusjon

- [ ] Mutasjoner ved deling (kan slås av og på), automatisk gjenkjenning av arter, slektstre
- [ ] Mål som låser opp nye celletyper, verktøy og glass: «Hold glasset i live i 7 dager», «4 arter samtidig», «Ingen algeoppblomstring på en uke»
- [ ] Opplæring i laboratoriet: korte oppgaver, én ny ting i hver (erstatter de gamle utfordringene)
- [ ] Vis oppskriftene i genomet som et tre eller diagram

## Fase 10 – Venner og deling

- [ ] Del et glass som lenke (øyeblikksbilde), så andre kan se på
- [ ] Send en art til en venns glass
- [ ] Kamper mellom genomer som egen modus (planen fra den opprinnelige fase 5: speilvendt start, Elo, sjekk mot juks)
- [ ] Supabase for brukere og deling

## Fase 11 – Google Play

- [ ] Pakk nettappen inn (TWA eller Capacitor), samme vei som Hagefugler
- [ ] Personvernerklæring (hvis spillet får brukerkontoer)
- [ ] Ikon, skjermbilder og butikktekst

## Åpne spørsmål

- Format på glasset: stående krukke (passer telefonen) eller liggende akvarium?
- Oksygen: gir det nok spenning til å være verdt det ekstra laget?
- Hvor mye tid skal glasset kunne ta igjen mens du er borte?
- Ett glass eller flere?
- Navn på celletypene (nå: spiser, lyssamler og svømmer; snart jeger)
- Språk: norsk først, engelsk senere? (all tekst ligger i `src/ui/strings.ts`)
