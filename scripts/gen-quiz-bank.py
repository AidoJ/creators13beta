#!/usr/bin/env python3
"""Generate the Creator Types quiz question bank.

Reads /tmp/ct.psv (creator_types) and /tmp/gc.psv (game_cards) and emits:
  - src/data/quizQuestions.ts        (typed TS bank)
  - /mnt/documents/quiz-questions.csv (review sheet for A'Hara)

Design principles (v2, hand-tuned after review):
  * Every prompt is a complete, self-contained question. No dangling
    "You might be if..." fragments.
  * Passage-based questions (signature / at the table / shadow / you might
    be if) use the FULL passage verbatim, with the creator's name redacted
    so it's not self-answering.
  * For each of those four passage fields we generate BOTH directions:
      (a) statement → Creator ("Which Creator does this describe?")
      (b) Creator  → statement ("Which statement best describes X?")
    The (b) form uses full passages from three other creators as
    distractors — high signal, low noise.
"""
import csv, json, random, re, os
from collections import defaultdict, Counter

random.seed(13)

CT = []
with open('/tmp/ct.psv') as f:
    for line in f:
        parts = line.rstrip('\n').split('|')
        if len(parts) < 8:
            continue
        name, family, element, team_role, signature, at_table, shadow, ymbi = parts[:8]
        CT.append(dict(
            name=name, family=family, element=element, team_role=team_role,
            signature=signature.strip(),
            at_table=at_table.strip(),
            shadow=shadow.strip(),
            ymbi=ymbi.strip(),
        ))

CARDS = []
with open('/tmp/gc.psv') as f:
    for line in f:
        parts = line.rstrip('\n').split('|')
        if len(parts) < 3:
            continue
        CARDS.append(dict(name=parts[0], type_a=parts[1], type_b=parts[2]))

BY_NAME = {c['name']: c for c in CT}
FAMILIES = sorted({c['family'] for c in CT})
ELEMENTS = sorted({c['element'] for c in CT})
TEAM_ROLES = sorted({c['team_role'] for c in CT if c['team_role']})

BY_TYPE = defaultdict(list)
for card in CARDS:
    BY_TYPE[card['type_a']].append(card['name'])
    BY_TYPE[card['type_b']].append(card['name'])

def redact(text, name):
    """Redact the creator's own name (and obvious possessives) from a passage
    so the question isn't self-answering."""
    if not text:
        return text
    # Order matters: possessive first.
    text = re.sub(r"\b" + re.escape(name) + r"'s\b", "this Creator's", text, flags=re.IGNORECASE)
    text = re.sub(r"\bA " + re.escape(name) + r"\b", "This Creator", text)
    text = re.sub(r"\bAn " + re.escape(name) + r"\b", "This Creator", text)
    text = re.sub(r"\bthe " + re.escape(name) + r"\b", "this Creator", text)
    text = re.sub(r"\b" + re.escape(name) + r"\b", "this Creator", text, flags=re.IGNORECASE)
    return text

def pick_distractors(correct, pool, n=3):
    opts = [x for x in pool if x != correct]
    random.shuffle(opts)
    return opts[:n]

def mc(prompt, correct, distractors, explanation, style, creator=None, category=None):
    options = [correct] + list(distractors)
    random.shuffle(options)
    return dict(
        prompt=prompt,
        options=options,
        correct_index=options.index(correct),
        explanation=explanation,
        style=style,
        creator=creator,
        category=category,
    )

BANK = []

# ── 1. Family recall (13) ─────────────────────────────────────────────────────
for c in CT:
    BANK.append(mc(
        f"The {c['name']} Creator belongs to which Family?",
        c['family'], pick_distractors(c['family'], FAMILIES),
        f"{c['name']} is a {c['family']} — {c['family_reason'] if False else ''}".strip(' —'),
        'family_recall', c['name'], 'family',
    ))

# ── 2. Element recall (13) ────────────────────────────────────────────────────
for c in CT:
    BANK.append(mc(
        f"Which element governs the {c['name']} Creator?",
        c['element'], pick_distractors(c['element'], ELEMENTS),
        f"{c['name']} is an {c['element']} Creator.",
        'element_recall', c['name'], 'element',
    ))

# ── 3. Team role recall (13) ──────────────────────────────────────────────────
for c in CT:
    if not c['team_role']:
        continue
    BANK.append(mc(
        f"What role does the {c['name']} Creator play on a team?",
        c['team_role'], pick_distractors(c['team_role'], TEAM_ROLES),
        f"{c['name']} operates as a {c['team_role']}.",
        'team_role_recall', c['name'], 'team_role',
    ))

# ── 4. Reverse identification: family + team_role → creator ───────────────────
pair_counts = defaultdict(list)
for c in CT:
    pair_counts[(c['family'], c['team_role'])].append(c['name'])
for c in CT:
    peers = pair_counts[(c['family'], c['team_role'])]
    if len(peers) != 1:
        continue
    others = [x['name'] for x in CT if x['name'] != c['name']]
    BANK.append(mc(
        f"Which Creator is the {c['family']} Family's {c['team_role']}?",
        c['name'], pick_distractors(c['name'], others),
        f"{c['name']} is the {c['family']} {c['team_role']}.",
        'reverse_family_role', c['name'], 'reverse',
    ))

# ── Passage-based question generators ────────────────────────────────────────
# For each of the four narrative fields we produce TWO question directions.

PASSAGE_FIELDS = [
    # (field, category, style_a→creator, style_b→passage, prompt_a, prompt_b, expl_a, expl_b)
    ('signature', 'signature', 'signature_whoami', 'signature_describes',
     'Which Creator does the following Natural State describe?\n\n"{p}"',
     'Which of the following best describes the Natural State (Signature) of the {name} Creator?',
     "That's the signature of the {name} Creator.",
     "That passage is the signature of {name}."),
    ('at_table', 'at_table', 'at_table_whoami', 'at_table_describes',
     'Which Creator shows up at the table like this?\n\n"{p}"',
     'Which of the following best describes how the {name} Creator shows up at the table?',
     "That's how {name} contributes at the table.",
     "That passage describes {name} at the table."),
    ('shadow', 'shadow', 'shadow_whoami', 'shadow_describes',
     "Which Creator's Disaster State does this describe?\n\n\"{p}\"",
     "Which of the following best describes the Disaster State (Shadow Side) of the {name} Creator?",
     "That's how {name} looks in shadow.",
     "That passage describes the shadow of {name}."),
    ('ymbi', 'ymbi', 'ymbi_whoami', 'ymbi_describes',
     'You might be which Creator if the following was said about you?\n\n"{p}"',
     'Which of the following statements would you expect to hear about a {name} Creator?',
     "That's a classic {name} tell.",
     "That statement is a {name} tell."),
]

for field, category, style_a, style_b, prompt_a, prompt_b, expl_a, expl_b in PASSAGE_FIELDS:
    # (a) passage → Creator
    for c in CT:
        passage = redact(c[field], c['name'])
        if not passage:
            continue
        others = [x['name'] for x in CT if x['name'] != c['name']]
        BANK.append(mc(
            prompt_a.format(p=passage),
            c['name'], pick_distractors(c['name'], others),
            expl_a.format(name=c['name']),
            style_a, c['name'], category,
        ))
    # (b) Creator → passage (correct = own passage; distractors = three other creators' passages)
    for c in CT:
        correct_passage = redact(c[field], c['name'])
        if not correct_passage:
            continue
        pool = [(x['name'], redact(x[field], x['name'])) for x in CT if x['name'] != c['name'] and x[field]]
        random.shuffle(pool)
        distractors = [p for _, p in pool[:3]]
        if len(distractors) < 3:
            continue
        BANK.append(mc(
            prompt_b.format(name=c['name']),
            correct_passage, distractors,
            expl_b.format(name=c['name']),
            style_b, c['name'], category,
        ))

# ── Compare Creators (shared family) ──────────────────────────────────────────
by_family = defaultdict(list)
for c in CT:
    by_family[c['family']].append(c['name'])
for c in CT:
    same_fam = [n for n in by_family[c['family']] if n != c['name']]
    diff_fam = [x['name'] for x in CT if x['family'] != c['family']]
    if not same_fam or len(diff_fam) < 3:
        continue
    correct = random.choice(same_fam)
    BANK.append(mc(
        f"Which Creator shares the same Family as {c['name']}?",
        correct, pick_distractors(correct, diff_fam, 3),
        f"Both {c['name']} and {correct} are {c['family']}.",
        'compare_family', c['name'], 'compare',
    ))

# ── Compare Creators (shared element) ─────────────────────────────────────────
by_elem = defaultdict(list)
for c in CT:
    by_elem[c['element']].append(c['name'])
for c in CT:
    same = [n for n in by_elem[c['element']] if n != c['name']]
    diff = [x['name'] for x in CT if x['element'] != c['element']]
    if not same or len(diff) < 3:
        continue
    correct = random.choice(same)
    BANK.append(mc(
        f"Which Creator shares the same element ({c['element']}) as {c['name']}?",
        correct, pick_distractors(correct, diff, 3),
        f"{c['name']} and {correct} are both {c['element']} Creators.",
        'compare_element', c['name'], 'compare',
    ))

# ── "Which is NOT" — family ───────────────────────────────────────────────────
for fam in FAMILIES:
    members = by_family[fam][:]
    non_members = [c['name'] for c in CT if c['family'] != fam]
    if len(members) < 3 or not non_members:
        continue
    for _ in range(min(4, len(members))):
        correct = random.choice(non_members)  # the outsider is the answer
        random.shuffle(members)
        wrong = members[:3]
        if len(wrong) < 3:
            continue
        BANK.append(mc(
            f"Which of these Creators is NOT part of the {fam} Family?",
            correct, wrong,
            f"{correct} is a {BY_NAME[correct]['family']}, not a {fam}.",
            'not_family', None, 'exclusion',
        ))

# ── "Which is NOT" — element ──────────────────────────────────────────────────
for elem in ELEMENTS:
    members = by_elem[elem][:]
    non_members = [c['name'] for c in CT if c['element'] != elem]
    if len(members) < 3 or not non_members:
        continue
    for _ in range(min(3, len(members))):
        correct = random.choice(non_members)
        random.shuffle(members)
        wrong = members[:3]
        if len(wrong) < 3:
            continue
        BANK.append(mc(
            f"Which of these Creators is NOT a {elem} type?",
            correct, wrong,
            f"{correct} is {BY_NAME[correct]['element']}, not {elem}.",
            'not_element', None, 'exclusion',
        ))

# ── Animal → Creator type ─────────────────────────────────────────────────────
for card in CARDS:
    correct = card['type_a']
    non_types = [t for t in BY_TYPE.keys() if t not in (card['type_a'], card['type_b'])]
    if len(non_types) < 3:
        continue
    random.shuffle(non_types)
    BANK.append(mc(
        f"The {card['name']} card carries which Creator type? (either half counts — pick one shown)",
        correct, non_types[:3],
        f"{card['name']} is {card['type_a']} + {card['type_b']}.",
        'animal_type', None, 'animals',
    ))

# ── "Which animal is NOT a X" ─────────────────────────────────────────────────
for t in BY_TYPE:
    in_type = BY_TYPE[t][:]
    out_type = [c['name'] for c in CARDS if t not in (c['type_a'], c['type_b'])]
    if len(in_type) < 3 or not out_type:
        continue
    for _ in range(2):
        correct = random.choice(out_type)
        random.shuffle(in_type)
        wrong = in_type[:3]
        if len(wrong) < 3:
            continue
        card = next(c for c in CARDS if c['name'] == correct)
        BANK.append(mc(
            f"Which of these animals does NOT carry {t} as one of its Creator types?",
            correct, wrong,
            f"{correct} is {card['type_a']} + {card['type_b']} — no {t}.",
            'not_animal_type', None, 'animals',
        ))

# ── "Which animal carries type X?" ────────────────────────────────────────────
for t in BY_TYPE:
    in_type = BY_TYPE[t]
    if len(in_type) < 1:
        continue
    correct = random.choice(in_type)
    non = [c['name'] for c in CARDS if t not in (c['type_a'], c['type_b'])]
    if len(non) < 3:
        continue
    random.shuffle(non)
    BANK.append(mc(
        f"Which of these animals carries {t} as one of its Creator types?",
        correct, non[:3],
        f"{correct} is part-{t}.",
        'animal_has_type', None, 'animals',
    ))

# ── Persist ──────────────────────────────────────────────────────────────────
os.makedirs('/mnt/documents', exist_ok=True)
with open('/mnt/documents/quiz-questions.csv', 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow(['#','category','style','creator','prompt','A','B','C','D','correct','explanation'])
    for i, q in enumerate(BANK, 1):
        opts = q['options'] + [''] * (4 - len(q['options']))
        w.writerow([i, q['category'], q['style'], q['creator'] or '',
                    q['prompt'], *opts, 'ABCD'[q['correct_index']], q['explanation']])

os.makedirs('src/data', exist_ok=True)
ts_header = '''// AUTO-GENERATED by scripts/gen-quiz-bank.py — do not hand-edit.
// Multiple-choice question bank for the Creator Types learning layer.
// Regenerate with: python scripts/gen-quiz-bank.py

export type QuizStyle =
  | 'family_recall' | 'element_recall' | 'team_role_recall'
  | 'reverse_family_role'
  | 'signature_whoami' | 'signature_describes'
  | 'shadow_whoami' | 'shadow_describes'
  | 'at_table_whoami' | 'at_table_describes'
  | 'ymbi_whoami' | 'ymbi_describes'
  | 'compare_family' | 'compare_element'
  | 'not_family' | 'not_element'
  | 'animal_type' | 'not_animal_type' | 'animal_has_type';

export type QuizCategory =
  | 'family' | 'element' | 'team_role' | 'reverse'
  | 'signature' | 'shadow' | 'at_table' | 'ymbi'
  | 'compare' | 'exclusion' | 'animals';

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: string[];       // always 4
  correct_index: number;   // 0..3
  explanation: string;     // one-line teaching moment
  style: QuizStyle;
  category: QuizCategory;
  creator: string | null;  // subject Creator when scoped to one
}

'''
with open('src/data/quizQuestions.ts', 'w') as f:
    f.write(ts_header)
    f.write('export const QUIZ_QUESTIONS: QuizQuestion[] = ')
    out = []
    for i, q in enumerate(BANK, 1):
        out.append({
            'id': f'q{i:04d}',
            'prompt': q['prompt'],
            'options': q['options'],
            'correct_index': q['correct_index'],
            'explanation': q['explanation'],
            'style': q['style'],
            'category': q['category'],
            'creator': q['creator'],
        })
    f.write(json.dumps(out, indent=2, ensure_ascii=False))
    f.write(';\n')

by_style = Counter(q['style'] for q in BANK)
by_cat = Counter(q['category'] for q in BANK)
print(f'TOTAL: {len(BANK)} questions')
print('By style:', dict(by_style))
print('By category:', dict(by_cat))
