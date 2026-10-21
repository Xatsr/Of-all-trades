# Handoff recorder (ส่งเวร → สรุปรายเตียง)

อัดเสียงส่งเวรแบบ realtime (หรือใช้ไฟล์เสียงจาก iPhone) → ถอดเสียงด้วย [Typhoon Whisper Turbo](https://huggingface.co/typhoon-ai/typhoon-whisper-turbo) → ให้ Claude สรุปเป็นรายเตียง เรียงตามเลขเตียง: Dx, อาการ, V/S, lines, meds, lab ที่ต้องตาม, สิ่งที่ต้องทำในเวร (checkbox) และเรื่องที่ต้องระวัง

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
