# -*- coding: utf-8 -*-
"""
אורז תוספי אוצריא מתוך src-תוספים.

שתי חבילות לכל תוסף שיש לו תיקיית i18n:

  1. רגילה  — זיהוי שפה אוטומטי לפי הגדרת אוצריא (payload.app.language).
               באוצריא 0.9.96 השדה עדיין לא קיים, ולכן הממשק יישאר בעברית.
  2. EN beta — חבילה נפרדת לחלוטין, עם id ושם משלה, שבה i18n.js נקבע
               לאנגלית ואינו מסתמך על השדה. מיועדת לבדיקה בגרסה 0.9.96
               וניתנת להתקנה במקביל לגרסה הרגילה.

הרצה:  python build.py [שם-תוסף ...]     (ללא ארגומנטים = כל התוספים)
"""
import os, io, json, re, sys, zipfile

BASE = os.path.dirname(os.path.abspath(__file__))
SRC  = os.path.join(BASE, "src-תוספים")
OUT  = os.path.join(BASE, "תוספים_מהחנות", "יאיר_דניאל")
BETA = os.path.join(BASE, "בטא-אנגלית")

# תיקיית היעד ושם התצוגה של כל תוסף בחנות
FOLDERS = {
    "ביוגרפיות":     ("תוסף ביוגרפיות",     "ביוגרפיות"),
    "ביוגרפיות+":    ("תוסף ביוגרפיות+",    "ביוגרפיות+"),
    "דיווח-באגים":   ("תוסף דיווח באגים",   "דיווח באגים"),
    "הורדת-ספרים":   ("תוסף הורדת ספרים",   "הורדת ספרים"),
    "הקלדה-עברית":   ("תוסף הקלדה עברית",   "הקלדה עיברית"),
    "וורד-לאוצריא":  ("תוסף וורד לאוצריא",  "וורד לאוצריא"),
    "מעקב-לימוד+":   ("תוסף מעקב לימוד +",  "מעקב לימוד +"),
    "מציג-ZIM":      ("תוסף מציג ZIM",      "קורא ZIM"),
    "מפרש-חכם":      ("תוסף מפרש חכם",      "מפרש חכם"),
    "נגן-מדיה":      ("תוסף נגן מדיה",      "נגן מדיה"),
    "ניקוד-אוטומטי": ("תוסף ניקוד אוטומטי", "ניקוד אוטומטי"),
}
SKIP_DIRS = {"__pycache__", ".git", ".idea"}

# אוצריא מגבילה את שם התוסף ל-14 תווים, ולכן לחבילות הבטא יש שם
# אנגלי קצר משלהן במקום "<שם עברי> (EN beta)" שחורג מהמגבלה.
MAX_NAME = 14
BETA_NAMES = {
    "ביוגרפיות":     "Bios EN",
    "ביוגרפיות+":    "Bios+ EN",
    "דיווח-באגים":   "Bugs EN",
    "הורדת-ספרים":   "Books EN",
    "הקלדה-עברית":   "Typing EN",
    "וורד-לאוצריא":  "Word EN",
    "מעקב-לימוד+":   "Study+ EN",
    "מציג-ZIM":      "ZIM EN",
    "נגן-מדיה":      "Media EN",
    "ניקוד-אוטומטי": "Nikud EN",
}


def read_manifest(d):
    with io.open(os.path.join(d, "manifest.json"), encoding="utf-8-sig") as f:
        return json.load(f)


def zip_dir(src_dir, dest, overrides=None):
    """אורז תיקייה ל-.otzplugin. overrides: {נתיב יחסי: bytes} להחלפת קבצים."""
    overrides = overrides or {}
    written = set()
    with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as z:
        for root, dirs, files in os.walk(src_dir):
            dirs[:] = [x for x in dirs if x not in SKIP_DIRS]
            for f in files:
                full = os.path.join(root, f)
                rel = os.path.relpath(full, src_dir).replace("\\", "/")
                if rel in overrides:
                    z.writestr(rel, overrides[rel])
                else:
                    z.write(full, rel)
                written.add(rel)
        for rel, data in overrides.items():      # קבצים שקיימים רק בחבילה
            if rel not in written:
                z.writestr(rel, data)
    return os.path.getsize(dest)


def make_beta_i18n(src_i18n_js):
    """גרסת i18n.js שנעולה לאנגלית — בלי תלות בשדה language של אוצריא."""
    s = io.open(src_i18n_js, encoding="utf-8").read()
    m = re.search(r"^  function init\(([^)]*)\) \{", s, re.M)
    assert m, "לא נמצאה init ב-i18n.js"
    new = ("  /* ── חבילת בטא אנגלית ──\n"
           "     הממשק נקבע לאנגלית ללא תלות בהגדרת השפה של אוצריא, כדי\n"
           "     שניתן יהיה לבדוק את התרגום גם ב-0.9.96 שאינה מדווחת עדיין\n"
           "     על שפת הממשק. בחבילה הרגילה הפונקציה מזהה שפה אוטומטית. */\n"
           f"  function init({m.group(1)}) {{\n"
           "    if (opts && opts.auto === false) auto = false;\n"
           "    setLanguage('en', 'ltr');\n"
           "    return;\n"
           "    /* eslint-disable no-unreachable */")
    return (s[:m.start()] + new + s[m.end():]).encode("utf-8")


def build(name):
    sd = os.path.join(SRC, name)
    if not os.path.isdir(sd):
        print(f"  דילוג: {name} — אין תיקייה"); return
    folder, label = FOLDERS[name]
    m = read_manifest(sd)
    ver = m["version"]

    # אוצריא דוחה התקנה של תוסף ששמו ארוך מ-14 תווים
    if len(m["name"]) > MAX_NAME:
        raise SystemExit(f"שם התוסף '{m['name']}' חורג מ-{MAX_NAME} תווים ({len(m['name'])})")

    # ── חבילה רגילה ──
    dst_dir = os.path.join(OUT, folder)
    os.makedirs(dst_dir, exist_ok=True)
    size = zip_dir(sd, os.path.join(dst_dir, f"{label} v{ver}.otzplugin"))
    print(f"  {label} v{ver}  ({size//1024} KB)")

    # ── חבילת בטא אנגלית (רק אם יש i18n) ──
    i18n_js = os.path.join(sd, "i18n", "i18n.js")
    if not os.path.exists(i18n_js):
        return
    en = os.path.join(sd, "i18n", "en.js")
    if not os.path.exists(en):
        print(f"    (אין en.js — בטא לא נבנתה)"); return

    beta_name = BETA_NAMES.get(name, "EN beta")
    if len(beta_name) > MAX_NAME:
        raise SystemExit(f"שם הבטא '{beta_name}' חורג מ-{MAX_NAME} תווים")

    bm = dict(m)
    bm["id"] = m["id"] + ".enbeta"
    bm["name"] = beta_name
    bm["stability"] = "experimental"
    contrib = json.loads(json.dumps(m.get("contributes", {})))
    if "toolTab" in contrib:
        contrib["toolTab"]["title"] = beta_name
        contrib["toolTab"]["defaultPinned"] = False
    if contrib:
        bm["contributes"] = contrib

    ov = {
        "manifest.json": json.dumps(bm, ensure_ascii=False, indent=2).encode("utf-8"),
        "i18n/i18n.js": make_beta_i18n(i18n_js),
    }
    os.makedirs(BETA, exist_ok=True)
    size = zip_dir(sd, os.path.join(BETA, f"{label} EN-beta v{ver}.otzplugin"), ov)
    print(f"    └ בטא: {label} EN-beta v{ver}  ({size//1024} KB)  id={bm['id']}")


if __name__ == "__main__":
    targets = sys.argv[1:] or sorted(FOLDERS)
    print("אורז...")
    for t in targets:
        if t in FOLDERS:
            build(t)
        else:
            print(f"  לא מוכר: {t}")
