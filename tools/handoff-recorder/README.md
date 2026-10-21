# Handoff recorder (ส่งเวร → สรุปรายเตียง)

> ## 📱 เปิดใช้บน iPhone: **[https://xatsr.github.io/Of-all-trades/tools/handoff-recorder/web/](https://xatsr.github.io/Of-all-trades/tools/handoff-recorder/web/)**
>
> เปิดลิงก์ใน Safari → Share → **Add to Home Screen**

อัดเสียงส่งเวรแบบ realtime (หรือใช้ไฟล์เสียงจาก iPhone) → ถอดเสียงด้วยโมเดล Typhoon บนเครื่อง → ให้ Claude สรุปเป็นรายเตียง เรียงตามเลขเตียง: Dx, อาการ, V/S, lines, meds, lab ที่ต้องตาม, สิ่งที่ต้องทำในเวร (checkbox) และเรื่องที่ต้องระวัง

มี 2 แบบ:

- **บน iPhone (web app):** เปิดใน Safari ได้เลย ถอดเสียงบนมือถือ ไม่ต้องลงแอป ดู [ด้านล่าง](#บน-iphone)
- **บนคอมพิวเตอร์ (`handoff.py`):** Mac / Windows / Linux

## บน iPhone

`web/` เป็นเว็บแอปที่ถอดเสียงบนมือถือเลย มีโมเดลให้เลือก 2 ตัว:

| โมเดล | ขนาด | ใช้เมื่อ |
| --- | --- | --- |
| **Typhoon ASR Realtime** (ค่าเริ่มต้น) | 138 MB | iPhone ทุกรุ่นที่รองรับ เร็วมาก รันบน CPU ผ่าน [onnxruntime-web](https://onnxruntime.ai) (ไฟล์ ONNX จาก [edtzforai/typhoon-asr-int8-onnx](https://huggingface.co/edtzforai/typhoon-asr-int8-onnx) ซึ่งแปลงมาจาก [scb10x/typhoon-asr-realtime](https://huggingface.co/scb10x/typhoon-asr-realtime)) |
| **Typhoon Whisper Turbo** | 560 MB | แม่นกว่าเล็กน้อย แต่ต้องใช้ RAM มาก บน iPhone มัก**โหลดไม่ไหว** (ขึ้นข้อความ "A problem repeatedly occurred") รันด้วย [transformers.js](https://huggingface.co/docs/transformers.js) + WebGPU |

ถ้าหน้าเว็บปิดไปตอนโหลด Whisper ครั้งหน้าที่เปิด แอปจะเปลี่ยนกลับไปใช้โมเดลเล็กให้เอง

**ลิงก์เว็บแอป:** [https://xatsr.github.io/Of-all-trades/tools/handoff-recorder/web/](https://xatsr.github.io/Of-all-trades/tools/handoff-recorder/web/)

เว็บนี้ deploy ด้วย GitHub Pages จาก branch `typhoon-whisper-turbo` (Settings → Pages → Deploy from a branch → `/ (root)`)

**ใช้บน iPhone:**

1. เปิดลิงก์ใน Safari → ปุ่ม Share → **Add to Home Screen** จะได้ไอคอนเหมือนแอป
2. กด **โหลดโมเดล** โมเดลเล็กโหลดครั้งแรกประมาณ 138 MB ครั้งต่อไปจะโหลดจากเครื่อง
3. กด **เริ่มอัด** แล้วข้อความจะขึ้นทุกครั้งที่หยุดพูดสั้น ๆ พอจบให้กด **หยุดอัด**
4. สรุปได้ 2 ทาง:
   - **คัดลอกไปวางใน Claude app:** ใช้โควตาแพ็กเกจ Claude ที่มีอยู่ ไม่ต้องมี API key
   - **สรุปเลย:** ใส่ API key จาก platform.claude.com แล้วสรุปบนหน้านั้นเลย (key เก็บไว้ในเครื่องนี้)
5. ไฟล์เสียงที่อัดจะเก็บไว้ในเครื่อง (ปิดได้ที่ "เก็บไฟล์เสียงที่อัดไว้ในเครื่อง") ดูได้ที่การ์ด **เสียงที่อัดไว้** ซึ่งเปิดฟัง บันทึกลง Files / แชร์ ถอดเสียงอีกครั้ง หรือลบได้ ถ้าหน้าเว็บปิดไประหว่างอัด เสียงที่อัดได้ถึงตอนนั้นยังอยู่
6. หรือกด **เลือกไฟล์เสียง** เพื่อถอดเสียงไฟล์ Voice Memos (.m4a) บนมือถือ

**ข้อจำกัดบน iPhone:**

- **ต้องเปิดจอค้างไว้:** ถ้าล็อกจอหรือสลับแอป Safari จะหยุดไมค์ (หน้านี้กันจอดับให้แล้ว) ถ้าต้องล็อกจอ ให้อัดด้วย Voice Memos แล้วใช้ "เลือกไฟล์เสียง"
- **รุ่นเครื่อง:** โมเดลเล็กน่าจะใช้ได้กับ iPhone ทั่วไป ส่วน Whisper ต้องใช้ iOS 26 ขึ้นไป (มี WebGPU) และ RAM เยอะ
- **Whisper ถ้าไม่มี WebGPU:** จะใช้ CPU แทน ช้ากว่ามากและต้องโหลดประมาณ 1 GB
- **transcript ไม่หาย:** เก็บไว้ในเครื่องจนกว่าจะกด "ล้าง" ถ้าหน้าเว็บปิดไปก็กลับมาสรุปต่อได้

## บนคอมพิวเตอร์

ต้องรันบนเครื่องของเราเอง (Mac / Windows / Linux) เพราะต้องใช้ไมค์ของเครื่อง

## ติดตั้ง (ครั้งเดียว)

```bash
# 1) ffmpeg ใช้อ่านไฟล์ .m4a จาก iPhone
brew install ffmpeg            # macOS
# winget install ffmpeg        # Windows

# 2) Python 3.10+
cd tools/handoff-recorder
python3 -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# 3) API key สำหรับขั้นตอนสรุป (https://platform.claude.com/settings/keys)
export ANTHROPIC_API_KEY=sk-ant-...
```

ครั้งแรกที่รันจะดาวน์โหลดโมเดลประมาณ 1.6 GB แล้วเก็บไว้ในเครื่อง ส่วนถอดเสียงทำงานบนเครื่องทั้งหมดและไม่ต้องใช้เน็ต

## ใช้งาน

**อัดสด**

```bash
python handoff.py live
```

พูดได้เลย ข้อความจะขึ้นทุกครั้งที่หยุดพูดเป็นช่วงสั้น ๆ (ทุก 3–25 วินาที) พอจบให้กด **Ctrl+C** แล้วสรุปรายเตียงจะขึ้นต่อทันที

**ไฟล์จาก iPhone (Voice Memos)**

1. อัดใน Voice Memos แล้วกด Share → AirDrop ไปที่ Mac (หรือบันทึกลง Files / iCloud Drive)
2. รัน:
   ```bash
   python handoff.py file ~/Downloads/ส่งเวร.m4a
   ```

ใช้ได้กับ `.m4a .mp3 .wav .mp4` และไฟล์ที่ ffmpeg เปิดได้

**สรุปใหม่จาก transcript เดิม**

```bash
python handoff.py summarize handoffs/2026-10-21_0800/transcript.txt
```

ผลลัพธ์จะอยู่ใน `handoffs/<วันที่_เวลา>/`: `audio.wav` (เฉพาะโหมด live), `transcript.txt` และ `summary.md`

### ตัวเลือก

| Flag | ใช้ทำอะไร |
| --- | --- |
| `--no-summary` | ถอดเสียงอย่างเดียว ไม่ส่งข้อมูลไป Claude |
| `--language auto` | ให้โมเดลตรวจภาษาเองทีละช่วง (ค่าเริ่มต้นคือ `th`) |
| `--prompt "..."` | คำใบ้ศัพท์ เช่น `"เตียง 5 on O2 cannula, plan CBC, hemoculture"` ใช้ช่วยให้สะกดคำเฉพาะได้ดีขึ้น |

## ไทยปนอังกฤษ

โมเดลถอดเสียงตามที่ได้ยิน คำอังกฤษที่พูดชัด เช่น CBC, IV, CHF มักออกมาเป็นอักษรอังกฤษ แต่ศัพท์ยาวหรือพูดสำเนียงไทยอาจออกมาเป็นคำทับศัพท์ไทยหรือสะกดผิด เช่น "นิวโมเนีย", "Full Role Semi" (= furosemide)

ขั้นตอนสรุปจะแก้คำพวกนี้กลับเป็นศัพท์การแพทย์ภาษาอังกฤษให้ ส่วนเนื้อหาที่เหลือเขียนเป็นไทย ถ้าคำหรือตัวเลขไหนไม่แน่ใจ จะมีเครื่องหมาย `(?)` ต่อท้าย ควรเช็คตัวเลข (dose, lab, V/S) กับ chart ทุกครั้ง

## ความเร็ว

- Mac M1–M4 ใช้ GPU (MPS) ตามได้สบายแบบ realtime
- NVIDIA GPU (CUDA) เร็วมาก
- CPU อย่างเดียว ใช้เวลาประมาณเท่ากับความยาวเสียง ข้อความแบบ live จะขึ้นช้ากว่าเสียงพูดเล็กน้อย

## ข้อมูลผู้ป่วย

ถอดเสียงทำบนเครื่องทั้งหมด แต่ขั้นตอนสรุปจะส่ง transcript ไปที่ Claude API ก่อนใช้กับผู้ป่วยจริงควรตรวจสอบนโยบาย PDPA และนโยบายของโรงพยาบาล ถ้ายังไม่ได้รับอนุญาตให้ใช้ `--no-summary` หรือหลีกเลี่ยงการพูดชื่อหรือ HN ผู้ป่วยตอนอัด
