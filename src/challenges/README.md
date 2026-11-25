# Utfordringer

Kommer i fase 4. Hver utfordring blir én JSON-fil i denne mappen:

```json
{
  "id": "001-forste-maltid",
  "title": "Første måltid",
  "introduces": "eater",
  "environment": { "foodPerSecond": 25, "maxFood": 1000 },
  "seed": 1,
  "goal": { "type": "reachCells", "count": 20, "withinSeconds": 120 },
  "hint": "Celler som spiser mye, deler seg raskere."
}
```

Mulige mål: `reachCells` (nå et antall celler), `survive` (overlev en viss tid), `eatFood` (spis en viss mengde).
