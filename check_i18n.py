# -*- coding: utf-8 -*-
"""
בודק שכל טקסט עברי גלוי בתוסף מסומן לתרגום ושיש לו ערך במילון.

מדווח על שלושה סוגי בעיות:
  [לא מסומן]  טקסט עברי ב-HTML שאין עליו data-i18n — לא יתורגם כלל
  [חסר במילון] מחרוזת מסומנת/עטופה ב-I18n.t שאין לה ערך ב-en.js
  [מיותר]      ערך ב-en.js שאינו בשימוש

הרצה:  python check_i18n.py <שם-תוסף>
"""
import os, io, re, sys, json

BASE = os.path.dirname(os.path.abspath(__file__))
SRC  = os.path.join(BASE, "src-תוספים")
HEB  = re.compile(r"[֐-׿]")


def load_dict(d):
    p = os.path.join(d, "i18n", "en.js")
    if not os.path.exists(p):
        return None
    s = io.open(p, encoding="utf-8").read()
    # המפתחות הם מחרוזות בגרשיים בצד שמאל של נקודתיים
    return set(re.findall(r"^\s*'((?:[^'\\]|\\.)*)'\s*:", s, re.M))


def strip_comments_and_style(html):
    html = re.sub(r"<style\b.*?</style>", "", html, flags=re.S)
    html = re.sub(r"<!--.*?-->", "", html, flags=re.S)
    return html


def check(name):
    d = os.path.join(SRC, name)
    dict_keys = load_dict(d)
    if dict_keys is None:
        print(f"  {name}: אין i18n/en.js — לא נבדק"); return

    unmarked, missing, used = [], [], set()

    for root, dirs, files in os.walk(d):
        dirs[:] = [x for x in dirs if x not in ("__pycache__", "data", "fonts", "i18n")]
        for f in files:
            if not f.endswith((".html", ".js")) or ".min." in f:
                continue
            p = os.path.join(root, f)
            rel = os.path.relpath(p, d)
            raw = io.open(p, encoding="utf-8", errors="ignore").read()

            # 1) מחרוזות שכבר עטופות ב-I18n.t(...)
            #    תופס גם ביטויים כמו I18n.t(cond ? 'א' : 'ב') — כל המחרוזות
            #    שבתוך הסוגריים, לא רק הראשונה
            for call in re.findall(r"I18n\.t\(([^()]*)\)", raw):
                for m in re.findall(r"'((?:[^'\\]|\\.)*)'", call):
                    if not HEB.search(m):
                        continue
                    used.add(m)
                    if m not in dict_keys:
                        missing.append((rel, m))

            if not f.endswith(".html"):
                continue
            body = strip_comments_and_style(raw)

            # 2) ערכי data-i18n-* (אטריביוטים)
            for m in re.findall(r'data-i18n-\w+="([^"]*)"', body):
                used.add(m)
                if HEB.search(m) and m not in dict_keys:
                    missing.append((rel, m))

            # 3) טקסט גלוי בין תגיות — האם התג הפותח נושא data-i18n?
            # lookahead על ה-< הסוגר: אחרת הוא נצרך והתג העוקב מתפספס
            for m in re.finditer(r"<([a-zA-Z][\w-]*)([^>]*)>([^<>]+)(?=<)", body):
                tag, attrs, text = m.group(1), m.group(2), m.group(3)
                t = text.strip()
                if not t or not HEB.search(t):
                    continue
                if re.search(r"\bdata-i18n\b", attrs):
                    used.add(t)
                    if t not in dict_keys:
                        missing.append((rel, t))
                else:
                    unmarked.append((rel, t))

    print(f"\n═══ {name} ═══")
    if unmarked:
        print(f"  [לא מסומן] {len(unmarked)} — לא יתורגמו:")
        for rel, t in unmarked:
            print(f"      {rel}: {t[:70]}")
    if missing:
        print(f"  [חסר במילון] {len(missing)}:")
        for rel, t in missing:
            print(f"      {rel}: {t[:70]}")
    extra = dict_keys - used
    if extra:
        print(f"  [מיותר במילון] {len(extra)}:")
        for t in sorted(extra):
            print(f"      {t[:70]}")
    if not (unmarked or missing or extra):
        print("  תקין — כל הטקסט מסומן ומתורגם.")
    return len(unmarked) + len(missing)


if __name__ == "__main__":
    targets = sys.argv[1:] or [x for x in sorted(os.listdir(SRC))
                               if os.path.isdir(os.path.join(SRC, x))]
    total = 0
    for t in targets:
        total += check(t) or 0
    print(f"\nסה\"כ בעיות חוסמות: {total}")
