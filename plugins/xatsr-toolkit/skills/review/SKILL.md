---
name: "review"
description: "Comprehensive, exam-depth review of any medical topic — disease, symptom approach, drug class or procedure — from pathophysiology to treatment, as a visual Thai page with CPG/NLEM context, mnemonics and pitfalls."
---

# Medical topic review

The reader is a Thai final-year medical student about to start internship. They want to understand a topic well enough to pass the exam *and* manage the patient on the ward, they are a visual learner, and they want it to stick with little effort.

The goal is **complete coverage of what must be known**, not filling a fixed template. Different topics need different shapes: a disease unfolds patho → Dx → Tx; a symptom (chest pain, AKI) is an approach and a DDx; a drug class is mechanism → indication → dose → side effects; a procedure is indication → steps → complications. Pick the structure that fits the topic and let the content decide the headings.

## Workflow

1. **Frame the topic.** Decide what kind of topic it is and the most exam- and ward-relevant scope. If the scope is ambiguous enough that the page would change a lot (e.g. "anemia"), ask one short question; otherwise state the framing in one line at the top and go.
2. **Research before writing.** Verify anything that changes over time — diagnostic criteria, first-line drugs, doses, targets — with web search. Source priority: Thai CPGs (ราชวิทยาลัย, สมาคมวิชาชีพ, กรมควบคุมโรค, สปสช.) and บัญชียาหลักแห่งชาติ (NLEM); then international guidelines (ADA, ESC, ACC/AHA, KDIGO, IDSA, Surviving Sepsis, GOLD, GINA, ACR/EULAR, WHO…). Note each guideline's name and year. Never invent a dose, cutoff, or criterion: if it can't be verified, say "ดู guideline ล่าสุด" instead.
3. **Check coverage** against the list below, then write.
4. **Build the page from `templates/base.html`** (relative to this skill's directory): copy it, keep its `<head>` and `<style>` unchanged, and replace only the content inside `<main>`. The template already handles fonts, light/dark mode, phone layout and A4 print-to-PDF, so do not add your own CSS, colors, gradients, icons or fonts. Publish it as an HTML artifact. Mobile-first — the user often reads on a phone.
5. **Reply** in one or two lines: what the page covers, plus one offer (a related topic, or an MEQ on the same topic).

## Coverage checklist

Not a section list — a check that nothing important is missing. Include every item that applies to the topic, in whatever order reads best; skip what doesn't apply.

- **สรุป 30 วินาที** — 3–5 lines the student could say on ward round. Always first.
- **Definition & classification / phenotypes / severity** — including severity scores and admission or ICU criteria.
- **Epidemiology & risk factors** — brief, Thai context where it matters (melioidosis in อีสาน, thalassemia, liver fluke…).
- **Pathophysiology** — as a causal chain, ideally a flowchart, with each symptom, lab finding, and treatment target hung off the step that causes it, so the reader sees *why*. Plain language first, technical term in parentheses.
- **Clinical features** — history clues, exam pearls, red flags; tie back to the patho.
- **Diagnosis** — criteria as a **numbered list** with name and year (or diagnostic elements point by point if none exist); tiered workup (bedside → confirmatory → specialized) with expected findings and what they mean; interpretation pitfalls; **DDx table** (condition | distinguishing feature | test that separates it).
- **Management** — as an algorithm, organized by **broad phases rather than fixed clock times**, because diseases move at very different speeds (DKA resolves in a day; TB treatment runs months). Use the phases that fit the disease, e.g.:
  - **Acute phase** — stabilize: supportive orders (position, O₂ target, IV access, monitoring, fluids, I/O) and the first drug orders.
  - **Post-acute phase** — definitive treatment, how to judge response (signs of success vs failure, using the time frame the guideline actually gives, if any), when to step up, escalate, or transfer to ICU.
  - **Discharge / maintenance phase** — discharge criteria, home medications, non-drug advice, return precautions, follow-up labs and visits.
  - Merge, rename, or skip phases when they don't fit (an outpatient disease may have only initial treatment and long-term follow-up).
  - Throughout: write drug orders as a real order — generic name, dose, route, frequency, diluent/rate if IV, duration. For each key drug give the NLEM category (ก/ข/ค/ง), hold parameters (vital-sign or lab cutoffs to hold and notify), renal/hepatic adjustment, and why it's given.
  - Combination regimens when the guideline actually calls for them — explain each component's role. Don't force combinations the guideline doesn't recommend.
  - Mark what the intern does first versus specialist care.
- **Complications** and how to watch for them.
- **ตัวช่วยจำ** — established mnemonics where they exist; any new one labeled "(คิดขึ้นใหม่)". Visual analogies welcome.
- **High-yield & pitfalls** — 5–8 items: exam traps, common intern mistakes, drug interactions, "อย่าลืม".
- **Sources** — guideline names, years, links.

## Style

- Thai explanations, English medical terms kept in English.
- Teach like a kind ajarn: explain the reasoning in short sentences, no walls of text.
- Tables wherever comparing things (DDx, drugs, orders); flowcharts for patho and management algorithms.
- Use the template's components so every review page looks the same:

  | Content | Component |
  | --- | --- |
  | สรุป 30 วินาที | `.tldr` in the header |
  | Diagnostic criteria, the one fact to know | `.box.key` |
  | ตัวช่วยจำ | `.box.mnemonic` with `.letters` |
  | Red flags, pitfalls, "อย่าลืม", drug interactions | `.box.pitfall` (red, used only for danger) |
  | High-yield exam points, ward tips | `.box.pearl` |
  | DDx, drug orders, workup tiers | `.table-wrap` + `<table>` |
  | Patho causal chain | `.flow` with `.node` / `.arrow`, split into `.branch`; symptoms and danger as `.node.warn`, treatment targets as `.node.ok` |
  | Management algorithm by phase | one `<section>` per phase, each with `<ol class="steps">` and an orders table |
  | NLEM category, severity, status labels | `.tag`, `.tag.warn`, `.tag.ok` |
  | Self-test at the end (3–5 questions) | `<details><summary>` with `.answer` |
  | Sources | `.sources` footer |

- Number each `<section>` heading with `<span class="num">` and add the `.toc` only when there are four or more sections.
- Wide tables stay inside `.table-wrap` so they scroll inside the table, never the page.
- Exam depth, but cut anything that doesn't help understanding or a decision.

## Example

Input: "ทบทวน DKA"

The page might run: สรุป 30 วินาที → Dx criteria (verified, numbered) and severity → patho flowchart (↓insulin → lipolysis → ketones → HAGMA → Kussmaul, abdominal pain; hyperglycemia → osmotic diuresis → dehydration, total-body K⁺ deficit even when serum K⁺ looks normal) → acute phase orders table (fluid, K⁺ replacement, insulin infusion, each with dose, NLEM category, hold parameters) → post-acute phase (resolution criteria, switch to SC insulin, find the precipitating cause) → complications (hypokalemia, cerebral edema, hypoglycemia) → discharge phase (home insulin, sick-day rules, follow-up) → pitfalls ("เริ่ม insulin ก่อนเช็ค K⁺ → hypokalemia → arrhythmia").

Input: "approach to chest pain"

Different shape: สรุป → can't-miss causes first (ACS, aortic dissection, PE, tension pneumothorax, esophageal rupture, tamponade) → history/exam clues table → initial workup (ECG, troponin, CXR…) → algorithm by working diagnosis → pitfalls.