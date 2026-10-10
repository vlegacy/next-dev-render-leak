# `next dev` retains heap on every App Router render (16.4.0)

Every page render in `next dev` leaves memory behind that survives a forced full
GC. Growth is linear in the number of requests and never levels off, so a dev
server under steady traffic (automated UI checks, many reloads) grows until it
spends seconds in each major GC. `next start` does not leak.

## Reproduce

```bash
npm install
npm run dev          # next dev --inspect (inspector on the render process, port 9229)
npm run probe        # in a second terminal
```

`probe.mjs` warms each page, forces a full GC (`HeapProfiler.collectGarbage`),
renders it `N` times, forces a full GC again and prints the heap that stayed.
Env: `BASE` (default `http://localhost:3000`), `N` (default 50), `PATHS`.

The app is two pages: `/` (static) and `/dynamic` (`await connection()` plus a
few awaited promises in async server components).

## Results (Next 16.4.0, Node 22.16.0, Windows 11, Turbopack)

Three consecutive runs of `N=400`, so 1,200 renders per page:

| page | retained per 400 renders | per render |
|---|---|---|
| `/` | +8.8 MB, +6.3 MB, +9.7 MB | 16-24 KB |
| `/dynamic` | +7.0 MB, +10.6 MB, +7.8 MB | 17-26 KB |

Native V8 context count stays flat, so this is not only the
`load-manifest` VM-context leak from vercel/next.js#93964.

In a real app (NextAuth `auth()` in a layout, `pg` queries, client shell) the
same measurement gives **0.4-1.4 MB per render** on dynamic pages, 42 of 51 MB
still held after 70 s idle plus another forced GC, and 5-22 KB per render
(noise) on the same pages under `next start`. On 16.2.9 that app's dev server
reached 7.4 GB of live heap after ~15k requests; a single full GC took 4.8 s.

Sampled allocations that survive GC sit in the dev-only React server runtime
(`app-page-turbo.runtime.dev.js`): `init` → `parseStackTracePrivate` →
`collectStackTracePrivate` from the async-hooks promise tracking, reached from
Next internals created per request (`getGlobalErrorStyles`, `findPageFile`,
`collectMetadata`, `makeDevtoolsIOAwarePromise`, `evalManifest`). Retention
grows with the number of framework-tracked promises a render creates.

Related, both auto-closed only for lacking a public reproduction:
vercel/next.js#97555 (same symptom on 16.2.6 / 16.3.1, ~3.9 MB per render),
vercel/next.js#93964.
