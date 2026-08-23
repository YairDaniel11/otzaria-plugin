# -*- coding: utf-8 -*-
"""
מחלץ מחרוזות ממשק עבריות מתוסף, לצורך בניית מילון תרגום.

מסנן החוצה מה שאינו ממשק: קבצי נתונים, ספריות מוקטנות, הערות קוד,
מפתחות של אובייקטים, ומחרוזות ארוכות שהן תוכן ולא כיתוב.

הרצה:  python extract_strings.py <שם-תוסף>
פלט:   רשימה ממוינת לפי מקור, מוכנה להעתקה ל-en.js
"""
import os, io, re, sys, json

BASE = os.path.dirname(os.path.abspath(__file__))
SRC  = os.path.join(BASE, "src-תוספים")
HEB  = re.compile(r"[֐-׿]")

SKIP_FILES = re.compile(
    r"(\.min\.|pdf\.worker|-data\.js$|-enrich\.js$|relations\.js$|"
    r"dictionary\.js$|mammoth|jszip|libzim|otzaria_plugin\.js$)")
SKIP_DIRS = {"__pycache__", "data", "fonts", "i18n", "seder-hadorot", ".git"}


def clean(s):
    s = s.strip()
    # מסננים: ריק, בלי עברית, ארוך מדי (תוכן), נראה כמו קוד
    if not s or not HEB.search(s):
        return None
    if len(s) > 140:
        return None
    if s.startswith(("//", "/*", "*", "<!--")):
        return None
    if re.match(r"^[֐-׿]{1,2}$", s):   # אות בודדת — סרגל אותיות
        return None
    return s


def extract(name):
    d = os.path.join(SRC, name)
    if not os.path.isdir(d):
        print(f"לא נמצא: {name}"); return
    found = {}       # מחרוזת -> קבוצת מקורות

    for root, dirs, files in os.walk(d):
        dirs[:] = [x for x in dirs if x not in SKIP_DIRS]
        for f in sorted(files):
            if not f.endswith((".html", ".js")) or SKIP_FILES.search(f):
                continue
            rel = os.path.relpath(os.path.join(root, f), d).replace("\\", "/")
            raw = io.open(os.path.join(root, f), encoding="utf-8", errors="ignore").read()

            # מסירים הערות ו-<style> כדי לא לחלץ מהן
            body = re.sub(r"<style\b.*?</style>", "", raw, flags=re.S)
            body = re.sub(r"<!--.*?-->", "", body, flags=re.S)
            body = re.sub(r"/\*.*?\*/", "", body, flags=re.S)
            body = re.sub(r"^\s*//.*$", "", body, flags=re.M)

            cand = []
            # טקסט בין תגיות
            for m in re.findall(r">([^<>]{2,140})<", body):
                cand.append(m)
            # מחרוזות בגרשיים (JS + אטריביוטים)
            for q in ("'", '"', "`"):
                for m in re.findall(q + r"([^" + q + r"\n]{2,140})" + q, body):
                    cand.append(m)

            for c in cand:
                c = clean(c)
                if c:
                    found.setdefault(c, set()).add(rel)

    print(f"═══ {name} — {len(found)} מחרוזות ═══\n")
    for s in sorted(found, key=lambda x: (sorted(found[x])[0], x)):
        src = ",".join(sorted(found[s]))
        esc = s.replace("\\", "\\\\").replace("'", "\\'")
        print(f"  '{esc}': '',   // {src}")


if __name__ == "__main__":
    for t in (sys.argv[1:] or [x for x in sorted(os.listdir(SRC))
                               if os.path.isdir(os.path.join(SRC, x))]):
        extract(t)
