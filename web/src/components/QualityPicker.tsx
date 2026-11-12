import { useId } from "react";
import type { QualityOption } from "../api/types";
import { useI18n } from "../i18n/I18nProvider";
import { formatBytes } from "../utils/format";
import styles from "./QualityPicker.module.css";

interface QualityPickerProps {
  options: QualityOption[];
  selectedOptionId: string | null;
  disabled: boolean;
  onSelect: (optionId: string) => void;
}

function resolutionBadge(height: number | null): string | null {
  if (!height) return null;
  if (height >= 4320) return "8K";
  if (height >= 2160) return "4K";
  if (height >= 1440) return "2K";
  if (height >= 1080) return "Full HD";
  if (height >= 720) return "HD";
  return null;
}

export function QualityPicker({ options, selectedOptionId, disabled, onSelect }: QualityPickerProps) {
  const { messages, locale } = useI18n();
  const groupName = useId();

  const groups = [
    { key: "video", title: messages.quality.videoGroup, items: options.filter((option) => option.kind === "video") },
    { key: "audio", title: messages.quality.audioGroup, items: options.filter((option) => option.kind === "audio") },
  ].filter((group) => group.items.length > 0);

  const describe = (option: QualityOption): string | null => {
    if (option.container === "m4a") return messages.quality.m4aDescription;
    if (option.container === "mp3") return messages.quality.mp3Description;
    return null;
  };

  return (
    <fieldset className={styles.picker} disabled={disabled}>
      <legend className={styles.legend}>{messages.quality.legend}</legend>

      {groups.map((group) => (
        <div key={group.key} className={styles.group}>
          <h3 className={styles.groupTitle}>{group.title}</h3>
          <div className={styles.list}>
            {group.items.map((option) => {
              const badge = resolutionBadge(option.height);
              const description = describe(option);
              const size =
                option.estimatedBytes !== null
                  ? messages.quality.approximately(formatBytes(option.estimatedBytes, locale))
                  : messages.quality.unknownSize;

              return (
                <label key={option.id} className={styles.option}>
                  <input
                    type="radio"
                    name={groupName}
                    value={option.id}
                    checked={selectedOptionId === option.id}
                    onChange={() => onSelect(option.id)}
                    className={styles.radio}
                  />
                  <span className={styles.primary}>
                    <span className={styles.label} dir="ltr">
                      {option.label}
                    </span>
                    {badge && <span className={styles.badge}>{badge}</span>}
                    {description && <span className={styles.description}>{description}</span>}
                  </span>
                  <span className={styles.format}>{option.kind === "video" ? option.container.toUpperCase() : ""}</span>
                  <span className={styles.size}>{size}</span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </fieldset>
  );
}
