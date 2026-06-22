from docx import Document
from docx.shared import Pt, RGBColor, Inches, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
import copy

# ── helpers ──────────────────────────────────────────────────────────────────

def set_font(run, name="Malgun Gothic", size=11, bold=False, color=None):
    run.font.name = name
    run.font.size = Pt(size)
    run.font.bold = bold
    if color:
        run.font.color.rgb = RGBColor(*color)
    # Korean font fallback
    r = run._r
    rPr = r.get_or_add_rPr()
    rFonts = OxmlElement('w:rFonts')
    rFonts.set(qn('w:eastAsia'), name)
    rPr.insert(0, rFonts)

def add_heading(doc, text, level=1, color=(20, 20, 19)):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    run = p.add_run(text)
    sizes = {1: 20, 2: 16, 3: 13}
    set_font(run, size=sizes.get(level, 12), bold=True, color=color)
    p.paragraph_format.space_before = Pt(16 if level == 1 else 10)
    p.paragraph_format.space_after = Pt(4)
    return p

def add_body(doc, text, indent=False):
    p = doc.add_paragraph()
    if indent:
        p.paragraph_format.left_indent = Inches(0.3)
    run = p.add_run(text)
    set_font(run, size=10.5)
    p.paragraph_format.space_after = Pt(4)
    return p

def add_bullet(doc, text, level=0):
    p = doc.add_paragraph(style='List Bullet')
    p.paragraph_format.left_indent = Inches(0.3 + level * 0.2)
    run = p.add_run(text)
    set_font(run, size=10.5)
    p.paragraph_format.space_after = Pt(2)

def add_code_block(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Inches(0.3)
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after = Pt(4)
    shading = OxmlElement('w:shd')
    shading.set(qn('w:val'), 'clear')
    shading.set(qn('w:color'), 'auto')
    shading.set(qn('w:fill'), 'F0EDE8')
    p._p.get_or_add_pPr().append(shading)
    run = p.add_run(text)
    run.font.name = "Courier New"
    run.font.size = Pt(9)

def add_table(doc, headers, rows, col_widths=None):
    table = doc.add_table(rows=1 + len(rows), cols=len(headers))
    table.style = 'Table Grid'
    table.alignment = WD_TABLE_ALIGNMENT.LEFT
    # header row
    hdr = table.rows[0]
    for i, h in enumerate(headers):
        cell = hdr.cells[i]
        cell.text = ""
        run = cell.paragraphs[0].add_run(h)
        set_font(run, size=10, bold=True, color=(255, 255, 255))
        # dark bg
        tc = cell._tc
        tcPr = tc.get_or_add_tcPr()
        shd = OxmlElement('w:shd')
        shd.set(qn('w:val'), 'clear')
        shd.set(qn('w:color'), 'auto')
        shd.set(qn('w:fill'), '181715')
        tcPr.append(shd)
    # data rows
    for ri, row in enumerate(rows):
        tr = table.rows[ri + 1]
        fill = 'FAF9F5' if ri % 2 == 0 else 'EFE9DE'
        for ci, cell_text in enumerate(row):
            cell = tr.cells[ci]
            cell.text = ""
            run = cell.paragraphs[0].add_run(str(cell_text))
            set_font(run, size=10)
            tc = cell._tc
            tcPr = tc.get_or_add_tcPr()
            shd = OxmlElement('w:shd')
            shd.set(qn('w:val'), 'clear')
            shd.set(qn('w:color'), 'auto')
            shd.set(qn('w:fill'), fill)
            tcPr.append(shd)
    if col_widths:
        for i, row in enumerate(table.rows):
            for j, cell in enumerate(row.cells):
                if j < len(col_widths):
                    cell.width = Inches(col_widths[j])
    doc.add_paragraph()

def add_divider(doc):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after = Pt(4)
    run = p.add_run('─' * 72)
    run.font.color.rgb = RGBColor(0xE6, 0xDF, 0xD8)
    run.font.size = Pt(8)

# ═══════════════════════════════════════════════════════════════════════════════
# DOC 1 — CHARACTER DESIGN BRIEF
# ═══════════════════════════════════════════════════════════════════════════════

doc1 = Document()

# page margins
for section in doc1.sections:
    section.top_margin = Cm(2.5)
    section.bottom_margin = Cm(2.5)
    section.left_margin = Cm(3)
    section.right_margin = Cm(3)

# title
p = doc1.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = p.add_run("WONDER KIDS")
set_font(run, size=28, bold=True, color=(204, 120, 92))
p.paragraph_format.space_after = Pt(2)

p2 = doc1.add_paragraph()
p2.alignment = WD_ALIGN_PARAGRAPH.CENTER
run2 = p2.add_run("Character Design Brief — AI Image Generation Prompt Reference")
set_font(run2, size=12, color=(108, 106, 100))
p2.paragraph_format.space_after = Pt(2)

p3 = doc1.add_paragraph()
p3.alignment = WD_ALIGN_PARAGRAPH.CENTER
run3 = p3.add_run("v1.0 · 2025 · CONFIDENTIAL")
set_font(run3, size=9, color=(142, 139, 130))

add_divider(doc1)

# world setting
add_heading(doc1, "세계관 전제 (World Setting)", 1)
add_body(doc1, "퍼블릭 도메인 원작 기반 크로스오버 세계관")
add_body(doc1, "• 루이스 캐럴 《이상한 나라의 앨리스》(1865) — 미국·한국 완전 퍼블릭 도메인")
add_body(doc1, "• L. 프랭크 바움 《오즈의 마법사》(1900) — 미국·한국 완전 퍼블릭 도메인")
add_body(doc1, "모든 캐릭터는 두 원작에서 영감을 받은 완전 오리지널 디자인. 디즈니(1951) 또는 MGM(1939) 영상 저작물과 시각적으로 구분되어야 함.")

add_divider(doc1)

# GLOBAL AVOID
add_heading(doc1, "전체 공통 금지 사항 (Global Negative Prompts)", 1, color=(198, 69, 69))
add_body(doc1, "아래 요소는 모든 캐릭터에 적용되는 절대 금지 항목입니다.")
add_code_block(doc1,
"AVOID ALL:\n"
"- Any Disney (1951) Alice in Wonderland visual references\n"
"- Any MGM (1939) Wizard of Oz visual references\n"
"- Blue pinafore dress with white apron (Disney Alice trademark)\n"
"- Ruby red slippers / ruby shoes\n"
"- Pink bubble gown with crown and wand (MGM Glinda trademark)\n"
"- Purple and pink striped Cheshire cat (Disney version)\n"
"- Green-skinned witch design\n"
"- Disney or MGM character proportions or color palettes\n"
"- Any design that could be mistaken for existing Disney IP\n"
"- Smoking, hookah, pipe (Disney Caterpillar reference)"
)

add_divider(doc1)

# characters
characters = [
    {
        "id": "01",
        "name": "ARIA",
        "role": "공주형 리더 — 오즈의 착한 마녀 + 하트 여왕의 딸 컨셉",
        "target": "공주 드레스를 좋아하는 4–7세 여아 메인 타겟",
        "age": "외형상 7–8세 아동",
        "color": (204, 120, 92),
        "positive": (
            "Original children's character named ARIA.\n"
            "A 7-year-old girl with soft wavy golden hair\n"
            "decorated with a small sparkling tiara headband.\n"
            "Wearing a pastel lavender ballgown-style dress\n"
            "with layered tulle skirt, NOT a Disney princess dress.\n"
            "Dress has small heart-shaped buttons and star embroidery.\n"
            "Big expressive doe eyes in warm amber color.\n"
            "Rosy round cheeks, bright confident smile.\n"
            "Holding a small glowing wand with a heart-shaped crystal tip.\n"
            "Silver shoes (NOT ruby — flat and round-toed, child-appropriate).\n"
            "Style: modern children's book illustration,\n"
            "soft pastel color palette, warm and approachable,\n"
            "NOT anime, NOT Disney, slightly Pixar-adjacent but simpler.\n"
            "Chibi-ish proportions (large head, compact body).\n"
            "Suitable for 3–8 year old audience.\n"
            "Background: rose garden with playing card-shaped topiaries."
        ),
        "negative": (
            "AVOID:\n"
            "- Ruby slippers or red shoes of any kind\n"
            "- Pink bubble dress (MGM Glinda)\n"
            "- Blue dress with white apron (Disney Alice)\n"
            "- Disney princess silhouette or style\n"
            "- Adult proportions\n"
            "- Realistic rendering\n"
            "- Dark or scary elements\n"
            "- Crown that looks like a villain queen\n"
            "- Wand resembling MGM Glinda's wand"
        ),
        "learn": "감정 표현, 리더십, 수학 (카드 세기)",
        "palette": "라벤더, 소프트 골드, 로즈 핑크, 실버"
    },
    {
        "id": "02",
        "name": "CHESS",
        "role": "K-pop 쿨 소녀 — 체셔 고양이 의인화, 뉴진스 미감",
        "target": "'귀엽기만 한 건 싫어' 타입 6–9세 여아 + 언니들",
        "age": "외형상 9–10세 아동",
        "color": (130, 90, 180),
        "positive": (
            "Original children's character named CHESS.\n"
            "A cool, stylish 9-year-old girl with a short\n"
            "two-tone bob haircut (deep violet and soft pink),\n"
            "with small rounded cat ears on top of her head.\n"
            "Slightly downturned almond-shaped eyes\n"
            "with purple irises, calm and mysterious expression.\n"
            "NOT smiling broadly — subtle, knowing smile (cat-like).\n"
            "Outfit: layered K-pop street fashion for children —\n"
            "oversized pastel hoodie with purple stripe details,\n"
            "pleated mini skirt, colorful layered socks, chunky sneakers.\n"
            "A crescent moon charm necklace.\n"
            "Cat tail (same violet-pink two-tone) visible behind her.\n"
            "Style: Korean webtoon-influenced children's illustration,\n"
            "clean line art, cool pastel color palette\n"
            "(purple, lavender, soft pink, white).\n"
            "NOT anime eyes, NOT adult body proportions.\n"
            "She appears to fade slightly at the edges\n"
            "(Cheshire cat disappearing ability, subtle effect).\n"
            "Background: floating platforms in a twilight tree canopy."
        ),
        "negative": (
            "AVOID:\n"
            "- Disney Cheshire Cat purple/pink stripe pattern\n"
            "- Adult or teen body proportions\n"
            "- Revealing clothing\n"
            "- Angry or villainous expression\n"
            "- Fully realistic rendering\n"
            "- Generic anime style\n"
            "- Direct visual reference to Disney's 1951 film\n"
            "- Neon colors (keep it soft/muted cool tones)\n"
            "- Sharp or aggressive cat design"
        ),
        "learn": "논리·추리, 언어 (수수께끼), 과학적 사고",
        "palette": "딥 바이올렛, 소프트 핑크, 라벤더, 화이트"
    },
    {
        "id": "03",
        "name": "HATTO",
        "role": "에너지 넘치는 발명가 소년 — 매드 해터 영감, 남아 포함 전연령",
        "target": "5–8세 전체 (남아 포함), 창의력·STEM 관심 아동",
        "age": "외형상 8세 아동",
        "color": (93, 184, 166),
        "positive": (
            "Original children's character named HATTO.\n"
            "A cheerful energetic 8-year-old boy\n"
            "with messy warm brown hair sticking out\n"
            "from under an oversized top hat\n"
            "(deep teal with gears and small gadgets attached,\n"
            "NOT a classic black top hat).\n"
            "Round face, big bright green eyes,\n"
            "freckles across nose, wide open grin.\n"
            "Wearing a quirky inventor's outfit:\n"
            "patchwork vest over striped long-sleeve shirt,\n"
            "rolled-up pants, mismatched boots.\n"
            "A tool belt with tiny gadgets, gears, cups,\n"
            "and a teapot-shaped flask.\n"
            "One goggle pushed up on forehead.\n"
            "Style: warm, rounded children's book illustration.\n"
            "Color palette: warm teals, oranges, creams, browns.\n"
            "NOT steampunk-dark — bright and playful inventor aesthetic.\n"
            "Chibi-adjacent proportions.\n"
            "Background: colorful workshop with a long tea table\n"
            "covered in inventions and teacups."
        ),
        "negative": (
            "AVOID:\n"
            "- Johnny Depp's Mad Hatter (Tim Burton 2010) references\n"
            "- Disney's Mad Hatter orange frizzy hair\n"
            "- Dark, gothic, or Tim Burton aesthetic\n"
            "- Scary or unsettling expression\n"
            "- Classic black top hat\n"
            "- Adult proportions\n"
            "- Dark steampunk color palette\n"
            "- Pale white face makeup"
        ),
        "learn": "STEM, 창의력, 실패에서 배우기, 협동",
        "palette": "틸, 웜 오렌지, 크림, 브라운"
    },
    {
        "id": "04",
        "name": "BIBI",
        "role": "겁쟁이 아기 토끼 — 흰 토끼 영감, 막내 캐릭터",
        "target": "3–5세 유아, 가장 낮은 연령층 타겟",
        "age": "외형상 5세 아동 (가장 어려 보임)",
        "color": (240, 180, 200),
        "positive": (
            "Original children's character named BIBI.\n"
            "A very small, chubby, timid rabbit-child hybrid.\n"
            "Extremely chibi proportions: very large head,\n"
            "very small round body, short stubby limbs.\n"
            "White fluffy fur with soft pink inner ears.\n"
            "Huge watery blue eyes, always slightly wide with worry.\n"
            "Wearing cozy pastel yellow pajama-style onesie\n"
            "with a small pocket watch print pattern.\n"
            "Holding an oversized round pocket watch\n"
            "(too big for the character, played for cute comedy).\n"
            "Tiny fluffy white bunny tail visible.\n"
            "Expression: somewhere between worried and determined.\n"
            "Small round pink nose, twitching.\n"
            "Style: maximum softness — ultra-rounded shapes,\n"
            "no sharp edges anywhere, plush toy aesthetic.\n"
            "Similar softness to Sanrio style\n"
            "but NOT a Sanrio character (fully original).\n"
            "Color palette: white, soft yellow, baby pink, sky blue.\n"
            "Background: cozy rabbit hole entrance\n"
            "with oversized clocks and soft grass."
        ),
        "negative": (
            "AVOID:\n"
            "- Disney's White Rabbit design (waistcoat, specific proportions)\n"
            "- Realistic rabbit features\n"
            "- Overly scared or crying expression\n"
            "- Adult or teen proportions\n"
            "- Direct resemblance to Sanrio's My Melody\n"
            "- Sharp angles or edges in any part of design\n"
            "- Dark or saturated colors\n"
            "- Human-like face (keep it animal-hybrid)"
        ),
        "learn": "시간 개념, 용기, 감정 조절, 숫자 (시계)",
        "palette": "화이트, 베이비 옐로우, 소프트 핑크, 스카이 블루"
    },
    {
        "id": "05",
        "name": "SAGE",
        "role": "조력자 NPC — 애벌레 + 올빼미 혼합, 스토리 가이드",
        "target": "전연령 (플레이어블 캐릭터 아닌 가이드 역할)",
        "age": "외형상 나이를 알 수 없는 현자",
        "color": (93, 150, 120),
        "positive": (
            "Original guide character named SAGE.\n"
            "A wise, calm caterpillar-owl hybrid creature.\n"
            "Small round body, large knowing eyes (deep amber, half-lidded),\n"
            "long elegant antennae with small glowing orbs at tips.\n"
            "Wearing a tiny academic robe or kimono-style wrap\n"
            "in deep blue-green with star patterns.\n"
            "Sitting on top of a large mushroom or floating leaf.\n"
            "Speaks in speech bubbles with question marks and stars.\n"
            "Expression: eternally calm, slightly amused, wise.\n"
            "Style: softer than main characters,\n"
            "almost like a living stuffed animal or spirit guide.\n"
            "Muted deep color palette: forest green, midnight blue,\n"
            "soft gold accents.\n"
            "Small round spectacles perched on face.\n"
            "Background: glowing mushroom forest,\n"
            "bioluminescent plants, soft magical light."
        ),
        "negative": (
            "AVOID:\n"
            "- Disney's Caterpillar design (blue body, smoking hookah)\n"
            "- ANY smoking, pipe, or hookah elements\n"
            "- Intimidating or scary expression\n"
            "- Adult human features\n"
            "- Overly complex design\n"
            "- Bright saturated colors (keep muted and deep)\n"
            "- Villainous appearance"
        ),
        "learn": "지식, 철학적 질문, 자기 탐색",
        "palette": "포레스트 그린, 미드나잇 블루, 소프트 골드"
    }
]

for ch in characters:
    add_heading(doc1, f"CHARACTER {ch['id']} — {ch['name']}", 1, color=ch['color'])

    add_heading(doc1, "역할 및 타겟", 2)
    add_body(doc1, f"역할: {ch['role']}")
    add_body(doc1, f"타겟: {ch['target']}")
    add_body(doc1, f"설정 연령: {ch['age']}")
    add_body(doc1, f"학습 연결: {ch['learn']}")
    add_body(doc1, f"시그니처 컬러: {ch['palette']}")

    add_heading(doc1, "✅ Positive Prompt (사용할 묘사)", 2, color=(61, 180, 114))
    add_code_block(doc1, ch['positive'])

    add_heading(doc1, "❌ Negative Prompt (금지 묘사)", 2, color=(198, 69, 69))
    add_code_block(doc1, ch['negative'])

    add_divider(doc1)

# global style
add_heading(doc1, "전체 스타일 가이드 (Global Style Rules)", 1)
add_code_block(doc1,
"GLOBAL STYLE RULES — apply to ALL characters:\n\n"
"Art style:\n"
"  Modern children's app illustration style.\n"
"  Clean vector-friendly line art.\n"
"  Korean webtoon influenced but universally appealing.\n"
"  NOT: Disney, Pixar, anime, realistic, dark/gothic.\n\n"
"Proportions:\n"
"  Chibi-adjacent (head 1/3 to 1/2 of total height).\n"
"  Large expressive eyes. Simplified hands (3-4 fingers).\n"
"  Round, soft shapes throughout. No sharp edges.\n\n"
"Color philosophy:\n"
"  Each character has 2-3 hero colors.\n"
"  Pastels dominant, one saturated accent per character.\n"
"  Background always lighter than character.\n"
"  Colored outlines (not black) matching character palette.\n\n"
"Required expression set per character (x5):\n"
"  Happy / Curious / Surprised / Thinking / Determined\n\n"
"Technical specs:\n"
"  Transparent background (PNG).\n"
"  Readable at 64x64px and 512x512px.\n"
"  No fine detail that disappears at small sizes."
)

# PD reference table
add_heading(doc1, "원작 활용 가능 / 금지 빠른 참조표", 1)
add_table(doc1,
    ["요소", "원작 PD (사용 가능 ✅)", "영화판 (금지 ❌)"],
    [
        ["앨리스 이름·개념", "✅ 사용 가능", "파란 에이프런 드레스 (디즈니)"],
        ["체셔 고양이", "✅ 개념 사용 가능", "보라·분홍 줄무늬 (디즈니 1951)"],
        ["매드 해터", "✅ 개념 사용 가능", "주황 곱슬머리·특정 모자 (팀버튼/디즈니)"],
        ["흰 토끼", "✅ 개념 사용 가능", "조끼+시계 특정 디자인 (디즈니)"],
        ["글린다·착한 마녀", "✅ 이름·개념 사용 가능", "핑크 버블 드레스·왕관 (MGM 1939)"],
        ["에메랄드 시티", "✅ 세계관 사용 가능", "1939년 영화 특정 색감·디자인"],
        ["노란 벽돌 길", "✅ 개념 사용 가능", "MGM 특정 시각화"],
        ["구두", "✅ 은색 구두 (원작)", "루비 구두 ❌ (MGM 창작)"],
        ["애벌레", "✅ 개념 사용 가능", "파란 몸+후카 흡연 (디즈니) — 절대 금지"],
    ],
    col_widths=[1.5, 2.2, 2.8]
)

doc1.save("/home/user/ClaudeBusiness/WONDER_KIDS_Character_Design_Brief.docx")
print("DOC1 saved.")

# ═══════════════════════════════════════════════════════════════════════════════
# DOC 2 — BUSINESS STRATEGY
# ═══════════════════════════════════════════════════════════════════════════════

doc2 = Document()
for section in doc2.sections:
    section.top_margin = Cm(2.5)
    section.bottom_margin = Cm(2.5)
    section.left_margin = Cm(3)
    section.right_margin = Cm(3)

# title
p = doc2.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = p.add_run("사업 전략 마스터플랜")
set_font(run, size=26, bold=True, color=(20, 20, 19))

p2 = doc2.add_paragraph()
p2.alignment = WD_ALIGN_PARAGRAPH.CENTER
run2 = p2.add_run("1인 AI 활용 글로벌 웹 사업 | 한국인 창업자 기준")
set_font(run2, size=12, color=(108, 106, 100))

p3 = doc2.add_paragraph()
p3.alignment = WD_ALIGN_PARAGRAPH.CENTER
run3 = p3.add_run("v1.0 · 2025 · CONFIDENTIAL")
set_font(run3, size=9, color=(142, 139, 130))

add_divider(doc2)

# ── 1. 프로젝트 개요 ──────────────────────────────────────────────────────────
add_heading(doc2, "1. 프로젝트 포트폴리오 개요", 1)
add_table(doc2,
    ["프로젝트", "개요", "우선순위", "첫 수익 예상"],
    [
        ["Project C\n연구 참가자 플랫폼", "대학원생 피험자 모집 + 일반인 참가 보상 플랫폼\n(한국판 Prolific Academic)", "★★★★★\n1순위", "3–4개월"],
        ["Project A-1\n인지과제 마켓", "검증된 인지과제(N-back, Stroop 등)\nライセンス 판매 디지털 마켓플레이스", "★★★★\n2순위", "3–5개월"],
        ["Project A-2\nWonder Kids", "이상한나라+오즈 세계관 오리지널 캐릭터\n유아·아동 태블릿 학습 게임 (구독)", "★★★\n3순위", "9–12개월"],
        ["Project B\nAI 보드게임", "AI 던전 마스터 기반\n멀티플레이어 온라인 보드게임", "★★★\n4순위", "12–18개월"],
    ],
    col_widths=[1.5, 3.0, 1.1, 1.4]
)

add_divider(doc2)

# ── 2. 법인 설립 ──────────────────────────────────────────────────────────────
add_heading(doc2, "2. 법인 설립 전략 — Stripe Atlas", 1)

add_heading(doc2, "왜 한국 법인이 아닌 미국 LLC인가", 2)
add_table(doc2,
    ["비교 항목", "미국 LLC (Delaware/Wyoming)", "한국 법인"],
    [
        ["Stripe 결제", "즉시 사용 가능 ✅", "별도 PG사 계약 필요"],
        ["글로벌 신뢰도", "높음 (스타트업 표준)", "낮음 (해외 고객 관점)"],
        ["설립 비용", "$500 (Stripe Atlas)", "₩1,000,000+"],
        ["연간 유지비", "$300 (주정부 수수료)", "₩500,000+"],
        ["투자 유치", "US VC 접근 용이", "제한적"],
        ["세금 처리", "미국 세무사 필요", "한국 세무사"],
    ],
    col_widths=[2.0, 2.5, 2.5]
)

add_heading(doc2, "Stripe Atlas 설립 단계별 가이드", 2)
steps = [
    ("STEP 1", "사전 준비 (1–2일)", [
        "여권 스캔본 준비 (영문)",
        "미국 주소 불필요 — Stripe Atlas가 등록 주소 제공",
        "사업 이름 결정 및 중복 확인: https://icis.corp.delaware.gov",
        "이메일 주소 준비 (사업용 별도 권장)",
    ]),
    ("STEP 2", "Stripe Atlas 신청 (stripe.com/atlas, 약 1시간)", [
        "회사명 입력 (예: WonderKids Inc. / CogniLab Inc.)",
        "사업 유형: LLC 또는 C-Corp 선택 → LLC 권장 (단순, 세금 유연)",
        "창업자 정보 입력 (여권 정보 기반)",
        "비용 결제: $500 USD (카드 결제, 한국 카드 가능)",
        "Stripe 계정 자동 생성됨",
    ]),
    ("STEP 3", "설립 완료 후 처리 (2–4주 소요)", [
        "Delaware 주정부 LLC 승인 → EIN (세금번호) 발급",
        "Stripe Atlas가 이메일로 모든 서류 전달",
        "Mercury Bank 또는 Relay Bank 미국 계좌 개설 (무료, 온라인)",
        "Stripe 결제 활성화 → 첫날부터 달러 수금 가능",
    ]),
    ("STEP 4", "한국 세무 처리", [
        "미국 LLC 소득은 한국 거주자로서 국내 종합소득세 신고 의무",
        "한국 세무사와 계약 권장 (연 ₩300,000–600,000 수준)",
        "미국 세무: 연간 Form 5472 제출 (외국인 소유 LLC 의무) — 세무사 위임",
    ]),
]
for step_id, step_title, step_items in steps:
    p = doc2.add_paragraph()
    run_id = p.add_run(f"{step_id}  ")
    set_font(run_id, size=10, bold=True, color=(204, 120, 92))
    run_title = p.add_run(step_title)
    set_font(run_title, size=10.5, bold=True)
    for item in step_items:
        add_bullet(doc2, item)
    doc2.add_paragraph()

add_heading(doc2, "Lemon Squeezy — Stripe Atlas 이전 대안", 2)
add_body(doc2, "첫 매출 발생 전까지 법인 없이도 즉시 결제 수금 가능한 플랫폼:")
add_table(doc2,
    ["플랫폼", "수수료", "장점", "단점"],
    [
        ["Lemon Squeezy", "5% + $9/월", "세금(VAT) 자동 처리, 법인 불필요", "5% 수수료"],
        ["Gumroad", "10%", "가장 간단, 즉시 시작", "10% 수수료"],
        ["Stripe (직접)", "2.9% + $0.30", "가장 낮은 수수료", "LLC 필요"],
    ],
    col_widths=[1.8, 1.5, 2.2, 1.5]
)
add_body(doc2, "→ 권장 순서: Lemon Squeezy로 즉시 시작 → 월 수익 $500+ 달성 시 Stripe Atlas 진행")

add_divider(doc2)

# ── 3. IP 전략 ────────────────────────────────────────────────────────────────
add_heading(doc2, "3. 지식재산권 (IP) 전략", 1)
add_table(doc2,
    ["IP 종류", "대상", "비용", "시점"],
    [
        ["Provisional Patent\n(임시특허)", "인지과제 독자적 전달 방식\n(Project A-1)", "$320 (USPTO 소기업)", "런칭 직전"],
        ["Copyright", "코드, 캐릭터 아트, UI\n(자동 발생)", "$0", "즉시"],
        ["Trademark\n상표 등록", "WONDER KIDS 브랜드명 + 로고\n(Project A-2)", "$250/클래스 (USPTO)", "캐릭터 확정 후"],
        ["정식 Utility Patent", "Provisional 이후 결정", "$5,000–15,000\n(변리사 포함)", "매출 발생 후"],
        ["PCT 국제출원", "글로벌 제약·병원 시장 공략 시", "$3,000–5,000 추가", "선택 사항"],
    ],
    col_widths=[1.8, 2.5, 1.8, 1.4]
)

add_heading(doc2, "Wonder Kids 캐릭터 IP 보호", 2)
add_bullet(doc2, "5개 캐릭터 (ARIA, CHESS, HATTO, BIBI, SAGE) 전체를 오리지널 IP로 등록")
add_bullet(doc2, "캐릭터명 + 로고 상표 등록 → USPTO (미국) + KIPO (한국) 동시 출원")
add_bullet(doc2, "캐릭터 아트 완성 즉시 저작권 © 표기 적용")
add_bullet(doc2, "캐릭터 굿즈·라이선스가 장기적 핵심 자산")

add_divider(doc2)

# ── 4. 프로젝트별 실행 전략 ──────────────────────────────────────────────────
add_heading(doc2, "4. 프로젝트별 실행 전략", 1)

# Project C
add_heading(doc2, "PROJECT C — 연구 참가자 플랫폼 (1순위)", 2, color=(93, 184, 166))
add_body(doc2, "한국판 Prolific Academic. 대학원생 연구자 ↔ 일반인 참가자 양면 플랫폼.")
add_heading(doc2, "수익 모델", 3)
add_code_block(doc2,
"연구자가 실험 등록 + 참가비 예치\n"
"  → 플랫폼 수수료: 30–35%\n"
"  → 참가자 지급: 65–70%\n\n"
"참가자 보상 옵션:\n"
"  → 현금 (시간당 ₩10,000–15,000 기준)\n"
"  → 무료 인지검사 리포트 (Project A-1 연계 시너지)\n"
"  → 기프티콘 / 포인트"
)
add_heading(doc2, "수익 시뮬레이션", 3)
add_table(doc2,
    ["단계", "월 연구 수", "평균 연구비", "플랫폼 수익 (30%)"],
    [
        ["초기 (6개월)", "20건", "₩300,000", "₩1,800,000/월"],
        ["성장 (12개월)", "100건", "₩400,000", "₩12,000,000/월"],
        ["안정 (24개월)", "500건", "₩500,000", "₩75,000,000/월"],
    ],
    col_widths=[1.8, 1.5, 1.8, 2.4]
)
add_heading(doc2, "닭-달걀 문제 해결 전략", 3)
add_bullet(doc2, "서울 주요 대학 심리학과 2–3곳에 무료 파일럿 제공 → 참가자 풀 먼저 구축")
add_bullet(doc2, "첫 10개 연구는 수수료 면제로 연구자 유치")
add_bullet(doc2, "SNS 대학원생 커뮤니티 (에브리타임, 디시 대학원 갤러리) 타겟 마케팅")
add_heading(doc2, "플랫폼이 제공하는 IRB 관련 서비스", 3)
add_bullet(doc2, "✅ IRB 승인서 제출 의무화 (등록 조건) — 검증은 기관이, 확인은 플랫폼이")
add_bullet(doc2, "✅ 표준 동의서(ICF) 템플릿 제공")
add_bullet(doc2, "✅ 연구 윤리 배지 시스템 (심사 통과 마크)")
add_bullet(doc2, "❌ 직접 IRB 승인 발급 불가 (법적 불가)")

add_divider(doc2)

# Project A-1
add_heading(doc2, "PROJECT A-1 — 인지과제 마켓플레이스 (2순위)", 2, color=(204, 120, 92))
add_body(doc2, "검증된 인지과제 구현물을 디지털 템플릿처럼 라이선스 판매.")
add_heading(doc2, "라이선스 티어 구조", 3)
add_table(doc2,
    ["티어", "가격", "대상", "포함 내용"],
    [
        ["Personal", "$29–49/task", "연구자 개인, 1개 연구", "실행 파일, 논문 인용 키트"],
        ["Commercial", "$149–299/task", "앱 개발자, 스타트업", "소스코드, 수정 가능"],
        ["Developer", "$499+/task", "재배포·화이트레이블", "전체 수정 + 재판매 가능"],
        ["Bundle Pack", "$199–799", "5–10개 묶음", "위 티어 중 선택 적용"],
    ],
    col_widths=[1.5, 1.8, 2.0, 2.2]
)
add_heading(doc2, "초기 출시 태스크 목록", 3)
add_bullet(doc2, "N-back Task (작업 기억 측정)")
add_bullet(doc2, "Stroop Task (인지 억제 측정)")
add_bullet(doc2, "Trail Making Test A & B (처리 속도·인지 유연성)")
add_bullet(doc2, "Continuous Performance Test (주의력 측정)")
add_bullet(doc2, "Spatial Span Task (공간 기억)")

add_heading(doc2, "판매 채널", 3)
add_bullet(doc2, "자체 데모 사이트 (Next.js, Vercel 호스팅)")
add_bullet(doc2, "Lemon Squeezy 스토어 임베드")
add_bullet(doc2, "r/Neuropsychology, r/psychology 커뮤니티 마케팅")
add_bullet(doc2, "학술 SNS (ResearchGate, Academia.edu) 배포")

add_divider(doc2)

# Project A-2
add_heading(doc2, "PROJECT A-2 — Wonder Kids 아동 학습 게임 (3순위)", 2, color=(130, 90, 180))
add_body(doc2, "이상한 나라 + 오즈 세계관 오리지널 캐릭터 기반. 70% 영상 + 30% 인터랙션.")
add_heading(doc2, "수익 모델", 3)
add_table(doc2,
    ["채널", "가격", "시점"],
    [
        ["웹앱 구독 (1단계)", "₩5,900/월 또는 ₩49,000/년", "MVP 출시 즉시"],
        ["iOS/Android 앱 구독", "$4.99/월 또는 $39.99/년", "앱 출시 후"],
        ["유치원·어린이집 라이선스", "₩50,000–200,000/월", "6개월 이후"],
        ["캐릭터 굿즈 (장기)", "별도 계약", "IP 확립 후"],
    ],
    col_widths=[2.5, 2.5, 2.0]
)
add_heading(doc2, "콘텐츠 AI 활용 원가 절감", 3)
add_table(doc2,
    ["작업", "기존 비용", "AI 활용 비용", "절감률"],
    [
        ["캐릭터 디자인 초안", "$2,000", "$200 (Midjourney + 작가 정제)", "90%"],
        ["배경 아트", "$500/장", "$50 (AI + 수정)", "90%"],
        ["스토리 스크립트", "$300/편", "$30 (Claude + 편집)", "90%"],
        ["더빙 스크립트", "$200/편", "$20 (Claude)", "90%"],
        ["더빙 음성", "$1,000/편", "$100 (ElevenLabs + 감수)", "90%"],
    ],
    col_widths=[2.0, 1.5, 2.5, 1.0]
)
add_heading(doc2, "COPPA / 아동 개인정보 규제 주의사항", 3)
add_bullet(doc2, "만 13세 미만 대상 앱: COPPA 적용 (미국 배포 시)")
add_bullet(doc2, "행동 타겟 광고 금지 → 광고 기반 수익 모델 처음부터 제외")
add_bullet(doc2, "부모 동의 없이 데이터 수집 금지")
add_bullet(doc2, "iOS 아동 카테고리 앱: 별도 심사 기준 적용")
add_bullet(doc2, "한국: 아동·청소년 개인정보보호법 별도 적용")

add_divider(doc2)

# Project B
add_heading(doc2, "PROJECT B — AI 보드게임 (4순위)", 2, color=(232, 165, 90))
add_body(doc2, "AI 던전 마스터 기반 실시간 멀티플레이어 온라인 보드게임.")
add_heading(doc2, "기술 스택", 3)
add_code_block(doc2,
"Client:     Phaser.js (웹 퍼스트) → Godot 4 (Steam/모바일 포팅)\n"
"Backend:    Supabase Realtime (멀티플레이어) + Supabase Auth\n"
"AI DM:      Claude claude-haiku-4-5 (빠른 응답) + claude-sonnet-4-6 (복잡한 서사)\n"
"Deployment: Vercel (웹) → Steam Direct ($100) → App Store ($99/yr)"
)
add_heading(doc2, "AI API 비용 관리", 3)
add_bullet(doc2, "공통 NPC 대화·규칙 설명은 캐싱 처리 (반복 API 호출 방지)")
add_bullet(doc2, "Free 티어: AI 인터랙션 횟수 제한 / Pro 티어: 무제한")
add_bullet(doc2, "세션 토큰 예산 설정 (사용자 티어별)")

add_divider(doc2)

# ── 5. 통합 로드맵 ────────────────────────────────────────────────────────────
add_heading(doc2, "5. 통합 실행 로드맵", 1)
add_table(doc2,
    ["기간", "주요 마일스톤", "목표 수익"],
    [
        ["Month 1", "Lemon Squeezy 계정 개설\nProject A-1: N-back 태스크 첫 버전 개발\nProject C: 랜딩 페이지 + 대학 피치 시작", "$0 (준비)"],
        ["Month 2–3", "Project A-1: 데모 사이트 + 3개 태스크 출시\nProject C: 첫 파일럿 연구 2–3건 온보딩\nProvisional Patent 1건 출원", "$200–800/월"],
        ["Month 3–5", "Project C: 정식 오픈 (수수료 수익 시작)\nProject A-1: Product Hunt / Reddit 런칭\nStripe Atlas LLC 설립", "$1,000–3,000/월"],
        ["Month 5–8", "Wonder Kids 캐릭터 확정 + 상표 등록\n첫 에피소드 제작 (AI 활용)\nProject B: 프로토타입 개발 시작", "$3,000–8,000/월"],
        ["Month 8–12", "Wonder Kids 웹앱 구독 출시\nProject B: 웹 오픈 베타\nProject A-1 정식 특허 검토", "$8,000–20,000/월"],
        ["Month 12+", "Wonder Kids iOS/Android 출시\nProject B: Steam Early Access\nProject C 아시아 확장", "$20,000+/월"],
    ],
    col_widths=[1.3, 3.7, 2.0]
)

add_divider(doc2)

# ── 6. 초기 자금 ─────────────────────────────────────────────────────────────
add_heading(doc2, "6. 초기 자금 요약 (수정본)", 1)
add_table(doc2,
    ["항목", "USD", "KRW", "시점"],
    [
        ["도메인 × 2–3개", "$30–45", "₩41,000–62,000", "즉시"],
        ["Lemon Squeezy", "$9/월", "₩12,400/월", "즉시"],
        ["Claude API (개발)", "$50/월", "₩69,000/월", "즉시"],
        ["Vercel + Supabase (Free)", "$0", "₩0", "즉시"],
        ["Provisional Patent (1건)", "$320", "₩442,000", "첫 태스크 완성 후"],
        ["Stripe Atlas LLC", "$500", "₩690,000", "첫 수익 발생 후"],
        ["Wonder Kids 상표 등록", "$250/클래스", "₩345,000", "캐릭터 확정 후"],
        ["캐릭터 디자인 (AI + 작가)", "$500–2,000", "₩690,000–2,760,000", "Project A-2 시작 시"],
        ["Apple Developer", "$99/년", "₩137,000/년", "앱 출시 전"],
        ["Steam Direct", "$100/게임", "₩138,000", "Project B 출시 전"],
        ["─── 초기 필수 합계 ───", "~$410", "~₩565,000", "Month 1"],
        ["─── 1년 총합 (최소) ───", "~$3,500", "~₩4,830,000", "전체"],
    ],
    col_widths=[2.5, 1.2, 1.8, 2.0]
)

add_divider(doc2)

# ── 7. 리스크 매트릭스 ───────────────────────────────────────────────────────
add_heading(doc2, "7. 리스크 매트릭스", 1)
add_table(doc2,
    ["리스크", "심각도", "가능성", "대응 전략"],
    [
        ["Wonder Kids IP 분쟁\n(디즈니 유사성)", "높음", "낮음\n(오리지널 디자인 시)", "캐릭터 완전 오리지널화\n+ 상표 등록"],
        ["Project C 닭-달걀\n문제", "중간", "높음", "대학 파일럿 무료 제공\n→ 참가자 풀 선구축"],
        ["COPPA 위반\n(Wonder Kids)", "높음", "중간", "광고 제거\n+ 법률 자문"],
        ["AI API 비용 증가\n(Project B)", "중간", "중간", "캐싱 + 토큰 예산\n+ 티어제"],
        ["1인 개발 번아웃", "높음", "높음", "프로젝트 순차 진행\n동시 병행 최소화"],
    ],
    col_widths=[2.0, 1.0, 1.0, 3.0]
)

add_divider(doc2)

# ── 8. 핵심 원칙 ────────────────────────────────────────────────────────────
add_heading(doc2, "8. 1인 AI 사업 핵심 원칙", 1)
principles = [
    ("수익화 우선", "완벽한 제품보다 첫 $1 먼저. Lemon Squeezy로 결제 즉시 연결."),
    ("AI로 70–80% 해결", "스크립트·코드·디자인 초안·마케팅 카피 전부 Claude 먼저. 사람은 검수만."),
    ("IP는 초기부터", "캐릭터·태스크 확정 즉시 Provisional Patent + Copyright 표기."),
    ("법인은 수익 후", "Lemon Squeezy → 월 $500+ → Stripe Atlas 순서. 비용 낭비 없음."),
    ("순차 집중", "Project C → A-1 → A-2 → B 순서 엄수. 동시 4개는 실패 보장."),
]
for title, body in principles:
    p = doc2.add_paragraph()
    run1 = p.add_run(f"• {title}: ")
    set_font(run1, size=10.5, bold=True, color=(204, 120, 92))
    run2 = p.add_run(body)
    set_font(run2, size=10.5)
    p.paragraph_format.space_after = Pt(6)

doc2.save("/home/user/ClaudeBusiness/Business_Strategy_Master_Plan.docx")
print("DOC2 saved.")
