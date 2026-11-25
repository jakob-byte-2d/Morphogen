# Morphogen – plan

Et lite terrarium i pikselgrafikk, sett fra siden. Hver rute i et rutenett er én celle: jord, sand, vann, plantedeler, kryp. Du steller glasset med noen få verktøy og ser et lukket kretsløp leve: planter vokser mot lyset, kryp spiser dem, alt som dør blir avfall, og nedbrytere gjør avfallet til næring igjen.

Den første versjonen (sirkelceller med bindinger og genomer) ligger på grenen `v0-sirkler`. Det siste forsøket på et kretsløp med den motoren ligger på grenen `fase-5-kretslop`.

## Prinsipper

- **Så enkelt som mulig.** Hvert steg bygger det minste som virker.
- **Mobil først, minimalt grensesnitt.** Glasset fyller skjermen. Ingen tekst på knappene, verktøyene oppfører seg som ekte ting, og glasset viser selv hva det trenger.
- **Udefinert uttrykk.** Frynsete overganger, en egen nyanse i hver rute, dempet palett, uskarp bakgrunn, støv i lufta, lys ovenfra med myke skygger. Organismer er myke klumper uten skarpe kanter.
- **Fortere enn virkeligheten.** Et frø spirer på sekunder, en plante er voksen på minutter, glasset finner balansen på rundt en halvtime.
- **Deterministisk.** Samme glass og samme handlinger gir alltid samme resultat, så glass kan lagres, spoles fram og senere deles.

## Kontroller

- **☰** øverst til høyre åpner menyen.
- Nederst: **💧 vann, 🟫 jord, 🌱 frø, 🐛 kryp, 🥣 fôr, spade**. Én finger bruker verktøyet der du trykker og drar.
- **Frø og kryp** har en liten rad som spretter opp, der du velger art. Siste plass er «＋ Ny».
- **Zoom:** klyp med to fingre (opptil cirka 8×), dra med to fingre, dobbelttrykk for å zoome inn og ut.
- **Glasset viser hva det trenger:** tørr jord blir lysere, tørste planter gulner, friske planter glitrer, avfall hoper seg opp, fôr som ikke blir spist råtner.

## Arter

- **Planter:** gress, blomst og busk. Vokser rute for rute mot lyset, med røtter i jorda.
- **Bladlus:** små flekker i klynger. Spiser blader og fôr.
- **Slim:** en myk masse som kryper langs bakken og spiser bladlus og fôr.
- **Meitemark:** svake streker i jorda. Gjør avfall om til næring.
- **Sopp:** dukker opp av seg selv på avfall og gjør det om til næring.

## Tempo og utviklermodus

- Vanlig fart: 10 steg i sekundet. Vannet varer så du bare trenger å vanne et par ganger om dagen. Når du åpner appen igjen, spoles glasset fram (maks tilsvarende rundt én time).
- **Utviklermodus** (`?dev` i adressen, eller sju trykk på versjonsnummeret): fart 1×, 10×, 100× og «maks», pause og ett steg om gangen, kart over fukt, næring og lys, tellere.

## Meny

Innstillinger (vibrasjon, tid mens appen er lukket, fart 1×/2×/4×), informasjon, statistikk, arter, hjelp, ta bilde, nytt glass.

## Teknisk

- Rutenett på 72 × 128. Hver rute har en type, en fast egen nyanse, fukt og næring; levende ruter peker til sin organisme.
- Bare heltall og seedet tilfeldighet i motoren.
- Tegning i tre lag: uskarp bakgrunn, lys og skygge (mykt), og rutene skarpe oppå.
- Hvert steg får tester for reglene og en test som sjekker at samme seed gir samme glass.

## Steg

- [x] **0. Rydde.** Gammel versjon på egen gren, nytt skjelett, ny plan.
- [x] **1. Glasset.** Luft, stein, jord, sand og vann. Lys ovenfra og skygger, uskarp bakgrunn, støv. Zoom og flytting. 💧, 🟫 og spade. Fartsmotor og `?dev`.
- [x] **2. Planter.** Gress, blomst og busk som vokser mot lyset, med røtter. Frøvelger. Planter som gulner når de tørster og blir til avfall når de dør.
- [ ] **3. Kryp og fôr.** Bladlus, slim og 🥣.
- [ ] **4. Nedbrytere.** Meitemark og sopp. Vann som fordamper. Kretsløpet er lukket.
- [ ] **5. Tid.** Automatisk lagring, spoling når du kommer tilbake, app på hjemskjermen. Første gang er glasset allerede i gang.
- [ ] **6. Menyen.** Alt i menyen og full utviklermodus.
- [ ] **7. Lag din egen.** «＋» sist i frø- og krypvelgeren: farge, høyde og greiner for planter, farge og mat for kryp.
- [ ] **8. Vi tester sammen.** Lenke, skjermbilder og sjekkliste.

## Senere

Deling med venner, flere glass, mer avanserte genomer, Google Play.
