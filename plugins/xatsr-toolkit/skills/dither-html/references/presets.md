# Presets

Every preset in `assets/dither.js`, from `Dither.presets`. Use the name in `data-dither`. Knobs are the uniforms worth changing, with their default and a sensible range; pass changes as `data-uniforms` JSON, e.g. `data-uniforms='{"auroraCurtains": 5}'`. Other uniforms of the preset can be set the same way.

Old names still work: `ripple` → `ripples`, `grid` → `retro-grid`, `ridges` → `ridgelines`, `stars` → `starfield`, `dither-glow` → `glow`, `dither-gradient` → `gradient`, `dither-orb` → `orb`, `dither-fade` → `fade`.

## From dithercn

Ported from the dithercn background components, with their default props and palettes.

| Preset | Looks like | Colours | Knobs (default, range) |
| --- | --- | --- | --- |
| `aurora` | แสงเหนือ | 5 | `auroraCurtains` ม่านแสง 3 (1–6)<br>`auroraHeight` ความสูง 0.42 (0–1)<br>`auroraRays` ริ้วแสง 8 (1–32)<br>`auroraSway` การพลิ้ว 1 (0–3) |
| `beams` | ลำแสง | 2 | `beamAngle` มุม 160 (0–360)<br>`beamSpread` ความกว้าง 80 (1–359)<br>`beamRays` จำนวนลำ 9 (1–30)<br>`beamReach` ระยะ 1 (0.05–3) |
| `contours` | เส้นชั้นความสูง | 3 | `contoursLines` จำนวนเส้น 14 (4–32)<br>`contoursScale` ขนาดเนิน 1 (0.1–4)<br>`contoursRelief` เงาภูเขา 0.5 (0–1) |
| `eclipse` | สุริยุปราคา | 2 | `eclipseSize` ขนาด 0.24 (0.05–0.5)<br>`eclipseCorona` โคโรนา 0.5 (0–1.5)<br>`eclipsePulse` การเต้น 0.5 (0–1) |
| `fade` | ขอบจาง | 2 | `fadeSide` ด้าน 0 (0 ล่าง, 1 บน, 2 ขวา, 3 ซ้าย) |
| `glow` | แสงเรือง | 2 | `glowRadius` รัศมี 0.7 (0.1–2)<br>`glowIntensity` ความสว่าง 0.75 (0–1) |
| `gradient` | ไล่โทน | 2 | `gradientMode` แบบ 0 (0 เส้นตรง, 1 วงกลม, 2 กรวย)<br>`gradientAngle` มุม 180 (0–360)<br>`gradientNoise` นอยส์ 0.12 (0–0.5) |
| `halftone` | ฮาล์ฟโทน | 2 | `halftoneMode` แหล่ง 0 (0 นอยส์, 1 วงกลม, 2 เส้นตรง)<br>`halftonePitch` ระยะจุด 10 (4–40)<br>`halftoneAngle` มุมตะแกรง 45 (0–90) |
| `horizon` | ขอบฟ้าดาวเคราะห์ | 2 | `horizonHeight` ระดับขอบฟ้า 0.28 (0.05–0.8)<br>`horizonCurve` ความโค้ง 0.6 (0–1.5)<br>`horizonStars` ดาว 1 (0–2) |
| `mesh-gradient` | ไล่สีหลายก้อน | 5 | `meshCount` จำนวนก้อน 4 (3–5)<br>`meshSize` ขนาดก้อน 0.6 (0.2–1.5) |
| `metaballs` | ลาวาแลมป์ | 2 | `metaballsMode` แบบ 0 (0 ก้อนทึบ, 1 เส้นวง)<br>`metaballsCount` จำนวน 5 (1–8)<br>`metaballsSize` ขนาด 1 (0.3–2) |
| `noise-field` | ลายนอยส์ | 2 | `noiseVariant` แบบ 0 (0 ควัน, 1 สันเขา, 2 เส้นชั้น, 3 หินอ่อน)<br>`noiseScale` ขนาด 1.3 (0.3–4)<br>`noiseWarp` การบิด 1.7 (0–4) |
| `orb` | ลูกแก้ว | 2 | `orbSize` ขนาด 0.26 (0.1–0.5)<br>`orbMorph` การบิด 1 (0–3)<br>`orbGlow` แสงเรือง 0.5 (0–1.5) |
| `plasma` | พลาสมา | 3 | `plasmaScale` ขนาด 1 (0.2–3)<br>`plasmaBands` จำนวนแถบ 1.5 (0.5–4)<br>`plasmaWarp` การบิด 0.3 (0–1) |
| `retro-grid` | ตารางเรโทร | 4 | `retroColumns` จำนวนเส้น 12 (4–32)<br>`retroHorizon` ระดับขอบฟ้า 0.42 (0.2–0.8)<br>`retroSun` พระอาทิตย์ 0.4 (0–0.8) |
| `ridgelines` | เส้นคลื่นซ้อน | 2 | `ridgeLines` จำนวนเส้น 32 (8–64)<br>`ridgeAmplitude` ความสูงยอด 1 (0–3)<br>`ridgeSpread` การกระจาย 0.5 (0–1) |
| `ripples` | ระลอกน้ำ | 3 | `ripplesCount` จุดตก 2 (1–4)<br>`ripplesRings` จำนวนวง 12 (2–32)<br>`ripplesDecay` การจาง 1 (0–3) |
| `silk` | ผ้าไหม | 4 | `silkFolds` จำนวนรอยพับ 6 (1–16)<br>`silkAngle` มุม 110 (0–180)<br>`silkSheen` ความเงา 0.6 (0–1) |
| `smoke` | ควัน | 2 | `smokeAmount` ปริมาณ 1 (0–2)<br>`smokeHeight` ความสูง 0.8 (0.2–1.2)<br>`smokeWind` ลม 0.2 (-1–1) |
| `starfield` | ทุ่งดาว | 3 | `starDensity` ความหนาแน่น 1 (0.2–3)<br>`starTwinkle` การกะพริบ 0.6 (0–1)<br>`starNebula` เนบิวลา 0.5 (0–1) |
| `tunnel` | อุโมงค์ | 2 | `tunnelShape` รูปทรง 0 (0 กลม, 1 เหลี่ยม)<br>`tunnelSpokes` จำนวนซี่ 12 (0–32)<br>`tunnelFog` หมอก 1 (0–2) |
| `waves` | คลื่นทะเล | 4 | `wavesMode` แบบ 0 (0 คลื่นซ้อน, 1 เส้นคลื่นเสียง)<br>`wavesLayers` จำนวนชั้น 6 (1–8)<br>`wavesHorizon` ระดับขอบฟ้า 0.62 (0.2–0.9) |

## Extra

Made for this port. Two colours, `bayer8`.

| Preset | Looks like | Colours | Knobs (default, range) |
| --- | --- | --- | --- |
| `clouds` | เมฆลอย | 2 | — |
| `rings` | วงแหวน | 2 | — |
| `spiral` | ก้นหอย | 2 | — |
| `sunset` | พระอาทิตย์ตก | 2 | — |
| `fire` | เปลวไฟ | 2 | — |
| `rain` | ฝนตก | 2 | — |
| `stripes` | ลายทาง | 2 | — |
| `static` | จอซ่า | 2 | — |
| `vignette` | ขอบมืด | 2 | — |
| `dunes` | เนินทราย | 2 | — |
| `checker` | ตาหมากรุก | 2 | — |

## Colours

A preset palette runs from paper to ink. Most derive from `--dither-ink` and `--dither-paper` (often through `color-mix`), so setting those two variables, or `data-ink` / `data-paper`, recolours every step. `plasma` uses `--chart-5` and `starfield` uses `--chart-2` as accent colours; define those variables to change them, or pass a whole `data-palette="--dither-paper | blue | ink"`.
