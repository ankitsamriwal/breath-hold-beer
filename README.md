# Hold My Beer - breath-hold beer-pour challenge

Hold your breath, pour the pint. A press-and-hold web toy: the hold drives a slow beer pour with synthesized ASMR audio (bottle crack, fizz, froth), and how full the glass gets maps to a rating - BELOW AVERAGE / GOOD / EXCELLENT / ATHLETIC (full pint at 120s).

- Zero-dependency Node static server (`server.js`), single-page canvas app (`index.html`)
- All audio synthesized at runtime with the Web Audio API - no asset files
- Personal best stored locally; share card via Web Share API / clipboard
- 120-second hard cap: the pour maxes out and the hold auto-ends at 2:00
- Disclaimers: first-visit gate (no hyperventilation / never near water / stop if dizzy / legal-age note), a brief reminder chip on every hold start, and a persistent safety footer
- Zero music by design: the only audio is synthesized ASMR (bottle crack, pour, fizz, froth)

## Run

```
node server.js        # serves on PORT (default 8080)
```

Docker: `docker build -t hold-my-beer . && docker run -p 8080:8080 hold-my-beer`
