#!/usr/bin/env bash
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
INPUT="$(cat)"
if printf '%s' "$INPUT" | grep -Eq '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
  exit 0
fi
cd "$REPO" || exit 0
[ -f context/changelog.md ] || exit 0
if ! git diff --quiet HEAD -- context/changelog.md 2>/dev/null; then
  exit 0
fi
CODE=$(git log -1 --format=%ct -- . ':!context' ':!.claude' ':!CLAUDE.md' ':!AGENTS.md' 2>/dev/null)
LOGGED=$(git log -1 --format=%ct -- context/changelog.md 2>/dev/null)
if [ "${CODE:-0}" -gt "${LOGGED:-0}" ]; then
  cat >&2 <<MSG
มี commit ใหม่ใน $(basename "$REPO") ที่ยังไม่ถูกบันทึกใน context/changelog.md
ก่อนจบงาน: ตรวจงานกับ context/privacy.md แล้วเพิ่ม entry ใน context/changelog.md (ระบุผลต่อความเป็นนิรนาม)
อัปเดตไฟล์อื่นใน context/ ที่เนื้อหาเปลี่ยน (ดู context/README.md) แล้ว commit หรือส่งงานให้ agent kthok-context
MSG
  exit 2
fi
exit 0
