#!/usr/bin/env python3
"""Generate the Creator Types quiz question bank.

Reads /tmp/ct.psv (creator_types) and /tmp/gc.psv (game_cards) and emits:
  - src/data/quizQuestions.ts   (typed TS bank)
  - /mnt/documents/quiz-questions.csv (review sheet for A'Hara)
"""
import csv, json, random, re, os, textwrap
from collections import defaultdict

random.seed(13)

CT = []
with open('/tmp/ct.psv') as f:
    for line in f:
        parts = line.rstrip('\n').split('|')
        if len(parts) < 8: continue
        name, family, element, team_role, signature, at_table, shadow, ymbi = parts[:8]
        CT.append(dict(name=name, family=family, element=element, team_role=team_role,
                       signature=signature, at_table=at_table, shadow=shadow, ymbi=ymbi))

CARDS = []
with open('/tmp/gc.psv') as f:
    for line in f:
        parts = line.rstrip('\n').split('|')
        if len(parts) < 3: continue
        CARDS.append(dict(name=parts[0], type_a=parts[1], type_b=parts[2]))

BY_NAME = {c['name']: c for c in CT}
FAMILIES = sorted({c['family'] for c in CT})           # Catalysts, Humanists, Optimists, Realists
ELEMENTS = sorted({c['element'] for c in CT})          # Air, Earth, Fire, Sky, Water
TEAM_ROLES = sorted({c['team_role'] for c in CT if c['team_role']})

# Animals by type
BY_TYPE = defaultdict(list)
for card in CARDS:
    BY_TYPE[card['type_a']].append(card['name'])
    BY_TYPE[card['type_b']].append(card['name'])

def first_sentence(text):
    """Extract short distinctive first sentence (max ~140 chars)."""
    if not text: return ''
    # Split on '. ' or '— '
    parts = re.split(r'(?<=[.!?])\s+', text.strip())
    s = parts[0]
    if len(s) > 160 and len(parts) > 1:
        s = parts[0]
    return s.strip()

def strip_name(text, name):
    """Redact the creator name so a question isn't self-answering."""
    if not text: return text
    return re.sub(r'\b' + re.escape(name) + r'\b', '___', text, flags=re.IGNORECASE)

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

# ── 1. Family (13) ─────────────────────────────────────────────────────────────
for c in CT:
    BANK.append(mc(
        f"{c['name']} Creator is part of which Family?",
        c['family'], pick_distractors(c['family'], FAMILIES),
        f"{c['name']} belongs to the {c['family']} family.",
        'family_recall', c['name'], 'family',
    ))

# ── 2. Element (13) ────────────────────────────────────────────────────────────
for c in CT:
    BANK.append(mc(
        f"Which element governs the {c['name']} Creator?",
        c['element'], pick_distractors(c['element'], ELEMENTS),
        f"{c['name']} is an {c['element']} type.",
        'element_recall', c['name'], 'element',
    ))

# ── 3. Team Role (13) ──────────────────────────────────────────────────────────
for c in CT:
    if not c['team_role']: continue
    BANK.append(mc(
        f"What team role does the {c['name']} Creator play?",
        c['team_role'], pick_distractors(c['team_role'], TEAM_ROLES),
        f"{c['name']} operates as a {c['team_role']}.",
        'team_role_recall', c['name'], 'team_role',
    ))

# ── 4. Reverse identification: family + team_role → creator (13) ───────────────
# Only where the (family, team_role) pair is unique.
pair_counts = defaultdict(list)
for c in CT:
    pair_counts[(c['family'], c['team_role'])].append(c['name'])
for c in CT:
    peers = pair_counts[(c['family'], c['team_role'])]
    if len(peers) != 1: continue
    others = [x['name'] for x in CT if x['name'] != c['name']]
    BANK.append(mc(
        f"Which Creator is the {c['family']} {c['team_role']}?",
        c['name'], pick_distractors(c['name'], others),
        f"{c['name']} is the {c['family']} {c['team_role']}.",
        'reverse_family_role', c['name'], 'reverse',
    ))

# ── 5. Signature "Who am I?" (13) ──────────────────────────────────────────────
for c in CT:
    snippet = first_sentence(strip_name(c['signature'], c['name']))
    if not snippet: continue
    others = [x['name'] for x in CT if x['name'] != c['name']]
    BANK.append(mc(
        f'Which Creator has this Natural State?\n\n"{snippet}"',
        c['name'], pick_distractors(c['name'], others),
        f"That's the signature of the {c['name']} Creator.",
        'signature_whoami', c['name'], 'signature',
    ))

# ── 6. Shadow Side "Identify the shadow" (13) ──────────────────────────────────
for c in CT:
    snippet = first_sentence(strip_name(c['shadow'], c['name']))
    if not snippet: continue
    others = [x['name'] for x in CT if x['name'] != c['name']]
    BANK.append(mc(
        f'Which Creator\'s Disaster State is this?\n\n"{snippet}"',
        c['name'], pick_distractors(c['name'], others),
        f"That's how {c['name']} looks in shadow.",
        'shadow_whoami', c['name'], 'shadow',
    ))

# ── 7. At the Table "Who leads like this?" (13) ────────────────────────────────
for c in CT:
    snippet = first_sentence(strip_name(c['at_table'], c['name']))
    if not snippet: continue
    others = [x['name'] for x in CT if x['name'] != c['name']]
    BANK.append(mc(
        f'Which Creator shows up at the table like this?\n\n"{snippet}"',
        c['name'], pick_distractors(c['name'], others),
        f"That's the {c['name']} contribution at the table.",
        'at_table_whoami', c['name'], 'at_table',
    ))

# ── 8. You Might Be If (13) ────────────────────────────────────────────────────
for c in CT:
    snippet = first_sentence(strip_name(c['ymbi'], c['name']))
    if not snippet: continue
    others = [x['name'] for x in CT if x['name'] != c['name']]
    BANK.append(mc(
        f'You might be which Creator if...\n\n"{snippet}"',
        c['name'], pick_distractors(c['name'], others),
        f"That's a classic {c['name']} tell.",
        'ymbi_whoami', c['name'], 'ymbi',
    ))

# ── 9. Compare Creators (family match) ~13 ────────────────────────────────────
# "Which of these two shares X's family?"
by_family = defaultdict(list)
for c in CT:
    by_family[c['family']].append(c['name'])
for c in CT:
    same_fam = [n for n in by_family[c['family']] if n != c['name']]
    diff_fam = [x['name'] for x in CT if x['family'] != c['family']]
    if not same_fam or len(diff_fam) < 3: continue
    correct = random.choice(same_fam)
    distractors = pick_distractors(correct, diff_fam, 3)
    BANK.append(mc(
        f"Which of these Creators shares the same Family as {c['name']}?",
        correct, distractors,
        f"Both {c['name']} and {correct} are {c['family']}.",
        'compare_family', c['name'], 'compare',
    ))

# ── 10. Compare Creators (element match) ~13 ──────────────────────────────────
by_elem = defaultdict(list)
for c in CT:
    by_elem[c['element']].append(c['name'])
for c in CT:
    same = [n for n in by_elem[c['element']] if n != c['name']]
    diff = [x['name'] for x in CT if x['element'] != c['element']]
    if not same or len(diff) < 3: continue
    correct = random.choice(same)
    BANK.append(mc(
        f"Which Creator shares {c['name']}'s element ({c['element']})?",
        correct, pick_distractors(correct, diff, 3),
        f"{c['name']} and {correct} are both {c['element']} types.",
        'compare_element', c['name'], 'compare',
    ))

# ── 11. "Which is NOT" — family (13) ──────────────────────────────────────────
for fam in FAMILIES:
    members = by_family[fam]
    non_members = [c['name'] for c in CT if c['family'] != fam]
    if len(members) < 3 or not non_members: continue
    # Do multiple per family so we get ~13 total; cap at 4 each
    for _ in range(min(4, len(members))):
        correct = random.choice(non_members)  # the "NOT" one is the answer
        random.shuffle(members)
        wrong = members[:3]
        BANK.append(mc(
            f"Which of these Creators is NOT a {fam} Family member?",
            correct, wrong,
            f"{correct} is a {BY_NAME[correct]['family']}, not a {fam}.",
            'not_family', None, 'exclusion',
        ))

# ── 12. "Which is NOT" — element (13) ─────────────────────────────────────────
for elem in ELEMENTS:
    members = by_elem[elem]
    non_members = [c['name'] for c in CT if c['element'] != elem]
    if len(members) < 3 or not non_members: continue
    for _ in range(min(3, len(members))):
        correct = random.choice(non_members)
        random.shuffle(members)
        wrong = members[:3]
        BANK.append(mc(
            f"Which of these Creators is NOT a {elem} type?",
            correct, wrong,
            f"{correct} is {BY_NAME[correct]['element']}, not {elem}.",
            'not_element', None, 'exclusion',
        ))

# ── 13. Animal → Creator Type recall (~26) ────────────────────────────────────
# "Which Creator type is the Bear?" (dual — either answer is correct-ish; pick type_a and add non-types as distractors)
for card in CARDS:
    correct = card['type_a']
    non_types = [t for t in BY_TYPE.keys() if t not in (card['type_a'], card['type_b'])]
    if len(non_types) < 3: continue
    random.shuffle(non_types)
    BANK.append(mc(
        f"The {card['name']} card is which Creator type? (pick one)",
        correct, non_types[:3],
        f"{card['name']} = {card['type_a']} + {card['type_b']}.",
        'animal_type', None, 'animals',
    ))

# ── 14. "Which animal is NOT a X" (~13) ───────────────────────────────────────
for t in BY_TYPE:
    in_type = BY_TYPE[t]
    out_type = [c['name'] for c in CARDS if t not in (c['type_a'], c['type_b'])]
    if len(in_type) < 3 or not out_type: continue
    for _ in range(2):
        correct = random.choice(out_type)      # NOT-in-type is the answer
        random.shuffle(in_type)
        wrong = in_type[:3]
        if len(wrong) < 3: continue
        BANK.append(mc(
            f"Which of these animals is NOT a {t} type?",
            correct, wrong,
            f"{correct} is a {BY_NAME.get(correct, {}).get('name', correct)}… actually: {BY_NAME}",
            'not_animal_type', None, 'animals',
        ))
# Fix bad explanations from the block above:
for q in BANK:
    if q['style'] == 'not_animal_type':
        correct = q['options'][q['correct_index']]
        card = next((c for c in CARDS if c['name'] == correct), None)
        if card:
            q['explanation'] = f"{correct} is {card['type_a']} + {card['type_b']} — no overlap with the type asked."

# ── 15. "Which two animals share type X" (scenario) ~13 ───────────────────────
for t in BY_TYPE:
    in_type = BY_TYPE[t]
    if len(in_type) < 2: continue
    correct = random.choice(in_type)
    non = [c['name'] for c in CARDS if t not in (c['type_a'], c['type_b'])]
    if len(non) < 3: continue
    random.shuffle(non)
    BANK.append(mc(
        f"Which of these animals carries {t} as one of its Creator types?",
        correct, non[:3],
        f"{correct} is part-{t}.",
        'animal_has_type', None, 'animals',
    ))

# ── Persist ───────────────────────────────────────────────────────────────────
os.makedirs('/mnt/documents', exist_ok=True)

# CSV for review
with open('/mnt/documents/quiz-questions.csv', 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow(['#','category','style','creator','prompt','A','B','C','D','correct','explanation'])
    for i, q in enumerate(BANK, 1):
        opts = q['options'] + ['']*(4-len(q['options']))
        w.writerow([i, q['category'], q['style'], q['creator'] or '',
                    q['prompt'], *opts, 'ABCD'[q['correct_index']], q['explanation']])

# TS bank
os.makedirs('src/data', exist_ok=True)
ts_header = '''// AUTO-GENERATED by scripts/gen-quiz-bank.py — do not hand-edit.
// Multiple-choice question bank for the Creator Types learning layer.
// Regenerate with: python scripts/gen-quiz-bank.py

export type QuizStyle =
  | 'family_recall' | 'element_recall' | 'team_role_recall'
  | 'reverse_family_role'
  | 'signature_whoami' | 'shadow_whoami' | 'at_table_whoami' | 'ymbi_whoami'
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
  options: string[];          // always 4
  correct_index: number;      // 0..3
  explanation: string;        // one-line teaching moment
  style: QuizStyle;
  category: QuizCategory;
  creator: string | null;     // subject Creator when scoped to one
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

# Summary
from collections import Counter
by_style = Counter(q['style'] for q in BANK)
by_cat = Counter(q['category'] for q in BANK)
print(f'TOTAL: {len(BANK)} questions')
print('By style:', dict(by_style))
print('By category:', dict(by_cat))
