import { Link } from "react-router";
import type { AuditEntry } from "@/api/types";
import { formatDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import type { MessageKey, Translate } from "@/lib/i18n/config";

const ACTION_KEYS: Record<string, MessageKey> = {
  "song.created": "activity.song.created",
  "song.updated": "activity.song.updated",
  "song.deleted": "activity.song.deleted",
  "category.created": "activity.category.created",
  "category.updated": "activity.category.updated",
  "category.deleted": "activity.category.deleted",
  "user.created": "activity.user.created",
  "user.updated": "activity.user.updated",
  "user.activated": "activity.user.activated",
  "user.deactivated": "activity.user.deactivated",
  "user.password_reset": "activity.user.password_reset",
  "user.deleted": "activity.user.deleted",
};

const ATTACHMENT_KEYS: Record<string, { pdf: MessageKey; image: MessageKey }> = {
  "attachment.added": { pdf: "activity.attachment.added.pdf", image: "activity.attachment.added.image" },
  "attachment.removed": { pdf: "activity.attachment.removed.pdf", image: "activity.attachment.removed.image" },
  "attachment.replaced": { pdf: "activity.attachment.replaced.pdf", image: "activity.attachment.replaced.image" },
};

const FIELD_KEYS: Record<string, MessageKey> = {
  location: "activity.field.location",
  song_number: "activity.field.song_number",
  title: "activity.field.title",
  composer: "activity.field.composer",
  first_sentence: "activity.field.first_sentence",
  notes: "activity.field.notes",
  name: "activity.field.name",
  code: "activity.field.code",
  binder_count: "activity.field.binder_count",
  role: "activity.field.role",
  display_name: "activity.field.display_name",
};

function actionText(entry: AuditEntry, t: Translate) {
  const attachment = ATTACHMENT_KEYS[entry.action];
  if (attachment) return t(entry.details.file_type === "pdf" ? attachment.pdf : attachment.image);
  const key = ACTION_KEYS[entry.action];
  return key ? t(key) : t("activity.other");
}

function showValue(value: unknown, field: string, t: Translate) {
  if (value === null || value === undefined || value === "") return t("activity.emptyValue");
  if (field === "role" && (value === "admin" || value === "member")) return t(`users.role.${value}`);
  const text = String(value);
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

function changeLines(entry: AuditEntry, t: Translate) {
  const { changes, file_name: fileName, previous_file_name: previousFileName } = entry.details;
  const lines: string[] = [];
  if (changes && typeof changes === "object") {
    for (const [field, pair] of Object.entries(changes as Record<string, unknown>)) {
      if (!Array.isArray(pair) || pair.length !== 2) continue;
      const label = FIELD_KEYS[field] ? t(FIELD_KEYS[field]) : field;
      lines.push(`${label}: ${showValue(pair[0], field, t)} → ${showValue(pair[1], field, t)}`);
    }
  }
  if (typeof fileName === "string") {
    lines.push(typeof previousFileName === "string" ? `${previousFileName} → ${fileName}` : fileName);
  }
  return lines;
}

export function AuditList({ entries }: { entries: AuditEntry[] }) {
  const { t, locale } = useI18n();
  return (
    <ol className="divide-y divide-stone-100">
      {entries.map((entry) => {
        const lines = changeLines(entry, t);
        // Only songs that still exist get a link.
        const linkable = entry.songId != null && entry.songExists;
        return (
          <li key={entry.id} className="py-3 first:pt-0 last:pb-0">
            <p className="text-[15px] leading-relaxed text-stone-800">
              <span className="font-semibold text-stone-900">{entry.actorName ?? t("activity.system")}</span>{" "}
              {actionText(entry, t)}{" "}
              {entry.summary ? (
                linkable ? (
                  <Link to={`/songs/${entry.songId}`} className="font-medium text-brand-800 hover:underline">
                    {entry.summary}
                  </Link>
                ) : (
                  <span className="font-medium">{entry.summary}</span>
                )
              ) : null}
            </p>
            {lines.length > 0 ? (
              <ul className="mt-1 space-y-0.5 text-sm text-stone-600">
                {lines.map((line, index) => (
                  <li key={index} className="break-words">
                    {line}
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="mt-1 text-xs text-stone-500">
              <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt, locale)}</time>
            </p>
          </li>
        );
      })}
    </ol>
  );
}
