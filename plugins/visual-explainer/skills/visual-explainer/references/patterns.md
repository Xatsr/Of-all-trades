# Section patterns

Drop-in markup for `templates/base.html`. Every class used here is already styled in the template.

## Stat row

```html
<section>
  <div class="stats">
    <div class="card stat"><div class="value">14</div><div class="label">files changed</div></div>
    <div class="card stat"><div class="value">+320 / −85</div><div class="label">lines</div></div>
    <div class="card stat"><div class="value">2</div><div class="label">findings</div></div>
  </div>
</section>
```

## Architecture cards by layer

```html
<section>
  <h2>Architecture</h2>
  <div class="layer">
    <div class="layer-name">Interface</div>
    <div class="grid">
      <div class="card">
        <h3>HTTP API</h3>
        <p>Validates requests and maps them to services.</p>
        <div class="where">src/api/routes.ts:10</div>
      </div>
    </div>
  </div>
  <div class="layer">
    <div class="layer-name">Domain</div>
    <div class="grid"><!-- cards --></div>
  </div>
</section>
```

## Diagram

```html
<figure class="diagram">
  <pre class="mermaid">
sequenceDiagram
  participant C as Client
  participant A as API
  participant D as DB
  C->>A: POST /login
  A->>D: find user
  D-->>A: user row
  A-->>C: 200 + session cookie
  </pre>
  <figcaption>Login request path.</figcaption>
</figure>
```

## Before / after

```html
<section>
  <h2>Before / after</h2>
  <div class="cols-2">
    <figure class="diagram"><pre class="mermaid">flowchart TD
  A --> B</pre><figcaption>Before</figcaption></figure>
    <figure class="diagram"><pre class="mermaid">flowchart TD
  A --> C --> B</pre><figcaption>After</figcaption></figure>
  </div>
</section>
```

## Comparison table

```html
<section>
  <h2>Options</h2>
  <div class="table-wrap">
    <table>
      <thead><tr><th>Option</th><th>Pros</th><th>Cons</th><th>Verdict</th></tr></thead>
      <tbody>
        <tr><td>Redis</td><td>Fast, simple</td><td>Extra service</td><td><span class="badge good">Recommended</span></td></tr>
        <tr><td>In-process LRU</td><td>No dependency</td><td>Not shared across instances</td><td><span class="badge warn">Fallback</span></td></tr>
      </tbody>
    </table>
  </div>
</section>
```

## Findings

```html
<section>
  <h2>Findings</h2>
  <div class="card finding">
    <h3>Null session crashes logout</h3>
    <p class="where"><code>src/auth/logout.ts:42</code></p>
    <p>When the cookie is missing, <code>session.id</code> throws. Return early if <code>session</code> is undefined.</p>
  </div>
  <div class="card finding warn"><!-- lower-severity finding --></div>
</section>
```

## Timeline

```html
<section>
  <h2>History</h2>
  <ul class="timeline">
    <li><div class="when">2026-03</div><strong>v1.0</strong> — first release</li>
    <li><div class="when">2026-08</div><strong>v2.0</strong> — plugin API</li>
  </ul>
</section>
```
